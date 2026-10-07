/**
 * Frame builder (spec §8.6 world-view): camera springs (§3.14), culling + LOD, and every sprite of a frame
 * in the spec's paint order: decals → item glows (add) → items → shadows → snakes (small→large, him last;
 * tail→head, then head, eyes, accessories) → boost glow / shield / magnet (add) → particles.
 * Body segments are sampled from the path at 0.45 r behind the interpolated head (0.6 r / 0.8 r LOD when
 * the screen holds >2 500 / >4 000 segments), so motion is smooth at 60 fps with a 60 Hz sim.
 */
import { Blend, Renderer } from './gl';
import { Fx, rnd, FX_KEYFRAMES as KF, pulse } from './fx';
import { buildAtlas, addColorSprites, aiBodyOn, skinBaseOn, hex2rgb, skinById, segVariant, ballOf, STAR_COLORS, mix, type Rgb, type Atlas, type AtlasColor, type SkinDef } from './art';
import { HEAD_HS, EYE_SPOT, eyeLayout, extrasOf, DECO, DECO_K, spawnTrail, TRAIL_FOOD, TRAIL_EVERY, type EyeSpot } from './skins';
import { FLOORS } from '../sim/venues';
import { angDiff, type Snake, type Food } from '../sim/core';
import type { Match } from '../match';

const KIND: Record<string, number> = { moon: 0, mars: 1, jupiter: 2, saturn: 4, blackhole: 3 };
const ACCENT: Record<string, Rgb> = { moon: [131, 215, 102], mars: [255, 150, 90], jupiter: [255, 200, 110], blackhole: [170, 130, 255], saturn: [240, 205, 140] };

interface Look { key: string; base: Rgb; pattern: string; eyes: string; head: string; skin?: SkinDef; eye: EyeSpot; extras: string[]; persona: string }
interface Bulge { t: number; amp: number }
interface Ghost { segs: Float32Array; n: number; key: string; pattern: string; t: number; x: number; y: number; a: number; r: number; look: Look }

const starRgb = STAR_COLORS.map(hex2rgb);
const hash2 = (x: number, y: number) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return h - Math.floor(h); };

export class WorldView {
  R: Renderer; fx = new Fx(); atlas: Atlas;
  camX = 0; camY = 0; zoom = 1.25; zoomV = 0; camVX = 0; camVY = 0;
  private looks = new Map<number, Look>();
  private bulges = new Map<number, Bulge[]>();
  private ghosts: Ghost[] = [];
  private decals: { x: number; y: number; s: number; r: number }[] = [];
  private lanterns: { x: number; y: number }[] = [];
  private blink = new Map<number, number>();
  happyUntil = 0; time = 0;
  /** death focus (slow-mo push-in + gold pulse on the lethal segment and killer head) */
  focus: { x: number; y: number; killer: number; t0: number } | null = null;
  segCount = 0;
  private trailT = 0; private rippleT = -9;
  onRipple: (() => void) | null = null;
  boostHeld = 0;
  /** dev/QA close-ups only (contact sheet); 1 in play */
  zoomMul = 1;
  private segBuf = new Float32Array(3 * 6000);

  /** his boost-trail style (§4.6) and whether he wears the 蛇王冠 (owned + on, or forced in c5m8) */
  trail = 'stardust'; crownMe = false;
  private boostT = new Map<number, number>();
  private smokeT = 0;

  /** `renderer`: the app keeps ONE canvas + WebGL context for the whole session (WebKit kills the oldest
   *  context past 16 per page — a new context per match would eventually kill the live one) */
  constructor(canvas: HTMLCanvasElement, private match: Match, o: { trail?: string; crown?: boolean; renderer?: Renderer } = {}) {
    const w = match.world;
    this.trail = o.trail ?? 'stardust'; this.crownMe = !!o.crown;
    const colors: AtlasColor[] = [];
    for (const s of w.snakes) { const [look, col] = this.makeLook(s); this.looks.set(s.id, look); if (!colors.some((c) => c.key === col.key)) colors.push(col); }
    this.atlas = buildAtlas(colors, match.floor, { trail: this.trail });
    if (o.renderer) { o.renderer.setAtlas(this.atlas); this.R = o.renderer; } else this.R = new Renderer(canvas, this.atlas);
    const v = { R: match.arenaR };
    const fl = FLOORS[match.floor].map((h) => hex2rgb(h).map((c) => c / 255) as [number, number, number]);
    this.R.floorParams = { R: v.R, c: fl, accent: ACCENT[match.floor].map((c) => c / 255) as [number, number, number], kind: KIND[match.floor] };
    // seeded decals (6–10 per 1000² wu) and fence lanterns every 200 wu
    let sd = match.seed >>> 0;
    const r = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const nDec = Math.round((Math.PI * v.R * v.R) / 1e6 * 7);
    for (let i = 0; i < nDec; i++) { const rr = (v.R - 80) * Math.sqrt(r()), a = r() * Math.PI * 2; this.decals.push({ x: Math.cos(rr ? a : 0) * rr, y: Math.sin(a) * rr, s: 30 + r() * 70, r: r() * 6.28 }); }
    const nL = Math.round((2 * Math.PI * v.R) / 200);
    for (let i = 0; i < nL; i++) { const a = (i / nL) * Math.PI * 2; this.lanterns.push({ x: Math.cos(a) * (v.R + 26), y: Math.sin(a) * (v.R + 26) }); }
    const me = match.me; this.camX = me.x; this.camY = me.y;
    // presentation hook: suction of every eaten food toward that snake's mouth + swallow bulge
    w.onEat = (s, f) => this.onEat(s, f);
  }

