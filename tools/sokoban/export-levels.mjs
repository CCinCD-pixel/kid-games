#!/usr/bin/env node
// @ts-check
/**
 * 星港搬运工 — export the shipped level data from the spec's prototype tools (spec §8.1, §8.3).
 *
 *   node tools/sokoban/export-levels.mjs [--only=0,1,2,3,4,cert,quiz,classic] [--proto=<dir>] [--dry]
 *
 * Reads (never modifies) the prototype directory (default ~/kid-games-work/specs/sokoban-tools):
 *   levels.mjs (main + cert + the two 侦探题 entries, release 'v1' only), classic.mjs, quiz.mjs (the
 *   six quiz boards, exact dead sets, the twin rule), eval.mjs (per-crate detector types),
 *   rooms_random.mjs (随机新仓库 room templates) and levels.v1.out.json (check.mjs v1.1 numbers:
 *   optimal pushes/moves, ref line, D, k1, L1, depths).
 * Writes content/sokoban/levels.json, classic.json, quizzes.json and rooms.json. The game and the
 * validators (site/sokoban/levels.test.ts, tools/check-levels.full.test.ts) read these same files;
 * the validators recompute every number with the production engine and fail on any difference.
 *
 * Plain JS on purpose (the repo's Node cannot import TS; the prototypes stay outside the repo).
 * --only selects tracks/chapters: digits = main chapters, `cert`, `quiz`, `classic`. Default = the
 * whole v1 release (chapters 0–4 with both quizzes, the cert, 经典仓库). v2 content (chapters 5–6,
 * the tower) is never exported here (spec §0A.3) — its data format is already supported.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (name, dflt) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;
const PROTO = arg('proto', path.join(os.homedir(), 'kid-games-work/specs/sokoban-tools'));
const ONLY = new Set(String(arg('only', '0,1,2,3,4,cert,quiz,classic')).split(',').map((s) => s.trim()).filter(Boolean));
const DRY = args.includes('--dry');

const load = async (f) => import(pathToFileURL(path.join(PROTO, f)).href);
const { LEVELS } = await load('levels.mjs');
const { CLASSIC } = await load('classic.mjs');
const { QUIZZES, exactDead, retryBoard } = await load('quiz.mjs');
const { detectAll } = await load('eval.mjs');
const { parse, DIRS, nb, boxMap, walk } = await load('sokoban.mjs');
const { ROOMS_RANDOM } = await load('rooms_random.mjs');
const OUT = JSON.parse(fs.readFileSync(path.join(PROTO, 'levels.v1.out.json'), 'utf8'));
const byId = new Map(OUT.map((r) => [r.id, r]));

const rowsOf = (map) => map.split('\n').filter((r) => r.length);
const wanted = (L) => {
  if (L.kind === 'quiz') return ONLY.has('quiz');
  if (L.track === 'classic') return ONLY.has('classic');
  if (L.track === 'cert') return ONLY.has('cert');
  return ONLY.has(String(L.ch));
};

function record(L) {
  const r = byId.get(L.id);
  if (!r) throw new Error(`${L.id}: no check.mjs record in levels.v1.out.json (re-run check.mjs --json)`);
  if (r.errs?.length) throw new Error(`${L.id}: check.mjs reported ${r.errs.join('; ')}`);
  const map = rowsOf(L.map);
  const twin = retryBoard(map);
  if (!twin) throw new Error(`${L.id}: no twin`);
  /** @type {Record<string, unknown>} */
  const out = {
    id: L.id,
    ...(L.was !== undefined ? { was: L.was } : {}),
    release: L.release ?? 'v1',
    ch: L.ch,
    track: L.track,
    role: L.role,
    review: !!L.review,
    name: L.name,
    teaches: L.teaches,
    say: `sok.lv.${L.id}`,
    lesson: L.lesson,
    map,
    opt: { pushes: r.pushes, moves: r.moves },
    star2: r.star2,
    ref: r.lurd,
    twin: twin.name,
    checks: L.checks ?? {},
    metrics: {
      D: r.D, k1: r.kid1, L1: r.L1, states: r.states, trapFirst: r.trapFirst, firstPushes: r.firstPushes,
      seqFirsts: r.seqFirsts, greedy: r.greedy, switches: r.switches, turns: r.turns, first: r.first, invis: r.invis,
    },
  };
  return { out, sayText: L.say };
}

