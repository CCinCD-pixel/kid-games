/** Phrase units for caption line breaks (QA r1: no 重/做 widows; names and props never split). */
import { describe, expect, it } from 'vitest';
import { phraseUnits } from './src/screens/wrap';
import { LINES } from './src/data';

describe('phraseUnits', () => {
  it('breaks only at phrase edges', () => {
    expect(phraseUnits('撤多了，可以点重做')).toEqual(['撤多了，', '可以点', '重做']);
    expect(phraseUnits('侦探放大镜徽章')).toEqual(['侦探', '放大镜', '徽章']);
    expect(phraseUnits('进墙角了！推不出来了')).toEqual(['进墙角了！', '推不出来了']);
    expect(phraseUnits('以前的推箱子，欢迎回来')?.join('|')).toContain('推箱子，');
    expect(phraseUnits('小步步调度员，火箭等着装货！')?.[0].startsWith('小步步')).toBe(true);
  });
  it('keeps every line intact (units join back to the text) and never splits 小步步 / 推箱子 / 发射台', () => {
    for (const l of LINES) {
      const u = phraseUnits(l.text)!;
      expect(u.join(''), l.id).toBe(l.text);
      for (const k of ['小步步', '推箱子', '发射台']) {
        if (!l.text.includes(k)) continue;
        expect(u.some((x) => x.includes(k)), `${l.id}: ${u.join('|')}`).toBe(true);
      }
      // no unit is wider than a landscape caption line (≈ 8 characters at 22 px in 224 px)
      for (const x of u) expect([...x.replace(/[\s，。！？、：；…]/gu, '')].length, `${l.id}: ${x}`).toBeLessThanOrEqual(8);
    }
  });
});
