import { describe, expect, it } from 'vitest';
import { alpha, contrast, darken, deltaLstar, fromLch, hexOf, labOf, lchOf, lighten, luminance, mix, parseColor, toHex, toyPalette } from './shade';

describe('OKLab 配色配方', () => {
  it('sRGB ↔ OKLab 往返误差 ≤ 1/255', () => {
    for (const c of ['#000000', '#ffffff', '#c93a2c', '#f4d9a8', '#231a3a', '#1aa892', '#fdd877', '#8594d6']) { const back = parseColor(hexOf(labOf(c))); const a = parseColor(c); for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - a[i])).toBeLessThanOrEqual(1); }
    expect(toHex([255, 0, 128])).toBe('#ff0080'); expect(parseColor('#fa0')).toEqual([255, 170, 0]); expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
  });
  it('OKLab 已知值：白 L=1、黑 L=0；明度单调；变暗不改色相', () => {
    expect(labOf('#ffffff').L).toBeCloseTo(1, 2); expect(labOf('#000000').L).toBeCloseTo(0, 3);
    const base = '#c93a2c'; expect(lchOf(lighten(base, 0.1)).L).toBeGreaterThan(lchOf(base).L); expect(lchOf(darken(base, 0.1)).L).toBeLessThan(lchOf(base).L);
    const dh = Math.abs(lchOf(darken(base, 0.1)).h - lchOf(base).h); expect(dh).toBeLessThan(0.05);
    expect(fromLch(lchOf('#7bd8c6'))).toBe('#7bd8c6');
  });
  it('mix 端点与中点；alpha 输出 rgba', () => { expect(mix('#000000', '#ffffff', 0)).toBe('#000000'); expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff'); expect(labOf(mix('#000000', '#ffffff', 0.5)).L).toBeCloseTo(0.5, 1); expect(alpha('#102030', 0.5)).toBe('rgba(16,32,48,0.5)'); });
  it('WCAG 对比度：黑白 21:1；规格里的红字对木面 ≥ 4.5', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0); expect(luminance('#ffffff')).toBeCloseTo(1, 3);
    expect(contrast('#7d160f', '#f4d9a8')).toBeGreaterThan(7); expect(contrast('#7d160f', '#e3b979')).toBeGreaterThan(5.5); expect(contrast('#fdd877', '#231a3a')).toBeGreaterThan(11);
    expect(deltaLstar('#231a3a', '#4658a8')).toBeGreaterThan(20);
  });
  it('toyPalette：亮面比暗面亮、侧面最暗；木 / 漆两种配方', () => {
    for (const kind of ['wood', 'lacquer'] as const) { const p = toyPalette('#eecb94', kind); const L = (c: string): number => labOf(c).L; expect(L(p.hi)).toBeGreaterThan(L(p.lo)); expect(L(p.lo)).toBeGreaterThan(L(p.side)); if (kind === 'wood') expect(L(p.rim)).toBeLessThan(L(p.lo)); }
    const b = toyPalette('#231a3a', 'lacquer'); expect(labOf(b.rim).L).toBeGreaterThan(labOf('#231a3a').L + 0.2);
  });
});
