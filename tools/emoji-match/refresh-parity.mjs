#!/usr/bin/env node
/** Refresh deterministic replay evidence after an intentional engine rule change. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = path.join(root, 'content/emoji-match/parity.json');
const data = JSON.parse(readFileSync(fixture, 'utf8'));
const dir = mkdtempSync(path.join(os.tmpdir(), 'em-parity-'));

try {
  const bundle = await rolldown({
    input: path.join(root, 'site/emoji-match/src/core/index.ts'),
    platform: 'node',
    resolve: { alias: { '@kit': path.join(root, 'kit') } },
    logLevel: 'silent',
  });
  await bundle.write({ dir, format: 'esm', entryFileNames: 'core.mjs' });
  await bundle.close();
  const core = await import(pathToFileURL(path.join(dir, 'core.mjs')).href);
  const key = (m) => m ? (m.t === 'tap' ? `t${m.a}` : `${m.a}-${m.b}`) : null;

  for (const entry of Object.values(data.levels)) {
    const level = core.parseLevel(entry.def);
    const state = core.newGame(level, 7);
    const rng = core.rngNew('bot:G:7');
    entry.start = core.boardString(state);
    entry.trace = [];
    for (let n = 0; n < 6; n += 1) {
      const hint = { best: key(core.bestMove(state)), h1: core.hint1Candidates(state).map(key) };
      const mv = core.chooseMove('G', state, rng);
      if (!mv) break;
      core.applyMove(state, mv);
      entry.trace.push({ mv, board: core.boardString(state), remaining: core.snapshot(state), hint });
    }
    entry.needK = Array.from({ length: 20 }, (_, s) => {
      const n = core.playOut(level, 1000 + s, 'K', 60).needed;
      return n === Infinity ? null : n;
    });
  }
  data.version = core.ENGINE_VERSION;
  writeFileSync(fixture, JSON.stringify(data, null, 1) + '\n');
  console.log(`refreshed ${Object.keys(data.levels).length} parity boards for engine v${data.version}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
