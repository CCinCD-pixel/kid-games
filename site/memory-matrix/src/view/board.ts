// One <canvas> per board (spec §10.1: ≈4 DOM nodes per board). Stars, constellation lines, cloud cover, the mirror strip and every effect are painted here and
// repainted only while something moves (no idle rAF during recall). Hit testing is arithmetic on the pointer position.
import { onTap } from '@kit/input';
import { ease, prefersReducedMotion } from '@kit/tween';
import { fogSprite, glassSprite, hazeSprite, skyStarSprite, sparklePath, starSprite, type Hue } from '../art/sprites';

export interface BoardOpts { S: number; kind: 's1' | 's2' | 's4'; g?: number; axis?: 'LR' | 'UD' | null; mirrorW?: number; dpr?: number }
export type ItemKind = 'lit' | 'ok' | 'shadow' | 'ghost' | 'dim' | 'reveal' | 'miss' | 'sky';
interface Item { x: number; y: number; kind: ItemKind; hue: Hue; t0: number; size: number; num?: number; pulseUntil?: number; alpha: number }
interface Fx { type: 'burst' | 'ring' | 'puff' | 'streak' | 'dash'; x: number; y: number; x2?: number; y2?: number; t0: number; dur: number; hue?: Hue; size?: number }
interface Line { a: [number, number]; b: [number, number]; t0: number; dur: number; color: string; w: number; dash: boolean; alpha: number }
interface Tw { t0: number; dur: number; f: (p: number) => void; done: () => void; ease: (t: number) => number }

const SLOT = '#4f63b4';          // empty star slot: 3.3:1 on the night sky (spec §9.1)
const now = () => performance.now();
const motion = () => (prefersReducedMotion() ? 0.5 : 1);

export class StarBoard {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly S: number; readonly g: number; readonly kind: BoardOpts['kind']; readonly axis: 'LR' | 'UD' | null;
  readonly pad: number; readonly pitch: number; readonly mw: number; readonly dpr: number;
  items = new Map<string, Item>();
  lines: Line[] = [];
  private fx: Fx[] = [];
  private tweens = new Set<Tw>();
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  slotsOn = true;
  fog = { level: 0, region: 'all' as 'all' | 'half0' | 'half1', drift: 0 };
  twinkle = false;
  /** s4: the half that carries the source stars (slots there are quieter) */
  srcHalf: 0 | 1 | null = null;
  private off: (() => void) | null = null;

  constructor(opts: BoardOpts) {
    this.S = opts.S; this.kind = opts.kind; this.g = opts.g ?? 0; this.axis = opts.axis ?? null; this.mw = this.axis ? (opts.mirrorW ?? 8) : 0;
    this.dpr = opts.dpr ?? Math.min(2, window.devicePixelRatio || 1);
    this.pad = Math.round(Math.max(8, Math.min(16, this.S * 0.035)));
    this.pitch = this.g ? (this.S - 2 * this.pad - this.mw) / this.g : 0;
    this.el = document.createElement('div'); this.el.className = 'mm-board'; this.el.style.width = this.el.style.height = `${this.S}px`;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = Math.round(this.S * this.dpr);
    this.canvas.style.width = this.canvas.style.height = `${this.S}px`;
    this.canvas.setAttribute('role', 'img'); this.canvas.setAttribute('aria-label', this.kind === 's1' ? '星图观测窗：点出亮过的星星' : this.kind === 's2' ? '夜空：按流星飞过的顺序点星星' : '镜子观测窗：点出星星的影子');
    this.el.append(this.canvas);
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D; this.ctx.scale(this.dpr, this.dpr);
    this.draw();
  }

