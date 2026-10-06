/**
 * AI calibration (spec §9.4): child model B against every robot (≥ 200 games a cell) and adjacent
 * robots against each other (≥ 60 games), ladder rules (清点兵力), fixed seeds, first move alternating.
 * A cell PASSES when the point estimate is inside the band (tolerance ±0.05) AND the Wilson 95 %
 * interval overlaps the band. Writes ~/kid-games-work/military-chess/calib-<date>.txt (+ .json) and
 * appends every cell to calib-cells.jsonl as soon as it is done.
 *
 *   MC_HEAVY=1 [MC_CALIB_MODES=fan,ming,an] [MC_CALIB_N=200] [MC_CALIB_PAIRS=60] [MC_CALIB_LEVELS=1,2,3,4] \
 *   [MC_CALIB_PATCH='{"fan":{"3":{"wander":0.7}}}'] [MC_CALIB_SKIP_PAIRS=1] \
 *     npx vitest run -c tools/military-chess/vitest.heavy.config.ts calibrate
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEVELS, patchLevel, type Level, type LevelCfg } from '../../site/military-chess/src/ai/levels';
import type { Mode } from '../../site/military-chess/src/core/state';
import { median, pct, playGame, scoreOf, wilson, type Agent } from './selfplay';

const BANDS: Record<Level, [number, number]> = { 1: [0.8, 0.95], 2: [0.6, 0.75], 3: [0.4, 0.55], 4: [0.15, 0.3] };
const KID_ACTS: Record<Mode, number> = { fan: 110, ming: 70, an: 90 };
const OUT = path.join(os.homedir(), 'kid-games-work/military-chess');

export interface Cell {
  mode: Mode;
  x: string;
  y: string;
  n: number;
  score: number;
  wilson: [number, number];
  win: number;
  decisive: number;
  actsMedian: number;
  actsP90: number;
  aiMsP95: number;
  aiMsMax: number;
  reasons: Record<string, number>;
  violations: number;
  blunders: number;
  forcedBlunders: number;
  sec: number;
}

/** play n games x vs y (x moves first in even games); scores are x's */
export function runCell(mode: Mode, x: Agent, y: Agent, n: number, tag: string): Cell {
  let score = 0, wins = 0, draws = 0, viol = 0, blunders = 0;
  const acts: number[] = [], ms: number[] = [], reasons: Record<string, number> = {};
  const t0 = Date.now();
  for (let g = 0; g < n; g++) {
    const xFirst = g % 2 === 0;
    const agents: [Agent, Agent] = xFirst ? [x, y] : [y, x];
    const r = playGame(mode, agents, `${tag}:${mode}:${g}`, { ladder: true, invariants: true });
    const xp = (xFirst ? 0 : 1) as 0 | 1;
    const sc = scoreOf(r, xp);
    score += sc;
    if (sc === 1) wins++;
    if (sc === 0.5) draws++;
    acts.push(r.actions[xp]);
    ms.push(...r.aiMs[1 - xp], ...r.aiMs[xp]);
    reasons[r.result.reason] = (reasons[r.result.reason] ?? 0) + 1;
    viol += r.violations.length;
    blunders += r.blunders[1 - xp];
    if (r.violations.length) console.log(r.violations.join('\n'));
  }
  const p = score / n;
  const name = (a: Agent) => (a.kind === 'ai' ? `L${a.level}` : a.kind);
  return {
    mode, x: name(x), y: name(y), n, score: +p.toFixed(3), wilson: wilson(p, n).map((v) => +v.toFixed(3)) as [number, number], win: +(wins / n).toFixed(3),
    decisive: +(1 - draws / n).toFixed(3), actsMedian: median(acts), actsP90: pct(acts, 0.9), aiMsP95: +pct(ms, 0.95).toFixed(1), aiMsMax: +pct(ms, 1).toFixed(1),
    reasons, violations: viol, blunders, forcedBlunders: 0, sec: Math.round((Date.now() - t0) / 1000),
  };
}

export function passBand(c: Cell, band: [number, number]): boolean {
  const tol = 0.05;
  const inBand = c.score >= band[0] - tol && c.score <= band[1] + tol;
  const overlap = c.wilson[1] >= band[0] && c.wilson[0] <= band[1];
  return inBand && overlap;
}

