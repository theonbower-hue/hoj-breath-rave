// POST /api/subscribe — adds a waitlist sign-up to Brevo.
//
// The page never talks to Brevo directly: the API key stays server-side.
// Env: BREVO_API_KEY, BREVO_LIST_ID (set in Vercel → Settings → Environment Variables).
// Optional: BREVO_LIST_ID_RAVE adds rave-page sign-ups to a second list as well as the
// main one, so where someone came from survives a later re-signup.
// Optional: META_CAPI_TOKEN sends the sign-up to Meta's Conversions API, but only for
// visitors who accepted cookies. META_TEST_EVENT_CODE routes events to Events Manager's
// "Test events" tab while checking the setup; remove it afterwards.

const crypto = require("crypto");

const BREVO_URL = "https://api.brevo.com/v3/contacts";
const META_PIXEL_ID = "1773555936905379";
const META_URL = `https://graph.facebook.com/v23.0/${META_PIXEL_ID}/events`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const EXTRA_LISTS = {
  rave: "BREVO_LIST_ID_RAVE",
};

const UTM_FIELDS = {
  utm_source: "UTM_SOURCE",
  utm_medium: "UTM_MEDIUM",
  utm_campaign: "UTM_CAMPAIGN",
};

// Server-side Lead for Meta, deduplicated against the browser pixel by event_id.
// Never blocks or fails the sign-up: errors are logged and swallowed.
async function sendMetaLead(req, body, email) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token || body.consent !== true) return;

  const userData = {
    em: [crypto.createHash("sha256").update(email).digest("hex")],
    client_ip_address: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || undefined,
    client_user_agent: req.headers["user-agent"] || undefined,
    fbp: clean(body.fbp, 200) || undefined,
    fbc: clean(body.fbc, 500) || undefined,
  };

  const payload = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_id: clean(body.event_id, 100) || undefined,
      event_source_url: clean(body.page_url, 1000) || undefined,
      action_source: "website",
      user_data: userData,
    }],
    access_token: token,
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const response = await fetch(META_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      let detail = {};
      try { detail = await response.json(); } catch { /* ignore */ }
      console.error("subscribe: Meta CAPI rejected event", response.status, detail.error && detail.error.message);
    }
  } catch (err) {
    console.error("subscribe: Meta CAPI request failed", err && err.name);
  }
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== "object") {
    return send(res, 400, { ok: false, error: "bad_request" });
  }

  // Honeypot: real people never see this field. Pretend it worked so bots move on.
  if (clean(body.website, 200)) {
    return send(res, 200, { ok: true });
  }

  const email = clean(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return send(res, 400, { ok: false, error: "invalid_email" });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  if (!apiKey || !Number.isInteger(listId) || listId <= 0) {
    // Say which setting is wrong without logging either value.
    const rawList = process.env.BREVO_LIST_ID;
    console.error(
      "subscribe: bad Brevo config —",
      "BREVO_API_KEY", apiKey ? "set" : "MISSING",
      "| BREVO_LIST_ID", rawList === undefined ? "MISSING" : `not a positive whole number (${rawList.length} chars)`,
      "| VERCEL_ENV", process.env.VERCEL_ENV,
      "| similar names:", Object.keys(process.env).filter((k) => /brevo/i.test(k)).join(", ") || "none"
    );
    return send(res, 500, { ok: false, error: "server_config" });
  }

  // Everyone joins the main list. A recognised source adds a second one on top,
  // so the main list stays the single count of how many people we have.
  const listIds = [listId];
  const extraVar = EXTRA_LISTS[clean(body.source, 20).toLowerCase()];
  if (extraVar) {
    const extraId = Number(process.env[extraVar]);
    if (Number.isInteger(extraId) && extraId > 0 && extraId !== listId) {
      listIds.push(extraId);
    } else {
      console.error("subscribe: source list not configured —", extraVar, extraId ? "invalid" : "MISSING");
    }
  }

  const attributes = {};
  // Only send UTMs that are present. With updateEnabled, an empty value would
  // wipe the source recorded when this person first signed up.
  for (const [param, attribute] of Object.entries(UTM_FIELDS)) {
    const value = clean(body[param], 200);
    if (value) attributes[attribute] = value;
  }

  let response;
  try {
    response = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds,
        updateEnabled: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("subscribe: Brevo request failed", err && err.name);
    return send(res, 502, { ok: false, error: "upstream_unreachable" });
  }

  // 201 = created, 204 = existing contact updated.
  if (response.ok) {
    await sendMetaLead(req, body, email);
    return send(res, 200, { ok: true });
  }

  let detail = {};
  try { detail = await response.json(); } catch { /* empty or non-JSON body */ }

  // Already on the list counts as success — the person is signed up either way.
  if (detail.code === "duplicate_parameter" || /already exist/i.test(detail.message || "")) {
    await sendMetaLead(req, body, email);
    return send(res, 200, { ok: true });
  }

  console.error("subscribe: Brevo rejected contact", response.status, detail.code, detail.message);

  if (response.status === 400 && /email/i.test(detail.message || "")) {
    return send(res, 400, { ok: false, error: "invalid_email" });
  }
  return send(res, 502, { ok: false, error: "upstream_error" });
};
