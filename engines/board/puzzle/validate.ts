// puzzle/validate.ts — 谜题校验（工具与 vitest 共用）：在**全体合法首着**上判唯一，不论对方应着数。
// 一步杀：恰有一个当场取胜着（走完对方无合法着法且判走子方胜），它是真将死（不是困毙），且至少 minDecoys 个"只是将军"的诱饵（档 2–3 要求 ≥2）。
// 两步杀：开局无任何当场取胜着（含困毙当场赢）；F = {首着：对方每个应着之后己方都有当场取胜着} 恰有 1 个元素；对方应着 ≥2 且每个应着后都有真将死。
// 独立复核：象棋用外部库、国象用 reference/ 原型对拍——复核代码与生成器不得共享过滤条件。本文件只依赖 GameRules。
import type { GameRules, Side } from '../core/types';

export interface Immediate { enc: string; kind: 'mate' | 'stalemate-win' }
export interface Mate1Verdict { ok: boolean; reasons: string[]; winners: Immediate[]; decoys: string[]; moves: number; mover: Side }
export interface Mate1Options { minDecoys?: number; /** 困毙当场赢也算"别的取胜着"（象棋家规：困毙判负）；缺省 true */ stalemateCounts?: boolean }

/** 走 m 之后是否当场取胜：对方无合法着法且判走子方胜；区分真将死与困毙判负 */
export function immediateWin<M, S>(rules: GameRules<M, S>, s: S, m: M): Immediate | null {
  const mover = rules.turn(s); const s2 = rules.apply(s, m); if (rules.legalMoves(s2).length) return null;
  const st = rules.status(s2); if (!st.over || st.winner !== mover) return null;
  return { enc: rules.encode(m), kind: rules.check(s2) ? 'mate' : 'stalemate-win' };
}
export function immediateWins<M, S>(rules: GameRules<M, S>, s: S): Immediate[] { const out: Immediate[] = []; for (const m of rules.legalMoves(s)) { const w = immediateWin(rules, s, m); if (w) out.push(w); } return out; }
const givesCheck = <M, S>(rules: GameRules<M, S>, s: S, m: M): boolean => !!rules.check(rules.apply(s, m));

export function validateMate1<M, S>(rules: GameRules<M, S>, fen: string, o: Mate1Options = {}): Mate1Verdict {
  const s = rules.fromFen(fen); const L = rules.legalMoves(s); const wins = immediateWins(rules, s); const reasons: string[] = []; const stale = o.stalemateCounts ?? true;
  const counted = stale ? wins : wins.filter((w) => w.kind === 'mate');
  if (counted.length !== 1) reasons.push(`取胜着 ${counted.length} 个（需恰好 1 个）`);
  else if (counted[0].kind !== 'mate') reasons.push('唯一取胜着是困毙，不是真将死');
  const decoys = L.filter((m) => !wins.some((w) => w.enc === rules.encode(m)) && givesCheck(rules, s, m)).map((m) => rules.encode(m));
  if (decoys.length < (o.minDecoys ?? 1)) reasons.push(`诱饵将军 ${decoys.length} 个（需 ≥${o.minDecoys ?? 1}）`);
  return { ok: reasons.length === 0, reasons, winners: wins, decoys, moves: L.length, mover: rules.turn(s) };
}

export interface Mate2Verdict { ok: boolean; reasons: string[]; first: string | null; firstCandidates: string[]; replies: { reply: string; winners: Immediate[] }[]; mover: Side }
export function validateMate2<M, S>(rules: GameRules<M, S>, fen: string): Mate2Verdict {
  const s = rules.fromFen(fen); const mover = rules.turn(s); const reasons: string[] = [];
  if (immediateWins(rules, s).length) reasons.push('开局已有当场取胜着（含困毙当场赢）');
  const F: string[] = []; let chosen: { reply: string; winners: Immediate[] }[] = [];
  for (const m of rules.legalMoves(s)) {
    const s1 = rules.apply(s, m); const R = rules.legalMoves(s1); if (!R.length) continue;           // 走完对方无着法 = 一步杀 / 困毙，不属于两步杀的首着
    const per = R.map((r) => ({ reply: rules.encode(r), winners: immediateWins(rules, rules.apply(s1, r)) }));
    if (per.every((x) => x.winners.length > 0)) { F.push(rules.encode(m)); chosen = per; }
  }
  if (F.length !== 1) reasons.push(`必胜首着 ${F.length} 个（需恰好 1 个）`);
  if (F.length === 1) { if (chosen.length < 2) reasons.push(`对方应着 ${chosen.length} 个（需 ≥2）`); if (!chosen.every((x) => x.winners.some((w) => w.kind === 'mate'))) reasons.push('有应着之后没有真将死（只有困毙当场赢）'); }
  return { ok: reasons.length === 0, reasons, first: F.length === 1 ? F[0] : null, firstCandidates: F, replies: F.length === 1 ? chosen : [], mover };
}
/** "吃子答案则还有别的吃子"：答案是吃子时，必须还有其他吃子着法（否则孩子靠"见子就吃"就能过） */
export function captureAnswerHasAlternatives<M, S>(rules: GameRules<M, S>, fen: string, answer: string): boolean {
  const s = rules.fromFen(fen); const caps = rules.legalMoves(s).filter((m) => rules.moveInfo(s, m).capture); const ans = caps.find((m) => rules.encode(m) === answer); if (!ans) return true; return caps.length >= 2;
}
