/**
 * 星晶消消乐 headless simulator — main (spec §4.3, §4.9, §9.1 full tier, §9.2 V4/V5).
 * Run through the launcher (it bundles these TS files with the repo's rolldown and starts workers):
 *   node tools/emoji-match/tune.mjs [filter] [--workers=4] [--scale=1] [--fast] [--compare] [--write] [--retune]
 *
 *  default    evaluate every v1 level at its shipped move limit: K 400 / G 200 / R 200 / L 100 /
 *             KH 200 + held-out K 400 (seeds 5000+), lesson check, V4 flags, V5 curve, endurance
 *  --fast     V4f numbers only (K 60, L 20 on H/B levels)
 *  --compare  diff every rate against the `sim` evidence stored in levels.json (port parity)
 *  --retune   pick each move limit from scratch (closest K to the band target) — the tuning loop
 *  --write    write moves / star lines / sim evidence back into content/emoji-match/levels.json
 * Reports: ~/kid-games-work/emoji-match/tune[-filter].txt and validate-report.json. Exit 1 on any flag.
 */
import { Worker } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EPISODES, LEVELS, type LevelData } from '../../../site/emoji-match/src/content';
import { analyse, bandOf, FAST, simBlock, type Analysis } from './difficulty';
import { curveReport, enduranceTable } from './curve';
import type { SimOptions, SimResult } from './simulate';

const REPO = process.env.EM_REPO ?? process.cwd();
const OUT = path.join(os.homedir(), 'kid-games-work/emoji-match');
const LEVELS_FILE = path.join(REPO, 'content/emoji-match/levels.json');

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(`--${k}`);
const opt = (k: string, d: string) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const filter = args.find((a) => !a.startsWith('--')) ?? '';
const nWorkers = Math.max(1, Math.min(8, Number(opt('workers', '4'))));
const scale = Number(opt('scale', '1'));
const fast = flag('fast');

async function runPool(ids: string[], o: SimOptions, workerUrl: URL): Promise<Map<string, SimResult>> {
  const queue = ids.slice();
  const results = new Map<string, SimResult>();
  let done = 0;
  await new Promise<void>((resolve, reject) => {
    let active = 0;
    const start = () => {
      active += 1;
      const w = new Worker(workerUrl, { workerData: o });
      const feed = () => w.postMessage(queue.shift() ?? null);
      w.on('message', (m: SimResult & { error?: string }) => {
        if (m.error) { reject(new Error(`${m.id}: ${m.error}`)); return; }
        results.set(m.id, m); done += 1;
        process.stderr.write(`\r  simulated ${done}/${ids.length} (${m.id}, ${Math.round(Object.values(m.ms).reduce((a, b) => a + b, 0))} ms)   `);
        feed();
      });
      w.on('error', reject);
      w.on('exit', () => { active -= 1; if (active === 0) { process.stderr.write('\n'); resolve(); } });
      feed();
    };
    for (let k = 0; k < Math.min(nWorkers, ids.length); k += 1) start();
  });
  return results;
}

function fastVerdict(d: LevelData, s: SimResult): { K: number; L: number | null; flags: string[] } {
  const [lo, hi] = bandOf(d);
  const K = s.need.K.filter((x) => x <= d.moves).length / s.need.K.length;
  const hb = d.role === 'H' || d.role === 'B';
  const L = hb && s.need.L ? s.need.L.filter((x) => x <= d.moves).length / s.need.L.length : null;
  const flags: string[] = [];
  if (K < lo - FAST.tolK || K > hi + FAST.tolK) flags.push(`K ${K.toFixed(2)} outside [${lo},${hi}] ± ${FAST.tolK}`);
  if (L !== null && L < FAST.minL) flags.push(`L ${L.toFixed(2)} < ${FAST.minL}`);
  return { K, L, flags };
}

