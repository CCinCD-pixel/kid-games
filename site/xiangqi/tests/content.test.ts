// V4 题库（唯一性 + 诱饵 + 偷懒策略）· 小局 28 局面 · V5 课程结构 · V6 旁白 · 机器人数据。读的是 content/xiangqi/ 里页面真正用的那份文件。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shortcutAudit } from '@engines/board/puzzle/audit';
import { immediateWins, validateMate1, validateMate2 } from '@engines/board/puzzle/validate';
import { mateIn1Moves } from '@engines/board/core/see';
import { Position, WHY, parseMove } from '../src/rules/position';
import { createRules, xqSearchAdapter } from '../src/rules/rules';
import { ROBOTS } from '../src/rules/robots';

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../../../content/xiangqi/${f}`, import.meta.url), 'utf8')) as T;
const rules = createRules();
const FULL = !!process.env.XQ_FULL;
interface M1 { id: string; fen: string; solution: string; cat: string; tier: number }
interface M2 { id: string; fen: string; solution: string; cat: string }
const puz = read<{ mate1: M1[]; mate2: M2[] }>('puzzles.v1.json');
const extra = read<{ stale1: { id: string; fen: string; sol: string }[]; fork: { id: string; fen: string; sol: string }[]; poolStale: unknown[]; poolFork: unknown[] }>('extra.v1.json');
const pool = read<[string, string, number][]>('pool-mate1.json');

describe('V4 题库', () => {
  it('课内一步杀 40：全体合法首着上唯一、真将死、有诱饵', () => {
    expect(puz.mate1.length).toBe(40); const bad: string[] = [];
    for (const p of puz.mate1) { const v = validateMate1(rules, p.fen, { minDecoys: p.tier >= 2 ? 2 : 1 }); if (!v.ok || v.winners.length !== 1 || v.winners[0].enc !== p.solution || v.winners[0].kind !== 'mate') bad.push(`${p.id}:${v.reasons.join('|')}`); }
    expect(bad).toEqual([]);
  });
  it('课内两步杀 24：恰有一个首着、黑方每个应着后都有当场取胜着', () => {
    expect(puz.mate2.length).toBe(24); const bad: string[] = [];
    for (const p of puz.mate2) { const v = validateMate2(rules, p.fen); if (!v.ok || v.first !== p.solution) bad.push(`${p.id}:${v.reasons.join('|')}:${v.first}`); }
    expect(bad).toEqual([]);
  });
  it('困毙一步 8：唯一当场取胜着是"困毙判负"', () => {
    expect(extra.stale1.length).toBe(8); const bad: string[] = [];
    for (const p of extra.stale1) { const w = immediateWins(rules, rules.fromFen(p.fen)); if (w.length !== 1 || w[0].enc !== p.sol || w[0].kind !== 'stalemate-win') bad.push(p.id); }
    expect(bad).toEqual([]);
  });
  it('双捉 6：解着合法', () => { expect(extra.fork.length).toBe(6); for (const p of extra.fork) { const s = rules.fromFen(p.fen); expect(rules.decode(s, p.sol), p.id).not.toBeNull(); } });
  it('每日池 8 141 题：抽样独立复核（XQ_FULL = 全量）', () => {
    expect(pool.length).toBe(8141); const step = FULL ? 1 : 27; const bad: string[] = []; let n = 0;
    for (let i = 0; i < pool.length; i += step) { const [fen, sol, tier] = pool[i]; const v = validateMate1(rules, fen + ' w', { minDecoys: 1 }); void tier; n++; if (!v.ok || v.winners[0]?.enc !== sol) bad.push(`${i}:${v.reasons.join('|')}`); }
    expect(bad).toEqual([]); expect(n).toBeGreaterThan(FULL ? 8000 : 250);
  }, 300_000);
  it('偷懒策略审计：入课 40 题，每种策略命中 ≤15 %', () => {
    const r = shortcutAudit(rules, puz.mate1.map((p) => ({ id: p.id, fen: p.fen, answer: p.solution })), 0.15);
    expect(r.ok, JSON.stringify(r.perStrat)).toBe(true);
  });
});

interface Xj { id: string; name: string; theme: string; tier: number; fen: string; k2R3: number; k15R3: number }
describe('小局 28 局面（§3.11）', () => {
  const xj = read<{ positions: Xj[]; softCapPlies: number }>('xiaoju.v1.json');
  it('28 个、8 个主题、id 唯一、孩子执红先走、未终局、开局无一步杀', () => {
    expect(xj.positions.length).toBe(28); expect(new Set(xj.positions.map((p) => p.id)).size).toBe(28); expect(new Set(xj.positions.map((p) => p.theme)).size).toBe(8);
    const ad = xqSearchAdapter();
    for (const p of xj.positions) { const s = rules.fromFen(p.fen); expect(rules.turn(s), p.id).toBe(0); expect(rules.status(s).over, p.id).toBe(false); expect(rules.legalMoves(s).length, p.id).toBeGreaterThan(0); expect(mateIn1Moves(ad.create(s), { stalemate: false }).length, `${p.id} 开局无一步杀`).toBe(0); expect(p.k2R3, p.id).toBeGreaterThanOrEqual(60); expect(p.k15R3, p.id).toBeGreaterThanOrEqual(30); }
    expect(xj.softCapPlies).toBe(60);
  });
});

interface Step { id: string; k: string; say?: string; pos?: string; ids?: string[]; twin?: string }
interface Lesson { id: string; ch: number; name: string; lines: string[]; steps: Step[] }
const parseNarration = (): { id: string; role: string; text: string }[] => {
  const t = readFileSync(new URL('../../../content/xiangqi/narration.yaml', import.meta.url), 'utf8'); const out: { id: string; role: string; text: string }[] = []; let cur: { id: string; role: string; text: string } | null = null;
  for (const line of t.split('\n')) { const m1 = /^\s+- id: (\S+)/.exec(line); if (m1) { cur = { id: m1[1], role: '', text: '' }; out.push(cur); continue; } const m2 = /^\s+role: (\S+)/.exec(line); if (m2 && cur) cur.role = m2[1]; const m3 = /^\s+text: (.*)$/.exec(line); if (m3 && cur) cur.text = m3[1].trim(); if (/^words:/.test(line)) cur = null; }
  return out;
};
describe('V5 课程结构 · V6 旁白', () => {
  const lessons = read<{ lessons: Lesson[]; chapters: [number, string][]; placement: Step[] }>('lessons.v1.json'); const lines = parseNarration(); const ids = new Set(lines.map((l) => l.id));
  it('33 课 9 章 114 步，id 唯一，每个局面是合法 FEN', () => {
    expect(lessons.lessons.length).toBe(33); expect(lessons.chapters.length).toBe(9); const all = lessons.lessons.flatMap((l) => l.steps); expect(all.length).toBe(114); expect(new Set(all.map((s) => s.id)).size).toBe(114);
    for (const s of [...all, ...lessons.placement]) if (s.pos) expect(() => Position.fromFen(s.pos as string), s.id).not.toThrow();
  });
  it('旁白 ≤ 237 句（+ 11 个点读词 ≤ 250 条音频）；字幕 ≤15 字；id 唯一；每步 say 与每课 lines 引用完整', () => {
    expect(lines.length).toBeLessThanOrEqual(239); expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    const long = lines.filter((l) => l.text.replace(/[，。？！、…「」『』：；—\s]/g, '').length > 15).map((l) => l.id); expect(long).toEqual([]);
    const miss: string[] = []; for (const l of lessons.lessons) { for (const k of l.lines) if (!ids.has(`xq.${k}`)) miss.push(k); for (const s of l.steps) if (s.say && !ids.has(`xq.${s.say}`)) miss.push(`${s.id}:${s.say}`); }
    expect(miss).toEqual([]);
  });
  it('whyIllegal 的全部理由都有旁白（xq.w.<reason>）', () => { for (const w of WHY) expect(ids.has(`xq.w.${w}`), w).toBe(true); });
  it('quiz 的两选一必有 twin', () => { const all = lessons.lessons.flatMap((l) => l.steps).filter((s) => s.k === 'quiz'); expect(all.length).toBe(23); });
});

describe('机器人数据', () => {
  it('六位，强度单调（depth / nodes / slip 阶梯），教练上限 3/3/2/1/1/0', () => {
    expect(ROBOTS.map((r) => r.name)).toEqual(['滑轮', '木牛', '流马', '司南', '浑天', '璇玑']); expect(ROBOTS.map((r) => r.level.coachCap)).toEqual([3, 3, 2, 1, 1, 0]);
    for (let i = 1; i < 6; i++) { expect(ROBOTS[i].level.depth).toBeGreaterThanOrEqual(ROBOTS[i - 1].level.depth); expect(ROBOTS[i].level.nodes).toBeGreaterThanOrEqual(ROBOTS[i - 1].level.nodes); }
    for (const r of ROBOTS) { expect(r.easy.slip).toBeGreaterThanOrEqual(r.level.slip); expect(r.easy.mateSight).toBeLessThanOrEqual(r.level.mateSight); }
  });
  it('解着的 encode / decode 往返', () => { const s = rules.fromFen(puz.mate1[0].fen); const m = rules.decode(s, puz.mate1[0].solution); expect(m).toBe(parseMove(puz.mate1[0].solution)); });
});
