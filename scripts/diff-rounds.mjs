#!/usr/bin/env node
// Diff Round 1 vs Round 2 sourcing output and write data/sourcing/diff.json.
// Rows with outcome disagree | not_found | spec_mismatch, or sameDomain=true,
// go to the Round 3 adjudicator.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffRounds } from '../src/engine/prices.js';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const records = (round) => {
  const dir = join(root, 'data/sourcing', round);
  return readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => read(join(dir, f)).records ?? []);
};
const { ingredients } = read(join(root, 'data/ingredients.json'));
const rows = diffRounds(records('round1'), records('round2'), ingredients);
const needsAdjudication = rows.filter((r) => r.outcome !== 'agree' || r.sameDomain);
writeFileSync(join(root, 'data/sourcing/diff.json'), JSON.stringify({ schemaVersion: 1, rows }, null, 2) + '\n');
const count = (o) => rows.filter((r) => r.outcome === o).length;
console.log(`rows=${rows.length} agree=${count('agree')} disagree=${count('disagree')} not_found=${count('not_found')} spec_mismatch=${count('spec_mismatch')} sameDomain=${rows.filter((r) => r.sameDomain).length}`);
console.log(`→ ${needsAdjudication.length} row(s) need Round 3 adjudication (see data/sourcing/diff.json)`);
