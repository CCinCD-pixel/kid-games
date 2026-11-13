import { cellAt, type Config, type Level } from '../model/sim';

/** What the board shows this frame. Positions are in tiles (fractions while the rover is driving). */
export interface Frame {
  lv: Level; cfg: Config;
  rover: { x: number; y: number; ang: number; lift: number };
  taken: number;          // samples picked up (bit mask)
  crystal: boolean;       // the hidden crystal has been picked up
  ghost: { pts: { x: number; y: number }[]; mode: 'full' | 'last' } | null;
  marker: { x: number; y: number; kind: 'crash' | 'end' } | null;
  /** the tiles the rover drove over, in order: drawn as wheel tracks (they stay after a run that did not get there) */
  trail?: { x: number; y: number }[] | null;
  /** hint ②: a tile circled on the map */
  ring?: { x: number; y: number } | null;
  now: number;
}

const LIFT = 0.16; // how much one level of height raises a tile, in tiles
const C = {
  ground: ['#c9c0b0', '#d3cabb'], side: '#8d8576', rock: '#6f6a64', rockHi: '#9a948b', crater: '#4a463f', craterRim: '#a39b8c',
  gold: '#e9b949', goldDark: '#a97b1f', wheel: '#2c2a2e', panel: '#3b6fb6', panelHi: '#7fb0ee', tower: '#e8e4dc', sample: '#ffd24a', crystal: '#5ce1e6',
  fog: 'rgba(20,26,52,0.62)', night: '#10163a',
};

