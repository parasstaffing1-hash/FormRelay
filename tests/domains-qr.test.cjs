const assert = require('node:assert/strict');
const test = require('node:test');
const { isOriginAllowed } = require('../.test-build/db.js');
const { generateQrSvg, generateQrMatrix } = require('../.test-build/qr.js');

test('isOriginAllowed permits all origins when enforcement is off', () => {
  const config = { enforced: false, domains: ['example.com'] };
  assert.equal(isOriginAllowed('https://evil.com', config), true);
  assert.equal(isOriginAllowed(null, config), true);
});

test('isOriginAllowed matches exact domains, wildcards, and ports', () => {
  const config = {
    enforced: true,
    domains: ['example.com', '*.sub.example.com', 'localhost:3000'],
  };

  // Exact domain
  assert.equal(isOriginAllowed('https://example.com', config), true);
  assert.equal(isOriginAllowed('http://example.com', config), true);
  assert.equal(isOriginAllowed('https://example.com/some/path', config), true);

  // Wildcard domain
  assert.equal(isOriginAllowed('https://app.sub.example.com', config), true);
  assert.equal(isOriginAllowed('https://deep.app.sub.example.com', config), true);
  assert.equal(isOriginAllowed('https://sub.example.com', config), true);
  assert.equal(isOriginAllowed('https://other.example.com', config), false);

  // Localhost with port
  assert.equal(isOriginAllowed('http://localhost:3000', config), true);
  assert.equal(isOriginAllowed('http://localhost:8787', config), false);

  // Rejects unmatched / malicious
  assert.equal(isOriginAllowed('https://evil.com', config), false);
  assert.equal(isOriginAllowed('https://fake-example.com', config), false);
  assert.equal(isOriginAllowed(null, config), false);
  assert.equal(isOriginAllowed('', config), false);
});

test('generateQrSvg produces valid SVG string for URLs', () => {
  const url = 'https://formrelay.dev/f/contact-us';
  const svg = generateQrSvg(url, { size: 240 });

  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('width="240"'));
  assert.ok(svg.includes('height="240"'));
  assert.ok(svg.includes('<path d="M'));
  assert.ok(svg.endsWith('</svg>'));

  const matrix = generateQrMatrix(url);
  assert.ok(matrix.length >= 21, 'QR matrix dimension must be at least version 1 size (21x21)');
  assert.equal(matrix.length, matrix[0].length, 'QR matrix must be square');
});