  lookOf(s: Snake): Look {
    let l = this.looks.get(s.id);
    if (!l) { const [look, col] = this.makeLook(s); this.looks.set(s.id, look); addColorSprites(this.atlas, col); l = look; }   // snakes added mid-match (guards, c5m1 big snake)
    return l;
  }
  /** persona / skin look (§6.4): body colour + pattern, head painter, where and how the eyes are drawn */
  private makeLook(s: Snake): [Look, AtlasColor] {
    if (s.isPlayer) {
      const sk = skinById(s.skin ?? 'venus'), { base, lift } = skinBaseOn(sk, this.match.floor), key = `skin-${sk.id}${lift ? `-${this.match.floor}` : ''}`;
      return [{ key, base, pattern: sk.pattern, eyes: sk.eyes, head: sk.head, skin: sk, eye: eyeLayout(sk.head, sk.eyes), extras: extrasOf(sk), persona: 'me' }, { key, base, accent: hex2rgb(sk.accent), pattern: sk.pattern, blush: true, skin: sk }];
    }
    const mp = s.missionPersona;
    if (s.king) { const base: Rgb = [246, 196, 58]; return [{ key: 'king', base, pattern: 'king', eyes: 'king', head: 'round', eye: { ...EYE_SPOT.round, mode: 'dragon', er: 0.27 }, extras: [], persona: 'king' }, { key: 'king', base, accent: [255, 120, 60], pattern: 'king' }]; }
    if (mp === 'patrol') { const base: Rgb = [127, 147, 181]; return [{ key: 'patrol', base, pattern: 'patrol', eyes: 'forager', head: 'round', eye: EYE_SPOT.round, extras: [], persona: 'patrol' }, { key: 'patrol', base, accent: [200, 215, 240], pattern: 'patrol' }]; }
    let base = aiBodyOn(s.color ?? '灰', s.persona, this.match.floor);
    if (mp === 'sleeper') { const g = (base[0] + base[1] + base[2]) / 3; base = mix(base, [g, g, g], 0.3); }
    const key = `${s.color}-${s.persona}${mp === 'sleeper' ? '-z' : ''}`;
    return [{ key, base, pattern: s.persona, eyes: s.persona, head: 'round', eye: EYE_SPOT.round, extras: [], persona: mp === 'sleeper' ? 'sleeper' : s.persona }, { key, base, accent: mix(base, [255, 255, 255], 0.35), pattern: s.persona }];
  }
  colorOf(s: Snake): Rgb { return this.lookOf(s).base; }

  private onEat(s: Snake, f: Food) {
    const big = f.kind === 'big' || f.v >= 5;
    const list = this.bulges.get(s.id) ?? []; if (list.length < 3) list.push({ t: this.time, amp: big ? 0.3 : 0.18 }); this.bulges.set(s.id, list);
    if (!this.onScreen(f.x, f.y, 40)) return;
    const col = this.foodColor(f);
    this.fx.suck(f.x, f.y, this.foodR(f), col, () => (s.alive ? [s.x + Math.cos(s.angle) * s.r * 0.6, s.y + Math.sin(s.angle) * s.r * 0.6] : null));
    if (big && s.isPlayer) { this.fx.burst(f.x, f.y, [255, 216, 77], 6, 160, 7, 'spark', 0.5); this.happyUntil = this.time + 0.6; }
  }

  foodColor(f: Food): Rgb {
    if (f.kind === 'big') return [255, 210, 63];
    if (f.color) return aiBodyOn(f.color, 'forager', this.match.floor);
    if (f.kind === 'trail') return TRAIL_FOOD[this.trail] ?? this.lookOf(this.match.me).base;
    if (f.kind === 'drop') return this.lookOf(this.match.me).base;
    return starRgb[Math.floor(hash2(f.born * 7 + f.x, f.y) * 8)];
  }
  foodR(f: Food) { return f.kind === 'orb' ? 5 : f.kind === 'orb2' ? 7 : f.kind === 'big' ? 11 : f.kind === 'trail' ? 3 + Math.min(2, f.v) : 6 + 1.6 * Math.sqrt(f.v); }

  /** snapshot a dying snake so its body can brighten and shrink after the sim removed it */
  ghost(s: Snake) {
    const n = this.sampleBody(s, s.x, s.y, 0.45, this.segBuf);
    const look = this.lookOf(s); this.ghosts.push({ segs: this.segBuf.slice(0, n * 3), n, key: look.key, pattern: look.pattern, t: this.time, x: s.x, y: s.y, a: s.angle, r: s.r, look });
  }

  // camera ------------------------------------------------------------------
  vw = 810; vh = 1080;
  resize(w: number, h: number, dpr: number) { this.vw = w; this.vh = h; this.R.resize(w, h, dpr); }
  onScreen(x: number, y: number, pad: number) {
    const hw = this.vw / 2 / this.zoom + pad, hh = this.vh / 2 / this.zoom + pad;
    return Math.abs(x - this.camX) < hw && Math.abs(y - this.camY) < hh;
  }
  worldToScreen(x: number, y: number): [number, number] { return [(x - this.camX) * this.zoom + this.vw / 2, (y - this.camY) * this.zoom + this.vh / 2]; }

  updateCamera(dt: number, hx: number, hy: number, ang: number) {
    const m = this.match;
    const vs = m.viewScale();
    let targetZ = (1.25 / vs) * this.zoomMul;
    if (m.me.boost) targetZ /= 1.06;
    if (this.focus) targetZ *= this.fx.reduced ? 1 : 1.25;
    // critically damped springs: zoom ω=3, position ω=8 (spec §3.14)
    const sz = 3, sp = 8;
    const ax = this.focus ? this.focus.x : hx + Math.cos(ang) * 60 * vs, ay = this.focus ? this.focus.y : hy + Math.sin(ang) * 60 * vs;
    this.zoomV += (sz * sz * (targetZ - this.zoom) - 2 * sz * this.zoomV) * dt; this.zoom += this.zoomV * dt;
    this.camVX += (sp * sp * (ax - this.camX) - 2 * sp * this.camVX) * dt; this.camX += this.camVX * dt;
    this.camVY += (sp * sp * (ay - this.camY) - 2 * sp * this.camVY) * dt; this.camY += this.camVY * dt;
  }

  // body sampling -----------------------------------------------------------
  /** fill out[x,y,s] every k·r along the body behind (hx,hy); returns count */
  sampleBody(s: Snake, hx: number, hy: number, k: number, out: Float32Array) {
    const r = s.r, sp = k * r, L = s.L;
    const p0 = s.idx(0);
    const p0x = s.px[p0], p0y = s.py[p0];
    const d0 = Math.hypot(hx - p0x, hy - p0y);
    let n = 0; const max = out.length / 3;
    for (let d = sp * 0.6; d <= L && n < max; d += sp) {
      let x: number, y: number;
      if (d <= d0) { const t = d0 > 0 ? d / d0 : 0; x = hx + (p0x - hx) * t; y = hy + (p0y - hy) * t; }
      else {
        const f = (d - d0) / 5; const i = Math.floor(f);
        if (i + 1 >= s.n) break;
        const a = s.idx(i), b = s.idx(i + 1), t = f - i;
        x = s.px[a] + (s.px[b] - s.px[a]) * t; y = s.py[a] + (s.py[b] - s.py[a]) * t;
      }
      out[n * 3] = x; out[n * 3 + 1] = y; out[n * 3 + 2] = d; n++;
    }
    return n;
  }

