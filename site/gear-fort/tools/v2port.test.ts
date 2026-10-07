// v2 kernel branches (spec §0A.3, §8.3): ported with the v1 kernel and OFF in v1 (no v1 level uses them). This check
// proves the port is exact before any v2 level is built: volumes 3–4 of the prototype's plans (water + rafts, floods,
// rocks/high ground, 钩舟, 铜龟车, 穴师/瓮听, 望楼车, 铜鹊, 墨匠, 拆解场, 楼船, 九攻·万机城) are played by the prototype's own
// C and K bots on the prototype kernel; the recorded actions replayed by the TS kernel must give the same per-flag and
// final hashes. Needs the prototype at ~/kid-games-work/specs/lane-defense-tools/proto (skipped when it is absent).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSim, step, hash } from '../src/lane/sim';
import type { Action, Level } from '../src/lane/types';

const PROTO = path.join(os.homedir(), 'kid-games-work/specs/lane-defense-tools/proto');
const OUT = path.join(os.homedir(), 'kid-games-work/reports/gear-fort/v2port');
const MAX = 20 * 60 * 12;
type ProtoSim = { createSim(l: unknown, seed: number): any; step(S: any, a: unknown): void; hash(S: any): string };

describe.skipIf(!fs.existsSync(path.join(PROTO, 'sim.mjs')))('v2 kernel branches = prototype (volumes 3–4)', () => {
  it('C and K on every v2 level, seeds 1–2: TS replay hashes = prototype hashes', async () => {
    const P = (await import(path.join(PROTO, 'sim.mjs'))) as ProtoSim;
    const R = (await import(path.join(PROTO, 'tools/run.mjs'))) as { levelFor(id: string, p: number, b: string, s: number): any; makeBot(n: string, lv: any, s: number): (S: any) => Action[] | null };
    const D = (await import(path.join(PROTO, 'levels/defs.mjs'))) as { LEVEL_IDS: string[] };
    const ids = D.LEVEL_IDS.filter((id) => /^[34]-/.test(id));
    expect(ids.length).toBe(22);
    const rows: string[] = []; const used = new Set<string>(); let games = 0;
    for (const id of ids) for (const bot of ['C', 'K']) for (const seed of [1, 2]) {
      const lv = R.levelFor(id, 1, bot, seed); const frozen = JSON.parse(JSON.stringify(lv)) as Level;
      const S = P.createSim(lv, seed); const b = R.makeBot(bot, lv, seed); const log: [number, Action[]][] = []; const fh: string[] = [];
      const flags = new Set<number>(lv.flags || []);
      while (!S.result && S.tick < MAX) { const a = b(S); if (a && a.length) log.push([S.tick, JSON.parse(JSON.stringify(a))]); if (flags.has(S.tick)) fh.push(P.hash(S)); P.step(S, a); }
      for (const u of S.units) used.add(u.k); for (const e of S.enemies) used.add(e.k);
      const T = createSim(frozen, seed); const m = new Map(log); const th: string[] = [];
      while (!T.result && T.tick < MAX) { if (flags.has(T.tick)) th.push(hash(T)); step(T, m.get(T.tick) ?? null); }
      expect(th, `${id} ${bot} s${seed} flag hashes`).toEqual(fh);
      expect(hash(T), `${id} ${bot} s${seed} final`).toBe(P.hash(S));
      expect(T.result ?? 'timeout', `${id} ${bot} s${seed}`).toBe(S.result ?? 'timeout');
      rows.push(`${id} ${bot} s${seed} ${S.result ?? 'timeout'} t=${S.tick} acts=${log.length} ${P.hash(S)}`); games++;
    }
    // the v2 branches were really exercised (not a vacuous pass)
    for (const k of ['raft', 'salvage', 'listener', 'boat', 'carrier', 'tunneler', 'tower']) expect(used.has(k), k).toBe(true);
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'v2port.txt'), `${games} games, all equal\n${rows.join('\n')}\nkinds seen: ${[...used].sort().join(' ')}\n`);
  }, 600_000);
});
