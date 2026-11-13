import { describe, expect, it } from 'vitest';
import { COLORS, PATTERNS, STICKERS } from './catalog';
import { defaultLooks, liveryStore, randomLook, sanitizeLook, sanitizeLooks, sameLook, toggleSticker, MAX_STICKERS, type LiveryTarget } from './look';
import { stickerSvg } from './paint';
import { exportProgress, importProgress } from '../progress';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

const SNAKE: LiveryTarget = { id: 'snake-battle', parts: [{ id: 'snake', label: '我的蛇', defaults: { color: 'sun', pattern: 'stripes', stickers: [] } }] };
const PORTER: LiveryTarget = {
  id: 'sokoban',
  parts: [
    { id: 'porter', label: '小人', defaults: { color: 'sky', pattern: 'plain', stickers: [] }, maxStickers: 1 },
    { id: 'crate', label: '箱子', defaults: { color: 'sun', pattern: 'stripes', stickers: [] }, patterns: ['plain', 'stripes', 'stars'], maxStickers: 0 },
  ],
};

describe('livery catalogue', () => {
  it('has the agreed sets, unique ids, everything open', () => {
    expect(COLORS).toHaveLength(8);
    expect(PATTERNS.map((p) => p.id)).toEqual(['plain', 'stripes', 'dots', 'stars', 'flames', 'zigzag', 'scales']);
    expect(STICKERS.length).toBeGreaterThanOrEqual(10);
    for (const list of [COLORS, PATTERNS, STICKERS] as readonly (readonly { id: string }[])[]) expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    for (const c of COLORS) { expect(c.base).toMatch(/^#[0-9a-f]{6}$/); expect(c.trim).toMatch(/^#[0-9a-f]{6}$/); }
    // every theme he likes is there
    expect(new Set(STICKERS.map((s) => s.theme))).toEqual(new Set(['space', 'machine', 'myth']));
    // no unlock / price fields anywhere
    expect(JSON.stringify([COLORS, PATTERNS, STICKERS])).not.toMatch(/unlock|price|cost|coin/);
  });
  it('renders every sticker as a die-cut svg with only path data', () => {
    for (const s of STICKERS) {
      const svg = stickerSvg(s.id);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`aria-label="${s.name}"`);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(svg).not.toMatch(/<image|href=/);
    }
    expect(stickerSvg('nope')).toBe('');
  });
});

describe('livery looks', () => {
  it('defaults come from each part', () => {
    expect(defaultLooks(SNAKE)).toEqual({ snake: { color: 'sun', pattern: 'stripes', stickers: [] } });
    expect(Object.keys(defaultLooks(PORTER))).toEqual(['porter', 'crate']);
  });
  it('sanitises unknown ids, duplicates and too many stickers', () => {
    const p = SNAKE.parts[0];
    expect(sanitizeLook(p, { color: 'pink-unicorn', pattern: 'plaid', stickers: ['rocket', 'rocket', 'nope', 'moon', 'gear', 'robot'] }))
      .toEqual({ color: 'sun', pattern: 'stripes', stickers: ['rocket', 'moon', 'gear'] });
    expect(sanitizeLook(p, null)).toEqual(p.defaults);
    expect(sanitizeLook(p, 'junk')).toEqual(p.defaults);
    expect(sanitizeLook(p, { color: 'night', pattern: 'flames', stickers: 'rocket' })).toEqual({ color: 'night', pattern: 'flames', stickers: [] });
    // a part's own limits
    const crate = PORTER.parts[1];
    expect(sanitizeLook(crate, { color: 'jade', pattern: 'dots', stickers: ['rocket'] })).toEqual({ color: 'jade', pattern: 'stripes', stickers: [] });
    expect(sanitizeLook(PORTER.parts[0], { stickers: ['rocket', 'moon'] }).stickers).toEqual(['rocket']);
    expect(sanitizeLooks(PORTER, { porter: { color: 'rocket' }, extra: { color: 'sky' } })).toEqual({ porter: { color: 'rocket', pattern: 'plain', stickers: [] }, crate: { color: 'sun', pattern: 'stripes', stickers: [] } });
  });
  it('toggles stickers up to three and refuses a fourth', () => {
    const p = SNAKE.parts[0];
    let look = { color: 'sun', pattern: 'plain', stickers: [] as string[] };
    for (const id of ['rocket', 'moon', 'gear']) look = { ...look, stickers: toggleSticker(p, look, id)! };
    expect(look.stickers).toEqual(['rocket', 'moon', 'gear']);
    expect(toggleSticker(p, look, 'robot')).toBeNull();
    expect(toggleSticker(p, look, 'moon')).toEqual(['rocket', 'gear']);
    expect(MAX_STICKERS).toBe(3);
  });
  it('random looks are valid and never repeat the current colour', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = SNAKE.parts[0];
    let cur = p.defaults;
    for (let i = 0; i < 200; i++) {
      const next = randomLook(p, rnd, cur);
      expect(sanitizeLook(p, next)).toEqual(next);
      expect(next.color).not.toBe(cur.color);
      expect(next.stickers.length).toBeGreaterThanOrEqual(1);
      expect(next.stickers.length).toBeLessThanOrEqual(3);
      cur = next;
    }
    const crate = PORTER.parts[1];
    for (let i = 0; i < 50; i++) { const l = randomLook(crate, rnd); expect(l.stickers).toEqual([]); expect(['plain', 'stripes', 'stars']).toContain(l.pattern); }
  });
});

