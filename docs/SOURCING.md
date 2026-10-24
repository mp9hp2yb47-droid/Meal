# Price Sourcing Protocol

How prices get into `data/prices.json`. **Never invent a price.** An item with no evidence is recorded in `not_found` and stays unpriced.

## Files

| Path | What |
|---|---|
| `data/ingredients.json` | Ingredient master: `id`, `base` (g/ml/each), `each_g`, **`spec`** (exactly what to price), `weekly_qty_estimate` |
| `data/stores.json` | Stores (Round 0 output) |
| `data/sourcing/snapshots/{shared,round1,round2,round3}/` | Saved evidence (raw HTML / JSON exactly as downloaded). **Git-ignored, local only**. `shared/` = `fetch-woolworths.mjs` output, **Round 1 only** |
| `data/sourcing/round{1,2}/<category>.json` | Round files, `<category>` ∈ `protein`, `dairy`, `produce`, `carbs-pantry` |
| `data/sourcing/round3/adjudicator.json` | Round 3 records + `decisions` |
| `data/sourcing/diff.json` | `npm run diff-rounds` output (full ingredient × store grid) |
| `data/prices.json` | **Built by `npm run build-prices`, never hand-edited**: Round 2 records for cleanly agreed rows + all Round 3 records |

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
  "quote": "$11.00 / 1KG",            // VERBATIM text copied from the snapshot
  "snapshot": "data/sourcing/snapshots/round1/ww-969723.html",  // required for online|catalogue|aggregator
  "sku_matches_spec": true,           // false needs notes explaining the substitution
  "confidence": "high",               // high | medium | low  (rubric below)
  "round": 1,
  "agent": "price-sourcer:protein",
  "notes": ""
}
```

- `pack` is required for `per_pack`, and `pack.unit` may be g/kg/ml/l/each.
- The source domain is derived from `source_url` (www. stripped), so there's no separate field.
- **Snapshots**: save the evidence with `curl -sL -A 'Mozilla/5.0' "<url>" -o data/sourcing/snapshots/round<N>/<slug>.html` (or the API JSON). `npm run validate -- --snapshots` fails unless the quote **and** the price (e.g. `11.00`) both appear in the snapshot. WebFetch output is model-processed, so it is **not** a snapshot. Use it to find pages, then curl them. If a page only renders with JavaScript and curl can't capture the price, use `channel: "search_snippet"` or `"other"` (no snapshot, confidence ≤ medium/low) and say so in `notes`.
- Variable-weight items (meat, loose produce): use `per_kg` from the shelf/cup price, never a midpoint of a pack range. If only a pack-price range is visible, record `per_pack` with `price_cents` = the **max price** and `pack: {variable: true, qty_min, qty_max, unit}`. The engine divides by `qty_max`, and the validator caps confidence at medium.
- Multiple SKUs per ingredient+store are allowed. The diff compares the cheapest one matching the spec.

## Round file schema

```json
{ "schemaVersion": 1, "round": 1, "agent": "price-sourcer:protein", "run_date": "2026-10-28",
  "records": [ /* price records, all with round = file round */ ],
  "not_found": [ { "ingredient_id": "tofu-firm", "store_id": "aldi-eastgardens", "reason": "no listing" } ],
  "decisions": [ "round 3 only: one line per adjudicated row" ] }
```

## Confidence rubric (enforced by `npm run validate`)

| Level | Requires |
|---|---|
| **high** | First-party channel (`online` retailer page/API or `instore` shelf/receipt), observed ≤ 7 days before the run date, not a variable-pack range |
| **medium** | Aggregator (Grocerize, BuyWisely), catalogue, search snippet, or a first-party price older than 7 days |
| **low** | Anything else, and every conservative Round 3 resolution |

## Rounds

**Round 0: stores** (1 `price-sourcer` in Round 0 mode). Edit `data/stores.json` in place. Each store:
`{ "id", "name", "chain", "format": "full|small|metro|null", "address", "hours", "travel": { "mode": "walk|bus|light_rail|mixed", "minutes": 12, "route": "L3 Kingsford → ..." } | null, "verified": true, "source_url", "notes" }`.
Travel is from Botany St Kingsford. Add Asian grocers or butchers along Anzac Pde if they look cheaper for protein/produce. Set `verified: true` only with travel + `source_url`.

**Store grid for Rounds 1–2** (after Round 0, the main session writes it into each agent prompt): the nearest verified full-size **Woolworths** and **Coles** (Randwick if full-size, otherwise Eastgardens), plus `aldi-eastgardens`. `iga-kingsford` gets a spot-check of the ~10 highest-spend items only.

**Round 1: sourcing** (4 `price-sourcer` agents in parallel: protein, dairy, produce, carbs-pantry). Each one prices every ingredient in its category at every store in the grid. Preferred sources, in order:
1. `data/sourcing/snapshots/shared/woolworths-search-<date>.json` (from `npm run fetch:woolworths -- --all`): pick the spec-matching SKU, quote its `cup_string` line, `snapshot` = that file
2. curl'd first-party product pages (coles.com.au, aldi.com.au, woolworths.com.au)
3. curl'd aggregators: grocerize.com.au (per-100g), buywisely.com.au
4. Web search snippets (`search_snippet`, medium at best, no snapshot)

If a site blocks curl, the agent records `not_found` with reason `"blocked"`. The main session can then capture the page with Claude in Chrome (if available) and save its text as a snapshot.

**Round 2: blind verification** (4 `price-verifier` agents, the same category split). They **must not read** `round1/`, `snapshots/shared/`, `snapshots/round1/` or `diff.json`, and save snapshots to `snapshots/round2/`. Re-source independently, **preferring a different domain** from the obvious first-party page.

**Quote check (main session, after Round 1 and Round 2)**: `npm run validate -- --snapshots`. This is the anti-fabrication gate: any record whose quote or price isn't in its snapshot fails. Fix by re-sourcing, or downgrade to `not_found`.

**Diff**: `npm run diff-rounds`. A row needs adjudication when its outcome is `disagree` (> 15% unit-price gap **or** > $1/week impact), `not_found`, `missing` (neither round priced it), `spec_mismatch`, `sameDomain: true` or `copied: true` (Round 2 reused Round 1's URL + quote).

**Round 3: adjudication** (1 `price-adjudicator`). For each flagged row: re-check both sources and pick the evidenced price (a fresh snapshot under `snapshots/round3/`). When it can't be resolved, apply `resolveConservative`: the **higher** price (or the only side) at low confidence. `missing` rows: try once; otherwise leave them unpriced. Write `round3/adjudicator.json` with `decisions`, then `npm run build-prices` and `npm run validate -- --snapshots`.

**Meal loop** (orchestrated by the main session): `meal-designer` builds the recipe pool + a sample week against `data/prices.json` (schemas: `docs/DATA.md`); `meal-evaluator` independently re-costs it and checks protein floors, cook times, perishability ordering, pack fit and the $150 total at **shelf** price. The main session passes the latest `docs/reviews/meal-eval-*.md` to the designer on each iteration. Stop when it passes or after 3 iterations, then report the residual issues.

## Keeping prices current (after launch)

- The app's tap-to-update writes a user override: a price record with `channel: "instore"`, `quote: "user shelf entry"`, `setAt` and `baseVersion` (the latest one per store wins).
- Monthly: re-run Round 1 for the ~15 highest-spend items only, then Round 2/3 for the ones that moved more than 15%.
- Specials are recorded with `price_type: special` + `valid_to` and never change the baseline budget.
