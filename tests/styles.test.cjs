const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const BACKTICK = String.fromCharCode(96);

/**
 * Guards for the CSS-in-template-literal files.
 *
 * A stray backtick inside one silently terminates the literal and turns the rest of the
 * stylesheet into a TypeScript syntax error. That happened twice while writing comments
 * that quoted class names, so it is now a test rather than a habit.
 */
const CSS_FILES = ['ui/styles.ts', 'ui/tokens.ts', 'pages/public-form.tsx'].map((f) => path.join(SRC, f));
const read = (file) => fs.readFileSync(file, 'utf8');

test('CSS template literals contain no stray backticks', () => {
  for (const file of CSS_FILES) {
    const count = (read(file).match(new RegExp(BACKTICK, 'g')) || []).length;
    assert.equal(
      count % 2, 0,
      path.basename(file) + ' has an odd number of backticks - a comment probably quotes a class name'
    );
  }
});

test('every custom property used resolves to a definition', () => {
  // Definitions can share a line (--text-h1 and --leading-h1 are declared together), so
  // this must not anchor to line starts. var() usages are stripped first so a reference
  // inside tokens.ts cannot masquerade as a definition.
  const tokenSrc = read(path.join(SRC, 'ui/tokens.ts')).replace(/var\([^)]*\)/g, '');
  const defined = new Set([...tokenSrc.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  // Theme variables are supplied per form at render time, not by the token layer.
  const runtime = new Set(['--form-bg', '--form-text', '--form-font', '--form-button', '--form-radius']);

  const missing = new Map();
  for (const file of CSS_FILES) {
    for (const m of read(file).matchAll(/var\((--[a-z0-9-]+)/gi)) {
      if (!defined.has(m[1]) && !runtime.has(m[1])) missing.set(m[1], path.basename(file));
    }
  }
  assert.deepEqual(
    [...missing.keys()], [],
    'undefined custom properties: ' + [...missing].map(([k, v]) => k + ' (' + v + ')').join(', ')
  );
});

test('a numeric table header aligns with its own column', () => {
  // .tbl th is more specific than .num, so the header needs its own rule or it drifts left.
  assert.match(
    read(path.join(SRC, 'ui/styles.ts')),
    /\.tbl th\.num\s*\{[^}]*text-align:\s*right/,
    'th.num must right-align explicitly'
  );
});

test('no synthetic font weights, which system fonts do not ship', () => {
  const css = read(path.join(SRC, 'ui/tokens.ts')) + read(path.join(SRC, 'ui/styles.ts'));
  const weights = [...css.matchAll(/font-weight:\s*(\d{3})/g)].map((m) => Number(m[1]));
  const allowed = new Set([400, 500, 600, 700]);
  const bad = [...new Set(weights)].filter((w) => !allowed.has(w));
  assert.deepEqual(bad, [], 'synthetic weights are faked inconsistently per platform: ' + bad.join(', '));
});

test('spacing values come from the scale, not arbitrary pixels', () => {
  const css = read(path.join(SRC, 'ui/styles.ts'));
  // Padding/margin/gap should reference tokens. A handful of literals are legitimate
  // (hairlines, optical nudges), so this asserts the proportion rather than perfection.
  const decls = [...css.matchAll(/(?:padding|margin|gap):\s*([^;]+);/g)].map((m) => m[1]);
  const literal = decls.filter((d) => /\b\d+px/.test(d) && !d.includes('var(--space'));
  assert.ok(
    literal.length <= 12,
    'too many hand-written spacing values (' + literal.length + '): ' + literal.slice(0, 6).join(' | ')
  );
});
