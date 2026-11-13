import { isBlock, type Where } from './edit';
import { act, atGoal, cost, flatten, parseProg, run, slotsOf, startState, type Card, type CardKey, type Config, type Item, type Level, type MainCard, type Part, type State, type Step } from './sim';

/**
 * The hint button, steps ② and ③ (round 1, R4). Everything starts from the child's OWN programme, never from a blank rail:
 *  ② `diagnose`: the tile where the run starts to go astray ("从这一格开始走歪了"), and the card that did it;
 *  ③ `adviseFlat` / `adviseRef`: one next move — a card to add at the end, a card to swap, a card to put in front of one, a card to take out.
 * "Astray" is measured by the fewest plain cards still needed (a search over every state the rover can reach): a card goes astray when,
 * after it, the goal can no longer be reached within the card budget.
 */

export interface Cell { x: number; y: number }
const skey = (s: State): string => `${s.x},${s.y},${s.d},${s.m}`;
/** the plain cards of the level's box (no repeat card, no magic card) */
export const plainCards = (lv: Level): Card[] => lv.cards.filter((c): c is Card => c !== 'X' && c !== 'C');
export const hasBlocks = (lv: Level): boolean => lv.cards.includes('X') || lv.cards.includes('C');

/**
 * The fewest plain cards from a state to "parked on the goal with every sample", for every state the rover can reach from the start
 * with these cards: a search forward finds the states, a search backward from the goal counts. Infinity where the goal cannot be reached.
 */
export function distances(lv: Level, cfg: Config, alphabet: readonly Card[] = plainCards(lv)): (s: State) => number {
  const ids = new Map<string, number>();
  const states: State[] = []; const back: number[][] = [];
  const id = (s: State): number => {
    const k = skey(s); let i = ids.get(k);
    if (i === undefined) { i = states.length; ids.set(k, i); states.push(s); back.push([]); }
    return i;
  };
  const queue = [id(startState(lv))];
  for (let h = 0; h < queue.length; h++) {
    const s = states[queue[h]];
    for (const a of alphabet) {
      const r = act(lv, cfg, s, a);
      if (r.err) continue;
      const n = states.length; const j = id(r.s);
      back[j].push(queue[h]);
      if (states.length > n) queue.push(j);
    }
  }
  const dist = states.map((s) => (atGoal(lv, s) ? 0 : Infinity));
  const bq = dist.flatMap((d, i) => (d === 0 ? [i] : []));
  for (let h = 0; h < bq.length; h++) for (const p of back[bq[h]]) if (dist[p] === Infinity) { dist[p] = dist[bq[h]] + 1; bq.push(p); }
  return (s) => { const i = ids.get(skey(s)); return i === undefined ? Infinity : dist[i]; };
}

/** the programme the level is built around: the fix on a fix-the-bug level, else its answer (none on a map the child drew) */
export function refOf(lv: Level): { main: Item[]; p1: Card[] } | null {
  const main = lv.buggy ? lv.fix : lv.solution.main;
  if (!main) return null;
  return { main: parseProg(main), p1: [...((lv.buggy ? lv.fixP1 : lv.solution.p1) ?? '')] as Card[] };
}

/** the garage: when the level's own answer cannot get there with these parts but can with the level's parts, the first part to change */
export function garageAdvice(lv: Level, cfg: Config): { part: Part; val: string } | null {
  if (!lv.garage || !lv.loadout) return null;
  const ref = refOf(lv);
  if (!ref) return null;
  const fits = (c: Config) => run(lv, c, ref.main, ref.p1).res === 'win' && cost(ref.main) <= slotsOf(lv, c);
  if (fits(cfg) || !fits(lv.loadout)) return null;
  const part = lv.garage.open.find((p) => cfg[p] !== lv.loadout![p]);
  return part ? { part, val: lv.loadout[part] } : null;
}

