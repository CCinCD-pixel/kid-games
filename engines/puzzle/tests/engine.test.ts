/**
 * Engine behaviour: rules, walking, deadlock rules, the state graph, solvers and twins, on the
 * shipped levels (content/sokoban/*.json) plus hand-made boards.
 */
import { describe, expect, it } from 'vitest';
import { exploreGraph } from '../src/analyze';
import { detectAll, detectDeadlock, onDeadSquare } from '../src/deadlock';
import { flipRows, mirrorRows, parseLevel, serialize, twinOf, canonicalHash, rot180Rows, LevelError } from '../src/level';
import { walkPath } from '../src/path';
import { applyPush, legalPushes, replayLurd } from '../src/rules';
import { solveOptimal, solvePushOptimal } from '../src/solver';
import { StateGraph } from '../src/stategraph';
import { nextPush } from '../src/hint';
import { BIG, FULL, contentLevels } from './helpers';

const levels = contentLevels();

describe('parseLevel (G1 rules)', () => {
  it('parses the 0-1 board', () => {
    const l = parseLevel(levels.find((x) => x.id === '0-1')!.map);
    expect([l.W, l.H, l.nBoxes]).toEqual([7, 5, 1]);
    expect(l.floor[l.start.player]).toBe(1);
    // the leading spaces of "  #.$-#" are outside (void), not floor
    expect(l.floor[3 * 7 + 0]).toBe(0);
    expect(l.wall[3 * 7 + 0]).toBe(0);
  });
  it('rejects leaking, unbalanced and odd maps', () => {
    expect(() => parseLevel(['#####', '#@$.-', '#####'])).toThrow(LevelError);
    expect(() => parseLevel(['#####', '#@$$#', '#..-#', '#.--#', '#####'])).toThrow(/crates vs/);
    expect(() => parseLevel(['#####', '#@$x#', '#####'])).toThrow(/bad char/);
    expect(() => parseLevel(['#####', '#-$.#', '#####'])).toThrow(/no robot/);
  });
  it('serialize round-trips every shipped map', () => {
    for (const L of levels) {
      const l = parseLevel(L.map);
      const again = parseLevel(serialize(l));
      expect(Array.from(again.start.boxes)).toEqual(Array.from(l.start.boxes));
      expect(again.start.player).toBe(l.start.player);
      expect(Array.from(again.goal)).toEqual(Array.from(l.goal));
    }
  });
});

describe('walking', () => {
  const l = parseLevel(['#######', '#@----#', '#-##--#', '#-----#', '#######']);
  it('takes the shortest path with the fewest turns', () => {
    const to = 3 * 7 + 5;
    const p = walkPath(l, l.start, to)!;
    expect(p.length).toBe(6);
    // straight right then straight down (1 turn) beats any zig-zag
    let turns = 0;
    const cells = [l.start.player, ...p];
    for (let i = 2; i < cells.length; i += 1) if (cells[i] - cells[i - 1] !== cells[i - 1] - cells[i - 2]) turns += 1;
    expect(turns).toBe(1);
  });
  it('treats crates as walls and answers null when blocked', () => {
    const m = parseLevel(['#####', '#@$-#', '###.#', '#####']);
    expect(walkPath(m, m.start, 1 * 5 + 3)).toBeNull();
    expect(walkPath(m, m.start, m.start.player)).toEqual([]);
  });
});

