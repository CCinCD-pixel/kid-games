// Executable mutation suite: 22 merge mutants + 1 ledger mutant, ALL must be killed by the property/dominance/round-trip suite or the semantic oracle.
// Four of them are lattice-valid but wrong (max->min, or->and, union->intersection, rank reversed): the lattice laws alone would NOT see them, which is why dominance + oracles exist.
import { describe, expect, it } from 'vitest';
import { LEDGER_MUTANTS, MERGE_MUTANTS, loadLedger, loadMerge } from './support/mutate';
import { runProps } from './support/suites/props';
import { runSemantic } from './support/suites/semantic';
import { runLedger } from './support/suites/ledger';

const killedBy = (m: (typeof MERGE_MUTANTS)[number]): { full: string[]; laws: boolean } => {
  const M = loadMerge(m); const by: string[] = [];
  if (runSemantic(M).failures.length) by.push('semantic');                                                        // cheap first
  if (runProps(M, { N: 300, stopAtFirst: true }).failures.length) by.push('props(dominance/round-trip/laws)');
  return { full: by, laws: runProps(M, { N: 150, lawsOnly: true, stopAtFirst: true }).failures.length > 0 };
};

describe('merge mutants', () => {
  const results = new Map<string, { full: string[]; laws: boolean }>();
  for (const m of MERGE_MUTANTS) {
    it(`kills ${m.name}${m.lawful ? ' (lattice-valid but wrong)' : ''}: ${m.why}`, () => {
      const r = killedBy(m); results.set(m.name, r);
      expect(r.full.length, `${m.name} SURVIVED`).toBeGreaterThan(0);
    }, 180_000);
  }
  it('score 22/22; there are four lawful-but-wrong mutants; laws alone kill strictly fewer', () => {
    expect(MERGE_MUTANTS.length).toBe(22);
    expect(MERGE_MUTANTS.filter((m) => m.lawful).length).toBe(4);
    const killed = MERGE_MUTANTS.filter((m) => results.get(m.name)?.full.length).length;
    const lawsKilled = MERGE_MUTANTS.filter((m) => results.get(m.name)?.laws).length;
    expect(killed).toBe(22);
    expect(lawsKilled).toBeLessThanOrEqual(18);
    // the lawful-but-wrong ones are (mostly) invisible to the lattice laws: only dominance / round-trip / oracles catch them
    // (max-as-min also breaks the laws through the `g` generation field of gv records, which is a `max` too)
    const lawful = MERGE_MUTANTS.filter((m) => m.lawful);
    expect(lawful.filter((m) => !results.get(m.name)?.laws).length).toBeGreaterThanOrEqual(3);
  });
  it('the unmutated source is NOT killed (the harness itself is sound)', () => {
    const M = loadMerge({ file: 'merge', patches: [] } as never);
    expect(runProps(M, { N: 300 }).failures).toEqual([]);
    expect(runSemantic(M).failures).toEqual([]);
  }, 120_000);
  it('a stale anchor fails loudly instead of testing nothing', () => {
    expect(() => loadMerge({ file: 'merge', patches: [['this text is not in merge.ts', 'x']] } as never)).toThrow(/matched 0x/);
  });
});

describe('ledger mutants', () => {
  for (const m of LEDGER_MUTANTS) {
    it(`kills ${m.name}: ${m.why}`, () => {
      expect(runLedger(loadLedger(m), 2000).failures.length, `${m.name} SURVIVED`).toBeGreaterThan(0);
      expect(runLedger(loadLedger({ file: 'ledger', patches: [] } as never), 2000).failures).toEqual([]);
    }, 120_000);
  }
});
