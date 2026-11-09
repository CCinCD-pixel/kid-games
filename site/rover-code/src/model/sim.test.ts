import { describe, expect, it } from 'vitest';
import { LEVELS, CHAPTERS } from './levels';
import { DEFAULT_CONFIG, act, editCount, parseProg, run, slotsOf, startState, type Config } from './sim';
import { starsFor } from './stars';

/** the garage setting a level is built for: its own `loadout`, else the plain rover */
const cfgOf = (lv: (typeof LEVELS)[number]): Config => lv.loadout ?? DEFAULT_CONFIG;

describe('rover-code levels (chapters 1-4)', () => {
  it('has 32 levels in four chapters of eight', () => {
    expect(LEVELS).toHaveLength(32);
    for (const c of CHAPTERS) expect(LEVELS.filter((l) => l.ch === c.ch)).toHaveLength(8);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: its solution gets there within the slots and only uses the cards in the box', (_id, lv) => {
    const prog = parseProg(lv.solution.main);
    const cfg = cfgOf(lv);
    const r = run(lv, cfg, prog);
    expect(r.res).toBe('win');
    expect(prog.length).toBeLessThanOrEqual(slotsOf(lv, cfg));
    for (const c of prog) expect(lv.cards).toContain(c);
    expect(starsFor(lv, prog, r, false)).toBeGreaterThanOrEqual(2);
  });

  it.each(LEVELS.filter((l) => l.buggy).map((l) => [l.id, l] as const))('%s: the buggy program does not get there, the fix does, and the distance is the number of bugs', (_id, lv) => {
    const cfg = cfgOf(lv);
    const buggy = parseProg(lv.buggy!), fix = parseProg(lv.fix!);
    expect(run(lv, cfg, buggy).res).not.toBe('win');
    expect(run(lv, cfg, fix).res).toBe('win');
    expect(editCount(buggy, fix)).toBe(lv.bugs);
    expect(buggy.length).toBeLessThanOrEqual(slotsOf(lv, cfg));
    expect(starsFor(lv, fix, run(lv, cfg, fix), false)).toBe(3);
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
        const fits = prog.length <= slotsOf(lv, DEFAULT_CONFIG);
        expect(plain.res !== 'win' || !fits, lv.id).toBe(true);
      }
    }
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
    expect(r.at).toBe(0);
  });
});
