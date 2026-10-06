/**
 * Director: turns one move's engine events (st.log, spec §8.3 "StepRecord" in event form) into a
 * timeline of sprite tweens, cell-layer changes, particles, sounds and callouts (spec §6.10/§6.11).
 * The engine has already computed the final state; the director only replays it, so rotation,
 * backgrounding and fast-forward are all safe (the scene is re-synced afterwards).
 */
import { BOMB, ORB, PIECE, PROP, RH, RV, type Ev } from '../core/types';
import { GEMS } from './art/palette';
import type { BoardCanvas } from './board-canvas';
import type { Fx } from './fx';
import type { Scene, Sprite } from './scene';
import { ease, type Timeline } from './timeline';

export interface GoalTrack { kind: 'collect' | 'dust' | 'crate' | 'ice' | 'goo' | 'pod' | 'energy'; color?: number; shown: number; final: number }
export interface Hooks {
  sfx(name: string, o?: { rate?: number; gain?: number }): void;
  chime(step: number): void;
  coin(goal: number, n: number): void;
  shake(amp: number, ms: number): void;
  callout(text: string, kind: 'chain' | 'combo' | 'info', big?: boolean): void;
  goalArrive(goal: number): void;
  goalTarget(goal: number): { x: number; y: number } | null;
  mood(m: 'happy' | 'celebrating' | 'surprised'): void;
  energy(v: number): void;
}
export interface DirectCtx {
  scene: Scene; board: BoardCanvas; fx: Fx; tl: Timeline; hooks: Hooks;
  panelX: number; panelY: number;
  goals: GoalTrack[];
  energy0: number; energy1: number;
  lessFx: boolean;
}
export const COMBO_NAMES: Record<string, string> = { RR: '十字火箭', RB: '星爆火箭', BB: '大星爆', PP: '无人机编队', 'P+': '无人机快递', OR: '火箭雨', OB: '满屏开花', OP: '无人机大队', OO: '全屏清空' };

interface Blast { idx: number; k: number | string; at: number; start: number; hit: Map<number, number>; arrive: Map<number, number> }

const FLIGHT_CAP = 36;

