# Kingsford Meal Planner

Weekly, repeating meal framework + offline phone web app (PWA) for one uni student in Kingsford NSW 2032 (Botany St, near UNSW).

## Read first
1. `docs/HANDOFF.md`: current status and the **exact next steps**. Start here every session.
2. `docs/PLAN.md`: the verified plan (v0.2). It is the source of truth for the framework, data model and features.
3. `docs/SOURCING.md`: the price-sourcing protocol (rounds, schema, confidence rubric).
4. `docs/DATA.md`: data schemas (ingredients, recipes, sample week, HelloFresh, app state).
5. `docs/HELLOFRESH.md`: HelloFresh integration options and what still needs verifying.

## Fixed constraints (from the user, do not change without asking)
- **$150 AUD/week groceries only**. HelloFresh is paid separately (3 recipes/week, 2-person size).
- Eats solo. The 2nd HF portion = next day's lunch.
- Covers breakfast, lunch, dinner and snacks, 7 days. **High protein**, no restrictions.
- Shops by walking or public transport only (Kingsford/Randwick/Eastgardens). No car.
- Full kitchen, **quick nightly cooks (≤30 min)**, no big batch sessions.
- App: static PWA, installable on a phone, works offline.

## Conventions
- Money is stored as **integer cents**. Quantities use base units `g`, `ml` or `each`.
- Every ingredient/recipe/store has a stable kebab-case `id`. Never key anything by display name.
- Every data file carries `"schemaVersion"`. Run `npm run validate` after editing `data/`.
- Engine code (`src/engine/`) must be pure: pass `today` and data in as arguments, no `Date.now()`, no imports of data files. Tested with `node --test` (`npm test`).
- No build step. ES modules, relative URLs only. The repo root is served as-is and the app lives at `app/` (GitHub Pages subpath).
- Prices must carry provenance (source URL, observed date, a verbatim quote from a curl'd snapshot, confidence). **Never invent a price**: unknown stays unpriced and is never counted as $0. `data/prices.json` is only ever built by `npm run build-prices`.
- Dates use Australia/Sydney.

## Subagents
Role definitions live in `.claude/agents/`. The main session orchestrates: it spawns them per `docs/HANDOFF.md`, runs the gates (`npm run validate -- --snapshots`, `git status` after read-only reviewers), and commits:
`price-sourcer`, `price-verifier`, `price-adjudicator`, `meal-designer`, `meal-evaluator`, `plan-verifier` (Haiku, swarm use), `app-reviewer`.

## Git
Develop on `claude/student-meal-planning-iweo8i` unless told otherwise. Commit `data/` changes separately from code changes.
