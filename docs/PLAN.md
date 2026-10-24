# Kingsford Meal Planner: Plan v0.2 (verified)

> v0.1 was reviewed by 4 Haiku swarms × 3 agents (budget/nutrition, sourcing, app architecture, HelloFresh/logistics). All 12 returned **"sound with changes"**. Every accepted change is folded in below; the change log is in §9.

## 1. Brief

| Constraint | Value |
|---|---|
| Location | Botany St, Kingsford NSW 2032 (next to UNSW Kensington) |
| Grocery budget | **$150 AUD/week**, groceries only. HelloFresh is paid separately (~$70–80/week for 3×2, to be confirmed) |
| HelloFresh | 3 recipes/week, 2-person size, chosen from the weekly menu |
| Eaters | 1 (solo) |
| Meals | Breakfast, lunch, dinner, snacks, 7 days |
| Diet | No restrictions, **high protein** |
| Transport | Walking + bus + **L3 Kingsford light rail** (L2 is the Randwick line) |
| Cooking | Full kitchen, **≤30 min nightly cooks**, no batch sessions |
| App | Installable offline phone PWA |

## 2. The weekly framework: "Wednesday Shop, Sunday Box"

### 2.1 Why this rhythm

- Woolworths/Coles specials run **Wed → Tue**. Shopping on **Wednesday** catches the new specials (previews go online Monday afternoon, so the plan can be locked Mon/Tue).
- Home cooking happens **Wed–Sat**, the 4 nights straight after the shop, while groceries are freshest.
- HelloFresh arrives **Sunday** (AU delivers Sat–Wed; pick the earliest Sunday window for 2032) and covers **Sun–Tue**, the tail of the shop cycle when groceries would be oldest. HF poultry/seafood goes on Sunday.
- HF menu cutoff for a Sat–Wed delivery is **Tuesday 11:59pm the week before**, so the app reminds you on Monday.

All days are settings; this is the default.

### 2.2 Slot map (14 main meals + 7 breakfasts + snacks)

| Day | Dinner (cook) | Lunch (eat) |
|---|---|---|
| Wed | Home A (fresh protein) → ×2 | HF3 leftover from Tue |
| Thu | Home B (fresh protein) → ×2 | A |
| Fri | Home C (protein **frozen Wed, thaw Thu night**) → ×2 | B |
| Sat | Home D (protein **frozen Wed, thaw Fri night**) → ×2 | C |
| Sun | **HF1** (poultry/seafood first) → ×2 | D |
| Mon | **HF2** → ×2 | HF1 |
| Tue | **HF3** → ×2 | HF2 |

- **Rule: every dinner is cooked as 2 servings. Serving 2 is tomorrow's lunch** (`portion_of` link, never a separate recipe, so nothing is double counted).
- **Week 1 bootstrap**: the first Wednesday has no leftover lunch. The app adds a "bootstrap lunch" (wrap + tuna) to the first shop.
- **Perishability ordering**: leafy greens and herb-heavy recipes go Wed/Thu; hardy veg (carrot, cabbage, pumpkin, frozen veg) go Fri/Sat.
- **Optional mini top-up** (Sun/Mon, ≤ $15 of the $150): milk, fruit, bread.

### 2.3 Skips and modes (the plan has to bend)

- **Skip / eat out** toggle on any slot: removes it from the shop list and budget; if already bought, its protein is marked "freeze" and the plan shifts forward.
- **Exam week mode**: swaps home dinners for ≤15 min "assembly" meals and leans on the fallback list.
- **Cheap week mode**: target ≤ $110 (legume/egg-heavy dinners).
- **10-minute fallback meals** (always in stock): tuna + rice + frozen veg; eggs on toast + Greek yoghurt; wrap + tinned chicken/beans.

### 2.4 Rotation and variety

- **Recipe pool of ~30 home dinners** (≤30 min, freezer-friendly flag, perishability score), tagged by core protein.
- Each week picks 4 dinners, with **each core ingredient shared by ≤ 2 recipes** and a **pack-fit check** (pack size within ~10% of combined need, otherwise leftovers go to the pantry or freezer with `keep_days`).
- Suggested 4-week rotation A–D (manual week picker in MVP), with a one-tap swap from the pool.
- **2 breakfasts/week** chosen from a pool of 6; snacks from a pool of 8.

### 2.5 Nutrition targets