export function direct(ev: Ev[], ctx: DirectCtx, t0 = 0): number {
  const { scene, board, fx, tl, hooks } = ctx;
  const W = scene.W;
  const cellPx = board.cell;
  const vx = (i: number) => ctx.panelX + board.cx(i % W);
  const vy = (i: number) => ctx.panelY + board.cy(Math.floor(i / W));
  const spriteOf = (uid: number): Sprite | undefined => scene.sprites.get(uid);
  const uidAt = new Map<number, number>(); // cell -> uid currently standing there (tracked through the replay)
  for (const s of scene.sprites.values()) uidAt.set(Math.round(s.y) * W + Math.round(s.x), s.uid);
  let flights = 0;
  let t = t0;
  let lastLand = -1e9;
  const coinCount = new Map<number, number>();

  // ---------------------------------------------------------------- helpers
  const pop = (s: Sprite, at: number, dur: number, shardsCol: string | null, size = 10) => {
    tl.tween(at, dur, (p) => { s.sx = s.sy = (1 - p) * (s.sx > 1 ? 1.18 : 1); s.alpha = 1 - p * 0.3; }, ease.inQuad);
    tl.at(at + dur, () => { s.alpha = 0; scene.sprites.delete(s.uid); });
    if (shardsCol) tl.at(at + 30, () => { const i = Math.round(s.y) * W + Math.round(s.x); fx.shards(vx(i), vy(i), shardsCol, size); fx.sparks(vx(i), vy(i), '#ffffff', 4, 0.6); });
  };
  const goalFor = (e: Ev): number => {
    const gs = ctx.goals;
    if (e.e === 'clear') return gs.findIndex((g) => g.kind === 'collect' && g.color === e.col && g.shown > g.final);
    if (e.e === 'dust') return gs.findIndex((g) => g.kind === 'dust' && g.shown > g.final);
    if (e.e === 'crate' && e.left === 0) return gs.findIndex((g) => g.kind === 'crate' && g.shown > g.final);
    if (e.e === 'ice' && e.left === 0) return gs.findIndex((g) => g.kind === 'ice' && g.shown > g.final);
    if (e.e === 'goo') return gs.findIndex((g) => g.kind === 'goo' && g.shown > g.final);
    return -1;
  };
  const flyToGoal = (e: Ev, cell: number, at: number, key: string) => {
    const g = goalFor(e);
    if (g < 0) return;
    ctx.goals[g].shown -= 1; // reserved now, shown on arrival
    if (flights >= FLIGHT_CAP) { tl.at(at + 500, () => hooks.goalArrive(g)); return; }
    flights += 1;
    tl.at(at, () => {
      const target = hooks.goalTarget(g);
      if (!target) { hooks.goalArrive(g); return; }
      const x0 = vx(cell), y0 = vy(cell);
      const dist = Math.hypot(target.x - x0, target.y - y0);
      const life = (ctx.lessFx ? 0.6 : 1) * Math.min(600, 400 + dist * 0.25);
      const cxm = (x0 + target.x) / 2 + (Math.random() - 0.5) * 120, cym = Math.min(y0, target.y) - 80 - Math.random() * 60;
      fx.fly(key, cellPx * 0.86, life, (p) => {
        const q = 1 - p;
        return { x: q * q * x0 + 2 * q * p * cxm + p * p * target.x, y: q * q * y0 + 2 * q * p * cym + p * p * target.y, s: cellPx * (0.86 - 0.36 * p) };
      }, { ease: ease.inCubic, onEnd: () => {
        hooks.goalArrive(g);
        const n = (coinCount.get(g) ?? 0); coinCount.set(g, n + 1); hooks.coin(g, n);
        fx.sparks(target.x, target.y, '#FFE9A8', 5, 0.5, 0);
      } });
    });
  };
  const hitVisual = (e: Ev, at: number, fromMatch: boolean, converge: { cell: number; at: number } | null) => {
    switch (e.e) {
      case 'clear': {
        const s = e.uid ? spriteOf(e.uid) : undefined;
        uidAt.delete(e.i);
        const col = GEMS[e.col]?.base ?? '#fff';
        if (s) {
          if (converge) {
            const tx = converge.cell % W, ty = Math.floor(converge.cell / W), x0 = s.x, y0 = s.y;
            tl.tween(converge.at, 140, (p) => { s.x = x0 + (tx - x0) * p; s.y = y0 + (ty - y0) * p; s.sx = s.sy = 1.18 - 0.4 * p; }, ease.inQuad);
            tl.at(converge.at + 140, () => { s.alpha = 0; scene.sprites.delete(s.uid); });
          } else {
            if (!fromMatch) tl.tween(at - 50, 50, (p) => { s.flash = p; s.sx = s.sy = 1 + 0.15 * p; }, ease.outQuad);
            pop(s, at, 120, col, 10);
          }
        }
        flyToGoal(e, e.i, at + 40, `gem${e.col}`);
        break;
      }
      case 'ice': {
        tl.at(at, () => {
          scene.ice[e.i] = e.left;
          fx.shards(vx(e.i), vy(e.i), '#C8F4FF', e.left ? 4 : 10, 0.8);
          hooks.sfx(e.left ? 'em-ice-crack' : 'em-ice-break');
        });
        tl.tween(at, 160, (p) => { scene.iceShake[e.i] = Math.sin(p * Math.PI * 4) * 3 * (1 - p); });
        if (!e.left) {
          const u = uidAt.get(e.i); const s = u ? spriteOf(u) : undefined;
          if (s) tl.tween(at, 120, (p) => { s.sx = s.sy = 1 + 0.1 * Math.sin(p * Math.PI); s.flash = 0; });
        } else {
          const u = uidAt.get(e.i); const s = u ? spriteOf(u) : undefined;
          if (s && fromMatch) tl.tween(at, 120, (p) => { s.sx = s.sy = 1.18 - 0.18 * p; s.flash = 1 - p; });
        }
        if (fromMatch && !e.left) { const u = uidAt.get(e.i); const s = u ? spriteOf(u) : undefined; if (s) tl.tween(at, 120, (p) => { s.flash = 1 - p; }); }
        flyToGoal(e, e.i, at + 40, 'ice1');
        break;
      }
      case 'crate': {
        tl.at(at, () => {
          if (e.left === 0) {
            const paper = scene.crateDent[e.i] === 0 && (scene.crate[e.i] || 1) === 1;
            scene.crate[e.i] = 0;
            fx.debris(vx(e.i), vy(e.i), paper ? ['#D9A45B', '#EBD39A', '#B07C3A'] : ['#8C9DB5', '#C3CEDD', '#5E6E86'], 7);
            hooks.sfx('em-crate-break');
          } else {
            scene.crate[e.i] = e.left; scene.crateDent[e.i] = 1;
            fx.debris(vx(e.i), vy(e.i), ['#C3CEDD', '#8C9DB5'], 3);
            hooks.sfx(e.left >= 2 ? 'em-crate-metal' : 'em-crate-metal');
          }
        });
        if (e.left) tl.tween(at, 180, (p) => { scene.crateScale[e.i] = 1 - 0.12 * Math.sin(p * Math.PI); });
        flyToGoal(e, e.i, at + 60, 'crate1');
        break;
      }
      case 'dust': {
        tl.at(at, () => {
          scene.dust[e.i] = e.left; scene.dustFade[e.i] = 1;
          fx.sparks(vx(e.i), vy(e.i), e.left ? '#D8CCF5' : '#FFF6D8', 12, 0.5, 60);
          if (!e.left) fx.flashAt(vx(e.i), vy(e.i), cellPx * 0.6, 'rgba(255,250,220,.7)', 260);
          hooks.sfx('em-dust');
        });
        tl.tween(at, 200, (p) => { scene.dustFade[e.i] = 1 - p; });
        flyToGoal(e, e.i, at + 40, 'mote');
        break;
      }
      case 'goo': {
        tl.at(at, () => { scene.goo[e.i] = 0; fx.shards(vx(e.i), vy(e.i), '#4A2A6A', 10); });
        flyToGoal(e, e.i, at + 40, 'goo0');
        break;
      }
      default: break;
    }
  };

  // ---------------------------------------------------------------- the move itself
  let k = 0;
  const fireUid = new Map<number, number>(); // cell -> uid of a special that fires from there
  let combo: { a: number; b: number; ua: number; ub: number } | null = null;
  let anticipation = 0;
  while (k < ev.length && ev[k].e !== 'step') {
    const e = ev[k++];
    if (e.e === 'swap') {
      const ua = uidAt.get(e.a), ub = uidAt.get(e.b);
      const sa = ua ? spriteOf(ua) : undefined, sb = ub ? spriteOf(ub) : undefined;
      const ax = e.a % W, ay = Math.floor(e.a / W), bx = e.b % W, by = Math.floor(e.b / W);
      if (sa) { sa.z = 2; tl.tween(t, 160, (p) => { sa.x = ax + (bx - ax) * p; sa.y = ay + (by - ay) * p; }, ease.inOutQuad); }
      if (sb) tl.tween(t, 160, (p) => { sb.x = bx + (ax - bx) * p; sb.y = by + (ay - by) * p; }, ease.inOutQuad);
      for (const s of [sa, sb]) if (s) tl.tween(t + 160, 160, (p) => { const q = Math.sin(p * Math.PI) * (1 - p * 0.4); s.sx = 1 + 0.08 * q; s.sy = 1 - 0.08 * q; }, ease.linear);
      if (ua) uidAt.set(e.b, ua); else uidAt.delete(e.b);
      if (ub) uidAt.set(e.a, ub); else uidAt.delete(e.a);
      tl.at(t, () => hooks.sfx('em-swap'));
      t += 160;
    } else if (e.e === 'combo') {
      combo = { a: e.a, b: e.b, ua: e.ua, ub: e.ub };
      const sa = spriteOf(e.ua), sb = spriteOf(e.ub);
      const ax = e.a % W, ay = Math.floor(e.a / W), bx = e.b % W, by = Math.floor(e.b / W);
      if (sa) { sa.z = 3; tl.tween(t, 160, (p) => { sa.x = ax + (bx - ax) * p; sa.y = ay + (by - ay) * p; sa.sx = sa.sy = 1 + 0.25 * p; }, ease.inOutQuad); }
      if (sb) tl.tween(t, 160, (p) => { sb.sx = sb.sy = 1 + 0.25 * p; sb.rot = Math.sin(p * Math.PI * 4) * 0.12; }, ease.linear);
      tl.at(t, () => hooks.sfx('em-swap'));
      uidAt.delete(e.a); uidAt.delete(e.b);
      fireUid.set(e.b, e.ua);
      t += 170;
    } else if (e.e === 'tap') {
      const u = uidAt.get(e.a); const s = u ? spriteOf(u) : undefined;
      if (s) tl.tween(t, 90, (p) => { s.sx = s.sy = 1 + 0.3 * p; s.flash = p * 0.8; }, ease.outQuad);
      anticipation = 90;
    } else if (e.e === 'fire') {
      fireUid.set(e.i, e.uid); uidAt.delete(e.i);
    } else if (e.e === 'booster') {
      if (e.t === 'tractor') tl.at(t, () => hooks.sfx('em-tractor'));
      else if (e.t === 'drill') {
        tl.at(t, () => { hooks.sfx('em-drill'); fx.beam(vx(e.a), ctx.panelY - 30, vx(e.a), vy(e.a), 'rgba(255,90,120,.9)', cellPx * 0.22, 380); });
        anticipation = 200;
      } else {
        tl.at(t, () => hooks.sfx('em-ion'));
        anticipation = 150;
      }
    } else if (e.e === 'dust') {
      // dust under a special that left its cell (takeSpecial → hitFloor)
      hitVisual(e, t + anticipation, false, null);
    }
  }
  t += anticipation;

  // ---------------------------------------------------------------- cascade steps
  let step = 0;
  const blasts = new Map<number, Blast>();
  while (k < ev.length) {
    const head = ev[k];
    if (head.e !== 'step') {
      // post-move rules: goo spread, shuffle, gift
      k += 1;
      if (head.e === 'gooSpread') {
        const s = head.uid ? spriteOf(head.uid) : undefined;
        if (s) pop(s, t, 220, null);
        tl.at(t + 120, () => { scene.goo[head.i] = 1; });
        t += 380;
      } else if (head.e === 'shuffle') {
        const cells = head.cells as { i: number; uid: number; col: number }[];
        const cxm = (W - 1) / 2, cym = (scene.H - 1) / 2;
        tl.at(t, () => { hooks.sfx('shuffle'); hooks.callout('洗一洗', 'info'); });
        for (const c of cells) {
          const s = spriteOf(c.uid); if (!s) continue;
          const x0 = c.i % W, y0 = Math.floor(c.i / W);
          tl.tween(t, 250, (p) => { s.x = x0 + (cxm - x0) * p * 0.85; s.y = y0 + (cym - y0) * p * 0.85; s.rot = p * 3; s.sx = s.sy = 1 - 0.3 * p; }, ease.inBack);
          tl.at(t + 250, () => { s.color = c.col; });
          tl.tween(t + 250, 350, (p) => { s.x = cxm * 0.85 + (x0 - cxm * 0.85) * p + x0 * 0.15 * (1 - p); s.y = cym * 0.85 + (y0 - cym * 0.85) * p + y0 * 0.15 * (1 - p); s.rot = 3 * (1 - p); s.sx = s.sy = 0.7 + 0.3 * p; }, ease.outBack);
        }
        t += 620;
      } else if (head.e === 'gift') {
        const s = head.uid ? spriteOf(head.uid) : undefined;
        tl.at(t, () => { if (s) { s.kind = RH; s.color = -1; } hooks.callout('送你一个火箭', 'info'); hooks.sfx('em-special-make'); fx.ring(vx(head.i), vy(head.i), cellPx * 0.9, 'rgba(255,240,190,.9)', 320); });
        if (s) tl.tween(t, 260, (p) => { s.sx = s.sy = p * 1.0 + 0.25 * Math.sin(p * Math.PI); }, ease.outBack);
        t += 300;
      }
      continue;
    }
    k += 1;
    const sp = step >= 4 ? Math.max(0.5, 0.85 ** (step - 3)) : 1;
    const T0 = t;
    const ANT = 90 * sp;
    const block: Ev[] = [];
    while (k < ev.length && ev[k].e !== 'step' && !['gooSpread', 'shuffle', 'gift'].includes(ev[k].e)) block.push(ev[k++]);
    // matches
    const groups = block.filter((e) => e.e === 'match');
    const creates = block.filter((e) => e.e === 'create');
    const groupOfCell = new Map<number, number>();
    for (const g of groups) for (const c of g.cells as number[]) groupOfCell.set(c, g.g);
    const createOf = new Map<number, Ev>(); for (const c of creates) createOf.set(c.g, c);
    if (groups.length) {
      const round = step + 1;
      tl.at(T0, () => {
        hooks.sfx('match-clear', { rate: 1 + 0.04 * step });
        hooks.chime(step);
        if (round >= 3) { hooks.callout(`连锁 ${round}`, 'chain', round >= 5); if (round >= 5) hooks.shake(4, 200); }
      });
      for (const g of groups) for (const c of g.cells as number[]) {
        const u = uidAt.get(c); const s = u ? spriteOf(u) : undefined;
        if (s) tl.tween(T0, ANT, (p) => { s.sx = s.sy = 1 + 0.18 * p; s.flash = p; }, ease.outQuad);
      }
    }
    let end = T0 + (groups.length ? ANT + 120 * sp : 0);
    // walk the block: match hits, then blasts with their hits, then creations, then settle
    let mode: 'match' | 'blast' = 'match';
    let cur: Blast | null = null;
    const pendingFly: Ev[] = [];
    const pendingConv: Ev[] = [];
    let settleAt = -1;
    for (let b = 0; b < block.length; b += 1) {
      const e = block[b];
      if (e.e === 'match') continue;
      if (e.e === 'settle') { settleAt = b; break; }
      if (e.e === 'fly') { pendingFly.push(e); continue; }
      if (e.e === 'convert') { pendingConv.push(e); continue; }
      if (e.e === 'blast') {
        mode = 'blast';
        const start = blastStart(e, blasts, T0, sp);
        cur = { idx: e.idx, k: e.k, at: e.at, start, hit: new Map(), arrive: new Map() };
        blasts.set(e.idx, cur);
        const fin = scheduleBlast(e, cur, pendingFly.splice(0), pendingConv.splice(0), sp);
        end = Math.max(end, fin);
        continue;
      }
      if (e.e === 'fire') { fireUid.set(e.i, e.uid); uidAt.delete(e.i); hideFiring(e.i, cur ? (cur.hit.get(e.i) ?? cur.start + 60) : T0 + ANT); continue; }
      if (e.e === 'chain') continue;
      if (e.e === 'create') continue;
      if (mode === 'match') {
        const g = groupOfCell.get(e.i);
        const cr = g !== undefined ? createOf.get(g) : undefined;
        const at = T0 + ANT;
        hitVisual(e, at, true, cr && e.e === 'clear' ? { cell: cr.i, at: T0 + ANT } : null);
      } else if (cur) {
        const at = cur.hit.get(e.i) ?? cur.start + 100 * sp;
        hitVisual(e, at, false, null);
        end = Math.max(end, at + 120 * sp);
      }
    }
    // creations: the new special pops where the group converged
    for (const c of creates) {
      const at = T0 + ANT + 140 * sp;
      const x = c.i % W, y = Math.floor(c.i / W);
      const s: Sprite = { uid: c.uid, kind: c.k, color: -1, x, y, sx: 0, sy: 0, rot: 0, alpha: 0, flash: 0, z: 1, phase: (c.uid * 7) % 13 };
      uidAt.set(c.i, c.uid);
      tl.at(at, () => { s.alpha = 1; scene.sprites.set(s.uid, s); fx.ring(vx(c.i), vy(c.i), cellPx * 0.95, 'rgba(255,244,200,.95)', 320, 5); fx.sparks(vx(c.i), vy(c.i), '#FFF3C4', 10, 0.7); hooks.sfx('em-special-make'); hooks.mood('happy'); });
      tl.tween(at, 260 * sp, (p) => { s.sx = s.sy = p < 0.6 ? (p / 0.6) * 1.25 : 1.25 - 0.25 * ((p - 0.6) / 0.4); }, ease.outQuad);
      end = Math.max(end, at + 260 * sp);
    }
    // settle: falls, spawns, slides
    if (settleAt >= 0) {
      const mv = block.slice(settleAt + 1);
      const paths = new Map<number, { x: number; y: number; diag: boolean }[]>();
      const spawnN = new Map<number, number>();
      const fresh = new Map<number, Sprite>();
      for (const e of mv) {
        if (e.e === 'spawn') {
          const n = (spawnN.get(e.i) ?? 0) + 1; spawnN.set(e.i, n);
          const x = e.i % W, y = Math.floor(e.i / W);
          const s: Sprite = { uid: e.uid, kind: e.pod ? 8 : PIECE, color: e.pod ? -1 : e.col, x, y: y - n, sx: 1, sy: 1, rot: 0, alpha: 1, flash: 0, z: 0, phase: (e.uid * 7) % 13 };
          fresh.set(e.uid, s);
          paths.set(e.uid, [{ x, y: y - n, diag: false }, { x, y, diag: false }]);
          uidAt.set(e.i, e.uid);
          if (e.i >= W) tl.at(end + (n - 1) * 60, () => { scene.gate[e.i] = 1; }), tl.tween(end + (n - 1) * 60, 300, (p) => { scene.gate[e.i] = 1 - p; });
        } else if (e.e === 'fall' || e.e === 'slide') {
          const s = spriteOf(e.uid) ?? fresh.get(e.uid);
          if (!s) continue;
          let p = paths.get(e.uid);
          if (!p) { p = [{ x: e.from % W, y: Math.floor(e.from / W), diag: false }]; paths.set(e.uid, p); }
          p.push({ x: e.to % W, y: Math.floor(e.to / W), diag: e.e === 'slide' });
          if (uidAt.get(e.from) === e.uid) uidAt.delete(e.from);
          uidAt.set(e.to, e.uid);
        } else if (e.e === 'deliver') {
          const s = spriteOf(e.uid);
          if (s) pop(s, end + 200, 300, null);
          uidAt.delete(e.i);
        }
      }
      const g = 9000; // px/s² (spec §6.10)
      const segT = (rows: number) => 1000 * Math.sqrt((2 * Math.abs(rows) * cellPx) / g) * sp;
      // bottom-most movers start first; each one higher up in the same column waits 18 ms more
      const order = [...paths.entries()].sort((a, b) => b[1][b[1].length - 1].y - a[1][a[1].length - 1].y);
      const colCount = new Map<number, number>();
      let settleEnd = end;
      for (const [uid, path] of order) {
        const s = spriteOf(uid) ?? fresh.get(uid)!;
        const col = path[path.length - 1].x;
        const n = colCount.get(col) ?? 0; colCount.set(col, n + 1);
        let at = end + n * 18 * sp;
        if (fresh.has(uid)) tl.at(at, () => { if (!scene.sprites.has(uid)) scene.sprites.set(uid, s); });
        // merge consecutive vertical segments
        const pts = [path[0]];
        for (let q = 1; q < path.length; q += 1) {
          const last = pts[pts.length - 1];
          if (!path[q].diag && pts.length > 1 && !last.diag && last.x === path[q].x && pts[pts.length - 2].x === last.x) pts[pts.length - 1] = path[q];
          else pts.push(path[q]);
        }
        for (let q = 1; q < pts.length; q += 1) {
          const a = pts[q - 1], b = pts[q];
          const dur = b.diag ? 160 * sp : segT(b.y - a.y);
          tl.tween(at, dur, (p) => { s.x = a.x + (b.x - a.x) * p; s.y = a.y + (b.y - a.y) * p; }, b.diag ? ease.inOutQuad : ease.inQuad);
          at += dur;
        }
        // landing squash
        const land = at;
        tl.tween(land, 70 * sp, (p) => { s.sy = 1 - 0.14 * p; s.sx = 1 + 0.1 * p; }, ease.outQuad);
        tl.tween(land + 70 * sp, 140 * sp, (p) => { s.sy = 0.86 + 0.14 * p; s.sx = 1.1 - 0.1 * p; }, ease.outBack);
        if (land - lastLand > 60) { lastLand = land; tl.at(land, () => hooks.sfx('em-land', { gain: 0.5 })); }
        settleEnd = Math.max(settleEnd, land + 120 * sp);
      }
      end = settleEnd;
    }
    // energy ring follows the move
    tl.at(end, () => hooks.energy(ctx.energy1));
    t = end - 40 * sp;
    step += 1;
  }
  return Math.max(t, t0);

  // ---------------------------------------------------------------- blast timing + visuals
  function hideFiring(cell: number, at: number) {
    const u = fireUid.get(cell); if (!u) return;
    const s = spriteOf(u); if (!s) return;
    fireUid.delete(cell);
    tl.tween(at - 60, 60, (p) => { s.sx = s.sy = 1 + 0.3 * p; s.flash = p; }, ease.outQuad);
    tl.at(at, () => { s.alpha = 0; scene.sprites.delete(u); fx.flashAt(vx(cell), vy(cell), cellPx * 0.9, 'rgba(255,255,230,.9)', 200); });
  }
  function blastStart(e: Ev, all: Map<number, Blast>, T0: number, sp: number): number {
    const trig = e.trig as { blast?: number; flight?: number; match?: number } | null;
    if (!trig) return T0;
    if (trig.blast !== undefined) { const p = all.get(trig.blast); return p ? (p.hit.get(e.at) ?? p.start + 120 * sp) + 30 * sp : T0; }
    if (trig.flight !== undefined) { const p = all.get(trig.flight); return p ? (p.arrive.get(e.at) ?? p.start + 570 * sp) : T0; }
    return T0;
  }
  function scheduleBlast(e: Ev, b: Blast, flys: Ev[], convs: Ev[], sp: number): number {
    const at = e.at as number, ax = at % W, ay = Math.floor(at / W);
    const cells = e.cells as number[];
    const start = b.start;
    const perCell = (cellPx / 2.2) * sp; // 2200 px/s
    const kk = e.k;
    const isRocket = kk === RH || kk === RV || kk === 'RR' || kk === 'RB' || kk === 'ionH' || kk === 'ionV';
    // the special leaves its cell as it fires (tap / swap / chain / combo)
    if (!e.carried) {
      if (combo && at === combo.b && (kk === 'RR' || kk === 'RB' || kk === 'BB' || kk === 'PP' || kk === 'P+' || kk === 'OO' || kk === 'OR' || kk === 'OB' || kk === 'OP')) {
        for (const u of [combo.ua, combo.ub]) { const s = spriteOf(u); if (s) { tl.at(start, () => { s.alpha = 0; scene.sprites.delete(u); }); } }
        combo = null;
      } else hideFiring(at, start);
    }
    if (typeof kk === 'string' && COMBO_NAMES[kk]) tl.at(start, () => { hooks.callout(COMBO_NAMES[kk], 'combo', true); hooks.sfx('em-combo'); hooks.mood('celebrating'); });
    let fin = start + 200 * sp;
    const setHit = (c: number, t: number) => { if (!b.hit.has(c) || b.hit.get(c)! > t) b.hit.set(c, t); fin = Math.max(fin, t + 120 * sp); };
    const cx = vx(at), cy = vy(at);
    if (isRocket) {
      const rows = new Set<number>(), cols = new Set<number>();
      if (kk === RH || kk === 'ionH') rows.add(ay);
      else if (kk === RV || kk === 'ionV') cols.add(ax);
      else if (kk === 'RR') { rows.add(ay); cols.add(ax); }
      else { for (let d = -1; d <= 1; d += 1) { if (ay + d >= 0 && ay + d < scene.H) rows.add(ay + d); if (ax + d >= 0 && ax + d < W) cols.add(ax + d); } }
      const launch = start + (kk === 'ionH' || kk === 'ionV' ? 0 : 60 * sp);
      for (const c of cells) {
        const r = Math.floor(c / W), q = c % W;
        let dist = 99;
        if (rows.has(r)) dist = Math.min(dist, Math.abs(q - ax));
        if (cols.has(q)) dist = Math.min(dist, Math.abs(r - ay));
        if (dist === 99) dist = Math.max(Math.abs(q - ax), Math.abs(r - ay));
        setHit(c, launch + dist * perCell);
      }
      const big = kk === 'RR' || kk === 'RB' ? 1.35 : 1;
      const thick = kk === 'RB' ? 3 : 1;
      tl.at(start, () => {
        hooks.sfx(kk === 'ionH' || kk === 'ionV' ? 'em-ion' : 'em-rocket');
        const L = ctx.panelX, T = ctx.panelY, R = L + board.rim * 2 + W * cellPx, B = T + board.rim * 2 + scene.H * cellPx;
        for (const r of rows) {
          const y = ctx.panelY + board.cy(r);
          fx.beam(L + 6, y, R - 6, y, kk === 'ionH' ? 'rgba(120,220,255,.85)' : 'rgba(255,214,120,.75)', cellPx * 0.3 * (thick > 1 ? 1.4 : 1), 360);
          if (kk !== 'ionH') for (const dir of [-1, 1]) {
            const x0 = cx, x1 = dir < 0 ? L - cellPx : R + cellPx;
            const life = Math.abs(x1 - x0) / (cellPx / perCell);
            fx.fly('rh-1', cellPx * 0.9 * big, life, (p) => ({ x: x0 + (x1 - x0) * p, y, rot: dir < 0 ? Math.PI : 0 }), { trail: '#FF9A3C' });
          }
        }
        for (const q of cols) {
          const x = ctx.panelX + board.cx(q);
          fx.beam(x, T + 6, x, B - 6, kk === 'ionV' ? 'rgba(120,220,255,.85)' : 'rgba(255,214,120,.75)', cellPx * 0.3 * (thick > 1 ? 1.4 : 1), 360);
          if (kk !== 'ionV') for (const dir of [-1, 1]) {
            const y0 = cy, y1 = dir < 0 ? T - cellPx : B + cellPx;
            const life = Math.abs(y1 - y0) / (cellPx / perCell);
            fx.fly('rh-1', cellPx * 0.9 * big, life, (p) => ({ x, y: y0 + (y1 - y0) * p, rot: dir < 0 ? -Math.PI / 2 : Math.PI / 2 }), { trail: '#FF9A3C' });
          }
        }
        if (kk === 'RR' || kk === 'RB') { hooks.shake(6, 240); fx.flashAt(cx, cy, cellPx * 1.6, 'rgba(255,240,200,.95)', 300); }
      });
    } else if (kk === BOMB || kk === 'BB') {
      const R = kk === 'BB' ? 3.5 : 2.5, ring = (kk === 'BB' ? 320 : 260) * sp, pre = 80 * sp;
      for (const c of cells) {
        const d = Math.hypot(c % W - ax, Math.floor(c / W) - ay);
        setHit(c, start + pre + (d / R) * ring);
      }
      tl.at(start + pre, () => {
        hooks.sfx('em-bomb');
        fx.flashAt(cx, cy, cellPx * R * 0.9, 'rgba(255,236,190,.95)', 300);
        fx.ring(cx, cy, cellPx * R, 'rgba(255,255,255,.95)', ring + 80, 10);
        fx.ring(cx, cy, cellPx * R * 0.7, 'rgba(255,190,90,.85)', ring, 16);
        fx.sparks(cx, cy, '#FFD36B', 26, 1.4, 200);
        hooks.shake(kk === 'BB' ? 10 : 6, kk === 'BB' ? 320 : 220);
      });
    } else if (kk === PROP || kk === 'PP' || kk === 'P+') {
      const cross = new Set([at, at - W, at + W, ...(ax > 0 ? [at - 1] : []), ...(ax < W - 1 ? [at + 1] : [])]);
      for (const c of cells) if (cross.has(c)) setHit(c, start + 120 * sp);
      tl.at(start, () => { hooks.sfx('em-drone'); fx.ring(cx, cy, cellPx * 1.5, 'rgba(160,240,255,.9)', 260, 5); });
      flys.forEach((f, n) => {
        const to = f.to as number, tx = vx(to), ty = vy(to);
        const dep = start + (120 + n * 70) * sp, life = 450 * sp, arrive = dep + life;
        b.arrive.set(to, arrive);
        if (!f.carry) setHit(to, arrive);
        else fin = Math.max(fin, arrive);
        const mx = (cx + tx) / 2 + (ty - cy) * 0.25, my = (cy + ty) / 2 - cellPx * (1.4 + n * 0.3);
        const carryKey = f.carry === RH ? 'rh-1' : f.carry === RV ? 'rv-1' : f.carry === BOMB ? 'bomb0' : f.carry === ORB ? 'orb0' : f.carry === PROP ? 'prop0' : '';
        tl.at(dep, () => {
          fx.fly('prop0', cellPx * 0.95, life, (p) => { const q = 1 - p; return { x: q * q * cx + 2 * q * p * mx + p * p * tx, y: q * q * cy + 2 * q * p * my + p * p * ty, s: cellPx * (0.95 + 0.25 * Math.sin(p * Math.PI)) }; }, { frames: ['prop0', 'prop1', 'prop2', 'prop3'], ease: ease.inOutSine, trail: '#7FE3F0', onEnd: () => { fx.ring(tx, ty, cellPx * 0.8, 'rgba(160,240,255,.95)', 220, 4); } });
          if (carryKey) fx.fly(carryKey, cellPx * 0.6, life, (p) => { const q = 1 - p; return { x: q * q * cx + 2 * q * p * mx + p * p * tx, y: q * q * cy + 2 * q * p * my + p * p * ty + cellPx * 0.35 }; }, { ease: ease.inOutSine });
        });
      });
      if (kk === 'PP') tl.at(start, () => hooks.shake(4, 200));
    } else if (kk === ORB || kk === 'OO') {
      const order = cells.slice().sort((p, q) => Math.hypot(p % W - ax, Math.floor(p / W) - ay) - Math.hypot(q % W - ax, Math.floor(q / W) - ay));
      const step = Math.min(25, 480 / Math.max(1, order.length));
      order.forEach((c, n) => {
        const ht = start + 120 * sp + n * step * sp;
        setHit(c, ht);
        if (kk === ORB && !ctx.lessFx) tl.at(ht - 40, () => fx.bolt(cx, cy, vx(c), vy(c)));
      });
      tl.at(start, () => {
        hooks.sfx('em-orb');
        fx.flashAt(cx, cy, cellPx * 1.4, 'rgba(255,255,255,.95)', 380);
        fx.ring(cx, cy, cellPx * 1.2, 'rgba(220,200,255,.9)', 320, 6);
        if (kk === 'OO') { fx.whiteout(0.9); hooks.shake(12, 400); hooks.sfx('em-board-clear'); }
      });
    } else if (kk === 'OR' || kk === 'OB' || kk === 'OP') {
      tl.at(start, () => { hooks.sfx('em-orb'); fx.flashAt(cx, cy, cellPx * 1.4, 'rgba(255,255,255,.95)', 380); });
      convs.forEach((cv, n) => {
        const ct = start + (120 + n * 30) * sp;
        const s = cv.uid ? spriteOf(cv.uid) : undefined;
        uidAt.delete(cv.i);
        tl.at(ct - 40, () => { if (!ctx.lessFx) fx.bolt(cx, cy, vx(cv.i), vy(cv.i)); });
        if (s) {
          tl.at(ct, () => { s.kind = cv.k; s.color = -1; fx.ring(vx(cv.i), vy(cv.i), cellPx * 0.6, 'rgba(255,255,255,.9)', 200, 3); hooks.sfx('ui-pop', { gain: 0.5 }); });
          tl.tween(ct, 200, (p) => { s.sx = s.sy = 0.6 + 0.4 * ease.outBack(p); });
          fireUid.set(cv.i, cv.uid);
        }
        // converted pieces still count toward a collect goal
        flyToGoal({ e: 'clear', col: cv.col }, cv.i, ct, `gem${cv.col}`);
        // its own blast follows: 60 ms apart, after every conversion has landed
        b.hit.set(cv.i, start + (120 + convs.length * 30 + 200 + n * 60) * sp);
      });
      cells.forEach((c, n) => setHit(c, start + (120 + n * 25) * sp));
      fin = Math.max(fin, start + (120 + convs.length * 30 + 200 + convs.length * 60) * sp);
    } else if (kk === 'drill') {
      setHit(at, start + 200);
      tl.at(start + 200, () => { fx.sparks(cx, cy, '#FF8FA8', 16, 0.9); fx.flashAt(cx, cy, cellPx * 0.7, 'rgba(255,200,210,.9)', 200); });
    } else {
      for (const c of cells) setHit(c, start + 100 * sp);
    }
    return fin;
  }
}

