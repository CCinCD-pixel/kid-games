/**
 * S4 发射序列 (spec §3.5, §6.6) — the part after the board's own finale (pads flash in order, the
 * lift sinks the cargo: 0–1000 ms). From 1000 ms: the board dims 35 %, the route's rocket rises from
 * below the board (ignition: `sok-ignite`, a 3 px screen shake, flame and smoke puffs every 40 ms)
 * and flies up through the board toward the route's destination silhouette (1300 ms, inCubic).
 *  - every route's first launch: +800 ms — it reaches the destination, which flashes, and the
 *    companion says `sok.launch.<dest>` (3.2 s in all, cannot be skipped);
 *  - boss levels: at 1600 ms the boosters separate (tumbling down, a puff, `whoosh-down`), at 1700 ms
 *    the second stage lights blue-white (`sok-ignite` rate 1.2); the flight takes 1800 ms (3.6 s;
 *    a boss's first pass cannot be skipped);
 *  - otherwise a tap anywhere fast-forwards to the result card;
 *  - reduced motion: a 1.2 s fade in / out, no shake, no particles; `instant` (tests): 50 ms.
 * A rotation mid-flight just re-anchors the rocket (positions are recomputed every frame); a hidden
 * page ends the sequence (it never replays).
 */
import { drawDestination, ROCKET_H, RocketSprite, type RocketKind } from '../render/rocket';
import type { Rect } from '../render/layout';

export interface LaunchOptions {
  kind: RocketKind;
  boss: boolean;
  /** the route's first launch ever: the long version with the arrival flash + line */
  firstOnRoute: boolean;
  /** cannot be skipped (first on the route, or a boss's first pass) */
  locked: boolean;
  reduced: boolean;
  instant: boolean;
  /** the board's drawing rectangle (page px), read every frame (rotation) */
  boardRect: () => Rect;
  /** the warehouse outline (page px origin), dimmed instead of the whole rectangle */
  boardOutline?: () => { path: Path2D; x: number; y: number };
  /** the element to shake (the play screen) */
  shakeEl: HTMLElement;
  sfx: (name: string, o?: { volume?: number; rate?: number }) => void;
  /** say the arrival line (first launch on the route) */
  say: (id: string) => Promise<unknown>;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  life: number;
  max: number;
}

const DEST_LINE: Record<RocketKind, string> = { tiangong: 'sok.launch.tiangong', moon: 'sok.launch.moon', mars: 'sok.launch.mars' };

const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * Where the flight ends: the sky corner the backdrop leaves empty (its own ornaments sit upper right in
 * portrait, upper left in landscape — two space stations side by side would read as a mistake).
 */
function destPoint(w: number, h: number): { x: number; y: number; r: number } {
  return h > w ? { x: w * 0.2, y: h * 0.17, r: Math.min(56, w * 0.07) } : { x: w * 0.66, y: h * 0.19, r: Math.min(52, h * 0.065) };
}

export class LaunchSequence {
  private readonly cv: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private sprite: RocketSprite | null = null;
  private spriteH = 0;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private raf = 0;
  private t0 = 0;
  private puffs: Puff[] = [];
  private lastPuff = 0;
  private frame = 0;
  private done: (() => void) | null = null;
  private finished = false;
  private skipRequested = false;
  private said = false;
  private ignited = 0;
  private sepSound = false;
  private onHidden = () => {
    if (document.visibilityState === 'hidden') this.finish();
  };

  constructor(private readonly o: LaunchOptions) {
    this.cv = document.createElement('canvas');
    this.cv.className = 'sok-launch';
    this.cv.dataset.testid = 'launch';
    this.cv.dataset.kind = o.kind;
    this.ctx = this.cv.getContext('2d')!;
    document.body.append(this.cv);
    this.cv.addEventListener('pointerup', () => {
      if (!this.o.locked) this.skipRequested = true;
    });
    document.addEventListener('visibilitychange', this.onHidden);
  }

  /** Total length of the launch part (ms, after the board finale). */
  get duration(): number {
    if (this.o.instant) return 50;
    if (this.o.reduced) return 1200;
    const flight = this.o.boss ? 1800 : 1300;
    return flight + (this.o.firstOnRoute ? 900 : 100);
  }

  private get flight(): number {
    return this.o.boss ? 1800 : 1300;
  }

