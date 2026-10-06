/**
 * Self-play invariants (spec §9.3): per mode 1 000 games — random vs random, kid model A vs random,
 * kid A vs kid B, robot 1 vs kid B (¼ each) — on the real engine with the real AI (redacted views).
 * Zero exceptions, zero illegal actions, zero attacks on camps, zero moves of HQ / mine / flag pieces,
 * "flag shown ⇔ 司令 down" after every ply, 暗棋 knowledge always contains the truth, every game ends
 * within 600 plies, and 100 random games replay to the identical final position. Statistics (end
 * reasons, plies median / P90, games decided by the anti-shuttle rule) go to the report.
 *   MC_HEAVY=1 [MC_SP_GAMES=1000] npx vitest run -c tools/military-chess/vitest.heavy.config.ts selfplay
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRng } from '@kit/rng';
import { describe, expect, test } from 'vitest';
import type { Mode } from '../../site/military-chess/src/core/state';
import { median, pct, playGame, replayRecord, type Agent, type GameRecord } from './selfplay';

const OUT = path.join(os.homedir(), 'kid-games-work/military-chess');
const PAIRS: Array<[Agent, Agent]> = [
  [{ kind: 'random' }, { kind: 'random' }],
  [{ kind: 'kidA' }, { kind: 'random' }],
  [{ kind: 'kidA' }, { kind: 'kidB' }],
  [{ kind: 'ai', level: 1 }, { kind: 'kidB' }],
];

describe.skipIf(!process.env.MC_HEAVY)('self-play invariants (§9.3)', () => {
  const games = Number(process.env.MC_SP_GAMES ?? 1000);
  const report: string[] = [];
  for (const mode of ['ming', 'an', 'fan'] as Mode[]) {
    test(`${mode}: ${games} games, 0 violations, all within 600 plies, replay-identical`, () => {
      const t0 = Date.now();
      const recs: GameRecord[] = [];
      let exceptions = 0;
      let l1Blunders = 0, l1Games = 0;
      let capped = 0, cappedRandom = 0;
      const violations: string[] = [];
      for (let g = 0; g < games; g++) {
        const pair = PAIRS[g % 4];
        const agents: [Agent, Agent] = g % 8 < 4 ? pair : [pair[1], pair[0]];
        try {
          const r = playGame(mode, agents, `sp:${mode}:${g}`, { ladder: true, invariants: true });
          recs.push(r);
          violations.push(...r.violations);
          // every game with a robot or a kid model ends within 600 plies; two random movers may wander
          // longer (then the cap ends it by 清点兵力 as R7 says) — counted, reported
          if (r.result.reason === 'ply-cap' || r.result.via === 'ply-cap') {
            if (agents.every((a) => a.kind === 'random')) cappedRandom++;
            else capped++;
          }
          // robot 1 must look like a beginner, not broken (§9.4): no unforced own-HQ walk / sure-loss attack
          agents.forEach((a, i) => {
            if (a.kind === 'ai' && a.level === 1) {
              l1Games++;
              l1Blunders += r.blunders[i];
            }
          });
        } catch (e) {
          exceptions++;
          violations.push(`sp:${mode}:${g} threw ${(e as Error).message}`);
        }
      }
      // replay determinism on 100 random games
      const rng = createRng(`sp:replay:${mode}`);
      let replayDiff = 0;
      for (let i = 0; i < Math.min(100, recs.length); i++) {
        const r = recs[Math.floor(rng.next() * recs.length)];
        if (replayRecord(r, true) !== r.finalHash) replayDiff++;
      }
      const plies = recs.map((r) => r.ply);
      const reasons: Record<string, number> = {};
      for (const r of recs) reasons[r.result.reason] = (reasons[r.result.reason] ?? 0) + 1;
      const shuttle = recs.filter((r) => r.shuttleDecided).length;
      const resets = recs.reduce((a, r) => a + r.beliefResets, 0);
      const line = `${mode}: ${recs.length} games, exceptions ${exceptions}, violations ${violations.length}, replay diffs ${replayDiff}, plies median ${median(plies)} P90 ${pct(plies, 0.9)} max ${Math.max(...plies)}, reasons ${JSON.stringify(reasons)}, decided by the anti-shuttle rule ${shuttle} (${((shuttle / recs.length) * 100).toFixed(2)} %), belief resets ${resets}, robot-1 unforced blunders ${l1Blunders} in ${l1Games} games, 600-ply cap: ${capped} with robots / kid models, ${cappedRandom} random-vs-random (${Math.round((Date.now() - t0) / 1000)} s)`;
      report.push(line, ...violations.slice(0, 10));
      console.log(line);
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `selfplay-${new Date().toISOString().slice(0, 10)}.txt`), report.join('\n') + '\n');
      expect(exceptions).toBe(0);
      expect(violations).toEqual([]);
      expect(replayDiff).toBe(0);
      expect(l1Blunders).toBe(0);
      expect(capped).toBe(0);
      expect(cappedRandom).toBeLessThanOrEqual(Math.ceil(games / 4 / 100)); // ≤ 1 % of the random-vs-random games
      expect(Math.max(...plies)).toBeLessThanOrEqual(600);
    }, 4 * 60 * 60 * 1000);
  }
});
