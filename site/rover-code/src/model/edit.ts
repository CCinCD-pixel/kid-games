import { MAX_BODY, cost, type Block, type Card, type CardKey, type Item, type MainCard } from './sim';

/**
 * Changing a programme in the middle (round 1, R1): a card that is already laid can be swapped for another, a card can go in front of
 * it, or it can come out, without touching the cards around it. Pure: the old programme is left as it was.
 */

/** where a card sits: in the main row (`j`: its place inside the repeat block at `i`), or in the magic row */
export type Where = { row: 'main'; i: number; j?: number } | { row: 'p1'; k: number };
export type Refusal = 'full' | 'p1full' | 'bodyfull' | 'nest' | 'p1x' | 'p1c';
export interface Prog { main: Item[]; p1: Card[] }
export interface Limits { slots: number; p1Slots: number }
export interface Placed { prog: Prog; open?: number; next?: Where }

export const isBlock = (it: Item | undefined): it is Block => !!it && typeof it !== 'string';
export const copyProg = (p: Prog): Prog => ({ main: p.main.map((it) => (isBlock(it) ? { ...it, body: [...it.body] } : it)), p1: [...p.p1] });
export const sameWhere = (a: Where | null, b: Where | null): boolean =>
  !!a && !!b && (a.row === 'p1' ? b.row === 'p1' && a.k === b.k : b.row === 'main' && a.i === b.i && a.j === b.j);

/** the card at `w`, if there is one */
export function cardAt(p: Prog, w: Where): MainCard | undefined {
  if (w.row === 'p1') return p.p1[w.k];
  const it = p.main[w.i];
  if (w.j === undefined) return isBlock(it) ? undefined : it;
  return isBlock(it) ? it.body[w.j] : undefined;
}

/**
 * `replace`: the card at `w` becomes `key`. `insert`: `key` goes in front of the card at `w` (`w` may also be one past the last card).
 * The repeat card is special in the main row: on a card it wraps that card in a new block, in front of a card it opens an empty block;
 * either way the new block is `open` (the next cards go into it). After an insert, `next` is the place just after the new card, so a
 * second card lands behind the first one.
 */
export function place(p: Prog, w: Where, key: CardKey, mode: 'replace' | 'insert', lim: Limits): Placed | { refuse: Refusal } {
  const q = copyProg(p);
  if (w.row === 'p1') {
    if (key === 'X') return { refuse: 'p1x' };
    if (key === 'C') return { refuse: 'p1c' };
    if (mode === 'replace') { q.p1[w.k] = key; return { prog: q }; }
    if (q.p1.length >= lim.p1Slots) return { refuse: 'p1full' };
    q.p1.splice(w.k, 0, key);
    return { prog: q, next: { row: 'p1', k: w.k + 1 } };
  }
  const grows = mode === 'insert' || (key === 'X' && w.j === undefined);
  if (w.j !== undefined) {
    const blk = q.main[w.i];
    if (!isBlock(blk)) throw new Error('place: no block there');
    if (key === 'X') return { refuse: 'nest' };
    if (mode === 'replace') { blk.body[w.j] = key; return { prog: q }; }
    if (blk.body.length >= MAX_BODY) return { refuse: 'bodyfull' };
    if (cost(q.main) >= lim.slots) return { refuse: 'full' };
    blk.body.splice(w.j, 0, key);
    return { prog: q, next: { row: 'main', i: w.i, j: w.j + 1 } };
  }
  if (grows && cost(q.main) >= lim.slots) return { refuse: 'full' };
  if (key === 'X') {
    if (mode === 'insert') q.main.splice(w.i, 0, { k: 'X', n: 2, body: [] });
    else { const c = q.main[w.i]; if (isBlock(c)) throw new Error('place: a block cannot be swapped'); q.main[w.i] = { k: 'X', n: 2, body: [c] }; }
    return { prog: q, open: w.i };
  }
  if (mode === 'replace') { if (isBlock(q.main[w.i])) throw new Error('place: a block cannot be swapped'); q.main[w.i] = key; return { prog: q }; }
  q.main.splice(w.i, 0, key);
  return { prog: q, next: { row: 'main', i: w.i + 1 } };
}

/** take out the card at `w` (in the main row without `j`: the whole item, a block too) */
export function removeAt(p: Prog, w: Where): Prog {
  const q = copyProg(p);
  if (w.row === 'p1') q.p1.splice(w.k, 1);
  else if (w.j !== undefined) { const blk = q.main[w.i]; if (isBlock(blk)) blk.body.splice(w.j, 1); }
  else q.main.splice(w.i, 1);
  return q;
}