/** A 侦探题 entry in levels.json: a node on the chapter road (it counts for unlocking); the boards live in quizzes.json. */
function quizRecord(L) {
  if (!QUIZZES[L.quiz]) throw new Error(`${L.id}: unknown quiz ${L.quiz}`);
  const out = {
    id: L.id,
    ...(L.was !== undefined ? { was: L.was } : {}),
    release: L.release ?? 'v1',
    ch: L.ch,
    track: L.track,
    role: 'quiz',
    kind: 'quiz',
    quiz: L.quiz,
    review: false,
    name: L.name,
    teaches: L.teaches,
    say: `sok.lv.${L.id}`,
    lesson: L.lesson,
    map: [],
    opt: { pushes: 0, moves: 0 },
    star2: 0,
    ref: '',
    twin: 'mirror',
    checks: {},
    metrics: { D: 0, k1: null, L1: null, states: 0, trapFirst: 0, firstPushes: 0, seqFirsts: null, greedy: '', switches: 0, turns: 0, first: {}, invis: null },
  };
  return { out, sayText: L.say };
}

// ------------------------------------------------------------------ quiz boards (spec §3.7, §4.4, §8.3)

/**
 * The shortest single-crate push line (other crates are walls) that brings the crate at `cell` onto
 * a pad of its colour, as LURD from the board's robot cell — the "这个还能推到台上，你看" ghost demo
 * (Q5: ≤ 8 pushes). BFS by pushes over (crate, robot region); the walks are BFS paths.
 */
