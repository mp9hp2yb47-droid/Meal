# Price Sourcing Protocol

How prices get into `data/prices.json`. **Never invent a price.** An item with no evidence is recorded in `not_found` and stays unpriced.

## Files

| Path | What |
|---|---|
| `data/ingredients.json` | Ingredient master: `id`, `base` (g/ml/each), `each_g`, **`spec`** (exactly what to price), `weekly_qty_estimate` |
| `data/stores.json` | Stores (Round 0 output) |
| `data/sourcing/raw/` | Raw script output (e.g. `fetch-woolworths.mjs`). Not price records. Git-ignored |
| `data/sourcing/round{1,2,3}/<agent>.json` | Round files (schema below) |
| `data/sourcing/diff.json` | `npm run diff-rounds` output |
| `data/prices.json` | Final adjudicated prices (`round: 3`) |

## Price record schema

```json
{
  "ingredient_id": "chicken-breast",
  "store_id": "woolworths-randwick",
  "sku_name": "Woolworths RSPCA Approved Chicken Breast Fillet 1.3kg - 1.7kg",
  "price_cents": 1100,
  "price_basis": "per_kg",            // per_kg | per_l | per_pack | per_each
  "pack": { "qty": 1.5, "unit": "kg", "variable": true, "qty_min": 1.3, "qty_max": 1.7 },
  "price_type": "shelf",              // shelf | special | member  (budget uses shelf)
  "valid_to": null,                   // required for special/member (YYYY-MM-DD)
  "channel": "online",                // online | instore | catalogue | aggregator | search_snippet | other
  "requires_card": false,
  "observed": "2026-10-24",
  "source_url": "https://www.woolworths.com.au/shop/productdetails/969723",
  "source_domain": "woolworths.com.au",
  "quote": "$11.00 / 1KG",            // VERBATIM text from the source supporting the price
  "confidence": "high",               // high | medium | low  (rubric below)
  "round": 1,
  "agent": "price-sourcer:proteins",
  "notes": ""
}
```

- `pack` is required for `per_pack`, and `pack.unit` may be g/kg/ml/l/each.
- Variable-weight items (meat, loose produce): use `per_kg` from the shelf/cup price, never a midpoint of a pack range. If only a range is visible, use the **max price ÷ max weight** (or state the derivation in `notes`) and cap confidence at medium.
- Multiple SKUs per ingredient+store are allowed. The diff compares the cheapest one matching the spec.

## Round file schema

```json
{ "schemaVersion": 1, "round": 1, "agent": "price-sourcer:proteins", "run_date": "2026-10-28",
  "records": [ /* price records, all with round = file round */ ],
  "not_found": [ { "ingredient_id": "tofu-firm", "store_id": "aldi-eastgardens", "reason": "no listing" } ] }
```

## Confidence rubric (enforced by `npm run validate`)

| Level | Requires |
|---|---|
| **high** | First-party channel (`online` retailer page/API or `instore` shelf/receipt), observed ≤ 7 days before the run date, unit price consistent with pack |
| **medium** | Aggregator (Grocerize, BuyWisely), catalogue, search snippet, or a first-party price older than 7 days |
| **low** | Anything else, and every conservative Round 3 resolution |

## Rounds

**Round 0: stores** (1 `price-sourcer` in store mode). Confirm the stores in `data/stores.json`: address, hours, whether it's a full-size store, and the travel mode + minutes from Botany St Kingsford (walk / bus route / L3). Add Asian grocers or butchers along Anzac Pde if they're cheaper for protein/produce. Set `verified: true` with `source_url`.

**Round 1: sourcing** (4 `price-sourcer` agents in parallel, one per category: protein, dairy, produce, carbs+pantry). Each one prices every ingredient in its category at **each chain** (Woolworths, Coles, ALDI; IGA spot-check only). Preferred sources, in order:
1. `node scripts/fetch-woolworths.mjs --all` raw candidates → pick the spec-matching SKU → product page URL + `cup_string` quote
2. WebFetch / Claude in Chrome on coles.com.au and aldi.com.au product pages (local only)
3. Aggregators: grocerize.com.au (per-100g), buywisely.com.au
4. Web search snippets (medium at best)

**Round 2: blind verification** (4 `price-verifier` agents, the same category split, **must not read round1/**). Re-source independently and **cite a different domain/channel than Round 1 where one exists** (e.g. Grocerize vs the Woolworths page, or an in-store shelf photo from the user). Confirm each Round 1 quote appears at its URL when reachable.

**Diff**: `npm run diff-rounds`. A row needs adjudication when its outcome is `disagree` (> 15% unit-price gap **or** > $1/week impact), `not_found`, `spec_mismatch`, or `sameDomain: true`.

**Round 3: adjudication** (1 `price-adjudicator`). For each flagged row: re-check both sources and pick the evidenced price. When it can't be resolved, apply `resolveConservative`: the **higher** price at low confidence. Write `data/sourcing/round3/adjudicator.json` and build `data/prices.json` from agreed Round 2 rows (round 2) plus adjudicated rows (round 3).

**Meal loop**: `meal-designer` builds the recipe pool + a sample week against `data/prices.json`; `meal-evaluator` independently re-costs it and checks protein floors, cook times, perishability ordering, pack fit and the $150 total at **shelf** price. Iterate until it passes or ≤ 3 rounds, then report the residual issues.

## Keeping prices current (after launch)

- The app's tap-to-update writes a user override (`channel: instore`, high confidence).
- Monthly: re-run Round 1 for the ~15 highest-spend items only, then diff against `prices.json`.
- Specials are recorded with `price_type: special` + `valid_to` and never change the baseline budget.
