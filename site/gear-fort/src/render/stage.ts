// The stage layer (spec §8.5 ②): units, machines, projectiles, grain, particles — drawn every frame from the kernel
// state with interpolation (alpha between the previous and the current tick). Presentation only: it reads S and the
// kernel events and never writes kernel state. Object pools keep the steady state allocation-free.
import { FB, rgba } from '../theme/mozi';
import { RIGS, poseOf, type Pose, type PoseState } from '../art/rigs';
import { plough, kite } from '../art/dolls';
import { drawRig, drawStats, type Atlas } from './atlas';
import { type Geo, xOf, feetY, cellCx, laneTop } from './board';
import { UNITS, ENEMIES } from '../lane/tables';
import { litByBeam } from '../lane/tags';
import { BODY } from '../lane/rules';
import type { Enemy, SimEvent, SimState, Unit } from '../lane/types';

interface Vis { seen: number; walk: number; lastX: number; atk: number; atkOn: number; hurt: number; lastHp: number; lastSh: number; lastNext: number; dings: number; shut: number }
interface Particle { on: boolean; kind: number; x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; age: number; size: number; color: string; part: string; ground: number }
interface Flyer { on: boolean; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; part: string; kind: 'gear' | 'grain'; arrive?: () => void }
export interface Hover { lane: number; col: number; ok: boolean; /** 1-1: breathe until he places the card (spec §2.4) */ pulse?: boolean }

const P_RECT = 0, P_PART = 1, P_RING = 2, P_STAR = 3, P_TEXT = 4;
const WOOD_CHIPS = ['#c2783f', '#8e4a2a', '#e0b47a'];

export class Stage {
  readonly ctx: CanvasRenderingContext2D;
  geo: Geo; atlas: Atlas;
  private vis = new Map<number, Vis>();
  private uvis = new Map<number, Vis>();
  private parts: Particle[] = [];
  private flyers: Flyer[] = [];
  private pose: Pose = {};
  private ps: PoseState = { t: 0, walk: 0, atk: 0, hurt: 0, mode: 0, hp: 1, extra: 0 };
  private shakeAmp = 0; private shakeUntil = 0; private shakeOn = true;
  private rolls: { lane: number; t0: number }[] = [];
  private stamps: { x: number; y: number; t0: number }[] = [];
  /** Boss 折叠 (spec §6.4): 铜犀 → 犁, 木鸢 → 风筝 where the boss fell (2.5 s inOutCubic, then the plough rests / the kite flies off) */
  private folds: { k: 'rhino' | 'owl'; x: number; y: number; t0: number; popped: boolean }[] = [];
  private evIdx = 0;
  /** HUD targets (CSS px) where gears and grain fly to */
  partsBox = { x: 0, y: 0 }; grainBin = { x: 0, y: 0 };
  private hv: Hover | null = null;
  /** the placement hint under the finger. The battle screen draws it as a DOM cell (onHover) so it repaints in the same
   *  frame as the drag ghost, above the board covers, whatever the canvas frame rate (QA r2: a stale ✕ in boarded
   *  levels); without a listener the canvas draws it as before */
  onHover: ((h: Hover | null) => void) | null = null;
  get hover(): Hover | null { return this.hv; }
  set hover(v: Hover | null) { this.hv = v; this.onHover?.(v); }
  reduced = false;
  onEvent: ((e: SimEvent) => void) | null = null;
  /** per-hit feedback for the mixer (material first: wood 梆 / bronze 叮, spec §7.1) */
  onFx: ((kind: 'hit' | 'ding' | 'shieldCrack' | 'shieldBreak' | 'unitHurt', x: { lane: number; mat?: string; wt?: string }) => void) | null = null;
  /** adaptive quality (render/perf.ts): particleCap 100 at level 1; `lite` (level 3) = no idle breathing, no shadows */
  particleCap = 200; lite = false;
  drawCalls = 0;

  constructor(readonly canvas: HTMLCanvasElement, atlas: Atlas, geo: Geo) {
    this.ctx = canvas.getContext('2d')!; this.atlas = atlas; this.geo = geo;
    for (let i = 0; i < 200; i++) this.parts.push({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, life: 0, age: 0, size: 0, color: '', part: '', ground: 0 });
    for (let i = 0; i < 48; i++) this.flyers.push({ on: false, x0: 0, y0: 0, x1: 0, y1: 0, t0: 0, dur: 0, part: 'gear', kind: 'gear' });
  }
  setGeo(geo: Geo, atlas: Atlas): void { this.geo = geo; this.atlas = atlas; }
  setShake(on: boolean): void { this.shakeOn = on; }
  reset(): void { this.vis.clear(); this.uvis.clear(); this.evIdx = 0; this.rolls = []; this.stamps = []; this.folds = []; for (const p of this.parts) p.on = false; for (const f of this.flyers) f.on = false; }
  /** after a kernel restore the event list starts again */
  rewindEvents(n = 0): void { this.evIdx = n; }

  shake(px: number, ms: number, now: number): void { if (!this.shakeOn || this.reduced) return; this.shakeAmp = Math.max(this.shakeAmp, px); this.shakeUntil = Math.max(this.shakeUntil, now + ms); }

