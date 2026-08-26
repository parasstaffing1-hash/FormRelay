import { FC } from "hono/jsx";
import { raw } from "hono/html";

type IconProps = { size?: number; class?: string };

function make(path: string, extra?: string): FC<IconProps> {
  return ({ size = 16, class: cls }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={1.8}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cls}
      aria-hidden="true"
    >
      <path d={path} />
      {extra ? raw(extra) : null}
    </svg>
  );
}

export const IconHome = make("M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5");
export const IconForm = make("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", '<path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h4"/>');
export const IconInbox = make("M22 12h-6l-2 3h-4l-2-3H2", '<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>');
export const IconZap = make("M13 2 3 14h7l-1 8 12-14h-8l0-6z");
export const IconWebhook = make("M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2", '<path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>');
export const IconFile = make("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", '<path d="M14 2v6h6"/>');
export const IconUsers = make("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", '<circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
export const IconSettings = make("M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z", '<circle cx="12" cy="12" r="3"/>');
export const IconBook = make("M4 19.5A2.5 2.5 0 0 1 6.5 17H20", '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>');
export const IconGauge = make("m12 14 4-4", '<path d="M3.34 19a10 10 0 1 1 17.32 0"/>');
export const IconPlus = make("M12 5v14M5 12h14");
export const IconSearch = make("M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", '<path d="m21 21-4.35-4.35"/>');
export const IconCopy = make("M8 8h12v12H8z", '<rect x="4" y="4" width="12" height="12" rx="1"/>');
export const IconCheck = make("M20 6 9 17l-5-5");
export const IconTrash = make("M3 6h18", '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>');
export const IconDots = make("M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", '<circle cx="12" cy="12" r="10" stroke="none" fill="none" opacity="0"/>');
export const IconChevronDown = make("m6 9 6 6 6-6");
export const IconChevronRight = make("m9 6 6 6-6 6");
export const IconX = make("M18 6 6 18M6 6l12 12");
export const IconExternal = make("M15 3h6v6", '<path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>');
export const IconArchive = make("M21 8v13H3V8", '<path d="M1 3h22v5H1z"/><path d="M10 12h4"/>');
export const IconShield = make("M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z", '<path d="m9 12 2 2 4-4"/>');
export const IconMail = make("M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", '<path d="m22 6-10 7L2 6"/>');
export const IconClock = make("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", '<path d="M12 7v5l3 3"/>');
export const IconAlert = make("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", '<path d="M12 8v4"/><path d="M12 16h.01"/>');
export const IconKey = make("M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4");
export const IconCard = make("M2 5h20v14H2z", '<path d="M2 10h20"/>');
export const IconBell = make("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>');
export const IconGlobe = make("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", '<path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>');
export const IconSend = make("m22 2-7 20-4-9-9-4 20-7z", '<path d="M22 2 11 13"/>');
export const IconRetry = make("M3 12a9 9 0 1 0 3-6.7L3 8", '<path d="M3 3v5h5"/>');
export const IconMenu = make("M3 6h18M3 12h18M3 18h18");
export const IconPanelLeft = make("M3 3h18v18H3z", '<path d="M9 3v18"/>');
export const IconLogo = make("M4 11.5 12 5l8 6.5", '<path d="M6 12.5v5.5h12v-5.5"/><path d="M9.5 15h5"/>');

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <span class="logo-mark" style={`width:${size}px;height:${size}px`}>
      <IconLogo size={Math.round(size * 0.62)} />
    </span>
  );
}