- Onboarding asks body weight (+ optional sex/age/height/activity).
- **Protein = 1.6–2.0 g/kg** (default 1.8; e.g. 75 kg → 135 g/day). **Energy** via Mifflin-St Jeor × activity (shown, not enforced).
- **Per-slot protein minimums**: breakfast ≥ 25 g, lunch/dinner ≥ 35 g (≥ 30 g for a vegetarian dinner as long as the week averages ≥ 35 g), snacks ≥ 15 g each, 2 snacks/day.
- Tracked weekly (soft targets, shown as a ledger before the shop): **5 veg + 2 fruit serves/day**, fibre 25–30 g, calcium ~1,000 mg, iron, and **2 oily-fish serves/week** (salmon/sardines; tuna doesn't count).
- HF nutrition comes from the actual per-serving values on the HF recipe, `null` when unknown (never 0).

### 2.6 Budget envelope ($150/week, based on shelf price; specials are upside)

| Line | $/wk | Notes |
|---|---|---|
| Meat/fish/tofu/legumes | 60 | ~1.2 kg meat for 8 home portions; breast by default, thigh only on special |
| Eggs + dairy | 25 | Homebrand Greek yoghurt 1 kg, milk, cheese, eggs |
| Produce | 30 | Veg + fruit, frozen veg counts here |
| Carbs | 15 | Rice, oats, pasta, wraps, bread |
| Pantry staples | 10 | **Flat line**, not subtracted via pantry (avoids double counting) |
| Buffer | 10 | Top-up / mistakes |

The app shows **all-in weekly cost** too (groceries + HF box ÷ week) and an **actual-spend** entry (receipt total) next to the planned figure.

## 3. Shops (to verify in Round 0, locally)

Leads from the swarm (search-only, **unverified**):
- **IGA**, 359–361 Anzac Pde, Kingsford: walk
- **Coles**, 148 Belmore Rd, Randwick, and **Woolworths**, 73–75 Belmore Rd, Randwick (smaller format): walk/short bus
- **Westfield Eastgardens** (152 Bunnerong Rd): Coles, Woolworths, **ALDI**: bus
- Also check: Asian grocers/butchers along Anzac Pde (Kingsford/Kensington), Maroubra Junction.

Strategy hypothesis: **primary = nearest Woolworths/Coles (Wed specials)**, **monthly ALDI run at Eastgardens** for long-life staples (oats, rice, tins, frozen veg).

## 4. Sourcing pipeline

Full protocol: `docs/SOURCING.md`. Summary:

- **Round 0** store mapping → `data/stores.json`
- **Round 1** sourcing by category (parallel `price-sourcer` agents) → `data/sourcing/round1/*.json`
- **Round 2** blind re-sourcing by different agents, which **must cite a different domain** where possible → `round2/`
- **Diff**: outcomes `agree | disagree | not_found | spec_mismatch`. Flag when unit price differs > 15% **or** budget impact > $1/week
- **Round 3** adjudication: unresolved → **take the higher price**, confidence low
- **Meal design + evaluation** loop until the week is ≤ $150 at shelf price and meets protein minimums
- Every price has a **verbatim quote**; the verifier confirms it. Confidence: **high** = first-party page ≤ 7 days old with unit price consistent; **medium** = aggregator or search snippet; **low** = everything else

When run **locally**, first-party sites (woolworths.com.au etc.) should be reachable. That's the main reason the user is continuing this on their own machine.

## 5. HelloFresh

Full research: `docs/HELLOFRESH.md`. There is **no public API**. MVP: **paste recipe text/URL → parser**, plus a **small cached library** of picked recipes. Next: bookmarklet run inside the installed app's context (iOS storage caveat). Claude-run helper: `recipe-scrapers` / live-page JSON-LD check, run locally. Gmail import is weak (AU evidence suggests emails/SMS don't list recipes), so verify against the user's real inbox before building.

## 6. App architecture

