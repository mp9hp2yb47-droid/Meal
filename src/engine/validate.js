// Data-file validation (pure). Used by scripts/validate-data.mjs and tests.
import { confidenceAllowed, unitPriceCents } from './prices.js';

const BASES = new Set(['g', 'ml', 'each']);
const CATEGORIES = new Set(['protein', 'dairy', 'produce', 'carbs', 'pantry']);
const BASIS = new Set(['per_kg', 'per_l', 'per_pack', 'per_each']);
const PRICE_TYPES = new Set(['shelf', 'special', 'member']);
const CHANNELS = new Set(['online', 'instore', 'catalogue', 'aggregator', 'search_snippet', 'other']);
const CONF = new Set(['high', 'medium', 'low']);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uniqueIds(list, label, errors) {
  const seen = new Set();
  for (const x of list) {
    if (!ID_RE.test(x.id ?? '')) errors.push(`${label}: bad id ${JSON.stringify(x.id)}`);
    if (seen.has(x.id)) errors.push(`${label}: duplicate id ${x.id}`);
    seen.add(x.id);
  }
}

export function validateIngredients(doc) {
  const errors = [];
  if (doc.schemaVersion !== 1) errors.push('ingredients: schemaVersion must be 1');
  uniqueIds(doc.ingredients ?? [], 'ingredients', errors);
  for (const i of doc.ingredients ?? []) {
    if (!BASES.has(i.base)) errors.push(`ingredient ${i.id}: base must be g|ml|each`);
    if (!CATEGORIES.has(i.category)) errors.push(`ingredient ${i.id}: bad category ${i.category}`);
    if (!i.spec) errors.push(`ingredient ${i.id}: missing spec`);
    if (i.base === 'each' && !(i.each_g > 0)) errors.push(`ingredient ${i.id}: base "each" needs each_g`);
  }
  return errors;
}

export function validateStores(doc) {
  const errors = [];
  if (doc.schemaVersion !== 1) errors.push('stores: schemaVersion must be 1');
  uniqueIds(doc.stores ?? [], 'stores', errors);
  return errors;
}

// Validate price records (a round file's `records` or prices.json `prices`).
export function validatePriceRecords(records, { ingredients, stores, today, label = 'prices' }) {
  const errors = [];
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  const storeIds = new Set(stores.map((s) => s.id));
  records.forEach((r, n) => {
    const at = `${label}[${n}] ${r.ingredient_id}@${r.store_id}`;
    if (!ing.has(r.ingredient_id)) errors.push(`${at}: unknown ingredient_id`);
    if (!storeIds.has(r.store_id)) errors.push(`${at}: unknown store_id`);
    if (!Number.isInteger(r.price_cents) || r.price_cents <= 0) errors.push(`${at}: price_cents must be a positive integer`);
    if (!BASIS.has(r.price_basis)) errors.push(`${at}: bad price_basis`);
    if (!PRICE_TYPES.has(r.price_type)) errors.push(`${at}: bad price_type`);
    if (r.price_type !== 'shelf' && !DATE_RE.test(r.valid_to ?? '')) errors.push(`${at}: specials/member prices need valid_to`);
    if (!CHANNELS.has(r.channel)) errors.push(`${at}: bad channel`);
    if (!DATE_RE.test(r.observed ?? '')) errors.push(`${at}: observed must be YYYY-MM-DD`);
    else if (today && r.observed > today) errors.push(`${at}: observed is in the future`);
    if (!/^https?:\/\//.test(r.source_url ?? '')) errors.push(`${at}: source_url required`);
    if (!r.quote || r.quote.length < 4) errors.push(`${at}: verbatim quote required`);
    if (!CONF.has(r.confidence)) errors.push(`${at}: bad confidence`);
    else if (today && DATE_RE.test(r.observed ?? '') && !confidenceAllowed(r, today)) {
      errors.push(`${at}: confidence "${r.confidence}" exceeds rubric for channel ${r.channel}`);
    }
    const i = ing.get(r.ingredient_id);
    if (i && BASIS.has(r.price_basis) && unitPriceCents(r, i) == null) {
      errors.push(`${at}: cannot normalise to ${i.base} (check pack / each_g)`);
    }
  });
  return errors;
}

export function validateRoundFile(doc, ctx) {
  const errors = [];
  const label = `round${doc.round}:${doc.agent ?? '?'}`;
  if (doc.schemaVersion !== 1) errors.push(`${label}: schemaVersion must be 1`);
  if (![1, 2, 3].includes(doc.round)) errors.push(`${label}: round must be 1|2|3`);
  if (!DATE_RE.test(doc.run_date ?? '')) errors.push(`${label}: run_date must be YYYY-MM-DD`);
  for (const r of doc.records ?? []) {
    if (r.round !== doc.round) errors.push(`${label}: record round ${r.round} != file round`);
  }
  errors.push(...validatePriceRecords(doc.records ?? [], { ...ctx, today: doc.run_date, label }));
  return errors;
}
