/**
 * Effects layer (spec §6.10): one full-viewport canvas above the board (pointer-events: none) for
 * shards, sparks, shockwaves, rocket trails, drone flights, orb lightning and collect flights — they
 * may leave the panel. Particles are visual only (Math.random is allowed here, spec §3.18).
 */
import type { Atlas } from './atlas';

type Particle =
  | { t: 'shard'; x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; life: number; age: number; g: number }
  | { t: 'spark'; x: number; y: number; vx: number; vy: number; size: number; color: string; life: number; age: number; g: number }
  | { t: 'ring'; x: number; y: number; r0: number; r1: number; color: string; width: number; life: number; age: number }
  | { t: 'flash'; x: number; y: number; r: number; color: string; life: number; age: number }
  | { t: 'bolt'; x0: number; y0: number; x1: number; y1: number; color: string; life: number; age: number; seed: number }
  | { t: 'beam'; x0: number; y0: number; x1: number; y1: number; color: string; width: number; life: number; age: number }
  | { t: 'sprite'; key: string; frames?: string[]; x: number; y: number; size: number; rot: number; alpha: number; life: number; age: number; path: (p: number) => { x: number; y: number; s?: number; rot?: number; a?: number }; trail?: string; onEnd?: () => void; ease?: (p: number) => number };