- **Static PWA, no build step**: `app/index.html`, ES modules, CSS, `sw.js`, `manifest.webmanifest`. **Relative URLs only** (GitHub Pages subpath), SW scope `./`.
- **Storage**: user state in **IndexedDB** (via a tiny wrapper), `navigator.storage.persist()` best-effort. **Backup is the real safety net**: weekly "export backup" nudge through the Web Share API (file → Files/Drive), and schema-validated import with a preview.
- **iOS**: the home-screen app and Safari have separate storage, so all imports happen inside the installed app. Settings shows "install first" guidance.
- **Service worker**: app shell precached with a versioned cache name; **`data/*.json` network-first** with cache fallback; Settings shows the data version; "update available" banner.
- **Data**: `data/*.json` with `schemaVersion` and stable IDs (schemas in `docs/DATA.md`, `docs/SOURCING.md`). Price overrides are price records (`channel: "instore"`, `setAt`, `baseVersion`). Other user edits are `{id, field, value, setAt, baseVersion}`. Everything is merged at runtime (shipped data is never mutated). `migrate.js` upgrades old state.
- **Layout**: the repo root is served as-is (GitHub Pages or `python3 -m http.server`). The app lives at `app/` and loads `../data/*.json` and `../src/engine/*.js`, so there is no copy or build step.
- **Engine** (`src/engine/`, pure, `node --test`, integer cents, `today` + catalogue passed in):
  - `units.js`: normalise recipe lines to g/ml/each via the ingredient master (`each_g`, `density`)
  - `plan.js`: week from rhythm settings + rotation + HF picks + skips; perishability ordering
  - `shopping.js`: **chronological** demand per shop window → subtract pantry → `ceil(net/pack)` → leftovers to pantry with `keep_days`; HF meals excluded (`cost_model: "box"`)
  - `cost.js`: uses `selectPrice` in `prices.js` with precedence **user override (latest per store) > adjudicated (round 3) > agreed (round 2) > single-source (round 1, only after a monthly refresh) > unpriced (counted, never $0)**, cheapest within a tier. **Shelf prices only** for the budget; live specials (`valid_to ≥ today`) only for the specials radar
  - `nutrition.js`: home recipes from ingredient `nutrition_per_100g` (AUSNUT/NUTTAB) × qty ÷ servings; HF from per-serving data
  - `hellofresh.js`: paste/JSON-LD parser
- Invariants tested: bought ≥ needed; leftover = bought − needed; lunches never add demand; unpriced never counted as $0.

## 7. Features

**MVP**
1. **Today screen** (default): tonight's dinner with steps + timer, tomorrow's lunch, the thaw reminder, next shop
2. Week view: slots, one-tap swap from the pool, **skip/eat-out** toggle
3. **Shop mode**: list grouped by store/aisle, pack-aware, tick-off offline, **running trolley total vs $150**
4. **One-tap "Start new week"**: rolls forward, keeps the rotation, resets ticks, runs the "what's left?" pantry prompt (10-second tick list)
5. Budget meter (planned / actual receipt / all-in incl. HF) + protein ledger
6. HelloFresh: paste import + cached library
7. Prices: current price, "last updated", tap-to-update in store (provenance stays in the data files, not the UI)
8. Exam-week mode + 10-minute fallback meals
9. Backup export/import + weekly nudge
10. Reminders shown in-app: HF cutoff (Mon), thaw (Thu/Fri night), shop (Wed)

**Next**
- Specials radar (mark items on special → suggested swaps)
- Spend history chart; HF value check (HF $/serve vs home $/serve, which weeks to skip HF)
- `.ics` calendar export (shop day, HF cutoff, thaw reminders), or Google Calendar via Claude's connector
- Bookmarklet HF import; fridge/leftover tracker with use-by nudges
- Cheap-week mode auto-generator

## 8. Verification and review

- ✅ Plan verification: 4 Haiku swarms × 3 (done, v0.1 → v0.2)
- ⏳ Sourcing rounds 0–3 + meal evaluation (local session, `docs/SOURCING.md`)
- ⏳ App build, then **independent reviews**: `app-reviewer` agents for (a) engine correctness/tests, (b) mobile UX + accessibility, (c) framework realism vs final prices; plus a final Haiku swarm sanity pass

## 9. Change log v0.1 → v0.2 (from swarm findings)

| Finding | Change |
|---|---|
| Sunday shop → raw meat Fri/Sat too old; Wed specials missed | "Wednesday Shop, Sunday Box" rhythm; freeze-on-purchase + thaw reminders |
| Protein $55 too tight; thigh pricier than breast | Proteins $60, buffer $10; breast default |
| Flat 130 g / 2,400 kcal defaults | Weight-based protein, Mifflin-St Jeor energy |
| Missing nutrients, wrong veg guidance | 5 veg + 2 fruit, fibre, calcium, iron, oily fish |
| Lunch double-count risk; week-1 gap | `portion_of` links; bootstrap lunch |
| Price schema not computable; no ingredient master | Structured price schema; `ingredients.json` master; integer cents |
| Single snapshot ≠ independent verification | Different-domain rule, verbatim quotes, confidence rubric, $1/wk threshold, take-higher on ties |
| iOS eviction + split storage; stale SW data | IndexedDB + backup nudge; network-first data; install-first imports |
| MVP too big, missing the weekly loop | Today screen, skip toggle, start-new-week, trolley total; provenance UI cut |
| Boredom: 16 recipes | Pool of ~30 + swap; 2 breakfasts/week |
| HF facts | Cutoff Tue 11:59pm; 3 of a large menu; Gmail import weak; JSON-LD unverified; `recipe-scrapers` lead |
| L2/L3 | Only L3 serves Kingsford |
