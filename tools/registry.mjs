// @ts-check
/**
 * Game registry: the single source of truth is one `game.json` per game folder under site/.
 *
 *   site/<id>/index.html   the page (directory = URL, so the game lives at /<id>/)
 *   site/<id>/game.json    metadata validated here
 *
 * Everything else is generated from these files: the hub's card list (virtual:kg-registry),
 * the service-worker precache list, the Playwright smoke-test matrix and the Netlify _redirects.
 * Plain ESM + JSDoc so Node scripts, vite.config.ts and Playwright can all import it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_DIR = path.join(ROOT, 'site');

export const PLACES = /** @type {const} */ (['base', 'playground', 'classic']);
export const STATUSES = /** @type {const} */ (['live', 'wip', 'hidden']);
/** Ability domains (plan §2.3). Parent-facing only; never shown to the child. */
export const DOMAINS = /** @type {const} */ ([
  'number', 'literacy', 'spatial', 'planning', 'coding', 'science', 'engineering',
  'strategy', 'social', 'measurement', 'creativity', 'memory', 'reflex', 'relax',
]);
export const ORIENTATIONS = /** @type {const} */ (['any', 'landscape', 'portrait']);

/**
 * @typedef {object} GameEntry
 * @property {string} id          folder name under site/ (also the URL path segment)
 * @property {string} title       child-facing name (Chinese)
 * @property {string} subtitle    child-facing one-liner: a fantasy action, not a skill label
 * @property {'base'|'playground'|'classic'} place   hub section: 基地 / 游乐场 / 经典角
 * @property {number} order       sort key inside the section (lower first)
 * @property {'live'|'wip'|'hidden'} status  live = on the hub; wip = built, hub only with ?dev; hidden = built, URL only
 * @property {string} accent      CSS colour or a design token name ("--xg-mars")
 * @property {string} icon        an emoji, or an absolute public path (/icons/games/x.svg)
 * @property {string[]} domains   subset of DOMAINS
 * @property {string} parentNote  one sentence for the parent page
 * @property {string[]} [redirectFrom]  old URL paths that should 301 to this game (e.g. "/number-adventure")
 * @property {'any'|'landscape'|'portrait'} [orientation]
 * @property {{ waitFor?: string, skip?: boolean }} [smoke]  smoke-test hints
 * @property {string} href        computed: "/<id>/"
 */

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Every site/**\/index.html, as paths relative to site/ (posix separators). */
export function findPages(siteDir = SITE_DIR) {
  return walk(siteDir, [])
    .filter((f) => path.basename(f) === 'index.html')
    .map((f) => path.relative(siteDir, f).split(path.sep).join('/'))
    .sort();
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isCssColor = (v) => /^(#[0-9a-f]{3,8}|rgb|hsl|oklch|--xg-)/i.test(v);

/**
 * Validate one parsed game.json. Returns a list of human-readable problems (empty = ok).
 * @param {any} g @param {string} folderId
 */
export function validateGame(g, folderId) {
  /** @type {string[]} */ const errs = [];
  const at = `site/${folderId}/game.json`;
  if (!g || typeof g !== 'object') return [`${at}: not a JSON object`];
  if (g.id !== folderId) errs.push(`${at}: id "${g.id}" must equal the folder name "${folderId}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(g.id))) errs.push(`${at}: id must be kebab-case ascii`);
  for (const k of ['title', 'subtitle', 'accent', 'icon', 'parentNote']) if (!isStr(g[k])) errs.push(`${at}: "${k}" is required (non-empty string)`);
  if (!PLACES.includes(g.place)) errs.push(`${at}: place must be one of ${PLACES.join('|')}`);
  if (!STATUSES.includes(g.status)) errs.push(`${at}: status must be one of ${STATUSES.join('|')}`);
  if (typeof g.order !== 'number' || !Number.isFinite(g.order)) errs.push(`${at}: order must be a number`);
  if (isStr(g.accent) && !isCssColor(g.accent)) errs.push(`${at}: accent must be a CSS colour or a --xg-* token`);
  if (isStr(g.icon) && g.icon.startsWith('/') === false && [...g.icon].length > 4) errs.push(`${at}: icon must be an emoji or an absolute /public path`);
  if (isStr(g.icon) && g.icon.startsWith('/') && !fs.existsSync(path.join(ROOT, 'public', g.icon))) errs.push(`${at}: icon file public${g.icon} does not exist`);
  if (!Array.isArray(g.domains) || g.domains.length === 0) errs.push(`${at}: domains must be a non-empty array`);
  else for (const d of g.domains) if (!DOMAINS.includes(d)) errs.push(`${at}: unknown domain "${d}" (allowed: ${DOMAINS.join(', ')})`);
  if (g.orientation !== undefined && !ORIENTATIONS.includes(g.orientation)) errs.push(`${at}: orientation must be one of ${ORIENTATIONS.join('|')}`);
  if (g.redirectFrom !== undefined) {
    if (!Array.isArray(g.redirectFrom)) errs.push(`${at}: redirectFrom must be an array of paths`);
    else for (const r of g.redirectFrom) if (!/^\/[a-z0-9/_-]+$/i.test(r)) errs.push(`${at}: redirectFrom "${r}" must be an absolute path like /old-game`);
  }
  const allowed = new Set(['$schema', 'id', 'title', 'subtitle', 'place', 'order', 'status', 'accent', 'icon', 'domains', 'parentNote', 'redirectFrom', 'orientation', 'smoke', 'notes']);
  for (const k of Object.keys(g)) if (!allowed.has(k)) errs.push(`${at}: unknown field "${k}"`);
  return errs;
}

/**
 * Load and validate every game. Throws one Error listing all problems.
 * A "game" is a top-level folder of site/ that has an index.html. Folders starting with "_" are
 * shared code, not games. Nested pages (site/<id>/sub/index.html) belong to their game.
 * @returns {GameEntry[]} sorted by place, then order
 */
export function loadRegistry(siteDir = SITE_DIR) {
  /** @type {string[]} */ const errs = [];
  /** @type {GameEntry[]} */ const games = [];
  const pages = findPages(siteDir);
  const topDirs = new Set(pages.filter((p) => p !== 'index.html').map((p) => p.split('/')[0]));
  for (const id of [...topDirs].sort()) {
    if (id.startsWith('_')) continue;
    const jsonPath = path.join(siteDir, id, 'game.json');
    if (!fs.existsSync(path.join(siteDir, id, 'index.html'))) continue; // nested-only folder, e.g. site/dev/perf/
    if (!fs.existsSync(jsonPath)) { errs.push(`site/${id}/: has index.html but no game.json`); continue; }
    let g;
    try { g = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { errs.push(`site/${id}/game.json: invalid JSON (${/** @type {Error} */ (e).message})`); continue; }
    const problems = validateGame(g, id);
    if (problems.length) { errs.push(...problems); continue; }
    games.push({ ...g, orientation: g.orientation ?? 'any', redirectFrom: g.redirectFrom ?? [], href: `/${id}/` });
  }
  // cross-game checks
  const redirectOwners = new Map();
  for (const g of games) for (const r of g.redirectFrom ?? []) {
    if (redirectOwners.has(r)) errs.push(`redirectFrom "${r}" claimed by both ${redirectOwners.get(r)} and ${g.id}`);
    redirectOwners.set(r, g.id);
    if (topDirs.has(r.replace(/^\//, '').split('/')[0])) errs.push(`${g.id}: redirectFrom "${r}" points at a folder that still exists in site/ (Netlify serves the file and skips the redirect; delete the folder first)`);
  }
  if (errs.length) throw new Error(`Game registry has ${errs.length} problem(s):\n  - ${errs.join('\n  - ')}`);
  const placeRank = Object.fromEntries(PLACES.map((p, i) => [p, i]));
  return games.sort((a, b) => placeRank[a.place] - placeRank[b.place] || a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * Static redirects for retired URLs live in site/redirects.json:
 *   [{ "from": "/checkers", "to": "/", "status": 302, "force": true, "note": "retired 2026-10" }]
 * @returns {{from:string,to:string,status:number,force?:boolean,note?:string}[]}
 */
export function loadStaticRedirects(siteDir = SITE_DIR) {
  const p = path.join(siteDir, 'redirects.json');
  if (!fs.existsSync(p)) return [];
  const list = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(list)) throw new Error('site/redirects.json must be an array');
  for (const r of list) {
    if (!/^\//.test(r.from) || !/^\//.test(r.to) || ![301, 302].includes(r.status)) throw new Error(`site/redirects.json: bad rule ${JSON.stringify(r)}`);
  }
  return list;
}

/**
 * Netlify _redirects text. Each rule is emitted for both "/x" and "/x/*" so bookmarks of the
 * folder and of any file inside it are covered. "!" forces the rule even if a stale file exists.
 * @param {GameEntry[]} games
 */
export function buildRedirects(games, staticRules = loadStaticRedirects()) {
  const lines = ['# Generated by tools/registry.mjs from site/redirects.json and game.json "redirectFrom". Do not edit dist/_redirects.'];
  const emit = (from, to, status, force) => {
    const f = from.replace(/\/+$/, '');
    lines.push(`${f}  ${to}  ${status}${force ? '!' : ''}`);
    lines.push(`${f}/*  ${to}  ${status}${force ? '!' : ''}`);
  };
  for (const r of staticRules) emit(r.from, r.to, r.status, r.force !== false);
  for (const g of games) for (const from of g.redirectFrom ?? []) emit(from, g.href, 301, true);
  return lines.join('\n') + '\n';
}

/**
 * Netlify _headers rules generated from the page list: every HTML page (and the manifest) must
 * revalidate on each load, so a deploy is visible on the next launch. Explicit paths rather than
 * wildcards because Netlify merges the values of overlapping rules for the same header.
 * @param {string[]} pages  site-relative index.html paths from findPages()
 */
export function buildHeaders(pages) {
  const lines = ['# Generated at build from the page list (tools/registry.mjs buildHeaders).'];
  const paths = new Set(['/manifest.json']);
  for (const rel of pages) {
    const dir = rel === 'index.html' ? '/' : `/${rel.slice(0, -'index.html'.length)}`;
    paths.add(dir);
    paths.add(`${dir}index.html`);
  }
  for (const p of [...paths].sort()) lines.push(p, '  Cache-Control: no-cache');
  return lines.join('\n') + '\n';
}

/** Child-facing section names for the hub (plan §4.1: places, not subjects). */
export const PLACE_LABELS = { base: '基地', playground: '游乐场', classic: '经典角' };

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Static hub markup, rendered at build time into site/index.html (placeholder `<!-- kg:hub -->`),
 * so the hub paints without waiting for JS. `live` games are visible; `wip` games are rendered
 * hidden and revealed by the hub script with ?dev; `hidden` games are never listed.
 * @param {GameEntry[]} games
 */
export function renderHub(games) {
  const listed = games.filter((g) => g.status !== 'hidden');
  const out = [];
  for (const place of PLACES) {
    const inPlace = listed.filter((g) => g.place === place);
    if (!inPlace.length) continue;
    const allWip = inPlace.every((g) => g.status === 'wip');
    out.push(`<section class="hub-section" data-place="${place}"${allWip ? ' data-wip hidden' : ''}>`);
    out.push(`  <h2 class="hub-section__title">${PLACE_LABELS[place]}</h2>`);
    out.push('  <div class="hub-grid">');
    for (const g of inPlace) {
      const icon = g.icon.startsWith('/') ? `<img src="${escapeHtml(g.icon)}" alt="" width="64" height="64">` : escapeHtml(g.icon);
      const wip = g.status === 'wip' ? ' data-wip hidden' : '';
      out.push(`    <a class="hub-card" href="${g.href}" data-game="${g.id}" style="--accent:${escapeHtml(g.accent.startsWith('--') ? `var(${g.accent})` : g.accent)}"${wip}>`);
      out.push(`      <span class="hub-card__icon" aria-hidden="true">${icon}</span>`);
      out.push(`      <span class="hub-card__title">${escapeHtml(g.title)}</span>`);
      out.push(`      <span class="hub-card__subtitle">${escapeHtml(g.subtitle)}</span>`);
      out.push('    </a>');
    }
    out.push('  </div>');
    out.push('</section>');
  }
  return out.join('\n');
}

/** The public subset the hub needs (no parent notes in the child bundle beyond what is shown). */
export function hubEntries(games) {
  return games.map(({ id, title, subtitle, place, order, status, accent, icon, href, domains, parentNote }) => ({ id, title, subtitle, place, order, status, accent, icon, href, domains, parentNote }));
}