/** how many plain cards the run may take: the slots on a level of plain cards; with repeat or magic cards, the plain length of the level's own answer plus one */
export function budgetOf(lv: Level, cfg: Config): number {
  const ref = hasBlocks(lv) ? refOf(lv) : null;
  return ref ? flatten(ref.main, ref.p1).length + 1 : slotsOf(lv, cfg);
}

export type Diagnosis =
  | { kind: 'garage'; part: Part; val: string }
  | { kind: 'win' }
  | { kind: 'empty'; cell: Cell }
  /** the card at `step` of the run (`path`, and `p1` inside the magic row) is where it goes astray; the rover stood on `cell`; `round`: the how-manyth time this card ran */
  | { kind: 'off'; step: number; cell: Cell; path: Step['path']; p1?: number; round: number }
  /** nothing astray: the programme just stops short; the rover ends on `cell` */
  | { kind: 'short'; cell: Cell };

/** hint ②: where the child's programme starts to go astray */
export function diagnose(lv: Level, cfg: Config, prog: readonly Item[], p1: readonly Card[] = []): Diagnosis {
  const g = garageAdvice(lv, cfg);
  if (g) return { kind: 'garage', ...g };
  if (!prog.length) return { kind: 'empty', cell: { x: lv.start.x, y: lv.start.y } };
  const r = run(lv, cfg, prog, p1);
  if (r.res === 'win') return { kind: 'win' };
  const d = distances(lv, cfg); const budget = budgetOf(lv, cfg);
  let before: State = startState(lv);
  for (let k = 0; k < r.steps.length; k++) {
    const st = r.steps[k];
    if (st.err || k + 1 + d(st.s) > budget) {
      const round = r.steps.slice(0, k + 1).filter((o) => o.path[0] === st.path[0] && o.path[1] === st.path[1] && o.p1 === st.p1).length;
      return { kind: 'off', step: k, cell: { x: before.x, y: before.y }, path: st.path, p1: st.p1, round };
    }
    before = st.s;
  }
  return { kind: 'short', cell: { x: r.s.x, y: r.s.y } };
}

export type Advice =
  | { kind: 'garage'; part: Part; val: string }
  | { kind: 'send' }
  /** put this card at the end of `row` ('X' opens a repeat block, 'close' closes the open one) */
  | { kind: 'add'; card: CardKey | 'close'; row: 'main' | 'p1' }
  | { kind: 'replace'; at: Where; card: MainCard }
  | { kind: 'insert'; at: Where; card: MainCard }
  /** take out the card (or the whole block) at `at`; `last`: it is only the last card, taken back to find the way again */
  | { kind: 'remove'; at: Where; last?: boolean }
  | { kind: 'count'; at: number; n: number }
  | { kind: 'none' };

/** how far a row of plain cards stays on track: `ok` cards keep the goal within the budget; `win` when it gets there */
function onTrack(lv: Level, cfg: Config, d: (s: State) => number, budget: number, cards: readonly Card[]): { win: boolean; ok: number; end: State } {
  let s = startState(lv);
  for (let k = 0; k < cards.length; k++) {
    const r = act(lv, cfg, s, cards[k]);
    if (r.err || k + 1 + d(r.s) > budget) return { win: false, ok: k, end: s };
    s = r.s;
  }
  return { win: atGoal(lv, s), ok: cards.length, end: s };
}

/**
 * hint ③ on a level of plain cards: the next card for the child's own programme. When it is on track, the next card at the end; when a card
 * sends it astray, the one change at that card (swap it, take it out, or put a card in front of it) that keeps the most of the programme on track.
 */
