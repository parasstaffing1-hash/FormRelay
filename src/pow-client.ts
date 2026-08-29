/**
 * Client-side proof-of-work solver.
 *
 * Held in its own asset so it is only fetched by forms that actually enable the gate.
 * The submit is deferred until a qualifying nonce is found; work happens in slices so
 * the page stays responsive, and the button reports progress rather than looking stuck.
 */
export const POW_CLIENT_JS = String.raw`
(function () {
  "use strict";

  var input = document.querySelector('input[name="_pow_nonce"]');
  if (!input) return;
  var form = input.form;
  var challengeEl = document.querySelector('input[name="_pow_challenge"]');
  if (!form || !challengeEl) return;

  var bits = parseInt(input.getAttribute("data-pow-bits") || "0", 10);
  if (!bits || !window.crypto || !window.crypto.subtle) return;

  var challenge = challengeEl.value;
  var solved = false;
  var solving = false;

  function leadingZeroBits(bytes) {
    var count = 0;
    for (var i = 0; i < bytes.length; i++) {
      var byte = bytes[i];
      if (byte === 0) { count += 8; continue; }
      for (var mask = 128; mask > 0; mask >>= 1) {
        if (byte & mask) return count;
        count += 1;
      }
      return count;
    }
    return count;
  }

  async function digest(text) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return new Uint8Array(buf);
  }

  async function solve(button, originalLabel) {
    var nonce = 0;
    var started = Date.now();
    // Yield every slice so the browser keeps painting during a long search.
    while (true) {
      for (var i = 0; i < 250; i++) {
        var candidate = String(nonce++);
        if (leadingZeroBits(await digest(challenge + candidate)) >= bits) return candidate;
      }
      if (button) {
        var seconds = Math.round((Date.now() - started) / 1000);
        button.textContent = seconds > 1 ? "Checking… " + seconds + "s" : "Checking…";
      }
      await new Promise(function (r) { setTimeout(r, 0); });
    }
  }

  form.addEventListener("submit", function (event) {
    if (solved || solving) return;
    event.preventDefault();
    solving = true;

    var button = form.querySelector('[data-submit]') || form.querySelector('button[type="submit"]');
    var originalLabel = button ? button.textContent : "";
    if (button) { button.disabled = true; button.textContent = "Checking…"; }

    solve(button, originalLabel).then(function (nonce) {
      input.value = nonce;
      solved = true;
      solving = false;
      if (button) { button.disabled = false; button.textContent = originalLabel; }
      if (form.requestSubmit) form.requestSubmit(); else form.submit();
    }).catch(function () {
      // Never trap a respondent behind a failed gate; let the server decide.
      solving = false;
      solved = true;
      if (button) { button.disabled = false; button.textContent = originalLabel; }
      if (form.requestSubmit) form.requestSubmit(); else form.submit();
    });
  });
})();
`;
