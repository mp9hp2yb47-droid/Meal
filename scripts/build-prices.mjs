#!/usr/bin/env node
// Build data/prices.json from data/sourcing/diff.json (cleanly agreed rows → their
// Round 2 record) plus every Round 3 record. Run after the adjudicator, then validate.
import { writeFileSync } from 'node:fs';
import { abs, readJson, roundFiles, sydneyToday } from './lib.mjs';
import { buildFinalPrices } from '../src/engine/prices.js';

const { rows } = readJson('data/sourcing/diff.json');
const r3 = roundFiles('round3').flatMap((f) => f.doc.records ?? []);
const prices = buildFinalPrices(rows, r3);
writeFileSync(abs('data/prices.json'), JSON.stringify({ schemaVersion: 1, generated: sydneyToday(), notes: 'Built by scripts/build-prices.mjs. Do not hand-edit; fix the round files and rebuild.', prices }, null, 2) + '\n');
console.log(`wrote data/prices.json: ${prices.length} prices (${prices.filter((p) => p.round === 2).length} agreed, ${prices.filter((p) => p.round === 3).length} adjudicated)`);
