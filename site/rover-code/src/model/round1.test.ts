import { describe, expect, it } from 'vitest';
import { cardAt, isBlock, place, removeAt, type Prog, type Where } from './edit';
import { advise, adviseFlat, adviseRef, diagnose, distances, hasBlocks, refOf, type Advice } from './hint';
import { GRID_LEVELS, levelById } from './levels';
import { TIERS, generatePatrol, rangeOf, shortest, type Tier } from './patrol';
import { DEFAULT_CONFIG, MAX_BODY, cost, editCount, parseProg, progStr, run, slotsOf, startState, type Card, type CardKey, type Config, type Item, type Level } from './sim';
import { starsFor } from './stars';
import { chapterOpen, levelOpen, patrolTurns } from './unlock';

const P = (main: string, p1 = ''): Prog => ({ main: parseProg(main), p1: [...p1] as Card[] });
const str = (p: Prog): string => progStr(p.main) + (p.p1.length ? `|${p.p1.join('')}` : '');
const lim = { slots: 6, p1Slots: 4 };
const grid = (id: string): Level => levelById(id) as Level;

describe('R1 · changing a card in the middle', () => {
  it('swaps one card and leaves the rest (and the old programme) alone, even on a full rail', () => {
    const p = P('FFRFF');
    const r = place(p, { row: 'main', i: 2 }, 'L', 'replace', { slots: 5, p1Slots: 0 });
    expect('prog' in r && str(r.prog)).toBe('FFLFF');
    expect(str(p)).toBe('FFRFF');
  });
  it('puts a card in front of another and says where the next one would go; refuses when the rail is full', () => {
    const r = place(P('FRFF'), { row: 'main', i: 1 }, 'F', 'insert', lim);
    expect('prog' in r && str(r.prog)).toBe('FFRFF');
    expect('next' in r && r.next).toEqual({ row: 'main', i: 2 });
    expect(place(P('FFRFFF'), { row: 'main', i: 1 }, 'F', 'insert', lim)).toEqual({ refuse: 'full' });
  });
  it('the repeat card wraps the chosen card in a new open block, or opens an empty block in front', () => {
    const w = place(P('FFR'), { row: 'main', i: 1 }, 'X', 'replace', lim);
    expect('prog' in w && str(w.prog)).toBe('F2(F)R');
    expect('open' in w && w.open).toBe(1);
    const e = place(P('FFR'), { row: 'main', i: 2 }, 'X', 'insert', lim);
    expect('prog' in e && progStr(e.prog.main)).toBe('FF2()R');
  });
  it('inside a repeat block: swap and insert work on the body; no block in a block; at most four cards', () => {
    expect(str((place(P('3(FFR)'), { row: 'main', i: 0, j: 2 }, 'L', 'replace', lim) as { prog: Prog }).prog)).toBe('3(FFL)');
    expect(str((place(P('3(FR)'), { row: 'main', i: 0, j: 1 }, 'F', 'insert', lim) as { prog: Prog }).prog)).toBe('3(FFR)');
    expect(place(P('3(FR)'), { row: 'main', i: 0, j: 0 }, 'X', 'replace', lim)).toEqual({ refuse: 'nest' });
    expect(place(P('2(FFFR)'), { row: 'main', i: 0, j: 0 }, 'F', 'insert', { slots: 9, p1Slots: 0 })).toEqual({ refuse: 'bodyfull' });
  });
  it('the magic row: swap and insert; no repeat card, no magic card, at most its slots', () => {
    expect(str((place(P('CC', 'FRF'), { row: 'p1', k: 1 }, 'L', 'replace', lim) as { prog: Prog }).prog)).toBe('CC|FLF');
    expect(str((place(P('CC', 'FRF'), { row: 'p1', k: 0 }, 'F', 'insert', lim) as { prog: Prog }).prog)).toBe('CC|FFRF');
    expect(place(P('C', 'F'), { row: 'p1', k: 0 }, 'X', 'replace', lim)).toEqual({ refuse: 'p1x' });
    expect(place(P('C', 'F'), { row: 'p1', k: 0 }, 'C', 'insert', lim)).toEqual({ refuse: 'p1c' });
    expect(place(P('C', 'FFRF'), { row: 'p1', k: 0 }, 'F', 'insert', lim)).toEqual({ refuse: 'p1full' });
  });
  it('takes out a card, a card of a block, a block, a card of the magic row', () => {
    expect(str(removeAt(P('FFRF'), { row: 'main', i: 2 }))).toBe('FFF');
    expect(str(removeAt(P('F3(FR)'), { row: 'main', i: 1, j: 0 }))).toBe('F3(R)');
    expect(str(removeAt(P('F3(FR)'), { row: 'main', i: 1 }))).toBe('F');
    expect(str(removeAt(P('C', 'FRF'), { row: 'p1', k: 2 }))).toBe('C|FR');
    expect(cardAt(P('F3(FR)'), { row: 'main', i: 1, j: 1 })).toBe('R');
  });
});

