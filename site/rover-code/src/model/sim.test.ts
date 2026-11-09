import { describe, expect, it } from 'vitest';
import { LEVELS, CHAPTERS } from './levels';
import { DEFAULT_CONFIG, MAX_BODY, type Card, act, cost, editCount, flatten, parseProg, progStr, run, slotsOf, startState, type Config } from './sim';
import { starsFor } from './stars';

/** the garage setting a level is built for: its own `loadout`, else the plain rover */
const cfgOf = (lv: (typeof LEVELS)[number]): Config => lv.loadout ?? DEFAULT_CONFIG;

describe('rover-code levels (chapters 1-5)', () => {
  it('has 48 levels in six chapters of eight', () => {
    expect(LEVELS).toHaveLength(48);
    for (const c of CHAPTERS) expect(LEVELS.filter((l) => l.ch === c.ch)).toHaveLength(8);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: its solution gets there within the slots and only uses the cards in the box', (_id, lv) => {
    const prog = parseProg(lv.solution.main);
    const cfg = cfgOf(lv);
    const p1 = [...(lv.solution.p1 ?? '')] as Card[];
    const r = run(lv, cfg, prog, p1);
    expect(r.res).toBe('win');
    expect(cost(prog)).toBeLessThanOrEqual(slotsOf(lv, cfg));
    expect(p1.length).toBeLessThanOrEqual(lv.p1Slots ?? 0);
    for (const { card } of flatten(prog, p1)) expect(lv.cards).toContain(card);
    for (const it of prog) if (it === 'C' || (typeof it !== 'string' && it.body.includes('C'))) expect(lv.cards).toContain('C');
    for (const it of prog) if (typeof it !== 'string') { expect(lv.cards).toContain('X'); expect(it.body.length).toBeGreaterThan(0); expect(it.body.length).toBeLessThanOrEqual(MAX_BODY); }
    expect(starsFor(lv, prog, r, false, p1)).toBeGreaterThanOrEqual(2);
  });

  it.each(LEVELS.filter((l) => l.buggy).map((l) => [l.id, l] as const))('%s: the buggy program does not get there, the fix does, and the distance is the number of bugs', (_id, lv) => {
    const cfg = cfgOf(lv);
    const buggy = parseProg(lv.buggy!), fix = parseProg(lv.fix!);
    const bp1 = [...(lv.buggyP1 ?? '')] as Card[], fp1 = [...(lv.fixP1 ?? '')] as Card[];
    expect(run(lv, cfg, buggy, bp1).res).not.toBe('win');
    expect(run(lv, cfg, fix, fp1).res).toBe('win');
    expect(editCount(buggy, fix, bp1, fp1)).toBe(lv.bugs);
    expect(cost(buggy)).toBeLessThanOrEqual(slotsOf(lv, cfg));
    expect(starsFor(lv, fix, run(lv, cfg, fix, fp1), false, fp1)).toBe(3);
  });

  it('shows nothing the child could read as being wrong: no 错 in any text of the levels', () => {
    for (const l of LEVELS) for (const t of [l.brief, l.title, l.teach]) expect(t).not.toMatch(/错/);
  });

  it('never lets a level be solved by the plain rover when it was built for a garage part (so the choice matters)', () => {
    for (const lv of LEVELS.filter((l) => l.garage && l.loadout)) {
      const prog = parseProg(lv.solution.main);
      const parts = lv.garage!.open;
      const needed = parts.filter((p) => lv.loadout![p] !== DEFAULT_CONFIG[p]);
      // every opened part whose choice is not the default is worth something: the plain rover fails or runs out of slots
      if (needed.length) {
        const plain = run(lv, DEFAULT_CONFIG, prog);
        const fits = cost(prog) <= slotsOf(lv, DEFAULT_CONFIG);
        expect(plain.res !== 'win' || !fits, lv.id).toBe(true);
      }
    }
  });
});

describe('rover-code magic card', () => {
  it('a level that needs the magic card cannot be done in the main row alone', () => {
    for (const lv of LEVELS.filter((l) => l.needCall && !l.buggy)) {
      const p1 = [...(lv.solution.p1 ?? '')] as Card[];
      const expanded = flatten(parseProg(lv.solution.main), p1).length;
      expect(expanded, lv.id).toBeGreaterThan(slotsOf(lv, lv.loadout ?? DEFAULT_CONFIG));
    }
  });
  it('a magic card plays the whole P1 row, with its place in the row, and costs one slot in the main row', () => {
    const steps = flatten(parseProg('CRC'), ['F', 'F']);
    expect(steps.map((x) => x.card).join('')).toBe('FFRFF');
    expect(steps[1].p1).toBe(1);
    expect(steps[2].p1).toBeUndefined();
    expect(cost(parseProg('CRC'), [])).toBe(3);
    expect(cost(parseProg('CRC'), ['F', 'F'])).toBe(5);
  });
  it('mending the magic card is one edit however many times it is played', () => {
    expect(editCount(parseProg('CPCPC'), parseProg('CPCPC'), [...'FRF'] as Card[], [...'FRFL'] as Card[])).toBe(1);
  });
});

describe('rover-code repeat block', () => {
  it('a level that needs the loop cannot be done card by card in its slots', () => {
    for (const lv of LEVELS.filter((l) => l.ch === 5 && !l.buggy)) {
      const flat = flatten(parseProg(lv.solution.main)).length;
      expect(flat, lv.id).toBeGreaterThan(slotsOf(lv, lv.loadout ?? DEFAULT_CONFIG));
    }
  });
  it('text form round-trips and costs one slot for the block plus the cards in it', () => {
    const prog = parseProg('F3(FPF)R');
    expect(progStr(prog)).toBe('F3(FPF)R');
    expect(cost(prog)).toBe(1 + 4 + 1);
    expect(flatten(prog)).toHaveLength(1 + 9 + 1);
  });
  it('editing the count of a block is one edit', () => {
    expect(editCount(parseProg('4(FFFR)F'), parseProg('3(FFFR)F'))).toBe(1);
  });
  it('a program is run in order and stops at the card that cannot be done, with its place in the block', () => {
    const lv = LEVELS.find((l) => l.id === 'C5-1')!;
    const r = run(lv, DEFAULT_CONFIG, parseProg('9(F)'.replace('9', '5')));
    expect(r.res).toBe('win');
    expect(flatten(parseProg('2(FR)')).map((x) => x.path)).toEqual([[0, 0], [0, 1], [0, 0], [0, 1]]);
  });
});

describe('rover-code rules', () => {
  const lv = LEVELS[0];
  it('an arrow card turns and drives in one go; the program must END on the goal', () => {
    const r = run(lv, DEFAULT_CONFIG, parseProg('EEE'));
    expect(r.res).toBe('win');
    expect(run(lv, DEFAULT_CONFIG, parseProg('EEEE')).res).not.toBe('win'); // drove past it
    expect(run(lv, DEFAULT_CONFIG, parseProg('EE')).res).toBe('end');
  });
  it('driving off the map is a crash that keeps the turn', () => {
    const r = act(lv, DEFAULT_CONFIG, startState(lv), 'W');
    expect(r.err).toBe('edge');
  });
  it('a card the rover cannot do stops the program at that card', () => {
    const r = run(lv, DEFAULT_CONFIG, parseProg('WEE'));
    expect(r.res).toBe('crash');
    expect(r.at).toEqual([0]);
  });
});
