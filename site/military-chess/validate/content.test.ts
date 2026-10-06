/**
 * Content validation (spec §9.2, fast part): every 学堂 item and every 残局 + reply book is re-checked
 * against the REAL engine, solver and policy (no copies). Heavy rebuilds live in
 * tools/military-chess/books.heavy.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseSq } from '../src/core/board';
import { resolve } from '../src/core/combat';
import { inferMask, optionConsistent } from '../src/core/belief';
import { gridToLayout, layoutToGrid, slotOf, completable, validateLayout } from '../src/core/layout';
import { isMobileType, rankOf, typeFromCode, COUNTS, FLAG } from '../src/core/pieces';
import { apply } from '../src/core/rules';
import { legalMoves, isMove, pieceCanMove } from '../src/core/movegen';
import { parseNote } from '../src/core/notation';
import { buildPuzzleState, failed, goalReached, mirrorPuzzle, PASS, type PuzzleDef } from '../src/core/puzzle';
import { forcedWin, solve } from '../src/core/solver';
import type { Book, BookNode } from '../src/core/book';
import { sceneAction, sceneStart } from '../src/ctrl/scene-ctrl';
import lessonsJson from '../../../content/military-chess/lessons.json';
import endgamesJson from '../../../content/military-chess/endgames.json';
import type { BoardItem, Endgame, Lesson, OptNode, SceneItem } from '../src/content';
import { TEMPLATES } from './helpers';

const ROOT = path.resolve(__dirname, '../../..');
const LESSONS = (lessonsJson as unknown as { lessons: Lesson[] }).lessons;
const ITEMS = LESSONS.flatMap((l) => l.items);
const ENDGAMES = (endgamesJson as unknown as { puzzles: Endgame[] }).puzzles;
const readBook = (rel: string): Book => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/military-chess', rel), 'utf8'));
const boards = ITEMS.filter((i): i is BoardItem => i.type === 'board');

describe('学堂 structure (spec §4.1)', () => {
  test('9 lessons, 66 items, 20 concepts; each concept: exactly one intro and ≥3 items; every lesson ends with a review', () => {
    expect(LESSONS.map((l) => l.id)).toEqual(['L1', 'L2', 'F', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']);
    expect(ITEMS.length).toBe(66);
    const count: Record<string, number> = {}, intro: Record<string, number> = {};
    for (const it of ITEMS) {
      for (const c of [it.concept, ...(it.also ?? [])]) count[c] = (count[c] ?? 0) + 1;
      if (it.role === 'intro') intro[it.concept] = (intro[it.concept] ?? 0) + 1;
      expect(it.title && it.teaches, it.id).toBeTruthy();
    }
    expect(Object.keys(intro).length).toBe(20);
    for (const c of Object.keys(intro)) {
      expect(intro[c], c).toBe(1);
      expect(count[c], c).toBeGreaterThanOrEqual(3);
    }
    for (const l of LESSONS) {
      expect(l.items[l.items.length - 1].role, l.id).toBe('review');
      expect(l.wrap, l.id).toBeTruthy();
    }
    // type mix of v1 (§0.2): 47 boards, 3 scenes, 11 cards, 5 deploy items
    const by = (t: string) => ITEMS.filter((i) => i.type === t).length;
    expect(by('board')).toBe(47);
    expect(by('scene')).toBe(3);
    expect(by('order') + by('compare') + by('infer')).toBe(11);
    expect(by('deploy') + by('deploy-full')).toBe(5);
  });
  test('no hidden pieces before L8; 暗子 items never need to hit a hidden piece (no luck)', () => {
    for (const l of LESSONS) for (const it of l.items) {
      if (it.type !== 'board') continue;
      if (l.id !== 'L8') expect(it.mode === 'an' || !!it.hidden, it.id).toBe(false);
      if (it.mode === 'an') {
        const hid = new Set(it.hidden ?? []);
        for (const mv of [...it.first, ...it.line]) if (mv.includes('x')) expect(hid.has(mv.split('x')[1]), it.id + ' ' + mv).toBe(false);
      }
    }
  });
});

describe('学堂 board items re-solved by the real solver (§9.2)', () => {
  test('47 boards: par, optimal first-move set, mirror-twin par; at least one non-optimal first move', { timeout: 30_000 }, () => {
    for (const it of boards) {
      const r = solve(it, 7);
      expect(r.par, it.id).toBe(it.par);
      expect(r.firstMoves.slice().sort(), it.id).toEqual(it.first.slice().sort());
      if (it.goal.kind !== 'reach') expect(r.firstMoves.length, it.id).toBeLessThan(r.total);
      const m = solve(mirrorPuzzle(it), 7);
      expect(m.par, it.id + ' mirror').toBe(it.par);
    }
  });
  test('static items: the optimal-continuation tree replays (legal, d decreases, W = goal)', () => {
    let n = 0;
    for (const it of boards) {
      if (!it.opt) continue;
      const s0 = buildPuzzleState(it);
      const walk = (s: ReturnType<typeof buildPuzzleState>, node: OptNode, d: number): void => {
        expect(node.d, it.id).toBe(d);
        for (const mv of node.b) {
          n++;
          const m = parseNote(s, mv);
          expect(m, `${it.id} ${mv}`).toBeTruthy();
          const a = apply(s, m!).state;
          const e = node.m[mv];
          if (e === 'W') {
            expect(goalReached(it, s0, a, false), `${it.id} ${mv}`).toBe(true);
            continue;
          }
          walk(apply(a, PASS).state, e, d - 1);
        }
      };
      walk(s0, it.opt, it.par);
    }
    expect(n).toBeGreaterThan(100);
  });
  test('main lines replay and reach the goal', () => {
    for (const it of boards) {
      const s0 = buildPuzzleState(it);
      let s = s0;
      for (const mv of it.line) {
        const a = parseNote(s, mv);
        expect(a, `${it.id} ${mv}`).toBeTruthy();
        s = apply(s, a!).state;
      }
      if (it.goal.kind === 'survive') expect(failed(it, s0, s), it.id).toBe(false);
      else expect(goalReached(it, s0, s, true) || goalReached(it, s0, s, false), it.id).toBe(true);
    }
  });
});

describe('学堂 card items (§4.1)', () => {
  test('order: distinct ranks; answer = ascending', () => {
    for (const it of ITEMS) if (it.type === 'order') {
      const ranks = it.cards.map((c) => rankOf(typeFromCode(c)));
      expect(new Set(ranks).size, it.id).toBe(ranks.length);
      expect(it.answer, it.id).toEqual(it.cards.slice().sort((a, b) => rankOf(typeFromCode(a)) - rankOf(typeFromCode(b))));
    }
  });
  test('compare: answers = resolve(); every answer has a button; 扛旗 only when needed', () => {
    for (const it of ITEMS) if (it.type === 'compare') {
      it.pairs.forEach(([a, d], k) => {
        expect(isMobileType(typeFromCode(a)), it.id).toBe(true);
        expect(resolve(typeFromCode(a), typeFromCode(d)), `${it.id} #${k}`).toBe(it.answers[k]);
      });
      for (const a of it.answers) expect(it.buttons, it.id).toContain(a);
      expect(it.buttons.includes('F'), it.id).toBe(it.answers.includes('F'));
    }
  });
  test('infer: exactly one option is (or is not) consistent with the events', () => {
    for (const it of ITEMS) if (it.type === 'infer') {
      const m = inferMask(it.events);
      const ok = it.options.map((o) => optionConsistent(o, m));
      const n = ok.filter(Boolean).length;
      if (it.ask === 'can') expect(n, it.id).toBe(1);
      else expect(n, it.id).toBe(it.options.length - 1);
      expect(it.answer, it.id).toBe(it.options[ok.findIndex((x) => (it.ask === 'can' ? x : !x))]);
    }
  });
  test('deploy: blanks hold the tray pieces; legal and illegal fillings exist; "accept only if completable" never dead-ends', () => {
    for (const it of ITEMS) if (it.type === 'deploy') {
      const tpl = TEMPLATES.find((t) => t.id === it.template)!;
      const base = tpl.layout.split('');
      expect(gridToLayout(layoutToGrid(tpl.layout))).toBe(tpl.layout);
      const idxs = it.blanks.map(([r, c]) => slotOf(r, c));
      expect(idxs.every((k) => k >= 0), it.id).toBe(true);
      expect(idxs.map((k) => base[k]).sort().join(''), it.id).toBe(it.place.slice().sort().join(''));
      let legal = 0, illegal = 0;
      const perm = (arr: string[], l = 0): void => {
        if (l === arr.length) {
          const b = base.slice();
          idxs.forEach((k, i) => (b[k] = arr[i]));
          if (validateLayout(b.join('')).length) illegal++;
          else legal++;
          return;
        }
        for (let i = l; i < arr.length; i++) {
          [arr[l], arr[i]] = [arr[i], arr[l]];
          perm(arr, l + 1);
          [arr[l], arr[i]] = [arr[i], arr[l]];
        }
      };
      perm(it.place.slice());
      expect([legal, illegal], it.id).toEqual([it.legalFillings, it.illegalFillings]);
      const visited = new Set<string>();
      const walk = (filled: Map<number, string>, rest: string[]): void => {
        const key = idxs.map((k) => filled.get(k) ?? '_').join('');
        if (visited.has(key)) return;
        visited.add(key);
        for (const v of new Set(rest)) {
          let any = false;
          for (const k of idxs) {
            if (filled.has(k)) continue;
            filled.set(k, v);
            const r2 = rest.slice();
            r2.splice(r2.indexOf(v), 1);
            if (completable(base, idxs, filled, r2)) {
              any = true;
              walk(new Map(filled), r2);
            }
            filled.delete(k);
          }
          expect(any, `${it.id}: piece ${v} has no acceptable blank`).toBe(true);
        }
      };
      walk(new Map(), it.place.slice());
    }
  });
  test('scenes F-1–F-3: every scripted action is legal in the real engine and gives the scripted outcome', () => {
    for (const it of ITEMS) if (it.type === 'scene') {
      const sc = it as SceneItem;
      let s = sceneStart(sc);
      const trace: string[] = [];
      for (const st of sc.steps) {
        if (!st.act) continue;
        if (st.act.startsWith('select ')) {
          const from = parseSq(st.act.slice(7));
          expect(s.board[from], it.id).toBeGreaterThanOrEqual(0);
          if (st.reject) expect(legalMoves(s).some((m) => isMove(m) && m.from === from && m.to === parseSq(st.reject!)), it.id).toBe(false);
          continue;
        }
        const a = sceneAction(s, st.act);
        expect(a, `${it.id} ${st.act}`).toBeTruthy();
        const { state, event } = apply(s, a!);
        if (st.expect) expect(event.outcome, it.id).toBe(st.expect);
        expect(state.result, it.id).toBeNull();
        trace.push(st.act + (event.flipped ? `=${event.flipped.side ? 'B' : 'R'}${'FMB123456789'[event.flipped.type]}` : '') + (event.outcome ? `:${event.outcome}` : ''));
        s = state;
      }
      expect(trace, it.id).toEqual(sc.trace);
    }
  });
});

// ------------------------------------------------------------------ 残局 + books
function countsOk(pz: PuzzleDef): boolean {
  for (const side of [pz.red, pz.blue]) {
    const n: Record<string, number> = {};
    for (const v of Object.values(side)) n[v] = (n[v] ?? 0) + 1;
    for (const [code, k] of Object.entries(n)) if (k > COUNTS[typeFromCode(code)]) return false;
  }
  return true;
}
function replayBook(pz: PuzzleDef & { par: number }, root: BookNode, id: string): number {
  const s0 = buildPuzzleState(pz);
  let entries = 0;
  const walk = (s: ReturnType<typeof buildPuzzleState>, node: BookNode | 0, used: number): void => {
    if (node === 0) return;
    expect(node.b.length, id).toBeGreaterThan(0);
    for (const mv of node.b) expect(mv in node.m, `${id} optimal ${mv} in m`).toBe(true);
    for (const [mv, e] of Object.entries(node.m)) {
      entries++;
      const m = parseNote(s, mv);
      expect(m, `${id} legal ${mv}`).toBeTruthy();
      const a = apply(s, m!).state;
      if (e === 'W') {
        expect(goalReached(pz, s0, a, false), `${id} W ${mv}`).toBe(true);
        continue;
      }
      if (e === 'F') {
        expect(failed(pz, s0, a) || !!a.result, `${id} F ${mv}`).toBe(true);
        continue;
      }
      const rep = parseNote(a, e[0]);
      expect(rep, `${id} reply ${mv} ${e[0]}`).toBeTruthy();
      const bb = apply(a, rep!).state;
      if (e.length > 1 && e[1] !== 0) {
        const child = e[1] as BookNode;
        if (node.b.includes(mv)) expect(child.d, `${id} d along ${mv}`).toBe(node.d - 1);
        expect(child.d + used + 1, id).toBeLessThanOrEqual(pz.par + 2);
        walk(bb, child, used + 1);
      }
    }
  };
  walk(s0, root, 0);
  // the main line reaches the goal in exactly par RED moves
  let s = s0, n: BookNode | 0 = root, k = 0;
  while (n) {
    const mv: string = n.b[0];
    k++;
    const e: BookNode['m'][string] = n.m[mv];
    s = apply(s, parseNote(s, mv)!).state;
    if (e === 'W' || e === 'F') break;
    s = apply(s, parseNote(s, e[0])!).state;
    n = e.length > 1 ? (e[1] as BookNode | 0) : 0;
  }
  expect(k, id + ' main line').toBe(pz.par);
  return entries;
}

describe('残局 16 + reply books (§4.2, §9.2)', () => {
  test('16 puzzles; counts within a real set; no flag at once; BLUE has a mobile piece; tier par; ≤2 first moves; 8 distinct ideas per tier', () => {
    expect(ENDGAMES.length).toBe(16);
    for (const e of ENDGAMES) {
      expect(countsOk(e), e.id).toBe(true);
      const s0 = buildPuzzleState(e);
      expect(legalMoves(s0).some((m) => isMove(m) && m.kind === 'attack' && s0.ptype[s0.board[m.to]] === FLAG), e.id).toBe(false);
      let mobile = false;
      for (let p = 0; p < s0.np; p++) if (s0.pside[p] === 1 && isMobileType(s0.ptype[p]) && pieceCanMove(s0, p)) mobile = true;
      expect(mobile, e.id).toBe(true);
      expect(e.tier === 1 ? [2, 3] : [3], e.id).toContain(e.par);
      expect(e.first.length, e.id).toBeLessThanOrEqual(2);
      expect(e.title && e.teaches, e.id).toBeTruthy();
    }
    for (const t of [1, 2]) {
      const ideas = ENDGAMES.filter((e) => e.tier === t).map((e) => e.idea);
      expect(ideas.length).toBe(8);
      expect(new Set(ideas).size, `tier ${t}`).toBe(8);
    }
  });
  test('17 books replay: legal moves and replies, W/F right, d decreases along optimal moves, main line = par', { timeout: 30_000 }, () => {
    const lessonBooks = boards.filter((b) => b.book);
    const all: Array<PuzzleDef & { par: number; book: string; id: string }> = [...ENDGAMES, ...(lessonBooks as Array<BoardItem & { book: string }>)];
    expect(all.length).toBe(17);
    let entries = 0;
    for (const pz of all) {
      const b = readBook(pz.book);
      expect(b.stamp, pz.id).toBeTruthy();
      entries += replayBook(pz, b.root, pz.id);
    }
    expect(entries).toBe(2686);
  });
  test('par certificates: no forced win in par − 1', { timeout: 30_000 }, () => {
    const all: Array<PuzzleDef & { par: number; id: string }> = [...ENDGAMES, ...boards.filter((b) => b.book)];
    for (const pz of all) {
      const s0 = buildPuzzleState(pz);
      if (pz.par > 1) expect(forcedWin(pz, s0, s0, pz.par - 1, new Map()), pz.id).toBe(false);
    }
  });
  test('mirror twin par equals (endgames)', { timeout: 30_000 }, () => {
    for (const e of ENDGAMES) expect(solve(mirrorPuzzle(e), 5).par, e.id).toBe(e.par);
  });
});

// keep imports used
void isMove;
void validateLayout;
void ((): unknown => [COUNTS, rankOf]);
