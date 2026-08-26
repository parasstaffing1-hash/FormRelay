const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateCondition, evaluateExpression, evaluateRules, pipeText, validateSchemaV2 } = require('../.test-build/logic.js');

test('evaluates comparisons and rejects dynamic code execution', () => {
  assert.equal(evaluateCondition({ source: 'answer', key: 'plan', operator: 'equals', value: 'pro' }, { answers: { plan: 'pro' }, variables: {}, url: {}, meta: {} }), true);
  assert.equal(evaluateCondition({ source: 'answer', key: 'tags', operator: 'includes_any', value: ['vip'] }, { answers: { tags: ['vip', 'customer'] }, variables: {}, url: {}, meta: {} }), true);
  assert.equal(evaluateExpression('quantity * price + 2', { quantity: 3, price: 4 }), 14);
  assert.equal(evaluateExpression("constructor.constructor('return 1')()", {}), undefined);
});

test('applies actions and answer piping', () => {
  const state = evaluateRules([{ id: 'r1', match: 'all', conditions: [{ source: 'answer', key: 'kind', operator: 'equals', value: 'business' }], actions: [{ type: 'show', target: 'company' }, { type: 'require', target: 'company' }] }], { answers: { kind: 'business' }, variables: { total: 42 }, url: {}, meta: {} });
  assert.equal(state.visible.company, true);
  assert.equal(state.required.company, true);
  assert.equal(pipeText('Hello {{var:total}} / {{kind}}', { answers: { kind: 'business' }, variables: { total: 42 }, url: {}, meta: {} }), 'Hello 42 / business');
});

test('finds invalid schema references at publish time', () => {
  const schema = { version: 2, blocks: [{ id: 'a', type: 'short_text', label: 'A' }], settings: { submitText: 'Submit', successMessage: '', redirectUrl: '' }, pages: [{ id: 'page_1', title: 'Page 1' }], variables: [], logic: [{ id: 'r', match: 'all', conditions: [{ source: 'answer', key: 'missing', operator: 'equals', value: 'x' }], actions: [{ type: 'show', target: 'a' }] }], endings: [] };
  assert.equal(validateSchemaV2(schema).errors.length, 1);
});
