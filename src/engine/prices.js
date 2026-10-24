// Price maths shared by the sourcing pipeline (scripts/) and the app engine.
// Pure functions: no I/O, no Date.now(). Money is integer cents; quantities are
// in the ingredient's base unit (g | ml | each).

export const FIRST_PARTY_CHANNELS = new Set(['online', 'instore']);
// Channels whose evidence is a saved page/API response (data/sourcing/snapshots/).
export const SNAPSHOT_CHANNELS = new Set(['online', 'catalogue', 'aggregator']);
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

// Host of a URL without "www.", or null.
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

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
// Variable-weight packs priced per pack use qty_max: price_cents must then be
// the max-pack price (docs/SOURCING.md), giving the shelf per-kg rate.
export function unitPriceCents(record, ingredient) {
  const { price_cents: cents, price_basis: basis, pack } = record;
  if (!Number.isInteger(cents) || cents <= 0) return null;
  let perQty;
  switch (basis) {
    case 'per_kg': perQty = toBase(1, 'kg', ingredient); break;
    case 'per_l': perQty = toBase(1, 'l', ingredient); break;
    case 'per_each': perQty = toBase(1, 'each', ingredient); break;
    case 'per_pack': {
      const qty = pack?.variable ? pack.qty_max : pack?.qty;
      if (!(qty > 0)) return null;
      perQty = toBase(qty, pack.unit, ingredient);
      break;
    }
    default: return null;
  }
  return perQty ? cents / perQty : null;
}

function ageDays(observed, today) {
  return Math.round((Date.parse(today) - Date.parse(observed)) / 86_400_000);
}

// Highest confidence a record may claim under the rubric in docs/SOURCING.md.
export function maxConfidence(record, today) {
  const firstPartyFresh = FIRST_PARTY_CHANNELS.has(record.channel) && record.observed && ageDays(record.observed, today) <= 7;
  if (firstPartyFresh && !(record.price_basis === 'per_pack' && record.pack?.variable)) return 'high';
  if (['online', 'instore', 'catalogue', 'aggregator', 'search_snippet'].includes(record.channel)) return 'medium';
  return 'low';
}

export function confidenceAllowed(record, today) {
  return CONFIDENCE_RANK[record.confidence] <= CONFIDENCE_RANK[maxConfidence(record, today)];
}

