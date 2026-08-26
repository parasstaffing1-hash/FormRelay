export const CSS = String.raw`
:root {
  --bg: #ffffff;
  --sidebar: #f7f7f5;
  --sidebar-hover: #efefed;
  --sidebar-active: #e9e9e6;
  --surface: #ffffff;
  --surface-secondary: #f7f7f5;
  --border: #e9e9e7;
  --border-strong: #dededb;

  --text: #37352f;
  --text-secondary: #787774;
  --text-muted: #9b9a97;

  --accent: #2383e2;
  --accent-hover: #1b74ca;
  --accent-tint: #e7f3fb;

  --success: #1f7a5c;
  --success-bg: #edf3ef;
  --warning: #96690f;
  --warning-bg: #faf3dd;
  --danger: #c4453d;
  --danger-bg: #fbe4e4;

  --radius-btn: 6px;
  --radius-input: 5px;
  --radius-card: 8px;

  --shadow-sm: 0 1px 2px rgba(15,15,15,.06), 0 1px 4px rgba(15,15,15,.04);
  --shadow-md: 0 2px 6px rgba(15,15,15,.08), 0 8px 24px rgba(15,15,15,.10);
  --shadow-lg: 0 4px 12px rgba(15,15,15,.10), 0 16px 48px rgba(15,15,15,.14);

  --font-ui: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;

  --t-fast: 120ms ease;
  --t-med: 160ms ease;
}

[data-theme="dark"] {
  --bg: #191919;
  --sidebar: #202020;
  --sidebar-hover: #2c2c2c;
  --sidebar-active: #333333;
  --surface: #252525;
  --surface-secondary: #202020;
  --border: #333333;
  --border-strong: #404040;
  --text: #ebebeb;
  --text-secondary: #a5a5a2;
  --text-muted: #767572;
  --accent-tint: #1d3050;
}

* { box-sizing: border-box; }
html { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: rgba(35,131,226,.22); }
a { color: inherit; text-decoration: none; }
p { margin: 0; }
h1,h2,h3 { margin: 0; font-weight: 600; }
hr.divider { border: 0; border-top: 1px solid var(--border); margin: 20px 0; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }

/* ---------- shell ---------- */
.shell { display: flex; min-height: 100vh; }
.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.page { width: 100%; max-width: 1120px; margin: 0 auto; padding: 28px 44px 72px; }

/* sidebar */
.sidebar {
  width: 240px; flex-shrink: 0;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
  transition: width var(--t-med);
  overflow: hidden;
}
.shell.rail .sidebar { width: 56px; }
.side-head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px; min-height: 52px; }
.logo-mark { width: 26px; height: 26px; border-radius: 6px; background: var(--text); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wordmark { font-weight: 650; font-size: 14.5px; letter-spacing: -.01em; white-space: nowrap; }
.shell.rail .wordmark, .shell.rail .sitem-label, .shell.rail .nav-label, .shell.rail .side-foot .label { display: none; }

.nav { flex: 1; overflow-y: auto; padding: 4px 8px 12px; }
.nav-label {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  letter-spacing: .04em; padding: 16px 8px 4px; white-space: nowrap;
}
.sitem {
  display: flex; align-items: center; gap: 9px;
  height: 33px; padding: 0 8px; border-radius: 6px;
  color: var(--text-secondary); font-size: 13.5px; font-weight: 450;
  cursor: pointer; white-space: nowrap;
  transition: background var(--t-fast), color var(--t-fast);
}
.sitem:hover { background: var(--sidebar-hover); color: var(--text); }
.sitem.active { background: var(--sidebar-active); color: var(--text); font-weight: 550; }
.sitem svg { flex-shrink: 0; opacity: .82; }
.sitem .count { margin-left: auto; font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.side-foot { border-top: 1px solid var(--border); padding: 8px; }
.side-user { display: flex; align-items: center; gap: 9px; padding: 8px 8px; border-radius: 6px; color: var(--text-secondary); font-size: 13px; }
.avatar {
  width: 22px; height: 22px; border-radius: 50%;
  background: linear-gradient(135deg,#2383e2,#7c5cff00), #2383e2;
  color: #fff; font-size: 10.5px; font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}

/* topbar */
.topbar {
  height: 48px; display: flex; align-items: center; gap: 10px;
  padding: 0 16px; position: sticky; top: 0; z-index: 30;
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid transparent;
}
.topbar.bordered { border-bottom-color: var(--border); }
.crumbs { display: flex; align-items: center; gap: 6px; font-size: 13.5px; min-width: 0; }
.crumbs .crumb { color: var(--text-muted); }
.crumbs .crumb.current { color: var(--text); font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crumbs .sep { color: var(--text-muted); opacity: .7; }
.topbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

.searchbtn {
  display: flex; align-items: center; gap: 8px;
  height: 30px; padding: 0 10px; min-width: 200px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--text-muted); font-size: 13px;
  cursor: pointer; text-align: left;
}
.searchbtn:hover { border-color: var(--border-strong); }
.searchbtn kbd { margin-left: auto; }
kbd {
  font-family: var(--font-ui); font-size: 10.5px; color: var(--text-muted);
  border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 4px;
  padding: 1px 5px; background: var(--surface-secondary);
}

/* mobile drawer */
.menu-toggle { display: none; }
.backdrop { display: none; }
@media (max-width: 900px) {
  .sidebar {
    position: fixed; left: 0; top: 0; z-index: 60;
    transform: translateX(-100%); transition: transform var(--t-med);
    box-shadow: var(--shadow-lg); width: 260px!important;
  }
  body.drawer-open .sidebar { transform: translateX(0); }
  body.drawer-open .backdrop { display: block; position: fixed; inset: 0; background: rgba(15,15,15,.4); z-index: 50; animation: fadeIn var(--t-fast); }
  .menu-toggle { display: inline-flex; }
  .searchbtn { min-width: 0; }
  .searchbtn .search-hint { display: none; }
  .page { padding: 20px 18px 64px; }
}
@media (min-width: 901px) { .drawer-only { display: none!important; } }

/* ---------- page header ---------- */
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 10px 0 22px; }
.page-head h1 { font-size: 27px; font-weight: 650; letter-spacing: -.02em; line-height: 1.25; }
.page-head .sub { color: var(--text-secondary); font-size: 13.5px; margin-top: 3px; }
.page-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }

.section-title { font-size: 15px; font-weight: 600; margin: 30px 0 10px; }
.section-title:first-child { margin-top: 0; }

/* ---------- buttons ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 32px; padding: 0 13px;
  border-radius: var(--radius-btn); border: 1px solid transparent;
  font-family: inherit; font-size: 13px; font-weight: 500;
  cursor: pointer; white-space: nowrap; text-decoration: none;
  transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast), box-shadow var(--t-fast);
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { background: var(--surface); border-color: var(--border-strong); color: var(--text); box-shadow: 0 1px 1px rgba(15,15,15,.03); }
.btn-secondary:hover { background: var(--surface-secondary); }
.btn-ghost { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: var(--sidebar-hover); color: var(--text); }
.btn-danger { background: transparent; color: var(--danger); }
.btn-danger:hover { background: var(--danger-bg); }
.btn:disabled { opacity: .45; cursor: not-allowed; pointer-events: none; }
.btn-sm { height: 27px; padding: 0 9px; font-size: 12.5px; }
.icon-btn {
  width: 29px; height: 29px; padding: 0; border: none; background: transparent;
  border-radius: 6px; color: var(--text-secondary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--t-fast), color var(--t-fast);
}
.icon-btn:hover { background: var(--sidebar-hover); color: var(--text); }
.link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--accent); cursor: pointer; }
.link-btn:hover { text-decoration: underline; }

/* ---------- forms / inputs ---------- */
.input, .select, .textarea {
  width: 100%; height: 34px; padding: 0 10px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-input);
  background: var(--surface); color: var(--text);
  font-family: inherit; font-size: 13.5px;
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
}
.textarea { height: auto; min-height: 74px; padding: 8px 10px; resize: vertical; line-height: 1.5; }
.select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239b9a97' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; padding-right: 28px; }
.input:focus, .select:focus, .textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2.5px rgba(35,131,226,.18); }
.input::placeholder, .textarea::placeholder { color: var(--text-muted); }
.field { margin-bottom: 16px; }
.field > label { display: block; font-size: 12.5px; font-weight: 550; color: var(--text-secondary); margin-bottom: 5px; }
.field .hint { font-size: 12px; color: var(--text-muted); margin-top: 5px; }
.checkbox-row { display: flex; align-items: flex-start; gap: 9px; font-size: 13.5px; cursor: pointer; }
.checkbox-row input { width: 15px; height: 15px; margin: 2.5px 0 0; accent-color: var(--accent); cursor: pointer; }
.checkstack { display: flex; flex-direction: column; gap: 10px; }

/* ---------- tables ---------- */
.tbl-scroll { overflow-x: auto; margin: 0 -44px; padding: 0 44px; }
table.tbl { width: 100%; border-collapse: collapse; }
.tbl th {
  text-align: left; font-size: 12px; font-weight: 500; color: var(--text-muted);
  padding: 7px 10px; border-bottom: 1px solid var(--border);
  white-space: nowrap; position: sticky; top: 0; background: var(--bg); z-index: 5;
}
.tbl td { padding: 9px 10px; border-bottom: 1px solid var(--border); font-size: 13.5px; vertical-align: middle; }
.tbl tbody tr { transition: background var(--t-fast); }
.tbl tbody tr.row:hover { background: #fafaf9; }
[data-theme="dark"] .tbl tbody tr.row:hover { background: var(--sidebar-hover); }
.tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.cell-main { font-weight: 520; color: var(--text); }
.cell-sub { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
tr.rowlink-tr { cursor: pointer; }
tr.rowlink-tr td, tr.rowlink-tr td a { position: relative; }
tr.rowlink-tr td:first-child a::after { content: ""; position: absolute; inset: 0; }
.mono { font-family: var(--font-mono); font-size: 12.5px; }

/* row context menu cell */
.rowmenu { position: relative; }
.rowmenu summary { list-style: none; display: inline-flex; opacity: 0; transition: opacity var(--t-fast); }
tr:hover .rowmenu summary, .rowmenu summary:focus-visible, .rowmenu[open] summary { opacity: 1; }
.rowmenu summary::-webkit-details-marker { display: none; }

/* ---------- badges & status ---------- */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 550; line-height: 1;
  padding: 3px 8px; border-radius: 999px; white-space: nowrap;
}
.badge-neutral { background: var(--surface-secondary); color: var(--text-secondary); border: 1px solid var(--border); }
.badge-success { background: var(--success-bg); color: var(--success); }
.badge-warning { background: var(--warning-bg); color: var(--warning); }
.badge-danger { background: var(--danger-bg); color: var(--danger); }
.badge-accent { background: var(--accent-tint); color: var(--accent); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .75; }

/* ---------- tabs ---------- */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tab {
  position: relative; padding: 8px 11px; font-size: 13.5px; font-weight: 480;
  color: var(--text-secondary); white-space: nowrap; border-radius: 5px 5px 0 0;
}
.tab:hover { color: var(--text); background: var(--surface-secondary); }
.tab.active { color: var(--text); font-weight: 560; }
.tab.active::after {
  content: ""; position: absolute; left: 8px; right: 8px; bottom: -1px;
  height: 2px; background: var(--text); border-radius: 2px;
}
.tab .badge { margin-left: 6px; }

/* ---------- stats ---------- */
.stats { display: flex; gap: 44px; flex-wrap: wrap; padding: 4px 0 22px; }
.stat-v { font-size: 23px; font-weight: 620; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.stat-l { font-size: 12px; color: var(--text-muted); margin-top: 1px; }

/* ---------- cards / panels ---------- */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); }
.card-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600; }
.card-b { padding: 14px; }
.list-item { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-bottom: 1px solid var(--border); font-size: 13.5px; }
.list-item:last-child { border-bottom: none; }

/* settings sections */
.settings-wrap { display: flex; gap: 40px; align-items: flex-start; }
.settings-nav { width: 180px; flex-shrink: 0; position: sticky; top: 72px; }
.settings-nav a { display: block; padding: 5px 10px; border-radius: 5px; font-size: 13px; color: var(--text-secondary); margin-bottom: 1px; }
.settings-nav a:hover { background: var(--surface-secondary); color: var(--text); }
.settings-nav a.active { background: var(--surface-secondary); color: var(--text); font-weight: 550; }
.setsec { max-width: 560px; padding: 26px 0; border-bottom: 1px solid var(--border); }
.setsec:first-child { padding-top: 4px; }
.setsec:last-child { border-bottom: none; }
.setsec h2 { font-size: 15.5px; font-weight: 600; margin-bottom: 3px; }
.setsec .desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }
.kv { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 9px 0; font-size: 13.5px; }
.kv + .kv { border-top: 1px solid var(--border); }
.kv .k { color: var(--text-secondary); }
@media (max-width: 800px) { .settings-wrap { flex-direction: column; } .settings-nav { width: 100%; position: static; display: flex; flex-wrap: wrap; gap: 2px; } .setsec { max-width: none; } }

/* ---------- empty states ---------- */
.empty { text-align: center; padding: 58px 24px; color: var(--text-secondary); }
.empty .empty-icon {
  width: 42px; height: 42px; margin: 0 auto 14px; border-radius: 10px;
  background: var(--surface-secondary); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; color: var(--text-muted);
}
.empty h3 { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.empty p { font-size: 13.5px; color: var(--text-secondary); max-width: 400px; margin: 0 auto; }
.empty .empty-actions { margin-top: 18px; display: flex; gap: 8px; justify-content: center; }

/* ---------- skeleton ---------- */
.sk { position: relative; overflow: hidden; background: var(--surface-secondary); border-radius: 5px; }
.sk::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent);
  animation: shimmer 1.4s infinite;
}
[data-theme="dark"] .sk::after { background: linear-gradient(90deg, transparent, rgba(255,255,255,.07), transparent); }
@keyframes shimmer { from { transform: translateX(-100%);} to { transform: translateX(100%);} }

/* ---------- modal ---------- */
.overlay {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(15,15,15,.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 14vh 16px 16px; animation: fadeIn var(--t-fast);
}
.modal {
  width: 100%; max-width: 480px; background: var(--surface);
  border-radius: 10px; box-shadow: var(--shadow-lg);
  animation: popIn 140ms cubic-bezier(.2,.9,.3,1.2);
  max-height: 82vh; display: flex; flex-direction: column;
}
.modal-lg { max-width: 640px; }
.modal-h { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px 0; }
.modal-h h2 { font-size: 15.5px; }
.modal-b { padding: 16px 18px; overflow-y: auto; }
.modal-f { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 18px; border-top: 1px solid var(--border); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn { from { opacity: 0; transform: scale(.97) translateY(4px); } to { opacity: 1; transform: none; } }

/* ---------- dropdown menus ---------- */
details.menu { position: relative; }
details.menu > summary { list-style: none; cursor: pointer; display: inline-flex; }
details.menu > summary::-webkit-details-marker { display: none; }
.menu-pop {
  position: absolute; right: 0; top: calc(100% + 5px); z-index: 45;
  min-width: 190px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 8px;
  box-shadow: var(--shadow-md); padding: 5px;
  animation: popIn 120ms ease; transform-origin: top right;
}
.menu-it {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 6px 9px; border: none; background: none; text-align: left;
  font-family: inherit; font-size: 13px; color: var(--text);
  border-radius: 5px; cursor: pointer; text-decoration: none;
}
.menu-it:hover { background: var(--surface-secondary); }
.menu-it.danger { color: var(--danger); }
.menu-it.danger:hover { background: var(--danger-bg); }
.menu-sep { border: 0; border-top: 1px solid var(--border); margin: 5px 4px; }
.menu-note { padding: 5px 9px 4px; font-size: 11px; color: var(--text-muted); }

/* ---------- command palette ---------- */
.pal-overlay {
  position: fixed; inset: 0; z-index: 90; background: rgba(15,15,15,.45);
  display: flex; justify-content: center; align-items: flex-start;
  padding: 15vh 16px 16px; animation: fadeIn var(--t-fast);
}
.pal {
  width: 100%; max-width: 560px; background: var(--surface);
  border-radius: 10px; box-shadow: var(--shadow-lg); overflow: hidden;
  animation: popIn 130ms ease;
}
.pal-input {
  width: 100%; height: 46px; border: none; outline: none;
  padding: 0 16px; font-family: inherit; font-size: 14.5px;
  color: var(--text); background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.pal-list { max-height: 330px; overflow-y: auto; padding: 6px; }
.pal-it {
  display: flex; align-items: center; gap: 11px; width: 100%;
  padding: 8px 11px; border: none; background: none; text-align: left;
  font-family: inherit; font-size: 13.5px; color: var(--text);
  border-radius: 6px; cursor: pointer; text-decoration: none;
}
.pal-it svg { color: var(--text-muted); flex-shrink: 0; }
.pal-it.sel, .pal-it:hover { background: var(--surface-secondary); }
.pal-empty { padding: 18px 16px; font-size: 13px; color: var(--text-muted); text-align: center; }
.pal-foot { display: flex; gap: 14px; padding: 8px 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted); }

/* ---------- toasts ---------- */
.toasts { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.toast {
  display: flex; align-items: center; gap: 8px;
  background: var(--text); color: var(--bg);
  font-size: 13px; font-weight: 480; padding: 8px 15px; border-radius: 8px;
  box-shadow: var(--shadow-md); animation: toastIn 160ms ease;
}
@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* ---------- endpoint / snippets ---------- */
.endpoint {
  display: flex; align-items: center; gap: 8px;
  background: var(--surface-secondary); border: 1px solid var(--border);
  border-radius: 6px; padding: 7px 8px 7px 12px; min-width: 0;
}
.endpoint code { flex: 1; font-family: var(--font-mono); font-size: 12.5px; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
.snippet {
  position: relative; background: var(--surface-secondary);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px; overflow-x: auto;
  font-family: var(--font-mono); font-size: 12.5px; line-height: 1.65;
  color: var(--text); white-space: pre;
}
.snippet .copy-float { position: absolute; top: 8px; right: 8px; }
.snippet-tabs { display: flex; gap: 2px; margin-bottom: 10px; }
.snippet-tabs .st {
  padding: 4px 10px; font-size: 12px; font-weight: 500; color: var(--text-secondary);
  border-radius: 5px; cursor: pointer; border: 1px solid transparent; background: none; font-family: inherit;
}
.snippet-tabs .st:hover { color: var(--text); }
.snippet-tabs .st.active { background: var(--surface-secondary); border-color: var(--border); color: var(--text); font-weight: 560; }

.copy-btn-done { color: var(--success)!important; }

/* ---------- misc ---------- */
.muted { color: var(--text-muted); }
.t2 { color: var(--text-secondary); }
.small { font-size: 12.5px; }
.flex { display: flex; align-items: center; }
.gap6 { gap: 6px; } .gap8 { gap: 8px; } .gap12 { gap: 12px; } .gap16 { gap: 16px; }
.between { justify-content: space-between; }
.wrap { flex-wrap: wrap; }
.right { margin-left: auto; }
.nowrap { white-space: nowrap; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spacer { flex: 1; }
.mt8 { margin-top: 8px; } .mt16 { margin-top: 16px; } .mt24 { margin-top: 24px; } .mt32 { margin-top: 32px; }
.mb8 { margin-bottom: 8px; } .mb16 { margin-bottom: 16px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
@media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }
.callout {
  display: flex; gap: 10px; padding: 10px 13px; border-radius: 7px;
  font-size: 13px; background: var(--accent-tint); color: var(--text);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
}
.callout svg { flex-shrink: 0; color: var(--accent); margin-top: 1px; }
.meter { height: 6px; border-radius: 3px; background: var(--sidebar-active); overflow: hidden; }
.meter > span { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
.usage-line { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--text-secondary); margin-bottom: 6px; }
.bigmark { display: inline-flex; align-items: center; gap: 10px; }
.bigmark .logo-mark { width: 34px; height: 34px; border-radius: 8px; }
.bigmark .wordmark { font-size: 17px; }

/* workflow preview */
.rule-step { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); font-size: 13.5px; }
.rule-step + .rule-step { margin-top: -1px; }
.rule-kw { font-size: 11px; font-weight: 650; letter-spacing: .05em; color: var(--text-muted); text-transform: uppercase; width: 52px; flex-shrink: 0; }
.rule-chip { background: var(--surface-secondary); border: 1px solid var(--border); border-radius: 5px; padding: 2px 8px; font-size: 12.5px; font-weight: 500; }

/* auth */
.auth-body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--sidebar); padding: 16px; }
.auth-card { width: 100%; max-width: 340px; }
.auth-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 26px 24px; box-shadow: var(--shadow-sm); }
.auth-brand { display: flex; justify-content: center; margin-bottom: 18px; }

/* landing */
.land { max-width: 780px; margin: 0 auto; padding: 90px 24px 60px; text-align: center; }
.land h1 { font-size: 44px; font-weight: 700; letter-spacing: -.03em; line-height: 1.1; }
.land .tagline { font-size: 17px; color: var(--text-secondary); margin: 14px 0 30px; }
`;
