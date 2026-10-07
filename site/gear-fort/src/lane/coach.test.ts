// V11 (spec §9.1, §5.2): coach — 20 s gap, speaks only on a trigger, retires per (line × machine) but the level's new
// pairing can always speak twice, 「墨子，怎么办？」 always answers and never acts, the big-wave reminder fires once per 战鼓.
// (K+ ≥ max(kpMin, K − 10) per level is checked by the V8 band run: tools/bands.full.test.ts.)
import { describe, it, expect } from 'vitest';
import { createSim, step, spawnEnemy, addUnit, hash } from './sim';
import { T, TPS } from './rules';
import { coachLine, askLine, makeCoachMemory, COACH_GAP, COACH_RETIRE } from './coach';
import type { Level } from './types';

const lv = (o: Partial<Level> = {}): Level => ({ id: 't', lanes: [1, 1, 1, 1, 1], start: 500, loadout: ['shooter', 'wall', 'farm'], sky: false, spawns: [], flags: [], noEnd: true, newEnemy: 'shielder', ...o } as unknown as Level);
const ready = (o: Partial<Level> = {}) => { const S = createSim(lv(o), 1); S.cdReady = {}; return S; };

describe('V11 coach', () => {
  it('an undefended lane with a machine closer than 6.5 tiles gets one line, then 20 s of quiet', () => {
    const S = ready(); spawnEnemy(S, 'walker', 2, 5 * T); const mem = makeCoachMemory();
    const l = coachLine(S, mem); expect(l?.type).toBe('lane'); expect(l?.card).toBe('shooter'); expect(l?.lane).toBe(2);
    expect(coachLine(S, mem)).toBeNull();
    for (let i = 0; i < COACH_GAP - 1; i++) { step(S); expect(coachLine(S, mem), `tick ${S.tick}`).toBeNull(); S.enemies[0].x = 5 * T; }
  });
  it('no trigger, no line: far machines or a defended lane stay silent', () => {
    const S = ready(); spawnEnemy(S, 'walker', 2, 7.5 * T); expect(coachLine(S, makeCoachMemory())).toBeNull();
    const S2 = ready(); spawnEnemy(S2, 'walker', 2, 5 * T); addUnit(S2, 'shooter', 2, 0); expect(coachLine(S2, makeCoachMemory())).toBeNull();
  });
  it('a (line × machine) followed 3 times retires — except the level\'s new machine, which can always be said twice', () => {
    const S = ready(); spawnEnemy(S, 'walker', 2, 5 * T);
    expect(coachLine(S, makeCoachMemory({ 'lane:walker': COACH_RETIRE, 'counter:walker': COACH_RETIRE }))).toBeNull();
    expect(coachLine(S, makeCoachMemory({ 'lane:walker': COACH_RETIRE }))?.type).toBe('counter'); // other pairings still speak
    const S2 = ready({ newEnemy: 'walker' }); spawnEnemy(S2, 'walker', 2, 5 * T); const mem = makeCoachMemory({ 'lane:walker': COACH_RETIRE });
    expect(coachLine(S2, mem)?.type).toBe('lane'); mem.next = 0; expect(coachLine(S2, mem)?.type).toBe('lane'); mem.next = 0; expect(coachLine(S2, mem)?.type).not.toBe('lane');
  });
  it('「墨子，怎么办？」 always answers (retired, quiet, or nothing to say) and never touches the board', () => {
    const S = ready(); spawnEnemy(S, 'walker', 2, 7.5 * T); const mem = makeCoachMemory({ 'lane:walker': COACH_RETIRE });
    expect(coachLine(S, makeCoachMemory())).toBeNull(); // 7.5 tiles: below the coach's own threshold
    const h0 = hash(S); const a = askLine(S, mem); expect(a?.type).toBe('lane'); expect(hash(S)).toBe(h0);
    expect(askLine(S, mem)?.replay).toBe(true); // asked again inside the gap: the same advice again
    const S2 = ready(); expect(askLine(S2, makeCoachMemory())?.type).toBe('concept');
    expect(S.units.length + S2.units.length).toBe(0);
  });
  it('the big-wave reminder fires once per 战鼓 (12 s before it, undefended open lanes)', () => {
    const S = ready({ flags: [600] }); const mem = makeCoachMemory(); let n = 0;
    while (S.tick < 600) { const l = coachLine(S, mem); if (l?.type === 'flag') n++; step(S); }
    expect(n).toBe(1); expect(12 * TPS).toBe(240);
  });
});
