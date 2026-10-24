// Data-file validation (pure). Used by scripts/validate-data.mjs and tests.
// Schemas are documented in docs/DATA.md and docs/SOURCING.md.
import { confidenceAllowed, unitPriceCents, toBase, SNAPSHOT_CHANNELS } from './prices.js';

const BASES = new Set(['g', 'ml', 'each']);
const UNITS = new Set(['g', 'kg', 'ml', 'l', 'each']);
const CATEGORIES = new Set(['protein', 'dairy', 'produce', 'carbs', 'pantry']);
const BASIS = new Set(['per_kg', 'per_l', 'per_pack', 'per_each']);
const PRICE_TYPES = new Set(['shelf', 'special', 'member']);
const CHANNELS = new Set(['online', 'instore', 'catalogue', 'aggregator', 'search_snippet', 'other']);
const CONF = new Set(['high', 'medium', 'low']);
const STORE_FORMATS = new Set(['full', 'small', 'metro']);
const TRAVEL_MODES = new Set(['walk', 'bus', 'light_rail', 'mixed']);
const RECIPE_KINDS = new Set(['dinner', 'breakfast', 'snack', 'fallback']);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SNAPSHOT_DIR = 'data/sourcing/snapshots/';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

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
    const at = `ingredient ${i.id}`;
    if (!BASES.has(i.base)) errors.push(`${at}: base must be g|ml|each`);
    if (!CATEGORIES.has(i.category)) errors.push(`${at}: bad category ${i.category}`);
    if (!i.spec) errors.push(`${at}: missing spec`);
    if (i.base === 'each' && !(i.each_g > 0)) errors.push(`${at}: base "each" needs each_g`);
    if (!isNum(i.weekly_qty_estimate) || i.weekly_qty_estimate < 0) errors.push(`${at}: weekly_qty_estimate must be a number >= 0`);
    if (i.nutrition_per_100g != null) {
      const n = i.nutrition_per_100g;
      if (!isNum(n.kcal) || !isNum(n.protein_g)) errors.push(`${at}: nutrition_per_100g needs numeric kcal and protein_g`);
      if (!i.nutrition_source) errors.push(`${at}: nutrition_per_100g needs nutrition_source`);
    }
  }
  return errors;
}