describe('deadlock rules', () => {
  it('names a corner, a padless wall, a pair and a square', () => {
    const corner = parseLevel(['######', '#$---#', '#--@.#', '######']);
    expect(detectAll(corner, corner.start.boxes)).toEqual([{ cell: 7, type: 'corner' }]);
    const wall = parseLevel(['#######', '#--$--#', '#-@---#', '#----.#', '#######']);
    expect(detectAll(wall, wall.start.boxes)[0].type).toBe('wall');
    const pair = parseLevel(['#######', '#.$$.-#', '#-@---#', '#######']);
    expect(detectAll(pair, pair.start.boxes)).toEqual([{ cell: 9, type: 'pair' }, { cell: 10, type: 'pair' }]);
    expect(detectDeadlock(pair, pair.start.boxes)).toEqual({ type: 'pair', cells: [9, 10] });
    const pair2 = parseLevel(['########', '#------#', '#-@----#', '#--$$--#', '#--..--#', '########']);
    // two crates side by side under a wall line
    expect(detectAll(pair2, [2 * 8 + 3, 2 * 8 + 4]).map((d) => d.type)).toEqual([]);
    const sq = parseLevel(['#######', '#-----#', '#-$$--#', '#-$$-@#', '#-....#', '#######']);
    expect(detectAll(sq, sq.start.boxes).map((d) => d.type)).toEqual(['square', 'square', 'square', 'square']);
  });

  for (const L of levels) {
    if (BIG.has(L.id) && !FULL) continue;
    it(`${L.id}: zero false positives (G6) and detectDeadlock agrees with detectAll`, () => {
      const l = parseLevel(L.map);
      const g = exploreGraph(l)!;
      for (let i = 0; i < g.n; i += 1) {
        const st = g.stateAt(i);
        const all = detectAll(l, st.boxes);
        const first = detectDeadlock(l, st.boxes);
        expect(!!first).toBe(all.length > 0);
        if (all.length) expect(g.togoAt(i)).toBe(-1);
        if (first && (first.type === 'corner' || first.type === 'wall')) expect(all).toContainEqual({ cell: first.cells[0], type: first.type });
        if (onDeadSquare(l, st.boxes)) expect(g.togo(st)).toBe(-1);
      }
    }, 60_000);
  }
});

