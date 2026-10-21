// site/xiangqi/src/progress/metrics.ts — 家长页 3 项指标（§1）：① 课程进度；② 对弈；③ 一步杀首次做对率（近 30 题）。只给家长看，不影响难度 / 星 / 解锁。
import { registerMetrics } from '@kit/metrics';
import type { Store } from '@kit/progress';
import { ROBOT_IDS, lessonsDone, xjDone, type XqSave } from './save';
import { ROBOTS } from '../rules/robots';

export function setupMetrics(store: Store<XqSave>): { refresh(): void } {
  const m = registerMetrics('xiangqi', [
    { id: 'lessons', label: '课程进度', value: () => { const s = store.load(); const d = lessonsDone(s); const x = xjDone(s); if (d === 0 && x === 0) return null; return { value: `${d} / 33`, frac: d / 33, detail: `学堂已通关的课；小局已赢 ${x} / 28`, status: 'ok' as const }; } },
    { id: 'games', label: '对弈', value: () => {
      const s = store.load(); const last = s.history.slice(-10); if (!last.length) return null; const w = last.filter((g) => g.result === 'w').length, d = last.filter((g) => g.result === 'd').length;
      const top = [...ROBOT_IDS].reverse().find((id) => s.robots[id].w > 0); const shown = last.reduce((a, g) => a + g.coachShown, 0), acc = last.reduce((a, g) => a + g.coachAccepted, 0);
      const bad = last.length >= 5 && w === 0;
      return { value: `${w}胜${d}和${last.length - w - d}负`, frac: w / last.length, detail: `近 ${last.length} 盘；赢过最高：${top ? (ROBOTS[ROBOT_IDS.indexOf(top)]?.name ?? top) : '还没有'}${shown ? `；教练提醒后改走 ${acc}/${shown}` : ''}`, status: bad ? ('watch' as const) : ('ok' as const), hint: bad ? '最近几盘有点吃力，可以陪他玩一次' : undefined };
    } },
    { id: 'mate1', label: '一步杀做对率', value: () => { const r = store.load().puzzles.recent30; if (r.length < 5) return null; const rate = r.filter(Boolean).length / r.length; return { value: `${Math.round(rate * 100)}%`, frac: rate, detail: `近 ${r.length} 题首次做对`, status: rate < 0.4 ? ('watch' as const) : ('ok' as const), hint: rate < 0.4 ? '这一块有点吃力，可以陪他玩一次' : undefined }; } },
  ]);
  return { refresh: () => m.refresh() };
}
