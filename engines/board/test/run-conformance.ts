// test/run-conformance.ts — vitest 包装：游戏在 games/<id>/rules.test.ts 里 `runConformance(createRules(), fixtures)`，每项 = 一个 it。
import { describe, expect, it } from 'vitest';
import { conformanceChecks, type ConformanceFixtures } from './conformance';
import type { GameRules } from '../core/types';

/** 16 项一致性检查（C01–C16），每项一个 vitest `it`；任何 GameRules 适配器都必须全绿。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runConformance(rules: GameRules<any, any>, fx: ConformanceFixtures, o?: { seed?: number; title?: string }): void {
  describe(`GameRules 一致性 · ${o?.title ?? rules.id}`, () => {
    for (const c of conformanceChecks(rules, fx, o)) {
      it(`${c.id} ${c.name}`, { timeout: 120_000 }, () => {
        const r = c.run();
        expect(r.bad, `${c.id}: ${r.nbad} 处失败`).toEqual([]);
        expect(r.n, `${c.id} 至少做了一个断言（或该项不适用）`).toBeGreaterThanOrEqual(0);
      });
    }
  });
}
