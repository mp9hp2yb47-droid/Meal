# Data Schemas

All files carry `"schemaVersion": 1`, use kebab-case `id`s, integer cents and base units `g | ml | each`. `npm run validate` enforces what's marked ✔.

Price records and round files are in `docs/SOURCING.md`; stores (Round 0) are there too.

## `data/ingredients.json`

```json
{ "id": "chicken-breast", "name": "Chicken breast fillets", "category": "protein",   // ✔ protein|dairy|produce|carbs|pantry
  "base": "g", "each_g": null, "density_g_per_ml": null,                            // ✔ base; each_g required when base = each
  "spec": "RSPCA-approved chicken breast fillet, fresh, skinless; homebrand; per kg", // ✔ exactly what sourcers price
  "weekly_qty_estimate": 800,                                                       // ✔ number ≥ 0 (base units; sizes the $1/wk diff rule)
  "keep_days": 2, "freezable": true,
  "nutrition_per_100g": { "kcal": 106, "protein_g": 23.0, "fat_g": 1.5, "carbs_g": 0, "fibre_g": 0,
                          "calcium_mg": 5, "iron_mg": 0.4 },                        // ✔ kcal + protein_g numeric, or null
  "nutrition_source": "AUSNUT 2011-13 food 05A10123 / product panel URL" }          // ✔ required when nutrition is set
```

(The nutrition numbers above illustrate the shape only. Fill real values from AUSNUT/NUTTAB or the product panel.)

## `data/recipes.json`

```json
{ "schemaVersion": 1, "recipes": [ {
  "id": "honey-soy-chicken-rice", "name": "Honey-soy chicken, rice & greens",
  "kind": "dinner",                       // ✔ dinner | breakfast | snack | fallback
  "servings": 2,                          // ✔ dinners must be 2 (2nd = next-day lunch)
  "minutes": 25,                          // ✔ dinner ≤ 30, fallback ≤ 15
  "core_protein": "chicken-breast",
  "perishability": 2,                     // ✔ dinners: 1 = hardy (Fri/Sat) … 3 = leafy/herbs (Wed/Thu)
  "freezer_friendly": true,
  "needs_thaw": true,                     // protein is frozen on shop day → thaw reminder the night before
  "tags": ["quick", "high-protein"],
  "ingredients": [ { "ingredient_id": "chicken-breast", "qty": 300, "unit": "g" } ],   // ✔ known id, convertible unit
  "steps": ["..."],
  "nutrition_per_serving": { "kcal": 650, "protein_g": 48 },   // computed by the engine from ingredients; null until then
  "source": "original | URL" } ] }
```

## `data/sample-week.json` (meal-designer output, the reference week)

```json
{ "schemaVersion": 1, "rhythm": { "shop_day": "wed", "hf_delivery_day": "sun" },
  "dinners": [ { "day": "wed", "recipe_id": "honey-soy-chicken-rice" },
               { "day": "sun", "hf_placeholder": { "protein_g": 35 } } ],
  "lunches": "derived: 2nd serving of the previous night's dinner (portion_of)",
  "breakfasts": ["greek-yoghurt-oats", "eggs-toast"], "snacks": ["cottage-cheese-fruit", "tuna-crackers"],
  "costing": { "by_line_cents": { "protein": 0, "dairy": 0, "produce": 0, "carbs": 0, "pantry": 1000 },
               "total_cents": 0, "unpriced": ["ingredient ids"] },
  "protein_per_day_g": { "wed": 0 } }
```

## `data/hellofresh/<id>.json`

See `docs/HELLOFRESH.md`. ✔ `id` starts with `hf-`, `source: "hellofresh"`, `cost_model: "box"`, integer `servings`, `nutrition_per_serving.protein_g` a number or `null` (never a guessed 0).

## App user state (IndexedDB, app-side; versioned by `migrate.js`)

```json
{ "schemaVersion": 1,
  "settings": { "weight_kg": 75, "weight_is_default": true, "protein_g_per_kg": 1.8, "budget_cents": 15000,
                "shop_day": "wed", "hf_delivery_day": "sun", "stores": ["woolworths-randwick", "aldi-eastgardens"] },
  "week": { "start": "2026-10-28", "rotation": "A", "slots": [ { "day": "wed", "meal": "dinner", "recipe_id": "...", "skipped": false } ],
            "hf_picks": ["hf-..."], "ticks": { "chicken-breast": true }, "actual_spend_cents": null },
  "pantry": { "olive-oil": true },
  "price_overrides": [ /* price records with channel "instore", setAt, baseVersion */ ],
  "history": [ { "week_start": "2026-10-21", "planned_cents": 14210, "actual_cents": 14890 } ] }
```
