import { FC, PropsWithChildren, Child } from "hono/jsx";

/* ---------- primitives ---------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export const Button: FC<
  PropsWithChildren<{
    variant?: BtnVariant;
    size?: "sm";
    type?: "button" | "submit";
    href?: string;
    disabled?: boolean;
  }>
> = ({ variant = "secondary", size, type = "button", href, disabled, children }) => {
  const c = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : ""].filter(Boolean).join(" ");
  if (href) return <a class={c} href={href}>{children}</a>;
  return (
    <button class={c} type={type} disabled={disabled}>
      {children}
    </button>
  );
};

export const Field: FC<PropsWithChildren<{ label: string; hint?: string; forId?: string }>> = ({
  label,
  hint,
  forId,
  children,
}) => (
  <div class="field">
    <label for={forId}>{label}</label>
    {children}
    {hint ? <div class="hint">{hint}</div> : null}
  </div>
);

/* ---------- badges ---------- */

export const StatusBadge: FC<{ status: "active" | "archived" }> = ({ status }) =>
  status === "active" ? (
    <span class="badge badge-success"><span class="dot"></span>Active</span>
  ) : (
    <span class="badge badge-neutral"><span class="dot"></span>Archived</span>
  );

export const SpamBadge: FC<{ isSpam: boolean }> = ({ isSpam }) =>
  isSpam ? (
    <span class="badge badge-danger">Spam</span>
  ) : (
    <span class="badge badge-success"><span class="dot"></span>OK</span>
  );

/* ---------- page scaffolding ---------- */

export const PageHead: FC<PropsWithChildren<{ title: Child; sub?: Child; actions?: Child }>> = ({
  title,
  sub,
  actions,
}) => (
  <div class="page-head">
    <div>
      <h1>{title}</h1>
      {sub ? <p class="sub">{sub}</p> : null}
    </div>
    {actions ? <div class="page-actions">{actions}</div> : null}
  </div>
);

export const EmptyState: FC<{
  icon: Child;
  title: string;
  desc: string;
  actions?: Child;
  snippet?: string;
}> = ({ icon, title, desc, actions, snippet }) => (
  <div class="empty">
    <div class="empty-icon">{icon}</div>
    <h3>{title}</h3>
    <p>{desc}</p>
    {actions ? <div class="empty-actions">{actions}</div> : null}
    {snippet ? (
      <pre class="snippet mt24" style="text-align:left;display:inline-block;max-width:100%">
        {snippet}
      </pre>
    ) : null}
  </div>
);

/* ---------- copy / endpoint / snippets ---------- */

export const CopyButton: FC<{ value: string; small?: boolean }> = ({ value, small }) => (
  <button type="button" class={`btn btn-secondary ${small ? "btn-sm" : ""}`} data-copy={value}>
    {"\u29C9"} Copy
  </button>
);

export const EndpointBox: FC<{ url: string }> = ({ url }) => (
  <div class="endpoint">
    <code>{url}</code>
    <CopyButton value={url} small />
  </div>
);

export const Snippet: FC<{ code: string }> = ({ code }) => <pre class="snippet">{code}</pre>;

export const CodeTabs: FC<{ tabs: { key: string; label: string; code: string }[]; groupKey: string }> = ({
  tabs,
  groupKey,
}) => (
  <div data-snippet-group={groupKey}>
    <div class="snippet-tabs" role="tablist">
      {tabs.map((t, i) => (
        <button type="button" class={`st ${i === 0 ? "active" : ""}`} data-snippet={`${groupKey}-${t.key}`}>
          {t.label}
        </button>
      ))}
    </div>
    {tabs.map((t, i) => (
      <div data-snippet-pane={`${groupKey}-${t.key}`} hidden={i !== 0}>
        <Snippet code={t.code} />
      </div>
    ))}
  </div>
);

/* ---------- menus & modals ---------- */

export const RowMenu: FC<PropsWithChildren<{ label?: string }>> = ({ label, children }) => (
  <details class="menu rowmenu">
    <summary aria-label={label ?? "Row actions"}>
      <span class="icon-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </span>
    </summary>
    <div class="menu-pop">{children}</div>
  </details>
);

export const Modal: FC<PropsWithChildren<{ id: string; title: string; large?: boolean; open?: boolean }>> = ({
  id,
  title,
  large,
  open,
  children,
}) => (
  <div class="overlay" id={id} style={`display:${open ? "flex" : "none"}`} role="dialog" aria-modal="true" aria-label={title}>
    <div class={`modal ${large ? "modal-lg" : ""}`}>
      <div class="modal-h">
        <h2>{title}</h2>
        <button type="button" class="icon-btn" data-close-modal aria-label="Close">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="modal-b">{children}</div>
    </div>
  </div>
);

/* ---------- stats / usage ---------- */

export const StatBlock: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div class="stat">
    <div class="stat-v">{value}</div>
    <div class="stat-l">{label}</div>
  </div>
);

export const UsageMeter: FC<{ label: string; used: string; total: string; pct: number }> = ({ label, used, total, pct }) => (
  <div>
    <div class="usage-line">
      <span>{label}</span>
      <span>
        {used} of {total}
      </span>
    </div>
    <div class="meter"><span style={`width:${Math.max(2, Math.min(100, pct))}%`}></span></div>
  </div>
);
