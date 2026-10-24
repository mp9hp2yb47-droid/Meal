import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitPriceCents, compareRecords, diffRounds, resolveConservative, selectPrice, maxConfidence, toBase } from '../src/engine/prices.js';
import { validatePriceRecords, validateRoundFile } from '../src/engine/validate.js';

const chicken = { id: 'chicken-breast', base: 'g', weekly_qty_estimate: 800 };
const eggs = { id: 'eggs', base: 'each', each_g: 50, weekly_qty_estimate: 18 };
const tuna = { id: 'tuna-tin', base: 'each', each_g: 95, weekly_qty_estimate: 7 };
const milk = { id: 'milk', base: 'ml', weekly_qty_estimate: 2000 };

const rec = (over) => ({
  ingredient_id: 'chicken-breast', store_id: 'woolworths-randwick', price_cents: 1100, price_basis: 'per_kg',
  price_type: 'shelf', channel: 'online', observed: '2026-10-20', source_url: 'https://example.com/p',
  source_domain: 'example.com', quote: '$11.00 / 1KG', confidence: 'high', round: 1, ...over,
});

test('toBase converts kg, l and each', () => {
  assert.equal(toBase(1, 'kg', chicken), 1000);
  assert.equal(toBase(2, 'l', milk), 2000);
  assert.equal(toBase(600, 'g', eggs), 12);
  assert.equal(toBase(1, 'each', chicken), null);
});

test('unitPriceCents normalises per_kg, per_pack and per_each', () => {
  assert.equal(unitPriceCents(rec(), chicken), 1.1);
  assert.equal(unitPriceCents(rec({ price_basis: 'per_pack', price_cents: 660, pack: { qty: 12, unit: 'each' } }), eggs), 55);
  assert.equal(unitPriceCents(rec({ price_basis: 'per_pack', price_cents: 420, pack: { qty: 2, unit: 'l' } }), milk), 0.21);
  assert.equal(unitPriceCents(rec({ price_basis: 'per_each', price_cents: 215 }), tuna), 215);
});

test('unitPriceCents rejects bad cents and unconvertible packs', () => {
  assert.equal(unitPriceCents(rec({ price_cents: 11.5 }), chicken), null);
  assert.equal(unitPriceCents(rec({ price_basis: 'per_pack', pack: { qty: 3, unit: 'each' } }), chicken), null);
  assert.equal(unitPriceCents(rec({ price_basis: 'per_pack' }), chicken), null);
});

test('compareRecords flags on percentage or weekly impact', () => {
  assert.equal(compareRecords(rec(), rec({ price_cents: 1200 }), chicken).outcome, 'agree'); // 9%, $0.80/wk
  assert.equal(compareRecords(rec(), rec({ price_cents: 1300 }), chicken).outcome, 'disagree'); // 18%
  const small = compareRecords(rec(), rec({ price_cents: 1250 }), chicken); // 13.6% but $1.20/wk
  assert.equal(small.outcome, 'disagree');
  assert.equal(small.weeklyImpactCents, 120);
  assert.equal(compareRecords(rec(), null, chicken).outcome, 'not_found');
  assert.equal(compareRecords(rec(), rec({ price_basis: 'per_each' }), chicken).outcome, 'spec_mismatch');
});

test('diffRounds compares cheapest shelf SKU, ignores specials, flags same domain', () => {
  const r1 = [rec(), rec({ price_cents: 1500 }), rec({ price_type: 'special', price_cents: 500, valid_to: '2026-10-27' })];
  const r2 = [rec({ round: 2, price_cents: 1120 }), rec({ round: 2, ingredient_id: 'eggs', price_basis: 'per_each', price_cents: 55 })];
  const rows = diffRounds(r1, r2, [chicken, eggs]);
  const c = rows.find((r) => r.ingredient_id === 'chicken-breast');
  assert.equal(c.outcome, 'agree');
  assert.equal(c.round1.price_cents, 1100);
  assert.equal(c.sameDomain, true);
  assert.equal(rows.find((r) => r.ingredient_id === 'eggs').outcome, 'not_found');
});

test('resolveConservative takes the higher unit price at low confidence', () => {
  const out = resolveConservative(rec(), rec({ price_cents: 1400, round: 2 }), chicken);
  assert.equal(out.price_cents, 1400);
  assert.equal(out.confidence, 'low');
  assert.equal(out.round, 3);
});

test('selectPrice follows precedence and drops expired specials', () => {
  const prices = [rec({ round: 1, price_cents: 900 }), rec({ round: 3, price_cents: 1150 })];
  const today = '2026-10-24';
  assert.equal(selectPrice('chicken-breast', 'woolworths-randwick', { prices, today }).tier, 'final');
  const overrides = [rec({ price_cents: 999, setAt: '2026-10-24' })];
  assert.equal(selectPrice('chicken-breast', 'woolworths-randwick', { prices, overrides, today }).record.price_cents, 999);
  const expired = [rec({ round: 3, price_type: 'special', valid_to: '2026-10-21', price_cents: 600 })];
  assert.equal(selectPrice('chicken-breast', 'woolworths-randwick', { prices: expired, today }).tier, 'unpriced');
  assert.equal(selectPrice('eggs', null, { prices, today }).record, null);
});

test('confidence rubric', () => {
  assert.equal(maxConfidence(rec(), '2026-10-24'), 'high');
  assert.equal(maxConfidence(rec({ observed: '2026-10-01' }), '2026-10-24'), 'medium');
  assert.equal(maxConfidence(rec({ channel: 'search_snippet' }), '2026-10-24'), 'medium');
  assert.equal(maxConfidence(rec({ channel: 'other' }), '2026-10-24'), 'low');
});

test('validator catches missing provenance and over-claimed confidence', () => {
  const ctx = { ingredients: [chicken], stores: [{ id: 'woolworths-randwick' }], today: '2026-10-24' };
  assert.deepEqual(validatePriceRecords([rec()], ctx), []);
  const errs = validatePriceRecords([rec({ quote: '', channel: 'search_snippet', price_type: 'special' })], ctx);
  assert.ok(errs.some((e) => e.includes('quote')));
  assert.ok(errs.some((e) => e.includes('exceeds rubric')));
  assert.ok(errs.some((e) => e.includes('valid_to')));
  const roundErrs = validateRoundFile({ schemaVersion: 1, round: 2, run_date: '2026-10-24', agent: 't', records: [rec()] }, ctx);
  assert.ok(roundErrs.some((e) => e.includes('!= file round')));
});
