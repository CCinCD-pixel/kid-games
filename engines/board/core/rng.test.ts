import { describe, expect, it } from 'vitest';
import { createRng as kitRng } from '@kit/rng';
import { createRng, hash32 } from './rng';

describe('core/rng 与 @kit/rng 同算法', () => {
  it('100 个种子 × 200 个数逐位相同', () => {
    for (let s = 1; s <= 100; s++) {
      const seed = (s * 2654435761) >>> 0;
      const a = createRng(seed), b = kitRng(seed);
      for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next());
    }
  });
  it('hash32 稳定、对顺序敏感、分布不退化', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hash32(42, 9, 1)).toMatchInlineSnapshot(`1245054329`);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(hash32(7, i, i * 31));
    expect(seen.size).toBe(5000);
  });
  it('getState/setState 可复原序列', () => {
    const r = createRng(99); r.next(); const st = r.getState(); const a = r.next(); r.setState(st); expect(r.next()).toBe(a);
  });
});
