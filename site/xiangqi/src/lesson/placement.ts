// site/xiangqi/src/lesson/placement.ts — 摸底判分与推荐（纯函数，vitest 覆盖）。
import { XQ_LESSONS, XQ_PLACEMENT } from './data';

/** 摸底判分：每题只证明它测过的课（tests）；一道题没全对，它测的课都不算会；没被任何题测过的课一律不动。 */
export function gradePlacement(results: readonly { stepId: string; correct: boolean }[]): { known: string[]; tested: string[] } {
  const ok = new Map<string, boolean>(); for (const st of XQ_PLACEMENT) { const r = results.find((x) => x.stepId === st.id); const correct = !!r && r.correct; for (const id of st.tests) ok.set(id, (ok.get(id) ?? true) && correct); }
  return { known: [...ok].filter(([, v]) => v).map(([k]) => k), tested: [...ok.keys()] };
}
/** 推荐接着学的课：没学过也没测会的课。应将三法 / 将死 / 困毙判负（象棋最特别的三课，摸底从不测）排最前，其余按课序。 */
export function recommendAfter(isKnownOrDone: (id: string) => boolean): string[] {
  const left = XQ_LESSONS.map((l) => l.id).filter((id) => !isKnownOrDone(id)); const first = ['L18', 'L19', 'L20'].filter((id) => left.includes(id)); return [...first, ...left.filter((id) => !first.includes(id))];
}
