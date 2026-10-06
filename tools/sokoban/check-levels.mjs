#!/usr/bin/env node
// @ts-check
/**
 * 星港搬运工 — validate every shipped level with the game's own solver and write the report.
 *
 *   node tools/sokoban/check-levels.mjs            fast validator + engine parity (≈10 s)
 *   node tools/sokoban/check-levels.mjs --full     + the env-gated heavy checks (SOK_FULL=1: C10 graph bench, …)
 *
 * The validators are vitest files because they must run the page's TypeScript engine itself
 * (`@engines/puzzle`), not a copy (spec §8.10; the repo's Node 20 cannot import TS directly):
 *   site/sokoban/levels.test.ts      G1–G10, lesson assertions (L), chapter curve (C1–C3, C5),
 *                                    metric + deadlock-depth parity with the spec's prototype numbers
 *   engines/puzzle/tests/*.test.ts   parsing, walking, the four deadlock rules (zero false positives
 *                                    on every reachable state), state graph = optimum, A*, hints, twins,
 *                                    parity with the prototype fixture (state digests)
 *   site/sokoban/render.test.ts      palette gates (also → reports/sokoban/palette.txt), layout formula
 * Report: ~/kid-games-work/reports/sokoban/levels-fast.txt (per level: size, crates, optimal
 * pushes/moves, ★★ threshold, states, first-push traps, parking, greedy, switches/turns, D, first
 * depth of each deadlock type, shallowest invisible dead end, result). Exit code = vitest's.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const full = process.argv.includes('--full');
const files = ['site/sokoban/levels.test.ts', 'site/sokoban/render.test.ts', 'engines/puzzle/tests', ...(full ? ['site/sokoban/tools'] : [])];
const env = { ...process.env, SOK_REPORT: '1', ...(full ? { SOK_FULL: '1' } : {}) };
const r = spawnSync('npx', ['vitest', 'run', ...files], { cwd: ROOT, env, stdio: 'inherit' });
const report = path.join(os.homedir(), 'kid-games-work/reports/sokoban/levels-fast.txt');
if (fs.existsSync(report)) {
  const head = fs.readFileSync(report, 'utf8').split('\n').slice(0, 3).join('\n');
  console.log(`\n${head}\nreport: ${report}`);
}
process.exit(r.status ?? 1);
