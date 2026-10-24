import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unitPriceCents, compareRecords, diffRounds, needsAdjudication, resolveConservative, buildFinalPrices,
  selectPrice, maxConfidence, toBase, domainOf, checkSnapshot,
} from '../src/engine/prices.js';

const chicken = { id: 'chicken-breast', base: 'g', weekly_qty_estimate: 800 };
const eggs = { id: 'eggs', base: 'each', each_g: 50, weekly_qty_estimate: 18 };
const tuna = { id: 'tuna-tin', base: 'each', each_g: 95, weekly_qty_estimate: 7 };
const milk = { id: 'milk', base: 'ml', weekly_qty_estimate: 2000 };
import { rec, STORE, TODAY } from './fixtures.js';


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

test('variable per_pack uses qty_max (max price / max weight)', () => {
  const r = rec({ price_basis: 'per_pack', price_cents: 1870, pack: { qty: 1.5, unit: 'kg', variable: true, qty_min: 1.3, qty_max: 1.7 } });
  assert.equal(unitPriceCents(r, chicken), 1.1);
  assert.equal(maxConfidence({ ...r, observed: TODAY }, TODAY), 'medium');
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
  assert.equal(compareRecords(null, null, chicken).outcome, 'missing');
  assert.equal(compareRecords(rec(), rec({ price_basis: 'per_each' }), chicken).outcome, 'spec_mismatch');
});

test('domainOf strips www', () => {
  assert.equal(domainOf('https://www.grocerize.com.au/p/1'), 'grocerize.com.au');
  assert.equal(domainOf('https://grocerize.com.au/p/2'), 'grocerize.com.au');
  assert.equal(domainOf('nope'), null);
});

test('diffRounds: full grid, cheapest shelf SKU, ignores specials and non-matching SKUs, flags domain/copies', () => {
  const r1 = [
    rec(), rec({ price_cents: 1500 }),
    rec({ price_type: 'special', price_cents: 500, valid_to: '2026-10-27' }),
    rec({ price_cents: 400, sku_matches_spec: false, notes: 'marinated' }),
  ];
  const r2 = [
    rec({ round: 2, price_cents: 1120, source_url: 'https://woolworths.com.au/shop/productdetails/1', quote: '$11.20 / 1KG' }),
    rec({ round: 2, ingredient_id: 'eggs', price_basis: 'per_each', price_cents: 55, store_id: 'aldi-eastgardens' }),
  ];
  const rows = diffRounds(r1, r2, [chicken, eggs], [STORE, 'aldi-eastgardens']);
  assert.equal(rows.length, 4);
  const c = rows.find((r) => r.ingredient_id === 'chicken-breast' && r.store_id === STORE);
  assert.equal(c.outcome, 'agree');
  assert.equal(c.round1.price_cents, 1100);
  assert.equal(c.sameDomain, true); // www. vs bare host
  assert.equal(c.copied, false);
  assert.ok(needsAdjudication(c));
  assert.equal(rows.find((r) => r.ingredient_id === 'eggs' && r.store_id === STORE).outcome, 'missing');
  assert.equal(rows.find((r) => r.ingredient_id === 'eggs' && r.store_id === 'aldi-eastgardens').outcome, 'not_found');
});

test('diffRounds flags a Round 2 record copied from Round 1', () => {
  const [row] = diffRounds([rec()], [rec({ round: 2 })], [chicken], [STORE]);
  assert.equal(row.copied, true);
  assert.ok(needsAdjudication(row));
});

test('resolveConservative takes the higher price, or the only side, at low confidence', () => {
  const out = resolveConservative(rec(), rec({ price_cents: 1400, round: 2 }), chicken);
  assert.equal(out.price_cents, 1400);
  assert.equal(out.confidence, 'low');
  assert.equal(out.round, 3);
  assert.equal(resolveConservative(null, rec({ round: 2 }), chicken).price_cents, 1100);
  assert.equal(resolveConservative(rec(), undefined, chicken).confidence, 'low');
  assert.equal(resolveConservative(null, null, chicken), null);
});

