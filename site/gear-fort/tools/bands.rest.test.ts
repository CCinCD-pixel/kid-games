// V8 remainder (volume 1) — the rest of proto/v1/report-v1d.mjs on the REAL TS kernel and bots: K2h, K@, O (opt-O
// params), the retry chain P1–P4 (K+ → Kl from the checkpoint → Kr tier 1 → Kb tier 2), the lesson ledger L0–L4 with
// ablations, m*(C)/m*(K)/G, reaction window W, idle p90, peak, float, fail-cause mix / facts / lesson alignment /
// outgunned, "learned" pairs, new-machine leak, flag threat — every number compared with the prototype's
// out/v1/report.json (tools/ref-report-v1-full.json) and every band of report-v1d re-judged; then the volume checks.
//   GF_FULL=1 [GF_ONLY=1-1,1-2] npx vitest run site/gear-fort/tools/bands.rest.test.ts   (~5 min for all 11 levels)
//   partial results → ~/kid-games-work/reports/gear-fort/rest/<id>.json; GF_GLOBAL=1 runs only the volume checks on them.
import { TYPE2 as TYPE2_ } from './bands-v2';
import { FLAG_STARS } from '../src/render/songcity';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { batch, chainLife, retry, mstar, pct, star3, facts, outAvg, type Tally, type EvalOpt } from '../src/bots/evaluate';
import { ENEMIES, KIND_THREAT } from '../src/lane/tables';
import { T, TPS } from '../src/lane/rules';
import type { Level } from '../src/lane/types';

const C = path.resolve(__dirname, '../../../content/gear-fort');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref-report-v1-full.json'), 'utf8')) as Record<string, Record<string, unknown>> & { _global: string[] };
const BANDS = JSON.parse(fs.readFileSync(path.join(C, 'bands.json'), 'utf8')) as { TYPE: Record<string, Record<string, unknown>>; OVERRIDE: Record<string, Record<string, unknown>>; LESSONS: Record<string, { ablate?: { who: string; what: string }[]; metric?: string; star3IsMetric?: boolean; lowerIsBetter?: boolean }>; GLOBAL: Record<string, unknown>; mstarSeeds?: number[] };
const G = BANDS.GLOBAL as Record<string, number> & { window: Record<string, number>; peak: Record<string, number>; flagFloor: Record<string, number[]>; volMeanK: Record<string, number[]>; star3K2: number[]; flagStars: Record<string, number> };
const VOL1 = Array.from({ length: 11 }, (_, i) => `1-${i + 1}`);
const VOL2 = Array.from({ length: 11 }, (_, i) => `2-${i + 1}`);
const ALL = [...VOL1, ...VOL2];
// GF_VOL=2 (or GF_ONLY=2-…) runs volume 2; the K+ chain always walks the campaign from 1-1 (prototype: V1 = all 22)
const VOL = +(process.env.GF_VOL || (process.env.GF_ONLY ? process.env.GF_ONLY[0] : 1));
const VOLIDS = VOL === 2 ? VOL2 : VOL1;
const ONLY = process.env.GF_ONLY ? process.env.GF_ONLY.split(',') : VOLIDS;
// proto/v1/bands.mjs TYPE2 (volume-2 type bands) live in ./bands-v2.ts, shared with V7
const TYPE2 = TYPE2_ as unknown as Record<string, Record<string, number | number[]>>;
const lvOf = (id: string): Level => JSON.parse(fs.readFileSync(path.join(C, `levels/${id}.json`), 'utf8')) as Level;
const OUT = path.join(os.homedir(), 'kid-games-work/reports/gear-fort/rest');
const MSEEDS: [number, number] = [201, 240];
const N = 200, NA = 100;
const p90 = (xs: number[]): number => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(0.9 * s.length))] : 0; };
function reactionWindow(lv: Level): number {
  const fog = (lv.env as { fogCol?: number } | undefined)?.fogCol ?? 8; let w = 1e9;
  const kinds = new Set(lv.spawns.map((s) => (s[2] === 'swarm' ? 'ant' : s[2])).filter((k) => ENEMIES[k as string]));
  for (const k of kinds) { const D = ENEMIES[k as string] as unknown as { speed: number; speedMax?: number }; const v = ((k === 'ram' ? D.speedMax! : D.speed) * TPS) / T; w = Math.min(w, (Math.min(8, fog) - 3) / v); }
  return Math.round(w * 10) / 10;
}
const flagThreat = (lv: Level): number[] => (lv.flags || []).map((t) => lv.spawns.filter((s) => s[0] >= t && s[0] < t + 15 * TPS).reduce((a, s) => a + (String(s[2]).startsWith('boss:') ? 0 : KIND_THREAT(String(s[2]))), 0));
const optOf = (what: string): EvalOpt => (what === 'noCover' ? { params: { base1: 0, base2: 0, base3: 0 } } as EvalOpt
  : ['mark', 'timing', 'priority', 'control', 'synergy', 'depth', 'preview', 'aoe', 'counter', 'adapt', 'invest', 'econ', 'save'].includes(what) ? { off: [what] } : what === 'kDeck' ? { kDeck: true } : { dropCard: what.split('+') });

