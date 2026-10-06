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
  it('menu music ≤ 1.2 MB; content JSON ≤ 1.5 MB', () => {
    expect(size('site/snake-battle/assets/music/menu.m4a')).toBeLessThan(1.2e6);
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
