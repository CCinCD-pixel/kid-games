// V12 / V12b (spec §9.1, §5.3): 败因 — every cause the analyser gives on real lost games is true (checkFacts), the
// breach it talks about is the right one, it never says the same thing three times running, and volume 1 can produce
// a varied set of causes. Real games come from the R / K bots (the same players V8 uses).
import { describe, it, expect } from 'vitest';
import { failCause, causes, checkFacts, pickBreach } from './failcause';
import { runGame } from '../bots/run';
import { LEVELS, ORDER } from '../content';
import type { SimState } from './types';

const V1 = ORDER.filter((id) => id.startsWith('1-'));
const losses: SimState[] = [];
for (const id of V1) for (const bot of ['R', 'K']) for (let seed = 1; seed <= 6; seed++) {
  const g = runGame(LEVELS[id], bot, seed, { events: true }); if (g.S.result === 'lose' || g.S.stats.logsUsed > 0) losses.push(g.S);
}

describe('V12 败因', () => {
  it('there are real lost / log-using games to analyse', () => { expect(losses.length).toBeGreaterThan(30); });
  it('V12b: the cause given is true in ≥95 % of games, and every lost game names a cause', () => {
    let ok = 0; for (const S of losses) { const c = failCause(S); expect(c.id).toBeTruthy(); if (checkFacts(S, c)) ok++; }
    expect(ok / losses.length).toBeGreaterThanOrEqual(0.95);
  });
  it('volume 1 produces at least 4 different causes', () => {
    expect(new Set(losses.map((S) => failCause(S).id)).size).toBeGreaterThanOrEqual(4);
  });
  it('pickBreach: the losing breach; else the 檑木 the new machine forced; else the first 檑木', () => {
    for (const S of losses) {
      const b = pickBreach(S); const ev = S.ev || [];
      if (S.result === 'lose') expect(b?.type).toBe('lose');
      else { const nk = S.L.newEnemy === 'swarm' ? 'ant' : S.L.newEnemy; const want = ev.find((e) => e.type === 'log' && e.by === nk) || ev.find((e) => e.type === 'log'); expect(b).toBe(want); }
    }
  });
  it('never the same cause three times in a row when there is another true one', () => {
    const S = losses.find((x) => causes(x).length > 1); expect(S).toBeTruthy();
    const first = failCause(S!); const k = first.id + (first.kind ? ':' + first.kind : '');
    const third = failCause(S!, { recent: [k, k] }); expect(third.id + (third.kind ? ':' + third.kind : '')).not.toBe(k);
  });
});
