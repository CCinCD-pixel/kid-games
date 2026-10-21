// test/xq-lesson-core.ts — 象棋课程数据的参考接入（不含 JSON import：Node ESM / Playwright 也能用；JSON 由 xq-lesson-data.ts 或调用方读）：lessons.v1.json（33 课）+ 题库子集 → LessonData（局面解析 / 摆子 / 取题）。
// 这是给游戏代理抄的"怎样把 lessons.mjs 的产出接到 engines/board/lesson"的最小样例；测试与游乐场也用它。
import type { GameRules, Puzzle } from '../core/types';
import { validateMate2 } from '../puzzle/validate';
import type { LessonData, SetupSpec } from '../lesson/registry';

interface Rec { id: string; fen: string; solution?: string; sol?: string; cat?: string; tier?: number; themes?: string[] }
export interface PuzzleBank { mate1: Rec[]; mate2: Rec[]; stale1: Rec[]; fork: Rec[] }
export type { Rec as PuzzleRecord };
const BACK: [string, string][] = [['a1', 'R'], ['b1', 'N'], ['c1', 'B'], ['d1', 'A'], ['e1', 'K'], ['f1', 'A'], ['g1', 'B'], ['h1', 'N'], ['i1', 'R']];
const PAWNS: [string, string][] = ['a', 'c', 'e', 'g', 'i'].map((f) => [`${f}4`, 'P']); const CANNONS: [string, string][] = [['b3', 'C'], ['h3', 'C']];
const EMPTY = '9/9/9/9/9/9/9/9/9/9 w';
const withEdits = (fen: string, parts: [string, string][]): string => { const rows = fen.split(' ')[0].split('/').map((r) => [...r].flatMap((ch) => (/\d/.test(ch) ? new Array<string>(Number(ch)).fill('') : [ch]))); for (const [n, ch] of parts) rows[10 - Number(n.slice(1))][n.charCodeAt(0) - 97] = ch; return rows.map((r) => { let o = '', k = 0; for (const c of r) { if (!c) k++; else { if (k) o += k; k = 0; o += c; } } return o + (k || ''); }).join('/') + ' w'; };

export function puzzleFromRecord<M, S>(rules: GameRules<M, S>, rec: Rec, kind: 'mate1' | 'mate2' | 'stale1' | 'fork'): Puzzle {
  if (kind === 'mate2') { const v = validateMate2(rules, rec.fen); const r = v.replies[0]; return { id: rec.id, fen: rec.fen, theme: rec.cat ?? 'mate2', tier: (rec.tier ?? 1) as 1 | 2 | 3, solution: [[v.first ?? rec.solution ?? ''], [r.reply], r.winners.map((w) => w.enc)], kidPlies: 2, judge: 'outcome', meta: { ...rec } }; }
  const sol = rec.solution ?? rec.sol ?? ''; return { id: rec.id, fen: rec.fen, theme: rec.cat ?? kind, tier: (rec.tier ?? 1) as 1 | 2 | 3, solution: [[sol]], kidPlies: 1, judge: kind === 'mate1' ? 'outcome' : 'list', meta: { ...rec } };
}
export function makeXqLessonData<M, S>(rules: GameRules<M, S>, PZ: PuzzleBank): LessonData {
  const byId = new Map<string, { rec: Rec; kind: 'mate1' | 'mate2' | 'stale1' | 'fork' }>(); for (const k of ['mate1', 'mate2', 'stale1', 'fork'] as const) for (const rec of PZ[k]) byId.set(rec.id, { rec, kind: k });
  return {
    position(step) {
      const sel = step.puzSel as [string, number, boolean] | undefined; if (!sel) return null; const rec = PZ.mate1.filter((p) => p.cat === sel[0])[sel[1]]; if (!rec) return null;
      const s = rules.fromFen(rec.fen); const sol = rules.decode(s, rec.solution ?? ''); if (sol === null) return null; let m: M = sol as M;
      if (sel[2]) { const d = rules.legalMoves(s).find((x) => x !== sol && rules.check(rules.apply(s, x))); if (d === undefined) return null; m = d; }
      return rules.toFen(rules.apply(s, m));
    },
    setup(part): SetupSpec | null {
      if (part === 'pawns') return { base: EMPTY, place: PAWNS }; if (part === 'cannons') return { base: withEdits(EMPTY, PAWNS), place: CANNONS }; if (part === 'back') return { base: withEdits(EMPTY, [...PAWNS, ...CANNONS]), place: BACK }; return null;
    },
    puzzle(id) { const e = byId.get(id); return e ? puzzleFromRecord(rules, e.rec, e.kind) : null; },
  };
}
