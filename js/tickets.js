/* Ticket launch switch.
 *
 * Flips every waitlist CTA to a Buy tickets link at the moment tickets go on
 * sale, and swaps the artwork if a replacement is given. Runs before site.js
 * (both deferred, document order) so the sign-up handler never binds to a
 * button that has become a link.
 *
 * Deliberately fails safe: if the URL is blank, the clock has not reached the
 * time, or this script does not run at all, the page stays exactly as it is
 * served, which is the waitlist. Showing a dead Buy tickets button would be
 * far worse than showing the waitlist a minute longer than necessary.
 */
(function () {
  "use strict";

  /* ──────────────── CONFIG: the only two lines to change ────────────────
   * TICKETS_URL stays empty until the vendor link exists. Nothing switches
   * while it is empty, whatever the clock says.
   */
  var TICKETS_URL = "https://www.eventbrite.co.uk/e/soma-breath-a-breathwork-experience-at-fabric-london-niraj-naik-tickets-2004067653299?aff=oddtdtcreator&keep_tld=true";
  var LIVE_AT     = 1793361600000;   // 30 October 2026, 12:00 UK (GMT)
  /* ──────────────────────────────────────────────────────────────────── */

  var LABEL = "Buy tickets";

  function ready() {
    return typeof TICKETS_URL === "string" &&
           TICKETS_URL.length > 0 &&
           Date.now() >= LIVE_AT;
  }

  /* A <button> that opened the sign-up dialog has to become a real link, so
     it behaves like one: middle click, open in new tab, copy address. */
  function toLink(el) {
    var a = document.createElement("a");
    a.className = el.className;
    a.href = TICKETS_URL;
    a.setAttribute("rel", "noopener");
    return a;
  }

  function swap() {
    var ctas = document.querySelectorAll("[data-cta]");
    for (var i = 0; i < ctas.length; i++) {
      var el = ctas[i];
      var arrow = el.querySelector('[aria-hidden="true"]');
      var arrowHtml = arrow ? " " + arrow.outerHTML : "";
      var target = el;

      if (el.tagName === "BUTTON") {
        target = toLink(el);
        el.parentNode.replaceChild(target, el);
      } else {
        target.href = TICKETS_URL;
        target.setAttribute("rel", "noopener");
      }

      /* Keep the span the submit button uses for its label, if present. */
      var label = target.querySelector(".cta-label");
      if (label) label.textContent = LABEL;
      else target.innerHTML = LABEL + arrowHtml;

      target.removeAttribute("data-open-signup");
      target.setAttribute("data-cta", "live");
    }

    /* Copy that is only true on one side of the launch. Blocks marked
       data-when="pre" come out, data-when="post" go in, so the answers on
       the page can never contradict the buttons. */
    var pre = document.querySelectorAll('[data-when="pre"]');
    for (var p = 0; p < pre.length; p++) pre[p].hidden = true;
    var post = document.querySelectorAll('[data-when="post"]');
    for (var q = 0; q < post.length; q++) post[q].hidden = false;

    /* Artwork: any image given a live variant swaps to it. */
    var art = document.querySelectorAll("[data-art-live]");
    for (var j = 0; j < art.length; j++) {
      var src = art[j].getAttribute("data-art-live");
      if (src) art[j].setAttribute("src", src);
    }

    document.documentElement.setAttribute("data-tickets", "live");
  }

  if (ready()) {
    swap();
    return;
  }

  /* Open before the switch: flip in place rather than making someone reload.
     Only worth arming if the moment is close enough to sit through. */
  var wait = LIVE_AT - Date.now();
  if (TICKETS_URL && wait > 0 && wait < 86400000) {
    window.setTimeout(function () { if (ready()) swap(); }, wait + 500);
  }
})();
