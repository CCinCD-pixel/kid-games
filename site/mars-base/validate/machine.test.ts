/** Item state machine model check (spec §3.2 / V4 "no dead loop"): exhaustive 9-level exploration, dreamer differential, adversaries. */
import { describe, expect, it } from 'vitest';
import { createRng } from '@kit/rng';
import { CHILD_ACTIONS, MACHINE_EVENTS, initMachine, transition, type MachineEvent, type MachineState } from '../src/app/itemMachine';
import type { Mode } from '../src/app/types';

const key = (s: MachineState) => JSON.stringify(s);
function explore(mode: Mode, depth: number) {
  const seen = new Map<string, number>(); const q: [MachineState, number][] = [[initMachine(), 0]]; seen.set(key(initMachine()), 0);
  const errs: string[] = []; const e = (m: string) => { if (errs.length < 8) errs.push(m); };
  while (q.length) {
    const [s, d] = q.shift()!;
    if (d >= depth) continue;
    for (const ev of MACHINE_EVENTS) {
      const n = transition(s, ev, mode);
      if (['idle', 'bg', 'skipDemo', 'subEmpty'].includes(ev)) for (const f of ['hint', 'misses', 'subs', 'firstTry', 'answerShown', 'assisted'] as const) if (n[f] !== s[f]) e(`${mode}: ${ev} changed ${f}`);
      if (mode === 'normal') {
        if (n.hint === 3 && n.subs < 2) e(`H3 with only ${n.subs} submissions`);
        if (n.answerShown !== (n.hint === 3)) e('answerShown ≠ (hint==3)');
        if (n.firstTry === true && !(n.hint === 0 && n.subs === 1 && n.misses === 0)) e('firstTry true although hint/miss');
        if (ev === 'key' && !s.touched && s.subs === 0 && n.hint !== 0) e('hint key worked before any attempt');
        if (n.hint > s.hint + 1) e('hint jumped two levels');
      } else {
        if (n.hint !== 0 || n.consequences || n.answerShown) e(`${mode}: hint/consequence/answer in a deferred-feedback item`);
        if (ev === 'subWrong' && !n.done) e(`${mode}: wrong answer did not deliver`);
      }
      const k = key(n); if (!seen.has(k)) { seen.set(k, d + 1); q.push([n, d + 1]); }
    }
  }
  const dist = (s0: MachineState): number => {
    let fr = [s0]; const seenL = new Set([key(s0)]);
    for (let d = 0; d <= 5; d++) {
      if (fr.some((s) => s.done)) return d;
      const nx: MachineState[] = [];
      for (const s of fr) for (const ev of ['tapAck', ...CHILD_ACTIONS] as MachineEvent[]) { const n = transition(s, ev, mode); const kk = key(n); if (!seenL.has(kk)) { seenL.add(kk); nx.push(n); } }
      fr = nx;
    }
    return 99;
  };
  let worst = 0; for (const k of seen.keys()) worst = Math.max(worst, dist(JSON.parse(k)));
  return { states: seen.size, worst, errs };
}

describe('item machine', () => {
  for (const mode of ['normal', 'cert', 'probe', 'calib'] as Mode[]) {
    it(`${mode}: invariants hold over every reachable state; a cooperative child exits within 4 actions`, () => {
      const r = explore(mode, 9);
      expect(r.errs).toEqual([]);
      expect(r.worst).toBeLessThanOrEqual(4);
      expect(r.states).toBeGreaterThan(3);
    });
  }
  it('dreamer differential: idle / background events anywhere change nothing (20000 sequences)', () => {
    const rng = createRng('machine:dreamer'); let diff = 0;
    for (let t = 0; t < 20000; t++) {
      const seq = Array.from({ length: rng.int(1, 10) }, () => rng.pick(['op', 'subRight', 'subWrong', 'key', 'subEmpty'] as MachineEvent[]));
      let a = initMachine(); let b = initMachine();
      for (const ev of seq) { a = transition(a, ev); b = transition(b, 'idle'); b = transition(b, 'idle'); b = transition(b, ev); b = transition(b, 'bg'); b = transition(b, 'idle'); }
      if (key({ ...a, nudged: false }) !== key({ ...b, nudged: false })) diff++;
    }
    expect(diff).toBe(0);
  });
  it('adversaries: always-wrong exits in ≤4 actions assisted; never-submitting cannot reach H3; clickers stay bounded', () => {
    const run = (f: (n: number, s: MachineState) => MachineEvent, mode: Mode = 'normal') => {
      let s = initMachine(); let n = 0; let steps = 0;
      while (!s.done && steps < 200) { const ev: MachineEvent = s.phase === 'CONSEQUENCE' ? 'tapAck' : f(n, s); if (ev !== 'tapAck' && ev !== 'idle') n++; s = transition(s, ev, mode); steps++; }
      return { done: s.done, n, hint: s.hint, first: s.firstTry, assisted: s.assisted };
    };
    const wrong = run(() => 'subWrong');
    expect(wrong.n).toBeLessThanOrEqual(4); expect(wrong.assisted).toBe(true); expect(wrong.first).toBe(false);
    const alt = run((i) => (i % 2 ? 'subRight' : 'subWrong')); expect(alt.first).toBe(false);
    const never = run((i) => (i % 2 ? 'key' : 'op')); expect(never.hint).toBeLessThan(3); expect(never.done).toBe(false);
    const rng = createRng('machine:clickers');
    const clickers = Array.from({ length: 2000 }, () => run(() => rng.pick(['op', 'key', 'subWrong', 'subRight', 'subEmpty', 'idle'] as MachineEvent[])));
    for (const c of clickers.filter((x) => x.done)) expect(c.n).toBeLessThanOrEqual(60);
    // a cert / probe item takes exactly one attempt whatever the answer
    expect(run(() => 'subWrong', 'cert').n).toBe(1); expect(run(() => 'subRight', 'probe').first).toBe(true);
  });
});