export async function main(workerUrl: URL): Promise<number> {
  const defs = LEVELS.filter((d) => d.id.includes(filter));
  if (!defs.length) { console.error(`no level matches "${filter}"`); return 2; }
  const t0 = Date.now();
  mkdirSync(OUT, { recursive: true });
  const lines: string[] = [];
  const tag = filter ? `-${filter}` : '';

  if (fast) {
    // V4f: K 60 everywhere, L 20 on H/B levels (two pools so non-H/B levels skip L)
    const hb = defs.filter((d) => d.role === 'H' || d.role === 'B').map((d) => d.id);
    const rK = await runPool(defs.map((d) => d.id), { bots: { K: FAST.K }, heldOut: false }, workerUrl);
    const rL = hb.length ? await runPool(hb, { bots: { L: FAST.L }, heldOut: false }, workerUrl) : new Map<string, SimResult>();
    let bad = 0;
    lines.push(`fast tier (V4f) ${new Date().toISOString()}  levels=${defs.length}  ${(Date.now() - t0) / 1000}s`);
    for (const d of defs) {
      const s = { ...rK.get(d.id)!, need: { ...rK.get(d.id)!.need, ...(rL.get(d.id)?.need ?? {}) } };
      const v = fastVerdict(d, s);
      if (v.flags.length) bad += 1;
      lines.push(`${d.id.padEnd(5)} ${d.role}  moves ${String(d.moves).padStart(2)}  K60 ${v.K.toFixed(2)}${v.L !== null ? `  L20 ${v.L.toFixed(2)}` : ''}  ${v.flags.join('; ')}`);
    }
    lines.push(`flagged: ${bad}`);
    console.log(lines.join('\n'));
    writeFileSync(path.join(OUT, `tune-fast${tag}.txt`), lines.join('\n') + '\n');
    return bad ? 1 : 0;
  }

  const sims = await runPool(defs.map((d) => d.id), { scale, heldOut: true }, workerUrl);
  const secs = (Date.now() - t0) / 1000;
  const retune = flag('retune');
  const rows: { d: LevelData; a: Analysis; s: SimResult }[] = defs.map((d) => { const s = sims.get(d.id)!; return { d, a: analyse(d, s.need, s.lesson, !retune), s }; });
  lines.push(`tune run ${new Date().toISOString()}  levels=${defs.length}  scale=${scale}  workers=${nWorkers}  ${secs.toFixed(1)}s  engine=site/emoji-match/src/core (real game logic)`);
  lines.push('id    role WxH  moves  K     G     R     L     KH    Kho   medK  2★≥ 3★≥  K★(1/2/3)      band          flags');
  const f = (x: number) => (x === undefined ? ' -  ' : x.toFixed(2));
  let bad = 0;
  for (const { d, a, s } of rows) {
    if (a.flags.length) bad += 1;
    const [lo, hi] = bandOf(d);
    lines.push(`${d.id.padEnd(5)} ${d.role}    ${s.W}x${s.H}  ${String(a.M).padStart(3)}   ${f(a.r.K)}  ${f(a.r.G)}  ${f(a.r.R)}  ${f(a.r.L)}  ${f(a.r.KH)}  ${f(a.r.Kho)}  ${String(a.medK).padStart(3)}   ${String(a.s2).padStart(2)}  ${String(a.s3).padStart(2)}   ${`${a.kStars[1]}/${a.kStars[2]}/${a.kStars[3]}`.padEnd(14)} [${lo.toFixed(2)},${hi.toFixed(2)}]   ${a.flags.join('; ')}`);
  }
  lines.push(`flagged: ${bad} of ${rows.length}`);

  // port parity: the same seeds on the TS engine must reproduce the prototype's evidence
  let diffs = 0;
  if (flag('compare')) {
    lines.push('', 'compare with levels.json sim evidence (prototype core.mjs run):');
    for (const { d, a } of rows) {
      const old = d.sim as Record<string, number | number[]>;
      const now = simBlock(a) as unknown as Record<string, number | number[]>;
      const keys = ['K', 'G', 'R', 'L', 'KH', 'Kho', 'medK', 'kStars'];
      const dd = keys.filter((k) => JSON.stringify(old[k]) !== JSON.stringify(now[k])).map((k) => `${k} ${JSON.stringify(old[k])}→${JSON.stringify(now[k])}`);
      if (a.M !== d.moves) dd.push(`moves ${d.moves}→${a.M}`);
      if (a.s2 !== d.stars[0] || a.s3 !== d.stars[1]) dd.push(`stars ${d.stars.join('/')}→${a.s2}/${a.s3}`);
      if (dd.length) { diffs += 1; lines.push(`  ${d.id}: ${dd.join(', ')}`); }
    }
    lines.push(`  ${diffs ? `${diffs} levels differ` : 'all levels identical (moves, star lines, K G R L KH Kho medK kStars)'}`);
  }

  // V5 curve + endurance on the merged result (only meaningful for the full set)
  const merged = LEVELS.map((d) => { const r = rows.find((x) => x.d.id === d.id); return r ? { ...d, moves: r.a.M, stars: [r.a.s2, r.a.s3] as [number, number], sim: simBlock(r.a) as unknown as LevelData['sim'] } : d; });
  const cur = curveReport(EPISODES, merged);
  lines.push('', 'V5 curve (letter = role, number = K × 100):', ...cur.curve);
  lines.push(`max adjacent K drop ${cur.maxDrop.toFixed(2)} (${cur.maxDropAt}); expected first-pass stars ${cur.expectedStars.toFixed(1)} / ${merged.length * 3}`);
  lines.push(...enduranceTable(EPISODES, cur, merged.length));
  lines.push(cur.errs.length ? `V5 violations:\n  ${cur.errs.join('\n  ')}` : 'V5 curve rules: all pass');
  console.log(lines.join('\n'));
  writeFileSync(path.join(OUT, `tune${tag}.txt`), lines.join('\n') + '\n');
  const report = {
    kind: 'emoji-match validate-full (V4 + V5)', at: new Date().toISOString(), seconds: secs, workers: nWorkers, scale, filter,
    engine: 'site/emoji-match/src/core', bots: { K: 400, G: 200, R: 200, L: 100, KH: 200, heldOutK: 400 },
    flagged: bad, compareDiffs: flag('compare') ? diffs : null, v5: { errors: cur.errs, maxDrop: +cur.maxDrop.toFixed(2), maxDropAt: cur.maxDropAt, expectedStars: +cur.expectedStars.toFixed(1) },
    levels: rows.map(({ d, a, s }) => ({ id: d.id, role: d.role, band: bandOf(d), moves: a.M, retune: a.retune, stars: [a.s2, a.s3], sim: simBlock(a), lesson: s.lesson, flags: a.flags, ms: Object.fromEntries(Object.entries(s.ms).map(([k, v]) => [k, Math.round(v)])) })),
  };
  if (!filter) writeFileSync(path.join(OUT, 'validate-report.json'), JSON.stringify(report, null, 1) + '\n');

  if (flag('write')) {
    const file = JSON.parse(readFileSync(LEVELS_FILE, 'utf8')) as { levels: LevelData[] };
    for (const lv of file.levels) {
      const r = rows.find((x) => x.d.id === lv.id); if (!r) continue;
      lv.moves = r.a.M; lv.stars = [r.a.s2, r.a.s3]; (lv as { sim: unknown }).sim = simBlock(r.a);
    }
    writeFileSync(LEVELS_FILE, JSON.stringify(file, null, 1) + '\n');
    console.log(`wrote ${LEVELS_FILE} (${rows.length} levels)`);
  }
  return bad || cur.errs.length || diffs ? 1 : 0;
}
