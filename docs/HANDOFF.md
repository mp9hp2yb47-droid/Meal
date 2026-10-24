# Handoff: start here

_Last updated 2026-10-24 by the cloud session. The next session runs **locally on the user's computer**, so retailer sites can be reached (they were DNS-blocked in the cloud sandbox)._

## Where things stand

| Step | Status |
|---|---|
| Requirements gathered from the user | ✅ (see `CLAUDE.md` → Fixed constraints) |
| Plan v0.1 → verified by 4 Haiku swarms × 3 → **Plan v0.2** | ✅ `docs/PLAN.md` |
| Data model: ingredient master (42 items), store leads, price schema, validator, diff logic + 9 tests | ✅ `data/`, `src/engine/prices.js`, `src/engine/validate.js`, `tests/` |
| Sourcing protocol + subagent roles | ✅ `docs/SOURCING.md`, `.claude/agents/` |
| HelloFresh options research (search-only) | ✅ `docs/HELLOFRESH.md` (checklist still open) |
| Local Woolworths fetch helper | ⚠️ written, **untested** (couldn't reach the site from the cloud) |
| Round 0–3 sourcing, meal design/eval | ⏳ next |
| PWA build + independent reviews | ⏳ after sourcing |

## Questions to ask the user at the start of the local session

1. Body weight (for the protein target), and optionally sex/age/height/activity.
2. Which day does HelloFresh deliver now, and can it move to **Sunday**? What do they pay per week?
3. Is **Wednesday** OK as the main shop day? Any days they're never home for dinner (regular eat-outs)?
4. Food dislikes, and whether they're OK with whey protein powder.
5. Do they want the app hosted on GitHub Pages (public repo URL) or only run from their laptop?

## Step-by-step runbook

### 0. Setup (5 min)
```bash
git checkout claude/student-meal-planning-iweo8i && git pull
node -v          # needs >= 20
npm test         # 9 passing
npm run validate # OK
```
Network probes (expect HTTP 200s locally):
```bash
for u in https://www.woolworths.com.au/ https://www.coles.com.au/ https://www.aldi.com.au/ https://www.hellofresh.com.au/recipes; do echo "$u $(curl -s -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' $u)"; done
node scripts/fetch-woolworths.mjs "chicken breast"   # check data/sourcing/raw/ output looks sane
```
If the Woolworths helper fails (API changed or bot wall), fix it or skip it. The sourcers fall back to WebFetch / Claude in Chrome.

### 1. HelloFresh verification (15 min)
Work through the checklist in `docs/HELLOFRESH.md` and update that doc with the findings.

### 2. Round 0: stores
Spawn 1 `price-sourcer` (Round 0 mode) to verify `data/stores.json` and add travel times from Botany St. Commit.

### 3. Round 1: sourcing (parallel)
`node scripts/fetch-woolworths.mjs --all` first (if it works). Then spawn **4 `price-sourcer` agents in parallel**: protein, dairy, produce, carbs+pantry. Stores: woolworths, coles and aldi (nearest/Eastgardens ids), plus an IGA spot-check. `npm run validate`. Commit.

### 4. Round 2: blind verification (parallel)
Spawn **4 `price-verifier` agents** (the same split; they must not read round1). `npm run validate`, then `npm run diff-rounds`. Commit.

### 5. Round 3: adjudication
Spawn 1 `price-adjudicator`, which produces `data/prices.json`. Commit.
Optional: a Haiku swarm (3 × `plan-verifier`) spot-checking 10 random final prices each.

### 6. Meal design + evaluation loop
`meal-designer` → `data/recipes.json`, `data/sample-week.json`. Then `meal-evaluator` → `docs/reviews/meal-eval-*.md`. Iterate ≤ 3 times. Then write **`docs/FRAMEWORK.md`**: the human-readable weekly framework (rhythm, shopping list template, per-store split, budget, protein ledger). This is the user's main non-app deliverable.

### 7. Build the PWA (PLAN.md §6–7)
Suggested layout:
```
app/index.html, app/app.js, app/styles.css, app/sw.js, app/manifest.webmanifest, app/icons/
app/views/{today,week,shop,recipes,prices,hellofresh,settings}.js
app/store/db.js (IndexedDB wrapper), app/store/backup.js, app/store/migrate.js
src/engine/{units,plan,shopping,cost,nutrition,hellofresh}.js   (+ tests for each)
```
Build the engine with tests first (invariants in PLAN.md §6), then the views, MVP list only. The app loads `data/*.json` relative to itself, so either copy `data/` into `app/` at deploy time or serve the repo root with the app at `/app/`. Choose one and document it.

### 8. Independent review
Spawn 3 `app-reviewer` agents in parallel (lenses: engine, ux, framework) plus a final Haiku swarm (3 × `plan-verifier`: "would a student actually use this every week?"). Fix the findings, then re-run the reviewers on anything high-severity.

### 9. Ship
GitHub Pages from the branch/`main` (user's choice), then test install on the user's phone: add to home screen, go offline, tick the shop list.

## Gotchas
- iOS: home-screen apps don't share storage with Safari, so do every import inside the installed app. Remind the user to export a backup.
- Budget on **shelf** prices; specials are upside.
- Lunches are the 2nd serving of the previous dinner (`portion_of`), never separate demand.
- Only the **L3** light rail serves Kingsford.
- Nothing in the swarm's store list is verified yet (`verified: false`).

## Swarm findings archive
The raw notes from the 12 plan verifiers are summarised in the PLAN.md §9 change log.
