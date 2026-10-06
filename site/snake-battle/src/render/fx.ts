/**
 * Particle pool + timed effects (spec §6.7 juice, §6.10 flash rule). Pure presentation: fed by match
 * events, drawn by view.ts as instanced sprites. Everything fades with sine/linear curves — no hard
 * on/off repetition; nothing repeats faster than 3 Hz. `reduced` (prefers-reduced-motion) → ×0.3 counts.
 */
import { Blend, type Renderer } from './gl';

/** presentation-only random stream (never Math.random, spec §3.2) */
let seed = 0x9e3779b9;
export function rnd() { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

export interface P {
  x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; size1: number;
  rot: number; vr: number; key: string; r: number; g: number; b: number; blend: Blend; drag: number;
  /** follow a target (mouth suction) */
  tx?: () => [number, number] | null;
}

export const FX_KEYFRAMES = {
  // exported for the flash test (fx-flash): repeated luminance changes ≤3 Hz, ≤20 %
  protectRing: { hz: 0, amp: 0 },
  boostGlow: { hz: 1.6, amp: 0.18 },
  orbBreath: { hz: 1 / 1.6, amp: 0.15 },
  deathPulse: { hz: 2.9, amp: 0.2, repeats: 2 },
  // persona / skin accents (view.ts reads hz + base/swing alpha from here; amp = swing / (base + swing))
  coilRings: { hz: 1.5, base: 0, swing: 50, amp: 50 / 255 },
  kingHalo: { hz: 1 / 1.5, base: 80, swing: 18, amp: 18 / 98 },
  kingWindup: { hz: 2.6, base: 150, swing: 28, amp: 28 / 178 },
  patrolBeacon: { hz: 1, base: 95, swing: 19, amp: 19 / 114 },
  mechaAntenna: { hz: 1, base: 100, swing: 18, amp: 18 / 118 },
  locoHeadlight: { hz: 0.8, base: 110, swing: 20, amp: 20 / 130 },
  crownGlow: { hz: 1 / 1.5, base: 110, swing: 20, amp: 20 / 130 },
  shieldEnding: { hz: 6 / (2 * Math.PI), base: 185, swing: 35, amp: 35 / 220 },
  qualifyOutline: { hz: 5 / (2 * Math.PI), base: 185, swing: 35, amp: 35 / 220 },
  zhulongNight: { hz: 0.2, amp: 0.2, repeats: 1 },
};
/** a sine accent's alpha at time T from its keyframe entry */
export const pulse = (k: { hz: number; base: number; swing: number }, T: number, ph = 0) => Math.round(k.base + k.swing * Math.sin(T * 2 * Math.PI * k.hz + ph));

export class Fx {
  ps: P[] = [];
  private pool: P[] = [];
  max = 900;
  reduced = false;
  shake = 0; shakeAmp = 0;
  constructor() { try { this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ } }

  spawn(o: Partial<P> & { x: number; y: number; key: string }): P | null {
    if (this.ps.length >= this.max) return null;
    const p = this.pool.pop() ?? ({} as P);
    p.x = o.x; p.y = o.y; p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.life = o.life ?? 0.6; p.age = 0;
    p.size = o.size ?? 6; p.size1 = o.size1 ?? 0; p.rot = o.rot ?? 0; p.vr = o.vr ?? 0; p.key = o.key;
    p.r = o.r ?? 255; p.g = o.g ?? 255; p.b = o.b ?? 255; p.blend = o.blend ?? Blend.Add; p.drag = o.drag ?? 2.5; p.tx = o.tx;
    this.ps.push(p); return p;
  }
  private n(k: number) { return Math.max(1, Math.round(this.reduced ? k * 0.3 : k)); }

  burst(x: number, y: number, rgb: [number, number, number], count: number, speed: number, size: number, key = 'spark', life = 0.6) {
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.4, v = speed * (0.5 + rnd() * 0.7);
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.7 + rnd() * 0.5), size: size * (0.7 + rnd() * 0.6), size1: 0, key, r: rgb[0], g: rgb[1], b: rgb[2], rot: rnd() * 6, vr: (rnd() - 0.5) * 6 });
    }
  }
  shockwave(x: number, y: number, rgb: [number, number, number], r0: number, r1: number, life = 0.4) {
    this.spawn({ x, y, life, size: r0, size1: r1, key: 'ring', r: rgb[0], g: rgb[1], b: rgb[2], drag: 0 });
  }
  confetti(x: number, y: number, count = 16) {
    const cols: [number, number, number][] = [[255, 216, 77], [255, 95, 126], [63, 208, 255], [79, 227, 161], [200, 107, 255]];
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, v = 160 + rnd() * 220, c = cols[i % cols.length];
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.1, size: 7, size1: 5, key: 'confetti', r: c[0], g: c[1], b: c[2], blend: Blend.Normal, rot: a, vr: (rnd() - 0.5) * 14, drag: 1.8 });
    }
  }
  /** food sucked into the mouth (90 ms easeIn, shrinks to 0.3) */
  suck(x: number, y: number, size: number, rgb: [number, number, number], mouth: () => [number, number] | null) {
    this.spawn({ x, y, life: 0.11, size, size1: size * 0.3, key: 'orbcore', r: rgb[0], g: rgb[1], b: rgb[2], blend: Blend.Normal, tx: mouth, drag: 0 });
  }
  kick(amp: number, dur: number) { if (this.reduced) return; this.shakeAmp = amp; this.shake = dur; }

  update(dt: number) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); p.tx = undefined; this.pool.push(p); continue; }
      if (p.tx) {
        const t = p.tx(); if (t) { const k = Math.min(1, (p.age / p.life) ** 2 * 1.2 + 0.15); p.x += (t[0] - p.x) * k; p.y += (t[1] - p.y) * k; }
      } else {
        const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      p.rot += p.vr * dt;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }

  draw(R: Renderer, blend: Blend) {
    for (const p of this.ps) {
      if (p.blend !== blend) continue;
      const t = p.age / p.life;
      const s = p.size + (p.size1 - p.size) * (p.key === 'ring' ? 1 - (1 - t) * (1 - t) : t);
      const a = p.key === 'ring' ? 1 - t : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      R.push(p.x, p.y, s, p.key === 'confetti' ? s * 0.6 : s, p.rot, p.key, p.r, p.g, p.b, Math.round(255 * a));
    }
  }
  shakeOffset(): [number, number] {
    if (this.shake <= 0) return [0, 0];
    const k = this.shakeAmp * (this.shake > 0 ? 1 : 0);
    return [(rnd() - 0.5) * 2 * k, (rnd() - 0.5) * 2 * k];
  }
}
