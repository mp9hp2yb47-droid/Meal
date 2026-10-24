// Price maths shared by the sourcing pipeline (scripts/) and the app engine.
// Pure functions: no I/O, no Date.now(). Money is integer cents; quantities are
// in the ingredient's base unit (g | ml | each).

export const FIRST_PARTY_CHANNELS = new Set(['online', 'instore']);
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

// Convert a quantity in `unit` to the ingredient's base unit, or null if impossible.
export function toBase(qty, unit, ingredient) {
  const base = ingredient.base;
  if (unit === base) return qty;
  if (unit === 'kg' && base === 'g') return qty * 1000;
  if (unit === 'l' && base === 'ml') return qty * 1000;
  if (unit === 'each' && base === 'g' && ingredient.each_g) return qty * ingredient.each_g;
  if (unit === 'g' && base === 'each' && ingredient.each_g) return qty / ingredient.each_g;
  if (unit === 'kg' && base === 'each' && ingredient.each_g) return (qty * 1000) / ingredient.each_g;
  if (unit === 'ml' && base === 'g' && ingredient.density_g_per_ml) return qty * ingredient.density_g_per_ml;
  return null;
}

// Cents per one base unit (per g, per ml or per each). Returns null when the
// record can't be normalised for this ingredient (treated as spec_mismatch).
export function unitPriceCents(record, ingredient) {
  const { price_cents: cents, price_basis: basis, pack } = record;
  if (!Number.isInteger(cents) || cents <= 0) return null;
  let perQty;
  switch (basis) {
    case 'per_kg': perQty = toBase(1, 'kg', ingredient); break;
    case 'per_l': perQty = toBase(1, 'l', ingredient); break;
    case 'per_each': perQty = toBase(1, 'each', ingredient); break;
    case 'per_pack':
      if (!pack || !(pack.qty > 0)) return null;
      perQty = toBase(pack.qty, pack.unit, ingredient);
      break;
    default: return null;
  }
  return perQty ? cents / perQty : null;
}

function ageDays(observed, today) {
  return Math.round((Date.parse(today) - Date.parse(observed)) / 86_400_000);
}

// Highest confidence a record is allowed to claim under the rubric in docs/SOURCING.md.
export function maxConfidence(record, today) {
  if (FIRST_PARTY_CHANNELS.has(record.channel) && record.observed && ageDays(record.observed, today) <= 7) {
    return 'high';
  }
  if (['online', 'instore', 'catalogue', 'aggregator', 'search_snippet'].includes(record.channel)) return 'medium';
  return 'low';
}

export function confidenceAllowed(record, today) {
  return CONFIDENCE_RANK[record.confidence] <= CONFIDENCE_RANK[maxConfidence(record, today)];
}

// Compare two price records for the same ingredient+store.
// Flags when unit prices differ by more than pctThreshold OR the weekly budget
// impact exceeds weeklyImpactCents.
export function compareRecords(a, b, ingredient, { pctThreshold = 0.15, weeklyImpactCents = 100 } = {}) {
  if (!a || !b) return { outcome: 'not_found' };
  const ua = unitPriceCents(a, ingredient);
  const ub = unitPriceCents(b, ingredient);
  if (ua == null || ub == null) return { outcome: 'spec_mismatch' };
  const lo = Math.min(ua, ub);
  const hi = Math.max(ua, ub);
  const pctDiff = (hi - lo) / lo;
  const impact = Math.round((hi - lo) * (ingredient.weekly_qty_estimate || 0));
  const flagged = pctDiff > pctThreshold || impact > weeklyImpactCents;
  return { outcome: flagged ? 'disagree' : 'agree', pctDiff, weeklyImpactCents: impact };
}

// Shelf prices only: specials are upside and must not drive the budget.
function shelfOnly(records) {
  return records.filter((r) => (r.price_type ?? 'shelf') === 'shelf');
}

const key = (r) => `${r.ingredient_id}@${r.store_id}`;

// Diff Round 1 against Round 2 (blind re-sourcing). One row per ingredient+store
// seen in either round. When a round has several SKUs, the cheapest normalised
// shelf price is compared.
export function diffRounds(round1, round2, ingredients, opts) {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const best = (records) => {
    const m = new Map();
    for (const r of shelfOnly(records)) {
      const ing = byId.get(r.ingredient_id);
      if (!ing) continue;
      const u = unitPriceCents(r, ing);
      const cur = m.get(key(r));
      if (!cur || (u != null && (cur.u == null || u < cur.u))) m.set(key(r), { r, u });
    }
    return m;
  };
  const b1 = best(round1);
  const b2 = best(round2);
  const keys = [...new Set([...b1.keys(), ...b2.keys()])].sort();
  return keys.map((k) => {
    const a = b1.get(k)?.r;
    const b = b2.get(k)?.r;
    const [ingredient_id, store_id] = k.split('@');
    const res = compareRecords(a, b, byId.get(ingredient_id), opts);
    const sameDomain = a && b && a.source_domain && a.source_domain === b.source_domain;
    return { ingredient_id, store_id, ...res, sameDomain: Boolean(sameDomain), round1: a ?? null, round2: b ?? null };
  });
}

// Conservative resolution for an unresolved disagreement: keep the higher unit
// price and mark it low confidence (budget against a ceiling, not a midpoint).
export function resolveConservative(a, b, ingredient) {
  const ua = unitPriceCents(a, ingredient);
  const ub = unitPriceCents(b, ingredient);
  const pick = ub != null && (ua == null || ub > ua) ? b : a;
  return { ...pick, confidence: 'low', round: 3, notes: [pick.notes, 'unresolved R1/R2 disagreement: took higher price'].filter(Boolean).join('; ') };
}

// Price precedence used by the app:
// user override (store-scoped) > adjudicated final (round 3) > R2-agreed (round 2)
// > single source (round 1) > category fallback. Expired specials are dropped.
// Returns { record, tier } or { record: null, tier: 'unpriced' }.
export function selectPrice(ingredientId, storeId, { overrides = [], prices = [], fallbacks = [], today }) {
  const live = (r) => !(r.price_type && r.price_type !== 'shelf' && r.valid_to && r.valid_to < today);
  const match = (r) => r.ingredient_id === ingredientId && (storeId == null || r.store_id === storeId) && live(r);
  const tiers = [
    ['override', overrides.filter(match)],
    ['final', prices.filter((r) => match(r) && r.round === 3)],
    ['agreed', prices.filter((r) => match(r) && r.round === 2)],
    ['single', prices.filter((r) => match(r) && (r.round === 1 || r.round == null))],
    ['fallback', fallbacks.filter((r) => r.ingredient_id === ingredientId)],
  ];
  for (const [tier, rs] of tiers) {
    if (rs.length) {
      const latest = rs.reduce((x, y) => ((y.setAt ?? y.observed ?? '') > (x.setAt ?? x.observed ?? '') ? y : x));
      return { record: latest, tier };
    }
  }
  return { record: null, tier: 'unpriced' };
}
