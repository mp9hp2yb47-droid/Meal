// Shared test fixtures.
export const STORE = 'woolworths-randwick';
export const TODAY = '2026-10-24';

export const rec = (over) => ({
  ingredient_id: 'chicken-breast', store_id: STORE, sku_name: 'Chicken Breast Fillet', price_cents: 1100,
  price_basis: 'per_kg', price_type: 'shelf', valid_to: null, channel: 'online', observed: '2026-10-20',
  source_url: 'https://www.woolworths.com.au/shop/productdetails/1', quote: '$11.00 / 1KG', sku_matches_spec: true,
  snapshot: 'data/sourcing/snapshots/round1/x.html', confidence: 'high', round: 1, ...over,
});
