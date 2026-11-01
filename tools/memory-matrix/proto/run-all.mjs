// One command that re-proves every number in docs/specs/memory-matrix.md §11.   node run-all.mjs [--quick] [--out=dir]
// Reports (stats-report.json, sim-report.json, pacing-report.json, levels.json) go to --out (default: next to this file; the repo copy uses ~/kid-games-work/mm-reports).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const quick = process.argv.includes('--quick');
import { OUT } from './paths.mjs';
const here = new URL('.', import.meta.url).pathname;
const out = (process.argv.find((a) => a.startsWith('--out=')) || '').split('=')[1] || OUT;
fs.mkdirSync(out, { recursive: true });
const J = (f) => path.join(out, f);
const steps = [
  ['palette', ['palette.mjs']], ['layout', ['layout.mjs']], ['narration', ['narration-lint.mjs']], ['cards', ['cards.mjs']], ['constellations', ['constellations.mjs']],
  ['generators (stats)', ['stats.mjs', `--n=${quick ? 300 : 2000}`, `--json=${J('stats-report.json')}`, '--stretch']],
  ['levels.json', ['export-levels.mjs', J('levels.json')]],
  ['golden fixtures', ['golden.mjs', '--check']],
  ['selftest', ['selftest.mjs', '--quiet']], ['negative controls', ['negctl.mjs']],
  ['adaptive simulation', ['sim.mjs', `--runs=${quick ? 30 : 100}`, '--rounds=400', `--json=${J('sim-report.json')}`]],
  ['six-week pacing', ['pacing.mjs', `--runs=${quick ? 20 : 60}`, `--json=${J('pacing-report.json')}`]],
];
let bad = 0;
for (const [name, args] of steps) {
  const r = spawnSync('node', args, { cwd: here, encoding: 'utf8', env: { ...process.env, MM_OUT: out } });
  const lines = (r.stdout || '').trim().split('\n'), tail = lines.filter((l) => /failed|FAIL/.test(l)).slice(-1)[0] || (r.status === 0 ? 'ok' : (r.stderr || '').slice(0, 300));
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${tail}`); if (r.status !== 0) { bad += 1; lines.filter((l) => /FAIL/.test(l)).slice(0, 6).forEach((l) => console.log('        ' + l)); }
}
process.exit(bad ? 1 : 0);
