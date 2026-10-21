// site/xiangqi/src/rules/highlights.ts — 复盘"精彩时刻"（规格 §5.3）：纯函数，扫一遍整盘，只评孩子的着。
// 分值：mate 80（正）· fork 70 · win 50 · missMate 70（负）· hang 55 · missFree 45；挑选 = 最高正面 → 最高负面 → 第二正面，≤3 条，按时间排序。
import { Position, parseMove, notation } from './position';
type Pos = Position;

const VAL = [0, 0, 200, 200, 400, 900, 450, 100];     // 帅 仕 相 马 车 炮 兵（厘兵；与评估一致）
const val = (p: number): number => VAL[p & 7] ?? 0;
export type HlKind = 'mate' | 'fork' | 'win' | 'missMate' | 'hang' | 'missFree';
export interface Highlight {
  kind: HlKind; positive: boolean; score: number;
  /** 复盘应跳到的局面序号（0 = 开局；n = 走完第 n 步后） */ ply: number;
  /** 孩子那一步的序号（0 起，对应 moves[i]） */ moveIx: number;
  /** 旁白 / 文案 id（xq. 前缀可省） */ line: string;
  /** 要在棋盘上标的箭头（missMate / missFree：错过的着；其余：孩子走的着） */ arrow?: [number, number];
  /** 要标的格（fork 的两个目标、hang 被吃的子、win 吃到的子） */ squares: number[];
  /** 孩子那一步的中文记谱 */ text: string;
}
const SCORE: Record<HlKind, number> = { mate: 80, fork: 70, win: 50, missMate: 70, hang: 55, missFree: 45 };
const LINE: Record<HlKind, string> = { mate: 'r.mate', fork: 'r.fork', win: 'r.win', missMate: 'r.miss', hang: 'r.hang', missFree: 'r.free' };

function mateMoves(pos: Pos): number[] { const out: number[] = []; for (const m of pos.legal()) { pos.make(m); const over = pos.legal().length === 0; pos.unmake(); if (over) out.push(m); } return out; }
/** 在 pos（走子方 = pos.side）下，吃子 m 的静态净得分：被吃子价值 − （落点被对方攻击 ? 吃子者价值 : 0） */
function netGain(pos: Pos, m: number): number {
  const from = m & 127, to = m >> 7, cap = pos.b[to]; if (!cap) return 0; const mover = pos.b[from]; const side = pos.side;
  pos.make(m); const risky = pos.attacked(to, side ^ 8); pos.unmake(); return val(cap) - (risky ? val(mover) : 0);
}

export function detectHighlights(startFen: string, moves: readonly string[], kidSide: 0 | 1): Highlight[] {
  const out: Highlight[] = []; const pos = Position.fromFen(startFen); const kidCol = kidSide === 0 ? 0 : 8;
  const push = (h: Omit<Highlight, 'score' | 'line'>): void => { out.push({ ...h, score: SCORE[h.kind], line: LINE[h.kind] }); };
  for (let i = 0; i < moves.length; i++) {
    let m: number; try { m = parseMove(moves[i]); } catch { break; } if (!pos.legal().includes(m)) break;
    if (pos.side === kidCol) {
      const from = m & 127, to = m >> 7, mover = pos.b[from], gain = netGain(pos, m), text = notation(pos, m);
      const mates = mateMoves(pos); const free = pos.legal().filter((x) => (pos.b[x >> 7]) && netGain(pos, x) >= 400).sort((a, b) => netGain(pos, b) - netGain(pos, a));
      const after = pos.clone(); after.make(m);
      if (after.legal().length === 0) push({ kind: 'mate', positive: true, ply: i + 1, moveIx: i, arrow: [from, to], squares: [to], text });
      else {
        if (mates.length > 0) push({ kind: 'missMate', positive: false, ply: i, moveIx: i, arrow: [mates[0] & 127, mates[0] >> 7], squares: [], text });
        // fork：走完后落点安全（或落点价值低于被攻击目标），同时攻击 ≥2 个更值钱 / 无根的子（将军也算一个目标）
        const enemy = kidCol ^ 8; const targets: number[] = [];
        for (let s = 0; s < 90; s++) { const q = after.b[s]; if (!q || (q & 8) !== enemy) continue; if (!after.attackers(s, kidCol).includes(to)) continue; if ((q & 7) === 1 || val(q) >= val(mover) || !after.attacked(s, enemy)) { if ((q & 7) === 1 || val(q) >= 200) targets.push(s); } }
        const safe = !after.attacked(to, enemy) || targets.every((s) => val(after.b[s]) > val(mover));
        if (targets.length >= 2 && safe && mates.length === 0) push({ kind: 'fork', positive: true, ply: i + 1, moveIx: i, arrow: [from, to], squares: targets.slice(0, 2), text });
        else if (gain >= 300 && mates.length === 0) push({ kind: 'win', positive: true, ply: i + 1, moveIx: i, arrow: [from, to], squares: [to], text });
        // missFree：本来有白吃的子（净得 ≥ 4 分），孩子没吃、也不是吃了更大的子
        if (mates.length === 0 && free.length > 0 && !(gain >= netGain(pos, free[0]))) { const f = free[0]; push({ kind: 'missFree', positive: false, ply: i, moveIx: i, arrow: [f & 127, f >> 7], squares: [f >> 7], text }); }
        // hang：对方下一步就吃掉孩子的子并净得 ≥ 3 分（孩子这步刚吃的更大则算对换，不计）
        if (i + 1 < moves.length) { let r: number | null = null; try { r = parseMove(moves[i + 1]); } catch { r = null; } if (r !== null && after.legal().includes(r) && after.b[r >> 7]) { const g2 = netGain(after, r); if (g2 >= 300 && g2 > gain) push({ kind: 'hang', positive: false, ply: i + 2, moveIx: i, arrow: [r & 127, r >> 7], squares: [r >> 7], text }); } }
      }
    }
    pos.make(m);
  }
  return out;
}

/** 挑选：最高正面 → 最高负面 → 第二正面（≤3 条），同一步只留一条，按时间排序 */
export function pickHighlights(all: readonly Highlight[]): Highlight[] {
  const pos = all.filter((h) => h.positive).sort((a, b) => b.score - a.score || a.moveIx - b.moveIx), neg = all.filter((h) => !h.positive).sort((a, b) => b.score - a.score || a.moveIx - b.moveIx);
  const chosen: Highlight[] = []; const used = new Set<number>(); const take = (h?: Highlight): void => { if (h && !used.has(h.moveIx) && chosen.length < 3) { used.add(h.moveIx); chosen.push(h); } };
  take(pos[0]); take(neg[0]); take(pos.find((h) => !used.has(h.moveIx))); if (chosen.length < 3) take(neg.find((h) => !used.has(h.moveIx)));
  return chosen.sort((a, b) => a.moveIx - b.moveIx);
}
