/**
 * Ad-hoc match runner for tuning (not a gate):
 *   MC_HEAVY=1 MC_EXP='{"mode":"fan","x":"kidB","y":"L2","n":60,"patch":{"temp":20}}' \
 *     npx vitest run -c tools/military-chess/vitest.heavy.config.ts experiment
 * x / y: random | kidA | kidB | L1..L4. `patch` applies to y's level (mode-local). Prints JSON lines.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'vitest';
import { patchLevel, type Level } from '../../site/military-chess/src/ai/levels';
import type { Mode } from '../../site/military-chess/src/core/state';
import { agentName, median, pct, playGame, scoreOf, wilson, type Agent } from './selfplay';

const parse = (x: string): Agent => (x.startsWith('L') ? { kind: 'ai', level: Number(x.slice(1)) as Level } : ({ kind: x } as Agent));

describe.skipIf(!process.env.MC_HEAVY || !process.env.MC_EXP)('experiment', () => {
  test('run', () => {
    const cfgs = JSON.parse(process.env.MC_EXP!);
    const list = Array.isArray(cfgs) ? cfgs : [cfgs];
    const out: string[] = [];
    for (const c of list) {
      const mode = c.mode as Mode;
      const x = parse(c.x), y = parse(c.y);
      if (c.patch && y.kind === 'ai') patchLevel(mode, y.level, c.patch);
      if (c.patchX && x.kind === 'ai') patchLevel(mode, x.level, c.patchX);
      const n = c.n ?? 40;
      let score = 0, wins = 0, draws = 0;
      const xActs: number[] = [], plies: number[] = [], yMs: number[] = [], reasons: Record<string, number> = {};
      let viol = 0, blunderY = 0;
      const t0 = Date.now();
      for (let g = 0; g < n; g++) {
        const xFirst = g % 2 === 0;
        const agents: [Agent, Agent] = xFirst ? [x, y] : [y, x];
        const r = playGame(mode, agents, `${c.tag ?? 'exp'}:${mode}:${g}`, { ladder: c.ladder ?? true, invariants: true });
        const xp = (xFirst ? 0 : 1) as 0 | 1;
        const sc = scoreOf(r, xp);
        score += sc;
        if (sc === 1) wins++;
        if (sc === 0.5) draws++;
        xActs.push(r.actions[xp]);
        plies.push(r.ply);
        yMs.push(...r.aiMs[1 - xp]);
        reasons[r.result.reason] = (reasons[r.result.reason] ?? 0) + 1;
        viol += r.violations.length;
        blunderY += r.blunders[1 - xp];
        if (r.violations.length) console.log(r.violations.join('\n'));
      }
      const p = score / n;
      const line = JSON.stringify({
        mode, x: agentName(x), y: agentName(y), n, xScore: +p.toFixed(3), wilson: wilson(p, n).map((v) => +v.toFixed(2)), xWin: +(wins / n).toFixed(3), draws: +(draws / n).toFixed(3),
        xActsMedian: median(xActs), plyMedian: median(plies), yMsMedian: +median(yMs).toFixed(1), yMsP95: +pct(yMs, 0.95).toFixed(1), yMsMax: +pct(yMs, 1).toFixed(1), reasons, viol, blunderY, sec: Math.round((Date.now() - t0) / 1000), patch: c.patch ?? null,
      });
      console.log(line);
      out.push(line);
      // append each cell as soon as it is done (long sweeps can be watched)
      const dir = path.join(os.homedir(), 'kid-games-work/military-chess');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'experiments.jsonl'), line + '\n');
    }
  });
});