export function validateStores(doc) {
  const errors = [];
  if (doc.schemaVersion !== 1) errors.push('stores: schemaVersion must be 1');
  uniqueIds(doc.stores ?? [], 'stores', errors);
  for (const s of doc.stores ?? []) {
    const at = `store ${s.id}`;
    if (!s.chain) errors.push(`${at}: chain required`);
    if (s.format != null && !STORE_FORMATS.has(s.format)) errors.push(`${at}: format must be full|small|metro|null`);
    if (s.travel != null) {
      if (!TRAVEL_MODES.has(s.travel.mode)) errors.push(`${at}: travel.mode must be walk|bus|light_rail|mixed`);
      if (!(s.travel.minutes > 0)) errors.push(`${at}: travel.minutes must be > 0`);
    }
    if (s.verified === true) {
      if (s.travel == null) errors.push(`${at}: verified store needs travel`);
      if (!/^https?:\/\//.test(s.source_url ?? '')) errors.push(`${at}: verified store needs source_url`);
    }
  }
  return errors;
}

// Validate price records (a round file's `records` or prices.json `prices`).
// allowedRounds restricts the `round` field (prices.json: [2, 3]).
export function validatePriceRecords(records, { ingredients, stores, today, label = 'prices', allowedRounds = [1, 2, 3] }) {
  const errors = [];
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  const storeIds = new Set(stores.map((s) => s.id));
  records.forEach((r, n) => {
    const at = `${label}[${n}] ${r.ingredient_id}@${r.store_id}`;
    if (!ing.has(r.ingredient_id)) errors.push(`${at}: unknown ingredient_id`);
    if (!storeIds.has(r.store_id)) errors.push(`${at}: unknown store_id`);
    if (!allowedRounds.includes(r.round)) errors.push(`${at}: round must be one of ${allowedRounds.join('|')}`);
    if (!Number.isInteger(r.price_cents) || r.price_cents <= 0) errors.push(`${at}: price_cents must be a positive integer`);
    if (!BASIS.has(r.price_basis)) errors.push(`${at}: bad price_basis`);
    if (r.price_basis === 'per_pack') {
      if (!UNITS.has(r.pack?.unit)) errors.push(`${at}: per_pack needs pack.unit g|kg|ml|l|each`);
      if (r.pack?.variable && !(r.pack.qty_max > 0)) errors.push(`${at}: variable pack needs qty_max`);
    }
    if (!PRICE_TYPES.has(r.price_type)) errors.push(`${at}: bad price_type`);
    if (r.price_type !== 'shelf' && !DATE_RE.test(r.valid_to ?? '')) errors.push(`${at}: specials/member prices need valid_to`);
    if (!CHANNELS.has(r.channel)) errors.push(`${at}: bad channel`);
    if (!DATE_RE.test(r.observed ?? '')) errors.push(`${at}: observed must be YYYY-MM-DD`);
    else if (today && r.observed > today) errors.push(`${at}: observed is in the future`);
    if (!/^https?:\/\//.test(r.source_url ?? '')) errors.push(`${at}: source_url required`);
    if (!r.quote || r.quote.length < 4) errors.push(`${at}: verbatim quote required`);
    if (typeof r.sku_matches_spec !== 'boolean') errors.push(`${at}: sku_matches_spec must be true|false`);
    else if (!r.sku_matches_spec && !r.notes) errors.push(`${at}: sku_matches_spec=false needs notes`);
    if (SNAPSHOT_CHANNELS.has(r.channel) && !(r.snapshot ?? '').startsWith(SNAPSHOT_DIR)) {
      errors.push(`${at}: channel ${r.channel} needs snapshot under ${SNAPSHOT_DIR}`);
    }
    if (!CONF.has(r.confidence)) errors.push(`${at}: bad confidence`);
    else if (today && DATE_RE.test(r.observed ?? '') && !confidenceAllowed(r, today)) {
      errors.push(`${at}: confidence "${r.confidence}" exceeds rubric`);
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
  if (!Array.isArray(doc.not_found)) errors.push(`${label}: not_found array required (may be empty)`);
  const ingIds = new Set(ctx.ingredients.map((i) => i.id));
  const storeIds = new Set(ctx.stores.map((s) => s.id));
  for (const nf of doc.not_found ?? []) {
    if (!ingIds.has(nf.ingredient_id) || !storeIds.has(nf.store_id) || !nf.reason) {
      errors.push(`${label}: not_found entry needs known ingredient_id, store_id and a reason: ${JSON.stringify(nf)}`);
    }
  }
  if (doc.round === 3 && !Array.isArray(doc.decisions)) errors.push(`${label}: round 3 needs decisions array`);
  errors.push(...validatePriceRecords(doc.records ?? [], { ...ctx, today: doc.run_date, label, allowedRounds: [doc.round] }));
  return errors;
}

export function validateRecipes(doc, { ingredients }) {
  const errors = [];
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  if (doc.schemaVersion !== 1) errors.push('recipes: schemaVersion must be 1');
  uniqueIds(doc.recipes ?? [], 'recipes', errors);
  for (const r of doc.recipes ?? []) {
    const at = `recipe ${r.id}`;
    if (!RECIPE_KINDS.has(r.kind)) errors.push(`${at}: kind must be dinner|breakfast|snack|fallback`);
    if (!Number.isInteger(r.servings) || r.servings < 1) errors.push(`${at}: servings must be an integer >= 1`);
    if (r.kind === 'dinner' && r.servings !== 2) errors.push(`${at}: dinners make 2 servings (2nd = next-day lunch)`);
    if (!isNum(r.minutes)) errors.push(`${at}: minutes required`);
    else if (r.kind === 'dinner' && r.minutes > 30) errors.push(`${at}: dinner over 30 min`);
    else if (r.kind === 'fallback' && r.minutes > 15) errors.push(`${at}: fallback over 15 min`);
    if (r.kind === 'dinner' && ![1, 2, 3].includes(r.perishability)) errors.push(`${at}: perishability 1|2|3 required`);
    if (!Array.isArray(r.ingredients) || !r.ingredients.length) errors.push(`${at}: ingredients required`);
    for (const line of r.ingredients ?? []) {
      const i = ing.get(line.ingredient_id);
      if (!i) errors.push(`${at}: unknown ingredient ${line.ingredient_id}`);
      else if (!(line.qty > 0) || toBase(line.qty, line.unit, i) == null) errors.push(`${at}: ${line.ingredient_id} qty/unit not convertible to ${i.base}`);
    }
  }
  return errors;
}

export function validateHelloFresh(doc) {
  const errors = [];
  const at = `hellofresh ${doc.id}`;
  if (!/^hf-[a-z0-9-]+$/.test(doc.id ?? '')) errors.push(`${at}: id must start with hf-`);
  if (doc.source !== 'hellofresh') errors.push(`${at}: source must be hellofresh`);
  if (doc.cost_model !== 'box') errors.push(`${at}: cost_model must be box`);
  if (!Number.isInteger(doc.servings)) errors.push(`${at}: servings required`);
  const p = doc.nutrition_per_serving?.protein_g;
  if (doc.nutrition_per_serving == null || !(p === null || isNum(p))) errors.push(`${at}: nutrition_per_serving.protein_g must be a number or null`);
  return errors;
}

const DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export function validateSampleWeek(doc, { recipes }) {
  const errors = [];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const kindOk = (id, kind) => byId.get(id)?.kind === kind;
  if (doc.schemaVersion !== 1) errors.push('sample-week: schemaVersion must be 1');
  const days = new Set();
  for (const d of doc.dinners ?? []) {
    if (!DAYS.has(d.day)) errors.push(`sample-week: bad day ${d.day}`);
    if (days.has(d.day)) errors.push(`sample-week: two dinners on ${d.day}`);
    days.add(d.day);
    if (d.recipe_id != null) {
      if (!kindOk(d.recipe_id, 'dinner')) errors.push(`sample-week: ${d.day} recipe_id ${d.recipe_id} is not a dinner in recipes.json`);
    } else if (!isNum(d.hf_placeholder?.protein_g)) {
      errors.push(`sample-week: ${d.day} needs recipe_id or hf_placeholder.protein_g`);
    }
  }
  if (days.size !== 7) errors.push(`sample-week: needs 7 dinners (one per day), found ${days.size}`);
  for (const id of doc.breakfasts ?? []) if (!kindOk(id, 'breakfast')) errors.push(`sample-week: breakfast ${id} not in recipes.json`);
  for (const id of doc.snacks ?? []) if (!kindOk(id, 'snack')) errors.push(`sample-week: snack ${id} not in recipes.json`);
  if (!Array.isArray(doc.costing?.unpriced)) errors.push('sample-week: costing.unpriced array required (may be empty)');
  return errors;
}