/** the way the screen carries out one piece of advice (the same rules as the buttons) */
interface Desk { prog: Item[]; p1: Card[]; open: number; cfg: Config }
function apply(lv: Level, s: Desk, a: Advice): void {
  const lm = { slots: slotsOf(lv, s.cfg), p1Slots: lv.p1Slots ?? 0 };
  const put = (w: Where, card: CardKey, mode: 'replace' | 'insert') => {
    const r = place({ main: s.prog, p1: s.p1 }, w, card, mode, lm);
    if ('refuse' in r) throw new Error(`${lv.id}: refused ${r.refuse} for ${JSON.stringify(a)}`);
    s.prog = r.prog.main; s.p1 = r.prog.p1; if (r.open !== undefined) s.open = r.open;
  };
  switch (a.kind) {
    case 'garage': (s.cfg as unknown as Record<string, string>)[a.part] = a.val; return;
    case 'replace': put(a.at, a.card, 'replace'); return;
    case 'insert': put(a.at, a.card, 'insert'); return;
    case 'remove': {
      const q = removeAt({ main: s.prog, p1: s.p1 }, a.at); s.prog = q.main; s.p1 = q.p1;
      if (a.at.row === 'main' && a.at.j === undefined && s.open >= a.at.i) s.open = s.open === a.at.i ? -1 : s.open - 1;
      return;
    }
    case 'count': { const b = s.prog[a.at]; if (isBlock(b)) b.n = a.n; return; }
    case 'add': {
      if (a.card === 'close') { s.open = -1; return; }
      if (a.row === 'p1') { s.p1.push(a.card as Card); return; }
      if (a.card === 'X') { s.prog.push({ k: 'X', n: 2, body: [] }); s.open = s.prog.length - 1; return; }
      const b = s.open >= 0 ? s.prog[s.open] : undefined;
      if (isBlock(b)) { b.body.push(a.card as Card); if (b.body.length >= MAX_BODY) s.open = -1; } else s.prog.push(a.card as Card);
      return;
    }
    default: throw new Error(`${lv.id}: no move for ${JSON.stringify(a)}`);
  }
}
/** press hint ③ until it says 发送; the programme must then get there within the slots */
function follow(lv: Level, s: Desk): { steps: number; advice: Advice[] } {
  const seen: Advice[] = [];
  for (let k = 0; k < 40; k++) {
    const a = advise(lv, s.cfg, s.prog, s.p1, s.open);
    seen.push(a);
    if (a.kind === 'send') {
      expect(run(lv, s.cfg, s.prog, s.p1).res, `${lv.id} ${progStr(s.prog)}`).toBe('win');
      expect(cost(s.prog)).toBeLessThanOrEqual(slotsOf(lv, s.cfg));
      return { steps: k, advice: seen };
    }
    apply(lv, s, a);
  }
  throw new Error(`${lv.id}: the hint went round in circles from ${progStr(s.prog)}`);
}
const desk = (prog: Item[], p1: Card[] = []): Desk => ({ prog, p1, open: -1, cfg: { ...DEFAULT_CONFIG } });

