/**
 * Design tokens.
 *
 * Every visual decision in the product resolves to one of these. Components reference
 * tokens, never raw values, so density, rhythm, and colour stay consistent as pages are
 * added. Kept in its own module so the token layer can be read without wading through
 * component CSS.
 *
 * Scales are deliberately short. A long scale is the same as no scale: if there are
 * fourteen font sizes, nobody can pick the right one.
 */
export const TOKENS = String.raw`
:root {
  /* ---- spacing: 4px grid ---------------------------------------------- */
  --space-0: 0px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ---- typography ------------------------------------------------------
     One family, four real weights. Synthetic weights (450, 550, 650) are not
     present in system UI fonts and get faked inconsistently per platform. */
  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  --text-display: 28px;   --leading-display: 34px;
  --text-h1: 22px;        --leading-h1: 28px;
  --text-h2: 17px;        --leading-h2: 24px;
  --text-h3: 15px;        --leading-h3: 22px;
  --text-h4: 14px;        --leading-h4: 20px;
  --text-body: 14px;      --leading-body: 21px;
  --text-body-sm: 13px;   --leading-body-sm: 19px;
  --text-label: 12px;     --leading-label: 16px;
  --text-caption: 12px;   --leading-caption: 16px;
  --text-meta: 11px;      --leading-meta: 15px;

  --tracking-tight: -0.02em;
  --tracking-snug: -0.01em;
  --tracking-normal: 0;

  /* ---- radius ---------------------------------------------------------- */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 999px;

  /* ---- control sizing -------------------------------------------------- */
  --control-sm: 28px;
  --control-md: 32px;
  --control-lg: 38px;
  --icon-sm: 14px;
  --icon-md: 16px;
  --icon-lg: 20px;

  /* ---- layout ---------------------------------------------------------- */
  --page-max: 1040px;
  --page-max-wide: 1400px;
  --page-gutter: 32px;
  --sidebar-width: 240px;
  --topbar-height: 48px;

  /* ---- colour: neutral ramp + one accent -------------------------------
     Borders and hovers are alpha so they compose over any surface. */
  --background: #ffffff;
  --foreground: #1a1a1a;
  --surface: #ffffff;
  --surface-subtle: #f8f8f7;
  --surface-raised: #ffffff;
  --muted: rgba(23, 23, 23, 0.05);
  --muted-hover: rgba(23, 23, 23, 0.08);
  --muted-foreground: rgba(23, 23, 23, 0.68);
  --subtle-foreground: rgba(23, 23, 23, 0.60);
  --border: rgba(23, 23, 23, 0.09);
  --border-subtle: rgba(23, 23, 23, 0.06);
  --border-strong: rgba(23, 23, 23, 0.16);

  --primary: #2f6feb;
  --primary-hover: #2560d4;
  --primary-active: #1f52b8;
  --primary-foreground: #ffffff;
  --primary-subtle: rgba(47, 111, 235, 0.09);
  --primary-ring: rgba(47, 111, 235, 0.36);

  --success: #147d47;
  --success-foreground: #0f6a3c;
  --success-subtle: rgba(20, 125, 71, 0.10);
  --warning-foreground: #8a5a00;
  --warning-subtle: rgba(180, 120, 0, 0.12);
  --danger: #c9372c;
  --danger-hover: #ad2e24;
  --danger-foreground: #b4291f;
  --danger-subtle: rgba(201, 55, 44, 0.10);

  /* ---- elevation -------------------------------------------------------
     Flat by default. Depth is reserved for surfaces that float above the page. */
  --shadow-xs: 0 1px 2px rgba(16, 16, 16, 0.04);
  --shadow-sm: 0 1px 3px rgba(16, 16, 16, 0.06), 0 1px 2px rgba(16, 16, 16, 0.04);
  --shadow-md: 0 4px 12px rgba(16, 16, 16, 0.08), 0 2px 4px rgba(16, 16, 16, 0.04);
  --shadow-lg: 0 12px 32px rgba(16, 16, 16, 0.12), 0 4px 8px rgba(16, 16, 16, 0.06);

  /* ---- motion ----------------------------------------------------------
     Short and functional. Transform and opacity only, so nothing triggers layout. */
  --ease: cubic-bezier(0.2, 0, 0.13, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --motion-fast: 120ms;
  --motion: 180ms;
  --motion-slow: 240ms;

  --focus-ring: 0 0 0 2px var(--background), 0 0 0 4px var(--primary-ring);

  color-scheme: light;
}

[data-theme="dark"] {
  --background: #191919;
  --foreground: rgba(255, 255, 255, 0.86);
  --surface: #191919;
  --surface-subtle: #1f1f1f;
  --surface-raised: #232323;
  --muted: rgba(255, 255, 255, 0.06);
  --muted-hover: rgba(255, 255, 255, 0.10);
  --muted-foreground: rgba(255, 255, 255, 0.62);
  --subtle-foreground: rgba(255, 255, 255, 0.48);
  --border: rgba(255, 255, 255, 0.10);
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.18);

  --primary: #4b8bf5;
  --primary-hover: #5d97f7;
  --primary-active: #3f7de0;
  --primary-foreground: #0d1220;
  --primary-subtle: rgba(75, 139, 245, 0.16);
  --primary-ring: rgba(75, 139, 245, 0.40);

  --success-foreground: #6fc394;
  --success-subtle: rgba(111, 195, 148, 0.14);
  --warning-foreground: #dcae62;
  --warning-subtle: rgba(220, 174, 98, 0.14);
  --danger: #e0796f;
  --danger-hover: #e88a80;
  --danger-foreground: #e0796f;
  --danger-subtle: rgba(224, 121, 111, 0.14);

  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.30);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.40), 0 1px 2px rgba(0, 0, 0, 0.30);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.45), 0 2px 4px rgba(0, 0, 0, 0.30);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.55), 0 4px 8px rgba(0, 0, 0, 0.35);

  color-scheme: dark;
}

@media (max-width: 900px) {
  :root { --page-gutter: 20px; }
}
@media (max-width: 420px) {
  :root { --page-gutter: 16px; }
}
`;
