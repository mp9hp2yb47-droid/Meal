# Handoff: start here

_Last updated 2026-10-24 by the cloud session. The next session runs **locally on the user's computer**, so retailer sites can be reached (they were DNS-blocked in the cloud sandbox). The main session is the **orchestrator**: it spawns the agents in `.claude/agents/`, runs the gates, commits, and writes `docs/FRAMEWORK.md`._

## Where things stand

| Step | Status |
|---|---|
| Requirements gathered from the user | ✅ `CLAUDE.md` → Fixed constraints |
| Plan v0.1 → verified by 4 Haiku swarms × 3 → **Plan v0.2** | ✅ `docs/PLAN.md` (§9 change log) |
| Handoff package reviewed by a 3-agent Haiku swarm, findings fixed | ✅ |
| Data model + schemas | ✅ `docs/DATA.md`, `docs/SOURCING.md` |
| Price engine: unit normalisation, diff over the full grid, conservative resolution, final-price build, selection precedence (shelf-only budget), snapshot quote check | ✅ `src/engine/prices.js` + `tests/` (25 tests total) |
| Validators for ingredients, stores, round files, prices, recipes, sample week, HelloFresh | ✅ `src/engine/validate.js`, `npm run validate` |
| Pipeline scripts | ✅ `validate`, `diff-rounds`, `build-prices` (end-to-end smoke-tested on fixtures); `fetch:woolworths` ⚠️ **untested** (no network in the cloud) |
| Ingredient master (42 items with specs) + store leads (6, unverified) | ✅ `data/` |
| HelloFresh options research (search-only) | ✅ `docs/HELLOFRESH.md`, checklist open |
| Round 0–3 sourcing, meal design/eval, FRAMEWORK.md | ⏳ next |
| PWA build + independent reviews | ⏳ after sourcing |

## Ask the user first

1. **Body weight** (protein target). Optionally sex/age/height/activity. _If unanswered: assume 75 kg → 135 g/day, set `weight_is_default: true` and say so in FRAMEWORK.md._
2. Which day does HelloFresh deliver now, can it be **Sunday**, and what's the weekly price? _Default: Sunday, $75/week._
3. Is **Wednesday** OK as the main shop day? Any regular nights out? _Default: Wednesday, none._
4. Food dislikes; OK with whey protein powder? _Default: no dislikes, no whey._
5. GitHub Pages hosting (a public URL; it needs Pages enabled on the repo) or local only? _Default: GitHub Pages from this branch, serving the repo root, app at `/app/`._

## Runbook

### 0. Setup
```bash
git checkout claude/student-meal-planning-iweo8i && git pull
node -v                      # >= 20
npm test && npm run validate # all tests pass, validate OK
python3 -m venv .venv && . .venv/bin/activate && pip install recipe-scrapers   # HelloFresh check
npx -y playwright@1.47.2 install chromium                                      # for the ux review later
for u in https://www.woolworths.com.au/ https://www.coles.com.au/ https://www.aldi.com.au/ https://www.hellofresh.com.au/recipes https://www.grocerize.com.au/; do echo "$u $(curl -s -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' $u)"; done
npm run fetch:woolworths -- "chicken breast"   # writes data/sourcing/snapshots/shared/…
```
`fetch:woolworths` **works** if the output lists ≥ 1 candidate with a `price` and `cup_string`. If not, try one fix (the endpoint/headers may have changed); otherwise skip it, since the sourcers fall back to curl'd pages.

### 1. HelloFresh verification (15 min)
Work through the checklist in `docs/HELLOFRESH.md` and record the findings there. Commit.

### 2. Round 0: stores
Spawn 1 `price-sourcer` in Round 0 mode. When it returns: `npm run validate`, check that `git status` shows only `data/stores.json`, then commit.
Then **choose the store grid**: the nearest verified full-size Woolworths and Coles (Randwick if full-size, else Eastgardens) + `aldi-eastgardens`, with `iga-kingsford` as a top-10 spot-check. Write the store_ids into every Round 1/2 prompt.

### 3. Round 1: sourcing (parallel)
`npm run fetch:woolworths -- --all` if it works. Spawn **4 `price-sourcer`** (Round 1 mode) in parallel: `protein`, `dairy`, `produce`, `carbs-pantry`, each with the store grid and the run date (Sydney).
**Gate**: `npm run validate -- --snapshots`. Send any failing agent its errors to fix. Check `git status` (only `round1/` changed; snapshots are ignored). Commit.