describe('R4 · hint ③ starts from the child’s own programme', () => {
  it.each(GRID_LEVELS.map((l) => [l.id, l] as const))('%s: from an empty rail (or the buggy one) the hint alone gets there', (_id, lv) => {
    const start = lv.buggy ? desk(parseProg(lv.buggy), [...(lv.buggyP1 ?? '')] as Card[]) : desk([]);
    const { advice } = follow(lv, start);
    expect(advice.some((a) => a.kind === 'none')).toBe(false);
  });

  it.each(GRID_LEVELS.filter((l) => !hasBlocks(l) && !l.buggy).map((l) => [l.id, l] as const))('%s: a good start of the answer is kept: the hint only adds at the end', (_id, lv) => {
    const sol = [...lv.solution.main] as Card[];
    const cfg = lv.loadout ?? DEFAULT_CONFIG;
    for (let k = 0; k < sol.length; k++) {
      const a = adviseFlat(lv, cfg, sol.slice(0, k));
      expect(a.kind, `${lv.id} after ${sol.slice(0, k).join('')}`).toBe('add');
    }
  });

  it('C4-4 (one card too many): the hint takes out just that card, after the child already changed another', () => {
    const lv = grid('C4-4'); // FFFRFF -> FFRFF
    expect(advise(lv, DEFAULT_CONFIG, parseProg('FFFRFF'), [], -1)).toEqual({ kind: 'remove', at: { row: 'main', i: 0 } });
    expect(advise(lv, DEFAULT_CONFIG, parseProg('FFRFF'), [], -1)).toEqual({ kind: 'send' });
  });

  it('C1-5 has two routes as short: starting the other way round is kept, not taken apart', () => {
    const lv = grid('C1-5'); const d = distances(lv, DEFAULT_CONFIG); const d0 = d(startState(lv));
    const firsts = (['N', 'E', 'S', 'W'] as Card[]).filter((c) => { const r = run(lv, DEFAULT_CONFIG, [c]); return r.res !== 'crash' && d(r.s) === d0 - 1; });
    const other = firsts.find((c) => c !== lv.solution.main[0]);
    expect(other).toBeDefined();
    expect(adviseFlat(lv, DEFAULT_CONFIG, [other!]).kind).toBe('add');
    follow(lv, desk([other!]));
  });

  it.each(GRID_LEVELS.filter((l) => !hasBlocks(l) && l.cards.length > 1).map((l) => [l.id, l] as const))('%s: a programme gone astray at the first card is mended in a few moves, never cleared', (_id, lv) => {
    const sol = [...(lv.fix ?? lv.solution.main)] as Card[];
    const wrong = lv.cards.find((c) => c !== sol[0]) as Card;
    const s = desk([wrong, ...sol.slice(1)]);
    s.cfg = { ...(lv.loadout ?? DEFAULT_CONFIG) };
    const { steps } = follow(lv, s);
    expect(steps).toBeLessThanOrEqual(sol.length + 2);
  });

  it.each(GRID_LEVELS.filter((l) => l.buggy).map((l) => [l.id, l] as const))('%s (fix the bug): following the hint from the buggy programme mends it in as many edits as there are bugs', (_id, lv) => {
    const s = desk(parseProg(lv.buggy!), [...(lv.buggyP1 ?? '')] as Card[]);
    s.cfg = { ...(lv.loadout ?? DEFAULT_CONFIG) };
    follow(lv, s);
    expect(editCount(parseProg(lv.buggy!), s.prog, [...(lv.buggyP1 ?? '')] as Card[], s.p1)).toBeLessThanOrEqual(lv.bugs!);
  });

  it('on a level with repeat cards, a programme that left the answer is taken back from its end, one card at a time', () => {
    const lv = grid('C5-3'); // 3(FFR)
    const a = adviseRef(lv, DEFAULT_CONFIG, parseProg('FL'), [], -1);
    expect(a).toEqual({ kind: 'remove', at: { row: 'main', i: 1 }, last: true });
    expect(adviseRef(lv, DEFAULT_CONFIG, [{ k: 'X', n: 2, body: ['F', 'F'] }], [], 0)).toEqual({ kind: 'add', card: 'R', row: 'main' });
    expect(adviseRef(lv, DEFAULT_CONFIG, parseProg('2(FFR)'), [], -1)).toEqual({ kind: 'count', at: 0, n: 3 });
  });

  it('a garage level whose parts cannot get there says which part to change first', () => {
    const lv = grid('C2-4');
    expect(adviseFlat(lv, DEFAULT_CONFIG, [])).toEqual({ kind: 'garage', part: 'wheels', val: 'L' });
    expect(diagnose(lv, DEFAULT_CONFIG, []).kind).toBe('garage');
  });

  it('the third step caps at two stars, not one', () => {
    const lv = grid('C1-1'); const prog = parseProg('EEE');
    expect(starsFor(lv, prog, run(lv, DEFAULT_CONFIG, prog), true)).toBe(2);
    expect(starsFor(lv, prog, run(lv, DEFAULT_CONFIG, prog), false)).toBe(3);
  });
});

