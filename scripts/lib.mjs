// Shared helpers for the data scripts (I/O lives here, not in src/engine/).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const root = new URL('..', import.meta.url).pathname;
export const abs = (p) => resolve(root, p);
export const readJson = (p) => JSON.parse(readFileSync(abs(p), 'utf8'));

// Today's date in Sydney (the user's timezone), YYYY-MM-DD.
export const sydneyToday = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d);

export function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// [{ path, doc }] for every JSON file in data/sourcing/<round>/.
export function roundFiles(round) {
  const dir = abs(join('data/sourcing', round));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ path: `data/sourcing/${round}/${f}`, doc: readJson(`data/sourcing/${round}/${f}`) }));
}