test('buildFinalPrices: agreed rows use Round 2; Round 3 overrides its pair', () => {
  const g = 'https://grocerize.com.au/p/1';
  const rows = diffRounds(
    [rec(), rec({ ingredient_id: 'eggs', price_basis: 'per_each', price_cents: 50 })],
    [rec({ round: 2, price_cents: 1120, source_url: g, quote: 'x' }), rec({ round: 2, ingredient_id: 'eggs', price_basis: 'per_each', price_cents: 52, source_url: g, quote: 'y' })],
    [chicken, eggs], [STORE],
  );
  const r3 = [rec({ round: 3, ingredient_id: 'eggs', price_basis: 'per_each', price_cents: 60, confidence: 'low' })];
  const out = buildFinalPrices(rows, r3);
  assert.equal(out.length, 2);
  assert.equal(out.find((p) => p.ingredient_id === 'chicken-breast').price_cents, 1120);
  assert.equal(out.find((p) => p.ingredient_id === 'eggs').price_cents, 60);
});

test('selectPrice: precedence, shelf-only budget, cheapest in tier, latest override', () => {
  const prices = [rec({ round: 2, price_cents: 900 }), rec({ round: 3, price_cents: 1150 }), rec({ round: 3, price_cents: 1050 })];
  const final = selectPrice(chicken, STORE, { prices, today: TODAY });
  assert.equal(final.tier, 'final');
  assert.equal(final.record.price_cents, 1050);
  const overrides = [rec({ price_cents: 999, setAt: '2026-10-22' }), rec({ price_cents: 1299, setAt: '2026-10-24' })];
  assert.equal(selectPrice(chicken, STORE, { prices, overrides, today: TODAY }).record.price_cents, 1299);
  assert.equal(selectPrice(eggs, null, { prices, today: TODAY }).tier, 'unpriced');
});

test('selectPrice: specials never drive the budget; live specials only on request', () => {
  const special = rec({ round: 3, price_type: 'special', valid_to: '2026-10-28', price_cents: 600 });
  const shelf = rec({ round: 3, price_cents: 1100 });
  assert.equal(selectPrice(chicken, STORE, { prices: [special, shelf], today: TODAY }).record.price_cents, 1100);
  assert.equal(selectPrice(chicken, STORE, { prices: [special, shelf], today: TODAY, includeSpecials: true }).record.price_cents, 600);
  const expired = { ...special, valid_to: '2026-10-21' };
  assert.equal(selectPrice(chicken, STORE, { prices: [expired], today: TODAY, includeSpecials: true }).tier, 'unpriced');
  assert.throws(() => selectPrice(chicken, STORE, { prices: [shelf] }), /today/);
});

test('confidence rubric', () => {
  assert.equal(maxConfidence(rec(), TODAY), 'high');
  assert.equal(maxConfidence(rec({ observed: '2026-10-01' }), TODAY), 'medium');
  assert.equal(maxConfidence(rec({ channel: 'search_snippet' }), TODAY), 'medium');
  assert.equal(maxConfidence(rec({ channel: 'other' }), TODAY), 'low');
});

test('checkSnapshot finds quote and price through HTML/JSON noise', () => {
  const html = '<span class="price">$11.00</span><div>$11.00&nbsp;/ 1KG</div>';
  assert.deepEqual(checkSnapshot(rec({ quote: '$11.00 / 1KG' }), html), []);
  const json = '{"Price": 6.6, "CupString": "$0.55 / 1EA"}';
  assert.deepEqual(checkSnapshot(rec({ price_cents: 660, quote: '"CupString": "$0.55 / 1EA"' }), json), []);
  const bad = checkSnapshot(rec({ price_cents: 1000, quote: '$10.00 / 1KG' }), html);
  assert.equal(bad.length, 2);
  // 1.10 must not match inside 11.10
  assert.ok(checkSnapshot(rec({ price_cents: 110, quote: 'Price' }), 'Price 11.10').some((p) => p.includes('price')));
});
