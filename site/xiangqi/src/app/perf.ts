// site/xiangqi/src/app/perf.ts — ?dev=perf：真机上量机关人每步的思考耗时（发布门：R6 最大 < 700 ms，规格 §4.3 / V11）。
// 用法：在 iPad 上打开 /xiangqi/?dev=perf（或 ?dev=1&screen=perf），等表格出来；结果也在 window.__perf。不放声音、不写存档。
import { h } from '@kit/ui';
import { createRng } from '@engines/board/core/rng';
import type { AiMoveResult } from '@engines/board/ai/protocol';
import { Position, START_FEN, moveStr } from '../rules/position';
import { ROBOTS } from '../rules/robots';
import { getAi } from '../ai/client';
import type { AppCtx, Screen } from './ctx';

export interface PerfRow { robot: string; n: number; avg: number; p95: number; max: number; gate: number; pass: boolean }
/** 确定性的"中盘局面集"：从开局随机走 8–40 步 */
export function perfPositions(count: number, seed = 20261013): { fen: string; moves: string[] }[] {
  const rng = createRng(seed); const out: { fen: string; moves: string[] }[] = [];
  while (out.length < count) {
    const pos = Position.fromFen(START_FEN); const moves: string[] = []; const plies = 8 + Math.floor(rng.next() * 32);
    for (let i = 0; i < plies; i++) { const ms = pos.legal(); if (!ms.length) break; const m = ms[Math.floor(rng.next() * ms.length)]; moves.push(moveStr(m)); pos.make(m); }
    if (pos.legal().length > 5) out.push({ fen: START_FEN, moves });
  }
  return out;
}
export function mountPerf(ctx: AppCtx, o: { n?: number } = {}): Screen {
  const root = h('div', { class: 'xq-screen xq-perf', 'data-screen': 'perf' }); const out = h('pre', { class: 'xq-perf-out' }, '测量中…'); root.append(h('div', { class: 'xq-title' }, h('span', null, '?dev=perf · 机关人耗时')), out); ctx.root.append(root);
  let dead = false; const ai = getAi(); const rows: PerfRow[] = []; const n = o.n ?? 14;
  void (async () => {
    const ps = perfPositions(n); await ai.request({ op: 'move', startFen: START_FEN, moves: [], level: ROBOTS[5].level, gameSeed: 1, budget: { maxMs: 400, maxDepth: 3 } }).catch(() => undefined);   // 热身
    for (const r of ROBOTS) {
      const ts: number[] = []; for (let i = 0; i < ps.length && !dead; i++) { const t = performance.now(); try { await ai.request<AiMoveResult>({ op: 'move', startFen: ps[i].fen, moves: ps[i].moves, level: r.level, gameSeed: 100 + i, budget: { maxMs: 1800, maxDepth: 8 } }); } catch { /* 记为超时 */ } ts.push(performance.now() - t); }
      ts.sort((a, b) => a - b); const gate = r.id === 'R6' ? 700 : 1800; const max = ts[ts.length - 1] ?? 0; rows.push({ robot: `${r.id} ${r.name}`, n: ts.length, avg: ts.reduce((a, b) => a + b, 0) / Math.max(1, ts.length), p95: ts[Math.min(ts.length - 1, Math.floor(ts.length * 0.95))] ?? 0, max, gate, pass: max < gate });
      out.textContent = fmt(rows, false);
    }
    out.textContent = fmt(rows, true); root.dataset.ready = '1'; (window as unknown as { __perf: unknown }).__perf = { rows, pass: rows.every((x) => x.pass), r6max: rows[5]?.max ?? 0 };
  })();
  function fmt(rs: PerfRow[], done: boolean): string { return `${done ? '完成' : '测量中…'}　UA：${navigator.userAgent.slice(0, 60)}\n` + rs.map((x) => `${x.robot.padEnd(8, '　')} n=${x.n}  平均 ${x.avg.toFixed(0)} ms  p95 ${x.p95.toFixed(0)} ms  最大 ${x.max.toFixed(0)} ms  门槛 <${x.gate}  ${x.pass ? '通过' : '未通过'}`).join('\n') + (done ? `\n\nR6 最大 ${rs[5]?.max.toFixed(0)} ms ${rs[5]?.pass ? '< 700：发布门通过' : '≥ 700：请降 R6 节点并重跑校准'}` : ''); }
  return { resize: () => undefined, destroy: () => { dead = true; root.remove(); }, onBack: () => { ctx.go({ to: 'hall' }); return true; } };
}
