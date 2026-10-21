// site/xiangqi/src/lesson/data.ts — 把 content/xiangqi 的课程 / 题库接到 engines/board/lesson（参考接入：engines/board/test/xq-lesson-data.ts）。
import type { GameRules, Puzzle } from '@engines/board/core/types';
import { validateMate2 } from '@engines/board/puzzle/validate';
import type { LessonData, LessonStep, SetupSpec } from '@engines/board/lesson/registry';
import type { LessonDef } from '@engines/board/lesson/player';
import lessonsJson from '../../../../content/xiangqi/lessons.v1.json';
import puzzlesJson from '../../../../content/xiangqi/puzzles.v1.json';
import extraJson from '../../../../content/xiangqi/extra.v1.json';

interface Rec { id: string; fen: string; solution?: string; sol?: string; cat?: string; tier?: number }
/** 开场 / 步前 / 课后的旁白拍：字符串 = 旁白 id；对象可指定要指给孩子看的格子（缺省 = 本步的 hero / targets / stars） */
export type Beat = string | { say: string; focus?: string[] };
export type XqLesson = LessonDef & { ch: number; name: string; teaches?: string; lines: string[]; intro: string[]; post?: string[]; minutes?: number };
export const XQ_CHAPTERS = (lessonsJson as unknown as { chapters: [number, string][] }).chapters;
export const XQ_LESSONS = (lessonsJson as unknown as { lessons: XqLesson[] }).lessons;
export const XQ_PLACEMENT = (lessonsJson as unknown as { placement: (LessonStep & { chapter: number; tests: string[] })[] }).placement;
const PZ = { mate1: (puzzlesJson as unknown as { mate1: Rec[] }).mate1, mate2: (puzzlesJson as unknown as { mate2: Rec[] }).mate2, stale1: (extraJson as unknown as { stale1: Rec[] }).stale1, fork: (extraJson as unknown as { fork: Rec[] }).fork };
const BACK: [string, string][] = [['a1', 'R'], ['b1', 'N'], ['c1', 'B'], ['d1', 'A'], ['e1', 'K'], ['f1', 'A'], ['g1', 'B'], ['h1', 'N'], ['i1', 'R']];
const PAWNS: [string, string][] = ['a', 'c', 'e', 'g', 'i'].map((f) => [`${f}4`, 'P']); const CANNONS: [string, string][] = [['b3', 'C'], ['h3', 'C']];
const EMPTY = '9/9/9/9/9/9/9/9/9/9 w';
const withEdits = (fen: string, parts: [string, string][]): string => { const rows = fen.split(' ')[0].split('/').map((r) => [...r].flatMap((ch) => (/\d/.test(ch) ? new Array<string>(Number(ch)).fill('') : [ch]))); for (const [n, ch] of parts) rows[10 - Number(n.slice(1))][n.charCodeAt(0) - 97] = ch; return rows.map((r) => { let o = '', e = 0; for (const x of r) { if (!x) e++; else { if (e) { o += e; e = 0; } o += x; } } return e ? o + e : o; }).join('/') + ' ' + fen.split(' ')[1]; };

export function puzzleFromRecord<M, S>(rules: GameRules<M, S>, rec: Rec, kind: 'mate1' | 'mate2' | 'stale1' | 'fork'): Puzzle {
  if (kind === 'mate2') { const v = validateMate2(rules, rec.fen); const r = v.replies[0]; return { id: rec.id, fen: rec.fen, theme: rec.cat ?? 'mate2', tier: (rec.tier ?? 1) as 1 | 2 | 3, solution: [[v.first ?? rec.solution ?? ''], [r.reply], r.winners.map((w) => w.enc)], kidPlies: 2, judge: 'outcome', meta: { ...rec } }; }
  const sol = rec.solution ?? rec.sol ?? ''; return { id: rec.id, fen: rec.fen, theme: rec.cat ?? kind, tier: (rec.tier ?? 1) as 1 | 2 | 3, solution: [[sol]], kidPlies: 1, judge: kind === 'mate1' ? 'outcome' : 'list', meta: { ...rec } };
}
export function xqLessonData<M, S>(rules: GameRules<M, S>): LessonData {
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
    /** H1 的提示句要贴合这道题问的是什么（QA r3：引擎默认按步型给，点格子的题全说"有个子可以白吃"、点点题说"想想哪个子能动"，都答非所问）。其它档位 / 步型走引擎默认。 */
    hintSay(step, tier) {
      if (tier !== 1) return null; const q = step.k === 'qmoves' ? 'moves' : step.k === 'quiz' ? (step.q as string) : '';
      if (q === 'moves') return 'h.1.how'; if (q === 'attackers') return 'h.1.line';
      if (q === 'palace' || step.k === 'tap' || step.k === 'setup') return 'h.1.glow';       // 这三种题的候选 / 目标点本来就亮着
      return null;
    },
  };
}
const EMPTY_FEN = EMPTY;
/** 一步开始之前要摆上盘的局面（旁白念的时候孩子要看得到东西）：pos → 游戏解析（puzSel）→ 摆子步的底盘 → 题库步的第一题 → 对局步的开局。没有局面（纯卡片）返回 null。 */
export function previewFen(step: LessonStep, data: LessonData): string | null {
  if (typeof step.pos === 'string') return step.pos;
  const viaData = data.position?.(step); if (viaData) return viaData;
  if (step.k === 'setup') return data.setup?.(String(step.part), step)?.base ?? EMPTY_FEN;
  if (step.k === 'bank' || step.k === 'bank2') {
    const ids = (step.ids as string[] | undefined) ?? []; for (const id of ids) { const r = [...PZ.mate1, ...PZ.mate2, ...PZ.stale1, ...PZ.fork].find((p) => p.id === id); if (r) return r.fen; }
    return null;
  }
  if (step.k === 'play') return 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
  return null;
}
/** 步骤里值得指给孩子看的格子名：摆子步 = 要摆的格；否则 hero / from + targets / stars */
export function focusNames(step: LessonStep, data: LessonData): string[] {
  if (step.k === 'setup') return (data.setup?.(String(step.part), step)?.place ?? []).map(([n]) => n);
  const out: string[] = []; for (const k of ['hero', 'from'] as const) if (typeof step[k] === 'string') out.push(step[k] as string);
  for (const k of ['targets', 'stars'] as const) if (Array.isArray(step[k])) out.push(...(step[k] as string[]));
  return [...new Set(out)];
}
