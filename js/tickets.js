/* Ticket launch and session switch.
 *
 * Points every ticket CTA at a session that can actually be bought, and
 * keeps the copy on the page honest about what is left. Runs before
 * site.js (both deferred, document order) so the sign-up handler never
 * binds to a button that has become a link.
 *
 * Deliberately fails safe. If nothing is buyable the page falls back to
 * the waitlist, which is the right thing to show when a session is gone.
 * Sending someone to a sold-out checkout is worse than asking for an
 * email, so that is the direction every failure leans.
 */
(function () {
  "use strict";

  /* ──────────────────────── CONFIG: edit this block ────────────────────────
   * One entry per session, in the order they go on sale.
   *
   *   SOLD OUT?   set soldOut: true
   *   ON SALE?    paste the Eventbrite link into url
   *
   * Copy follows along: data-when="onsale" shows while nothing has gone,
   * data-when="soldout" replaces it once a session has.
   *
   * The buttons use the FIRST session that is not sold out and has a link.
   * So selling out session 1 before session 2's link exists does not break
   * the page: it goes back to collecting emails on its own.
   */
  var SESSIONS = [
    {
      name:    "Session 1 — Niraj Naik",
      url:     "https://www.eventbrite.co.uk/e/soma-breath-a-breathwork-experience-at-fabric-london-niraj-naik-tickets-2004067653299?aff=oddtdtcreator&keep_tld=true",
      soldOut: false
    },
    {
      name:    "Session 2 — Beni Jung",
      url:     "",
      soldOut: false
    }
  ];

  var LIVE_AT = 1793361600000;   // 30 October 2026, 12:00 UK (GMT)
  /* ─────────────────────────────────────────────────────────────────────── */

  var LABEL = "Buy tickets";

  /* The first session someone can actually buy, or null if there isn't one. */
  function onSale() {
    for (var i = 0; i < SESSIONS.length; i++) {
      var s = SESSIONS[i];
      if (!s.soldOut && typeof s.url === "string" && s.url.length > 0) return s;
    }
    return null;
  }

  function anySoldOut() {
    for (var i = 0; i < SESSIONS.length; i++) {
      if (SESSIONS[i].soldOut) return true;
    }
    return false;
  }

  function show(selector, visible) {
    var els = document.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].hidden = !visible;
  }

  /* A <button> that opened the sign-up dialog has to become a real link, so
     it behaves like one: middle click, open in new tab, copy address. */
  function toLink(el) {
    var a = document.createElement("a");
    a.className = el.className;
    a.setAttribute("rel", "noopener");
    return a;
  }

  function swapCtas(url) {
    var ctas = document.querySelectorAll("[data-cta]");
    for (var i = 0; i < ctas.length; i++) {
      var el = ctas[i];
      var arrow = el.querySelector('[aria-hidden="true"]');
      var arrowHtml = arrow ? " " + arrow.outerHTML : "";
      var target = el;

      if (el.tagName === "BUTTON") {
        target = toLink(el);
        el.parentNode.replaceChild(target, el);
      }
      target.href = url;
      target.setAttribute("rel", "noopener");

      /* Keep the span the submit button uses for its label, if present. */
      var label = target.querySelector(".cta-label");
      if (label) label.textContent = LABEL;
      else target.innerHTML = LABEL + arrowHtml;

      target.removeAttribute("data-open-signup");
      target.setAttribute("data-cta", "live");
    }
  }

  function apply() {
    if (Date.now() < LIVE_AT) return;

    var sale = onSale();

    /* Copy that is only true on one side of the launch. Blocks marked
       data-when="pre" come out, data-when="post" go in, so the answers on
       the page can never contradict the buttons. */
    var gone = anySoldOut();
    show('[data-when="pre"]', false);
    show('[data-when="post"]', true);

    /* onsale and soldout are a pair: exactly one of them is ever shown,
       so an answer can describe what is left without contradicting itself.
       Anything true either way stays on data-when="post". */
    show('[data-when="onsale"]', !gone);
    show('[data-when="soldout"]', gone);

    /* Artwork: any image given a live variant swaps to it. */
    var art = document.querySelectorAll("[data-art-live]");
    for (var j = 0; j < art.length; j++) {
      var src = art[j].getAttribute("data-art-live");
      if (src) art[j].setAttribute("src", src);
    }

    if (sale) {
      swapCtas(sale.url);
      document.documentElement.setAttribute("data-tickets", "live");
    } else {
      /* Nothing to sell. Leave the waitlist buttons exactly as served. */
      document.documentElement.setAttribute("data-tickets", "soldout");
    }
  }

  if (Date.now() >= LIVE_AT) {
    apply();
    return;
  }

  /* Open before the switch: flip in place rather than making someone reload.
     Only worth arming if the moment is close enough to sit through. */
  var wait = LIVE_AT - Date.now();
  if (wait > 0 && wait < 86400000) {
    window.setTimeout(apply, wait + 500);
  }
})();
