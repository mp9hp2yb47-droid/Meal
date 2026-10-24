import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePriceRecords, validateRoundFile, validateStores, validateIngredients, validateRecipes, validateHelloFresh, validateSampleWeek,
} from '../src/engine/validate.js';
import { rec } from './fixtures.js';

const chicken = { id: 'chicken-breast', name: 'c', category: 'protein', base: 'g', spec: 's', weekly_qty_estimate: 800, nutrition_per_100g: null };
const ctx = { ingredients: [chicken], stores: [{ id: 'woolworths-randwick', chain: 'woolworths' }], today: '2026-10-24' };

test('a well-formed record passes', () => {
  assert.deepEqual(validatePriceRecords([rec()], ctx), []);
});

test('missing provenance, over-claimed confidence and specials without valid_to fail', () => {
  const errs = validatePriceRecords([rec({ quote: '', channel: 'search_snippet', price_type: 'special', sku_matches_spec: undefined })], ctx);
  for (const s of ['quote', 'exceeds rubric', 'valid_to', 'sku_matches_spec']) assert.ok(errs.some((e) => e.includes(s)), s);
});

test('snapshot required for online/aggregator/catalogue channels', () => {
  assert.ok(validatePriceRecords([rec({ snapshot: null })], ctx).some((e) => e.includes('snapshot')));
  assert.deepEqual(validatePriceRecords([rec({ channel: 'search_snippet', snapshot: null, confidence: 'medium' })], ctx), []);
});

test('variable pack at high confidence is rejected', () => {
  const r = rec({ observed: '2026-10-24', price_basis: 'per_pack', price_cents: 1870, pack: { qty: 1.5, unit: 'kg', variable: true, qty_max: 1.7 } });
  assert.ok(validatePriceRecords([r], ctx).some((e) => e.includes('exceeds rubric')));
});

test('prices.json only accepts rounds 2 and 3', () => {
  assert.ok(validatePriceRecords([rec({ round: 1 })], { ...ctx, allowedRounds: [2, 3] }).some((e) => e.includes('round')));
});

test('round files: round match, not_found shape, round 3 decisions', () => {
  const base = { schemaVersion: 1, run_date: '2026-10-24', agent: 't', not_found: [] };
  assert.ok(validateRoundFile({ ...base, round: 2, records: [rec()] }, ctx).some((e) => e.includes('round must be one of 2')));
  assert.ok(validateRoundFile({ ...base, round: 1, records: [], not_found: [{ ingredient_id: 'x', store_id: 'woolworths-randwick' }] }, ctx).some((e) => e.includes('not_found')));
  assert.ok(validateRoundFile({ ...base, round: 3, records: [] }, ctx).some((e) => e.includes('decisions')));
  assert.deepEqual(validateRoundFile({ ...base, round: 1, records: [rec()] }, ctx), []);
});

test('verified stores need travel and a source', () => {
  const errs = validateStores({ schemaVersion: 1, stores: [{ id: 'a', chain: 'aldi', verified: true, travel: null }] });
  assert.ok(errs.some((e) => e.includes('travel')));
  assert.ok(errs.some((e) => e.includes('source_url')));
  assert.deepEqual(validateStores({ schemaVersion: 1, stores: [{ id: 'a', chain: 'aldi', verified: true, travel: { mode: 'bus', minutes: 20 }, source_url: 'https://x.y' }] }), []);
});

test('ingredients need weekly_qty_estimate and sourced nutrition', () => {
  assert.ok(validateIngredients({ schemaVersion: 1, ingredients: [{ ...chicken, weekly_qty_estimate: undefined }] }).some((e) => e.includes('weekly_qty_estimate')));
  assert.ok(validateIngredients({ schemaVersion: 1, ingredients: [{ ...chicken, nutrition_per_100g: { kcal: 106, protein_g: 23 } }] }).some((e) => e.includes('nutrition_source')));
});

test('recipes: dinners are 2 servings, <= 30 min, known convertible ingredients', () => {
  const dinner = { id: 'd', kind: 'dinner', servings: 2, minutes: 25, perishability: 2, ingredients: [{ ingredient_id: 'chicken-breast', qty: 0.3, unit: 'kg' }] };
  assert.deepEqual(validateRecipes({ schemaVersion: 1, recipes: [dinner] }, ctx), []);
  const errs = validateRecipes({ schemaVersion: 1, recipes: [{ ...dinner, servings: 4, minutes: 45, ingredients: [{ ingredient_id: 'chicken-breast', qty: 1, unit: 'each' }] }] }, ctx);
  for (const s of ['2 servings', '30 min', 'not convertible']) assert.ok(errs.some((e) => e.includes(s)), s);
});

test('hellofresh docs: box cost model and nullable protein', () => {
  const hf = { id: 'hf-x-1', source: 'hellofresh', cost_model: 'box', servings: 2, nutrition_per_serving: { protein_g: null } };
  assert.deepEqual(validateHelloFresh(hf), []);
  assert.ok(validateHelloFresh({ ...hf, cost_model: 'grocery', nutrition_per_serving: { protein_g: 0 / 0 } }).length >= 2);
});

test('sample week: 7 dinners, known recipes of the right kind, unpriced list', () => {
  const recipes = [{ id: 'd1', kind: 'dinner' }, { id: 'b1', kind: 'breakfast' }, { id: 's1', kind: 'snack' }];
  const days = ['wed', 'thu', 'fri', 'sat'].map((day) => ({ day, recipe_id: 'd1' }));
  const hf = ['sun', 'mon', 'tue'].map((day) => ({ day, hf_placeholder: { protein_g: 35 } }));
  const ok = { schemaVersion: 1, dinners: [...days, ...hf], breakfasts: ['b1'], snacks: ['s1'], costing: { unpriced: [] } };
  assert.deepEqual(validateSampleWeek(ok, { recipes }), []);
  const errs = validateSampleWeek({ ...ok, dinners: [...days.slice(1), { day: 'thu', recipe_id: 'b1' }], snacks: ['nope'], costing: {} }, { recipes });
  for (const s of ['two dinners', 'not a dinner', 'needs 7', 'snack nope', 'unpriced']) assert.ok(errs.some((e) => e.includes(s)), s);
});
