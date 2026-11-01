/**
 * QA fix-mars-r2 BLOCKER 1: after ONE wrong answer every multi-cell keypad item (col.add, col.sub, mul.write sum, mul.split, mul.compareArr) was a dead end,
 * because the runner kept the cells of the first attempt. app/cellInput.ts is the pure state machine that replaces those two variables; these tests drive it
 * the way the runner does, against the REAL oracles and the REAL judge: enter, wrong -> clear -> retry, H1-H3, assisted (H3 shows the answer cell by cell),
 * twin / new item, backspace, resume mid-item.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '@kit/rng';
import { FAMILIES } from '../src/families';
import { judge } from '../src/app/judge';
import { KEYPAD_CELLS, backCell, cellAnswers, cellView, cellsDone, enterCell, newCells, rewindCells, type CellsState } from '../src/app/cellInput';

const labels = (id: string) => KEYPAD_CELLS[id];
/** the child types `vals` cell by cell; returns the list handed to the judge (null when it stopped before the last cell) and the state */
function typeAll(s: CellsState, vals: number[]): { s: CellsState; submit: number[] | null } {
  let st = s; let submit: number[] | null = null;
  for (const v of vals) { const r = enterCell(st, v); st = r.state; if (r.submit) submit = r.submit; }
  return { s: st, submit };
}

describe('cellInput: the state machine itself', () => {
  it('enter: one value per ✓, the last ✓ hands over the whole list in cell order and rewinds', () => {
    let s = newCells(3);
    const a = enterCell(s, 7); expect(a.submit).toBeNull(); expect(a.state).toMatchObject({ idx: 1, vals: [7] }); s = a.state;
    const b = enterCell(s, 0); expect(b.submit).toBeNull(); expect(b.state.idx).toBe(2); s = b.state;
    const c = enterCell(s, 42); expect(c.submit).toEqual([7, 0, 42]); expect(c.state).toEqual(newCells(3));
  });
  it('an empty / non-numeric ✓ changes nothing', () => {
    const s = enterCell(newCells(2), 5).state;
    for (const v of [null, NaN, Infinity]) { const r = enterCell(s, v as number | null); expect(r.empty).toBe(true); expect(r.state).toBe(s); expect(r.submit).toBeNull(); }
    expect(enterCell(newCells(0), 3).empty).toBe(true);   // a stage without cells never produces a list
  });
  it('BLOCKER 1: wrong -> clear -> retry hands over exactly n values again (the old runner produced 3-4 and judged them wrong for ever)', () => {
    for (const n of [1, 2, 3]) {
      let s = newCells(n);
      const first = typeAll(s, Array.from({ length: n }, (_, i) => 90 + i)); expect(first.submit).toHaveLength(n); s = first.s;
      for (let attempt = 0; attempt < 6; attempt++) { const r = typeAll(s, Array.from({ length: n }, (_, i) => attempt * 10 + i)); expect(r.submit, `attempt ${attempt}`).toEqual(Array.from({ length: n }, (_, i) => attempt * 10 + i)); s = r.s; }
    }
  });
  it('rewind (wrong verdict, retry, hint level change, twin, new item) forgets a half-typed attempt', () => {
    let s = enterCell(newCells(3), 4).state; s = enterCell(s, 5).state; expect(s.idx).toBe(2);
    s = rewindCells(s); expect(s).toEqual(newCells(3));
    expect(typeAll(s, [1, 2, 3]).submit).toEqual([1, 2, 3]);
    expect(rewindCells(newCells(2))).toEqual(newCells(2));
  });
  it('backspace on an empty display steps back one cell and gives its number back; never past cell 0; the redone entry replaces the old one', () => {
    expect(backCell(newCells(2))).toBeNull();
    let s = enterCell(newCells(3), 12).state; s = enterCell(s, 34).state;
    const b = backCell(s)!; expect(b.display).toBe('34'); expect(b.state).toMatchObject({ idx: 1, vals: [12] });
    const b2 = backCell(b.state)!; expect(b2.display).toBe('12'); expect(b2.state).toEqual(newCells(3)); expect(backCell(b2.state)).toBeNull();
    // change the second cell after stepping back
    const redo = typeAll(b.state, [35, 99]); expect(redo.submit).toEqual([12, 35, 99]);
  });
  it('resume mid-item: the runner deals the item again with a fresh state; it needs the full list from cell 0 (and a half-typed attempt before the reload is gone)', () => {
    const before = enterCell(newCells(2), 8).state; expect(before.idx).toBe(1);
    const resumed = newCells(labels('col.add').length); expect(resumed).toEqual(newCells(2));
    expect(typeAll(resumed, [8, 1]).submit).toEqual([8, 1]);
  });
  it('H3 assisted view: the display shows the answer for the cell being filled, so ✓ ✓ ✓ completes the item with the oracle list', () => {
    const answer = [3, 4, 5]; let s = newCells(3); let list: number[] | null = null;
    for (let guard = 0; guard < 5 && !list; guard++) { const v = cellView(s, ['a', 'b', 'c'], answer); expect(v.display).toBe(String(answer[s.idx])); const r = enterCell(s, Number(v.display)); s = r.state; list = r.submit; }
    expect(list).toEqual(answer);
    expect(cellView(newCells(2), ['个位', '十位'], null)).toEqual({ label: '个位', display: '' });
    expect(cellView(enterCell(newCells(2), 1).state, ['个位', '十位'], null).label).toBe('十位');
    expect(cellView(newCells(2), ['个位', '十位'], [1]).display).toBe('');   // an answer of the wrong length is not shown
  });
  it('cellAnswers: the typed tail of an answer (compareArr has a stage-side first value)', () => {
    expect(cellAnswers([1, 24], 1)).toEqual([24]); expect(cellAnswers([5, 3], 2)).toEqual([5, 3]); expect(cellAnswers([6, 12, 18], 3)).toEqual([6, 12, 18]);
    expect(cellAnswers(7, 1)).toBeNull(); expect(cellAnswers([1], 2)).toBeNull(); expect(cellAnswers([1, 2], 0)).toBeNull();
  });
  it('random walk: idx always equals the number of kept values, never reaches n, the list is always exactly n long', () => {
    const rng = createRng('cells-walk');
    for (const n of [1, 2, 3]) {
      let s = newCells(n);
      for (let i = 0; i < 4000; i++) {
        const k = rng.int(0, 9);
        if (k < 6) { const r = enterCell(s, rng.int(0, 999)); if (r.submit) expect(r.submit).toHaveLength(n); s = r.state; }
        else if (k < 8) { const b = backCell(s); if (b) s = b.state; }
        else if (k < 9) s = rewindCells(s);
        else { const r = enterCell(s, null); s = r.state; }
        expect(s.idx).toBe(s.vals.length); expect(s.idx).toBeLessThan(n); expect(cellsDone(s)).toBe(false);
      }
    }
  });
});