  /* ------------------------------------------------------------ geometry */
  center(i: number): [number, number] {
    const g = this.g, r = Math.floor(i / g), c = i % g, half = g / 2;
    const ox = this.axis === 'LR' && c >= half ? this.mw : 0, oy = this.axis === 'UD' && r >= half ? this.mw : 0;
    return [this.pad + c * this.pitch + ox + this.pitch / 2, this.pad + r * this.pitch + oy + this.pitch / 2];
  }
  halfOfCell(i: number): 0 | 1 { const k = this.axis === 'LR' ? i % this.g : Math.floor(i / this.g); return k < this.g / 2 ? 0 : 1; }
  /** the grid cell under a board-local point, or -1 (the mirror strip and the frame are not cells) */
  cellAt(px: number, py: number): number {
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.g * this.g; i += 1) { const [x, y] = this.center(i), d = Math.max(Math.abs(px - x), Math.abs(py - y)); if (d < bd) { bd = d; best = i; } }
    return bd <= this.pitch * 0.55 ? best : -1;
  }
  /** the bounding box of a cell in viewport coordinates (for the ghost hand / 44 px assertions) */
  screenRect(i: number): DOMRect { const b = this.canvas.getBoundingClientRect(), k = b.width / this.S || 1, [x, y] = this.center(i), h = this.pitch / 2; return new DOMRect(b.left + (x - h) * k, b.top + (y - h) * k, this.pitch * k, this.pitch * k); }
  screenPoint(x: number, y: number): [number, number] { const b = this.canvas.getBoundingClientRect(), k = b.width / this.S || 1; return [b.left + x * k, b.top + y * k]; }
  get starR(): number { return this.g ? this.pitch * 0.33 : Math.max(14, Math.min(21, this.S * 0.034)); }

  /** wire taps; the callback gets board-local px */
  onPoint(cb: (x: number, y: number, e: PointerEvent) => void): void {
    this.off?.();
    this.off = onTap(this.canvas, (e) => { const b = this.canvas.getBoundingClientRect(), k = b.width / this.S || 1; cb((e.clientX - b.left) / k, (e.clientY - b.top) / k, e); }, { slop: 14, maxMs: 2500 });       // a 6-year-old often presses and holds: up to 2.5 s still counts as a tap (never silence)
  }
  /** the layout may scale the whole board (rotation, split screen): the canvas keeps its pixels, taps are mapped back */
  scaleTo(S: number): void { this.el.style.width = this.el.style.height = `${S}px`; this.canvas.style.width = this.canvas.style.height = `${S}px`; }
  saveState(): { items: Map<string, Item>; lines: Line[] } { return { items: new Map([...this.items].map(([k, v]) => [k, { ...v }])), lines: this.lines.slice() }; }
  restoreState(st: { items: Map<string, Item>; lines: Line[] }): void { this.items = new Map([...st.items].map(([k, v]) => [k, { ...v, t0: -1e9 }])); this.lines = st.lines; this.kick(); }
  /** also shrinks the canvas: iOS Safari releases detached canvases lazily, a 1280^2 backing store must not wait for the garbage collector */
  destroy(): void { this.off?.(); cancelAnimationFrame(this.raf); this.tweens.clear(); this.fx = []; this.el.remove(); this.canvas.width = this.canvas.height = 0; }

  /* ------------------------------------------------------------ model */
  setItem(key: string, x: number, y: number, kind: ItemKind, o: Partial<Item> = {}): void {
    const hue: Hue = o.hue ?? (kind === 'shadow' ? 'ice' : kind === 'miss' ? 'amber' : 'gold');
    this.items.set(key, { x, y, kind, hue, t0: now(), size: this.starR, alpha: 1, ...o });
    this.kick();
  }
  setCell(i: number, kind: ItemKind, o: Partial<Item> = {}): void { const [x, y] = this.center(i); this.setItem(`c${i}`, x, y, kind, o); }
  removeItem(key: string): void { this.items.delete(key); this.kick(); }
  clearItems(): void { this.items.clear(); this.lines = []; this.kick(); }
  hasItem(key: string): boolean { return this.items.has(key); }
  pulse(key: string, ms = 1600): void { const it = this.items.get(key); if (it) { it.pulseUntil = now() + ms; this.kick(); } }

  /** dashed / solid line, drawn in over `ms` */
  addLine(a: [number, number], b: [number, number], o: { color?: string; w?: number; dash?: boolean; delay?: number; ms?: number; alpha?: number } = {}): void {
    this.lines.push({ a, b, t0: now() + (o.delay ?? 0), dur: (o.ms ?? 260) * motion(), color: o.color ?? '#fde6ad', w: o.w ?? 2.2, dash: !!o.dash, alpha: o.alpha ?? 0.8 });
    this.kick();
  }
  /** link the 8-neighbour cells of one constellation */
  connect(cells: number[], stagger = 70): void {
    const set = new Set(cells), g = this.g; let k = 0;
    for (const a of cells) for (const b of cells) {
      if (b <= a) continue; const ra = Math.floor(a / g), ca = a % g, rb = Math.floor(b / g), cb = b % g;
      if (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1 && set.has(a) && set.has(b)) { this.addLine(this.center(a), this.center(b), { delay: stagger * k, ms: 240, w: 2.6 }); k += 1; }
    }
  }
  burst(x: number, y: number, hue: Hue = 'gold'): void { this.fx.push({ type: 'burst', x, y, t0: now(), dur: 620 * motion(), hue }); this.kick(); }
  ring(x: number, y: number, hue: Hue = 'jade'): void { this.fx.push({ type: 'ring', x, y, t0: now(), dur: 520 * motion(), hue }); this.kick(); }
  puff(x: number, y: number): void { this.fx.push({ type: 'puff', x, y, t0: now(), dur: 760 * motion(), size: Math.max(this.pitch || 56, 56) * 0.9 }); this.kick(); }
  streak(x1: number, y1: number, x2: number, y2: number, ms = 360): void { this.fx.push({ type: 'streak', x: x1, y: y1, x2, y2, t0: now(), dur: ms * motion() }); this.kick(); }

  tween(ms: number, f: (p: number) => void, e: (t: number) => number = ease.inOutQuad): Promise<void> {
    return new Promise((done) => { this.tweens.add({ t0: now(), dur: Math.max(1, ms * motion()), f, done, ease: e }); this.kick(); });
  }
  setFog(level: number, ms = 600, region: 'all' | 'half0' | 'half1' = this.fog.region): Promise<void> {
    this.fog.region = region; const from = this.fog.level;
    if (ms <= 0) { this.fog.level = level; this.kick(); return Promise.resolve(); }
    return this.tween(ms, (p) => { this.fog.level = from + (level - from) * p; });
  }

  /* ------------------------------------------------------------ loop */
  private busy(): boolean {
    const t = now();
    return this.twinkle || this.tweens.size > 0 || this.fx.length > 0 || this.lines.some((l) => t < l.t0 + l.dur) || [...this.items.values()].some((i) => t < i.t0 + 320 || (i.pulseUntil ?? 0) > t);
  }
  kick(): void { if (!this.raf) this.raf = requestAnimationFrame(this.frame); }
  private frame = (): void => {
    this.raf = 0;
    const t = now();
    for (const tw of [...this.tweens]) { const p = Math.min(1, (t - tw.t0) / tw.dur); tw.f(tw.ease(p)); if (p >= 1) { this.tweens.delete(tw); tw.done(); } }
    this.fx = this.fx.filter((f) => t < f.t0 + f.dur);
    this.draw();
    if (this.busy()) this.raf = requestAnimationFrame(this.frame);
  };

  /* ------------------------------------------------------------ painting */
  private slot(x: number, y: number, a = 0.9, col = SLOT): void {
    const c = this.ctx, r = Math.max(2.4, this.starR * 0.2);
    c.save(); c.globalAlpha = a; c.translate(x, y); c.fillStyle = col; sparklePath(c, r * 1.35, 0.3); c.fill(); c.globalAlpha = a * 0.34; c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r * 2.8, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  private slots(a: number, col = SLOT): void {
    if (this.kind === 's2') return;
    for (let i = 0; i < this.g * this.g; i += 1) {
      if (this.items.has(`c${i}`) && this.items.get(`c${i}`)!.kind !== 'dim') continue;
      const [x, y] = this.center(i); this.slot(x, y, this.srcHalf !== null && this.halfOfCell(i) === this.srcHalf ? a * 0.55 : a, col);
    }
  }
  draw(): void {
    const c = this.ctx, S = this.S, t = now(), dpr = this.dpr;
    c.clearRect(0, 0, S, S); c.drawImage(glassSprite(S, dpr), 0, 0, S, S);
    if (this.axis) this.drawMirror(t);
    if (this.slotsOn) this.slots(0.9);
    for (const l of this.lines) {
      const p = Math.max(0, Math.min(1, (t - l.t0) / l.dur)); if (p <= 0) continue;
      c.save(); c.globalAlpha = l.alpha * Math.min(1, p * 2); c.strokeStyle = l.color; c.lineWidth = l.w; c.lineCap = 'round'; if (l.dash) c.setLineDash([5, 6]);
      c.shadowColor = l.color; c.shadowBlur = l.dash ? 0 : 6; c.beginPath(); c.moveTo(l.a[0], l.a[1]); c.lineTo(l.a[0] + (l.b[0] - l.a[0]) * p, l.a[1] + (l.b[1] - l.a[1]) * p); c.stroke(); c.restore();
    }
    for (const it of this.items.values()) if (it.kind === 'lit') this.drawItem(it, t);
    if (this.fog.level > 0.01) this.drawFog(t);
    for (const it of this.items.values()) if (it.kind !== 'lit') this.drawItem(it, t);
    for (const f of this.fx) this.drawFx(f, t);
  }
  private drawMirror(t: number): void {
    const c = this.ctx, S = this.S, mw = this.mw, mid = this.axis === 'LR' ? this.pad + (this.S - 2 * this.pad - mw) / 2 : this.pad + (this.S - 2 * this.pad - mw) / 2;
    c.save();
    if (this.axis === 'LR') { c.translate(mid, 0); } else { c.translate(0, mid); c.transform(0, 1, 1, 0, 0, 0); }
    // after the transform the strip is always vertical: x in [0, mw], y in [0, S]
    const g = c.createLinearGradient(0, 0, mw, 0); g.addColorStop(0, 'rgba(130,150,200,.55)'); g.addColorStop(0.35, 'rgba(235,242,255,.95)'); g.addColorStop(0.65, 'rgba(180,196,235,.85)'); g.addColorStop(1, 'rgba(110,128,180,.6)');
    c.fillStyle = g; c.shadowColor = 'rgba(160,200,255,.5)'; c.shadowBlur = 10; c.fillRect(0, this.pad * 0.5, mw, S - this.pad);
    c.shadowBlur = 0; c.globalAlpha = 0.55; c.fillStyle = '#fff';
    const sy = ((t / 2600) % 1) * (S + 80) - 40; c.save(); c.beginPath(); c.rect(0, this.pad * 0.5, mw, S - this.pad); c.clip(); c.transform(1, 0, -0.5, 1, 0, 0); c.fillRect(0, sy - 10, mw + 40, 16); c.restore();
    c.globalAlpha = 1; c.fillStyle = '#9fb2dd'; for (const y of [this.pad * 0.5 + 3, S - this.pad * 0.5 - 3]) { c.beginPath(); c.arc(mw / 2, y, Math.max(1.6, mw * 0.2), 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  private drawItem(it: Item, t: number): void {
    const c = this.ctx, age = t - it.t0, appear = Math.min(1, age / (260 * motion())), sc0 = ease.outBack(appear) * 0.9 + 0.1;
    const pulsing = (it.pulseUntil ?? 0) > t, pulse = pulsing ? 1 + 0.2 * Math.sin(t / 110) : this.twinkle && it.kind === 'lit' ? 1 + 0.06 * Math.sin(t / 240 + it.x) : 1;
    const R = it.size * sc0 * pulse;
    c.save(); c.translate(it.x, it.y); c.globalAlpha = it.alpha;
    if (it.kind === 'sky') {
      // the s2 sky stars are the things to tap: a bright pale star with a halo, ~2x the old glyph (QA r1: thin board in daylight)
      const sp = skyStarSprite(it.size, this.dpr), w = sp.width / this.dpr; c.drawImage(sp, -w / 2, -w / 2, w, w);
    } else if (it.kind === 'dim') {
      c.globalAlpha = it.alpha * 0.9; c.fillStyle = SLOT; sparklePath(c, Math.max(4, it.size * 0.36), 0.3); c.fill();
      c.globalAlpha *= 0.28; c.strokeStyle = SLOT; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, Math.max(6, it.size * 0.55), 0, Math.PI * 2); c.stroke();
    } else if (it.kind === 'miss') {
      const h = hazeSprite(it.size * 1.6, this.dpr); c.drawImage(h, -h.width / this.dpr / 2, -h.height / this.dpr / 2, h.width / this.dpr, h.height / this.dpr);
      c.strokeStyle = '#f0a53a'; c.globalAlpha = 0.7; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(0, 0, it.size * 0.9, 0, Math.PI * 2); c.stroke();
    } else {
      const sp = starSprite(it.size, this.dpr, it.kind === 'shadow' ? 'ice' : it.hue), w = (sp.width / this.dpr) * (R / it.size);
      if (it.kind === 'ghost') c.globalAlpha = it.alpha * 0.4;
      c.drawImage(sp, -w / 2, -w / 2, w, w);
      if (it.kind === 'ghost') { c.globalAlpha = 0.7; c.setLineDash([4, 5]); c.strokeStyle = '#a9d8ff'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, it.size * 1.1, 0, Math.PI * 2); c.stroke(); }
      if (it.kind === 'ok' || it.kind === 'shadow') { c.globalAlpha = Math.min(1, age / 200) * it.alpha; c.strokeStyle = it.kind === 'ok' ? '#1aa892' : '#7cc0ff'; c.lineWidth = 2.6; c.beginPath(); c.arc(0, 0, it.size * 1.12, 0, Math.PI * 2); c.stroke(); }
      if (it.kind === 'reveal') { c.globalAlpha = 0.9; c.setLineDash([3, 4]); c.strokeStyle = '#fde6ad'; c.lineWidth = 1.8; c.beginPath(); c.arc(0, 0, it.size * 1.15, 0, Math.PI * 2); c.stroke(); }
    }
    if (it.num !== undefined) {
      const bx = it.size * 0.95, by = -it.size * 0.95, br = Math.max(9, it.size * 0.62);
      c.setLineDash([]); c.globalAlpha = 1; c.fillStyle = '#131b42'; c.strokeStyle = '#fde6ad'; c.lineWidth = 1.6; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#fff6dc'; c.font = `700 ${Math.round(br * 1.25)}px "Baloo 2", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(it.num), bx, by + 1);
    }
    c.restore();
  }
  private drawFog(t: number): void {
    const c = this.ctx, S = this.S, fs = fogSprite(S, this.dpr), r = this.fog.region, drift = ((t / 9000) % 1) * S * 0.25;
    c.save();
    if (r !== 'all') {
      const mid = this.pad + (S - 2 * this.pad - this.mw) / 2 + (r === 'half0' ? 0 : this.mw + 0), cut = r === 'half0' ? mid : mid;
      c.beginPath();
      if (this.axis === 'LR') { if (r === 'half0') c.rect(0, 0, cut, S); else c.rect(cut, 0, S - cut, S); } else if (r === 'half0') c.rect(0, 0, S, cut); else c.rect(0, cut, S, S - cut);
      c.clip();
    }
    c.globalAlpha = this.fog.level * 0.97; c.drawImage(fs, -drift, -drift * 0.6, S * 1.4, S * 1.4);
    c.restore();
    if (this.slotsOn) this.slots(0.95 * Math.min(1, this.fog.level * 1.2), '#c9d6ff');
  }
  private drawFx(f: Fx, t: number): void {
    const c = this.ctx, p = Math.min(1, (t - f.t0) / f.dur); if (p < 0) return;
    c.save();
    if (f.type === 'puff') {
      const h = hazeSprite((f.size ?? 60) * 0.9, this.dpr), s = (h.width / this.dpr) * (0.6 + 0.8 * ease.outCubic(p));
      c.globalAlpha = 0.95 * (1 - p); c.drawImage(h, f.x - s / 2, f.y - s / 2, s, s);
    } else if (f.type === 'ring') {
      c.globalAlpha = 1 - p; c.strokeStyle = f.hue === 'ice' ? '#7cc0ff' : '#35d3b9'; c.lineWidth = 3 * (1 - p) + 1; c.beginPath(); c.arc(f.x, f.y, this.starR * (0.7 + 1.5 * ease.outCubic(p)), 0, Math.PI * 2); c.stroke();
    } else if (f.type === 'burst') {
      const hot = f.hue === 'ice' ? '#d4ecff' : '#ffe9a6';
      for (let k = 0; k < 9; k += 1) {
        const a = (k / 9) * Math.PI * 2 + 0.4, d = this.starR * (0.8 + 1.3 * ease.outCubic(p)), s = (this.starR * 0.2) * (1 - p) + 0.5;
        c.save(); c.translate(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d); c.globalAlpha = 1 - p; c.fillStyle = hot; sparklePath(c, s * 2, 0.25); c.fill(); c.restore();
      }
    } else if (f.type === 'streak') {
      const q = ease.inOutQuad(p), hx = f.x + ((f.x2 ?? f.x) - f.x) * q, hy = f.y + ((f.y2 ?? f.y) - f.y) * q, dx = (f.x2 ?? f.x) - f.x, dy = (f.y2 ?? f.y) - f.y, len = Math.hypot(dx, dy) || 1;
      const tail = Math.min(len * 0.6, 90) * (1 - p * 0.4), tx = hx - (dx / len) * tail, ty = hy - (dy / len) * tail;
      const g = c.createLinearGradient(tx, ty, hx, hy); g.addColorStop(0, 'rgba(255,238,170,0)'); g.addColorStop(1, 'rgba(255,248,215,.95)');
      c.strokeStyle = g; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(tx, ty); c.lineTo(hx, hy); c.stroke();
      c.fillStyle = '#fff'; c.shadowColor = '#ffe9a6'; c.shadowBlur = 12; c.beginPath(); c.arc(hx, hy, 3.4, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
}