### 4. Round 2: blind verification (parallel)
Spawn **4 `price-verifier`** with the same split and grid. Their prompt must repeat the independence rule.
**Gate**: `npm run validate -- --snapshots`, then `npm run diff-rounds`. Commit `round2/` + `diff.json`.

### 5. Round 3: adjudication
Spawn 1 `price-adjudicator`. **Gate**: `npm run validate -- --snapshots` passes and `data/prices.json` was produced by `build-prices`. Commit.
Spot-check: spawn 1 `price-verifier` in spot-check mode on 10 random final prices (weighted to the high-spend ones). Re-open Round 3 for any that fail.

### 6. Meal design + evaluation loop (main session orchestrates, ≤ 3 iterations)
1. `meal-designer` → `data/recipes.json`, `data/sample-week.json`, ingredient nutrition. Gate: `npm run validate`.
2. `meal-evaluator` → `docs/reviews/meal-eval-<date>.md`. Gate: `git status` shows only that report.
3. If anything FAILs, re-spawn `meal-designer` with the report path. Repeat.

Then the main session writes **`docs/FRAMEWORK.md`**, the user's main non-app deliverable:
- The week at a glance (Wednesday Shop, Sunday Box table with the real recipes)
- Shopping list template by store/aisle with quantities and shelf prices, and a **per-store split** (what to buy at ALDI monthly vs Woolworths/Coles weekly)
- Budget table vs $150 (by line), all-in cost incl. HF
- Protein ledger per day; the protein target and whether the weight is a default
- Thaw/prep reminders, food-safety rules for leftovers, exam-week and cheap-week variants, the fallback meals
- The 4-week rotation A–D and the swap pool
- Price confidence summary + date, and how to refresh prices

Optional: a Haiku swarm (3 × `plan-verifier`) on FRAMEWORK.md (lenses: student realism, budget maths, food safety).

### 7. Build the PWA (PLAN.md §6–7, MVP list only)
Layout: the repo root is served as-is; the app at `app/` imports `../src/engine/*.js` and fetches `../data/*.json`. **No build step, no copying.**
```
sw.js                       ← service worker at the REPO ROOT (scope ./ covers app/, data/, src/)
manifest.webmanifest        ← repo root; start_url "./app/", scope "./"
app/index.html, app/app.js, app/styles.css, app/icons/
app/views/{today,week,shop,recipes,prices,hellofresh,settings}.js
app/store/{db.js,backup.js,migrate.js}
src/engine/{units,plan,shopping,cost,nutrition,hellofresh}.js  (+ tests/*.test.js for each)
```
Engine first, with tests for the PLAN.md §6 invariants. Then the views. **Decided:** the service worker and manifest live at the repo root so their scope covers `app/`, `data/` and `src/`. `app/app.js` registers it with `navigator.serviceWorker.register('../sw.js', { scope: '../' })`. App shell is cache-first with a versioned cache, `data/*.json` is network-first (PLAN.md §6).

### 8. Independent review
Spawn 3 `app-reviewer` in parallel (lenses: `engine`, `ux`, `framework`) plus a final Haiku swarm (3 × `plan-verifier`, lens: "would a student actually use this every week?"). **After each review, `git status` must show only `docs/reviews/*`**: revert anything else. Fix the high/medium findings, then re-run the reviewer for any high-severity lens.

### 9. Ship
Enable GitHub Pages (Settings → Pages → this branch, root). Then, on the user's phone: open `/app/`, Add to Home Screen, go offline, tick the shop list, export a backup.

## Gotchas
- Snapshots are **git-ignored and local**, so `--snapshots` only passes on the machine that ran the rounds. Plain `npm run validate` warns instead of failing elsewhere.
- WebFetch output is model-processed, so it is never evidence. Curl the page.
- iOS: home-screen apps don't share storage with Safari, so all imports happen inside the installed app. Nudge backups.
- Budget on **shelf** prices; specials are upside only.
- Lunch = the 2nd serving of the previous dinner; it never adds demand.
- Only the **L3** light rail serves Kingsford.
- Dates are Australia/Sydney (`scripts/lib.mjs` → `sydneyToday`).
- Claude in Chrome (if installed) is available to the **main session only**. Subagents use curl. When a site blocks curl, the main session captures the page text with Chrome into `data/sourcing/snapshots/` and the agent re-runs.