describe.skipIf(!process.env.MC_HEAVY)('calibrate (§9.4)', () => {
  test('kid model B vs robots, adjacent robots', () => {
    const modes = (process.env.MC_CALIB_MODES ?? 'fan,ming,an').split(',') as Mode[];
    const levels = (process.env.MC_CALIB_LEVELS ?? '1,2,3,4').split(',').map(Number) as Level[];
    const n = Number(process.env.MC_CALIB_N ?? 200);
    const nPairs = Number(process.env.MC_CALIB_PAIRS ?? 60);
    const patch = JSON.parse(process.env.MC_CALIB_PATCH ?? '{}') as Record<string, Record<string, Partial<LevelCfg>>>;
    for (const [m, lv] of Object.entries(patch)) for (const [l, p] of Object.entries(lv)) patchLevel(m as Mode, Number(l) as Level, p);
    fs.mkdirSync(OUT, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    const cells: Array<Cell & { band?: [number, number]; pass: boolean; notes: string[] }> = [];
    const log = (c: Cell & { band?: [number, number]; pass: boolean; notes: string[] }): void => {
      cells.push(c);
      fs.appendFileSync(path.join(OUT, 'calib-cells.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...c }) + '\n');
      const line = `${c.mode.padEnd(4)} ${c.x.padEnd(5)} vs ${c.y.padEnd(3)} n=${String(c.n).padStart(3)} score ${c.score.toFixed(3)} [${c.wilson[0].toFixed(2)}–${c.wilson[1].toFixed(2)}]${c.band ? ` band ${c.band[0]}–${c.band[1]}` : ' ≥0.62'} win ${c.win.toFixed(2)} decisive ${(c.decisive * 100).toFixed(0)}% acts ${c.actsMedian}/${c.actsP90} aiP95 ${c.aiMsP95}ms max ${c.aiMsMax}ms viol ${c.violations} blunders ${c.blunders} ${c.pass ? 'PASS' : 'FAIL'} ${c.notes.join('; ')} (${c.sec}s)`;
      lines.push(line);
      console.log(line);
    };
    for (const mode of modes) {
      for (const level of levels) {
        const c = runCell(mode, { kind: 'kidB' }, { kind: 'ai', level }, n, 'calib');
        const band = BANDS[level];
        const notes: string[] = [];
        let pass = passBand(c, band);
        if (!pass) notes.push('score band');
        if (c.decisive < 0.85) {
          pass = false;
          notes.push('decisive < 85%');
        }
        if (level === 4 && c.win < 0.1) {
          pass = false;
          notes.push('L4 kid win < 0.10');
        }
        if (level <= 2 && c.actsMedian > KID_ACTS[mode]) {
          pass = false;
          notes.push(`kid acts > ${KID_ACTS[mode]}`);
        }
        if (level === 1 && c.blunders > 0) notes.push(`L1 blunders ${c.blunders} (forced only?)`);
        if (c.violations) {
          pass = false;
          notes.push('violations');
        }
        const cfg = LEVELS[mode][level];
        notes.push(`cfg topK ${cfg.topK} temp ${cfg.temp} overlook ${cfg.overlook} wander ${cfg.wander}`);
        log({ ...c, band, pass, notes });
      }
      if (!process.env.MC_CALIB_SKIP_PAIRS) {
        for (const level of levels) {
          if (level === 1) continue;
          const c = runCell(mode, { kind: 'ai', level }, { kind: 'ai', level: (level - 1) as Level }, nPairs, 'calib-pair');
          const notes: string[] = [];
          const pass = c.score >= 0.62 && c.violations === 0;
          if (!pass) notes.push('adjacent < 0.62');
          log({ ...c, pass, notes });
        }
      }
    }
    const head = `陆战棋 AI calibration ${new Date().toISOString()} — spec §9.4 bands; ladder rules (清点兵力); ${n} games per kid cell, ${nPairs} per adjacent pair; CRN seeds 'calib:<mode>:<g>'.\n`;
    fs.writeFileSync(path.join(OUT, `calib-${date}.txt`), head + lines.join('\n') + '\n');
    fs.writeFileSync(path.join(OUT, `calib-${date}.json`), JSON.stringify(cells, null, 1));
    expect(cells.every((c) => c.violations === 0)).toBe(true);
  });
});
