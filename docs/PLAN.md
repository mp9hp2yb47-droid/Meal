# Kingsford Meal Planner: Initial Plan (v0.1, draft for verification)

## 1. Brief (from the user's answers)

| Constraint | Value |
|---|---|
| Location | Botany St area, Kingsford NSW 2032 (next to UNSW Kensington) |
| Grocery budget | **$150 AUD/week**, groceries only. HelloFresh is paid separately |
| HelloFresh | 3 recipes/week, 2-person size |
| Eaters | 1 (solo) |
| Meals covered | Breakfast, lunch, dinner, snacks, 7 days |
| Diet | No restrictions, **high protein** |
| Transport | Walking + bus/light rail (L2/L3 Kingsford line, buses to Eastgardens/Randwick/Maroubra) |
| Cooking | Full kitchen, **quick nightly cooks (20–30 min)**, no long batch sessions |
| App | Installable offline **phone web app (PWA)** |
| HelloFresh integration | Undecided, so research the options first |

## 2. Weekly framework (the repeating plan)

### 2.1 Meal slots per week (21 main slots + snacks)

| Slot | Count | Source |
|---|---|---|
| HelloFresh dinners | 3 | HF box |
| HF leftover lunches (2nd portion) | 3 | HF box (free, already paid) |
| Home-cooked dinners | 4 | Groceries, each cooked as **2 portions** |
| Home-cooked leftover lunches | 4 | 2nd portion of the dinner the night before |
| Breakfasts | 7 | Groceries, 2 rotating high-protein options |
| Snacks | ~14 | Groceries, high-protein staples |

Rule: **every dinner is cooked for two, and the second portion is tomorrow's lunch.** That keeps nightly cooking to 20–30 minutes, gives batch-cooking economics without a Sunday session, and handles the HF two-person portions neatly.

### 2.2 Weekly rhythm (default; configurable in the app)

- **HF delivery day** (configurable, assume Tue). HF dinners are placed on the first nights after delivery, because fresh HF produce degrades fastest.
- **Main shop**: once a week (default Sun/Mon), with a small top-up on Thu (fresh fruit/milk ≤ $15).
- **Specials check**: Woolworths/Coles weekly specials change on **Wednesday**. The app flags swaps when a planned protein is on half price.
- Sample week (HF Tue):
  - Mon: Home dinner A → Tue lunch A
  - Tue: HF 1 → Wed lunch HF1
  - Wed: HF 2 → Thu lunch HF2
  - Thu: HF 3 → Fri lunch HF3
  - Fri: Home dinner B → Sat lunch B
  - Sat: Home dinner C → Sun lunch C
  - Sun: Home dinner D → Mon lunch D

### 2.3 Rotation

- **4-week rotating menu (Weeks A–D)** of home dinners: 16 recipes, each ≤ 30 min, high protein (≥ 35 g protein/portion).
- Each week's recipes share a **core ingredient set** (e.g. one protein bought in bulk is used in 2 recipes) to cut waste.
- Breakfast and snack templates stay fixed and rotate monthly.

### 2.4 Nutrition targets (defaults, editable)

- Protein: 1.6–2.0 g/kg body weight. Default target **130 g/day** until the user sets their weight.
- Energy: maintenance default ~2,400 kcal (editable).
- Fruit/veg: ≥ 5 serves/day of veg+fruit across the plan.
- The app sums protein/kcal per day from recipe data, HF nutrition data included.

### 2.5 Budget envelope ($150/week, starting split; validated during the sourcing rounds)

| Category | $/week |
|---|---|
| Proteins (meat, eggs, tuna, legumes, tofu) | 55 |
| Dairy (Greek yoghurt, milk, cheese) | 25 |
| Produce (veg, fruit) | 30 |
| Carbs/staples (rice, oats, pasta, bread, wraps) | 15 |
| Pantry top-up (oil, spices, sauces; amortised) | 10 |
| Buffer (specials, top-up, mistakes) | 15 |

## 3. Sourcing pipeline (subagents, review rounds)

### 3.1 Known constraint

Woolworths/Coles/Aldi websites **can't be reached from the build sandbox** (DNS blocked). Prices therefore come from **web search** (search-engine snapshots of product pages, catalogue/price-comparison sites, OzBargain, Aldi Special Buys pages) plus any reachable aggregator. Every price is stored with provenance:

```json
{ "item": "chicken-breast", "store": "woolworths", "price": 11.00, "unit": "kg",
  "pack": "1.3–1.7kg", "source": "<url>", "observed": "2026-10-24",
  "confidence": "high|medium|low", "notes": "variable weight, $/kg" }
```

The app keeps prices current afterwards: you **tap to update a price in the store**, and stale prices (> 30 days) are flagged.

### 3.2 Rounds