function evalLevel(id: string, life: Record<number, Record<string, Record<string, number>>>, Kp: Tally): Record<string, unknown> {
  const lv = lvOf(id); const type = lv.type as string; const ref = REF[id];
  const vol = +id[0];
  const B = { ...BANDS.TYPE[type], ...(vol === 2 ? TYPE2[type] || {} : {}), ...(BANDS.OVERRIDE[id] || {}) } as Record<string, number & number[]> & { L0exemptK?: boolean; learnVia?: string; lessonAlign?: number };
  const fast = !(lv.env as { fogCol?: number } | undefined)?.fogCol && type !== 'tutorial';
  const K = batch(lv, 'K', N, {}, true), K2 = batch(lv, 'K2', N, {}, true), K2h = batch(lv, 'K2h', N), Cb = batch(lv, 'C', N, {}, true), R = batch(lv, 'R', N);
  const Ka = batch(lv, 'Ka', N), Kb = batch(lv, 'Kb', N);
  const lifeFor = Object.fromEntries(Object.entries(life).map(([s, m]) => [+s, m[id]]));
  const rt = retry(lv, 100, lifeFor);
  const optP = (ref.optO || {}) as Record<string, number>;
  const Oa = batch(lv, 'O', 100, { params: optP } as EvalOpt), Ob = batch(lv, 'O', 100, { params: {} } as EvalOpt); const O = Oa.wins >= Ob.wins ? Oa : Ob;
  const r: Record<string, unknown> = { type, K: pct(K), K2: pct(K2), K2h: pct(K2h), C: pct(Cb), O: Math.max(pct(O), pct(Cb)), 'K+': pct(Kp), R: pct(R), Ka: pct(Ka), Kb: pct(Kb) };
  if (fast) r['K@'] = pct(batch(lv, 'K@', N));
  r.P = rt.p.map((x) => Math.round((100 * x) / rt.n)); r.attempts = +(rt.att / rt.n).toFixed(2);
  r.steady = { K: pct(K, 'steady'), 'K+': pct(Kp, 'steady'), K2: pct(K2, 'steady'), K2h: pct(K2h, 'steady'), C: pct(Cb, 'steady') };
  r.two = { K: pct(K, 'two'), 'K+': pct(Kp, 'two'), K2h: pct(K2h, 'two') };
  r.star3 = { K: star3(K), 'K+': star3(Kp), K2: star3(K2), K2h: star3(K2h), C: star3(Cb) };
  r.logsK = +(K.logs / K.n).toFixed(2); r.durC = Math.round(Cb.dur / Cb.n); r.floatC = Math.round(Cb.float / Cb.n); r.peakC = Cb.peak; r.idleP90 = +p90(Cb.idles).toFixed(1);
  const lossK = Object.values(K.causes).reduce((a, b) => a + b, 0);
  r.causesK = Object.fromEntries(Object.entries(K.causes).sort((a, b) => b[1] - a[1]));
  r.factsOk = facts(K); r.lessonAlign = K.lessonN ? Math.round((100 * K.lessonHit) / K.lessonN) : null;
  r.outgunned = lossK ? Math.round((100 * (K.causes.outgunned || 0)) / lossK) : 0; r.learn = K2.learnWins ? Math.round((100 * K2.learned) / K2.learnWins) : null;
  r.W = reactionWindow(lv); r.flags = (lv.flags || []).map((f) => f / TPS); r.flagThreat = flagThreat(lv);
  // lesson ledger: L0 teach payoff + L1–L4
  const LS = BANDS.LESSONS[id] || {}; const lesson: Record<string, unknown>[] = [];
  for (const a of LS.ablate || []) {
    const base = a.who === 'K' ? K : a.who === 'K2' ? K2 : Cb; const x = batch(lv, a.who, NA, optOf(a.what));
    const row: Record<string, unknown> = { who: a.who, what: a.what, win: pct(base), winWithout: pct(x), steady: pct(base, 'steady'), steadyWithout: pct(x, 'steady'), two: pct(base, 'two'), twoWithout: pct(x, 'two') };
    if (LS.metric) { row.metric = LS.metric; row.m = outAvg(base, LS.metric); row.mWithout = outAvg(x, LS.metric); }
    if (a.who === 'C') row.mstarWithout = mstar(lv, 'C', MSEEDS, optOf(a.what));
    lesson.push(row);
  }
  r.lesson = lesson;
  if (type !== 'conveyor') { const mc = mstar(lv, 'C', MSEEDS), mk = mstar(lv, 'K', MSEEDS); r.mC = mc; r.mK = mk; r.G = typeof mc === 'number' && typeof mk === 'number' ? +(mk / mc).toFixed(2) : typeof mc === 'number' ? '>' + (160 / mc).toFixed(2) : null; }
  const v: string[] = []; const l0: string[] = [];
  for (const x of lesson as Record<string, number & string>[]) {
    if (type === 'teach' && x.who === 'K' && !B.L0exemptK && x.two < x.twoWithout - G.L0drop) l0.push(`K2★ ${x.two}<${x.twoWithout}`);
    if (type === 'teach' && x.who === 'K2' && x.steady < x.steadyWithout) l0.push(`K2稳 ${x.steady}<${x.steadyWithout}`);
    if (x.who === 'K' && x.win - x.winWithout >= G.L1) v.push(`L1(${x.what} ${x.win}→${x.winWithout})`);
    if ((x.who === 'K2' || x.who === 'C') && x.steady - x.steadyWithout >= G.L2) v.push(`L2(${x.who}-${x.what} 稳${x.steady}→${x.steadyWithout})`);
    if (x.who === 'C' && typeof r.mC === 'number') { const mw = (x.mstarWithout as unknown) === '>160' ? 999 : x.mstarWithout; const ratio = typeof mw === 'number' ? mw / r.mC : 0; (x as Record<string, unknown>).ratio = +ratio.toFixed(2); if (ratio >= (type === 'test' ? G.L3test : G.L3)) v.push(`L3(${x.what} ×${(x as Record<string, unknown>).ratio})`); }
    if (LS.metric && LS.star3IsMetric && typeof x.m === 'number' && typeof x.mWithout === 'number') { const better = LS.lowerIsBetter === false ? (x.m - x.mWithout) / Math.max(0.3, x.mWithout) : (x.mWithout - x.m) / Math.max(0.01, x.mWithout); if (better >= G.L4 && (LS.lowerIsBetter === false || x.mWithout > 0.3)) v.push(`L4(${x.who} ${LS.metric} ${x.mWithout}→${x.m})`); }
  }
  r.L0 = l0; r.lessonVerdict = v.length ? [...new Set(v)] : LS.ablate ? ['示范'] : [];
  // ── bands (report-v1d, volume 1; D = design solutions, checked by V4 parity) ──
  const f: string[] = []; const inB = (name: string, val: number | null, b?: number[]): void => { if (b && val != null && (val < b[0] || val > b[1])) f.push(`${name}=${val}∉[${b[0]},${b[1]}]`); };
  const n = (k: string): number => r[k] as number; const st = r.steady as Record<string, number>, tw = r.two as Record<string, number>, s3 = r.star3 as Record<string, number>, P = r.P as number[];
  inB('R', n('R'), B.R); inB('K', n('K'), B.K); if (vol === 2) inB('K2h', n('K2h'), B.K2h);
  if (n('K+') < Math.max(B.kpMin, Math.min(n('K') - 10, 100))) f.push(`K+=${n('K+')}<max(${B.kpMin},K-10)`);
  if (n('C') < B.C) f.push(`C=${n('C')}<${B.C}`); if (n('O') < B.O) f.push(`O=${n('O')}<${B.O}`);
  if (B.P3 && P[2] < B.P3) f.push(`P3=${P[2]}<${B.P3}`); if (P[3] < G.P4) f.push(`P4=${P[3]}<${G.P4}`);
  if (B.K2 && n('K2') < B.K2) f.push(`K2=${n('K2')}<${B.K2}`);
  if (type !== 'tutorial') {
    if (n('Ka') < (type === 'boss' ? G.KaBoss : G.Ka)) f.push(`Ka=${n('Ka')}`); if (n('Kb') < G.Kb) f.push(`Kb=${n('Kb')}`);
    if (st.K2 < G.steadyK2) f.push(`K2稳=${st.K2}`);
    inB('K2-3★', s3.K2, (B.star3K2 as unknown as number[]) || G.star3K2);
    { const twoRef = vol === 2 ? 'K2h' : 'K+'; if (B.two && tw[twoRef] < B.two) f.push(`${twoRef}2★=${tw[twoRef]}<${B.two}`); }
    if (n('K2') < n('K') - 3) f.push('K2<K');
  }
  if (r['K@'] != null && n('K@') < n('K') - G.kFastDrop) f.push(`K@=${n('K@')}`);
  if (n('W') < G.window[vol]) f.push(`W=${n('W')}`); if (fast && n('W') / 1.5 < G.windowFast) f.push(`W@1.5=${(n('W') / 1.5).toFixed(1)}`);
  if (n('idleP90') > G.idleP90) f.push(`idle=${n('idleP90')}`);
  if (n('peakC') > G.peak[vol]) f.push(`peak=${n('peakC')}`);
  if (['practice', 'test'].includes(type) && n('floatC') > G.float) f.push(`float=${n('floatC')}`);
  if (n('factsOk') < G.factsOk) f.push(`facts=${n('factsOk')}`);
  if (type === 'teach' && r.lessonAlign != null && n('lessonAlign') < (B.lessonAlign ?? G.lessonAlign)) f.push(`align=${n('lessonAlign')}`);
  if (type === 'teach' && n('outgunned') > G.outgunnedMax) f.push(`outgun=${n('outgunned')}`);
  if (r.learn != null && type === 'teach' && n('learn') < G.learn && !B.learnVia) f.push(`learn=${n('learn')}`);
  if (Cb.newLeak > Math.floor(0.01 * Cb.n) && lv.newEnemy && type === 'teach') f.push(`newLeakC=${Cb.newLeak}`);
  const FF = G.flagFloor[vol]; const ft = r.flagThreat as number[]; if (!['tutorial', 'boss', 'conveyor'].includes(type) && ft.length && (ft[0] < FF[0] || ft[ft.length - 1] < FF[1])) f.push(`flagThreat=${ft.join('/')}`);
  if (l0.length) f.push('L0:' + l0.join(','));
  if (type === 'test' && LS.ablate && !v.length) f.push('nec!');
  const to = K.timeouts + Cb.timeouts + R.timeouts + K2.timeouts; if (to) f.push(`timeouts=${to}`);
  r.fails = f;
  return r;
}