function demoLurd(lvl, cell, maxPush = 8) {
  const start = Array.from(lvl.start.boxes);
  const slot = start.indexOf(cell);
  const col = lvl.colorOf[slot];
  const others = start.filter((x) => x !== cell);
  const reach = (player, crate) => walk(lvl, boxMap(lvl, [...others, crate]), player, true);
  const pathTo = (w, from, to) => {
    let s = '';
    let x = to;
    while (x !== from) {
      const k = w.par[x];
      s = DIRS[k].ch + s;
      x = nb(lvl, x, { dr: -DIRS[k].dr, dc: -DIRS[k].dc });
    }
    return s;
  };
  const q = [{ crate: cell, player: lvl.start.player, n: 0, lurd: '' }];
  const seen = new Set();
  for (let h = 0; h < q.length; h += 1) {
    const st = q[h];
    if (st.n > 0 && lvl.goal[st.crate] === col) return st.lurd;
    if (st.n >= maxPush) continue;
    const w = reach(st.player, st.crate);
    let np = -1;
    for (let i = 0; i < lvl.N; i += 1) if (w.dist[i] >= 0) { np = i; break; }
    const key = `${st.crate}:${np}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const d of DIRS) {
      const from = nb(lvl, st.crate, { dr: -d.dr, dc: -d.dc });
      const to = nb(lvl, st.crate, d);
      if (from < 0 || to < 0 || w.dist[from] < 0 || !lvl.floor[to] || others.includes(to)) continue;
      q.push({ crate: to, player: st.crate, n: st.n + 1, lurd: st.lurd + pathTo(w, st.player, from) + d.ch.toUpperCase() });
    }
  }
  return null;
}

function analyseBoard(rows) {
  const lvl = parse(rows);
  const rc = (i) => ({ r: (i / lvl.W) | 0, c: i % lvl.W });
  const exact = exactDead(lvl);
  const per = detectAll(lvl, Array.from(lvl.start.boxes));
  const start = Array.from(lvl.start.boxes);
  const dead = exact.map((cell) => ({ ...rc(cell), type: per.find((p) => p.cell === cell)?.type ?? null }));
  const home = start.filter((p, s) => lvl.goal[p] === lvl.colorOf[s]).map(rc);
  const alive = start.filter((p, s) => !exact.includes(p) && lvl.goal[p] !== lvl.colorOf[s]).map((p) => {
    const demo = demoLurd(lvl, p);
    if (!demo) throw new Error(`alive crate ${JSON.stringify(rc(p))} has no ≤8-push demo line`);
    return { ...rc(p), demo };
  });
  return { dead, alive, home };
}

function quizzesJson() {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [qid, Q] of Object.entries(QUIZZES)) {
    const level = LEVELS.find((L) => L.quiz === qid);
    out[qid] = {
      name: Q.name,
      teaches: Q.teaches,
      say: level ? `sok.lv.${level.id}` : '',
      level: level?.id ?? null,
      boards: Q.boards.map((B) => {
        const rows = rowsOf(B.map);
        const twin = retryBoard(rows);
        if (!twin) throw new Error(`${qid}/${B.id}: no twin board`);
        return { id: B.id, type: B.type, map: rows, ...analyseBoard(rows), twin: { kind: twin.name, map: twin.rows, ...analyseBoard(twin.rows) } };
      }),
    };
  }
  return out;
}

// ------------------------------------------------------------------ export

const main = LEVELS.filter((L) => (L.release ?? 'v1') === 'v1' && wanted(L)).map((L) => (L.kind === 'quiz' ? quizRecord(L) : record(L)));
const classic = CLASSIC.filter(wanted).map(record);

// narration sync: every exported level's say line must exist in content/sokoban/narration.yaml with the same text
const yamlPath = path.join(ROOT, 'content/sokoban/narration.yaml');
const yaml = fs.existsSync(yamlPath) ? fs.readFileSync(yamlPath, 'utf8') : '';
const problems = [];
for (const { out, sayText } of [...main, ...classic]) {
  const m = yaml.match(new RegExp(`id:\\s*${String(out.say).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,[^\\n]*?text:\\s*([^,}\\n]+)`));
  if (!m) problems.push(`${out.id}: ${out.say} missing in narration.yaml (text: ${sayText})`);
  else if (m[1].trim().replace(/^["']|["']$/g, '') !== sayText) problems.push(`${out.id}: ${out.say} text "${m[1].trim()}" ≠ prototype "${sayText}"`);
}

const GEN = 'tools/sokoban/export-levels.mjs (spec v1.1 prototypes, check.mjs v1.1)';
const writeJson = (file, body) => {
  if (DRY) console.log(`[dry] ${file}`);
  else fs.writeFileSync(path.join(ROOT, 'content/sokoban', file), JSON.stringify(body, null, 1) + '\n');
};
writeJson('levels.json', { version: 1, generatedBy: GEN, levels: main.map((x) => x.out) });
writeJson('classic.json', { version: 1, generatedBy: GEN, levels: classic.map((x) => x.out) });
if (ONLY.has('quiz')) writeJson('quizzes.json', { version: 1, generatedBy: `${GEN}; boards from quiz.mjs, dead = exactDead, types = detectAll, demo = shortest single-crate push line`, quizzes: quizzesJson() });
writeJson('rooms.json', { version: 1, generatedBy: `${GEN}; rooms_random.mjs`, note: "随机新仓库 room templates (spec §4.8): '#' wall, '-' floor, 'x' pillar slot (wall with p = pFurn), 'p' preferred robot start, 'o' preferred pad cell. s = small, m = medium, l = large, x = extra large (v2).", rooms: ROOMS_RANDOM });
console.log(`exported main/cert/quiz ${main.map((x) => x.out.id).join(' ')}`);
console.log(`exported classic ${classic.map((x) => x.out.id).join(' ')}`);
if (problems.length) {
  console.warn(`narration sync: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}`);
  process.exitCode = 1;
}
