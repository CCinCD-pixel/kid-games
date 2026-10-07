// V14 (spec §8.8): the calibration replay log — at most 8 games kept, each record ≤ 8 KB (latest actions dropped first,
// marked truncated). Node has no IndexedDB, so this runs on snapstore's memory fallback; flow.spec checks the WebKit store.
import { describe, expect, it } from 'vitest';
import { capReplay, getReplays, getSnap, putSnap, REPLAY_KEEP, REPLAY_MAX_BYTES, putReplay, usableSnap, type ReplayRec, type SnapRec } from './snapstore';

const rec = (i: number, n = 20): ReplayRec => ({ level: '1-3', seed: i, from: 0, loadout: ['shooter', 'farm', 'wall'], assist: 0, result: 'lose', stars: 0, tick: 2000,
  actions: Array.from({ length: n }, (_, k) => [k * 37, [{ t: 'place', card: 'shooter', lane: k % 5, col: k % 8 }]] as [number, unknown[]]), at: new Date(0).toISOString(), kernelVersion: 'test' });

describe('replay log', () => {
  it('caps one record at 8 KB and says so', () => {
    const big = capReplay(rec(1, 600));
    expect(JSON.stringify(big).length).toBeLessThanOrEqual(REPLAY_MAX_BYTES); expect(big.truncated).toBe(true); expect(big.actions.length).toBeGreaterThan(20);
    const small = capReplay(rec(2)); expect(small.truncated).toBeUndefined(); expect(small.actions.length).toBe(20);
  });
  it('keeps the last 8 games, oldest first', async () => {
    for (let i = 0; i < 11; i++) await putReplay(rec(i));
    const list = await getReplays(); expect(list.length).toBe(REPLAY_KEEP); expect(list.map((r) => r.seed)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('durable snapshots (V14)', () => {
  it('a snapshot from another kernel version or another level is discarded', () => {
    expect(usableSnap({ kernelVersion: 'abc', level: '1-3' }, '1-3', 'abc')).toBe(true);
    expect(usableSnap({ kernelVersion: 'old', level: '1-3' }, '1-3', 'abc')).toBe(false);
    expect(usableSnap({ kernelVersion: 'abc', level: '1-4' }, '1-3', 'abc')).toBe(false);
    expect(usableSnap(null, '1-3', 'abc')).toBe(false);
  });
  it('putSnap / getSnap round-trip a record (memory fallback in Node; IndexedDB in WebKit — flow.spec 🏠 test)', async () => {
    const r = { key: 'suspend', kind: 'suspend', level: '1-3', seed: 1, loadout: ['shooter'], snap: { tick: 5 } as unknown as SnapRec['snap'], h: 'x', kernelVersion: 'k', restored: 0, assist: 0, flag: 0, at: new Date(0).toISOString() } as unknown as SnapRec;
    await putSnap(r, true); const got = await getSnap('suspend');
    expect(got?.level).toBe('1-3'); expect(got?.kernelVersion).toBe('k');
  });
});

// spec §8.8: the stored snapshot ≤ 18 KB — measured on the packed IndexedDB form over every design solution (every 10
// ticks) — and the packing is lossless (deep-equal round trip, the kernel's hash still matches on resume). QA r3 minor.
import fs from 'node:fs';
import path from 'node:path';
import { packSnap, unpackSnap } from './snapstore';
import { createSim, step, snapshot, resume, hash } from './lane/sim';
import type { Action, Level } from './lane/types';
describe('snapshot budget', () => {
  const C = path.resolve(__dirname, '../../../content/gear-fort');
  const read = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(C, p), 'utf8')) as T;
  const ids = fs.readdirSync(path.join(C, 'dscripts')).map((f) => f.replace('.json', ''));
  it('packed snapshot ≤ 18 KB for every design solution, lossless', () => {
    let worst = 0, at = '';
    for (const id of ids) {
      const ds = read<{ loadout: string[]; actions: [number, Action[]][] }>(`dscripts/${id}.json`); const L = { ...read<Level>(`levels/${id}.json`), loadout: ds.loadout };
      const S = createSim(L, 0); let i = 0;
      while (!S.result && S.tick < 14400) {
        step(S, i < ds.actions.length && ds.actions[i][0] === S.tick ? ds.actions[i++][1] : null);
        if (S.tick % 10) continue;
        const sn = snapshot(S); const p = packSnap(sn); const n = new TextEncoder().encode(JSON.stringify(p)).length; if (n > worst) { worst = n; at = `${id}@${S.tick}`; }
        if (S.tick % 500 === 0) { const back = unpackSnap(JSON.parse(JSON.stringify(p))); expect(back).toEqual(sn); const R = resume(back, L); expect(R && hash(R)).toBe(hash(S)); }
      }
    }
    console.log(`snapshot budget: worst packed ${worst} B at ${at}`);
    expect(worst).toBeLessThanOrEqual(18 * 1024);
  });
});