export class Fx {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private parts: Particle[] = [];
  private dpr = 1;
  atlas: Atlas | null = null;
  cellPx = 80;
  /** "少一点特效": particle count × 0.3, no shake (spec §6.10) */
  lessFx = false;
  white = 0;
  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'em-fx';
    parent.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }
  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
  }
  get busy(): boolean { return this.parts.length > 0 || this.white > 0; }
  /** release the backing store now (iOS page-wide canvas cap, see BoardCanvas.dispose) */
  dispose(): void { this.parts.length = 0; this.canvas.width = 0; this.canvas.height = 0; this.canvas.remove(); }
  private n(k: number): number { return this.lessFx ? Math.max(1, Math.round(k * 0.3)) : k; }

  shards(x: number, y: number, color: string, count = 10, speed = 1): void {
    for (let k = 0; k < this.n(count); k += 1) {
      const a = Math.random() * Math.PI * 2, v = (200 + Math.random() * 220) * speed;
      this.parts.push({ t: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, size: this.cellPx * (0.07 + Math.random() * 0.07), color, life: 350 + Math.random() * 200, age: 0, g: 900 });
    }
  }
  sparks(x: number, y: number, color: string, count = 12, speed = 1, g = 300): void {
    for (let k = 0; k < this.n(count); k += 1) {
      const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 260) * speed;
      this.parts.push({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 2 + Math.random() * 3.5, color, life: 300 + Math.random() * 400, age: 0, g });
    }
  }
  debris(x: number, y: number, colors: string[], count = 6): void {
    for (let k = 0; k < this.n(count); k += 1) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 220 + Math.random() * 260;
      this.parts.push({ t: 'shard', x: x + (Math.random() - 0.5) * this.cellPx * 0.5, y: y + (Math.random() - 0.5) * this.cellPx * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, size: this.cellPx * (0.12 + Math.random() * 0.1), color: colors[k % colors.length], life: 500 + Math.random() * 250, age: 0, g: 1400 });
    }
  }
  ring(x: number, y: number, r1: number, color = 'rgba(255,255,255,.9)', life = 300, width = 6, r0 = 0): void { this.parts.push({ t: 'ring', x, y, r0, r1, color, width, life, age: 0 }); }
  flashAt(x: number, y: number, r: number, color = 'rgba(255,255,255,.9)', life = 220): void { this.parts.push({ t: 'flash', x, y, r, color, life, age: 0 }); }
  bolt(x0: number, y0: number, x1: number, y1: number, color = '#E9F6FF', life = 380): void { this.parts.push({ t: 'bolt', x0, y0, x1, y1, color, life, age: 0, seed: Math.random() * 1000 }); }
  beam(x0: number, y0: number, x1: number, y1: number, color: string, width: number, life = 320): void { this.parts.push({ t: 'beam', x0, y0, x1, y1, color, width, life, age: 0 }); }
  /** a sprite moving along `path` (rocket halves, drones, collect flights) */
  fly(key: string, size: number, life: number, path: (p: number) => { x: number; y: number; s?: number; rot?: number; a?: number }, o: { trail?: string; onEnd?: () => void; frames?: string[]; ease?: (p: number) => number } = {}): void {
    const p0 = path(0);
    this.parts.push({ t: 'sprite', key, frames: o.frames, x: p0.x, y: p0.y, size, rot: p0.rot ?? 0, alpha: 1, life, age: 0, path, trail: o.trail, onEnd: o.onEnd, ease: o.ease });
  }
  whiteout(a = 0.85): void { if (!this.lessFx) this.white = Math.max(this.white, a); }

  step(dt: number): void {
    const s = dt / 1000;
    const out: Particle[] = [];
    const born: Particle[] = [];
    for (const p of this.parts) {
      p.age += dt;
      if (p.t === 'shard' || p.t === 'spark') { p.vy += p.g * s; p.x += p.vx * s; p.y += p.vy * s; if (p.t === 'shard') p.rot += p.vr * s; }
      if (p.t === 'sprite') {
        const q = p.path(Math.min(1, (p.ease ?? ((x: number) => x))(Math.min(1, p.age / p.life))));
        if (p.trail && !this.lessFx && Math.random() < 0.9) {
          const dx = q.x - p.x, dy = q.y - p.y;
          for (let k = 0; k < 2; k += 1) born.push({ t: 'spark', x: q.x - dx * Math.random(), y: q.y - dy * Math.random(), vx: (Math.random() - 0.5) * 80 - dx * 2, vy: (Math.random() - 0.5) * 80 - dy * 2, size: 3 + Math.random() * 4, color: k ? p.trail : '#FFF3C4', life: 180 + Math.random() * 160, age: 0, g: 0 });
        }
        p.x = q.x; p.y = q.y; p.rot = q.rot ?? p.rot; p.alpha = q.a ?? 1; if (q.s !== undefined) p.size = q.s;
        if (p.age >= p.life) { p.onEnd?.(); continue; }
        out.push(p); continue;
      }
      if (p.age < p.life) out.push(p);
    }
    this.parts = out.concat(born);
    if (this.white > 0) this.white = Math.max(0, this.white - dt / 420);
  }

  draw(): void {
    const c = this.ctx, d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    for (const p of this.parts) {
      const k = p.age / p.life;
      switch (p.t) {
        case 'shard': {
          c.save(); c.globalAlpha = Math.max(0, 1 - k * k); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color;
          c.beginPath(); c.moveTo(-p.size, -p.size * 0.5); c.lineTo(p.size * 0.8, -p.size * 0.7); c.lineTo(p.size * 0.3, p.size * 0.8); c.closePath(); c.fill();
          c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.moveTo(-p.size, -p.size * 0.5); c.lineTo(p.size * 0.8, -p.size * 0.7); c.lineTo(0, -p.size * 0.2); c.fill();
          c.restore(); break;
        }
        case 'spark': {
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = Math.max(0, 1 - k);
          c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); c.fill();
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; break;
        }
        case 'ring': {
          const e = 1 - (1 - k) ** 3;
          c.globalAlpha = Math.max(0, 1 - k); c.strokeStyle = p.color; c.lineWidth = p.width * (1 - k * 0.6);
          c.beginPath(); c.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * e, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; break;
        }
        case 'flash': {
          c.globalCompositeOperation = 'lighter';
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.globalAlpha = Math.max(0, 1 - k); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; break;
        }
        case 'bolt': {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.max(0, 1 - k);
          c.strokeStyle = p.color; c.lineWidth = 3; c.shadowColor = '#9FD8FF'; c.shadowBlur = 10;
          c.beginPath(); c.moveTo(p.x0, p.y0);
          const segs = 7; let sd = p.seed + Math.floor(p.age / 60);
          for (let i = 1; i < segs; i += 1) {
            sd = (sd * 9301 + 49297) % 233280; const j = (sd / 233280 - 0.5) * 22;
            const t = i / segs; c.lineTo(p.x0 + (p.x1 - p.x0) * t + j, p.y0 + (p.y1 - p.y0) * t - j);
          }
          c.lineTo(p.x1, p.y1); c.stroke(); c.shadowBlur = 0; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; break;
        }
        case 'beam': {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.max(0, 1 - k) * 0.9;
          c.strokeStyle = p.color; c.lineCap = 'round'; c.lineWidth = p.width * (1 - k * 0.5);
          c.beginPath(); c.moveTo(p.x0, p.y0); c.lineTo(p.x1, p.y1); c.stroke();
          c.strokeStyle = '#fff'; c.lineWidth = p.width * 0.3; c.stroke();
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; break;
        }
        case 'sprite': {
          if (!this.atlas) break;
          const key = p.frames ? p.frames[Math.floor(p.age / 80) % p.frames.length] : p.key;
          this.atlas.draw(c, key, p.x, p.y, p.size, 1, 1, p.rot, p.alpha);
          break;
        }
        default: break;
      }
    }
    if (this.white > 0) { c.fillStyle = `rgba(255,255,255,${this.white})`; c.fillRect(0, 0, this.canvas.width / d, this.canvas.height / d); }
  }
  clear(): void { this.parts = []; this.white = 0; this.draw(); }
}
