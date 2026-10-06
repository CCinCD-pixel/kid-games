/**
 * Level validator v1.1 — fast part (spec §9.1), run by `npm run check` / `npm test`.
 * Reads the SAME content JSON the page bundles (src/data.ts) and runs the SAME engine code
 * (@engines/puzzle). Kid models (k1/L1/cb) and the B/N rules live in the full validator
 * (tools/check-levels.full.test.ts, SOK_FULL=1). C10 (≈170 k states) runs its heavy checks there.
 * `SOK_REPORT=1` (tools/sokoban/check-levels.mjs) also writes the per-level report (spec §9.1
 * report columns) to ~/kid-games-work/reports/sokoban/levels-fast.txt.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeLevel, depthScan, exactDead, within } from '@engines/puzzle/src/analyze';
import { detectAll, detectDeadlock } from '@engines/puzzle/src/deadlock';
import { parseLevel, transformRows, twinOf } from '@engines/puzzle/src/level';
import { canon, replayLurd } from '@engines/puzzle/src/rules';
import { StateGraph } from '@engines/puzzle/src/stategraph';
import { CHAPTERS, CLASSIC_LEVELS, LINES, MAIN_LEVELS, QUIZZES, certLevels, chapterLevels, isQuiz, levelById, star2Of, type LevelDef, type QuizSide } from './src/data';

const LESSONS = new Set(['plain', 'turn', 'trap', 'order', 'deep', 'park', 'color', 'decoy', 'square', 'backward', 'mixed']);
const LIMITS = { maxW: 10, maxH: 10, mainMaxPush: 35, walkFactor: 3, walkSlack: 14 };
const BIG = new Set(['C10']);
const lineText = new Map(LINES.map((l) => [l.id, l.text]));
const all: LevelDef[] = [...MAIN_LEVELS.filter((l) => !isQuiz(l)), ...CLASSIC_LEVELS];
const D = new Map<string, number>();

interface ReportRow {
  id: string;
  name: string;
  size: string;
  crates: number;
  opt: string;
  star2: number;
  states: number;
  trap: string;
  seq: string;
  greedy: string;
  sw: string;
  D: number | string;
  kid: string;
  first: string;
  invis: string;
  errs: string[];
}
const report: ReportRow[] = [];
const fmtFirst = (f: Partial<Record<string, number | null>>) => ['corner', 'wall', 'pair', 'square'].map((k) => `${k[0]}${f[k] ?? '-'}`).join(' ');

afterAll(() => {
  if (!process.env.SOK_REPORT) return;
  const dir = path.join(os.homedir(), 'kid-games-work/reports/sokoban');
  fs.mkdirSync(dir, { recursive: true });
  const head = ['id', 'name', 'W×H', 'crates', 'opt p/m', '★★≤', 'states', 'trap', 'seq', 'greedy', 'sw/turn', 'D', 'k1/L1 (proto)', 'first dead (c w p s)', 'invis', 'result'];
  const lines = report.map((r) => [r.id, r.name, r.size, r.crates, r.opt, r.star2, r.states, r.trap, r.seq, r.greedy, r.sw, r.D, r.kid, r.first, r.invis, r.errs.length ? `FAIL ${r.errs.join('; ')}` : 'ok'].join(' | '));
  const fails = report.filter((r) => r.errs.length).length;
  const out = [
    `星港搬运工 — level validator (fast, spec §9.1), ${new Date().toISOString()}`,
    `content: content/sokoban/levels.json + classic.json; engine: @engines/puzzle (the page's code)`,
    `${report.length} levels, ${fails} failing`,
    '',
    head.join(' | '),
    ...lines,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'levels-fast.txt'), out);
});

describe('levels: G rules + lesson assertions (fast)', () => {
  it('ships the v1 content (spec §0A.1): chapters 0–4 = 34 (32 push levels + 2 quizzes), cert 2, 经典仓库 10', () => {
    expect(chapterLevels(0).map((l) => l.id)).toEqual(['0-1', '0-2', '0-3', '0-4']);
    expect(chapterLevels(1).map((l) => l.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6']);
    expect(chapterLevels(2).map((l) => l.id)).toEqual(['2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8']);
    expect(chapterLevels(3).map((l) => l.id)).toEqual(['3-1', '3-2', '3-3', '3-4', '3-5', '3-6', '3-7', '3-8']);
    expect(chapterLevels(4).map((l) => l.id)).toEqual(['4-1', '4-2', '4-3', '4-4', '4-5', '4-6', '4-7', '4-8']);
    expect(CHAPTERS.flatMap((c) => chapterLevels(c.ch)).length).toBe(34);
    expect(CHAPTERS.flatMap((c) => chapterLevels(c.ch)).filter(isQuiz).map((l) => l.id)).toEqual(['3-3', '3-5']);
    expect(certLevels().map((l) => l.id)).toEqual(['cert-1', 'cert-2']);
    expect(CLASSIC_LEVELS.map((l) => l.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']);
    expect(all.length).toBe(44);
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    // roles per chapter: one boss each from chapter 1 on; reviews ≥ 20 % from chapter 3 on (C4)
    for (const c of [1, 2, 3, 4]) expect(chapterLevels(c).filter((l) => l.role === 'boss').length).toBe(1);
    for (const c of [3, 4]) expect(chapterLevels(c).filter((l) => l.review).length).toBeGreaterThanOrEqual(Math.ceil(0.2 * chapterLevels(c).length));
    // every 镜子仓库 twin resolves (same rules, mirrored map, transformed reference line)
    for (const L of all) {
      if (L.track === 'cert') continue;
      const t = levelById(`${L.id}~twin`)!;
      expect(t.map).toEqual(transformRows(L.map, L.twin));
      const r = replayLurd(parseLevel(t.map), t.ref);
      expect(r.ok && r.solved && r.pushes === L.opt.pushes && r.moves === L.opt.moves, L.id).toBe(true);
    }
  });

  for (const L of all) {
    it(`${L.id} ${L.name}`, () => {
      const errs: string[] = [];
      const isMain = L.track === 'main' || L.track === 'cert';
      // G1
      const l = parseLevel(L.map, L.id);
      // G4
      if (l.W > LIMITS.maxW || l.H > LIMITS.maxH) errs.push(`G4 size ${l.W}x${l.H}`);
      // G10
      if (!L.teaches) errs.push('G10 teaches missing');
      if (!LESSONS.has(L.lesson)) errs.push(`G10 lesson ${L.lesson}`);
      const say = lineText.get(L.say);
      if (!say || [...say].length > 15) errs.push(`G10 say ${L.say} missing or > 15 chars`);
      if (L.star2 !== star2Of(L.opt.pushes)) errs.push(`G10 star2 ${L.star2} ≠ ${star2Of(L.opt.pushes)}`);
      // G3 (replay) — every level
      const r = replayLurd(l, L.ref);
      if (!(r.ok && r.solved && r.pushes === L.opt.pushes && r.moves === L.opt.moves)) errs.push(`G3 ref replay ${JSON.stringify(r)}`);
      // G9
      if (L.opt.moves > LIMITS.walkFactor * L.opt.pushes + LIMITS.walkSlack) errs.push(`G9 walking ${L.opt.moves}`);
      // G5
      if (isMain && L.opt.pushes > LIMITS.mainMaxPush) errs.push(`G5 pushes ${L.opt.pushes}`);
      // G7
      const twin = twinOf(L.map);
      if (!twin) errs.push('G7 no twin');
      else if (twin.kind !== L.twin) errs.push(`G7 twin ${twin.kind} ≠ ${L.twin}`);
      // G8
      if (isMain) {
        if (detectDeadlock(l, canon(l, l.start.boxes))) errs.push('G8 dead at start');
        for (const b of l.start.boxes) if (l.goal[b] >= 0) errs.push('G8 crate starts on a pad');
        if (l.goal[l.start.player] >= 0) errs.push('G8 robot starts on a pad');
      }
      if (BIG.has(L.id)) {
        // G2 + push optimality from the full graph (the exact move-optimal solve and G6 run in the full validator)
        const g = StateGraph.buildSync(l, { maxStates: 200000, maxMs: 60000 });
        if (!g) errs.push('G2 truncated');
        else if (g.startTogo !== L.opt.pushes) errs.push(`G3 graph optimum ${g.startTogo} ≠ ${L.opt.pushes}`);
        report.push({ id: L.id, name: L.name, size: `${l.W}×${l.H}`, crates: l.nBoxes, opt: `${L.opt.pushes}/${L.opt.moves}`, star2: L.star2, states: g?.size ?? 0, trap: '(full)', seq: '(full)', greedy: '(full)', sw: '(full)', D: L.metrics.D, kid: `${L.metrics.k1 ?? '-'}/${L.metrics.L1 ?? '-'}`, first: fmtFirst(L.metrics.first), invis: String(L.metrics.invis ?? '-'), errs: [...errs] });
        expect(errs).toEqual([]);
        return;
      }
      const a = analyzeLevel(L.map)!;
      // G2
      if (!a || !a.solvable) {
        errs.push('G2 unsolvable / truncated');
        report.push({ id: L.id, name: L.name, size: `${l.W}×${l.H}`, crates: l.nBoxes, opt: '-', star2: L.star2, states: 0, trap: '-', seq: '-', greedy: '-', sw: '-', D: '-', kid: '-', first: '-', invis: '-', errs: [...errs] });
        expect(errs).toEqual([]);
        return;
      }
      // G3: the exact solver's optimum (pushes, then moves) is the recorded one
      if (a.pushes !== L.opt.pushes || a.movesAtOptPush !== L.opt.moves) errs.push(`G3 optimum ${a.pushes}/${a.movesAtOptPush} ≠ ${L.opt.pushes}/${L.opt.moves}`);
      // G6
      if (a.falsePos) errs.push(`G6 detector false positives ${a.falsePos}`);
      // metrics parity with the spec tables (check.mjs v1.1)
      const m = L.metrics;
      if (a.D !== m.D) errs.push(`D ${a.D} ≠ ${m.D}`);
      if (a.trapFirst !== m.trapFirst || a.firstPushes !== m.firstPushes) errs.push(`trap ${a.trapFirst}/${a.firstPushes} ≠ ${m.trapFirst}/${m.firstPushes}`);
      if (a.switches !== m.switches || a.turns !== m.turns) errs.push(`switches/turns ${a.switches}/${a.turns} ≠ ${m.switches}/${m.turns}`);
      if (a.greedy !== m.greedy) errs.push(`greedy ${a.greedy} ≠ ${m.greedy}`);
      if (m.seqFirsts !== null && a.seqFirsts.length !== m.seqFirsts) errs.push(`seq firsts ${a.seqFirsts.length} ≠ ${m.seqFirsts}`);
      D.set(L.id, a.D);
      // §4 table columns "首现" / "隐形": the deadlock-type first depths and the shallowest
      // undetected dead end (the basis of the naming rule and of layer 2) match the prototype
      const scan = depthScan(l, a.graph);
      for (const k of ['corner', 'wall', 'pair', 'square'] as const) {
        if (m.first[k] !== undefined && (m.first[k] ?? null) !== scan.first[k]) errs.push(`first ${k} ${scan.first[k]} ≠ ${m.first[k]}`);
      }
      if ((m.invis ?? null) !== scan.invis) errs.push(`invis ${scan.invis} ≠ ${m.invis}`);
      // L — lesson assertions
      const c = L.checks;
      if (c.pushes && (a.pushes < c.pushes[0] || a.pushes > c.pushes[1])) errs.push(`L pushes ${a.pushes} ∉ [${c.pushes}]`);
      if (c.boxes && a.boxes !== c.boxes) errs.push(`L boxes ${a.boxes} ≠ ${c.boxes}`);
      if (c.trap && a.trapFirst < c.trap) errs.push(`L trapFirst ${a.trapFirst} < ${c.trap}`);
      if (c.trapType && !within(a.graph, c.trapDepth ?? 2, (i) => detectDeadlock(l, a.graph.stateAt(i).boxes)?.type === c.trapType)) errs.push(`L no ${c.trapType} within ${c.trapDepth ?? 2}`);
      if (c.seq === false && a.seqOK) errs.push('L solvable without parking');
      if (c.seq === true && !a.seqOK) errs.push('L needs parking');
      if (c.seqFirst === 'only' && a.seqFirsts.length !== 1) errs.push(`L ${a.seqFirsts.length} crates can go first`);
      if (c.greedy === 'fail' && a.greedy === 'solved') errs.push('L greedy solves it');
      if (c.greedy === 'ok' && a.greedy !== 'solved') errs.push(`L greedy ${a.greedy}`);
      if (c.turnsMin && a.turns < c.turnsMin) errs.push(`L turns ${a.turns} < ${c.turnsMin}`);
      if (c.switchesMin && a.switches < c.switchesMin) errs.push(`L switches ${a.switches} < ${c.switchesMin}`);
      if (c.invisMax !== undefined) {
        // shallowest undetected dead end (layer-2 territory)
        let frontier = [a.graph.startIndex];
        const seen = new Set(frontier);
        let invis: number | null = null;
        for (let d = 0; frontier.length && invis === null; d += 1) {
          for (const i of frontier) if (!detectDeadlock(l, a.graph.stateAt(i).boxes) && a.graph.togoAt(i) < 0) invis = d;
          const next: number[] = [];
          for (const i of frontier) for (const j of a.graph.successors(i)) if (!seen.has(j)) {
            seen.add(j);
            next.push(j);
          }
          frontier = next;
        }
        if (invis === null || invis > c.invisMax) errs.push(`L no undetected dead end within ${c.invisMax}`);
      }
      report.push({
        id: L.id, name: L.name, size: `${a.W}×${a.H}`, crates: a.boxes, opt: `${a.pushes}/${a.movesAtOptPush}`, star2: L.star2, states: a.states,
        trap: `${a.trapFirst}/${a.firstPushes}`, seq: a.seqOK ? `ok(${a.seqFirsts.length})` : 'park', greedy: a.greedy, sw: `${a.switches}/${a.turns}`, D: a.D,
        kid: `${m.k1 ?? '-'}/${m.L1 ?? '-'}`, first: fmtFirst(scan.first), invis: String(scan.invis ?? '-'), errs: [...errs],
      });
      expect(errs).toEqual([]);
    }, 60_000);
  }

  it('chapter curve rules C1–C3, C5 hold for the shipped chapters', () => {
    const errs: string[] = [];
    let seenCrates = 1;
    for (const C of CHAPTERS) {
      const play = chapterLevels(C.ch).filter((l) => l.role !== 'quiz');
      if (!play.length) continue;
      for (let i = 1; i < play.length; i += 1) {
        const cur = play[i];
        if (cur.role === 'intro' || cur.role === 'breather' || C.ch === 0) continue;
        let k = i - 1;
        while (k > 0 && play[k].review) k -= 1;
        const ref = play[k];
        if ((D.get(ref.id) ?? ref.metrics.D) * 1.3 + 3 < (D.get(cur.id) ?? cur.metrics.D)) errs.push(`C1 ${cur.id}`);
      }
      const boss = play.find((l) => l.role === 'boss');
      const maxD = Math.max(...play.map((l) => D.get(l.id) ?? l.metrics.D));
      if (boss && (D.get(boss.id) ?? boss.metrics.D) < maxD) errs.push(`C2 boss ${boss.id} not the hardest`);
      const br = play.find((l) => l.role === 'breather');
      if (br && boss && br.opt.pushes > 0.7 * boss.opt.pushes + 0.5) errs.push(`C3 breather ${br.id}`);
      play.forEach((l, i) => {
        const crates = parseLevel(l.map).nBoxes;
        if (crates > seenCrates && (i > 1 || l.review)) errs.push(`C5 ${l.id} adds crates late`);
        seenCrates = Math.max(seenCrates, crates);
      });
    }
    expect(errs).toEqual([]);
  });
});

// ---------------------------------------------------------------- 侦探题 Q1–Q6 (spec §3.7, §4.4, §9.1)

const WANT: Record<string, string[]> = { corner: ['corner'], wall: ['wall'], onpad: ['corner'], pair: ['pair'], square: ['square'], mixed: ['pair', 'wall'] };

function checkSide(side: QuizSide, declared: string): string[] {
  const errs: string[] = [];
  const l = parseLevel(side.map);
  const rc = (i: number) => ({ r: (i / l.W) | 0, c: i % l.W });
  const key = (x: { r: number; c: number }) => `${x.r},${x.c}`;
  const exact = exactDead(l);
  const per = detectAll(l, l.start.boxes);
  // Q1: the detector's dead set = the exhaustive one
  const det = per.map((p) => p.cell).sort((a, b) => a - b);
  if (det.join() !== exact.join()) errs.push(`Q1 detector [${det}] ≠ exact [${exact}]`);
  // the stored answer = the exhaustive dead set, with the detector's type per crate
  if (side.dead.map(key).sort().join(' ') !== exact.map((i) => key(rc(i))).sort().join(' ')) errs.push('stored dead ≠ exact');
  for (const d of side.dead) {
    const t = per.find((p) => key(rc(p.cell)) === key(d))?.type;
    if (t !== d.type) errs.push(`type of ${key(d)}: stored ${d.type} ≠ detector ${t}`);
  }
  const start = Array.from(l.start.boxes);
  const home = start.filter((p, s) => l.goal[p] === l.colorOf[s]);
  const alive = start.filter((p, s) => !exact.includes(p) && l.goal[p] !== l.colorOf[s]);
  if (side.home.map(key).sort().join(' ') !== home.map((i) => key(rc(i))).sort().join(' ')) errs.push('stored home');
  if (side.alive.map(key).sort().join(' ') !== alive.map((i) => key(rc(i))).sort().join(' ')) errs.push('stored alive');
  // Q2: ≥ 1 dead, ≥ 1 alive or home, not every crate dead
  if (!exact.length) errs.push('Q2 no dead crate');
  if (!alive.length && !home.length) errs.push('Q2 no alive or home crate');
  if (exact.length === l.nBoxes) errs.push('Q2 every crate dead');
  // Q4: per-crate types = the declared type of the board
  const types = [...new Set(per.map((p) => p.type))].sort();
  const want = WANT[declared] ?? [];
  if (types.join() !== [...want].sort().join()) errs.push(`Q4 types [${types}] ≠ declared ${declared} [${want}]`);
  // Q5: every alive crate has a ≤ 8-push single-crate line onto a pad (the ghost demo), replayed with the rules
  for (const a of side.alive) {
    const cell = a.r * l.W + a.c;
    const slot = start.indexOf(cell);
    const r = replayLurd(l, a.demo);
    const pushes = [...a.demo].filter((ch) => ch !== ch.toLowerCase()).length;
    const moved = start.map((p, s) => (r.boxes[s] !== p ? s : -1)).filter((s) => s >= 0);
    if (!r.ok || pushes > 8 || moved.length !== 1 || moved[0] !== slot || l.goal[r.boxes[slot]] !== l.colorOf[slot]) errs.push(`Q5 demo of ${key(a)} (${a.demo})`);
  }
  return errs;
}

describe('侦探题 boards: Q1–Q6', () => {
  it('two quizzes, three boards each, on the chapter-3 road', () => {
    expect(Object.keys(QUIZZES)).toEqual(['quiz-a', 'quiz-b']);
    expect(QUIZZES['quiz-a'].level).toBe('3-3');
    expect(QUIZZES['quiz-b'].level).toBe('3-5');
    for (const q of Object.values(QUIZZES)) expect(q.boards.length).toBe(3);
    expect(levelById('3-3')!.quiz).toBe('quiz-a');
    expect(levelById('3-5')!.quiz).toBe('quiz-b');
  });
  for (const [qid, Q] of Object.entries(QUIZZES)) {
    for (const B of Q.boards) {
      it(`${qid}/${B.id} (${B.type})`, () => {
        const errs = checkSide(B, B.type);
        // Q6: a twin with a different picture, stored as the named transform, valid on its own
        const tw = twinOf(B.map);
        if (!tw) errs.push('Q6 no twin');
        else {
          if (tw.kind !== B.twin.kind) errs.push(`Q6 twin ${tw.kind} ≠ stored ${B.twin.kind}`);
          if (transformRows(B.map, B.twin.kind).join('|') !== B.twin.map.join('|')) errs.push('Q6 stored twin map');
          errs.push(...checkSide(B.twin, B.type).map((e) => `twin: ${e}`));
        }
        expect(errs).toEqual([]);
      });
    }
  }
});