export function adviseFlat(lv: Level, cfg: Config, cards: readonly Card[]): Advice {
  const g = garageAdvice(lv, cfg);
  if (g) return { kind: 'garage', ...g };
  const alpha = plainCards(lv); const d = distances(lv, cfg, alpha); const budget = slotsOf(lv, cfg);
  const nextFrom = (s: State): Card | undefined => alpha.find((a) => { const r = act(lv, cfg, s, a); return !r.err && d(r.s) === d(s) - 1; });
  const now = onTrack(lv, cfg, d, budget, cards);
  if (now.win) return { kind: 'send' };
  if (now.ok === cards.length) { const c = nextFrom(now.end); return c ? { kind: 'add', card: c, row: 'main' } : { kind: 'none' }; }
  const b = now.ok;
  const cands: { a: Advice; win: boolean; full: boolean; ok: number; len: number }[] = [];
  const consider = (a: Advice, list: Card[]): void => {
    const t = onTrack(lv, cfg, d, budget, list);
    const full = t.ok === list.length;
    if (t.win || full || t.ok > b) cands.push({ a, win: t.win, full, ok: t.ok, len: list.length });
  };
  for (const x of alpha) if (x !== cards[b]) consider({ kind: 'replace', at: { row: 'main', i: b }, card: x }, [...cards.slice(0, b), x, ...cards.slice(b + 1)]);
  consider({ kind: 'remove', at: { row: 'main', i: b } }, [...cards.slice(0, b), ...cards.slice(b + 1)]);
  if (cards.length < budget) for (const x of alpha) consider({ kind: 'insert', at: { row: 'main', i: b }, card: x }, [...cards.slice(0, b), x, ...cards.slice(b)]);
  cands.sort((p, q) => Number(q.win) - Number(p.win) || Number(q.full) - Number(p.full) || q.ok - p.ok || p.len - q.len);
  if (cands.length) return cands[0].a;
  let s = startState(lv);
  for (let k = 0; k < b; k++) s = act(lv, cfg, s, cards[k]).s;
  const c = nextFrom(s);
  return c && c !== cards[b] ? { kind: 'replace', at: { row: 'main', i: b }, card: c } : { kind: 'remove', at: { row: 'main', i: b } };
}

type Diff =
  | { kind: 'same' }
  | { kind: 'more'; next: Item }                       // the row so far is the start of the answer; this item comes next
  | { kind: 'body'; i: number; j: number; card: MainCard } // block i so far is the start of the answer's block; this card goes in next
  | { kind: 'count'; i: number; n: number }
  | { kind: 'swap'; at: Where; card: MainCard }
  | { kind: 'extra'; at: Where };

function diffMain(have: readonly Item[], want: readonly Item[]): Diff {
  for (let i = 0; i < Math.max(have.length, want.length); i++) {
    const a = have[i], b = want[i];
    if (a === undefined) return { kind: 'more', next: b };
    if (b === undefined) return { kind: 'extra', at: { row: 'main', i } };
    if (!isBlock(a) && !isBlock(b)) { if (a !== b) return { kind: 'swap', at: { row: 'main', i }, card: b }; continue; }
    if (!isBlock(a) || !isBlock(b)) return { kind: 'extra', at: { row: 'main', i } };
    for (let j = 0; j < Math.max(a.body.length, b.body.length); j++) {
      const x = a.body[j], y = b.body[j];
      if (x === undefined) return { kind: 'body', i, j, card: y };
      if (y === undefined) return { kind: 'extra', at: { row: 'main', i, j } };
      if (x !== y) return { kind: 'swap', at: { row: 'main', i, j }, card: y };
    }
    if (a.n !== b.n) return { kind: 'count', i, n: b.n };
  }
  return { kind: 'same' };
}
function diffP1(have: readonly Card[], want: readonly Card[]): Diff {
  for (let k = 0; k < Math.max(have.length, want.length); k++) {
    if (have[k] === undefined) return { kind: 'more', next: want[k] };
    if (want[k] === undefined) return { kind: 'extra', at: { row: 'p1', k } };
    if (have[k] !== want[k]) return { kind: 'swap', at: { row: 'p1', k }, card: want[k] };
  }
  return { kind: 'same' };
}
/** the last card of a row, to be taken back */
function lastOf(prog: readonly Item[], p1: readonly Card[], row: 'main' | 'p1'): Where {
  if (row === 'p1') return { row: 'p1', k: p1.length - 1 };
  const i = prog.length - 1; const it = prog[i];
  return isBlock(it) && it.body.length ? { row: 'main', i, j: it.body.length - 1 } : { row: 'main', i };
}

