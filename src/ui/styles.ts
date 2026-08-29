import { TOKENS } from "./tokens";

/**
 * Application stylesheet.
 *
 * Everything below resolves to a token from `tokens.ts`. Two rules keep it coherent:
 * a component never invents a value, and structure comes from spacing and type before
 * it comes from a border or a card.
 */
export const CSS = TOKENS + String.raw`
/* ============================================================ base ========= */

*, *::before, *::after { box-sizing: border-box; }
html { height: 100%; -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  line-height: var(--leading-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-variant-numeric: tabular-nums;
}

a { color: inherit; text-decoration: none; }
p { margin: 0; }
h1, h2, h3, h4 { margin: 0; font-weight: var(--weight-semibold); letter-spacing: var(--tracking-snug); }
img, svg, video { max-width: 100%; }
::selection { background: var(--primary-subtle); }

hr.divider { border: 0; border-top: 1px solid var(--border); margin: var(--space-5) 0; }

/* One focus treatment everywhere. Keyboard users get a clear ring; pointer users
   never see it. */
:focus { outline: none; }
:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-sm);
  position: relative;
  z-index: 1;
}

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* ============================================================ type ========= */

.t-display { font-size: var(--text-display); line-height: var(--leading-display); font-weight: var(--weight-bold); letter-spacing: var(--tracking-tight); }
.t-h1 { font-size: var(--text-h1); line-height: var(--leading-h1); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-tight); }
.t-h2 { font-size: var(--text-h2); line-height: var(--leading-h2); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-snug); }
.t-h3 { font-size: var(--text-h3); line-height: var(--leading-h3); font-weight: var(--weight-semibold); }
.t-body { font-size: var(--text-body); line-height: var(--leading-body); }
.t-label { font-size: var(--text-label); line-height: var(--leading-label); font-weight: var(--weight-medium); }
.t-meta { font-size: var(--text-meta); line-height: var(--leading-meta); }

.small { font-size: var(--text-body-sm); line-height: var(--leading-body-sm); }
.large { font-size: var(--text-h3); line-height: var(--leading-h3); }
.muted { color: var(--muted-foreground); }
.t2 { color: var(--muted-foreground); }
.mono { font-family: var(--font-mono); font-size: var(--text-body-sm); font-variant-ligatures: none; }
.nowrap { white-space: nowrap; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; }

/* ======================================================== utilities ======== */
/* A small, closed set so pages stop reaching for inline styles. */

.flex { display: flex; align-items: center; }
.between { justify-content: space-between; }
.wrap { flex-wrap: wrap; }
.col { display: flex; flex-direction: column; }
.grow { flex: 1; min-width: 0; }

.gap4 { gap: var(--space-1); }
.gap6 { gap: 6px; }
.gap8 { gap: var(--space-2); }
.gap12 { gap: var(--space-3); }
.gap16 { gap: var(--space-4); }

.mt4 { margin-top: var(--space-1); }
.mt8 { margin-top: var(--space-2); }
.mt12 { margin-top: var(--space-3); }
.mt16 { margin-top: var(--space-4); }
.mt24 { margin-top: var(--space-6); }
.mb8 { margin-bottom: var(--space-2); }
.mb16 { margin-bottom: var(--space-4); }
.mb24 { margin-bottom: var(--space-6); }

.w-prose { max-width: 680px; }
.w-form { max-width: 560px; }
.w-wide { max-width: 880px; }

/* Vertical rhythm without per-child margins. */
.stack > * + * { margin-top: var(--space-3); }
.stack-lg > * + * { margin-top: var(--space-6); }

/* ============================================================ shell ======== */

.shell { display: flex; min-height: 100vh; }
.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }

.page {
  width: 100%;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--space-8) var(--page-gutter) var(--space-16);
}
.page.page-wide { max-width: var(--page-max-wide); }

/* ---- sidebar ---- */
.sidebar {
  width: var(--sidebar-width); flex-shrink: 0;
  background: var(--surface-subtle);
  border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
  overflow: hidden;
}
.shell.rail .sidebar { width: 56px; }
.shell.rail .wordmark, .shell.rail .sitem-label, .shell.rail .nav-label, .shell.rail .side-foot .label { display: none; }

.side-head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-3) var(--space-2); min-height: var(--topbar-height); }
.logo-mark {
  width: 22px; height: 22px; border-radius: var(--radius-sm);
  background: var(--foreground); color: var(--background);
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.wordmark { font-size: var(--text-body); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-snug); white-space: nowrap; }

.nav { flex: 1; overflow-y: auto; padding: var(--space-1) var(--space-2) var(--space-3); }
.nav-label {
  font-size: var(--text-label); line-height: var(--leading-label);
  font-weight: var(--weight-medium); color: var(--subtle-foreground);
  padding: var(--space-4) var(--space-2) var(--space-1); white-space: nowrap;
}
.sitem {
  display: flex; align-items: center; gap: var(--space-2);
  height: var(--control-sm); padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: var(--text-body); font-weight: var(--weight-medium);
  cursor: pointer; white-space: nowrap;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}
.sitem:hover { background: var(--muted); color: var(--foreground); }
.sitem:active { background: var(--muted-hover); }
.sitem.active { background: var(--muted-hover); color: var(--foreground); }
.sitem svg { flex-shrink: 0; opacity: 0.7; }
.sitem.active svg { opacity: 1; }
.sitem .count { margin-left: auto; font-size: var(--text-meta); color: var(--subtle-foreground); }

.side-foot { border-top: 1px solid var(--border-subtle); padding: var(--space-2); }
.side-user { display: flex; align-items: center; gap: var(--space-2); padding: 6px var(--space-2); border-radius: var(--radius-sm); color: var(--muted-foreground); font-size: var(--text-body-sm); }
.avatar {
  width: 22px; height: 22px; border-radius: var(--radius-full);
  background: var(--primary); color: var(--primary-foreground);
  font-size: var(--text-meta); font-weight: var(--weight-semibold);
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}

/* ---- topbar ---- */
.topbar {
  height: var(--topbar-height); display: flex; align-items: center; gap: var(--space-2);
  padding: 0 var(--space-3); position: sticky; top: 0; z-index: 30;
  background: color-mix(in srgb, var(--background) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid transparent;
}
.topbar.bordered { border-bottom-color: var(--border-subtle); }
.crumbs { display: flex; align-items: center; gap: 6px; font-size: var(--text-body-sm); min-width: 0; }
.crumbs .crumb { color: var(--muted-foreground); }
.crumbs a.crumb:hover { color: var(--foreground); }
.crumbs .crumb.current { color: var(--foreground); font-weight: var(--weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumbs .sep { color: var(--subtle-foreground); }
.topbar-right { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }

.searchbtn {
  display: flex; align-items: center; gap: var(--space-2);
  height: var(--control-sm); padding: 0 var(--space-2); min-width: 200px;
  border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--surface); color: var(--subtle-foreground);
  font-family: inherit; font-size: var(--text-body-sm);
  cursor: pointer; text-align: left;
  transition: border-color var(--motion-fast) var(--ease), background var(--motion-fast) var(--ease);
}
.searchbtn:hover { border-color: var(--border-strong); background: var(--surface-subtle); }
.searchbtn kbd { margin-left: auto; }
kbd {
  font-family: var(--font-ui); font-size: var(--text-meta); color: var(--subtle-foreground);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 1px 5px; background: var(--surface-subtle);
}

/* ---- mobile drawer ---- */
.menu-toggle { display: none; }
.backdrop { display: none; }
@media (max-width: 900px) {
  .sidebar {
    position: fixed; left: 0; top: 0; z-index: 60;
    transform: translateX(-100%);
    transition: transform var(--motion-slow) var(--ease-out);
    box-shadow: var(--shadow-lg); width: 264px !important;
  }
  body.drawer-open .sidebar { transform: translateX(0); }
  body.drawer-open .backdrop {
    display: block; position: fixed; inset: 0; z-index: 50;
    background: rgba(16, 16, 16, 0.4); animation: fadeIn var(--motion) var(--ease);
  }
  .menu-toggle { display: inline-flex; }
  .searchbtn { min-width: 0; }
  .searchbtn .search-hint { display: none; }
  .page { padding-top: var(--space-6); padding-bottom: var(--space-12); }
}
@media (min-width: 901px) { .drawer-only { display: none !important; } }

/* ====================================================== page header ======== */

.page-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--space-4); margin: 0 0 var(--space-6);
}
.page-head h1 {
  font-size: var(--text-display); line-height: var(--leading-display);
  font-weight: var(--weight-bold); letter-spacing: var(--tracking-tight);
  min-width: 0; overflow-wrap: break-word;
}
.page-head .sub { color: var(--muted-foreground); font-size: var(--text-body); margin-top: var(--space-1); max-width: 68ch; }
.page-actions { display: flex; gap: var(--space-2); align-items: center; flex-shrink: 0; }

.section-title {
  font-size: var(--text-h2); line-height: var(--leading-h2);
  font-weight: var(--weight-semibold); letter-spacing: var(--tracking-snug);
  margin: var(--space-8) 0 var(--space-3);
}
.section-title:first-child { margin-top: 0; }

@media (max-width: 600px) {
  .page-head { flex-direction: column; gap: var(--space-3); }
  .page-actions { width: 100%; }
  .page-actions .btn { flex: 1; }
}

/* ========================================================== buttons ======== */

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: var(--control-md); padding: 0 var(--space-3);
  border-radius: var(--radius-md); border: 1px solid transparent;
  font-family: inherit; font-size: var(--text-body-sm); font-weight: var(--weight-medium);
  cursor: pointer; white-space: nowrap; text-decoration: none;
  transition: background var(--motion-fast) var(--ease),
              border-color var(--motion-fast) var(--ease),
              color var(--motion-fast) var(--ease),
              transform var(--motion-fast) var(--ease);
}
.btn:active { transform: translateY(0.5px); }

.btn-primary { background: var(--primary); color: var(--primary-foreground); }
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:active { background: var(--primary-active); }

.btn-secondary { background: var(--surface); border-color: var(--border-strong); color: var(--foreground); }
.btn-secondary:hover { background: var(--surface-subtle); }
.btn-secondary:active { background: var(--muted); }

.btn-tertiary { background: var(--muted); color: var(--foreground); }
.btn-tertiary:hover { background: var(--muted-hover); }

.btn-ghost { background: transparent; color: var(--muted-foreground); }
.btn-ghost:hover { background: var(--muted); color: var(--foreground); }

.btn-danger { background: transparent; color: var(--danger-foreground); }
.btn-danger:hover { background: var(--danger-subtle); }
.btn-danger-solid { background: var(--danger); color: #fff; }
.btn-danger-solid:hover { background: var(--danger-hover); }

.btn:disabled, .btn[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.btn-sm { height: var(--control-sm); padding: 0 var(--space-2); font-size: var(--text-body-sm); }
.btn-lg { height: var(--control-lg); padding: 0 var(--space-4); font-size: var(--text-body); }

/* Loading: the label stays put so the button does not resize mid-action. */
.btn.is-loading { color: transparent !important; pointer-events: none; position: relative; }
.btn.is-loading::after {
  content: ""; position: absolute; width: 14px; height: 14px;
  border: 2px solid currentColor; border-top-color: transparent; border-radius: var(--radius-full);
  color: var(--primary-foreground);
  animation: spin 640ms linear infinite;
}
.btn-secondary.is-loading::after, .btn-ghost.is-loading::after, .btn-tertiary.is-loading::after { color: var(--foreground); }
@keyframes spin { to { transform: rotate(360deg); } }

.icon-btn {
  width: var(--control-sm); height: var(--control-sm); padding: 0;
  border: none; background: transparent; border-radius: var(--radius-sm);
  color: var(--muted-foreground); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}
.icon-btn:hover { background: var(--muted); color: var(--foreground); }
.icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.link-btn {
  background: none; border: none; padding: 0; font: inherit;
  font-size: var(--text-body-sm); color: var(--primary); cursor: pointer;
}
.link-btn:hover { text-decoration: underline; }

/* Touch targets stay finger-sized on coarse pointers. */
@media (pointer: coarse) {
  .btn, .icon-btn { min-height: 40px; }
  .btn-sm { min-height: 36px; }
}

/* =========================================================== inputs ======== */

.input, .select, .textarea {
  width: 100%; height: var(--control-lg); padding: 0 var(--space-3);
  border: 1px solid var(--border-strong); border-radius: var(--radius-md);
  background: var(--surface); color: var(--foreground);
  font-family: inherit; font-size: var(--text-body); line-height: var(--leading-body);
  transition: border-color var(--motion-fast) var(--ease), box-shadow var(--motion-fast) var(--ease);
}
.textarea { height: auto; min-height: 84px; padding: var(--space-2) var(--space-3); resize: vertical; }
.select {
  appearance: none; padding-right: var(--space-8); cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right var(--space-3) center;
}
.input:hover, .select:hover, .textarea:hover { border-color: var(--muted-foreground); }
.input:focus, .select:focus, .textarea:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-subtle);
}
.input::placeholder, .textarea::placeholder { color: var(--subtle-foreground); }
.input:disabled, .select:disabled, .textarea:disabled {
  background: var(--surface-subtle); color: var(--muted-foreground);
  cursor: not-allowed; border-color: var(--border);
}
.input[aria-invalid="true"], .textarea[aria-invalid="true"], .select[aria-invalid="true"], .input-error {
  border-color: var(--danger);
}
.input[aria-invalid="true"]:focus, .input-error:focus { box-shadow: 0 0 0 3px var(--danger-subtle); }

.field { margin-bottom: var(--space-4); }
.field > label {
  display: block; font-size: var(--text-label); line-height: var(--leading-label);
  font-weight: var(--weight-medium); color: var(--foreground); margin-bottom: 6px;
}
.field .hint { font-size: var(--text-caption); color: var(--muted-foreground); margin-top: 6px; }
.field-error { font-size: var(--text-caption); color: var(--danger-foreground); margin-top: 6px; display: flex; align-items: center; gap: var(--space-1); }

.input-search { padding-left: var(--space-8);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: left var(--space-3) center;
}

.checkbox-row { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-body); cursor: pointer; }
.checkbox-row input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--primary); cursor: pointer; flex-shrink: 0; }
.checkstack { display: flex; flex-direction: column; gap: var(--space-2); }

/* Switch: a checkbox that reads as a toggle. */
.switch { position: relative; display: inline-flex; align-items: center; gap: var(--space-2); cursor: pointer; font-size: var(--text-body); }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch .track {
  width: 34px; height: 20px; border-radius: var(--radius-full);
  background: var(--border-strong); position: relative; flex-shrink: 0;
  transition: background var(--motion) var(--ease);
}
.switch .track::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: var(--radius-full);
  background: #fff; box-shadow: var(--shadow-xs);
  transition: transform var(--motion) var(--ease);
}
.switch input:checked + .track { background: var(--primary); }
.switch input:checked + .track::after { transform: translateX(14px); }
.switch input:focus-visible + .track { box-shadow: var(--focus-ring); }

/* =========================================================== tables ======== */

/* Full-bleed horizontal scroll for wide tables. The right-edge mask appears only while
   there is more table to reach, so the affordance is honest. */
.tbl-scroll {
  overflow-x: auto;
  margin: 0 calc(var(--page-gutter) * -1);
  padding: 0 var(--page-gutter);
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
  mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
  mask-composite: exclude;
}
/* A table that fits needs no mask; scroll-timeline is not broadly supported, so this
   uses the simpler heuristic of only masking on narrow viewports where scroll is likely. */
@media (min-width: 901px) { .tbl-scroll { mask-image: none; } }
table.tbl { width: 100%; border-collapse: collapse; }
.tbl th {
  text-align: left; font-size: var(--text-label); font-weight: var(--weight-medium);
  color: var(--muted-foreground); padding: var(--space-2);
  border-bottom: 1px solid var(--border); white-space: nowrap;
  position: sticky; top: 0; background: var(--background); z-index: 5;
}
.tbl th.sortable { cursor: pointer; user-select: none; }
.tbl th.sortable:hover { color: var(--foreground); }
.tbl th .sort-arrow { opacity: 0; margin-left: var(--space-1); font-size: 9px; }
.tbl th.sorted .sort-arrow { opacity: 1; }
.tbl td { padding: var(--space-2); border-bottom: 1px solid var(--border-subtle); font-size: var(--text-body); vertical-align: middle; }
.tbl tbody tr { transition: background var(--motion-fast) var(--ease); }
.tbl tbody tr.row:hover { background: var(--muted); }
.cell-main { font-weight: var(--weight-medium); color: var(--foreground); }
.cell-sub { font-size: var(--text-caption); color: var(--muted-foreground); margin-top: 1px; }
tr.rowlink-tr { cursor: pointer; }
tr.rowlink-tr td, tr.rowlink-tr td a { position: relative; }
tr.rowlink-tr td:first-child a::after { content: ""; position: absolute; inset: 0; }

.rowmenu { position: relative; }
.rowmenu summary { list-style: none; display: inline-flex; opacity: 0; transition: opacity var(--motion-fast) var(--ease); }
tr:hover .rowmenu summary, .rowmenu summary:focus-visible, .rowmenu[open] summary { opacity: 1; }
.rowmenu summary::-webkit-details-marker { display: none; }
/* Pointer devices reveal row actions on hover; touch devices have no hover, so show them. */
@media (pointer: coarse) { .rowmenu summary { opacity: 1; } }

/* ========================================================== badges ========= */

.badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: var(--text-meta); font-weight: var(--weight-medium); line-height: 1;
  padding: 3px var(--space-2); border-radius: var(--radius-full); white-space: nowrap;
}
.badge-neutral { background: var(--muted); color: var(--muted-foreground); }
.badge-success { background: var(--success-subtle); color: var(--success-foreground); }
.badge-warning { background: var(--warning-subtle); color: var(--warning-foreground); }
.badge-danger { background: var(--danger-subtle); color: var(--danger-foreground); }
.badge-accent { background: var(--primary-subtle); color: var(--primary); }
.dot { width: 6px; height: 6px; border-radius: var(--radius-full); background: currentColor; }

/* ============================================================ tabs ========= */

.tabs {
  display: flex; gap: var(--space-1); border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-5); overflow-x: auto; scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  position: relative; padding: var(--space-2) var(--space-3);
  font-size: var(--text-body-sm); font-weight: var(--weight-medium);
  color: var(--muted-foreground); white-space: nowrap;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: color var(--motion-fast) var(--ease), background var(--motion-fast) var(--ease);
}
.tab:hover { color: var(--foreground); background: var(--muted); }
.tab.active { color: var(--foreground); }
.tab.active::after {
  content: ""; position: absolute; left: var(--space-2); right: var(--space-2); bottom: -1px;
  height: 2px; background: var(--foreground); border-radius: 2px 2px 0 0;
}
.tab .badge { margin-left: 6px; }

/* =========================================================== stats ========= */

.stats { display: flex; gap: var(--space-10); flex-wrap: wrap; padding: 0 0 var(--space-6); }
.stat { min-width: 0; }
.stat-v { font-size: var(--text-display); line-height: var(--leading-display); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-tight); }
.stat-l { font-size: var(--text-caption); color: var(--muted-foreground); margin-top: 2px; }
@media (max-width: 600px) { .stats { gap: var(--space-6); } }

/* ====================================================== cards / lists ====== */
/* Cards group things that belong together. Most content does not need one. */

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.card-h {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  padding: var(--space-3); border-bottom: 1px solid var(--border-subtle);
  font-size: var(--text-body); font-weight: var(--weight-semibold);
}
.card-b { padding: var(--space-4); }
.list-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3); border-bottom: 1px solid var(--border-subtle);
  font-size: var(--text-body);
}
.list-item:last-child { border-bottom: none; }

.callout {
  border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--surface-subtle); padding: var(--space-3);
  font-size: var(--text-body-sm); color: var(--muted-foreground);
}

/* ========================================================= settings ======== */

.settings-wrap { display: flex; gap: var(--space-10); align-items: flex-start; }
.settings-nav { width: 180px; flex-shrink: 0; position: sticky; top: calc(var(--topbar-height) + var(--space-4)); }
.settings-nav a {
  display: block; padding: 5px var(--space-2); border-radius: var(--radius-sm);
  font-size: var(--text-body-sm); color: var(--muted-foreground); margin-bottom: 1px;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}
.settings-nav a:hover { background: var(--muted); color: var(--foreground); }
.settings-nav a.active { background: var(--muted-hover); color: var(--foreground); font-weight: var(--weight-medium); }

.setsec { max-width: 600px; padding: var(--space-6) 0; border-bottom: 1px solid var(--border-subtle); }
.setsec:first-child { padding-top: 0; }
.setsec:last-child { border-bottom: none; }
.setsec h2 { font-size: var(--text-h2); line-height: var(--leading-h2); margin-bottom: var(--space-1); }
.setsec .desc { font-size: var(--text-body-sm); color: var(--muted-foreground); margin-bottom: var(--space-4); max-width: 62ch; }

.kv { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); padding: var(--space-2) 0; font-size: var(--text-body); }
.kv + .kv { border-top: 1px solid var(--border-subtle); }
.kv .k { color: var(--muted-foreground); }

@media (max-width: 860px) {
  .settings-wrap { flex-direction: column; gap: var(--space-5); }
  .settings-nav { width: 100%; position: static; display: flex; flex-wrap: wrap; gap: var(--space-1); }
  .setsec { max-width: none; }
  .kv { flex-direction: column; align-items: flex-start; gap: var(--space-1); }
}

/* ======================================================= empty state ======= */

.empty { text-align: center; padding: var(--space-16) var(--space-6); }
.empty .empty-icon {
  width: 40px; height: 40px; margin: 0 auto var(--space-4); border-radius: var(--radius-lg);
  background: var(--muted); display: flex; align-items: center; justify-content: center;
  color: var(--muted-foreground);
}
.empty h3 { font-size: var(--text-h3); font-weight: var(--weight-semibold); color: var(--foreground); margin-bottom: var(--space-1); }
.empty p { font-size: var(--text-body-sm); color: var(--muted-foreground); max-width: 46ch; margin: 0 auto; }
.empty .empty-actions { margin-top: var(--space-5); display: flex; gap: var(--space-2); justify-content: center; }

/* ========================================================= skeleton ======== */

.sk { position: relative; overflow: hidden; background: var(--muted); border-radius: var(--radius-sm); }
.sk::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, var(--muted-hover), transparent);
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.sk-line { height: 12px; margin-bottom: var(--space-2); }
.sk-line:last-child { margin-bottom: 0; width: 60%; }

/* =========================================================== modal ========= */

.overlay {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(16, 16, 16, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 12vh var(--space-4) var(--space-4);
  animation: fadeIn var(--motion) var(--ease);
}
.modal {
  width: 100%; max-width: 480px; background: var(--surface-raised);
  border: 1px solid var(--border); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  animation: popIn var(--motion-slow) var(--ease-out);
  max-height: 82vh; display: flex; flex-direction: column;
}
.modal-h { padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-subtle); font-size: var(--text-h3); font-weight: var(--weight-semibold); }
.modal-b { padding: var(--space-5); overflow-y: auto; }
.modal-f { padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end; gap: var(--space-2); }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }

@media (max-width: 600px) {
  .overlay { padding: 0; align-items: flex-end; }
  .modal { max-width: none; border-radius: var(--radius-xl) var(--radius-xl) 0 0; max-height: 92vh; }
  .modal-f { flex-direction: column-reverse; }
  .modal-f .btn { width: 100%; }
}

/* ======================================================== dropdowns ======== */

.menu {
  position: absolute; right: 0; top: calc(100% + var(--space-1)); z-index: 40;
  min-width: 180px; padding: var(--space-1);
  background: var(--surface-raised); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-md);
  animation: popIn var(--motion) var(--ease-out);
}
.menu-it {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 6px var(--space-2); border-radius: var(--radius-sm);
  font-size: var(--text-body-sm); color: var(--foreground); cursor: pointer;
  width: 100%; background: none; border: none; font-family: inherit; text-align: left;
  transition: background var(--motion-fast) var(--ease);
}
.menu-it:hover { background: var(--muted); }
.menu-it.danger { color: var(--danger-foreground); }
.menu-it.danger:hover { background: var(--danger-subtle); }
.menu-sep { height: 1px; background: var(--border-subtle); margin: var(--space-1) 0; }

/* ========================================================= tooltip ========= */

.tip { position: relative; display: inline-flex; }
.tip::after {
  content: attr(data-tip);
  position: absolute; bottom: calc(100% + 6px); left: 50%;
  transform: translateX(-50%) translateY(2px);
  padding: 5px var(--space-2); border-radius: var(--radius-sm);
  background: var(--foreground); color: var(--background);
  font-size: var(--text-meta); line-height: 1.4; white-space: nowrap;
  opacity: 0; pointer-events: none;
  transition: opacity var(--motion-fast) var(--ease), transform var(--motion-fast) var(--ease);
  z-index: 70;
}
.tip:hover::after, .tip:focus-visible::after { opacity: 1; transform: translateX(-50%) translateY(0); }

/* =========================================================== toasts ======== */

.toasts { position: fixed; bottom: var(--space-5); left: 50%; transform: translateX(-50%); z-index: 90; display: flex; flex-direction: column; gap: var(--space-2); }
.toast {
  background: var(--foreground); color: var(--background);
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-md);
  font-size: var(--text-body-sm); box-shadow: var(--shadow-md);
  animation: toastIn var(--motion-slow) var(--ease-out);
}
@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* ==================================================== command palette ====== */

.pal-overlay {
  position: fixed; inset: 0; z-index: 100; background: rgba(16, 16, 16, 0.45);
  display: none; align-items: flex-start; justify-content: center;
  padding: 14vh var(--space-4) var(--space-4);
}
.pal {
  width: 100%; max-width: 560px; background: var(--surface-raised);
  border: 1px solid var(--border); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg); overflow: hidden;
  animation: popIn var(--motion-slow) var(--ease-out);
}
.pal-input {
  width: 100%; border: none; border-bottom: 1px solid var(--border-subtle);
  padding: var(--space-4); font-family: inherit; font-size: var(--text-h3);
  background: transparent; color: var(--foreground); outline: none;
}
.pal-list { max-height: 320px; overflow-y: auto; padding: var(--space-1); }
.pal-it {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  font-size: var(--text-body-sm); cursor: pointer; color: var(--foreground);
}
.pal-it.sel { background: var(--muted); }
.pal-foot {
  display: flex; gap: var(--space-3); padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border-subtle); font-size: var(--text-meta);
  color: var(--subtle-foreground); background: var(--surface-subtle);
}

/* ============================================================ misc ========= */

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--space-5); }
@media (max-width: 600px) { .grid2 { grid-template-columns: 1fr; } }

.progress-track { height: 4px; background: var(--muted); border-radius: var(--radius-full); overflow: hidden; }
.progress-fill { height: 100%; background: var(--primary); transition: width var(--motion-slow) var(--ease); }

.theme-toggle { display: inline-flex; }

/* ================================================== recovered components === */

/* endpoint row: a copyable URL that scrolls rather than wrapping */
.endpoint {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-subtle); border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.endpoint code {
  flex: 1; font-family: var(--font-mono); font-size: var(--text-body-sm);
  overflow-x: auto; white-space: nowrap; scrollbar-width: none;
}
.endpoint code::-webkit-scrollbar { display: none; }

/* code snippet with a floating copy affordance */
.snippet { position: relative; }
.snippet pre {
  margin: 0; padding: var(--space-3); overflow-x: auto;
  background: var(--surface-subtle); border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono); font-size: var(--text-body-sm); line-height: 1.6;
}
.snippet .copy-float { position: absolute; top: var(--space-2); right: var(--space-2); }
.snippet-tabs { display: flex; gap: 2px; margin-bottom: var(--space-2); }
.st {
  padding: 4px var(--space-2); border-radius: var(--radius-sm);
  border: 1px solid transparent; background: none; cursor: pointer;
  font-family: inherit; font-size: var(--text-caption); color: var(--muted-foreground);
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}
.st:hover { color: var(--foreground); background: var(--muted); }
.st.active { background: var(--muted-hover); border-color: var(--border); color: var(--foreground); font-weight: var(--weight-medium); }

/* storage / usage meter */
.usage-line { display: flex; justify-content: space-between; font-size: var(--text-body-sm); color: var(--muted-foreground); margin-bottom: 6px; }
.meter { height: 6px; border-radius: var(--radius-full); background: var(--muted-hover); overflow: hidden; }
.meter > span { display: block; height: 100%; border-radius: var(--radius-full); background: var(--primary); transition: width var(--motion-slow) var(--ease); }

/* row action menu cell keeps the table from jumping when the trigger appears */
.rowmenu-cell { width: 40px; text-align: right; }
.menu-pop { position: relative; }

/* auth + landing helpers */
.auth-brand { display: flex; justify-content: center; margin-bottom: var(--space-5); }
.right { margin-left: auto; }

/* theme toggle swaps its glyph with the active theme */
.theme-toggle .icon-sun { display: none; }
.theme-toggle .icon-moon { display: block; }
[data-theme="dark"] .theme-toggle .icon-sun { display: block; }
[data-theme="dark"] .theme-toggle .icon-moon { display: none; }
`;