/** Every multi-cell family, real generated items, real judge: the whole child dialogue (right path, wrong -> retry, wrong x3 -> assisted, twin) always ends with an accepted answer. */
describe('cellInput x oracle x judge: no item of the five multi-cell families can be a dead end', () => {
  const N = process.env.MARS_FULL ? 200 : 60;
  const specs: { id: string; ask?: string; pre: number }[] = [
    { id: 'col.add', pre: 0 }, { id: 'col.sub', pre: 0 }, { id: 'mul.write', ask: 'sum', pre: 0 }, { id: 'mul.split', pre: 0 }, { id: 'mul.compareArr', pre: 1 },
  ];
  for (const sp of specs) {
    it(`${sp.id}: right path, wrong -> clear -> retry, three wrongs -> H3 answer shown -> assisted ✓ ✓ ✓, and again for the twin`, () => {
      const f = FAMILIES[sp.id]; const rng = createRng(`cells:${sp.id}`); const lab = labels(sp.id); expect(lab, `${sp.id} has cells`).toBeTruthy();
      for (let i = 0; i < N; i++) {
        const band = 1 + (i % f.bands); const out = f.gen(rng, { band, level: 3, rep: 'C', ask: sp.ask, knobs: {}, l6: i % 7 === 0 });
        const p = out.params as any; const correct = f.oracle(p, sp.ask); const tail = cellAnswers(correct, lab.length)!; expect(tail, `${sp.id} oracle tail`).toBeTruthy();
        const pre = Array.isArray(correct) ? correct.slice(0, sp.pre) : [];   // what the stage itself contributes (compareArr: which board)
        const send = (list: number[]) => judge(f, p, [...pre, ...list], sp.ask);
        // 1. wrong first (every cell off by one; nothing in the old state may survive), then wrong again, then the right list
        let s = newCells(lab.length);
        const w1 = typeAll(s, tail.map((x) => x + 1)); expect(w1.submit).toHaveLength(lab.length); expect(send(w1.submit!).ok, 'wrong list judged wrong').toBe(false); s = rewindCells(w1.s);
        const w2 = typeAll(s, tail.map((x) => x + 2)); expect(send(w2.submit!).ok).toBe(false); s = rewindCells(w2.s);
        // a half-typed attempt, then a hint changes the level: the attempt restarts
        s = rewindCells(enterCell(s, 5).state);
        const r = typeAll(s, tail); expect(r.submit, `${sp.id} ${JSON.stringify(p)}`).toEqual(tail); expect(send(r.submit!).ok, 'right list accepted after two wrongs').toBe(true);
        // 2. assisted: misses 1-3, H3 shows the answer cell by cell; the child only presses ✓
        let t = newCells(lab.length); let got: number[] | null = null;
        for (let g = 0; g < lab.length + 1 && !got; g++) { const v = cellView(t, lab, tail); const e = enterCell(t, Number(v.display)); t = e.state; got = e.submit; }
        expect(got).toEqual(tail); expect(send(got!).ok).toBe(true);
        // 3. the twin (a new item = a new state) works from cell 0
        expect(typeAll(newCells(lab.length), tail).submit).toEqual(tail);
      }
    });
  }
});
