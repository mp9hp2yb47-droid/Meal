#!/usr/bin/env node
// Validate data/*.json and every sourcing round file. Exit 1 on any error.
// Usage: node scripts/validate-data.mjs [--today YYYY-MM-DD]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateIngredients, validateStores, validatePriceRecords, validateRoundFile } from '../src/engine/validate.js';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const argToday = process.argv.indexOf('--today');
const today = argToday > -1 ? process.argv[argToday + 1] : new Date().toISOString().slice(0, 10);

const ingredientsDoc = read('data/ingredients.json');
const storesDoc = read('data/stores.json');
const pricesDoc = read('data/prices.json');
const ctx = { ingredients: ingredientsDoc.ingredients, stores: storesDoc.stores };

const errors = [
  ...validateIngredients(ingredientsDoc),
  ...validateStores(storesDoc),
  ...validatePriceRecords(pricesDoc.prices, { ...ctx, today, label: 'prices.json' }),
];
let roundFiles = 0;
for (const round of ['round1', 'round2', 'round3']) {
  const dir = join(root, 'data/sourcing', round);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    roundFiles++;
    errors.push(...validateRoundFile(read(`data/sourcing/${round}/${f}`), ctx).map((e) => `${round}/${f}: ${e}`));
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`OK: ${ctx.ingredients.length} ingredients, ${ctx.stores.length} stores, ${pricesDoc.prices.length} final prices, ${roundFiles} round files`);