  /** Run to the end (or until skipped); resolves when the result card may show. */
  run(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.done = resolve;
      if (this.o.instant) {
        setTimeout(() => this.finish(), 50);
        return;
      }
      this.t0 = performance.now();
      if (!this.o.reduced) {
        this.o.sfx('sok-ignite', { volume: 0.8 });
        this.shake(3, 300);
        this.ignited = 1;
      }
      this.raf = requestAnimationFrame(this.tick);
    });
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pw = Math.round(w * this.dpr);
    const ph = Math.round(h * this.dpr);
    if (this.cv.width !== pw || this.cv.height !== ph) {
      this.cv.width = pw;
      this.cv.height = ph;
      this.cv.style.width = `${w}px`;
      this.cv.style.height = `${h}px`;
    }
    // the rocket is 0.55 × the screen height in portrait (spec §6.4); a little less in landscape
    const want = Math.round((h > w ? 0.55 : 0.6) * h);
    if (!this.sprite || Math.abs(want - this.spriteH) > 2) {
      this.sprite?.dispose();
      this.spriteH = want;
      this.sprite = new RocketSprite(this.o.kind, want / ROCKET_H[this.o.kind], this.dpr);
    }
  }

  private shake(px: number, ms: number): void {
    if (this.o.reduced || this.o.instant) return;
    this.o.shakeEl.animate(
      [{ transform: 'translate(0,0)' }, { transform: `translate(${px}px,-${px}px)` }, { transform: `translate(-${px}px,${px}px)` }, { transform: `translate(${px}px,${px}px)` }, { transform: 'translate(0,0)' }],
      { duration: ms, iterations: 1 },
    );
  }

  private tick = (now: number): void => {
    this.raf = 0;
    if (this.finished) return;
    const t = now - this.t0;
    this.frame += 1;
    this.resize();
    this.draw(t);
    const end = this.duration;
    if (t >= end || (this.skipRequested && t > 120)) {
      this.finish();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(t: number): void {
    const g = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const board = this.o.boardRect();
    const dest = destPoint(w, h);
    const sprite = this.sprite!;
    if (this.o.reduced) {
      // 1.2 s: dim, the rocket fades in over the board, holds, fades out; the destination shows
      const a = t < 400 ? t / 400 : t > 800 ? Math.max(0, (1200 - t) / 400) : 1;
      this.dim(g, board, 0.35 * Math.min(1, t / 200));
      drawDestination(g, this.o.kind, dest.x, dest.y, dest.r, a);
      sprite.draw(g, board.x + board.w / 2, board.y + board.h * 0.5 + sprite.height * 0.5, { flame: 0.6, frame: 0, sep: 0, stage2: 0, alpha: a });
      return;
    }
    // dim the board (200 ms fade)
    this.dim(g, board, 0.35 * clamp01(t / 200));
    // the destination fades in, flashes on arrival (first launch on the route)
    const flight = this.flight;
    const arrive = this.o.firstOnRoute ? clamp01((t - flight) / 260) : 0;
    const destA = clamp01((t - 150) / 400);
    const pulse = arrive > 0 ? Math.sin(Math.min(1, arrive) * Math.PI) : 0;
    drawDestination(g, this.o.kind, dest.x, dest.y, dest.r * (1 + 0.25 * pulse), destA * (0.6 + 0.4 * pulse));
    if (arrive > 0) {
      // the flash: a soft LED ring opening around the destination
      const k = easeOutCubic(clamp01((t - flight) / 520));
      g.strokeStyle = `rgba(143, 247, 236, ${0.85 * (1 - k)})`;
      g.lineWidth = 6 * (1 - k) + 1;
      g.beginPath();
      g.arc(dest.x, dest.y, dest.r * (1.1 + 1.6 * k), 0, Math.PI * 2);
      g.stroke();
      if (!this.said) {
        this.said = true;
        void this.o.say(DEST_LINE[this.o.kind]);
      }
    }
    // the flight: a cubic from below the board (nose at its bottom edge) up and over to the destination
    const u = easeInCubic(clamp01(t / flight));
    const H = sprite.height;
    const p0 = { x: board.x + board.w / 2, y: board.y + board.h + H * 0.92 };
    const p1 = { x: p0.x, y: board.y + board.h * 0.15 };
    const p2 = { x: dest.x + (p0.x - dest.x) * 0.15, y: dest.y + H * 0.35 };
    const p3 = { x: dest.x, y: dest.y + dest.r * 0.6 };
    const bez = (a: number, b: number, c: number, d: number, s: number) => (1 - s) ** 3 * a + 3 * (1 - s) ** 2 * s * b + 3 * (1 - s) * s * s * c + s ** 3 * d;
    const dbez = (a: number, b: number, c: number, d: number, s: number) => 3 * (1 - s) ** 2 * (b - a) + 6 * (1 - s) * s * (c - b) + 3 * s * s * (d - c);
    const x = bez(p0.x, p1.x, p2.x, p3.x, u);
    const y = bez(p0.y, p1.y, p2.y, p3.y, u);
    const ang = Math.max(-0.6, Math.min(0.6, Math.atan2(dbez(p0.x, p1.x, p2.x, p3.x, u), -dbez(p0.y, p1.y, p2.y, p3.y, u) || -1)));
    const scale = 1 - 0.93 * easeInCubic(u);
    const gone = this.o.firstOnRoute ? 0 : clamp01((t - flight + 120) / 120);
    if (u < 1 && gone < 1) {
      // boss: boosters off at 1600 ms (600 ms into the flight), stage 2 at 1700 ms
      const sep = this.o.boss ? clamp01((t - 600) / 900) : 0;
      const stage2 = this.o.boss && t >= 700 ? 1 : 0;
      if (this.o.boss && sep > 0 && !this.sepSound) {
        this.sepSound = true;
        this.o.sfx('whoosh-down', { volume: 0.4 });
        this.puffAt(x, y - H * scale * 0.2, 6, H * scale);
      }
      if (stage2 && this.ignited < 2) {
        this.ignited = 2;
        this.o.sfx('sok-ignite', { volume: 0.8, rate: 1.2 });
        this.shake(2, 200);
      }
      if (t > 140 && this.ignited === 1 && !this.launchSound) {
        this.launchSound = true;
        this.o.sfx('launch', { volume: 0.9 });
      }
      // smoke every 40 ms at the nozzle, while low
      if (t - this.lastPuff >= 40 && u < 0.6) {
        this.lastPuff = t;
        this.puffAt(x, y, 2, H * scale);
      }
      this.stepPuffs(g);
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.scale(scale, scale);
      const flame = Math.min(1, t / 160) * (0.85 + 0.15 * Math.sin(t / 30));
      sprite.draw(g, 0, 0, { flame, frame: this.frame, sep, stage2, alpha: 1 - gone });
      g.restore();
    } else {
      this.stepPuffs(g);
      if (this.o.firstOnRoute) {
        // parked beside the destination while it flashes: a tiny rocket glint
        g.fillStyle = 'rgba(255, 250, 240, 0.9)';
        g.beginPath();
        g.arc(p3.x - dest.r * 0.9, p3.y - dest.r * 0.2, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private launchSound = false;

  /** Darken the warehouse (its own outline when known, else its rectangle). */
  private dim(g: CanvasRenderingContext2D, board: Rect, a: number): void {
    g.fillStyle = `rgba(3, 5, 22, ${a})`;
    const o = this.o.boardOutline?.();
    if (o) {
      g.save();
      g.translate(o.x, o.y);
      g.fill(o.path);
      g.restore();
    } else g.fillRect(board.x, board.y, board.w, board.h);
  }

  private puffAt(x: number, y: number, n: number, H: number): void {
    for (let i = 0; i < n; i += 1) {
      if (this.puffs.length > 90) this.puffs.shift();
      const k = ((this.frame * 7 + i * 13) % 17) / 17 - 0.5;
      this.puffs.push({ x: x + k * H * 0.08, y: y + H * 0.02, vx: k * H * 0.5, vy: H * (0.12 + Math.abs(k) * 0.1), r: H * 0.035, grow: H * 0.12, life: 0, max: 0.9 + Math.abs(k) * 0.4 });
    }
  }

  private stepPuffs(g: CanvasRenderingContext2D): void {
    const dt = 1 / 60;
    const next: Puff[] = [];
    for (const p of this.puffs) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.94;
      const k = p.life / p.max;
      const r = p.r + p.grow * easeOutCubic(k);
      g.fillStyle = `rgba(232, 226, 240, ${0.75 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(255, 250, 240, ${0.5 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.55, 0, Math.PI * 2);
      g.fill();
      next.push(p);
    }
    this.puffs = next;
  }

  /** End now (tap skip, hidden page, destroy). */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.sprite?.dispose();
    this.cv.width = this.cv.height = 0;
    this.cv.remove();
    this.done?.();
  }
}
