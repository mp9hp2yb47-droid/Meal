#!/usr/bin/env node
// Validate data files. Exit 1 on any error.
//   node scripts/validate-data.mjs                     # everything
//   node scripts/validate-data.mjs --file data/sourcing/round1/protein.json   # one round file only
//   node scripts/validate-data.mjs --snapshots         # strict: every snapshot must exist and contain quote + price
//   node scripts/validate-data.mjs --today 2026-10-28
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { abs, readJson, sydneyToday, argValue, roundFiles } from './lib.mjs';
import { checkSnapshot } from '../src/engine/prices.js';
import {
  validateIngredients, validateStores, validatePriceRecords, validateRoundFile, validateRecipes, validateHelloFresh,
} from '../src/engine/validate.js';

const today = argValue('--today') ?? sydneyToday();
const only = argValue('--file');
const strictSnapshots = process.argv.includes('--snapshots');

const ingredientsDoc = readJson('data/ingredients.json');
const storesDoc = readJson('data/stores.json');
const ctx = { ingredients: ingredientsDoc.ingredients, stores: storesDoc.stores };
const errors = [];
let missingSnapshots = 0;

function snapshotChecks(records, label) {
  for (const r of records) {
    if (!r.snapshot) continue;
    const at = `${label} ${r.ingredient_id}@${r.store_id}`;
    if (!existsSync(abs(r.snapshot))) {
      missingSnapshots++;
      if (strictSnapshots) errors.push(`${at}: snapshot missing: ${r.snapshot}`);
      continue;
    }
    errors.push(...checkSnapshot(r, readFileSync(abs(r.snapshot), 'utf8')).map((p) => `${at}: ${p} (${r.snapshot})`));
  }
}

let files = roundFiles('round1').concat(roundFiles('round2'), roundFiles('round3'));
if (only) {
  files = files.filter((f) => f.path === only.replace(/^\.\//, ''));
  if (!files.length) errors.push(`--file ${only}: not a round file`);
} else {
  errors.push(...validateIngredients(ingredientsDoc), ...validateStores(storesDoc));
  const prices = readJson('data/prices.json').prices;
  errors.push(...validatePriceRecords(prices, { ...ctx, today, label: 'prices.json', allowedRounds: [2, 3] }));
  snapshotChecks(prices, 'prices.json');
  if (existsSync(abs('data/recipes.json'))) errors.push(...validateRecipes(readJson('data/recipes.json'), ctx));
  if (existsSync(abs('data/hellofresh'))) {
    for (const f of readdirSync(abs('data/hellofresh')).filter((f) => f.endsWith('.json'))) {
      errors.push(...validateHelloFresh(readJson(`data/hellofresh/${f}`)).map((e) => `${f}: ${e}`));
    }
  }
}
for (const { path, doc } of files) {
  errors.push(...validateRoundFile(doc, ctx).map((e) => `${path}: ${e}`));
  snapshotChecks(doc.records ?? [], path);
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
const warn = missingSnapshots ? ` (warning: ${missingSnapshots} snapshot file(s) not on this machine; run with --snapshots where they exist)` : '';
console.log(`OK: ${only ?? `${ctx.ingredients.length} ingredients, ${ctx.stores.length} stores, ${files.length} round files`}${warn}`);
