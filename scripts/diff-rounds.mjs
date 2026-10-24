#!/usr/bin/env node
// Diff Round 1 vs Round 2 over the ingredient x store grid and write
// data/sourcing/diff.json. Rows where needsAdjudication() is true go to Round 3.
// The store grid is every store_id that appears in any Round 1/2 record or not_found entry.
import { writeFileSync } from 'node:fs';
import { abs, readJson, roundFiles } from './lib.mjs';
import { diffRounds, needsAdjudication } from '../src/engine/prices.js';

const r1 = roundFiles('round1').map((f) => f.doc);
const r2 = roundFiles('round2').map((f) => f.doc);
const records = (docs) => docs.flatMap((d) => d.records ?? []);
const storeIds = [...new Set([...r1, ...r2].flatMap((d) => [...(d.records ?? []), ...(d.not_found ?? [])].map((x) => x.store_id)))].sort();
const { ingredients } = readJson('data/ingredients.json');
const rows = diffRounds(records(r1), records(r2), ingredients, storeIds);
writeFileSync(abs('data/sourcing/diff.json'), JSON.stringify({ schemaVersion: 1, storeIds, rows }, null, 2) + '\n');
const count = (o) => rows.filter((r) => r.outcome === o).length;
console.log(`stores=${storeIds.join(',')}`);
console.log(`rows=${rows.length} agree=${count('agree')} disagree=${count('disagree')} not_found=${count('not_found')} missing=${count('missing')} spec_mismatch=${count('spec_mismatch')} sameDomain=${rows.filter((r) => r.sameDomain).length} copied=${rows.filter((r) => r.copied).length}`);
console.log(`→ ${rows.filter(needsAdjudication).length} row(s) need Round 3 adjudication (data/sourcing/diff.json)`);