1. **Round 0, store mapping (1 agent)**: which supermarkets/grocers are reachable by walking or bus from Botany St Kingsford (Woolworths/Coles/Aldi/IGA/Asian grocers/butchers), with address, travel mode/time and hours.
2. **Round 1, price sourcing (≈4 parallel agents)**, split by category (proteins, dairy+eggs, produce, staples/pantry) × candidate stores. Output: the shared price schema above.
3. **Round 2, independent verification (≈4 agents, different from Round 1)**: re-source each item without seeing Round 1's numbers, then diff. Items differing > 15% are flagged.
4. **Round 3, adjudication (1 agent)**: resolve flagged items, set the final price + confidence.
5. **Meal evaluation (2 agents)**: one designs/costs recipes against the final prices, one independently checks cost, protein, cook time, waste overlap and the budget total. Iterate until the week is ≤ $150 with ≥ target protein.

## 4. HelloFresh integration: options to research

HelloFresh has **no public API**. Candidates:

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Gmail import | Parse HF AU "your menu"/order-confirmation emails via the attached Gmail connector (by Claude, at planning time) | Automatic, no ToS issue | Only works through Claude, not in the phone app itself; email content may only have recipe names |
| B. Recipe page JSON-LD | hellofresh.com.au recipe pages embed schema.org `Recipe` (ingredients, nutrition) | Rich data | CORS stops the PWA fetching directly |
| C. Bookmarklet / share | A bookmarklet run *on* hellofresh.com.au extracts the JSON-LD and opens the app with it in the URL hash | Works in a phone browser, no server | Mobile bookmarklets are fiddly |
| D. Unofficial API (gw.hellofresh.com) | Token-based internal API | Full menu | ToS risk, brittle, needs auth. **Avoid** |
| E. Cached library + manual pick | Ship a small library of common HF AU recipes; user picks the 3 each week | Simple, offline | Manual; library goes stale |
| F. Paste text | Paste ingredient list / recipe card text, parsed heuristically | Universal fallback | Parsing errors |

Research agent to determine: HF AU email formats, JSON-LD availability, URL structure, menu-selection deadlines, whether HF recipe cards include nutrition. **Recommendation pending research**: likely C + F in-app, A as a Claude-run weekly helper, E as fallback.

## 5. App architecture

- **Static PWA**, no build step: `index.html`, ES modules, CSS; service worker for offline; installable manifest. Hosted on **GitHub Pages** from this repo.
- **Data**: `data/*.json` shipped with the app (stores, prices, recipes, templates). User state (settings, week plan, pantry, price overrides, ticks) in `localStorage` with export/import JSON backup.
- **Engine** (`src/engine/*.js`, pure functions, unit-tested with `node --test`):
  - `plan.js`: build the week from template + HF picks + rotation week
  - `shopping.js`: aggregate ingredients → pack-size rounding → pantry subtraction → per-store list
  - `cost.js`: price lookup (override > final > fallback), totals vs budget
  - `nutrition.js`: protein/kcal per day
  - `hellofresh.js`: JSON-LD/paste parsing
- **Views**: This Week · Shop · Recipes · Pantry · Prices · HelloFresh · Settings.

## 6. Feature brainstorm (prioritised)

**MVP**
1. Weekly plan view with slots (HF / home / leftovers), drag-free "swap recipe"
2. Auto shopping list grouped by store and aisle, pack-size aware, tick-off offline
3. Budget meter (planned vs $150) and protein-per-day meter
4. HelloFresh import (bookmarklet + paste + library)
5. Price book with provenance, staleness flags and tap-to-update in-store
6. Pantry tracker (staples on hand get subtracted from the list)
7. Rotation weeks A–D, auto-advancing

**Next**
8. Leftovers/fridge tracker with "use by" nudges (HF produce first)
9. Specials radar: mark items on special this week → suggests swaps
10. Actual-spend log (enter receipt total) → weekly/monthly spend chart
11. "Cheap week" mode (≤ $110) and "Exam week" mode (minimal cooking)
12. HF value check: HF $/serve vs home $/serve, a hint for which HF weeks to skip
13. Google Calendar export (.ics) of cook nights and the shop day
14. Backup/export and import JSON

## 7. Verification and review

- **Plan verification**: 4 small Haiku swarms (3 agents each) review this plan through different lenses (budget/nutrition realism, sourcing methodology, app architecture/features, HelloFresh/local logistics). Findings are consolidated into plan v0.2.
- **Independent review after build**: separate agents review (a) code correctness/tests, (b) mobile UX/accessibility, (c) framework realism against the final price data.

## 8. Deliverables

- `docs/PLAN.md` (this), `docs/FRAMEWORK.md` (the weekly framework, human-readable), `docs/HELLOFRESH.md` (integration research), `docs/SOURCING.md` (price methodology + round results)
- `data/` JSON, `app/` PWA, `tests/`
- README with how to install on your phone