export class Board {
  private ctx: CanvasRenderingContext2D;
  private cssW = 0; private cssH = 0; private dpr = 1;
  constructor(readonly canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = Math.max(1, Math.round(r.width)); this.cssH = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.cssW * this.dpr); this.canvas.height = Math.round(this.cssH * this.dpr);
  }

  /** layout of the level in CSS px */
  geo(lv: Level): { t: number; ox: number; oy: number } {
    const t = Math.floor(Math.min(this.cssW / (lv.W + 0.4), this.cssH / (lv.H + 0.7)));
    return { t, ox: Math.round((this.cssW - lv.W * t) / 2), oy: Math.round((this.cssH - lv.H * t) / 2 + t * 0.12) };
  }
  /** the CSS-px centre of a tile (for hit effects and the like) */
  centre(lv: Level, x: number, y: number): { x: number; y: number } {
    const { t, ox, oy } = this.geo(lv);
    return { x: ox + (x + 0.5) * t, y: oy + (y + 0.5) * t - (cellAt(lv, Math.round(x), Math.round(y))?.h ?? 0) * LIFT * t };
  }

  draw(f: Frame): void {
    const { ctx, dpr } = this; const { lv } = f;
    const { t, ox, oy } = this.geo(lv);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const fog = !!lv.fog;
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) this.tile(f, x, y, t, ox, oy, fog);
    if (f.ghost && f.ghost.pts.length) this.drawGhost(f, t, ox, oy);
    if (f.trail && f.trail.length > 1) this.drawTrail(f, t, ox, oy);
    if (f.marker) this.drawMarker(f, t, ox, oy);
    if (f.ring) this.drawRing(f, t, ox, oy);
    this.drawRover(f, t, ox, oy);
    if (fog) this.drawFog(f, t, ox, oy);
  }

  private tile(f: Frame, x: number, y: number, t: number, ox: number, oy: number, fog: boolean): void {
    const { ctx } = this; const { lv, cfg } = f;
    const c = cellAt(lv, x, y);
    const lift = c.h * LIFT * t;
    const px = ox + x * t, py = oy + y * t - lift;
    if (lift > 0) { ctx.fillStyle = C.side; ctx.fillRect(px, py + t, t, lift); }
    ctx.fillStyle = C.ground[(x + y) & 1]; ctx.fillRect(px, py, t, t);
    ctx.strokeStyle = 'rgba(80,72,60,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, t - 1, t - 1);
    const cx = px + t / 2, cy = py + t / 2;
    switch (c.ch) {
      case '#': this.boulder(cx, cy, t * 0.36); break;
      case 'o': ctx.fillStyle = C.craterRim; ctx.beginPath(); ctx.ellipse(cx, cy, t * 0.42, t * 0.34, 0, 0, 7); ctx.fill(); ctx.fillStyle = C.crater; ctx.beginPath(); ctx.ellipse(cx, cy + t * 0.03, t * 0.34, t * 0.26, 0, 0, 7); ctx.fill(); break;
      case 'G': if (!fog) this.tower(cx, cy, t, f.now); break;
      case 'a': case 'd': {
        const taken = (f.taken >> c.req) & 1;
        const seen = c.ch === 'a' || cfg.mast === 'T';
        if (taken) { ctx.fillStyle = 'rgba(80,72,60,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, t * 0.09, 0, 7); ctx.fill(); break; }
        const pulse = 1 + Math.sin(f.now / 260 + x * 2 + y) * 0.1;
        ctx.fillStyle = seen ? 'rgba(255,210,74,0.30)' : 'rgba(40,40,70,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, t * 0.3 * pulse, 0, 7); ctx.fill();
        ctx.fillStyle = seen ? C.sample : 'rgba(40,40,70,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, t * 0.12, 0, 7); ctx.fill();
        break;
      }
      case '*': if (!f.crystal) this.crystal(cx, cy, t, f.now); break;
      case 'B': case 'Y': ctx.fillStyle = c.ch === 'B' ? 'rgba(70,120,220,0.85)' : 'rgba(245,200,50,0.9)'; ctx.beginPath(); ctx.roundRect(px + t * 0.14, py + t * 0.14, t * 0.72, t * 0.72, t * 0.12); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke(); break;
      case 'r': if (!((f.taken >> c.req) & 1)) this.stranded(cx, cy, t, f.now); break;
      case 'n': this.boulder(px + t * 0.17, cy, t * 0.2); this.boulder(px + t * 0.83, cy, t * 0.2); break;
      case 'u': ctx.fillStyle = C.rock; ctx.beginPath(); ctx.moveTo(px + t * 0.1, py + t * 0.9); ctx.lineTo(px + t * 0.1, cy); ctx.quadraticCurveTo(cx, py - t * 0.05, px + t * 0.9, cy); ctx.lineTo(px + t * 0.9, py + t * 0.9); ctx.lineTo(px + t * 0.72, py + t * 0.9); ctx.lineTo(px + t * 0.72, cy + t * 0.05); ctx.quadraticCurveTo(cx, py + t * 0.25, px + t * 0.28, cy + t * 0.05); ctx.lineTo(px + t * 0.28, py + t * 0.9); ctx.closePath(); ctx.fill(); break;
      default: break;
    }
  }

  /** a stranded rover waiting to be picked up: a small grey rover with a blinking red light */
  private stranded(cx: number, cy: number, t: number, now: number): void {
    const { ctx } = this; const u = t * 0.3;
    ctx.fillStyle = C.wheel; for (const sx of [-1, 1]) for (const wy of [-0.5, 0.5]) { ctx.beginPath(); ctx.arc(cx + sx * u * 0.95, cy + wy * u, u * 0.28, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#9d9a94'; ctx.strokeStyle = '#6b6862'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(cx - u * 0.7, cy - u * 0.9, u * 1.4, u * 1.8, u * 0.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b86b0'; ctx.fillRect(cx - u * 0.45, cy - u * 0.4, u * 0.9, u * 0.6);
    ctx.fillStyle = Math.sin(now / 260) > 0 ? '#ff5d5d' : '#7a3333'; ctx.beginPath(); ctx.arc(cx, cy - u * 1.05, u * 0.16, 0, 7); ctx.fill();
  }

  private boulder(cx: number, cy: number, r: number): void {
    const { ctx } = this;
    ctx.fillStyle = C.rock; ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 0.5); ctx.lineTo(cx - r * 0.7, cy - r * 0.6); ctx.lineTo(cx + r * 0.1, cy - r); ctx.lineTo(cx + r * 0.9, cy - r * 0.3); ctx.lineTo(cx + r, cy + r * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.rockHi; ctx.beginPath(); ctx.moveTo(cx - r * 0.7, cy - r * 0.6); ctx.lineTo(cx + r * 0.1, cy - r); ctx.lineTo(cx + r * 0.2, cy - r * 0.2); ctx.closePath(); ctx.fill();
  }

  private tower(cx: number, cy: number, t: number, now: number): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(70,64,56,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + t * 0.3, t * 0.34, t * 0.12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = C.tower; ctx.beginPath(); ctx.moveTo(cx - t * 0.14, cy + t * 0.3); ctx.lineTo(cx - t * 0.07, cy - t * 0.22); ctx.lineTo(cx + t * 0.07, cy - t * 0.22); ctx.lineTo(cx + t * 0.14, cy + t * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.ellipse(cx, cy - t * 0.26, t * 0.2, t * 0.09, -0.3, 0, 7); ctx.fill();
    const on = Math.sin(now / 300) > 0;
    ctx.fillStyle = on ? '#ff6b6b' : '#8a3a3a'; ctx.beginPath(); ctx.arc(cx, cy - t * 0.4, t * 0.05, 0, 7); ctx.fill();
  }

  private crystal(cx: number, cy: number, t: number, now: number): void {
    const { ctx } = this; const s = t * 0.15 * (1 + Math.sin(now / 340) * 0.08);
    ctx.fillStyle = C.crystal; ctx.beginPath(); ctx.moveTo(cx, cy - s * 1.5); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s * 1.5); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(cx, cy - s * 1.5); ctx.lineTo(cx + s * 0.4, cy - s * 0.2); ctx.lineTo(cx, cy); ctx.lineTo(cx - s * 0.5, cy - s * 0.3); ctx.closePath(); ctx.fill();
  }

  private pt(f: Frame, x: number, y: number, t: number, ox: number, oy: number): { x: number; y: number } {
    const h = cellAt(f.lv, Math.round(x), Math.round(y))?.h ?? 0;
    return { x: ox + (x + 0.5) * t, y: oy + (y + 0.5) * t - h * LIFT * t };
  }

  private drawGhost(f: Frame, t: number, ox: number, oy: number): void {
    const { ctx } = this; const pts = f.ghost!.pts.map((p) => this.pt(f, p.x, p.y, t, ox, oy));
    ctx.save(); ctx.strokeStyle = 'rgba(255,214,102,0.85)'; ctx.fillStyle = 'rgba(255,214,102,0.9)'; ctx.lineWidth = Math.max(3, t * 0.07); ctx.setLineDash([t * 0.14, t * 0.12]); ctx.lineCap = 'round';
    if (f.ghost!.mode === 'full') { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); }
    ctx.setLineDash([]); const e = pts[pts.length - 1];
    ctx.lineWidth = Math.max(3, t * 0.06); ctx.beginPath(); ctx.arc(e.x, e.y, t * 0.2, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(e.x, e.y, t * 0.06, 0, 7); ctx.fill();
    ctx.restore();
  }

  /** wheel tracks: two thin lines either side of the way the rover went */
  private drawTrail(f: Frame, t: number, ox: number, oy: number): void {
    const { ctx } = this; const pts = f.trail!.map((p) => this.pt(f, p.x, p.y, t, ox, oy));
    ctx.save(); ctx.strokeStyle = 'rgba(74,64,52,0.5)'; ctx.lineWidth = Math.max(2, t * 0.045); ctx.lineCap = 'round';
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k]; const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const nx = (-(b.y - a.y) / len) * t * 0.14, ny = ((b.x - a.x) / len) * t * 0.14;
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(a.x + nx * sgn, a.y + ny * sgn); ctx.lineTo(b.x + nx * sgn, b.y + ny * sgn); ctx.stroke(); }
    }
    ctx.restore();
  }
  private drawRing(f: Frame, t: number, ox: number, oy: number): void {
    const { ctx } = this; const p = this.pt(f, f.ring!.x, f.ring!.y, t, ox, oy);
    const r = t * 0.47 * (1 + Math.sin(f.now / 220) * 0.05);
    ctx.save(); ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = Math.max(4, t * 0.08); ctx.setLineDash([t * 0.16, t * 0.09]);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke(); ctx.restore();
  }

  private drawMarker(f: Frame, t: number, ox: number, oy: number): void {
    const { ctx } = this; const p = this.pt(f, f.marker!.x, f.marker!.y, t, ox, oy);
    ctx.save(); ctx.fillStyle = f.marker!.kind === 'crash' ? 'rgba(255,128,96,0.85)' : 'rgba(255,214,102,0.8)'; ctx.beginPath(); ctx.arc(p.x, p.y, t * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(t * 0.4)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.marker!.kind === 'crash' ? '!' : '…', p.x, p.y + t * 0.02);
    ctx.restore();
  }

  private drawRover(f: Frame, t: number, ox: number, oy: number): void {
    const { ctx } = this; const { cfg } = f; const r = f.rover;
    const cx = ox + (r.x + 0.5) * t, cy = oy + (r.y + 0.5) * t - r.lift * LIFT * t;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((r.ang * Math.PI) / 180);
    const u = t * 0.46; // half length of the body
    const towed = f.lv.req.filter((q, i) => q.kind === 'r' && ((f.taken >> i) & 1)).length;
    for (let k = 1; k <= towed; k++) {                                       // each rescued rover hangs on a rope behind
      const by = u * (0.9 + 1.25 * k);
      ctx.strokeStyle = '#6b6862'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, u * (k === 1 ? 0.7 : by / u - 1.55)); ctx.lineTo(0, by - u * 0.55); ctx.stroke();
      ctx.fillStyle = '#9d9a94'; ctx.strokeStyle = '#6b6862'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-u * 0.38, by - u * 0.55, u * 0.76, u * 1.0, u * 0.14); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,36,30,0.16)'; ctx.beginPath(); ctx.ellipse(0, u * 0.12, u * 0.95, u * 0.9, 0, 0, 7); ctx.fill();
    const wr = cfg.wheels === 'L' ? u * 0.34 : u * 0.22, wx = u * 0.62;
    ctx.fillStyle = C.wheel;
    for (const sx of [-1, 1]) for (const wy of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.arc(sx * wx, wy * u * 1.1, wr, 0, 7); ctx.fill(); }
    ctx.fillStyle = C.gold; ctx.strokeStyle = C.goldDark; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-u * 0.5, -u * 0.8, u, u * 1.6, u * 0.2); ctx.fill(); ctx.stroke();
    const pw = cfg.panel === 'L' ? u * 1.7 : u * 0.8, ph = u * 0.52;
    ctx.fillStyle = C.panel; ctx.strokeStyle = C.panelHi; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2 + u * 0.1, pw, ph, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -ph / 2 + u * 0.1); ctx.lineTo(0, ph / 2 + u * 0.1); ctx.stroke();
    ctx.strokeStyle = '#e8e4dc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -u * 0.05); ctx.lineTo(0, cfg.mast === 'T' ? -u * 0.75 : -u * 0.38); ctx.stroke();
    ctx.fillStyle = '#e8e4dc'; ctx.beginPath(); ctx.arc(0, cfg.mast === 'T' ? -u * 0.78 : -u * 0.4, u * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -u * 1.05); ctx.lineTo(u * 0.2, -u * 0.72); ctx.lineTo(-u * 0.2, -u * 0.72); ctx.closePath(); ctx.fill(); // the front
    ctx.restore();
  }

  private drawFog(f: Frame, t: number, ox: number, oy: number): void {
    const { ctx } = this; const { lv } = f;
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) {
      const d = Math.hypot(x - f.rover.x, y - f.rover.y);
      if (d < 1.2) continue;
      const wob = Math.sin(f.now / 900 + x * 1.7 + y * 2.3) * t * 0.04;
      ctx.fillStyle = C.fog; ctx.beginPath(); ctx.ellipse(ox + (x + 0.5) * t + wob, oy + (y + 0.5) * t, t * 0.62, t * 0.55, 0, 0, 7); ctx.fill();
    }
  }
}
