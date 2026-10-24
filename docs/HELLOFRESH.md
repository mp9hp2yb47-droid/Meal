# HelloFresh Integration: Research Notes

Status: **options researched by search only** (hellofresh.com.au was unreachable from the cloud sandbox). The items marked 🔍 must be verified in the local session before anything gets built on them.

## Facts gathered (search summaries, to confirm)

- **No public API** or developer portal.
- AU delivery days are **Sat–Wed**, plus Thu/Fri options. Check the windows for postcode 2032 at checkout.
- **Menu cutoff**: for Sat–Wed deliveries, Tuesday 11:59pm (Sydney) the week before; Thursday 11:59pm for Thu/Fri deliveries. ([how-to-cancel page](https://www.hellofresh.com.au/about/how-to-cancel-hellofresh))
- Weekly menu: large (25–55+ recipes); plans are 3–5 recipes. You pick 3.
- Price: roughly **$70–80/week** for 3 recipes × 2 people incl. shipping (~$12–13/serve). Confirm against the user's actual invoice.
- High-protein collection page: `https://www.hellofresh.com.au/recipes/high-protein-recipes`.
- Recipe URL format: `https://www.hellofresh.com.au/recipes/<slug>-<24-hex-id>`.
- Delivery notifications come by **SMS**. No evidence that AU emails list the week's recipe names. 🔍

## Options

| # | Option | Where it runs | Verdict |
|---|---|---|---|
| A | **Paste import**: paste a recipe URL or the recipe card's ingredient/nutrition text; the app parses it | In-app | ✅ **MVP**. Universal and offline |
| B | **Cached library**: recipes you've imported are kept and searchable for future weeks | In-app | ✅ **MVP** |
| C | **Recipe-page structured data** (schema.org `Recipe` JSON-LD: ingredients, nutrition, time) | Claude locally (`recipe-scrapers` or WebFetch), or a bookmarklet | 🔍 Verify JSON-LD exists on a live AU page. If it does, Claude can bulk-import the 3 picks each week into `data/hellofresh/` |
| D | **Bookmarklet** run on the HF recipe page that opens the app with the data in the URL hash | Phone browser → app | ⏭ Later. iOS gives home-screen apps separate storage from Safari, so the hand-off must land in the installed app |
| E | **Gmail import** via the Claude Gmail connector | Claude | 🔍 Low expectations. Check the user's real HF emails for recipe names first |
| F | `recipe-scrapers` (Python) HelloFresh scraper | Claude locally | 🔍 `python -c "from recipe_scrapers import SCRAPERS; print('hellofresh.com.au' in SCRAPERS)"` |
| G | Unofficial API (`gw.hellofresh.com`, `pyhellofresh`, browser-automation MCPs) | n/a | ❌ Avoid: ToS risk, needs account tokens, brittle |

## Recommended flow

1. **Weekly (Monday, before the Tue cutoff)**: you pick 3 recipes in the HF app, favouring the high-protein ones and **poultry/seafood for Sunday**.
2. Paste the 3 recipe URLs into the app (or ask Claude: "import my HF picks"). Claude fetches them locally (C/F) and writes `data/hellofresh/<id>.json`.
3. The app places HF1–3 on Sun/Mon/Tue (perishables first), counts their nutrition (per-serving values, `null` when unknown), excludes them from the shopping cost (`cost_model: "box"`), and sets each one's 2nd serving as the next day's lunch.

## HF recipe JSON shape (app-side)

```json
{ "id": "hf-one-pan-tandoori-haloumi-697c0edfeee067c9eb8db781", "source": "hellofresh",
  "url": "https://www.hellofresh.com.au/recipes/...", "name": "...", "servings": 2, "minutes": 30,
  "cost_model": "box", "perishability": 3,
  "nutrition_per_serving": { "kcal": 720, "protein_g": 42, "carbs_g": null, "fat_g": null, "fibre_g": null },
  "ingredients_text": ["..."], "pantry_items_assumed": ["olive oil", "salt", "pepper"], "imported": "2026-10-27" }
```

## To verify locally (checklist for the next session)

- [ ] Open one live AU recipe page: is there `<script type="application/ld+json">` with `"@type": "Recipe"` and `nutrition`?
- [ ] `recipe-scrapers` supports hellofresh.com.au, and it returns nutrition.
- [ ] Do HF AU recipe pages need a login? (They're expected to be public.)
- [ ] Ask the user for one HF email (or search Gmail with permission) to check for recipe names.
- [ ] Confirm the user's delivery day, plan price and whether Sunday delivery is available for 2032.