const FIELDS = ['K2h', 'K@', 'O', 'P', 'attempts', 'steady', 'two', 'star3', 'logsK', 'durC', 'floatC', 'peakC', 'idleP90', 'causesK', 'factsOk', 'lessonAlign', 'outgunned', 'learn', 'W', 'flags', 'flagThreat', 'lesson', 'mC', 'mK', 'G', 'L0', 'lessonVerdict', 'fails'];
describe.runIf(!!process.env.GF_FULL && !process.env.GF_GLOBAL)(`V8 remainder, volume ${VOL}, on the TS kernel`, () => {
  it(`levels ${ONLY.join(',')}: prototype-exact and in band`, () => {
    fs.mkdirSync(OUT, { recursive: true });
    const { per, life } = chainLife((VOL === 1 ? VOL1 : ALL).map(lvOf), 120); const diffs: string[] = []; const fails: string[] = [];
    for (const id of ONLY) {
      const r = evalLevel(id, life, per[id]); fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(r));
      for (const k of FIELDS) if (k in REF[id] || k in r) { const a = JSON.stringify(r[k] ?? null), b = JSON.stringify(REF[id][k] ?? null); if (a !== b) diffs.push(`${id} ${k}: TS ${a} ≠ proto ${b}`); }
      fails.push(...(r.fails as string[]).map((x) => `${id} ${x}`));
    }
    fs.writeFileSync(path.join(OUT, `run-${ONLY[0]}.txt`), (diffs.length ? diffs.join('\n') : 'all fields equal the prototype') + '\n' + (fails.length ? fails.join('\n') : 'all in band') + '\n');
    expect(diffs).toEqual([]); expect(fails).toEqual([]);
  }, 3_600_000);
});

