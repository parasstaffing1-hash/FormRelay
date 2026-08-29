import { FC, PropsWithChildren, Child } from "hono/jsx";
import { escapeScriptJson } from "../util";
import { CSS } from "./styles";
import { CLIENT_JS } from "./client";
import {
  LogoMark,
  IconHome, IconForm, IconInbox, IconZap, IconWebhook, IconFile,
  IconUsers, IconSettings, IconBook, IconGauge, IconMenu, IconPanelLeft,
  IconSearch, IconPlus,
} from "./icons";

export type CommandItem = { label: string; href: string; icon: string; keywords?: string };

const NAV_ICON_PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  form: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  zap: "M13 2 3 14h7l-1 8 12-14h-8l0-6z",
  webhook: "M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  gauge: "M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0",
};

type NavItem = { label: string; href: string; icon: Child; match: (path: string) => boolean; count?: number };
type NavSection = { label?: string; items: NavItem[] };

export const AppShell: FC<
  PropsWithChildren<{
    path: string;
    crumbs: { label: string; href?: string }[];
    actions?: Child;
    toastMsg?: string;
    formCount: number;
    submissionCount: number;
    commands: CommandItem[];
  }>
> = ({ path, crumbs, actions, toastMsg, formCount, submissionCount, commands, children }) => {
  const sections: NavSection[] = [
    { items: [{ label: "Home", href: "/admin", icon: <IconHome />, match: (p) => p === "/admin" }] },
    {
      label: "Forms",
      items: [
        { label: "Forms", href: "/admin/forms", icon: <IconForm />, match: (p) => p.startsWith("/admin/forms"), count: formCount },
        { label: "Submissions", href: "/admin/submissions", icon: <IconInbox />, match: (p) => p.startsWith("/admin/submissions"), count: submissionCount },
      ],
    },
    {
      label: "Automation",
      items: [
        { label: "Workflows", href: "/admin/workflows", icon: <IconZap />, match: (p) => p.startsWith("/admin/workflows") },
        { label: "Webhooks", href: "/admin/webhooks", icon: <IconWebhook />, match: (p) => p.startsWith("/admin/webhooks") },
      ],
    },
    { label: "Data", items: [{ label: "Files", href: "/admin/files", icon: <IconFile />, match: (p) => p.startsWith("/admin/files") }] },
    {
      label: "Workspace",
      items: [
        { label: "Members", href: "/admin/settings?section=members", icon: <IconUsers />, match: (p) => false },
        { label: "Settings", href: "/admin/settings", icon: <IconSettings />, match: (p) => p.startsWith("/admin/settings") },
      ],
    },
  ];

  const initial = "FR";
  // `<` is escaped so a command label can never terminate the surrounding <script> tag.
  const commandJson = escapeScriptJson(JSON.stringify(
    commands.length
      ? commands
      : [
          { label: "New form", href: "/admin/forms?new=1", icon: NAV_ICON_PATHS.form, keywords: "create add endpoint" },
          { label: "Go to Forms", href: "/admin/forms", icon: NAV_ICON_PATHS.form },
          { label: "Search submissions", href: "/admin/submissions", icon: NAV_ICON_PATHS.inbox, keywords: "inbox find" },
          { label: "Go to Webhooks", href: "/admin/webhooks", icon: NAV_ICON_PATHS.webhook },
          { label: "Go to Workflows", href: "/admin/workflows", icon: NAV_ICON_PATHS.zap },
          { label: "Go to Settings", href: "/admin/settings", icon: NAV_ICON_PATHS.settings },
          { label: "Open documentation", href: "/", icon: NAV_ICON_PATHS.book, keywords: "docs help guide" },
        ]
  ));

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{crumbs[crumbs.length - 1]?.label ?? "FormRelay"} · FormRelay</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;650;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body data-toast={toastMsg}>
        <div class="backdrop"></div>
        <div class="shell">
          <aside class="sidebar">
            <div class="side-head">
              <button class="icon-btn drawer-only" data-toggle-drawer aria-label="Close menu" style="margin-right:-4px">
                <IconX2 />
              </button>
              <a href="/admin" aria-label="FormRelay home"><LogoMark /></a>
              <span class="wordmark">FormRelay</span>
              <button
                class="icon-btn"
                data-toggle-rail
                aria-label="Toggle sidebar"
                style="opacity:.55;margin-left:auto"
                title="Collapse sidebar"
              >
                <IconPanelLeft size={15} />
              </button>
            </div>
            <nav class="nav" aria-label="Main navigation">
              {sections.map((sec) => (
                <div>
                  {sec.label ? <div class="nav-label">{sec.label}</div> : null}
                  {sec.items.map((item) => (
                    <a class={`sitem ${item.match(path) ? "active" : ""}`} href={item.href} title={item.label}>
                      {item.icon}
                      <span class="sitem-label">{item.label}</span>
                      {item.count !== undefined && item.count > 0 ? <span class="count">{item.count}</span> : null}
                    </a>
                  ))}
                </div>
              ))}
            </nav>
            <div class="side-foot">
              <a class="sitem" href="/">
                <IconBook />
                <span class="sitem-label">Documentation</span>
              </a>
              <div class="side-user">
                <span class="avatar">{initial}</span>
                <span class="label truncate">Admin</span>
                <button
                  type="button"
                  class="icon-btn theme-toggle right"
                  data-toggle-theme
                  aria-label="Toggle dark mode"
                  title="Toggle theme"
                  style="width:auto;padding:0 6px;height:24px;margin-right:2px"
                >
                  <svg class="icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  <svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                </button>
                <a href="/admin/logout" class="icon-btn" style="width:auto;padding:0 7px;height:24px;font-size:12px" aria-label="Log out" title="Log out">
                  Log out
                </a>
              </div>
            </div>
          </aside>

          <div class="main-col">
            <header class={`topbar ${crumbs.length > 1 ? "bordered" : ""}`}>
              <button class="icon-btn menu-toggle" data-toggle-drawer aria-label="Open menu">
                <IconMenu />
              </button>
              <nav class="crumbs" aria-label="Breadcrumb">
                {crumbs.map((c, i) => (
                  <>
                    {i > 0 ? <span class="sep">/</span> : null}
                    {c.href && i < crumbs.length - 1 ? (
                      <a class="crumb" href={c.href}>{c.label}</a>
                    ) : (
                      <span class={`crumb ${i === crumbs.length - 1 ? "current" : ""}`}>{c.label}</span>
                    )}
                  </>
                ))}
              </nav>
              <div class="topbar-right">
                <button type="button" class="searchbtn" onclick={""} id="open-pal" aria-label="Search commands">
                  <IconSearch size={13} />
                  <span class="search-hint">Search...</span>
                  <kbd style="margin-left:auto">⌘K</kbd>
                </button>
                <a class="btn btn-primary btn-sm" href="/admin/forms?new=1">
                  <IconPlus size={14} /> <span>New form</span>
                </a>
              </div>
            </header>
            <main class="page" id="main">{children}</main>
          </div>
        </div>

        <script type="application/json" id="pal-commands" dangerouslySetInnerHTML={{ __html: commandJson }} />
        <script dangerouslySetInnerHTML={{ __html: PALETTE_WIRE + CLIENT_JS }} />
      </body>
    </html>
  );
};

function IconX2() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const PALETTE_WIRE = String.raw`
document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("open-pal");
  if (btn && window.frOpenPal) btn.addEventListener("click", function () { window.frOpenPal(); });
});
`;

const THEME_BOOT = String.raw`
(function () {
  try {
    var t = localStorage.getItem("fr.theme");
    if (t !== "dark" && t !== "light") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
`;
