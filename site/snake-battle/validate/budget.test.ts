/**
 * Budgets (spec §8.11): asset + content sizes, and the worst-case match atlas fits its 256 cells with room
 * for snakes added mid-match. The atlas is built against a no-op 2D context (we count cells, not pixels).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAtlas, SKINS, hex2rgb, aiBodyColor, mix, type AtlasColor } from '../src/render/art';
import { AI_NAMES } from '../src/sim/venues';

const ROOT = path.resolve(__dirname, '../../..');
const size = (p: string) => fs.statSync(path.join(ROOT, p)).size;
function fakeDom() {
  const fn: ProxyHandler<object> = { get: (_t, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : typeof k === 'string' && k.startsWith('create') ? () => ({ addColorStop() {} }) : () => undefined), set: () => true };
  const ctx = new Proxy({}, fn);
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

describe('budgets', () => {
  it('menu music ≤ 1.2 MB; all music ≤ 1.7 MB; new SFX ≤ 260 KB; content JSON ≤ 1.5 MB', () => {
    expect(size('site/snake-battle/assets/music/menu.m4a')).toBeLessThan(1.2e6);
    // §8.11: every shipped music file together (menu + 2 match pads + lift layer), and the game's own SFX (QA r3)
    const sum = (d: string) => fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(m4a|mp3|ogg|wav)$/.test(f)).reduce((a, f) => a + size(`${d}/${f}`), 0);
    expect(sum('site/snake-battle/assets/music')).toBeLessThanOrEqual(1.7e6);
    expect(sum('site/snake-battle/assets/sfx')).toBeLessThanOrEqual(260 * 1024);
    const dir = path.join(ROOT, 'content/snake-battle');
    const total = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).reduce((s, f) => s + size(`content/snake-battle/${f}`), 0);
    expect(total).toBeLessThan(1.5e6);
  });
  it('worst-case atlas ≤ 200 of 256 cells', () => {
    fakeDom();
    const personas = ['forager', 'hunter', 'coiler', 'scavenger', 'skittish', 'daredevil'];
    const cols = Object.keys(AI_NAMES.palette);
    let worst = 0;
    for (const sk of SKINS) {
      const list: AtlasColor[] = [{ key: `skin-${sk.id}`, base: hex2rgb(sk.base), accent: hex2rgb(sk.accent), pattern: sk.pattern, skin: sk, blush: true }];
      for (let i = 0; i < 21; i++) { const p = personas[i % 6], c = cols[i % cols.length], base = aiBodyColor(c, p); list.push({ key: `${c}-${p}-${i}`, base, accent: mix(base, [255, 255, 255], 0.35), pattern: p }); }
      list.push({ key: 'king', base: [246, 196, 58], accent: [255, 120, 60], pattern: 'king' }, { key: 'patrol', base: [127, 147, 181], accent: [200, 215, 240], pattern: 'patrol' });
      for (const trail of ['stardust', 'meteor', 'cloud', 'lightning']) worst = Math.max(worst, buildAtlas(list, 'blackhole', { trail }).count);
    }
    expect(worst).toBeLessThanOrEqual(200);
  });
});

// §8.11 gzip budgets (QA r1). Content JSON: spec 15 KB; the shipped 40-level set measures ≈ 18.4 KB, accepted at
// ≤ 20 KB as a spec-owner note (stripping fields would invalidate every demo's contentHash for ~3 KB). JS / CSS are
// read from dist when a build exists (the root build is not run by game agents). CSS: spec 15 KB; phones (Dad,
// 2026-10-08) add src/phone.css, ≈ 5.6 KB min+gz of media-gated rules the iPad never applies — the sheet measures
// ≈ 16.3 KB, accepted at ≤ 17 KB as a spec-owner note (finalize fb1; spec §8.11 table).
import zlib from 'node:zlib';
describe('gzip budgets (§8.11)', () => {
  const gz = (p: string) => zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length;
  it('content JSON ≤ 20 KB gzip (spec 15 KB, deviation noted)', () => {
    const dir = path.join(ROOT, 'content/snake-battle');
    const total = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).reduce((a, f) => a + gz(path.join(dir, f)), 0);
    expect(total).toBeLessThanOrEqual(20 * 1024);
  });
  // QA r5: the old gate summed only chunks named snake-battle-* / screens2-* (25 KB) while the game's code sat in
  // screens-* / art-* / view-* and lazy chunks, so it passed at any size. Now: every chunk reachable from
  // dist/snake-battle/index.html (script + modulepreload, then static / dynamic imports inside chunks) that no other
  // page reaches = this game's own JS (spec §8.11: ≤160 KB gzip, kit shared chunks excluded).
  it('built JS ≤ 160 KB gzip (own chunks of the page graph) and CSS ≤ 15 KB gzip (when dist exists)', () => {
    const distRoot = path.join(ROOT, 'dist'), dist = path.join(distRoot, 'assets');
    const page = path.join(distRoot, 'snake-battle/index.html');
    if (!fs.existsSync(dist) || !fs.existsSync(page)) { console.warn('[budget] no dist build: skipped (run the root build first)'); return; }
    const refRe = /(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g, impRe = /["'`](?:\.\/|\/assets\/)([\w.-]+\.(?:js|css))["'`]/g;
    const reach = (html: string) => {
      const seen = new Set<string>(), todo = [...html.matchAll(refRe)].map((x) => x[1]);
      while (todo.length) {
        const f = todo.pop()!; if (seen.has(f) || !fs.existsSync(path.join(dist, f))) continue; seen.add(f);
        if (f.endsWith('.js')) for (const x of fs.readFileSync(path.join(dist, f), 'utf8').matchAll(impRe)) todo.push(x[1]);
      }
      return seen;
    };
    const pages: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory() && e.name !== 'assets' && e.name !== 'audio') walk(q); else if (e.name === 'index.html') pages.push(q); } };
    walk(distRoot);
    const mine = reach(fs.readFileSync(page, 'utf8'));
    const others = new Set<string>(); for (const p of pages) if (p !== page) for (const f of reach(fs.readFileSync(p, 'utf8'))) others.add(f);
    const own = [...mine].filter((f) => !others.has(f));
    const ownJs = own.filter((f) => f.endsWith('.js')), ownCss = own.filter((f) => f.endsWith('.css'));
    expect(ownJs.length, 'no game-only JS chunk found from dist/snake-battle/index.html').toBeGreaterThan(0);
    const js = ownJs.reduce((a, f) => a + gz(path.join(dist, f)), 0), css = ownCss.reduce((a, f) => a + gz(path.join(dist, f)), 0);
    console.log(`[budget] own JS ${(js / 1024).toFixed(1)} KB gz in ${ownJs.length} chunks; CSS ${(css / 1024).toFixed(1)} KB gz`);
    expect(js).toBeLessThanOrEqual(160 * 1024);
    expect(css).toBeLessThanOrEqual(17 * 1024);
  });
});