describe('R4 · hint ② circles where it goes astray', () => {
  it('an empty rail circles the start; a good start that stops short circles where it stopped', () => {
    const lv = grid('C1-1');
    expect(diagnose(lv, DEFAULT_CONFIG, [])).toEqual({ kind: 'empty', cell: { x: lv.start.x, y: lv.start.y } });
    expect(diagnose(lv, DEFAULT_CONFIG, parseProg('EE'))).toEqual({ kind: 'short', cell: { x: lv.start.x + 2, y: lv.start.y } });
    expect(diagnose(lv, DEFAULT_CONFIG, parseProg('EEE')).kind).toBe('win');
  });
  it('C4-2: the turn the wrong way is the card, and the tile before it is circled', () => {
    const lv = grid('C4-2');
    const d = diagnose(lv, DEFAULT_CONFIG, parseProg(lv.buggy!));
    expect(d.kind).toBe('off');
    if (d.kind !== 'off') return;
    expect(d.path).toEqual([2]);
    const before = run(lv, DEFAULT_CONFIG, parseProg('FF')).s;
    expect(d.cell).toEqual({ x: before.x, y: before.y });
  });
  it('C5-6: the bug is the count, so the card goes astray on a later time round the block', () => {
    const lv = grid('C5-6');
    const d = diagnose(lv, DEFAULT_CONFIG, parseProg(lv.buggy!));
    expect(d.kind === 'off' && d.path[0] === 0 && d.round).toBeGreaterThan(1);
  });
  it.each(GRID_LEVELS.filter((l) => l.buggy).map((l) => [l.id, l] as const))('%s: the buggy programme is found astray (or short), the fix is not', (_id, lv) => {
    const cfg = lv.loadout ?? DEFAULT_CONFIG;
    expect(['off', 'short']).toContain(diagnose(lv, cfg, parseProg(lv.buggy!), [...(lv.buggyP1 ?? '')] as Card[]).kind);
    const ref = refOf(lv)!;
    expect(diagnose(lv, cfg, ref.main, ref.p1).kind).toBe('win');
  });
});

describe('R7 · skipping ahead through a chapter’s big level', () => {
  const save = (ids: string[]) => ({ levels: Object.fromEntries(ids.map((id) => [id, { stars: 2 }])) });
  it('a fresh save: the first level and the big level C1-7 are open, the rest and chapter 2 are not', () => {
    const s = save([]);
    expect(levelOpen(s, 'C1-1')).toBe(true);
    expect(levelOpen(s, 'C1-7')).toBe(true);
    expect(levelOpen(s, 'C1-2')).toBe(false);
    expect(levelOpen(s, 'C2-7')).toBe(false);
    expect(chapterOpen(s, 2)).toBe(false);
  });
  it('getting through C1-7 opens chapter 2: its first and big level', () => {
    const s = save(['C1-7']);
    expect(chapterOpen(s, 2)).toBe(true);
    expect(levelOpen(s, 'C2-1')).toBe(true);
    expect(levelOpen(s, 'C2-7')).toBe(true);
    expect(levelOpen(s, 'C2-2')).toBe(false);
    expect(levelOpen(s, 'C1-8')).toBe(true); // the one after the big level, as before
  });
  it('six levels done still opens the next chapter, and its first level opens with it', () => {
    const s = save(['C1-1', 'C1-2', 'C1-3', 'C1-4', 'C1-5', 'C1-6']);
    expect(chapterOpen(s, 2)).toBe(true);
    expect(levelOpen(s, 'C2-1')).toBe(true);
  });
  it('the parent’s 全部解锁 opens everything', () => { expect(levelOpen(save([]), 'C8-8', true)).toBe(true); });
});

describe('R5 · 月面巡逻 before chapter 3 is behind him', () => {
  const SEEDS = ['2026-11-13', 'a', 'b', 'c', 'seed-42', '0', '1', '2'];
  it('uses the turning cards only once chapter 4 is open', () => {
    expect(patrolTurns({ levels: {} })).toBe(false);
    expect(patrolTurns({ levels: { 'C3-7': { stars: 1 } } })).toBe(true);
  });
  for (const tier of [1, 2, 3] as Tier[]) {
    it(`tier ${tier} with arrow cards: only arrows (and the sample card), solvable in exactly the fewest, inside the range`, () => {
      for (const seed of SEEDS) {
        const lv = generatePatrol(seed, tier, 'arrows');
        expect(lv.cards.every((c) => 'NESWP'.includes(c))).toBe(true);
        const prog = parseProg(lv.solution.main);
        expect(run(lv, DEFAULT_CONFIG, prog).res, seed).toBe('win');
        expect(shortest(lv, lv.cards as Card[])?.n).toBe(lv.expectMin);
        const [lo, hi] = rangeOf(tier, 'arrows');
        expect(lv.expectMin).toBeGreaterThanOrEqual(lo);
        expect(lv.expectMin).toBeLessThanOrEqual(hi);
        expect(lv.req.length).toBe(TIERS[tier].samples);
        expect(lv.ch).toBe(0); // no chapter: the screen shows no level number for it
      }
    });
  }
});
