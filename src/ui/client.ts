declare global {
  interface Window {
    frToast?: (msg: string, icon?: string) => void;
    frOpenPal?: () => void;
  }
}

export const CLIENT_JS = String.raw`
(function () {
  "use strict";

  /* ---------- toasts ---------- */
  var toastWrap = null;
  function toast(msg, icon) {
    if (!toastWrap) {
      toastWrap = document.createElement("div");
      toastWrap.className = "toasts";
      document.body.appendChild(toastWrap);
    }
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = (icon ? icon + "  " : "") + msg;
    toastWrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity 180ms ease";
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 200);
    }, 2400);
  }

  /* ---------- copy buttons ---------- */
  function wireCopy(root) {
    root.querySelectorAll("[data-copy]").forEach(function (btn) {
      if (btn.__frCopy) return;
      btn.__frCopy = true;
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy") || "";
        function done() {
          var prev = btn.getAttribute("data-copy-label") || btn.innerHTML;
          btn.setAttribute("data-copy-label", prev);
          btn.classList.add("copy-btn-done");
          btn.innerHTML = "&#10003; Copied";
          toast("Copied to clipboard");
          setTimeout(function () { btn.innerHTML = prev; btn.classList.remove("copy-btn-done"); }, 1400);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done);
        } else {
          var ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); } catch (e) {}
          ta.remove(); done();
        }
      });
    });
  }

  /* ---------- menus (details) ---------- */
  document.addEventListener("click", function (e) {
    document.querySelectorAll("details.menu[open]").forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute("open");
    });
    document.querySelectorAll("details.menu[open] .menu-pop").forEach(function (pop) {
      if (pop.contains(e.target) && e.target.closest("a,button")) pop.closest("details").removeAttribute("open");
    });
  });

  /* ---------- modals ---------- */
  function openModal(sel) {
    var m = document.querySelector(sel);
    if (!m) return;
    m.style.display = "flex";
    var focusable = m.querySelector("input, select, textarea, button.btn-primary");
    if (focusable) setTimeout(function(){ focusable.focus(); }, 30);
  }
  function closeModal(el) { el.style.display = "none"; }
  document.addEventListener("click", function (e) {
    var opener = e.target.closest("[data-modal]");
    if (opener) { e.preventDefault(); openModal(opener.getAttribute("data-modal")); return; }
    if (e.target.classList && e.target.classList.contains("overlay")) closeModal(e.target);
    if (e.target.closest("[data-close-modal]")) closeModal(e.target.closest(".overlay"));
  });

  /* ---------- theme ---------- */
  document.addEventListener("click", function (e) {
    if (!e.target.closest("[data-toggle-theme]")) return;
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("fr.theme", next); } catch (err) {}
  });

  /* ---------- sidebar ---------- */
  var shell = document.querySelector(".shell");
  function toggleRail() {
    if (!shell) return;
    shell.classList.toggle("rail");
    try { localStorage.setItem("fr.rail", shell.classList.contains("rail") ? "1" : "0"); } catch (e) {}
  }
  try { if (localStorage.getItem("fr.rail") === "1" && window.innerWidth > 900) shell && shell.classList.add("rail"); } catch (e) {}
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-toggle-rail]")) toggleRail();
    if (e.target.closest("[data-toggle-drawer]")) document.body.classList.toggle("drawer-open");
  });

  /* ---------- snippet tabs ---------- */
  document.addEventListener("click", function (e) {
    var tab = e.target.closest(".snippet-tabs .st");
    if (!tab) return;
    var group = tab.closest("[data-snippet-group]") || document;
    group.querySelectorAll(".snippet-tabs .st").forEach(function (t) { t.classList.remove("active"); });
    tab.classList.add("active");
    group.querySelectorAll("[data-snippet-pane]").forEach(function (p) {
      p.hidden = p.getAttribute("data-snippet-pane") !== tab.getAttribute("data-snippet");
    });
  });

  /* ---------- command palette ---------- */
  var pal, palInput, palList, palItems = [], palSel = 0;
  var COMMANDS = [];
  function collectCommands() {
    var data = document.getElementById("pal-commands");
    if (!data) return;
    try { COMMANDS = JSON.parse(data.textContent || "[]"); } catch (e) { COMMANDS = []; }
  }
  function renderPal(q) {
    q = (q || "").toLowerCase();
    palList.innerHTML = "";
    palItems = [];
    COMMANDS.forEach(function (cmd) {
      if (q && (cmd.label + " " + (cmd.keywords || "")).toLowerCase().indexOf(q) === -1) return;
      var a = document.createElement("a");
      a.href = cmd.href;
      a.className = "pal-it";
      a.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + cmd.icon + '"/></svg><span>' + cmd.label + "</span>";
      a.addEventListener("click", function(){ closePal(); });
      palList.appendChild(a);
      palItems.push(a);
    });
    if (!palItems.length) {
      var empty = document.createElement("div");
      empty.className = "pal-empty";
      empty.textContent = "No results";
      palList.appendChild(empty);
    }
    palSel = 0;
    updateSel();
  }
  function updateSel() {
    palItems.forEach(function (it, i) { it.classList.toggle("sel", i === palSel); });
    if (palItems[palSel]) palItems[palSel].scrollIntoView({ block: "nearest" });
  }
  function openPal() {
    if (!pal) return;
    pal.style.display = "flex";
    palInput.value = "";
    renderPal("");
    setTimeout(function(){ palInput.focus(); }, 20);
  }
  function closePal() { if (pal) pal.style.display = "none"; }

  document.addEventListener("DOMContentLoaded", function () {
    collectCommands();
    wireCopy(document);

    var flash = document.body.getAttribute("data-toast");
    if (flash) {
      toast(flash, "\u2713");
      try { history.replaceState(null, "", location.pathname + location.search.replace(/([?&])msg=[^&]*&?/, "$1").replace(/[?&]$/, "")); } catch (e) {}
    }

    pal = document.createElement("div");
    pal.className = "pal-overlay";
    pal.style.display = "none";
    pal.innerHTML =
      '<div class="pal" role="dialog" aria-label="Command palette">' +
      '<input class="pal-input" placeholder="Type a command or search..." aria-label="Search commands">' +
      '<div class="pal-list"></div>' +
      '<div class="pal-foot"><span><kbd>\u2191\u2193</kbd> navigate</span><span><kbd>\u21B5</kbd> open</span><span><kbd>esc</kbd> close</span></div>' +
      "</div>";
    document.body.appendChild(pal);
    palInput = pal.querySelector(".pal-input");
    palList = pal.querySelector(".pal-list");

    pal.addEventListener("mousedown", function (e) { if (e.target === pal) closePal(); });
    palInput.addEventListener("input", function () { renderPal(palInput.value); });
    palInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); updateSel(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(palSel - 1, 0); updateSel(); }
      else if (e.key === "Enter") { var it = palItems[palSel]; if (it) { closePal(); location.href = it.href; } }
    });

    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (pal.style.display === "flex") closePal(); else openPal();
      } else if (e.key === "Escape") {
        closePal();
        document.querySelectorAll(".overlay[style*='flex']").forEach(closeModal);
      }
    });
  });

  window.frToast = toast;
  window.frOpenPal = openPal;
})();
`;
