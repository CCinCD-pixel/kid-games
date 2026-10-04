#!/usr/bin/env node
// @ts-check
/**
 * Validate the game registry and page conventions. Run by `npm run build` / `npm run check`.
 * Fails (exit 1) with a list of every problem found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildRedirects, findPages, loadRegistry, loadStaticRedirects, ROOT, SITE_DIR } from './registry.mjs';

const RESERVED = new Set(['assets', 'icons', 'audio', 'models', 'fonts', 'kit', 'engines', 'src']);
/** @type {string[]} */ const problems = [];
let games = [];
try {
  games = loadRegistry();
} catch (e) {
  problems.push(/** @type {Error} */ (e).message);
}

for (const g of games) {
  if (RESERVED.has(g.id)) problems.push(`site/${g.id}: "${g.id}" is a reserved top-level path`);
  const html = fs.readFileSync(path.join(SITE_DIR, g.id, 'index.html'), 'utf8');
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`site/${g.id}/index.html: missing <title>`);
}

try {
  const statics = loadStaticRedirects();
  const dirs = new Set(findPages().map((p) => p.split('/')[0]));
  for (const r of statics) {
    const seg = r.from.replace(/^\//, '').split('/')[0];
    if (dirs.has(seg)) problems.push(`site/redirects.json: "${r.from}" is still a folder in site/ — Netlify would serve the file and skip the redirect`);
  }
  buildRedirects(games, statics);
} catch (e) {
  problems.push(/** @type {Error} */ (e).message);
}

if (!fs.existsSync(path.join(ROOT, 'public/icons/apple-touch-icon-180.png'))) problems.push('public/icons/apple-touch-icon-180.png missing (npm run icons)');

if (problems.length) {
  console.error(`check-registry: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
const byStatus = games.reduce((m, g) => ({ ...m, [g.status]: (m[g.status] || 0) + 1 }), /** @type {Record<string,number>} */ ({}));
console.log(`check-registry: ${games.length} games OK (${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ')})`);