/** an invalid swap: go, come back (outBack), shake ±4 px twice (spec §6.10) */
export function directInvalid(scene: Scene, tl: Timeline, a: number, b: number, hooks: Pick<Hooks, 'sfx'>, silent = false): number {
  const W = scene.W;
  const sa = scene.spriteAt(a), sb = scene.spriteAt(b);
  const ax = a % W, ay = Math.floor(a / W), bx = b % W, by = Math.floor(b / W);
  const go = 160, back = 180;
  if (sa) tl.tween(0, go, (p) => { sa.x = ax + (bx - ax) * p * 0.55; sa.y = ay + (by - ay) * p * 0.55; }, ease.inOutQuad);
  if (sb) tl.tween(0, go, (p) => { sb.x = bx + (ax - bx) * p * 0.55; sb.y = by + (ay - by) * p * 0.55; }, ease.inOutQuad);
  if (sa) tl.tween(go, back, (p) => { sa.x = ax + (bx - ax) * 0.55 * (1 - p); sa.y = ay + (by - ay) * 0.55 * (1 - p); }, ease.outBack);
  if (sb) tl.tween(go, back, (p) => { sb.x = bx + (ax - bx) * 0.55 * (1 - p); sb.y = by + (ay - by) * 0.55 * (1 - p); }, ease.outBack);
  for (const s of [sa, sb]) if (s) { const x0 = Math.round(s.x); tl.tween(go + back, 200, (p) => { s.x = x0 + Math.sin(p * Math.PI * 4) * (4 / 80) * (1 - p); }); }
  if (!silent) tl.at(go, () => hooks.sfx('em-swap-bad'));
  return go + back + 200;
}

/** frozen piece dragged: shake in place twice (spec §6.5) */
export function directShake(scene: Scene, tl: Timeline, i: number, hooks: Pick<Hooks, 'sfx'>): number {
  const s = scene.spriteAt(i);
  if (s) { const x0 = s.x; tl.tween(0, 240, (p) => { s.x = x0 + Math.sin(p * Math.PI * 4) * 0.04 * (1 - p); }); }
  scene.iceShake[i] = 0;
  tl.tween(0, 240, (p) => { scene.iceShake[i] = Math.sin(p * Math.PI * 4) * 3 * (1 - p); });
  tl.at(0, () => hooks.sfx('em-swap-bad'));
  return 240;
}
