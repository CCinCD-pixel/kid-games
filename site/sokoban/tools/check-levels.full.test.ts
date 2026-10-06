/**
 * Level validator v1.1 — FULL part (spec §9.1/§9.2/§8.10). Env-gated (skipped by `npm run check`):
 *   SOK_FULL=1 npx vitest run site/sokoban/tools/check-levels.full.test.ts
 *   (or `node tools/sokoban/check-levels.mjs --full`, which also runs the C10 parity + the benches)
 *
 * Runs on the SAME content JSON the page bundles and the SAME engine (@engines/puzzle):
 *   kid models   k1/k3 (naive kid, seed 11), L1 (learner q = 0.6, seed 13), cb (colour-blind kid) — 400 runs each,
 *                and asserts the numbers the spec's §4 tables were made with (content `metrics`, ±0.005)
 *   N1           an insight lesson on a non-review practice/twist level (ch ≥ 1) is not passable naively (k1 ≤ 0.5)
 *   N2           a colour-decoy level beats the colour-blind kid (cb ≤ 0.5) — no v1 level has colours
 *   L naiveMax   per-level cap on k1
 *   B1           learner L1 within the role band (slack gate, §9.6 calibrates)
 *   B2           Boss L1 ≤ min(practice/twist) + 0.05, Boss k1 ≤ 0.15, review L1 ≥ chapter mean, ch3 Boss has an
 *                undetected dead end within 3 pushes
 *   C4 / C6      ≥ 20 % review levels from ch3; chapter mean L1 sanity band
 *   G7 (full)    the 镜子仓库 twin is solved: same optimal pushes (C10 too)
 *   G2/G6 (C10)  full graph untruncated, zero detector false positives, graph ≤ 15 MB
 * Report: ~/kid-games-work/reports/sokoban/check-v1.txt (spec §9.1 columns + chapter summary).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeLevel, depthScan, kidColorBlind, kidRates, learnerRate } from '@engines/puzzle/src/analyze';
import { detectDeadlock } from '@engines/puzzle/src/deadlock';
import { parseLevel, twinOf } from '@engines/puzzle/src/level';
import { solveOptimal } from '@engines/puzzle/src/solver';
import { StateGraph } from '@engines/puzzle/src/stategraph';
import { CHAPTERS, MAIN_LEVELS, allPushLevels, isQuiz, type LevelDef } from '../src/data';

const ROLE_L1: Record<string, [number, number]> = {
  intro: [0.9, 1], practice: [0.65, 1], twist: [0.45, 1], review: [0.45, 1], boss: [0.2, 1], breather: [0.9, 1], cert: [0, 1], classic: [0, 1],
};
const INSIGHT_LESSONS = new Set(['order', 'deep', 'park', 'trap', 'square', 'backward']);
const NAIVE_CAP = 0.5;
const TOL = 0.005;
/** spec §9.1 "当前原型结果": chapter mean L1 the §4 tables were made with */
const SPEC_CH_MEAN: Record<number, number> = { 0: 1.0, 1: 0.99, 2: 0.87, 3: 0.87, 4: 0.8 };

interface Rec {
  id: string;
  ch: LevelDef['ch'];
  role: string;
  review: boolean;
  lesson: string;
  W: number;
  H: number;
  boxes: number;
  pushes: number;
  moves: number;
  states: number;
  D: number;
  kid1: number | null;
  kid3: number | null;
  L1: number | null;
  cb: number | null;
  invis: number | null;
  first: Record<string, number | null>;
  twin: string;
  ms: number;
  errs: string[];
}

const recs = new Map<string, Rec>();
const chapterRows: string[] = [];
const chapterErrs: string[] = [];
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const f2 = (v: number | null) => (v === null ? ' -  ' : v.toFixed(2));

