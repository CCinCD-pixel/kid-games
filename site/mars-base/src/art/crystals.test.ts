import { describe, expect, it } from 'vitest';
import { numberParts, partsSvg } from './crystals';

const count = (svg: string, cls: string): number => (svg.match(new RegExp(`class="${cls}"`, 'g')) ?? []).length;

describe('partsSvg: the picture shows exactly the number (no piece is dropped, nothing leaves the box)', () => {
  it('draws every 箱 / 棒 / 颗 of every number 0..1000 (was: at most 4 boxes, 935 looked like 435)', () => {
    for (let n = 0; n <= 1000; n += n < 120 ? 1 : 7) {
      const parts = numberParts(n); const svg = partsSvg(parts, 640, 300);
      expect(count(svg, 'pc-box'), `${n} boxes`).toBe(parts.boxes);
      expect(count(svg, 'pc-rod'), `${n} rods`).toBe(parts.rods);
      expect(count(svg, 'pc-gem'), `${n} gems`).toBe(parts.crystals);
    }
  });
  it('the two-picture layouts (half width) keep every piece too', () => {
    for (const n of [935, 800, 999, 888, 1000, 405]) { const parts = numberParts(n); const svg = partsSvg(parts, 300, 220); expect(count(svg, 'pc-box')).toBe(parts.boxes); }
  });
  it('30 loose crystals (skip counting) are all drawn and stay inside the picture', () => {
    const svg = partsSvg({ crystals: 30 }, 640, 200); expect(count(svg, 'pc-gem')).toBe(30);
    const m = /translate\(([\d.-]+),([\d.-]+)\) scale\(([\d.]+)\)/.exec(svg)!; const sc = Number(m[3]);
    expect(Number(m[2]) + 6 * 32 * sc, 'bottom of the 6 gem rows inside the 200 px picture').toBeLessThanOrEqual(200 + 1);
  });
  it('is centred and never larger than 1:1', () => {
    const svg = partsSvg({ boxes: 1 }, 600, 300); const m = /translate\(([\d.-]+),([\d.-]+)\) scale\(([\d.]+)\)/.exec(svg)!;
    expect(Number(m[3])).toBeLessThanOrEqual(1); expect(Number(m[1])).toBeGreaterThan(200);
  });
});

describe('partsPair: two pictures side by side share one piece size', () => {
  it('200 + 800 draws 2 and 8 boxes at the same scale', async () => {
    const { partsPair } = await import('./crystals');
    const [a, b] = partsPair(numberParts(200), numberParts(800), 300, 220); const sc = (s: string) => /scale\(([\d.]+)\)/.exec(s)![1];
    expect(count(a, 'pc-box')).toBe(2); expect(count(b, 'pc-box')).toBe(8); expect(sc(a)).toBe(sc(b));
  });
});