// Normalise page text for quote matching: strip tags/JSON escapes, decode the
// common entities, collapse whitespace, lower-case.
export function normaliseText(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\u0024/gi, '$').replace(/\\"/g, '"').replace(/\\n/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;|&dollar;/g, '$')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Check a record's evidence against the saved snapshot text: the quote must
// appear, and so must the price (as 11.00, 11.5 or, for whole dollars, 11).
// Returns a list of problems (empty = OK).
export function checkSnapshot(record, snapshotText) {
  const problems = [];
  const hay = normaliseText(snapshotText);
  if (!hay.includes(normaliseText(record.quote))) problems.push('quote not found in snapshot');
  const dollars = record.price_cents / 100;
  const forms = new Set([dollars.toFixed(2), String(dollars)]);
  const found = [...forms].some((f) => new RegExp(`(^|[^0-9.])${f.replace('.', '\\.')}([^0-9]|$)`).test(hay));
  if (!found) problems.push(`price ${dollars.toFixed(2)} not found in snapshot`);
  return problems;
}

// Compare two price records for the same ingredient+store.
// Flags when unit prices differ by more than pctThreshold OR the weekly budget
// impact exceeds weeklyImpactCents.
export function compareRecords(a, b, ingredient, { pctThreshold = 0.15, weeklyImpactCents = 100 } = {}) {
  if (!a && !b) return { outcome: 'missing' };
  if (!a || !b) return { outcome: 'not_found' };
  const ua = unitPriceCents(a, ingredient);
  const ub = unitPriceCents(b, ingredient);
  if (ua == null || ub == null) return { outcome: 'spec_mismatch' };
  const lo = Math.min(ua, ub);
  const hi = Math.max(ua, ub);
  const pctDiff = (hi - lo) / lo;
  const impact = Math.round((hi - lo) * ingredient.weekly_qty_estimate);
  const flagged = pctDiff > pctThreshold || impact > weeklyImpactCents;
  return { outcome: flagged ? 'disagree' : 'agree', pctDiff, weeklyImpactCents: impact };
}

const isShelf = (r) => (r.price_type ?? 'shelf') === 'shelf';
const key = (ingredientId, storeId) => `${ingredientId}@${storeId}`;

// Cheapest normalisable record in a list (null if none).
function cheapest(records, ingredient) {
  let best = null;
  for (const r of records) {
    const u = unitPriceCents(r, ingredient);
    if (u != null && (best == null || u < best.u)) best = { r, u };
  }
  return best?.r ?? null;
}

// Diff Round 1 against Round 2 (blind re-sourcing) over the full
// ingredient x store grid, so pairs both rounds missed are reported too.
// Shelf prices only; the cheapest spec-matching SKU per round is compared.
export function diffRounds(round1, round2, ingredients, storeIds, opts) {
  const usable = (r) => isShelf(r) && r.sku_matches_spec !== false;
  const group = (records) => {
    const m = new Map();
    for (const r of records.filter(usable)) {
      const k = key(r.ingredient_id, r.store_id);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const g1 = group(round1);
  const g2 = group(round2);
  const rows = [];
  for (const ing of ingredients) {
    for (const storeId of storeIds) {
      const k = key(ing.id, storeId);
      const a = cheapest(g1.get(k) ?? [], ing) ?? g1.get(k)?.[0] ?? null;
      const b = cheapest(g2.get(k) ?? [], ing) ?? g2.get(k)?.[0] ?? null;
      const res = compareRecords(a, b, ing, opts);
      const sameDomain = Boolean(a && b && domainOf(a.source_url) === domainOf(b.source_url));
      const copied = Boolean(a && b && a.source_url === b.source_url && normaliseText(a.quote) === normaliseText(b.quote));
      rows.push({ ingredient_id: ing.id, store_id: storeId, ...res, sameDomain, copied, round1: a, round2: b });
    }
  }
  return rows;
}

export const needsAdjudication = (row) => row.outcome !== 'agree' || row.sameDomain || row.copied;

// Conservative resolution for an unresolved row: keep the higher unit price
// (or the only side present) at low confidence. Returns null if neither side exists.
export function resolveConservative(a, b, ingredient) {
  if (!a && !b) return null;
  const ua = a ? unitPriceCents(a, ingredient) : null;
  const ub = b ? unitPriceCents(b, ingredient) : null;
  const pick = !a ? b : !b ? a : ub != null && (ua == null || ub > ua) ? b : a;
  const why = a && b ? 'unresolved R1/R2 disagreement: took higher price' : 'single source only';
  return { ...pick, confidence: 'low', round: 3, notes: [pick.notes, why].filter(Boolean).join('; ') };
}

// Final prices.json rows: the Round 2 record for every cleanly agreed row,
// plus every Round 3 (adjudicated) record. Round 3 wins for its pair.
export function buildFinalPrices(diffRows, round3Records) {
  const adjudicated = new Set(round3Records.map((r) => key(r.ingredient_id, r.store_id)));
  const agreed = diffRows
    .filter((row) => !needsAdjudication(row) && !adjudicated.has(key(row.ingredient_id, row.store_id)))
    .map((row) => ({ ...row.round2, round: 2 }));
  return [...agreed, ...round3Records.map((r) => ({ ...r, round: 3 }))];
}

// Price used by the app for an ingredient at a store (storeId null = any store).
// Precedence: user override > adjudicated (round 3) > agreed (round 2) >
// single-source (round 1, only present after a monthly refresh). Within a tier
// the cheapest unit price wins. Budget mode (default) uses shelf prices only;
// includeSpecials adds live specials (valid_to >= today) for the specials radar.
// Returns { record, tier } or { record: null, tier: 'unpriced' } (never $0).
export function selectPrice(ingredient, storeId, { overrides = [], prices = [], today, includeSpecials = false }) {
  if (!today) throw new Error('selectPrice: today is required');
  const live = (r) => isShelf(r) || (includeSpecials && r.valid_to && r.valid_to >= today);
  const match = (r) => r.ingredient_id === ingredient.id && (storeId == null || r.store_id === storeId) && live(r);
  // Overrides: the latest one per store counts (the user re-priced it in store).
  const latestOverrides = [...overrides.filter(match).reduce((m, r) => {
    const cur = m.get(r.store_id);
    if (!cur || (r.setAt ?? '') > (cur.setAt ?? '')) m.set(r.store_id, r);
    return m;
  }, new Map()).values()];
  const tiers = [
    ['override', latestOverrides],
    ['final', prices.filter((r) => match(r) && r.round === 3)],
    ['agreed', prices.filter((r) => match(r) && r.round === 2)],
    ['single', prices.filter((r) => match(r) && r.round === 1)],
  ];
  for (const [tier, rs] of tiers) {
    const record = cheapest(rs, ingredient);
    if (record) return { record, tier };
  }
  return { record: null, tier: 'unpriced' };
}
