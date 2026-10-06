#!/usr/bin/env node
/**
 * Launcher for the 星晶消消乐 headless simulator (tools/emoji-match/sim/*.ts). It bundles the TypeScript
 * sources — which import the game's REAL engine site/emoji-match/src/core and the shipped content —
 * with the repo's own rolldown (no new dependency, nothing downloaded) into
 * ~/kid-games-work/emoji-match/sim-build/, then runs the simulation on worker threads.
 *
 *   node tools/emoji-match/tune.mjs                 full tier: V4 (K400 G200 R200 L100 KH200 + held-out K400) + V5
 *   node tools/emoji-match/tune.mjs --compare       … and diff against the sim evidence in levels.json
 *   node tools/emoji-match/tune.mjs --fast          V4f numbers (K60, L20 on H/B)
 *   node tools/emoji-match/tune.mjs 3-0 --retune    re-pick move limits for matching levels (tuning loop)
 *   node tools/emoji-match/tune.mjs --retune --write   … and write moves / stars / sim into levels.json
 *   --workers=4 (default; RESOURCE RULES: this Mac is shared)  --scale=0.25 (quick look)
 * Reports → ~/kid-games-work/emoji-match/{tune*.txt, validate-report.json}. Exit 1 on any flag.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.join(os.homedir(), 'kid-games-work/emoji-match/sim-build');

// RESOURCE RULES: refuse to start below 25 % free memory
try {
  const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
  if (free < 25) { console.error(`memory free ${free}% < 25% — wait and retry (RESOURCE RULES)`); process.exit(2); }
} catch { /* not macOS: skip */ }

mkdirSync(BUILD, { recursive: true });
const { rolldown } = await import(pathToFileURL(path.join(ROOT, 'node_modules/rolldown/dist/index.mjs')).href);
const t0 = Date.now();
const bundle = await rolldown({
  input: { tune: path.join(ROOT, 'tools/emoji-match/sim/tune.ts'), worker: path.join(ROOT, 'tools/emoji-match/sim/worker.ts') },
  platform: 'node',
  resolve: { alias: { '@kit': path.join(ROOT, 'kit'), '@engines': path.join(ROOT, 'engines') } },
  logLevel: 'warn',
});
await bundle.write({ dir: BUILD, format: 'esm', entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' });
await bundle.close();
process.stderr.write(`bundled the simulator in ${Date.now() - t0} ms → ${BUILD}\n`);

process.env.EM_REPO = ROOT;
const { main } = await import(pathToFileURL(path.join(BUILD, 'tune.mjs')).href);
process.exitCode = await main(pathToFileURL(path.join(BUILD, 'worker.mjs')));
