// Golden fixtures for the TypeScript port (spec §10.5): the .mjs oracle is the specification; src/core must reproduce these files bit for bit.
//   gen-50seeds.json       sector x D x 50 seeds -> hash of the stimulus key (independent seeds, empty history) + one 50-round sequence per (sector, D) with the real history
//   controller-traces.json seeded random result streams -> every nextRound() descriptor, event list and gate verdict, plus the final track state
// Usage: node golden.mjs --write [dir] | --check
import fs from 'node:fs';
import { createRng, hashString } from './rng.mjs';
import { makeHistory } from './grid.mjs';
import { generate } from './gen.mjs';
import { TABLE, SECTOR_IDS, NDIFF, tagsOf } from './params.mjs';
import { OUT, GOLDEN } from './paths.mjs';
import { newSector, startNight, nextRound, report, gateStep, nightDone } from './controller.mjs';
const h8 = (key) => hashString(key).toString(16).padStart(8, '0');
const WIN = () => JSON.parse(fs.readFileSync(`${OUT}/levels.json`, 'utf8')).window;
export function genGolden(W = WIN()) {
  const independent = {}, sequence = {};
  for (const s of SECTOR_IDS) for (let D = 1; D <= NDIFF; D += 1) {
    independent[`${s}:${D}`] = Array.from({ length: 50 }, (_, i) => h8(generate(s, D, createRng(`golden:${s}:${D}:${i}`), makeHistory(64, 6)).key));
    const rng = createRng(`golden-seq:${s}:${D}`), hist = makeHistory(W[`${s}:${D}`], 6);
    sequence[`${s}:${D}`] = Array.from({ length: 50 }, () => h8(generate(s, D, rng, hist).key));
  }
  return { version: 1, hash: 'fnv1a32 hex of stimulus.key', window: W, independent, sequence };
}
const rowTags = (sector, D) => TABLE[sector][D - 1].tags;
/** Replays an op list on a fresh controller; ops: ['n'] start a night | ['r', res, tagIndex] answer the next round (a gate round if one is due). */
export function replay(sector, ops) {
  const st = newSector(sector, true), out = [];
  for (const op of ops) {
    if (op[0] === 'n') { startNight(st); out.push(null); continue; }
    const nr = nextRound(st), tags = rowTags(sector, nr.D), tag = tags.length ? [tags[op[2] % tags.length]] : [];
    if (nr.kind === 'gate') { const v = gateStep(st, op[1]); out.push(['gate', nr.D, nr.i, v.verdict, v.ev.join('+')]); }
    else if (nr.kind === 'demo') out.push(['demo', nr.D, 0, report(st, 'neutral', { tags: [] }).join('+')]);
    else { const ev = report(st, op[1], { tags: tag }); out.push([nr.kind, nr.D, nr.soft ? 1 : 0, ev.join('+')]); }
  }
  const fin = st.tracks.map((t) => ({ L: t.L, cleared: t.cleared, atG: t.atG, park: t.park, parkCount: t.parkCount, gateFails: t.gateFails, m: t.m, s: t.s, maxL: t.maxL, cp: t.cp }));
  return { out, final: { cur: st.cur, nights: st.nights, tracks: fin, queue: st.queue } };
}
export function traceGolden() {
  const traces = [];
  for (const sector of SECTOR_IDS) for (let k = 0; k < 4; k += 1) {
    const rng = createRng(`trace:${sector}:${k}`), pPass = [0.55, 0.75, 0.9, 0.65][k], st = newSector(sector, true), ops = [];
    for (let i = 0; i < 120; i += 1) {
      if (i % 7 === 0) { ops.push(['n']); startNight(st); }
      const nr = nextRound(st), x = rng.next(), res = x < pPass ? 'pass' : x < pPass + (1 - pPass) * 0.25 ? 'neutral' : 'miss', ti = rng.int(0, 3);
      if (nr.kind === 'gate') gateStep(st, res === 'pass' ? 'pass' : 'miss'); else if (nr.kind === 'demo') report(st, 'neutral', { tags: [] }); else report(st, res, { tags: rowTags(sector, nr.D).length ? [rowTags(sector, nr.D)[ti % rowTags(sector, nr.D).length]] : [] });
      ops.push(['r', nr.kind === 'gate' ? (res === 'pass' ? 'pass' : 'miss') : nr.kind === 'demo' ? 'neutral' : res, ti]);
      if (nightDone(st) && i % 7 !== 6) { /* the next 'n' op is inserted by the i % 7 rule; a night that ends early simply waits */ }
    }
    traces.push({ sector, seed: `trace:${sector}:${k}`, ops, ...replay(sector, ops) });
  }
  return { version: 1, traces };
}
if (process.argv[1].endsWith('golden.mjs')) {
  const dir = process.argv.includes('--write') ? (process.argv[process.argv.indexOf('--write') + 1] || GOLDEN) : GOLDEN;
  const stored = !process.argv.includes('--write') && fs.existsSync(`${dir}/gen-50seeds.json`) ? JSON.parse(fs.readFileSync(`${dir}/gen-50seeds.json`, 'utf8')).window : undefined;   // the windows are part of the fixture
  const g = genGolden(stored), t = traceGolden();
  if (process.argv.includes('--write')) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/gen-50seeds.json`, JSON.stringify(g)); fs.writeFileSync(`${dir}/controller-traces.json`, JSON.stringify(t)); console.log(`golden written to ${dir}: gen ${JSON.stringify(g).length} bytes, traces ${JSON.stringify(t).length} bytes`); }
  else { const a = fs.readFileSync(`${dir}/gen-50seeds.json`, 'utf8'), b = fs.readFileSync(`${dir}/controller-traces.json`, 'utf8'); const bad = (a !== JSON.stringify(g) ? 1 : 0) + (b !== JSON.stringify(t) ? 1 : 0); console.log(`golden check failed: ${bad}`); process.exit(bad ? 1 : 0); }
}
