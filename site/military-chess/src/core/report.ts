/**
 * 战报 key moments (spec §5.6): replay a finished match and pick up to three moments worth showing —
 * the two most significant collisions plus the final move. Pure; perspective = player 0 (the child).
 */
import { BOMB, ENG, MINE, rankOf } from './pieces';
import { isMove } from './movegen';
import { parseNote } from './notation';
import { apply, type MoveEvent } from './rules';
import type { GameState } from './state';

export interface Moment {
  ply: number;
  note: string;
  line: string;
  /** position after the move */
  state: GameState;
  /** stations of the move (arrow) */
  path: number[];
  score: number;
}

function judge(before: GameState, ev: MoveEvent, kidColour: number): { line: string; score: number } | null {
  const a = ev.action;
  if (!isMove(a) || ev.outcome === null) {
    // 'mc.rep.rail' says 对方从铁路冲过来: only the opponent's rail dash qualifies
    if (isMove(a) && a.path.length >= 6 && before.pside[a.pid] !== kidColour) return { line: 'mc.rep.rail', score: 2 };
    return null;
  }
  const att = ev.att!, def = ev.def!;
  const tA = before.ptype[att], tD = before.ptype[def];
  const kidAttacks = before.pside[att] === kidColour;
  const big = (t: number) => rankOf(t) >= 7;
  if (ev.outcome === 'F') return { line: 'mc.rep.final', score: 100 };
  if (tD === MINE && tA === ENG) return { line: 'mc.rep.engineer', score: 6 };
  if (ev.outcome === 'B' && (tA === BOMB || tD === BOMB)) {
    const victim = tA === BOMB ? tD : tA;
    if (big(victim)) {
      const bomberIsKid = (tA === BOMB) === kidAttacks;
      return { line: bomberIsKid ? 'mc.rep.bomb.kid' : 'mc.rep.bomb', score: 8 + rankOf(victim) };
    }
    return { line: 'mc.rep.trade', score: 3 };
  }
  if (ev.outcome === 'A' && big(tD)) return { line: kidAttacks ? 'mc.rep.bigwin' : 'mc.rep.lostbig', score: 7 + rankOf(tD) };
  if (ev.outcome === 'D' && big(tA)) return { line: kidAttacks ? 'mc.rep.lostbig' : 'mc.rep.bigwin', score: 7 + rankOf(tA) };
  if (ev.outcome === 'B') return { line: 'mc.rep.trade', score: 2 + rankOf(tA) / 3 };
  if (a.path.length >= 5 && !kidAttacks) return { line: 'mc.rep.rail', score: 4 };
  return { line: ev.outcome === 'A' ? (kidAttacks ? 'mc.rep.bigwin' : 'mc.rep.lostbig') : 'mc.rep.trade', score: 1 + rankOf(ev.outcome === 'A' ? tD : tA) / 4 };
}

export function keyMoments(start: GameState, notes: readonly string[], kidColourOf: (s: GameState) => number): Moment[] {
  let s = start;
  const all: Moment[] = [];
  let last: Moment | null = null;
  notes.forEach((n, ply) => {
    const act = parseNote(s, n);
    if (!act) return;
    const before = s;
    const { state, event } = apply(s, act);
    s = state;
    const path = isMove(act) ? act.path : [];
    last = { ply, note: n, line: 'mc.rep.final', state, path, score: 0 };
    const j = judge(before, event, kidColourOf(before));
    if (j) all.push({ ply, note: n, line: j.line, state, path, score: j.score });
  });
  const fin = last as Moment | null;
  const ranked = all.filter((m) => !fin || m.ply !== fin.ply).sort((a, b) => b.score - a.score || a.ply - b.ply);
  const picked = pickDistinct(ranked, fin ? 2 : 3);
  picked.sort((a, b) => a.ply - b.ply);
  if (fin) picked.push({ ...fin, line: 'mc.rep.final' });
  return picked;
}

/** the child's gains (§5.6: one moment should be the kid's biggest gain when there is one) */
const GAIN = new Set(['mc.rep.bigwin', 'mc.rep.bomb.kid', 'mc.rep.engineer']);

/**
 * Up to `n` moments with DIFFERENT captions (QA r3: two identical captions read as a bug). If the top
 * moment is a loss, the next pick is the child's biggest gain when there is one.
 */
export function pickDistinct(ranked: readonly Moment[], n: number): Moment[] {
  const out: Moment[] = [];
  const used = new Set<string>();
  const take = (m: Moment | undefined): void => {
    if (!m || out.length >= n || used.has(m.line)) return;
    out.push(m);
    used.add(m.line);
  };
  take(ranked[0]);
  if (out.length && !GAIN.has(out[0].line)) take(ranked.find((m) => GAIN.has(m.line)));
  for (const m of ranked) take(m);
  return out;
}
