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
// read from dist when a build exists (the root build is not run by game agents).
import zlib from 'node:zlib';
describe('gzip budgets (§8.11)', () => {
  const gz = (p: string) => zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length;
  it('content JSON ≤ 20 KB gzip (spec 15 KB, deviation noted)', () => {
    const dir = path.join(ROOT, 'content/snake-battle');
    const total = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).reduce((a, f) => a + gz(path.join(dir, f)), 0);
    expect(total).toBeLessThanOrEqual(20 * 1024);
  });
  it('built JS ≤ 120 KB gzip and CSS ≤ 15 KB gzip (when dist exists)', () => {
    const dist = path.join(ROOT, 'dist/assets');
    if (!fs.existsSync(dist)) return;
    const files = fs.readdirSync(dist);
    const js = files.filter((f) => /^(snake-battle|screens2)-.*\.js$/.test(f)).reduce((a, f) => a + gz(path.join(dist, f)), 0);
    const css = files.filter((f) => /^snake-battle-.*\.css$/.test(f)).reduce((a, f) => a + gz(path.join(dist, f)), 0);
    if (js) expect(js).toBeLessThanOrEqual(120 * 1024);
    if (css) expect(css).toBeLessThanOrEqual(15 * 1024);
  });
});