describe('livery store', () => {
  it('starts on defaults, saves, counts saves, resets', () => {
    const st = new MemStorage();
    const s = liveryStore(SNAKE, st);
    expect(s.key).toBe('kg:v1:livery:snake-battle');
    expect(s.load()).toEqual(defaultLooks(SNAKE));
    expect(s.saves()).toBe(0);
    expect(s.save({ snake: { color: 'night', pattern: 'stars', stickers: ['rocket', 'saturn'] } })).toBe(true);
    expect(s.load().snake).toEqual({ color: 'night', pattern: 'stars', stickers: ['rocket', 'saturn'] });
    expect(s.saves()).toBe(1);
    s.save(s.load());
    expect(s.saves()).toBe(2);
    s.reset();
    expect(s.load()).toEqual(defaultLooks(SNAKE));
  });
  it('a damaged save falls back to valid looks', () => {
    const st = new MemStorage();
    st.setItem('kg:v1:livery:snake-battle', JSON.stringify({ v: 1, updatedAt: 1, data: { looks: { snake: { color: 42, stickers: ['moon', {}] } }, saves: -3 } }));
    const s = liveryStore(SNAKE, st);
    expect(s.load().snake).toEqual({ color: 'sun', pattern: 'stripes', stickers: ['moon'] });
    expect(s.saves()).toBe(0);
    st.setItem('kg:v1:livery:snake-battle', '{not json');
    expect(s.load()).toEqual(defaultLooks(SNAKE));
  });
  it('rides along with the parent export / import and holds no personal data', () => {
    const st = new MemStorage();
    liveryStore(SNAKE, st).save({ snake: { color: 'jade', pattern: 'scales', stickers: ['cloud'] } });
    const bundle = exportProgress(st);
    expect(Object.keys(bundle.entries)).toContain('kg:v1:livery:snake-battle');
    const raw = bundle.entries['kg:v1:livery:snake-battle'];
    expect(Object.keys(JSON.parse(raw).data).sort()).toEqual(['looks', 'saves']);
    const other = new MemStorage();
    importProgress(bundle, { storage: other });
    expect(liveryStore(SNAKE, other).load().snake).toEqual({ color: 'jade', pattern: 'scales', stickers: ['cloud'] });
  });
  it('keeps one look per target, and the two never mix', () => {
    const st = new MemStorage();
    liveryStore(SNAKE, st).save({ snake: { color: 'rocket', pattern: 'flames', stickers: [] } });
    const porter = liveryStore(PORTER, st);
    expect(porter.load()).toEqual(defaultLooks(PORTER));
    porter.save({ porter: { color: 'leaf', pattern: 'dots', stickers: ['robot'] }, crate: { color: 'steel', pattern: 'stars', stickers: [] } });
    expect(liveryStore(SNAKE, st).load().snake.color).toBe('rocket');
    expect(sameLook(porter.load().crate, { color: 'steel', pattern: 'stars', stickers: [] })).toBe(true);
    expect(() => liveryStore({ id: 'Bad Id', parts: [] }, st)).toThrow();
  });
});