describe('state graph and solvers', () => {
  for (const L of levels) {
    const big = BIG.has(L.id);
    const run = big && !FULL ? it.skip : it;
    run(`${L.id}: togo(start) = ${L.opt.pushes}; A* agrees; ref replays`, async () => {
      const l = parseLevel(L.map);
      const g = await StateGraph.build(l, { maxStates: 200000, maxMs: 60000 });
      expect(g).not.toBeNull();
      expect(g!.startTogo).toBe(L.opt.pushes);
      expect(g!.togo(l.start)).toBe(L.opt.pushes);
      if (big) expect(g!.bytes).toBeLessThan(15 * 1024 * 1024);
      const r = replayLurd(l, L.ref);
      expect([r.ok, r.solved, r.pushes, r.moves]).toEqual([true, true, L.opt.pushes, L.opt.moves]);
      const a = solvePushOptimal(l, l.start, { nodes: 200000, ms: 30000 });
      expect('pushes' in a && a.pushes.length).toBe(L.opt.pushes);
      // following nextPush from the start reaches the goal in exactly opt pushes
      let s: { player: number; boxes: Uint16Array } = { player: l.start.player, boxes: Uint16Array.from(l.start.boxes) };
      for (let k = 0; k < L.opt.pushes; k += 1) {
        const h = nextPush(l, s, { graph: g });
        expect(h && 'push' in h).toBe(true);
        if (!h || !('push' in h)) break;
        s = { player: h.push.from, boxes: applyPush(l, s.boxes, h.push) };
      }
      expect(g!.togo(s)).toBe(0);
    }, 120_000);
  }

  for (const L of levels) {
    if (BIG.has(L.id)) continue;
    it(`${L.id}: exact solver reproduces the reference line`, () => {
      const l = parseLevel(L.map);
      const o = solveOptimal(l, 'push');
      expect(o && [o.pushes, o.moves, o.lurd]).toEqual([L.opt.pushes, L.opt.moves, L.ref]);
    }, 60_000);
  }

  it('hints from random detours: every nextPush lowers togo by exactly one (spec §8.10 hint.test)', () => {
    let seed = 12345;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let checked = 0;
    for (const L of levels.filter((x) => !BIG.has(x.id))) {
      const l = parseLevel(L.map);
      const g = StateGraph.buildSync(l, { maxStates: 200000, maxMs: 1e9 })!;
      for (let k = 0; k < 6; k += 1) {
        let s: { player: number; boxes: Uint16Array } = { player: l.start.player, boxes: Uint16Array.from(l.start.boxes) };
        const depth = 1 + Math.floor(rnd() * 6);
        for (let d = 0; d < depth; d += 1) {
          // a solved state is terminal (the game locks input at the win): never push past it
          if (g.togo(s) === 0) break;
          const { pushes } = legalPushes(l, s);
          if (!pushes.length) break;
          const p = pushes[Math.floor(rnd() * pushes.length)];
          s = { player: p.from, boxes: applyPush(l, s.boxes, p) };
        }
        let t = g.togo(s);
        if (t < 0) {
          expect(nextPush(l, s, { graph: g })).toEqual({ rewind: true });
          continue;
        }
        while (t > 0) {
          const h = nextPush(l, s, { graph: g });
          expect(h && 'push' in h).toBe(true);
          if (!h || !('push' in h)) break;
          s = { player: h.push.from, boxes: applyPush(l, s.boxes, h.push) };
          const t2 = g.togo(s);
          expect(t2).toBe(t - 1);
          t = t2;
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('graph build honours the state cap and abort', async () => {
    const l = parseLevel(levels.find((x) => x.id === '2-5')!.map);
    expect(StateGraph.buildSync(l, { maxStates: 10, maxMs: 1e9 })).toBeNull();
    const ac = new AbortController();
    ac.abort();
    expect(await StateGraph.build(l, { maxStates: 1e6, maxMs: 1e9, signal: ac.signal, yieldEvery: 1 })).toBeNull();
  });

  it('A* proves a dead state dead and stops on budget', () => {
    const l = parseLevel(levels.find((x) => x.id === '0-3')!.map);
    const { pushes } = legalPushes(l, l.start);
    const up = pushes.find((p) => p.dir === 0)!; // pushing the crate into the top-left corner
    const dead = { player: up.from, boxes: applyPush(l, l.start.boxes, up) };
    expect(solvePushOptimal(l, dead, { nodes: 1000, ms: 1000 })).toMatchObject({ dead: true });
    const big = parseLevel(levels.find((x) => x.id === '2-7')!.map);
    expect(solvePushOptimal(big, big.start, { nodes: 2, ms: 1000 })).toMatchObject({ unknown: true });
  });
});

describe('twins (G7) and symmetry', () => {
  it('mirror∘mirror and flip∘flip are identities', () => {
    for (const L of levels) {
      const pad = (rows: string[]) => rows.map((r) => r.replace(/\s+$/, ''));
      expect(pad(mirrorRows(mirrorRows(L.map)))).toEqual(pad(L.map.map((r) => r)));
      expect(flipRows(flipRows(L.map))).toEqual(L.map);
    }
  });
  it('twinOf picks a different puzzle; symmetric boards use flip', () => {
    for (const L of levels) {
      const t = twinOf(L.map)!;
      expect(t, L.id).not.toBeNull();
      expect(t.kind, L.id).toBe(L.twin);
      const a = parseLevel(L.map);
      const b = parseLevel(t.rows);
      expect(b.nBoxes).toBe(a.nBoxes);
    }
    const flips = levels.filter((L) => L.twin !== 'mirror').map((L) => L.id).sort();
    expect(flips).toEqual(['2-2', '2-8', 'C10', 'C3'].filter((id) => levels.some((L) => L.id === id)).sort());
  });
  it('canonical hash is symmetry invariant', () => {
    const m = levels.find((x) => x.id === '2-5')!.map;
    const h = canonicalHash(m);
    expect(canonicalHash(mirrorRows(m))).toBe(h);
    expect(canonicalHash(rot180Rows(m))).toBe(h);
    expect(canonicalHash(levels.find((x) => x.id === '2-6')!.map)).not.toBe(h);
  });
});
