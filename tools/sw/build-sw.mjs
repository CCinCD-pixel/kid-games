// @ts-check
/**
 * Generate dist/sw.js from the built file list (run after `vite build`, see vite.config.ts).
 *   precache: every shell/code file (html, js, css, images, manifest, icons) — versioned per deploy
 *   media:    /audio/**, /models/**, /fonts/** — content-hashed map, cached lazily, survives deploys
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_PREFIXES = ['/audio/', '/models/', '/fonts/'];
const NEVER = new Set(['/sw.js', '/_redirects', '/_headers']);
const SKIP_EXT = /\.(map|txt|md)$/i;

/** @param {string} dir @param {string} [base] @returns {string[]} */
function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((ent) => {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) return listFiles(p, base);
    return ['/' + path.relative(base, p).split(path.sep).join('/')];
  });
}

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

/**
 * @param {string} distDir
 * @param {{ href: string }[]} games
 */
export function buildServiceWorker(distDir, games) {
  const files = listFiles(distDir).sort();
  /** @type {string[]} */ const precache = [];
  /** @type {Record<string,string>} */ const media = {};
  const versionHash = crypto.createHash('sha1');
  for (const f of files) {
    if (NEVER.has(f)) continue;
    const buf = fs.readFileSync(path.join(distDir, f));
    // media binaries are cached lazily; their small JSON manifests are precached so the game knows
    // offline which clips exist
    if (MEDIA_PREFIXES.some((p) => f.startsWith(p)) && !f.endsWith('.json')) {
      media[encodeURI(f)] = sha1(buf);
      continue;
    }
    if (SKIP_EXT.test(f)) continue;
    // pages are cached under their directory URL ("/chess/"), which is what links and navigations use
    const key = encodeURI(f.endsWith("/index.html") ? f.slice(0, -"index.html".length) : f);
    precache.push(key);
    versionHash.update(key).update(sha1(buf));
  }
  const pages = ['/', ...games.map((g) => g.href)].filter((p, i, a) => a.indexOf(p) === i);
  for (const p of pages) if (!precache.includes(p)) throw new Error(`build-sw: page ${p} is registered but missing from dist`);
  const version = versionHash.digest('hex').slice(0, 12);
  const manifest = { version, precache, media, pages };
  const template = fs.readFileSync(path.join(HERE, 'sw-template.js'), 'utf8');
  const out = template.replace('self.__KG_MANIFEST__', JSON.stringify(manifest));
  if (out === template) throw new Error('build-sw: placeholder not found in template');
  fs.writeFileSync(path.join(distDir, 'sw.js'), out);
  return { version, precacheCount: precache.length, mediaCount: Object.keys(media).length };
}