  // frame -------------------------------------------------------------------
  frame(dt: number) {
    this.time += dt;
    const m = this.match, w = m.world, R = this.R, al = m.alpha;
    const me = m.me;
    const hxOf = (s: Snake) => { const i = s.id, px = m.prevX[i], py = m.prevY[i]; return Math.abs(px - s.x) + Math.abs(py - s.y) > 60 ? s.x : px + (s.x - px) * al; };
    const hyOf = (s: Snake) => { const i = s.id, px = m.prevX[i], py = m.prevY[i]; return Math.abs(px - s.x) + Math.abs(py - s.y) > 60 ? s.y : py + (s.y - py) * al; };
    if (me.alive) this.updateCamera(dt, hxOf(me), hyOf(me), me.angle);
    else this.updateCamera(dt, this.camX, this.camY, 0);
    this.fx.update(dt * (m.state === 'dying' ? 0.35 : 1));
    // his boost trail (6 styles, §4.6) at the tail + 火车头 chimney smoke every 1.2 s
    this.trailT -= dt;
    if (me.alive && me.boost && this.trailT <= 0) {
      this.trailT = TRAIL_EVERY[this.trail] ?? 0.035;
      const ti = Math.min(me.n - 1, Math.floor(me.L / 5)), q = me.idx(ti), qa = me.idx(Math.max(0, ti - 2));
      spawnTrail(this.fx, this.trail, me.px[q], me.py[q], Math.atan2(me.py[qa] - me.py[q], me.px[qa] - me.px[q]), me.r, this.time);
    }
    this.smokeT -= dt;
    if (me.alive && this.lookOf(me).head === 'loco' && this.smokeT <= 0) {
      this.smokeT = 1.2;
      const c = Math.cos(me.angle), sn = Math.sin(me.angle);
      for (let k = 0; k < 3; k++) this.fx.spawn({ x: me.x + c * me.r * 0.3 + (rnd() - 0.5) * 4, y: me.y + sn * me.r * 0.3 + (rnd() - 0.5) * 4, vx: -c * 30 + (rnd() - 0.5) * 18, vy: -sn * 30 + (rnd() - 0.5) * 18 - 8, life: 1.3 + k * 0.15, size: me.r * 0.35, size1: me.r * (0.9 + k * 0.2), key: 'dot', r: 70, g: 72, b: 84, blend: Blend.Normal, drag: 1.2 });
    }
    if (me.alive && me.touching && this.time - this.rippleT > 0.5) {
      this.rippleT = this.time; const d = Math.hypot(me.x, me.y) || 1, R0 = m.arenaR;
      if (!this.nearRock(me)) this.fx.shockwave((me.x / d) * R0, (me.y / d) * R0, ACCENT[m.floor], 10, 70, 0.4);
      this.onRipple?.();
    }
    const [shx, shy] = this.fx.shakeOffset();
    R.begin();
    const T = this.time;
    // ---- decals + fence lanterns
    R.layer(Blend.Normal);
    for (const d of this.decals) if (this.onScreen(d.x, d.y, d.s)) R.push(d.x, d.y, d.s, d.s, d.r, 'decal', 255, 255, 255, 130);
    // ---- item glows (additive)
    R.layer(Blend.Add);
    const hw = this.vw / 2 / this.zoom + 40, hh = this.vh / 2 / this.zoom + 40;
    const items: Food[] = [];
    w.food.query(this.camX, this.camY, Math.max(hw, hh), (f) => { if (Math.abs(f.x - this.camX) < hw && Math.abs(f.y - this.camY) < hh) items.push(f); });
    for (const f of items) {
      const c = this.foodColor(f), r = this.foodR(f);
      const ph = hash2(f.x, f.born);
      let a = 0.55 * (1 + 0.15 * Math.sin(T * 3.93 + ph * 6.28));
      let k = 1;
      if (f.drop && f.die - w.t < 5) { const q = Math.max(0, (f.die - w.t) / 5); a *= q; k = 0.6 + 0.4 * q; }
      const gl = f.kind === 'drop' ? 2.4 : f.kind === 'big' ? 2.6 : 2.8;
      R.push(f.x, f.y, r * gl * k, r * gl * k, 0, 'dot', c[0], c[1], c[2], Math.round(255 * a));
    }
    for (const p of w.pus) if (this.onScreen(p.x, p.y, 60)) R.push(p.x, p.y, 44, 44, 0, 'dot', p.kind === 'magnet' ? 255 : p.kind === 'shield' ? 90 : 255, p.kind === 'shield' ? 220 : 200, p.kind === 'speed' ? 80 : 255, 120);
    for (const mt of w.meteors) if (this.onScreen(mt.x, mt.y, 80)) {
      R.push(mt.x, mt.y, 40, 40, 0, 'dot', 255, 140, 200, 150);
      for (let i = 1; i <= 6; i++) { const q = i / 6, c = starRgb[(i + Math.floor(T * 4)) % 8]; R.push(mt.x - mt.vx * 0.06 * i, mt.y - mt.vy * 0.06 * i, 14 * (1 - q * 0.6), 14 * (1 - q * 0.6), 0, 'dot', c[0], c[1], c[2], Math.round(200 * (1 - q))); }
    }
    // ---- items (normal)
    R.layer(Blend.Normal);
    for (const f of items) {
      const c = this.foodColor(f), r = this.foodR(f);
      let k = 1, a = 255;
      if (f.drop && f.die - w.t < 5) { const q = Math.max(0, (f.die - w.t) / 5); k = 0.6 + 0.4 * q; a = Math.round(255 * q); }
      if (f.kind === 'big') { const b = 1 + 0.08 * Math.sin(T * 5.24 + f.x); R.push(f.x, f.y, r * 1.3 * b, r * 1.3 * b, T * 0.35 + f.y, 'big'); continue; }
      const born = Math.min(1, (w.t - f.born) / 0.22); const pop = born < 1 ? born * (1.2 - 0.2 * born) : 1;
      R.push(f.x, f.y, r * k * pop, r * k * pop, 0, 'orbcore', c[0], c[1], c[2], a);
      R.push(f.x - r * 0.25, f.y - r * 0.3, r * 0.35 * k, r * 0.35 * k, 0, 'disc', 255, 255, 255, Math.round(a * 0.8));
    }
    for (const p of w.pus) if (this.onScreen(p.x, p.y, 40)) { const bob = Math.sin(T * Math.PI + p.x) * 4; R.push(p.x, p.y + bob, 24, 24, 0, `pu-${p.kind}`); }
    for (const mt of w.meteors) if (this.onScreen(mt.x, mt.y, 40)) R.push(mt.x, mt.y, 16, 16, T * 4, 'meteor');
    for (const l of this.lanterns) if (this.onScreen(l.x, l.y, 40)) R.push(l.x, l.y, 22, 22, 0, 'lantern');
    this.drawMissionGround(T);
    // ---- snakes
    const alive = w.snakes.filter((s) => s.alive && this.onScreenSnake(s));
    alive.sort((a, b) => (a.isPlayer ? 1 : b.isPlayer ? -1 : a.mass - b.mass));
    let totalSeg = 0;
    for (const s of alive) totalSeg += s.L / (0.45 * s.r);
    const lod = totalSeg > 4000 ? 0.8 : totalSeg > 2500 ? 0.6 : 0.45;
    // shadows (one pass under all snakes)
    R.layer(Blend.Normal);
    const seg = this.segBuf;
    const counts = new Map<number, number>();
    const starts = new Map<number, Float32Array>();
    for (const s of alive) {
      const k = s.isPlayer ? 0.45 : lod;
      const n = this.sampleBody(s, hxOf(s), hyOf(s), k, seg);
      const copy = seg.slice(0, n * 3); starts.set(s.id, copy); counts.set(s.id, n);
      const sa = this.spawnAge(s);
      if (this.R.quality > 0) for (let i = n - 1; i >= 0; i -= 2) {
        const gk = sa < 0.6 ? Math.max(0, Math.min(1, (sa - i * 0.004) / 0.2)) : 1;   // the shadow grows in with its segment (QA r4)
        if (gk > 0.01) R.push(copy[i * 3] + 4, copy[i * 3 + 1] + 6, s.r * 1.25 * gk, s.r * 1.25 * gk, 0, 'shadow', 255, 255, 255, s.protect > 0 ? 50 : 110);
      }
    }
    this.segCount = 0;
    for (const s of alive) this.drawSnake(s, starts.get(s.id)!, counts.get(s.id)!, hxOf(s), hyOf(s));
    // ghosts of snakes that just went out: each segment brightens once (60 ms, head→tail 2 ms apart), then shrinks (300 ms)
    for (let gi = this.ghosts.length - 1; gi >= 0; gi--) {
      const g = this.ghosts[gi]; const age = this.time - g.t;
      if (age > 0.9) { this.ghosts.splice(gi, 1); continue; }
      for (let i = g.n - 1; i >= 0; i--) {
        const la = age - i * 0.002; if (la < 0) { R.push(g.segs[i * 3], g.segs[i * 3 + 1], g.r, g.r, 0, `seg:${g.key}:plain`); continue; }
        const sc = la < 0.06 ? 1 : Math.max(0, 1 - (la - 0.06) / 0.3);
        if (sc <= 0) continue;
        R.push(g.segs[i * 3], g.segs[i * 3 + 1], g.r * sc, g.r * sc, 0, `seg:${g.key}:${ballOf(segVariant(g.pattern, i, g.n))}`);
      }
      if (age < 0.5) { const gl = g.look; const hs = gl.skin ? g.r * HEAD_HS : g.r * 1.24; R.push(g.x, g.y, gl.skin ? hs : hs * 1.15, hs, g.a + age * 6, `head:${g.key}`); this.eyes(g.x, g.y, g.a + age * 6, g.r, gl, 'x', 0, 0); }
    }
    // ---- additive accents: boost glow, shield, magnet, protect ring, death focus pulse
    R.layer(Blend.Add);
    for (const s of alive) {
      const n = counts.get(s.id)!, b = starts.get(s.id)!, c = this.colorOf(s);
      if (s.boost && R.quality > 0) {
        const hue = 0.9 + 0.1 * Math.sin(T * 2 * Math.PI * 1.6);
        for (let i = 0; i < n; i += 2) R.push(b[i * 3], b[i * 3 + 1], s.r * 1.35, s.r * 1.35, 0, 'dot', c[0] * hue, c[1], c[2] * (2 - hue), 120);
      }
      const hx = hxOf(s), hy = hyOf(s);
      // the 领航员 demo snake (H2 clip / H3 示范): a soft pulsing gold halo along the whole body, so the demo reads as
      // a ghost guide and never as his own snake playing (QA r5)
      if (s.isPlayer && this.match.demo) {
        const gp = Math.round(70 + 30 * Math.sin(T * 2 * Math.PI * 0.8));
        for (let i = 0; i < n; i += 2) R.push(b[i * 3], b[i * 3 + 1], s.r * 1.7, s.r * 1.7, 0, 'dot', 255, 205, 70, gp);
        R.push(hx, hy, s.r * 2.6, s.r * 2.6, 0, 'dot', 255, 215, 90, gp + 40);
      }
      this.drawGlows(s, hx, hy, b, n, T);
      if (s.shield > 0) R.push(hx, hy, s.r * 1.75, s.r * 1.75, T * 1.2, 'hex', 90, 230, 255, s.shield < 1.5 ? pulse(KF.shieldEnding, T) : 210);
      if (s.magnet > 0) R.push(hx, hy, 70, 70, -T * 2, 'ring', 255, 120, 160, 90);
      if (s.protect > 0) {
        const frac = Math.min(1, s.protect / 2.5), dots = Math.round(24 * frac);
        for (let i = 0; i < dots; i++) { const a = -Math.PI / 2 + (i / 24) * Math.PI * 2; R.push(hx + Math.cos(a) * s.r * 1.9, hy + Math.sin(a) * s.r * 1.9, 3.2, 3.2, 0, 'dot', 255, 255, 255, 220); }
      }
    }
    if (this.focus) {
      const ft = this.time - this.focus.t0;
      if (ft < 0.75) { const pulse = 0.8 + 0.2 * Math.sin(ft * 2 * Math.PI * 2.9); R.push(this.focus.x, this.focus.y, 36, 36, 0, 'ring', 255, 210, 63, Math.round(230 * pulse)); const k = w.byId.get(this.focus.killer); if (k?.alive) R.push(hxOf(k), hyOf(k), k.r * 1.8, k.r * 1.8, 0, 'ring', 255, 210, 63, Math.round(230 * pulse)); }
    }
    this.fx.draw(R, Blend.Add);
    R.layer(Blend.Normal);
    this.fx.draw(R, Blend.Normal);
    this.drawMissionOver(T, hxOf, hyOf);
    // "you are here" arrow 1.5 s after his (re)spawn
    if (me.alive && w.t - me.spawnT < 1.5) { const bob = Math.sin(T * 6) * 6; R.push(hxOf(me), hyOf(me) - me.r * 2.6 + bob, 16, 16, 0, 'arrow'); }
    R.draw(this.camX + shx / this.zoom, this.camY + shy / this.zoom, this.zoom, T);
  }