describe.skipIf(!process.env.SOK_FULL)('level validator v1.1 — full (kid models, B/N/C rules, solved twins)', () => {
  afterAll(() => {
    const dir = path.join(os.homedir(), 'kid-games-work/reports/sokoban');
    fs.mkdirSync(dir, { recursive: true });
    const rows = [...recs.values()].map((r) => {
      const fd = (t: string) => (r.first[t] ?? '-');
      return `${r.id.padEnd(7)}${`${r.W}x${r.H}`.padEnd(6)} b${r.boxes} P${String(r.pushes).padStart(2)} M${String(r.moves).padStart(3)} st${String(r.states).padStart(6)} D${String(r.D).padStart(5)} k1 ${f2(r.kid1)} k3 ${f2(r.kid3)} L1 ${f2(r.L1)}${r.cb !== null ? ` cb ${f2(r.cb)}` : ''} 1st c${fd('corner')} w${fd('wall')} p${fd('pair')} s${fd('square')} inv ${r.invis ?? '-'} twin ${r.twin} ${r.ms.toFixed(0)}ms ${r.errs.length ? `FAIL ${r.errs.join('; ')}` : 'ok'}`;
    });
    const fails = [...recs.values()].filter((r) => r.errs.length).length;
    const out = [
      `星港搬运工 — level validator v1.1 FULL (spec §9.1/§9.2), ${new Date().toISOString()}`,
      'content: content/sokoban/levels.json + classic.json; engine: @engines/puzzle (the page\'s code); kids: mulberry32 seeds 11 (k1/k3/cb) / 13 (L1), 400 runs',
      `${recs.size} push levels, ${fails} failing; chapter/B2/C4/C6 issues: ${chapterErrs.length}`,
      '',
      ...rows,
      '',
      ...chapterRows,
      ...(chapterErrs.length ? ['', ...chapterErrs] : []),
      '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'check-v1.txt'), out);
  });

  for (const L of allPushLevels()) {
    it(`${L.id} ${L.name}`, () => {
      const t0 = performance.now();
      const big = L.id === 'C10';
      const errs: string[] = [];
      const l = parseLevel(L.map, L.id);
      const metrics = (L as unknown as { metrics?: Record<string, unknown> }).metrics ?? {};
      const checks = (L as unknown as { checks?: Record<string, unknown> }).checks ?? {};
      // G7 (full): the twin really is the same puzzle size-wise — same optimal pushes
      const twin = twinOf(L.map);
      if (!twin) errs.push('G7 no twin');
      else {
        const m = solveOptimal(parseLevel(twin.rows), 'push', { maxStates: big ? 2e6 : 6e5 });
        if (!m || m.pushes !== L.opt.pushes) errs.push(`G7 twin (${twin.kind}) optimum ${m?.pushes ?? 'none'} ≠ ${L.opt.pushes}`);
      }
      let rec: Rec;
      if (big) {
        // C10: G2 untruncated, G6 zero false positives on every reachable state, memory
        const g = StateGraph.buildSync(l, { maxStates: 400000, maxMs: 1e9 });
        if (!g) errs.push('G2 C10 graph truncated');
        else {
          if (g.startTogo !== L.opt.pushes) errs.push(`G2 C10 togo(start) ${g.startTogo} ≠ ${L.opt.pushes}`);
          let fp = 0;
          for (let i = 0; i < g.n; i += 1) if (g.togoAt(i) >= 0 && detectDeadlock(l, g.stateAt(i).boxes)) fp += 1;
          if (fp) errs.push(`G6 C10 detector false positives ${fp}`);
          if (g.bytes > 15 * 1024 * 1024) errs.push(`C10 graph ${(g.bytes / 1048576).toFixed(1)} MB > 15 MB`);
        }
        rec = {
          id: L.id, ch: L.ch, role: L.role, review: L.review, lesson: L.lesson, W: l.W, H: l.H, boxes: l.nBoxes, pushes: L.opt.pushes, moves: L.opt.moves,
          states: g?.n ?? 0, D: num(metrics.D) ?? 0, kid1: null, kid3: null, L1: null, cb: null, invis: null, first: {}, twin: twin?.kind ?? '-', ms: 0, errs,
        };
      } else {
        const a = analyzeLevel(L.map);
        if (!a || !a.solvable) {
          errs.push('G2 unsolvable / truncated');
          rec = { id: L.id, ch: L.ch, role: L.role, review: L.review, lesson: L.lesson, W: l.W, H: l.H, boxes: l.nBoxes, pushes: 0, moves: 0, states: 0, D: 0, kid1: null, kid3: null, L1: null, cb: null, invis: null, first: {}, twin: '-', ms: 0, errs };
        } else {
          const { kid1, kid3 } = kidRates(a.level, a.pushes, { runs: 400 });
          const L1 = learnerRate(a.level, a.graph, a.pushes, { runs: 400 });
          const cb = a.level.colored ? kidColorBlind(a.level, a.pushes, { runs: 400 }) : null;
          const dep = depthScan(a.level, a.graph);
          // reproduce the numbers the spec tables were made with (prototype check.mjs v1.1)
          const pk1 = num(metrics.k1);
          const pL1 = num(metrics.L1);
          if (pk1 !== null && Math.abs(pk1 - kid1) > TOL) errs.push(`k1 ${kid1} ≠ spec ${pk1}`);
          if (pL1 !== null && Math.abs(pL1 - L1) > TOL) errs.push(`L1 ${L1} ≠ spec ${pL1}`);
          if (num(metrics.D) !== null && Math.abs((metrics.D as number) - a.D) > 0.05) errs.push(`D ${a.D} ≠ spec ${String(metrics.D)}`);
          // L naiveMax, N1, N2, B1
          const naiveMax = num(checks.naiveMax);
          if (naiveMax !== null && kid1 > naiveMax) errs.push(`L naive kid ${kid1.toFixed(2)} > ${naiveMax}`);
          if (typeof L.ch === 'number' && L.ch >= 1 && ['practice', 'twist'].includes(L.role) && !L.review && INSIGHT_LESSONS.has(L.lesson) && kid1 > NAIVE_CAP) {
            errs.push(`N1 naive kid ${kid1.toFixed(2)} > ${NAIVE_CAP} on a '${L.lesson}' ${L.role}`);
          }
          if (checks.colorDecoy && cb !== null && cb > NAIVE_CAP) errs.push(`N2 colour-blind kid ${cb.toFixed(2)} > ${NAIVE_CAP}`);
          const band = ROLE_L1[L.role];
          if (band && (L1 < band[0] || L1 > band[1])) errs.push(`B1 learner ${L1.toFixed(2)} ∉ [${band.join(', ')}] for ${L.role}`);
          rec = {
            id: L.id, ch: L.ch, role: L.role, review: L.review, lesson: L.lesson, W: a.W, H: a.H, boxes: a.boxes, pushes: a.pushes, moves: a.movesAtOptPush,
            states: a.states, D: a.D, kid1, kid3, L1, cb, invis: dep.invis, first: dep.first, twin: twin?.kind ?? '-', ms: 0, errs,
          };
        }
      }
      rec.ms = performance.now() - t0;
      recs.set(L.id, rec);
      expect(errs, `${L.id}: ${errs.join('; ')}`).toEqual([]);
    }, 180_000);
  }

  it('chapter rules B2, C4, C6 (+ the spec chapter means)', () => {
    for (const C of CHAPTERS) {
      const ls = MAIN_LEVELS.filter((l) => l.ch === C.ch);
      const play = ls.filter((l) => !isQuiz(l)).map((l) => recs.get(l.id)).filter((r): r is Rec => !!r);
      if (!play.length) continue;
      const l1 = play.map((r) => r.L1).filter((x): x is number => x !== null);
      const mean = l1.reduce((s, x) => s + x, 0) / Math.max(1, l1.length);
      const boss = play.find((r) => r.role === 'boss');
      if (boss && boss.L1 !== null) {
        const core = play.filter((r) => ['practice', 'twist'].includes(r.role) && !r.review && r.L1 !== null);
        if (core.length) {
          const lim = Math.min(...core.map((r) => r.L1 as number)) + 0.05;
          if (boss.L1 > lim + 1e-9) chapterErrs.push(`B2 boss ${boss.id} L1 ${boss.L1.toFixed(3)} > min(承/转) + 0.05 = ${lim.toFixed(3)}`);
        }
        if ((boss.kid1 ?? 0) > 0.15) chapterErrs.push(`B2 boss ${boss.id} naive kid ${(boss.kid1 ?? 0).toFixed(2)} > 0.15`);
        for (const r of play.filter((x) => x.review)) if (r.L1 !== null && r.L1 + 1e-9 < mean) chapterErrs.push(`B2 review ${r.id} L1 ${r.L1.toFixed(2)} < chapter mean ${mean.toFixed(2)}`);
      }
      if (C.ch === 3 && boss && (boss.invis === null || boss.invis > 3)) chapterErrs.push(`B2 ch3 boss ${boss.id} has no undetected dead end within 3 pushes`);
      if (C.ch >= 3) {
        const rv = ls.filter((l) => l.review).length;
        if (rv < Math.ceil(0.2 * ls.length)) chapterErrs.push(`C4 ch${C.ch} review ${rv}/${ls.length} < 20%`);
      }
      const band6 = C.ch <= 1 ? [0.85, 1] : [0.65, 0.97];
      if (l1.length && (mean < band6[0] || mean > band6[1])) chapterErrs.push(`C6 ch${C.ch} mean learner ${mean.toFixed(2)} ∉ [${band6.join(', ')}]`);
      const spec = SPEC_CH_MEAN[C.ch];
      if (spec !== undefined && Math.abs(+mean.toFixed(2) - spec) > 0.0051) chapterErrs.push(`ch${C.ch} mean L1 ${mean.toFixed(3)} ≠ spec ${spec}`);
      chapterRows.push(`ch${C.ch} ${C.name}: ${ls.length} levels (${play.length} push), mean L1 ${mean.toFixed(2)} (spec ${spec ?? '-'}), pushes ${Math.min(...play.map((r) => r.pushes))}–${Math.max(...play.map((r) => r.pushes))}, D ${play.map((r) => r.D).join(' ')}`);
    }
    expect(chapterErrs).toEqual([]);
  });
});