describe.runIf(!!process.env.GF_GLOBAL)(`V8 volume-${VOL} global checks (on the partial reports)`, () => {
  it('mean first try, adjacent drops, D step, 示范, cause ids, expected stars, G11', () => {
    const IDS = VOLIDS; const v = VOL;
    const rep: Record<string, Record<string, unknown>> = {}; for (const id of IDS) rep[id] = JSON.parse(fs.readFileSync(path.join(OUT, `${id}.json`), 'utf8'));
    const nt = IDS.filter((id) => rep[id].type !== 'tutorial');
    // volume 1 is judged on K (K+ where the override says so); volume 2 on K2h (proto report-v1d global checks)
    const ref = (id: string): number => (v === 2 ? rep[id].K2h : (BANDS.OVERRIDE[id] as { ref?: string } | undefined)?.ref === 'K+' ? rep[id]['K+'] : rep[id].K) as number;
    const mean = nt.reduce((a, id) => a + ref(id), 0) / nt.length; const g: string[] = []; const bad: string[] = [];
    const band = v === 1 ? G.volMeanK[1] : (G as unknown as { volMeanK2h: Record<string, number[]> }).volMeanK2h[2];
    if (mean < band[0] || mean > band[1]) bad.push(`mean ${mean.toFixed(1)}`);
    const demo = nt.filter((id) => rep[id].type === 'teach' && (rep[id].lessonVerdict as string[]).includes('示范')); if (demo.length > G.demoMax) bad.push(`示范 ${demo}`);
    const causeIds = new Set<string>(); for (const id of IDS) for (const k of Object.keys(rep[id].causesK as object)) causeIds.add(k.split(':')[0]); if (causeIds.size < G.causeIdsPerVol) bad.push(`causeIds ${causeIds.size}`);
    const s = (id: string, k: string, b: string): number => (rep[id][k] as Record<string, number>)[b];
    const expK2 = IDS.reduce((a, id) => a + (3 * s(id, 'star3', 'K2') + 2 * Math.max(0, s(id, 'steady', 'K2') - s(id, 'star3', 'K2')) + 2 * Math.max(0, (rep[id].K2 as number) - s(id, 'steady', 'K2')) * 0.5) / 100, 0);
    // 墨家旗 gate (spec §9.3: K2 first-try expected stars >= the flag threshold). The threshold is the game's own
    // FLAG_STARS (render/songcity.ts), set by spec D1's rule "threshold = K2 first-try expected stars": volume 1 → 27,
    // volume 2 → 26 (K2 25.7; reason in bands.json GLOBAL.flagStarsWhy, QA r4/r5). No hard-coded exemption any more.
    // the game's table and the frozen data agree; the documented tolerance is bands.json GLOBAL.flagStarsTol (±0.5, QA r5)
    if (G.flagStars[String(v)] !== FLAG_STARS[v - 1]) bad.push(`FLAG_STARS ${FLAG_STARS[v - 1]} ≠ bands.json flagStars ${G.flagStars[String(v)]}`);
    if (expK2 + G.flagStarsTol < FLAG_STARS[v - 1]) bad.push(`K2 stars ${expK2.toFixed(1)} < 墨家旗 ${FLAG_STARS[v - 1]} − ${G.flagStarsTol}`);
    else g.push(`墨家旗 ${FLAG_STARS[v - 1]} ≤ K2 stars ${expK2.toFixed(1)}`);
    let prev: string | null = null, prevM: string | null = null, prevM2: string | null = null;
    for (const id of IDS) {
      const x = rep[id]; const type = x.type as string;
      if (prev && !['boss', 'conveyor', 'tutorial'].includes(type) && ref(prev) - ref(id) > (type === 'test' ? G.adjDropTest : G.adjDropK)) bad.push(`drop ${prev}→${id}`);
      // the next step's baseline skips breathers and the levels whose K2h band a documented override opened to 100 (2-6, 2-7)
      if (!['boss', 'conveyor', 'tutorial', 'breather'].includes(type) && !(v === 2 && (BANDS.OVERRIDE[id] as { K2h?: number[] } | undefined)?.K2h?.[1] === 100)) prev = id;
      if (typeof x.mC === 'number' && type !== 'tutorial') {
        const mC = (k: string | null): number => (k ? (rep[k].mC as number) : 0); const base = prevM2 && mC(prevM2) > mC(prevM) ? prevM2 : prevM; const rr = base ? (x.mC as number) / mC(base) : 0;
        if (base && rr > (type === 'boss' ? G.dStepBoss : G.dStepHard)) bad.push(`D step ${base}→${id}`); else if (base && type !== 'boss' && rr > G.dStep) g.push(`D step (warn) ${base}→${id}: ${mC(base)}→${x.mC}`);
        if (type !== 'boss') { prevM2 = prevM; prevM = id; }
      }
    }
    // G11 over the whole v1 campaign (22 levels)
    const all = ALL.map(lvOf); const times: Record<string, number> = {}; const same: string[] = [];
    all.forEach((l, i) => { for (const f of l.flags || []) times[f] = (times[f] || 0) + 1; if (i && JSON.stringify(l.flags) === JSON.stringify(all[i - 1].flags)) same.push(l.id); });
    const worst = Object.entries(times).sort((a, b) => b[1] - a[1])[0]; if (same.length || (worst && worst[1] / all.length > 0.4)) bad.push(`G11 ${same} ${worst}`);
    const Gs = nt.filter((id) => typeof rep[id].G === 'number' && rep[id].type !== 'boss'); const meanG = Gs.reduce((a, id) => a + (rep[id].G as number), 0) / Math.max(1, Gs.length);
    const s3K = nt.reduce((a, id) => a + s(id, 'star3', 'K'), 0) / nt.length;
    const line = `vol${v}: mean${v === 2 ? 'K2h' : 'K'} ${mean.toFixed(1)} · 3★K ${s3K.toFixed(0)} · meanG ${meanG.toFixed(2)} · 示范 ${demo.join(',') || '-'} · causeIds ${causeIds.size} · K2 first-try stars ≈${expK2.toFixed(0)}/33 · ${g.join(' · ') || 'no D-step warnings'} · G11 most-used flag ${worst ? +worst[0] / TPS + ' s ×' + worst[1] : '-'}`;
    fs.writeFileSync(path.join(OUT, `global-v${v}.txt`), line + '\n' + (bad.length ? 'FAIL ' + bad.join('; ') : 'ALL GLOBAL CHECKS PASS') + '\n');
    const refLine = REF._global.find((x) => x.startsWith(`vol${v}:`)) || '';
    expect(refLine).toContain(`mean${v === 2 ? 'K2h' : 'K'} ${mean.toFixed(1)}`);
    expect(refLine).toContain(`meanG ${meanG.toFixed(2)}`);
    expect(refLine).toContain(`causeIds ${causeIds.size}`);
    expect(bad).toEqual([]);
  });
});
