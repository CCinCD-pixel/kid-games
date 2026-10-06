// The stage layer (spec §8.5 ②): units, machines, projectiles, grain, particles — drawn every frame from the kernel
// state with interpolation (alpha between the previous and the current tick). Presentation only: it reads S and the
// kernel events and never writes kernel state. Object pools keep the steady state allocation-free.
import { RIGS, poseOf, type Pose, type PoseState } from '../art/rigs';
import { drawRig, drawStats, type Atlas } from './atlas';
import { type Geo, xOf, feetY, cellCx, laneTop } from './board';
import { UNITS } from '../lane/tables';
import { BODY } from '../lane/rules';
import type { Enemy, SimEvent, SimState, Unit } from '../lane/types';

interface Vis { seen: number; walk: number; lastX: number; atk: number; atkOn: number; hurt: number; lastHp: number; lastSh: number; lastNext: number; dings: number; shut: number }
interface Particle { on: boolean; kind: number; x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; age: number; size: number; color: string; part: string; ground: number }
interface Flyer { on: boolean; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; part: string; kind: 'gear' | 'grain'; arrive?: () => void }
export interface Hover { lane: number; col: number; ok: boolean }

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
  private evIdx = 0;
  /** HUD targets (CSS px) where gears and grain fly to */
  partsBox = { x: 0, y: 0 }; grainBin = { x: 0, y: 0 };
  hover: Hover | null = null;
  reduced = false;
  onEvent: ((e: SimEvent) => void) | null = null;
  particleCap = 200;
  drawCalls = 0;

  constructor(readonly canvas: HTMLCanvasElement, atlas: Atlas, geo: Geo) {
    this.ctx = canvas.getContext('2d')!; this.atlas = atlas; this.geo = geo;
    for (let i = 0; i < 200; i++) this.parts.push({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, life: 0, age: 0, size: 0, color: '', part: '', ground: 0 });
    for (let i = 0; i < 48; i++) this.flyers.push({ on: false, x0: 0, y0: 0, x1: 0, y1: 0, t0: 0, dur: 0, part: 'gear', kind: 'gear' });
  }
  setGeo(geo: Geo, atlas: Atlas): void { this.geo = geo; this.atlas = atlas; }
  setShake(on: boolean): void { this.shakeOn = on; }
  reset(): void { this.vis.clear(); this.uvis.clear(); this.evIdx = 0; this.rolls = []; this.stamps = []; for (const p of this.parts) p.on = false; for (const f of this.flyers) f.on = false; }
  /** after a kernel restore the event list starts again */
  rewindEvents(n = 0): void { this.evIdx = n; }

  shake(px: number, ms: number, now: number): void { if (!this.shakeOn || this.reduced) return; this.shakeAmp = Math.max(this.shakeAmp, px); this.shakeUntil = Math.max(this.shakeUntil, now + ms); }

  private spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, part = '', ground = 0): void {
    let p = this.parts.find((q) => !q.on);
    if (!p) { p = this.parts.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b)); }
    p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = Math.random() * 6; p.vr = (Math.random() - 0.5) * 12; p.life = life; p.age = 0; p.size = size; p.color = color; p.part = part; p.ground = ground;
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
        if (now - v.hurt > 120) { v.hurt = now; const p = this.enemyXY(e, 1); this.chips(p.x - g.w * 0.2, p.y - g.h * 0.4, e.k === 'ant' ? 1 : 3, e.mat === 'metal' ? ['#ffd968', '#c9a23a'] : WOOD_CHIPS); }
      }
      if ((e.dings || 0) > v.dings) { if (now - v.atkOn > 400) { const p = this.enemyXY(e, 1); this.sparks(p.x - g.w * 0.25, p.y - g.h * 0.5); this.ding(p.x - g.w * 0.1, p.y - g.h * 0.85); v.atkOn = now; } v.dings = e.dings || 0; }
      v.lastHp = e.hp; v.lastSh = e.sh;
    }
    for (const u of S.units) {
      let v = this.uvis.get(u.id);
      if (!v) { v = { seen: now, walk: 0, lastX: 0, atk: 0, atkOn: 0, hurt: 0, lastHp: u.hp, lastSh: 0, lastNext: u.next, dings: 0, shut: 0 }; this.uvis.set(u.id, v); }
      if (u.next !== v.lastNext) { if (u.acted && ['shooter', 'lobber', 'burner', 'farm'].includes(u.k) && u.next > v.lastNext + 4) v.atkOn = now; v.lastNext = u.next; }
      if (u.hp < v.lastHp) { if (now - v.hurt > 300) v.hurt = now; }
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
          this.breakApart(x, y, g.k, e.k === 'ant' ? 2 : 5, e.k === 'brute' || e.k === 'rhino' ? 'chip' : 'plank');
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
    if (this.hover) {
      const h = this.hover; const x = g.x0 + h.col * g.w, y = laneTop(g, h.lane);
      T(0, 0); ctx.fillStyle = h.ok ? 'rgba(52,190,120,0.3)' : 'rgba(220,60,50,0.18)'; ctx.fillRect(x + 2, y + 2, g.w - 4, g.h - 4);
      ctx.strokeStyle = h.ok ? 'rgba(30,140,90,0.9)' : 'rgba(200,40,40,0.9)'; ctx.lineWidth = 2.5; ctx.strokeRect(x + 3, y + 3, g.w - 6, g.h - 6);
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
    // smoke (vol 2)
    for (let l = 0; l < 5; l++) for (let c = 0; c < 8; c++) if (S.smoke[l][c] > S.tick) { T(0, 0); ctx.fillStyle = 'rgba(142,138,134,0.75)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cellCx(g, c) + Math.sin(t + i * 2 + c) * g.w * 0.2, laneTop(g, l) + g.h * (0.3 + i * 0.2), g.w * 0.32, 0, Math.PI * 2); ctx.fill(); } }

    // ── 檑木 rolling down a lane ──
    this.rolls = this.rolls.filter((r) => now - r.t0 < 1400);
    for (const r of this.rolls) { const p = (now - r.t0) / 1400; const x = g.x0 + p * g.w * 8.6; T(x, feetY(g, r.lane) - g.h * 0.1); ctx.rotate(p * 30); ctx.scale(g.k * 1.5, g.k * 1.5); ctx.translate(-10, -10); this.atlas.part(ctx, 'log'); drawStats.calls++; }

    // ── grain bags ──
    for (const d of S.drops) {
      const p = this.dropXY(S, d, now); const age = (S.tick - d.t) / 20; const pop = Math.min(1, age * 4);
      T(p.x, p.y); ctx.fillStyle = 'rgba(255,214,120,0.35)'; ctx.beginPath(); ctx.arc(0, 0, g.w * 0.22 * (1 + Math.sin(now / 220) * 0.08), 0, Math.PI * 2); ctx.fill();
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

  private drawUnit(S: SimState, u: Unit, now: number, sx: number, sy: number): void {
    const g = this.geo; const ctx = this.ctx;
    let v = this.uvis.get(u.id);
    if (!v) { v = { seen: now, walk: 0, lastX: 0, atk: 0, atkOn: 0, hurt: 0, lastHp: u.hp, lastSh: 0, lastNext: u.next, dings: 0, shut: 0 }; this.uvis.set(u.id, v); }
    const ps = this.ps; ps.t = now / 1000 + u.id * 0.37; ps.walk = 0; ps.hurt = 0; ps.mode = 0; ps.hp = u.max ? u.hp / u.max : 1; ps.extra = 0;
    ps.atk = v.atkOn ? (now - v.atkOn) / (u.k === 'lobber' ? 600 : u.k === 'burner' ? 700 : 320) : 0; if (ps.atk > 1) ps.atk = 0;
    if (u.k === 'spikes') { ps.extra = Math.max(1, 5 - u.wear); ps.atk = 0; }
    if (u.k === 'pit') ps.mode = S.tick >= u.armAt ? 1 : 0;
    if (u.k === 'wall') { ps.extra = u.fortUntil > S.tick ? 1 : 0; ps.hurt = now - v.hurt < 200 ? 1 : 0; }
    poseOf(u.k, ps, this.pose);
    const p = this.unitXY(u);
    const age = (now - v.seen) / 220; let yOff = 0, sc = 1;
    if (age < 1 && !this.reduced) { const e = age; yOff = -30 * (1 - e) * (1 - e); sc = e < 0.6 ? 1 + 0.15 * (e / 0.6) : 1.15 - 0.2 * ((e - 0.6) / 0.4); if (e > 0.9) sc = 0.95 + 0.05 * ((e - 0.9) / 0.1); }
    // shadow
    const rig = RIGS[u.k];
    if (rig && rig.shadow) { ctx.setTransform(g.dpr, 0, 0, g.dpr, (p.x + sx) * g.dpr, (p.y + sy) * g.dpr); ctx.fillStyle = 'rgba(42,27,18,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, rig.shadow * g.k, rig.shadow * g.k * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    const flash = now - v.hurt < 60 ? 0.85 : 0;
    drawRig(ctx, this.atlas, rig ? u.k : 'shooter', this.pose, p.x + sx, p.y + yOff + sy, g.k * sc, g.dpr, { white: flash });
    if (u.k === 'wall' && u.max) this.drawCracks(p.x + sx, p.y + sy, u.hp / u.max);
    if (u.pin) this.badge(p.x + sx, p.y + sy - g.h * 0.85, '压');
    if (u.k === 'beam' && u.tgt) { const e = S.enemies.find((q) => q.id === u.tgt); if (e) this.beamTo(p.x + g.w * 0.1 + sx, p.y - g.h * 0.55 + sy, e, u.tOn); }
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
    poseOf(kind, ps, this.pose);
    const rig = RIGS[kind];
    const scale = e.k === 'rhino' ? 1.2 : e.k === 'brute' ? 1.1 : 1;
    const enter = Math.min(1, (now - v.seen) / 300);
    ctx.setTransform(g.dpr, 0, 0, g.dpr, (p.x + sx) * g.dpr, (p.y + sy) * g.dpr); ctx.fillStyle = 'rgba(42,27,18,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, rig.shadow * g.k * scale, rig.shadow * g.k * 0.22 * scale, 0, 0, Math.PI * 2); ctx.fill();
    if (e.burnUntil > S.tick) { this.spawnFlame(p.x, p.y - g.h * 0.4); }
    const flash = now - v.hurt < 60 ? 0.8 : 0;
    drawRig(ctx, this.atlas, kind, this.pose, p.x + sx, p.y + sy, g.k * scale, g.dpr, { white: flash, alpha: enter });
    if (e.k === 'rhino' && e.boss && e.boss.phase === 2) this.drawShellCracks(p.x + sx, p.y + sy, (e.boss.crack ?? 0) / (e.crackMax || 100));
    if (e.stuckUntil > S.tick || e.stunUntil > S.tick) this.dizzy(p.x + sx, p.y + sy - rig.height * g.k * scale - 6, now);
    if (S.mark === e.id) { ctx.setTransform(g.dpr, 0, 0, g.dpr, (p.x + sx) * g.dpr, (p.y + sy) * g.dpr); ctx.strokeStyle = '#d23a2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, rig.shadow * g.k * 1.2, rig.shadow * g.k * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); }
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