  private onScreenSnake(s: Snake) {
    if (this.onScreen(s.x, s.y, s.r * 3)) return true;
    // the body can be on screen while the head is not: sample a few path points
    const step = Math.max(1, Math.floor(s.L / 5 / 8));
    for (let i = 0; i < s.n && i * 5 < s.L; i += step) { const q = s.idx(i); if (this.onScreen(s.px[q], s.py[q], s.r * 2)) return true; }
    return false;
  }

  /** seconds since this snake appeared, for the spawn-grow. The opening roster grows in on the render clock, which
   * starts with the 3-2-1 (the sim clock is frozen at 0 until GO, so the snakes were invisible all countdown — QA r4);
   * first run: the sim waits for his first touch — he idles fully drawn, breathing (spec §2.6) */
  spawnAge(s: Snake) { return this.match.waitTouch ? 1 : s.spawnT <= 0 ? Math.max(this.time, this.match.world.t) : this.match.world.t - s.spawnT; }

  private drawSnake(s: Snake, b: Float32Array, n: number, hx: number, hy: number) {
    const R = this.R, look = this.lookOf(s), r = s.r, T = this.time;
    // the H3 示范 snake is the 领航员's semi-transparent ghost, not his own (spec §5.1/§8.10, QA r1)
    const alpha = s.isPlayer && this.match.demo ? 110 : s.protect > 0 ? 140 : 255;
    const age = this.spawnAge(s);
    const bl = this.bulges.get(s.id);
    if (bl) for (let i = bl.length - 1; i >= 0; i--) if (T - bl[i].t > 0.9) bl.splice(i, 1);
    const tailStart = n * 0.88, pat = look.pattern;
    const mode = (s.brain as { mode?: string } | null)?.mode;
    const ph = pat === 'tracks' && s.boost ? Math.floor(T * 12) : 0;   // crawler cleats roll while boosting
    const coilGlow = look.persona === 'coiler' && mode === 'coil';
    if (s.isPlayer && age >= 0.6) for (let i = n - 1; i >= 0; i -= 1) {   // his thin white outline (find yourself at a glance, §6.4)
      const k = i > tailStart ? 1 - 0.45 * ((i - tailStart) / (n - tailStart)) : 1;
      R.push(b[i * 3], b[i * 3 + 1], r * k * 1.07, r * k * 1.07, 0, 'disc', 255, 255, 255, Math.round(alpha * 0.85));
    }
    for (let i = n - 1; i >= 0; i--) {
      let k = 1;
      if (i > tailStart) k = 1 - 0.45 * ((i - tailStart) / (n - tailStart));
      if (bl && bl.length) for (const q of bl) { const k0 = (T - q.t) * 60; if (k0 < 40) { const d = i - k0; k += q.amp * Math.exp(-d * d / 6) * (1 - k0 / 40) * (this.fx.reduced ? 0.5 : 1); } }
      if (age < 0.6) k *= Math.max(0, Math.min(1, (age - i * 0.004) / 0.2));
      if (k <= 0.01) continue;
      const v = segVariant(pat, i, n, ph), x = b[i * 3], y = b[i * 3 + 1];
      const a = pat === 'fade' && i > n * 0.7 ? Math.round(alpha * (1 - 0.7 * (i / n - 0.7) / 0.3)) : alpha;   // 彗星: the tail fades out
      const kk = v === 'coupler' ? k * 0.7 : k;
      R.push(x, y, r * kk, r * kk, 0, `seg:${look.key}:${ballOf(v)}`, 255, 255, 255, a);
      if (DECO.has(v)) {
        const px = i ? b[(i - 1) * 3] : hx, py = i ? b[(i - 1) * 3 + 1] : hy, dk = DECO_K[v] ?? 1;
        const rot = v === 'swirl' ? i * 0.8 - T * 1.8 : Math.atan2(py - y, px - x);
        R.push(x, y, r * kk * dk, r * kk * dk, rot, `deco:${look.key}:${v}`, 255, 255, 255, a);
      }
      // 圈圈 encircling: its bright rings light up one after another (1.5 Hz sine, small, §6.10)
      if (coilGlow && v === 'ring') R.push(x, y, r * k, r * k, 0, 'dot', 255, 255, 255, Math.round(KF.coilRings.swing * (0.5 + 0.5 * Math.sin(T * 2 * Math.PI * KF.coilRings.hz - i * 0.35))));
      this.segCount++;
    }
    // head: leans 8° into the turn; squash on eating (1.08×0.92, 90 ms)
    const lean = Math.max(-0.14, Math.min(0.14, angDiff(s.angle, s.target)));
    let rot = s.angle + lean;
    if (look.persona === 'scavenger' && mode === 'scav') rot += 0.13 * Math.sin(T * 2 * Math.PI * 2.2);   // sniffing toward a drop
    let sx = 1, sy = 1;
    if (this.match.waitTouch && s.isPlayer) { const q = 1 + 0.05 * Math.sin(T * 2.4); sx *= q; sy *= q; }
    const lastEat = bl && bl.length ? bl[bl.length - 1].t : -9;
    if (T - lastEat < 0.09) { sx *= 1.08; sy *= 0.92; }
    const hk = age < 0.25 ? Math.max(0.2, age / 0.25) : 1, rr = r * hk;
    const c = Math.cos(rot), sn = Math.sin(rot);
    if (look.skin) {
      const hs = rr * HEAD_HS, key = look.key, ex = look.extras;
      if (ex.includes('ywing') && n > 1) { const x1 = b[3], y1 = b[4], fl = 0.72 + 0.28 * Math.sin(T * 2 * Math.PI / 0.6); R.push(x1, y1, hs * 0.8, hs * 0.8 * fl, Math.atan2(hy - y1, hx - x1), `x:${key}:ywing`, 255, 255, 255, alpha); }
      if (ex.includes('wings')) R.push(hx, hy, hs, hs * Math.cos(Math.min(0.6, Math.abs(lean) * 4)), rot, `x:${key}:wings`, 255, 255, 255, alpha);
      if (ex.includes('ringB')) R.push(hx, hy, hs, hs, rot, `x:${key}:ringB`, 255, 255, 255, alpha);
      if (ex.includes('whisk')) R.push(hx, hy, hs, hs, rot + Math.max(-0.26, Math.min(0.26, -lean * 1.9)) + 0.05 * Math.sin(T * 2.2), `x:${key}:whisk`, 255, 255, 255, alpha);
      R.push(hx, hy, hs * sx, hs * sy, rot, look.head === 'digger' && T - lastEat < 0.16 ? `head2:${key}` : `head:${key}`, 255, 255, 255, alpha);
      if (ex.includes('flag0')) R.push(hx, hy, hs, hs, rot, `x:${key}:flag${Math.floor(T * 4) % 3}`, 255, 255, 255, alpha);
      if (ex.includes('ringF')) R.push(hx, hy, hs, hs, rot, `x:${key}:ringF`, 255, 255, 255, alpha);
      if (ex.includes('flame0')) R.push(hx + c * rr * 1.8, hy + sn * rr * 1.8, rr * 0.36, rr * 0.36, rot + Math.PI / 2, `x:${key}:flame${Math.floor(T * 8) % 3}`, 255, 255, 255, alpha);
    } else R.push(hx, hy, rr * 1.15 * sx * 1.08, rr * sy * 1.08, rot, `head:${look.key}`, 255, 255, 255, alpha);
    // eyes
    let mood = 'open';
    if (s.isPlayer && T < this.happyUntil) mood = 'happy';
    const bt = this.blink.get(s.id) ?? T + 2.5 + rnd() * 3.5;
    if (T > bt + 0.12) this.blink.set(s.id, T + 2.5 + rnd() * 3.5); else this.blink.set(s.id, bt);
    if (T > bt && T < bt + 0.12) mood = 'closed';
    if (s.sleep) mood = 'closed';
    // pupils look at the nearest threatening head within 400 wu, else ahead
    let lx = c, ly = sn, best = 400;
    for (const o of this.match.world.snakes) { if (o === s || !o.alive) continue; const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < best && o.mass > s.mass * 0.6) { best = d; lx = (o.x - s.x) / d; ly = (o.y - s.y) / d; } }
    if (s.boost && !this.boostT.has(s.id)) this.boostT.set(s.id, T); else if (!s.boost) this.boostT.delete(s.id);
    this.eyes(hx, hy, rot, rr, look, mood, lx, ly, s);
    // persona accessories (§6.4)
    if (look.persona === 'forager' && T - lastEat < 0.16) R.push(hx + c * rr * 1.45, hy + sn * rr * 1.45, rr * 0.42, rr * 0.42, rot, 'tongue', 255, 255, 255, alpha);
    if (look.persona === 'hunter' && mode === 'hunt') {
      const v = (s.brain as { victim?: Snake | null }).victim;
      if (v?.alive) { const a = Math.atan2(v.y - s.y, v.x - s.x); R.push(hx + Math.cos(a) * rr * 1.9, hy + Math.sin(a) * rr * 1.9, rr * 0.8, rr * 0.8, a, 'lockArc', 255, 170, 90, 170); }
    }
    if (look.persona === 'patrol') R.push(hx - c * rr * 0.25, hy - sn * rr * 0.25, rr * 0.36, rr * 0.36, 0, 'lamp');
    if (s.isPlayer && this.crownMe) {   // 蛇王冠: upright (±20° with the head), a small walking bob
      const bob = Math.sin(T * 7) * rr * 0.04;
      R.push(hx - c * rr * 0.2, hy - sn * rr * 0.2 - rr * 1.3 + bob, rr * 1.2, rr * 1.2, 0.35 * Math.sin(rot), 'crown', 255, 255, 255, alpha);
    }
  }

  /** additive accents per snake: comet crest, hover glow, rocket flame, headlight, antenna tip, candle, king halo, patrol beacon */
  private drawGlows(s: Snake, hx: number, hy: number, b: Float32Array, n: number, T: number) {
    const R = this.R, look = this.lookOf(s), rr = s.r, c = Math.cos(s.angle), sn = Math.sin(s.angle);
    if (look.extras.includes('comet')) { const st = s.boost ? 1.4 : 1; R.push(hx - c * rr * (st - 1) * 1.1, hy - sn * rr * (st - 1) * 1.1, rr * HEAD_HS * st, rr * HEAD_HS, s.angle, `x:${look.key}:comet`, 170, 236, 255, 190); }
    if (look.head === 'maglev' && s.boost) R.push(hx + c * rr * 0.3, hy + sn * rr * 0.3, rr * 2.1, rr * 1.15, s.angle, 'dot', 70, 150, 255, 170);
    if (look.head === 'rocket' && s.boost && n > 2) {
      const tx = b[(n - 1) * 3], ty = b[(n - 1) * 3 + 1], px = b[(n - 3) * 3], py = b[(n - 3) * 3 + 1], a = Math.atan2(ty - py, tx - px), w = 1 + 0.1 * Math.sin(T * 2 * Math.PI * 2.5);
      R.push(tx + Math.cos(a) * rr * 0.9, ty + Math.sin(a) * rr * 0.9, rr * 1.6 * w, rr * 0.75, a, 'dot', 255, 140, 40, 220);
      R.push(tx + Math.cos(a) * rr * 0.6, ty + Math.sin(a) * rr * 0.6, rr * 0.8 * w, rr * 0.45, a, 'dot', 255, 240, 190, 230);
    }
    if (look.head === 'loco') R.push(hx + c * rr * 1.25, hy + sn * rr * 1.25, rr * 1.3, rr * 1.0, s.angle, 'dot', 255, 228, 140, pulse(KF.locoHeadlight, T));
    if (look.head === 'mecha') { const ax = hx + (c * -0.95 - sn * -1.22) * rr, ay = hy + (sn * -0.95 + c * -1.22) * rr; R.push(ax, ay, rr * 0.55, rr * 0.55, 0, 'dot', 120, 240, 255, pulse(KF.mechaAntenna, T)); }
    if (look.extras.includes('flame0')) R.push(hx + c * rr * 1.85, hy + sn * rr * 1.85, rr * 1.2, rr * 1.2, 0, 'dot', 255, 170, 60, Math.round(120 + 15 * Math.sin(T * 5)));
    if (look.persona === 'king') R.push(hx, hy, rr * 3.6, rr * 3.6, 0, 'dot', 255, 200, 80, pulse(KF.kingHalo, T));
    if (look.persona === 'patrol') R.push(hx - c * rr * 0.25, hy - sn * rr * 0.25, rr * 1.5, rr * 1.5, 0, 'dot', 255, 120, 80, pulse(KF.patrolBeacon, T));
    if (s.isPlayer && this.crownMe && this.match.run?.m.id === 'c5m8') R.push(hx, hy - rr * 1.3, rr * 2.4, rr * 2.4, 0, 'dot', 255, 210, 90, pulse(KF.crownGlow, T));
  }

  /** eyes: the head decides where they sit, the persona / skin decides what they look like (§6.4 table) */
  private eyes(hx: number, hy: number, rot: number, r: number, look: Look, mood: string, lx: number, ly: number, s?: Snake) {
    const R = this.R, c = Math.cos(rot), sn = Math.sin(rot), L = look.eye, style = look.eyes;
    const lid = look.base.map((v) => v * 0.6) as Rgb;
    const pos = (fx: number, lat: number): [number, number] => [hx + c * fx * r - sn * lat * r, hy + sn * fx * r + c * lat * r];
    if (style === 'daredevil' && mood !== 'x') {
      const [gx, gy] = pos(0.3, 0); R.push(gx, gy, r * 0.85, r * 0.85, rot, 'goggles');
      const bt = s ? this.boostT.get(s.id) : undefined;   // one glint across the lenses when a boost starts
      if (bt !== undefined && this.time - bt < 0.35) { const q = (this.time - bt) / 0.35; for (const side of [-1, 1]) { const [ex, ey] = pos(0.3, 0.38 * side); R.push(ex - sn * side * r * (q - 0.5) * 0.3, ey + c * side * r * (q - 0.5) * 0.3, r * 0.3, r * 0.3, rot, 'spark', 255, 255, 255, Math.round(255 * Math.sin(q * Math.PI))); } }
      return;
    }
    if (L.mode === 'visorband' && mood !== 'x') { const [vx, vy] = pos(0.4, 0); R.push(vx, vy, r * 0.62, r * 0.62, rot, 'visor'); }
    for (const side of [-1, 1]) {
      const [ex, ey] = L.mode === 'visorband' ? pos(0.44, 0.22 * side) : pos(L.fx, L.lat * side);
      const er = r * L.er;
      if (mood === 'x') { R.push(ex, ey, er, er, rot, 'xeye'); continue; }
      switch (L.mode) {
        case 'window': {   // big pupils behind the cab windows
          if (mood === 'closed') { R.push(ex, ey, er, er, rot + Math.PI / 2, 'lidClosed', 240, 228, 200); break; }
          if (mood === 'happy') { R.push(ex, ey, er * 0.9, er * 0.9, rot + Math.PI / 2, 'happy'); break; }
          R.push(ex + lx * er * 0.28, ey + ly * er * 0.28, er * 0.66, er * 0.66, 0, 'pupil');
          break;
        }
        case 'dots': case 'visorband': {   // two light points in a porthole / windscreen / LED visor
          const k = mood === 'closed' ? 0.35 : mood === 'happy' ? 1.25 : 1, o = er * 0.55;
          R.push(ex + lx * o, ey + ly * o, er * 1.9 * k, er * 1.9 * k, 0, 'dot', 110, 236, 255, mood === 'closed' ? 90 : 235);
          R.push(ex + lx * o, ey + ly * o, er * 0.55 * k, er * 0.55 * k, 0, 'disc', 255, 255, 255, mood === 'closed' ? 80 : 255);
          break;
        }
        case 'dragon': {   // golden iris + vertical slit + brow ridge (dragons, 腾蛇, 巴蛇, the king)
          if (mood !== 'open') { R.push(ex, ey, er, er, rot + Math.PI / 2, 'lidClosed', lid[0], lid[1], lid[2]); if (mood === 'happy') R.push(ex, ey, er * 0.9, er * 0.9, rot + Math.PI / 2, 'happy'); break; }
          R.push(ex, ey, er, er, rot + Math.PI / 2, 'deye');
          R.push(ex + lx * er * 0.2, ey + ly * er * 0.2, er * 0.8, er * 0.8, rot + Math.PI / 2, 'slit');
          R.push(ex - c * er * 0.15 + -sn * side * er * 0.55, ey - sn * er * 0.15 + c * side * er * 0.55, er * 0.9, er * 0.9, rot + Math.PI / 2 + (side > 0 ? Math.PI : 0), 'dbrow', lid[0] * 0.8, lid[1] * 0.8, lid[2] * 0.8);
          break;
        }
        case 'glow': {   // 黑洞: glowing hollow eyes
          if (mood === 'closed') { R.push(ex, ey, er, er, rot + Math.PI / 2, 'lidClosed', lid[0], lid[1], lid[2]); break; }
          R.push(ex, ey, er * 1.25, er * 1.25, 0, 'geye', 205, 175, 255);
          break;
        }
        default: {   // free: round eyes; persona styles (§6.4)
          const pe = style;
          if (mood === 'happy' || pe === 'coiler') { R.push(ex, ey, er, er, rot + Math.PI / 2, 'eye', 255, 255, 255, 255); R.push(ex, ey, er, er, rot + Math.PI / 2, 'lidClosed', lid[0], lid[1], lid[2]); R.push(ex, ey, er * 0.9, er * 0.9, rot + Math.PI / 2, 'happy'); continue; }
          if (mood === 'closed') { R.push(ex, ey, er, er, rot + Math.PI / 2, 'lidClosed', lid[0], lid[1], lid[2]); continue; }
          const e2 = pe === 'skittish' ? er * 1.15 : er;
          R.push(ex, ey, e2, e2, 0, 'eye');
          const pr = e2 * (pe === 'skittish' ? 0.38 : 0.55), off = e2 * 0.3;
          let px = lx, py = ly;
          if (pe === 'scavenger') { px = lx * 0.4 - sn * side * 0.8; py = ly * 0.4 + c * side * 0.8; }
          if (pe === 'skittish' && s) {   // 胆小: the small pupils dart left / ahead / right every 0.7 s (nervous glances)
            const g = ((Math.floor(this.match.world.t / 0.7 + s.id * 0.37) % 3) - 1) * 0.9, gc = Math.cos(g), gs = Math.sin(g);
            px = lx * gc - ly * gs; py = lx * gs + ly * gc;
          }
          R.push(ex + px * off, ey + py * off, pr, pr, 0, 'pupil');
          if (pe === 'skittish') R.push(ex + c * e2 * 0.78, ey + sn * e2 * 0.78, e2 * 0.8, e2 * 0.8, rot + Math.PI / 2 - side * 0.5, 'brow', 70, 60, 95);   // raised, worried brows = the hunter's mirrored
          if (pe === 'hunter') {   // narrowed eye (half lid) + slanted brow, pressed lower while hunting
            const hunting = (s?.brain as { mode?: string } | null)?.mode === 'hunt';
            R.push(ex, ey, e2 * 1.02, e2 * 1.02, rot + Math.PI / 2, 'lid', lid[0], lid[1], lid[2]);
            R.push(ex - c * e2 * (hunting ? 0.02 : 0.1), ey - sn * e2 * (hunting ? 0.02 : 0.1), e2 * 0.95, e2 * 0.95, rot + Math.PI / 2 + side * (hunting ? 0.62 : 0.45), 'brow', 40, 30, 50);
          }
          if (pe === 'skittish' && s && side > 0 && (this.match.world.t % 0.8) < 0.5 && (s.brain as { mode?: string } | null)?.mode === 'flee') R.push(ex - c * e2, ey - sn * e2, e2 * 0.6, e2 * 0.6, 0, 'sweat');
        }
      }
    }
  }

  /** a fence ripple is drawn only for the fence, not when he slides along a rock */
  private nearRock(s: Snake) { return this.match.world.obstacles.some((o) => Math.hypot(s.x - o.x, s.y - o.y) < o.r + s.r + 4); }

  /** 挑战关 ground objects (spec §4.4.4): rocks, rings / beacons (current lit, next dim), 星核 */
  private drawMissionGround(T: number) {
    const m = this.match, w = m.world, R = this.R, run = m.run;
    for (const o of w.obstacles) if (this.onScreen(o.x, o.y, o.r + 20)) R.push(o.x, o.y, o.r * 1.08, o.r * 1.08, (o.x * 0.013 + o.y * 0.007) % 6.28, 'rock');
    if (!run) return;
    const ob = run.m.objective;
    if (ob.type === 'rings') {
      const i = m.me.m!.ring, pts = ob.points!, rad = ob.radius!, beacon = rad >= 150;
      for (let k = i; k < Math.min(pts.length, i + 2); k++) {
        const [x, y] = pts[k]; if (!this.onScreen(x, y, rad + 40)) continue;
        const cur = k === i, br = cur ? 1 + 0.06 * Math.sin(T * 4.2) : 1;
        R.layer(Blend.Add);
        if (cur) R.push(x, y, rad * 1.5 * br, rad * 1.5 * br, 0, 'dot', 255, 214, 90, 90);
        R.layer(Blend.Normal);
        if (beacon) { R.push(x, y, rad, rad, 0, 'ring', 255, 214, 90, cur ? 110 : 40); R.push(x, y - 30, 70, 70, 0, 'beacon', 255, 255, 255, cur ? 255 : 120); }
        else { R.push(x, y, rad * br, rad * br, T * (cur ? 0.6 : 0.2), 'dash', 255, cur ? 214 : 255, cur ? 90 : 255, cur ? 255 : 70); if (cur) R.push(x, y, rad * 0.86 * br, rad * 0.86 * br, 0, 'ring', 255, 240, 170, 150); }
      }
    }
    for (const mk of (w as unknown as { markers?: { x: number; y: number; done: boolean }[] }).markers ?? []) {
      if (!this.onScreen(mk.x, mk.y, 80)) continue;
      const p = 1 + 0.1 * Math.sin(T * 3 + mk.x);
      R.layer(Blend.Add); R.push(mk.x, mk.y, 90 * p, 90 * p, 0, 'dot', mk.done ? 255 : 120, mk.done ? 215 : 190, mk.done ? 80 : 255, mk.done ? 160 : 110);
      R.layer(Blend.Normal); R.push(mk.x, mk.y, 34 * p, 34 * p, T * 0.8, 'core', mk.done ? 255 : 255, mk.done ? 225 : 255, mk.done ? 110 : 255);
    }
  }

  /** over the snakes: target dashed rings, c5m1 gold outline, the king's crown + gems, sleepers' z */
  private drawMissionOver(T: number, hxOf: (s: Snake) => number, hyOf: (s: Snake) => number) {
    const m = this.match, run = m.run; if (!run) return;
    const R = this.R; R.layer(Blend.Normal);
    for (const s of m.world.snakes) {
      if (!s.alive || s.isPlayer || !this.onScreen(s.x, s.y, s.r * 4)) continue;
      const hx = hxOf(s), hy = hyOf(s);
      if (s.target_ && !s.king) { const k = s.r * 2.4; R.push(hx, hy, k, k, T * 1.2, 'dash', 255, 210, 63, 235); }
      if (run.qualifies(s)) { R.layer(Blend.Add); R.push(hx, hy, s.r * 2.8, s.r * 2.8, 0, 'ring', 255, 205, 60, pulse(KF.qualifyOutline, T)); R.layer(Blend.Normal); }
      if (s.sleep) { const q = (T * 0.6 + s.id * 0.37) % 1; R.push(hx + s.r * (0.8 + q * 0.8), hy - s.r * (1 + q * 1.6), 18 + q * 10, 18 + q * 10, 0, 'zzz', 255, 255, 255, Math.round(255 * Math.sin(q * Math.PI))); }
      if (s.king) {
        const wind = (s.brain as { chargeState?: string } | null)?.chargeState === 'wind';
        if (wind) { R.layer(Blend.Add); R.push(hx, hy, s.r * 4, s.r * 4, 0, 'dot', 255, 120, 60, pulse(KF.kingWindup, T)); R.layer(Blend.Normal); }
        const cx = hx - Math.cos(s.angle) * s.r * 0.2, cy = hy - Math.sin(s.angle) * s.r * 0.2 - s.r * 1.25;
        R.push(cx, cy, s.r * 1.25, s.r * 1.25, 0, 'crown');
        const n = s.crownMax ?? 3, left = s.crown ?? 0;
        for (let g = 0; g < n; g++) { const gx = cx + (g - (n - 1) / 2) * s.r * 0.7; R.push(gx, cy + s.r * 0.15, s.r * 0.36, s.r * 0.36, 0, g < left ? 'gem' : 'gemEmpty'); }
      }
    }
  }
}
