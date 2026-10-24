#!/usr/bin/env node
// LOCAL-ONLY helper: pulls candidate products from Woolworths' public website
// search so a price-sourcer agent can pick the SKU that matches each
// ingredient's `spec`. It writes RAW candidates, not price records: the agent
// still chooses the SKU, writes the verbatim quote and assigns confidence.
//
// UNTESTED from the cloud sandbox (woolworths.com.au is unreachable there).
// The endpoint and field names are those used by the woolworths.com.au web app
// and community tools; if they changed, the script says so and you fall back to
// curl'd product pages (see docs/SOURCING.md).
//
// Personal use only: one query at a time with a delay, no parallelism.
//
// Usage:
//   node scripts/fetch-woolworths.mjs "chicken breast" "greek yoghurt"
//   node scripts/fetch-woolworths.mjs --all            # one query per ingredient name
//   node scripts/fetch-woolworths.mjs --all --out data/sourcing/snapshots/shared/ww.json
//
// The output file doubles as a snapshot: a record sourced from it sets
// "snapshot" to this path and quotes the candidate's cup_string verbatim.
// "Works" = at least 80% of --all queries return >= 1 candidate.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { abs, readJson, sydneyToday } from './lib.mjs';

const BASE = 'https://www.woolworths.com.au';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 1500;

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const today = sydneyToday();
const outPath = outIdx > -1 ? args[outIdx + 1] : `data/sourcing/snapshots/shared/woolworths-search-${today}.json`;
let queries = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
if (args.includes('--all')) {
  const { ingredients } = readJson('data/ingredients.json');
  queries = ingredients.map((i) => ({ ingredient_id: i.id, term: i.name.replace(/\s*\(.*?\)|\s+\d.*$/g, '').trim() }));
} else {
  queries = queries.map((term) => ({ ingredient_id: null, term }));
}
if (!queries.length) {
  console.error('Give search terms or --all');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootstrapCookies() {
  const res = await fetch(BASE + '/', { headers: { 'user-agent': UA, accept: 'text/html' } });
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
  if (!res.ok) throw new Error(`homepage HTTP ${res.status}`);
  return cookies.join('; ');
}

async function search(term, cookie) {
  const body = {
    Filters: [], IsSpecial: false, PageNumber: 1, PageSize: 12, SearchTerm: term, SortType: 'TraderRelevance',
    Location: `/shop/search/products?searchTerm=${encodeURIComponent(term)}`,
  };
  const res = await fetch(BASE + '/apis/ui/Search/products', {
    method: 'POST',
    headers: { 'user-agent': UA, accept: 'application/json', 'content-type': 'application/json', cookie, origin: BASE, referer: BASE + body.Location },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`search HTTP ${res.status}: ${text.slice(0, 120)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('search returned non-JSON (bot wall or API change)'); }
  const groups = data.Products ?? [];
  return groups.flatMap((g) => g.Products ?? [g]).map((p) => ({
    stockcode: p.Stockcode,
    name: p.DisplayName ?? p.Name,
    price: p.Price ?? null, // dollars as shown online
    was_price: p.WasPrice ?? null,
    on_special: Boolean(p.IsOnSpecial),
    cup_price: p.CupPrice ?? null, // dollars per CupMeasure
    cup_measure: p.CupMeasure ?? null, // e.g. "1KG", "100G"
    cup_string: p.CupString ?? null, // verbatim unit-price text, good for the quote
    package_size: p.PackageSize ?? null,
    available: p.IsAvailable ?? null,
    url: p.Stockcode ? `${BASE}/shop/productdetails/${p.Stockcode}` : null,
  }));
}

const results = [];
try {
  const cookie = await bootstrapCookies();
  for (const q of queries) {
    try {
      const products = await search(q.term, cookie);
      results.push({ ...q, ok: true, products });
      console.error(`✓ ${q.term}: ${products.length} candidates`);
    } catch (e) {
      results.push({ ...q, ok: false, error: String(e.message ?? e) });
      console.error(`✗ ${q.term}: ${e.message ?? e}`);
    }
    await sleep(DELAY_MS);
  }
} catch (e) {
  console.error(`Could not reach Woolworths (${e.message ?? e}). Sourcers fall back to curl'd product pages (docs/SOURCING.md).`);
  process.exit(1);
}

const out = { schemaVersion: 1, source: 'woolworths-web-search', channel: 'online', fetched: today, note: 'Online price; may differ from in-store. Raw candidates for Round 1 price-sourcers only (Round 2 must not use this file).', results };
mkdirSync(dirname(abs(outPath)), { recursive: true });
writeFileSync(abs(outPath), JSON.stringify(out, null, 2) + '\n');
console.error(`wrote ${outPath}`);
