// House of Jung: waitlist sign-up, cookie consent and the Meta Pixel.
// The pixel is only fetched after "Accept", so no Meta request or cookie happens
// before consent (GDPR / PECR). UTMs are read from the URL and held in memory only.
(function () {
  var PIXEL_ID = "1773555936905379";
  var CONSENT_KEY = "hoj_consent_v1";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var MESSAGES = {
    email: "That email doesn’t look right. Check for a typo and try again.",
    server: "Sorry, something went wrong on our side. Please try again in a minute.",
    network: "We couldn’t reach the server. Check your connection and try again."
  };

  /* ---------- consent ---------- */

  var banner = document.querySelector(".consent");
  var pixelLoaded = false;

  function storedConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function loadPixel() {
    if (pixelLoaded) { window.fbq("consent", "grant"); return; }
    pixelLoaded = true;
    /* Meta's standard base code */
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
  }

  function applyConsent(choice) {
    if (choice === "granted") loadPixel();
    else if (pixelLoaded) window.fbq("consent", "revoke");
  }

  if (banner) {
    banner.querySelectorAll("[data-consent]").forEach(function (button) {
      button.addEventListener("click", function () {
        var choice = button.getAttribute("data-consent");
        try { localStorage.setItem(CONSENT_KEY, choice); } catch (e) {}
        banner.hidden = true;
        applyConsent(choice);
      });
    });

    var choice = storedConsent();
    if (choice === "granted" || choice === "denied") applyConsent(choice);
    else banner.hidden = false;
  }

  function hasConsent() { return storedConsent() === "granted"; }

  /* ---------- sign-up ---------- */

  var forms = Array.prototype.slice.call(document.querySelectorAll(".signup-form"));
  if (!forms.length) return;

  var dialog = document.querySelector(".signup-dialog");
  var signedUp = false;

  var utms = (function () {
    var params = new URLSearchParams(window.location.search);
    var result = {};
    UTM_KEYS.forEach(function (key) { result[key] = (params.get(key) || "").slice(0, 200); });
    return result;
  })();

  function cookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function newEventId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "lead-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  /* Every CTA opens the form where the visitor is, rather than scrolling them away. */
  if (dialog) {
    document.querySelectorAll("[data-open-signup]").forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        if (signedUp) { showThanksEverywhere(); }
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        var field = dialog.querySelector('input[type="email"]');
        if (field && !signedUp) window.setTimeout(function () { field.focus(); }, 60);
      });
    });

    dialog.querySelectorAll("[data-close-signup]").forEach(function (button) {
      button.addEventListener("click", function () { dialog.close(); });
    });

    // Click outside the panel closes it.
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  function showThanksEverywhere() {
    signedUp = true;
    forms.forEach(function (form) {
      form.hidden = true;
      var thanks = form.parentElement.querySelector(".signup-thanks");
      if (thanks) thanks.hidden = false;
    });
  }

  forms.forEach(function (form) {
    var email = form.elements.email;
    var button = form.querySelector("button[type=submit]");
    var status = form.querySelector(".form-status");
    var note = document.getElementById(email.id + "-note");
    var thanks = form.parentElement.querySelector(".signup-thanks");
    var busy = false;

    function setError(message) {
      email.setAttribute("aria-invalid", "true");
      note.textContent = message;
      note.hidden = false;
    }

    function clearError() {
      email.removeAttribute("aria-invalid");
      note.textContent = "";
      note.hidden = true;
    }

    function setBusy(state) {
      busy = state;
      button.disabled = state;
      button.setAttribute("aria-busy", state ? "true" : "false");
    }

    email.addEventListener("input", function () {
      if (email.getAttribute("aria-invalid")) clearError();
      status.textContent = "";
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy) return;
      status.textContent = "";

      var value = email.value.trim();
      if (!EMAIL_RE.test(value)) {
        setError(MESSAGES.email);
        email.focus();
        return;
      }
      clearError();
      setBusy(true);

      var consent = hasConsent();
      var eventId = newEventId();

      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: value,
          website: form.elements.website.value,
          // Which page they signed up on. Not a tracking identifier, so it is sent
          // whatever the cookie choice — page_url is withheld without consent.
          source: document.body.getAttribute("data-signup-source") || "",
          consent: consent,
          event_id: consent ? eventId : "",
          fbp: consent ? cookie("_fbp") : "",
          fbc: consent ? cookie("_fbc") : "",
          page_url: consent ? window.location.href : "",
          utm_source: utms.utm_source,
          utm_medium: utms.utm_medium,
          utm_campaign: utms.utm_campaign
        })
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (response.ok && data.ok) {
              showThanksEverywhere();
              if (thanks) thanks.focus();
              // window.fbq only exists once the visitor has accepted cookies. The same
              // event ID goes to the server's Conversions API call, so Meta counts it once.
              if (typeof window.fbq === "function") {
                try { window.fbq("track", "Lead", {}, { eventID: eventId }); } catch (e) {}
              }
              return;
            }
            if (data.error === "invalid_email") { setError(MESSAGES.email); email.focus(); }
            else status.textContent = MESSAGES.server;
          });
        })
        .catch(function () { status.textContent = MESSAGES.network; })
        .then(function () { setBusy(false); });
    });
  });
})();