  private spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, part = '', ground = 0): void {
    const cap = Math.min(this.parts.length, this.particleCap); let p: Particle | null = null;
    for (let i = 0; i < cap; i++) if (!this.parts[i].on) { p = this.parts[i]; break; }
    if (!p) { p = this.parts[0]; for (let i = 1; i < cap; i++) { const b = this.parts[i]; if (b.age / b.life > p.age / p.life) p = b; } }
    p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = Math.random() * 6; p.vr = (Math.random() - 0.5) * 12; p.life = life; p.age = 0; p.size = size; p.color = color; p.part = part; p.ground = ground;
  }
  activeParticles(): number { let n = 0; for (const p of this.parts) if (p.on) n++; return n; }
  /** ?dev=perf only: keep the particle pool full (wood chips, sparks and planks scattered over the board) */
  fillParticles(n: number): void {
    const g = this.geo; let have = this.activeParticles();
    for (let i = 0; have < Math.min(n, this.particleCap) && i < 400; i++, have++) {
      const x = g.x0 + Math.random() * g.w * 8, y = g.by + Math.random() * g.bh * 0.9; const r = Math.random();
      if (r < 0.6) this.spawn(P_RECT, x, y, (Math.random() - 0.2) * 160, -120 - Math.random() * 160, 0.7 + Math.random() * 0.5, 2.5 + Math.random() * 2.5, WOOD_CHIPS[i % 3], '', y + 18);
      else if (r < 0.85) this.spawn(P_STAR, x, y, (Math.random() - 0.5) * 140, -60 - Math.random() * 120, 0.5, 5, '#ffd968');
      else this.spawn(P_PART, x, y, (Math.random() - 0.5) * 260, -180 - Math.random() * 200, 0.9, 1, '', 'plank', y + 6);
    }
  }
  dust(x: number, y: number, n: number): void { for (let i = 0; i < (this.reduced ? n >> 1 : n); i++) this.spawn(P_RECT, x + (Math.random() - 0.5) * 16, y, (Math.random() - 0.5) * 90, -20 - Math.random() * 50, 0.5, 3 + Math.random() * 4, 'rgba(214,186,140,0.8)'); }
  chips(x: number, y: number, n: number, colors = WOOD_CHIPS): void { for (let i = 0; i < n; i++) this.spawn(P_RECT, x, y, (Math.random() - 0.2) * 160, -120 - Math.random() * 160, 0.7, 2.5 + Math.random() * 2.5, colors[i % colors.length], '', y + 18); }
  sparks(x: number, y: number): void { for (let i = 0; i < 4; i++) this.spawn(P_STAR, x, y, (Math.random() - 0.5) * 140, -60 - Math.random() * 120, 0.35, 5, '#ffd968'); }
  ding(x: number, y: number): void { this.spawn(P_TEXT, x, y, 0, -40, 0.7, 16, '#ffe9a6', '叮'); }
  ring(x: number, y: number, size: number, color: string): void { this.spawn(P_RING, x, y, 0, 0, 0.45, size, color); }
  private breakApart(x: number, y: number, k: number, n: number, part = 'plank'): void { for (let i = 0; i < n; i++) this.spawn(P_PART, x + (Math.random() - 0.5) * 30 * k * 100 / 100, y - 20 * k, (Math.random() - 0.5) * 260, -180 - Math.random() * 200, 0.9, 1, '', part, y + 6); }
  fly(part: string, kind: 'gear' | 'grain', x0: number, y0: number, x1: number, y1: number, now: number, dur: number, arrive?: () => void): void {
    const f = this.flyers.find((q) => !q.on); if (!f) { arrive?.(); return; }
    Object.assign(f, { on: true, x0, y0, x1, y1, t0: now, dur, part, kind, arrive });
  }

  private visOf(e: Enemy, now: number): Vis {
    let v = this.vis.get(e.id);
    if (!v) { v = { seen: now, walk: 0, lastX: e.x, atk: 0, atkOn: 0, hurt: 0, lastHp: e.hp, lastSh: e.sh, lastNext: 0, dings: e.dings || 0, shut: 0 }; this.vis.set(e.id, v); }
    return v;
  }
  /** call before each kernel step: remembers x for interpolation */
  beforeStep(S: SimState, now: number): void { for (const e of S.enemies) this.visOf(e, now).lastX = e.x; }
  /** call after each kernel step: walk cycles, bites, hits, sparks */
  afterStep(S: SimState, now: number): void {
    const g = this.geo;
    for (const e of S.enemies) {
      const v = this.visOf(e, now);
      v.walk += Math.abs(e.x - v.lastX) / 100;
      v.atk = e.x === v.lastX && e.hp > 0 && e.stunUntil <= S.tick && e.stuckUntil <= S.tick && e.x < 80000 ? (v.atk + 1) % 10 : 0;
      if (e.hp < v.lastHp || e.sh < v.lastSh) {
        if (e.sh < v.lastSh) this.onFx?.(e.sh <= 0 ? 'shieldBreak' : 'shieldCrack', e); else if (now - v.hurt > 120) this.onFx?.('hit', e);
        if (e.sh <= 0 && v.lastSh > 0) { const p = this.enemyXY(e, 1); const y = p.y - g.h * 0.32; this.spawn(P_PART, p.x - g.w * 0.3, y, -150, -170, 1.1, 1, '', 'shieldL', p.y + 4); this.spawn(P_PART, p.x - g.w * 0.18, y, 120, -210, 1.1, 1, '', 'shieldR', p.y + 4); this.dust(p.x - g.w * 0.25, p.y, 5); }
        if (now - v.hurt > 120) { v.hurt = now; const p = this.enemyXY(e, 1); this.chips(p.x - g.w * 0.2, p.y - g.h * 0.4, e.k === 'ant' ? 1 : 3, e.mat === 'metal' ? ['#ffd968', '#c9a23a'] : WOOD_CHIPS); }
      }
      if ((e.dings || 0) > v.dings) { if (now - v.atkOn > 400) { this.onFx?.('ding', e); const p = this.enemyXY(e, 1); this.sparks(p.x - g.w * 0.25, p.y - g.h * 0.5); this.ding(p.x - g.w * 0.1, p.y - g.h * 0.85); v.atkOn = now; } v.dings = e.dings || 0; }
      v.lastHp = e.hp; v.lastSh = e.sh;
    }
    for (const u of S.units) {
      let v = this.uvis.get(u.id);
      if (!v) { v = { seen: now, walk: 0, lastX: 0, atk: 0, atkOn: 0, hurt: 0, lastHp: u.hp, lastSh: 0, lastNext: u.next, dings: 0, shut: 0 }; this.uvis.set(u.id, v); }
      if (u.next !== v.lastNext) { if (u.acted && ['shooter', 'lobber', 'burner', 'farm', 'bank', 'radial', 'gust', 'hook'].includes(u.k) && u.next > v.lastNext + 4) { v.atkOn = now; if (u.k === 'gust' || u.k === 'hook' || u.k === 'radial') this.onAct?.(u); } v.lastNext = u.next; }
      if (u.hp < v.lastHp) { if (now - v.hurt > 300) { v.hurt = now; this.onFx?.('unitHurt', u); } }
      v.lastHp = u.hp;
    }
  }

  /** where a machine stands this frame (CSS px), interpolated */
  enemyXY(e: Enemy, alpha: number): { x: number; y: number; k: number } {
    const g = this.geo; const v = this.vis.get(e.id);
    const ix = v ? v.lastX + (e.x - v.lastX) * alpha : e.x;
    const body = e.body ?? BODY;
    let yOff = 0;
    // stacked machines (spec §2.5): same lane, < 0.5 tile apart → offset by id parity
    if (e.k !== 'ant' && !e.boss) yOff = ((e.id % 3) - 1) * g.h * 0.08;
    if (e.k === 'ant') yOff = (((e.id * 7) % 5) - 2) * g.h * 0.07;
    return { x: xOf(g, ix + body / 2), y: feetY(g, e.lane) + yOff, k: g.k };
  }
  unitXY(u: Unit): { x: number; y: number } { return { x: cellCx(this.geo, u.col), y: feetY(this.geo, u.lane) }; }
  /** the cell a drop rests on (a sky drop lands on a fixed lane/col picked from its id; see dropXY) */
  dropCell(S: SimState, d: { id: number; lane: number; col: number }): { lane: number; col: number } {
    if (d.lane >= 0) return { lane: d.lane, col: d.col };
    const lanes = [0, 1, 2, 3, 4].filter((l) => S.L.lanes[l]); return { lane: lanes[(d.id * 7) % lanes.length], col: 1 + ((d.id * 5) % 6) };
  }
  /** where a drop rests once it has landed (the demo hand points here, not at the spawn point high above — QA r3) */
  dropRestXY(S: SimState, d: { id: number; lane: number; col: number; t: number }): { x: number; y: number } {
    return this.dropXY({ L: S.L, tick: Math.max(S.tick, d.t + 12) } as SimState, d, 0);
  }
  dropXY(S: SimState, d: { id: number; lane: number; col: number; t: number }, now: number): { x: number; y: number } {
    const g = this.geo;
    if (d.lane >= 0) return { x: cellCx(g, d.col) + g.w * 0.18, y: laneTop(g, d.lane) + g.h * 0.32 + Math.sin(now / 300 + d.id) * 2 };
    const lanes = [0, 1, 2, 3, 4].filter((l) => S.L.lanes[l]); const l = lanes[(d.id * 7) % lanes.length]; const c = 1 + ((d.id * 5) % 6);
    const fall = Math.min(1, (S.tick - d.t) / 12);
    return { x: cellCx(g, c), y: laneTop(g, l) + g.h * (0.45 * fall) - (1 - fall) * g.h * 1.5 + Math.sin(now / 300 + d.id) * 2 };
  }

  /** consume new kernel events → effects (and forward to the battle screen for sound/voice) */
  private eat(S: SimState, now: number): void {
    const ev = S.ev; if (!ev) return;
    if (this.evIdx > ev.length) this.evIdx = 0;
    const g = this.geo;
    for (; this.evIdx < ev.length; this.evIdx++) {
      const e = ev[this.evIdx];
      switch (e.type) {
        case 'place': { const x = cellCx(g, e.col!), y = feetY(g, e.lane!); this.dust(x, y, 6); break; }
        case 'unitGone': if (e.why !== 'shovel' && e.why !== 'spent') this.breakApart(cellCx(g, e.col!), feetY(g, e.lane!), g.k, 5); else if (e.why === 'shovel') this.dust(cellCx(g, e.col!), feetY(g, e.lane!), 5); break;
        case 'gone': {
          if (e.x == null) break;
          const x = xOf(g, e.x + BODY / 2), y = feetY(g, e.lane!);
          if (e.captured) { this.stamps.push({ x, y: y - g.h * 0.3, t0: now }); break; }
          if (e.k === 'rhino' || e.k === 'owl') { // the boss does not fall apart: it folds into something useful (化害为利)
            const lift = e.k === 'owl' ? (this.vis.get(e.id!)?.shut ?? 0) : 0;
            this.folds.push({ k: e.k, x, y: y - lift, t0: now, popped: false });
            this.ring(x, y - lift - g.h * 0.45, g.w * 2.4, 'rgba(255,214,90,0.95)'); this.ring(x, y - lift - g.h * 0.45, g.w * 1.4, 'rgba(255,245,200,0.9)');
            for (let i = 0; i < (this.reduced ? 3 : 8); i++) this.sparks(x + (i - 3.5) * g.w * 0.12, y - lift - g.h * 0.5);
            this.shake(5, 200, now);
          } else this.breakApart(x, y, g.k, e.k === 'ant' ? 2 : 5, e.k === 'brute' ? 'chip' : 'plank');
          if (!e.log) { const n = e.k === 'ant' ? 1 : e.k === 'brute' || e.k === 'ram' ? 3 : 2; for (let i = 0; i < n; i++) this.fly('gear', 'gear', x + i * 6, y - g.h * 0.4, this.partsBox.x, this.partsBox.y, now + i * 70, 650); }
          break;
        }
        case 'impact': { const en = S.enemies.find((q) => q.id === e.id); if (en) { const p = this.enemyXY(en, 1); this.dust(p.x - g.w * 0.4, p.y, 8); } this.shake(3, 160, now); break; }
        case 'strikeLand': { const x = cellCx(g, e.col!), y = feetY(g, e.lane!); this.dust(x, y, 14); this.ring(x, y, g.w * 1.3, 'rgba(120,90,60,0.6)'); this.shake(4, 200, now); break; }
        case 'log': this.rolls.push({ lane: e.lane!, t0: now }); this.shake(3, 200, now); break;
        case 'counter': if (e.card === 'spikes') { const en = S.enemies.find((q) => q.id === e.id); if (en) { const p = this.enemyXY(en, 1); this.dust(p.x - g.w * 0.2, p.y, 6); this.spawn(P_STAR, p.x, p.y - g.h * 0.6, 0, -30, 0.9, 7, '#ffe066'); } } break;
        case 'shellOn': case 'shellOff': case 'dashStopped': this.shake(5, 200, now); break;
        case 'ult': { // 机关令: a gold ring burst + rising stars on the unit (spec §3.10, §6.4)
          const x = cellCx(g, e.col!), y = feetY(g, e.lane!) - g.h * 0.35;
          this.ring(x, y, g.w * 1.8, 'rgba(255,214,90,0.95)'); this.ring(x, y, g.w * 1.1, 'rgba(255,245,200,0.9)');
          for (let i = 0; i < (this.reduced ? 3 : 7); i++) this.sparks(x + (i - 3) * g.w * 0.08, y);
          this.shake(2, 140, now); break;
        }
        default: break;
      }
      this.onEvent?.(e);
    }
  }

  render(S: SimState, alpha: number, now: number, dt: number): void {
    const g = this.geo; const ctx = this.ctx; const dpr = g.dpr;
    drawStats.calls = 0;
    this.eat(S, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0, sy = 0;
    if (now < this.shakeUntil) { const k = (this.shakeUntil - now) / 200; sx = (Math.random() - 0.5) * 2 * this.shakeAmp * k; sy = (Math.random() - 0.5) * 2 * this.shakeAmp * k; } else this.shakeAmp = 0;
    const T = (x: number, y: number): void => { ctx.setTransform(dpr, 0, 0, dpr, (x + sx) * dpr, (y + sy) * dpr); };
    const t = now / 1000;

    // placement hint under the finger
    if (this.hover && !this.onHover) {
      const h = this.hover; const x = g.x0 + h.col * g.w, y = laneTop(g, h.lane);
      const pa = h.pulse && !this.reduced ? 0.5 + 0.5 * Math.sin(performance.now() / 260) : 1;
      T(0, 0); ctx.fillStyle = h.ok ? rgba(FB.ok, h.pulse ? 0.16 + 0.26 * pa : 0.3) : rgba(FB.mark, 0.16); ctx.fillRect(x + 2, y + 2, g.w - 4, g.h - 4);
      ctx.strokeStyle = h.ok ? FB.ok : rgba(FB.mark, 0.9); ctx.lineWidth = 2.5; ctx.strokeRect(x + 3, y + 3, g.w - 6, g.h - 6);
      if (!h.ok) { ctx.lineWidth = 5; ctx.lineCap = 'round'; const cx = x + g.w / 2, cy = y + g.h / 2, r = g.w * 0.16; ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); }
    }
    // logs waiting at each gate
    for (let l = 0; l < 5; l++) if (S.L.lanes[l] && S.logs[l] < (S.logCap || 1)) { T(g.bx + g.wallW * 0.5, feetY(g, l) - g.h * 0.05); ctx.scale(g.k * 1.25, g.k * 1.25); ctx.translate(-10, -20); this.atlas.part(ctx, 'log'); drawStats.calls++; }

    // ── ground layer: flat units (spikes, pits) ──
    for (const u of S.units) if (UNITS[u.k].flat) this.drawUnit(S, u, now, sx, sy);
    // ── lanes top to bottom: standing units then machines ──
    for (let l = 0; l < 5; l++) {
      for (let c = 7; c >= 0; c--) { const id = S.grid[l][c]; if (!id) continue; const u = S.units.find((q) => q.id === id); if (u && !UNITS[u.k].flat) this.drawUnit(S, u, now, sx, sy); }
      const es = S.enemies.filter((e) => e.lane === l && !e.gone && e.hp > 0 && e.layer !== 'air').sort((a, b) => b.x - a.x);
      for (const e of es) this.drawEnemy(S, e, alpha, now, dt, sx, sy);
    }
    for (const e of S.enemies) if (e.layer === 'air' && !e.gone && e.hp > 0) this.drawEnemy(S, e, alpha, now, dt, sx, sy);
    // forget visuals of machines that left
    if (this.vis.size > S.enemies.length + 16) for (const id of this.vis.keys()) if (!S.enemies.some((e) => e.id === id)) this.vis.delete(id);

    // ── projectiles ──
    for (const b of S.bolts) {
      const x = xOf(g, b.x - 5000 * (1 - alpha)); const y = feetY(g, b.lane) - g.h * 0.42;
      T(x, y); ctx.scale(g.k, g.k); ctx.translate(-30, -3); this.atlas.part(ctx, 'bolt'); drawStats.calls++;
    }
    for (const lob of S.lobs) {
      const D = UNITS[lob.src.k] || UNITS.lobber; const fl = D.flight || 14; const start = lob.land - fl;
      const p = Math.max(0, Math.min(1, (S.tick - start + alpha) / fl));
      const src = lob.src as unknown as Unit; const x0 = cellCx(g, src.col ?? 0), x1 = xOf(g, lob.x + BODY / 2);
      const y0 = feetY(g, lob.lane) - g.h * 0.7, y1 = feetY(g, lob.lane) - g.h * 0.25;
      const x = x0 + (x1 - x0) * p, y = y0 + (y1 - y0) * p - Math.sin(p * Math.PI) * g.h * 1.25;
      T(x, y); ctx.rotate(p * 7); ctx.scale(g.k * (lob.fire ? 0.85 : 1), g.k * (lob.fire ? 0.85 : 1)); ctx.translate(lob.fire ? -10 : -8, lob.fire ? -11 : -7.5); this.atlas.part(ctx, lob.fire ? 'brPot' : 'stone'); drawStats.calls++;
      if (lob.fire && Math.random() < 0.5) this.spawn(P_RECT, x, y, (Math.random() - 0.5) * 30, -20, 0.35, 4, Math.random() < 0.5 ? '#FFB347' : '#FF6A2B');
    }
    for (const s of S.strikes) {
      const p = Math.max(0, Math.min(1, 1 - (s.at - S.tick - alpha) / 12));
      const x = cellCx(g, s.col), y = feetY(g, s.lane);
      T(0, 0); ctx.fillStyle = `rgba(30,20,10,${0.15 + 0.35 * p})`; ctx.beginPath(); ctx.ellipse(x, y, g.w * (0.3 + 0.9 * p), g.h * (0.12 + 0.3 * p), 0, 0, Math.PI * 2); ctx.fill();
      T(x, y - g.h * 3 * (1 - p) - g.h * 0.4); ctx.scale(g.k * 1.6, g.k * 1.6); ctx.translate(-24, -22); this.atlas.part(ctx, 'boulder'); drawStats.calls++;
    }
    // fire walls (burner ult)
    if (S.fires) for (const f of S.fires) { const x0 = xOf(g, f.x0), x1 = xOf(g, f.x1), y = feetY(g, f.lane); T(0, 0); const fg = ctx.createLinearGradient(0, y - g.h * 0.6, 0, y); fg.addColorStop(0, 'rgba(255,106,43,0)'); fg.addColorStop(1, 'rgba(255,140,50,0.55)'); ctx.fillStyle = fg; ctx.fillRect(x0, y - g.h * 0.6, x1 - x0, g.h * 0.6); }
    // smoke (vol 2): soft billowing puffs from one cached sprite; thinner as the cloud runs out (spec §6.4)
    for (let l = 0; l < 5; l++) for (let c = 0; c < 8; c++) {
      const until = S.smoke[l][c]; if (until <= S.tick) continue;
      const fade = Math.min(1, (until - S.tick) / 30); const cx = cellCx(g, c), top = laneTop(g, l);
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      for (let i = 0; i < 4; i++) {
        const ph = t * (0.35 + i * 0.07) + i * 1.9 + c * 0.7 + l;
        const r = g.w * (0.42 + 0.06 * Math.sin(ph * 1.3)); const x = cx + Math.sin(ph) * g.w * 0.22 + (i - 1.5) * g.w * 0.16; const y = top + g.h * (0.3 + 0.13 * (i % 2)) + Math.cos(ph * 0.8) * g.h * 0.06;
        ctx.globalAlpha = 0.82 * fade; ctx.drawImage(this.puff(), x - r, y - r, r * 2, r * 2); drawStats.calls++;
        if (drawStats.measure) drawStats.px += 4 * r * r * g.dpr * g.dpr;
      }
      ctx.globalAlpha = 1;
    }

    // ── 檑木 rolling down a lane ──
    this.rolls = this.rolls.filter((r) => now - r.t0 < 1400);
    for (const r of this.rolls) { const p = (now - r.t0) / 1400; const x = g.x0 + p * g.w * 8.6; T(x, feetY(g, r.lane) - g.h * 0.1); ctx.rotate(p * 30); ctx.scale(g.k * 1.5, g.k * 1.5); ctx.translate(-10, -10); this.atlas.part(ctx, 'log'); drawStats.calls++; }

    // ── grain bags ──
    for (const d of S.drops) {
      const p = this.dropXY(S, d, now); const age = (S.tick - d.t) / 20; const pop = Math.min(1, age * 4);
      T(p.x, p.y); ctx.fillStyle = rgba(FB.grain, 0.38); ctx.beginPath(); ctx.arc(0, 0, g.w * 0.22 * (1 + Math.sin(now / 220) * 0.08), 0, Math.PI * 2); ctx.fill();
      ctx.scale(g.k * 1.25 * pop, g.k * 1.25 * pop); ctx.translate(-11, -10); this.atlas.part(ctx, 'grainBag'); drawStats.calls++;
    }
    // collect-stamps (陷坑 收)
    this.stamps = this.stamps.filter((s) => now - s.t0 < 900);
    for (const s of this.stamps) { const p = Math.min(1, (now - s.t0) / 250); const sc = 1.3 - 0.3 * p; T(s.x, s.y); ctx.globalAlpha = Math.min(1, 2 - ((now - s.t0) / 900) * 2); ctx.scale(g.k * 1.6 * sc, g.k * 1.6 * sc); ctx.translate(-11, -11); this.atlas.part(ctx, 'sealShou'); ctx.globalAlpha = 1; drawStats.calls++; }

    // ── particles ──
    const dts = Math.min(0.05, dt / 1000);
    for (const p of this.parts) {
      if (!p.on) continue; p.age += dts; if (p.age >= p.life) { p.on = false; continue; }
      p.vy += (p.kind === P_TEXT || p.kind === P_RING ? 0 : 900) * dts; p.x += p.vx * dts; p.y += p.vy * dts; p.r += p.vr * dts;
      if (p.ground && p.y > p.ground) { p.y = p.ground; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.5; }
      const a = 1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4));
      ctx.globalAlpha = a;
      if (p.kind === P_RECT) { T(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7); }
      else if (p.kind === P_PART) { T(p.x, p.y); ctx.rotate(p.r); ctx.scale(g.k, g.k); ctx.translate(-9, -4); this.atlas.part(ctx, p.part); drawStats.calls++; }
      else if (p.kind === P_RING) { T(p.x, p.y); const s = p.age / p.life; ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, p.size * s, p.size * s * 0.35, 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (p.kind === P_STAR) { T(p.x, p.y); ctx.rotate(p.r * 0.2); ctx.fillStyle = p.color; ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? p.size * 0.35 : p.size; const an = (i / 8) * Math.PI * 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); }
      else if (p.kind === P_TEXT) { T(p.x, p.y); ctx.font = `700 ${p.size}px "Baloo 2", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(42,27,18,0.8)'; ctx.strokeText(p.part, 0, 0); ctx.fillStyle = p.color; ctx.fillText(p.part, 0, 0); }
    }
    ctx.globalAlpha = 1;
    // ── night: warm fire light (glow-warm, additive sprites; the lanterns are baked into the board) ──
    if (S.L.env?.night && !(S.dawnAt != null && S.tick >= S.dawnAt)) {
      ctx.globalCompositeOperation = 'lighter'; const gs = this.glow(); const fl = 0.85 + 0.15 * Math.sin(t * 9.3);
      const lamp = (x: number, y: number, r: number, a: number): void => { ctx.globalAlpha = a; ctx.drawImage(gs, x - r, y - r, r * 2, r * 2); drawStats.calls++; if (drawStats.measure) drawStats.px += 4 * r * r * g.dpr * g.dpr; };
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      for (const u of S.units) if (u.k === 'burner' && !u.dead) lamp(cellCx(g, u.col) + g.w * 0.08, feetY(g, u.lane) - g.h * 0.55, g.w * 0.62, 0.5 * fl);
      for (const e of S.enemies) if (e.burnUntil > S.tick && !e.gone && e.hp > 0) { const p = this.enemyXY(e, alpha); lamp(p.x, p.y - g.h * 0.4, g.w * 0.7, 0.55 * fl); }
      for (const lob of S.lobs) if (lob.fire) { const x = xOf(g, lob.x + BODY / 2); lamp(x, feetY(g, lob.lane) - g.h * 0.3, g.w * 0.45, 0.35); }
      if (S.fires) for (const f of S.fires) { const x0 = xOf(g, f.x0), x1 = xOf(g, f.x1); for (let x = x0; x < x1; x += g.w * 0.6) lamp(x, feetY(g, f.lane) - g.h * 0.3, g.w * 0.75, 0.45 * fl); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // ── Boss 折叠 ──
    if (this.folds.length) { this.folds = this.folds.filter((f) => now - f.t0 < (this.reduced ? 2150 : 4300)); for (const f of this.folds) this.drawFold(f, now); }
    // ── gears / grain flying to the HUD ──
    for (const f of this.flyers) {
      if (!f.on || now < f.t0) continue; const p = (now - f.t0) / f.dur;
      if (p >= 1) { f.on = false; f.arrive?.(); continue; }
      const e = p * p * (3 - 2 * p); const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(p * Math.PI) * 90;
      T(x, y); ctx.rotate(p * 9); const s = g.k * (f.kind === 'gear' ? 1.3 : 1.1); ctx.scale(s, s); ctx.translate(f.kind === 'gear' ? -7 : -11, f.kind === 'gear' ? -7 : -10); this.atlas.part(ctx, f.part); drawStats.calls++;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawCalls = drawStats.calls;
  }

  /** ms until a running Boss fold has shown the plough / the kite flying off (the battle waits for it before the result) */
  foldLeft(now: number): number { let m = 0; for (const f of this.folds) m = Math.max(m, f.t0 + (this.reduced ? 2150 : 4300) - now); return m; }
  private drawFold(f: { k: 'rhino' | 'owl'; x: number; y: number; t0: number; popped: boolean }, now: number): void {
    const g = this.geo; const ctx = this.ctx; const owl = f.k === 'owl';
    const a = (now - f.t0) / (this.reduced ? 1250 : 2500); // 0 → 1 = the fold; 1 → 1.72 = rest / fly off
    const io = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const cy = f.y - g.h * 0.45;
    // warm glow under the fold
    const ga = a < 0.7 ? 0.55 * io(a / 0.7) : Math.max(0, 0.55 * (1 - (a - 0.7) / 0.6));
    if (ga > 0.01) { ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); const r = g.w * (0.7 + 0.9 * io(Math.min(1, a))); const gr = ctx.createRadialGradient(f.x, cy, 0, f.x, cy, r); gr.addColorStop(0, `rgba(255,240,200,${ga.toFixed(3)})`); gr.addColorStop(1, 'rgba(255,214,90,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, cy, r, 0, Math.PI * 2); ctx.fill(); }
    // the machine folds in on itself: shrinks toward its middle, turns, goes white
    if (a < 0.72) {
      const p = io(a / 0.72); const s0 = owl ? 1.25 : 1.2; const sc = s0 * (1 - 0.85 * p); const rig = RIGS[f.k];
      const ps = this.ps; ps.t = now / 1000; ps.walk = 0; ps.atk = 0; ps.hurt = 0; ps.mode = owl ? 3 : 0; ps.hp = 0; ps.extra = 0;
      poseOf(f.k, ps, this.pose); this.pose.root = { ...(this.pose.root || {}), r: p * (owl ? -1.6 : 0.9) };
      const Y = f.y - (1 - sc / s0) * rig.height * g.k * s0 * 0.5;
      drawRig(ctx, this.atlas, f.k, this.pose, f.x, Y, g.k * sc, g.dpr, { white: Math.min(1, p * 1.5) });
    }
    // the useful thing pops out: a plough that rests in the furrow, or a kite that climbs into the sky
    if (a >= 0.55) {
      if (!f.popped) { f.popped = true; for (let i = 0; i < (this.reduced ? 2 : 5); i++) this.sparks(f.x + (i - 2) * g.w * 0.15, cy); this.ring(f.x, cy, g.w * 1.2, 'rgba(255,245,200,0.9)'); }
      const q = Math.min(1, (a - 0.55) / 0.3); const pop = q < 1 ? 1 + 2.70158 * (q - 1) ** 3 + 1.70158 * (q - 1) ** 2 : 1; // outBack
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      if (owl) {
        const up = a > 1 ? io(Math.min(1, (a - 1) / 0.72)) : 0; ctx.globalAlpha = a > 1.4 ? Math.max(0, 1 - (a - 1.4) / 0.32) : 1;
        kite(ctx, 1, f.x + up * g.w * 0.9, cy - up * g.h * 2.6, (g.w * 1.25 / 44) * pop, now / 1000);
      } else {
        ctx.globalAlpha = a > 1.35 ? Math.max(0, 1 - (a - 1.35) / 0.37) : 1;
        plough(ctx, 1, f.x - g.w * 0.25, f.y - g.h * 0.02, (g.w * 1.15 / 34) * pop);
      }
      ctx.globalAlpha = 1;
    }
  }
  private drawUnit(S: SimState, u: Unit, now: number, sx: number, sy: number): void {
    const g = this.geo; const ctx = this.ctx;
    let v = this.uvis.get(u.id);
    if (!v) { v = { seen: now, walk: 0, lastX: 0, atk: 0, atkOn: 0, hurt: 0, lastHp: u.hp, lastSh: 0, lastNext: u.next, dings: 0, shut: 0 }; this.uvis.set(u.id, v); }
    const ps = this.ps; ps.t = (this.lite ? 0 : now / 1000) + u.id * 0.37; ps.walk = 0; ps.hurt = 0; ps.mode = 0; ps.hp = u.max ? u.hp / u.max : 1; ps.extra = 0;
    ps.atk = v.atkOn ? (now - v.atkOn) / (u.k === 'lobber' ? 600 : u.k === 'burner' ? 700 : u.k === 'gust' ? 650 : u.k === 'hook' ? 500 : 320) : 0; if (ps.atk > 1) ps.atk = 0;
    if (u.k === 'bank') { const per = (UNITS.bank as { period?: number }).period || 320; ps.extra = S.tick < (u.armAt || 0) ? 0 : Math.max(0, Math.min(1, 1 - (u.next - S.tick) / per)); }
    if (u.k === 'radial') { const tg = u.tgt ? S.enemies.find((q) => q.id === u.tgt) : null; ps.mode = tg && tg.layer === 'air' ? 1 : 0; }
    if (u.k === 'spikes') { ps.extra = Math.max(1, 5 - u.wear); ps.atk = 0; }
    if (u.k === 'pit') ps.mode = S.tick >= u.armAt ? 1 : 0;
    if (u.k === 'wall') { ps.extra = u.fortUntil > S.tick ? 1 : 0; ps.hurt = now - v.hurt < 200 ? 1 : 0; }
    poseOf(u.k, ps, this.pose);
    const p = this.unitXY(u);
    const age = (now - v.seen) / 220; let yOff = 0, sc = 1;
    if (age < 1 && !this.reduced) { const e = age; yOff = -30 * (1 - e) * (1 - e); sc = e < 0.6 ? 1 + 0.15 * (e / 0.6) : 1.15 - 0.2 * ((e - 0.6) / 0.4); if (e > 0.9) sc = 0.95 + 0.05 * ((e - 0.9) / 0.1); }
    // shadow
    const rig = RIGS[u.k];
    if (rig && rig.shadow && !this.lite) { ctx.setTransform(g.dpr, 0, 0, g.dpr, (p.x + sx) * g.dpr, (p.y + sy) * g.dpr); ctx.fillStyle = 'rgba(42,27,18,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, rig.shadow * g.k, rig.shadow * g.k * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    const flash = now - v.hurt < 60 ? 0.85 : 0;
    drawRig(ctx, this.atlas, rig ? u.k : 'shooter', this.pose, p.x + sx, p.y + yOff + sy, g.k * sc, g.dpr, { white: flash });
    if (u.k === 'wall' && u.max) this.drawCracks(p.x + sx, p.y + sy, u.hp / u.max);
    if (u.pin) this.badge(p.x + sx, p.y + sy - g.h * 0.85, '压');
    if (u.k === 'beam' && u.tgt) { const e = S.enemies.find((q) => q.id === u.tgt); if (e) this.beamTo(p.x + g.w * 0.08 + sx, p.y - g.h * 0.68 + sy, e, u.tOn); }
  }
  private drawCracks(x: number, y: number, ratio: number): void {
    if (ratio > 0.66) return; const g = this.geo; const ctx = this.ctx;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, x * g.dpr, y * g.dpr); ctx.strokeStyle = 'rgba(42,27,18,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const k = g.k; ctx.beginPath(); ctx.moveTo(-12 * k, -60 * k); ctx.lineTo(-6 * k, -48 * k); ctx.lineTo(-12 * k, -38 * k); ctx.lineTo(-4 * k, -30 * k);
    if (ratio <= 0.33) { ctx.moveTo(14 * k, -56 * k); ctx.lineTo(8 * k, -44 * k); ctx.lineTo(16 * k, -34 * k); ctx.moveTo(-2 * k, -20 * k); ctx.lineTo(6 * k, -14 * k); }
    ctx.stroke();
  }
  private badge(x: number, y: number, ch: string): void {
    const g = this.geo; const ctx = this.ctx; ctx.setTransform(g.dpr, 0, 0, g.dpr, x * g.dpr, y * g.dpr);
    ctx.fillStyle = '#C8372D'; ctx.beginPath(); ctx.roundRect(-11, -11, 22, 22, 4); ctx.fill(); ctx.fillStyle = '#fff3df'; ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 0, 1);
  }
  private beamTo(x: number, y: number, e: Enemy, on: number): void {
    const g = this.geo; const ctx = this.ctx; const p = this.enemyXY(e, 1); const w = 2 + Math.min(4, Math.floor(on / 20)) * 1.6;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); const gr = ctx.createLinearGradient(x, y, p.x, p.y - g.h * 0.4); gr.addColorStop(0, 'rgba(255,240,180,0.9)'); gr.addColorStop(1, 'rgba(255,200,100,0.35)');
    ctx.strokeStyle = gr; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(p.x - g.w * 0.2, p.y - g.h * 0.4); ctx.stroke();
  }

  private drawEnemy(S: SimState, e: Enemy, alpha: number, now: number, dt: number, sx: number, sy: number): void {
    const g = this.geo; const ctx = this.ctx;
    const v = this.visOf(e, now);
    const p = this.enemyXY(e, alpha);
    const kind = RIGS[e.k] ? e.k : e.k === 'shielder_m' ? 'shielder' : 'walker';
    const ps = this.ps; ps.t = now / 1000 + e.id * 0.71; ps.walk = v.walk + alpha * 0.5; ps.hurt = 0; ps.mode = 0; ps.hp = e.max ? e.hp / e.max : 1;
    ps.atk = v.atk > 0 ? (v.atk + alpha) / 10 : 0; ps.extra = e.sh > 0 ? 1 : 0;
    if (e.k === 'ram') { ps.extra = 0.3 + Math.min(1, e.run / 20000); ps.atk = e.mode === 1 ? 1 - e.recoilLeft / 12 : 0; }
    if (e.k === 'rhino' && e.boss) { const ph = e.boss.phase ?? 1; ps.mode = ph; v.shut += ((ph === 2 ? 1 : 0) - v.shut) * Math.min(1, dt / 300); ps.extra = v.shut; ps.atk = (e.boss.tele ?? 0) > 0 ? ((40 - (e.boss.tele ?? 0)) / 40) : 0; }
    // altitude (spec §6.4): fliers hover ~0.6 lane up, sit on a field when perched, drop when blown down; the owl by state
    let lift = 0;
    if (e.k === 'flyer') { const down = e.downUntil > S.tick; ps.mode = down ? 2 : e.perchId ? 1 : 0; lift = down ? 0 : e.perchId ? g.h * 0.3 : g.h * ((e.lane === 0 ? 0.42 : 0.62) + Math.sin(ps.t * 2.1) * 0.04); }
    if (e.k === 'ladder') { ps.mode = e.lad || 0; ps.extra = e.lad === 1 ? 1 - Math.max(0, e.ladT - S.tick) / (ENEMIES.ladder.raise || 40) : 0; }
    if (e.k === 'owl' && e.boss) {
      const st = e.boss.state; ps.mode = st === 'swoopTele' ? 1 : st === 'swoop' ? 2 : st === 'down' || st === 'landed' ? 3 : 0; ps.extra = e.boss.rage ? 1 : 0;
      const hi = e.lane === 0 ? 0.4 : 0.95; /* top lane: stay on the board, never behind the HUD */ const want = ps.mode <= 1 ? g.h * hi : ps.mode === 2 ? g.h * 0.32 : 0; v.shut += (want - v.shut) * Math.min(1, dt / 260); lift = v.shut;
      if ((e.boss.shadowUntil ?? 0) > S.tick && e.boss.shadowLane != null && e.boss.shadowLane !== e.lane) this.owlShadow(p.x + sx, e.boss.shadowLane, now);
    }
    if (e.k === 'drummer' && e.x < 80000) this.drumRings(p.x + sx, p.y + sy, e.lane, now);
    poseOf(kind, ps, this.pose);
    const rig = RIGS[kind];
    const scale = e.k === 'rhino' ? 1.2 : e.k === 'owl' ? 1.25 : e.chick ? 0.72 : e.k === 'brute' ? 1.1 : 1;
    let enter = Math.min(1, (now - v.seen) / 300);
    // 雾 (2-5): machines past the fog line are faint silhouettes unless a working 阳燧 lights the lane (spec §3.9)
    const fog = S.L.env?.fogCol; if (fog != null && e.x + (e.body ?? BODY) / 2 >= fog * 10000 && !litByBeam(S, e)) enter *= 0.15;
    const sh = lift ? Math.max(0.45, 1 - lift / (g.h * 1.4)) : 1;
    if (!this.lite) { ctx.setTransform(g.dpr, 0, 0, g.dpr, (p.x + sx) * g.dpr, (p.y + sy) * g.dpr); ctx.fillStyle = `rgba(42,27,18,${(0.28 * sh * Math.min(1, enter * 1.5)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(0, 0, rig.shadow * g.k * scale * sh, rig.shadow * g.k * 0.22 * scale * sh, 0, 0, Math.PI * 2); ctx.fill(); }
    if (e.burnUntil > S.tick) { this.spawnFlame(p.x, p.y - lift - g.h * 0.4); }
    const flash = now - v.hurt < 60 ? 0.8 : 0;
    drawRig(ctx, this.atlas, kind, this.pose, p.x + sx, p.y + sy - lift, g.k * scale, g.dpr, { white: flash, alpha: enter });
    if (e.k === 'rhino' && e.boss && (e.boss.tele ?? 0) > 0) this.chargeWarn(p.x + sx, e.lane, now); // 铜犀蓄力: the lane it will charge down glows (§3.13)
    if (e.k === 'rhino' && e.boss && e.boss.phase === 2) this.drawShellCracks(p.x + sx, p.y + sy, (e.boss.crack ?? 0) / (e.crackMax || 100));
    if (e.stuckUntil > S.tick || e.stunUntil > S.tick) this.dizzy(p.x + sx, p.y + sy - rig.height * g.k * scale - 6, now);
    if (S.mark === e.id) { ctx.setTransform(g.dpr, 0, 0, g.dpr, (p.x + sx) * g.dpr, (p.y + sy) * g.dpr); ctx.strokeStyle = FB.mark; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, rig.shadow * g.k * 1.2, rig.shadow * g.k * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  /** a volume-2 card just acted (橐 blew, 钩拒 swung, 转射机 shot) — the battle plays its sound */
  onAct?: (u: Unit) => void;
  private puffC: HTMLCanvasElement | null = null;
  private glowC: HTMLCanvasElement | null = null;
  /** one warm light sprite (#FFC86B → transparent), drawn additively and scaled */
  private glow(): HTMLCanvasElement {
    if (this.glowC) return this.glowC;
    const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(48, 48, 0, 48, 48, 48); gr.addColorStop(0, 'rgba(255,214,140,0.95)'); gr.addColorStop(0.3, 'rgba(255,190,100,0.45)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 96, 96); this.glowC = c; return c;
  }
  /** one soft smoke puff (light top, grey underside), drawn once and scaled */
  private puff(): HTMLCanvasElement {
    if (this.puffC) return this.puffC;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(56, 50, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(246,243,238,0.95)'); gr.addColorStop(0.55, 'rgba(196,191,184,0.85)'); gr.addColorStop(0.85, 'rgba(140,134,128,0.45)'); gr.addColorStop(1, 'rgba(120,114,108,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    this.puffC = c; return c;
  }
  /** 夜枭木鸢 changes lanes: its shadow slides into the new lane 3 s before it does (spec §3.13.2) */
  private owlShadow(x: number, lane: number, now: number): void {
    const g = this.geo; const ctx = this.ctx; const y = feetY(g, lane); const a = this.reduced ? 0.4 : 0.32 + 0.12 * Math.sin(now / 160);
    ctx.setTransform(g.dpr, 0, 0, g.dpr, x * g.dpr, y * g.dpr); ctx.fillStyle = `rgba(20,16,40,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(0, 0, g.w * 0.75, g.h * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-g.w * 0.62, -g.h * 0.03, g.w * 0.36, g.h * 0.07, -0.25, 0, Math.PI * 2); ctx.ellipse(g.w * 0.62, -g.h * 0.03, g.w * 0.36, g.h * 0.07, 0.25, 0, Math.PI * 2); ctx.fill();
  }
  /** 鼓声壮胆: rings of drumbeat spread over the drum cart's lane and the lanes beside it (spec §3.8) */
  private drumRings(x: number, y: number, lane: number, now: number): void {
    if (this.reduced) return; const g = this.geo; const ctx = this.ctx; const ph = ((now / 1000) * 2.2) % 1;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, x * g.dpr, (y - g.h * 0.55) * g.dpr); ctx.lineWidth = 3;
    for (const q of [ph, (ph + 0.5) % 1]) { const r = g.w * (0.35 + q * 1.1); ctx.strokeStyle = `rgba(232,195,90,${(0.55 * (1 - q)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(0, 0, r, Math.min(r * 0.9, g.h * (0.4 + q * (lane > 0 && lane < 4 ? 1.1 : 0.9))), 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  private chargeWarn(x: number, lane: number, now: number): void {
    const g = this.geo; const ctx = this.ctx; const y = laneTop(g, lane); const a = this.reduced ? 0.35 : 0.28 + 0.18 * Math.sin(now / 90);
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); const x0 = g.x0, x1 = Math.max(x0, x - g.w * 0.6);
    const grd = ctx.createLinearGradient(x1, 0, x0, 0); grd.addColorStop(0, rgba(FB.mark, a)); grd.addColorStop(1, rgba(FB.mark, 0.05));
    ctx.fillStyle = grd; ctx.fillRect(x0, y + g.h * 0.18, x1 - x0, g.h * 0.64);
    ctx.strokeStyle = `rgba(255,244,236,${Math.min(1, a + 0.35)})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const step = g.w * 0.9; const o = this.reduced ? 0 : (now / 10) % step;
    for (let X = x1 - g.w * 0.4 - o; X > x0 + 6; X -= step) { ctx.beginPath(); ctx.moveTo(X + 11, y + g.h * 0.36); ctx.lineTo(X, y + g.h * 0.5); ctx.lineTo(X + 11, y + g.h * 0.64); ctx.stroke(); }
  }
  private spawnFlame(x: number, y: number): void { if (Math.random() < 0.35) this.spawn(P_RECT, x + (Math.random() - 0.5) * 20, y, 0, -60, 0.4, 5, Math.random() < 0.5 ? '#FFB347' : '#FF6A2B'); }
  private dizzy(x: number, y: number, now: number): void {
    const g = this.geo; const ctx = this.ctx; ctx.setTransform(g.dpr, 0, 0, g.dpr, x * g.dpr, y * g.dpr); ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) { const a = now / 300 + (i * Math.PI * 2) / 3; const px = Math.cos(a) * 12, py = Math.sin(a) * 4; ctx.beginPath(); for (let j = 0; j < 10; j++) { const r = j % 2 ? 2 : 5; const an = (j / 10) * Math.PI * 2; ctx.lineTo(px + Math.cos(an) * r, py + Math.sin(an) * r); } ctx.closePath(); ctx.fill(); }
  }
  private drawShellCracks(x: number, y: number, frac: number): void {
    const g = this.geo; const ctx = this.ctx; const n = Math.min(5, Math.floor(frac * 5 + 0.0001)); if (!n) return;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, x * g.dpr, y * g.dpr); ctx.strokeStyle = 'rgba(255,248,220,0.95)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const k = g.k * 1.2;
    for (let i = 0; i < n; i++) { const cx = (-50 + i * 24) * k, cy = -70 * k; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 5 * k, cy + 10 * k); ctx.lineTo(cx - 2 * k, cy + 18 * k); ctx.lineTo(cx + 6 * k, cy + 26 * k); ctx.stroke(); }
  }
}