/**
 * hint ③ on a fix-the-bug level of plain cards: the first change (from the left) of the fewest that turn the child's programme into the fix,
 * so the hint mends only what needs mending, wherever the child has got to.
 */
export function adviseFix(have: readonly Card[], want: readonly Card[]): Advice {
  const n = have.length, m = want.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (have[i - 1] === want[j - 1] ? 0 : 1));
  let i = n, j = m; let first: Advice = { kind: 'send' };
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && have[i - 1] === want[j - 1] && d[i][j] === d[i - 1][j - 1]) { i--; j--; continue; }
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { first = { kind: 'replace', at: { row: 'main', i: i - 1 }, card: want[j - 1] }; i--; j--; continue; }
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) { first = { kind: 'remove', at: { row: 'main', i: i - 1 } }; i--; continue; }
    first = i === n ? { kind: 'add', card: want[j - 1], row: 'main' } : { kind: 'insert', at: { row: 'main', i }, card: want[j - 1] }; j--;
  }
  return first;
}

/** hint ③: the one next move for the child's programme as it is now */
export function advise(lv: Level, cfg: Config, prog: readonly Item[], p1: readonly Card[], open: number): Advice {
  const g = garageAdvice(lv, cfg);
  if (g) return { kind: 'garage', ...g };
  if (prog.length && open < 0 && run(lv, cfg, prog, p1).res === 'win') return { kind: 'send' };
  const ref = refOf(lv);
  const flat = (it: readonly Item[]) => it.every((c) => !isBlock(c) && c !== 'C');
  if (lv.buggy && ref && flat(prog) && flat(ref.main) && !ref.p1.length) return adviseFix(prog as Card[], ref.main as Card[]);
  return hasBlocks(lv) || lv.buggy ? adviseRef(lv, cfg, prog, p1, open) : adviseFlat(lv, cfg, prog as Card[]);
}

/**
 * hint ③ on a level with repeat or magic cards, where a search over programmes is too big: the level's own answer is the guide. While the
 * child's rows are the start of it, the next card (or the number on the repeat card, or "收好"). On a fix-the-bug level the very card that
 * differs from the fix. Elsewhere a programme that has left the answer is taken back from its end, one card at a time — never cleared.
 */
export function adviseRef(lv: Level, cfg: Config, prog: readonly Item[], p1: readonly Card[], open: number): Advice {
  const g = garageAdvice(lv, cfg);
  if (g) return { kind: 'garage', ...g };
  const ref = refOf(lv);
  if (!ref) return { kind: 'none' };
  const exact = !!lv.buggy;
  const off = (dd: Diff, row: 'main' | 'p1'): Advice | null => {
    if (dd.kind !== 'swap' && dd.kind !== 'extra') return null;
    if (!exact) return { kind: 'remove', at: lastOf(prog, p1, row), last: true };
    return dd.kind === 'swap' ? { kind: 'replace', at: dd.at, card: dd.card } : { kind: 'remove', at: dd.at };
  };
  const m = diffMain(prog, ref.main);
  const mainOff = off(m, 'main');
  if (mainOff) return mainOff;
  const q = diffP1(p1, ref.p1);
  const p1Off = off(q, 'p1');
  if (p1Off) return p1Off;
  if (m.kind === 'count') return { kind: 'count', at: m.i, n: m.n };
  if (m.kind === 'body') return open === m.i ? { kind: 'add', card: m.card, row: 'main' } : { kind: 'insert', at: { row: 'main', i: m.i, j: m.j }, card: m.card };
  if (open >= 0) return { kind: 'add', card: 'close', row: 'main' };
  if (m.kind === 'more') return { kind: 'add', card: isBlock(m.next) ? 'X' : m.next, row: 'main' };
  if (q.kind === 'more' && !isBlock(q.next)) return { kind: 'add', card: q.next, row: 'p1' };
  return { kind: 'send' };
}
