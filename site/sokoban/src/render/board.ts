/**
 * BoardView — the 切面货舱 diorama (spec §6.3, §8.5): two canvases (static `bg`: shadow, floor,
 * pads; dynamic `fg`: wall rows → crates → robot → dust, row by row with the painter's algorithm,
 * then the signal overlay), CSS pad glows between them, one rAF loop that runs only while
 * something moves, and a 12 fps idle timer that redraws just the robot's box.
 * The view never decides game logic: play.ts feeds it session events and it performs them.
 */
import type { Level } from '@engines/puzzle/src/types';
import { nb } from '@engines/puzzle/src/level';
import { Animator, ease } from './anim';
import { releaseCanvas, takeCanvas } from './canvasPool';
import { drawCrate, drawPadMarks, type CrateLook } from './crate';
import { Particles, drawArrow, drawDeadBadge, drawDeadFrame, drawFootprints, drawHintRing, drawLitCell, drawLockRing, drawPushChevron, drawQuizMark, drawRipple, drawRoute, drawTargetRing, drawUnreachable } from './fx';
import type { HallKit } from './halls';
import { ROBOT_FEET, boardGeom, type BoardGeom, type Rect } from './layout';
import { CRATES } from './palette';
import { drawRobot, restPose, type Cosmetics, type Expr, type Facing, type RobotPose } from './robot';
import { CRATE_H, WALL_H, drawFloor, drawShadow, drawWallRow, visibleWall, type TileView } from './tiles';

export type Sfx = (name: string, o?: { volume?: number; rate?: number; pan?: number }) => void;

export interface CrateView {
  slot: number;
  color: number;
  x: number;
  y: number;
  look: CrateLook;
  /** pad marks shown (crate on its pad) 0 … 1 */
  marks: number;
}

export interface RobotView {
  x: number;
  y: number;
  pose: RobotPose;
}

export type Hit =
  | { kind: 'arrow'; dir: number }
  | { kind: 'robot' }
  | { kind: 'crate'; slot: number }
  | { kind: 'floor'; cell: number }
  | { kind: 'wall'; cell: number }
  | { kind: 'void' };

interface Timed {
  t: number;
}

const STEP_MS = 110;
const PUSH_MS = 150;
/** no input for this long: the asleep robot stops moving and the idle timer ends (noteInput wakes it) */
const IDLE_STOP_MS = 180_000;

export interface BoardOptions {
  level: Level;
  hall: HallKit;
  levelId: string;
  crates: ArrayLike<number>;
  player: number;
  reducedMotion?: boolean;
  /** durations × 0 (tests) */
  instant?: boolean;
  /** dev only (`?slowmo=N`): every board animation N× slower, for frame-by-frame review */
  slowmo?: number;
  sfx?: Sfx;
  cosmetics?: Cosmetics;
  /** false: a static board without 小推 (侦探题) */
  showRobot?: boolean;
}

export class BoardView {
  readonly el: HTMLDivElement;
  private readonly bg: HTMLCanvasElement;
  private readonly fg: HTMLCanvasElement;
  private readonly glowLayer: HTMLDivElement;
  private readonly bgx: CanvasRenderingContext2D;
  private readonly fgx: CanvasRenderingContext2D;
  geom!: BoardGeom;
  private dpr = 1;
  readonly level: Level;
  readonly hall: HallKit;
  readonly levelId: string;
  robot: RobotView;
  crates: CrateView[];
  readonly anim: Animator;
  readonly particles = new Particles();
  private wallRows: (HTMLCanvasElement | null)[] = [];
  private floorRows: (HTMLCanvasElement | null)[] = [];
  private rowBandTop: number[] = [];
  private readonly sfx: Sfx;
  readonly reduced: boolean;
  readonly instant: boolean;
  private readonly slowmo: number;
  // overlays
  readonly marks = new Map<number, Timed>();
  footprints: { cell: number; dir: number; t: number; alpha: number }[] = [];
  private heldFootprint: { cell: number; dir: number; t: number; alpha: number } | null = null;
  arrows: { slot: number; dirs: number[]; t: number; pressed: number } | null = null;
  private ripples: { x: number; y: number; t: number }[] = [];
  private frames: { cell: number; alpha: number }[] = [];
  private targets: { cell: number; t: number }[] = [];
  private lockRings: { x: number; y: number; t: number }[] = [];
  /** after-images: cyan ghosts (rewind, demos) or `plain` same-colour trails (redo) */
  private ghosts: { x: number; y: number; crate?: { x: number; y: number; color: number }; pose: RobotPose; alpha: number; plain?: boolean }[] = [];
  private ghostCanvas: HTMLCanvasElement | null = null;
  hint: { slot: number; pulse: number } | null = null;
  /** H2: the push chevron on a crate (t = reveal 0 … 1) */
  hint2: { slot: number; dir: number; t: number } | null = null;
  /** H3: the ghost demonstration (cyan robot + the crates it moved) over a board dimmed 20 % */
  private demoState: { robot: { x: number; y: number; pose: RobotPose }; crates: Map<number, { x: number; y: number; color: number }>; alpha: number; dim: number; hideRobot?: boolean } | null = null;
  private demoAborted = false;
  private dimPath: Path2D | null = null;
  /** route preview (tutor): cells from the robot to a stand cell, revealed 0 … 1, fading */
  private route: { cells: number[]; reveal: number; alpha: number; dir: number; prints: number } | null = null;
  /** entrance: per-layer progress (null when done) */
  private entering: { floor: number[]; walls: number[]; crates: number[]; robot: number; fade: number } | null = null;
  private raf = 0;
  private lastFrame = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleT0 = performance.now();
  private lastInput = performance.now();
  private nextBlink = 0;
  private blinkUntil = 0;
  private hidden = false;
  private destroyed = false;
  private glowEls = new Map<number, HTMLDivElement>();
  /** 侦探题: magnifier marks on crates (ok = the cyan ✓ of a live crate) and lit cells of a ghost slide */
  readonly quizMarks = new Map<number, { t: number; ok?: boolean }>();
  lit: { cell: number; a: number }[] = [];
  readonly showRobot: boolean;
  /** extra overlay drawing hook (hints, ghosts from play.ts) */
  overlayHook: ((ctx: CanvasRenderingContext2D, b: BoardView) => void) | null = null;
  /** the frame time of the last draw (perf probes) */
  lastDrawMs = 0;

  constructor(host: HTMLElement, o: BoardOptions) {
    this.level = o.level;
    this.hall = o.hall;
    this.levelId = o.levelId;
    this.sfx = o.sfx ?? (() => {});
    this.reduced = !!o.reducedMotion;
    this.instant = !!o.instant;
    this.showRobot = o.showRobot !== false;
    this.anim = new Animator();
    this.slowmo = Math.max(1, o.slowmo ?? 1);
    this.anim.scale = this.instant ? 0 : (this.reduced ? 0.5 : 1) * this.slowmo;
    this.anim.onAdd = () => this.requestFrame();
    this.particles.enabled = !this.reduced && !this.instant;
    this.el = document.createElement('div');
    this.el.className = 'sok-board';
    this.bg = document.createElement('canvas');
    this.bg.className = 'sok-board__bg';
    this.glowLayer = document.createElement('div');
    this.glowLayer.className = 'sok-board__glow';
    this.fg = document.createElement('canvas');
    this.fg.className = 'sok-board__fg';
    this.el.append(this.bg, this.glowLayer, this.fg);
    host.append(this.el);
    this.bgx = this.bg.getContext('2d')!;
    this.fgx = this.fg.getContext('2d')!;
    const pr = o.player;
    this.robot = { x: pr % this.level.W, y: (pr / this.level.W) | 0, pose: { ...restPose(1), cosmetics: o.cosmetics } };
    this.crates = Array.from(o.crates, (cell, slot) => ({
      slot, color: this.level.colorOf[slot], x: cell % this.level.W, y: (cell / this.level.W) | 0,
      look: { color: this.level.colorOf[slot], lock: 0 }, marks: 0,
    }));
    this.syncLocks(true);
  }

  // ------------------------------------------------------------------ geometry

  get s(): number {
    return this.geom.s;
  }

  /** Lay out inside `area` (page px). Rebuilds the static layers; finishes running tweens first. */
  layout(area: Rect): void {
    this.anim.finishAll();
    const l = this.level;
    this.geom = boardGeom(area, l.W, l.H);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = this.geom.canvas;
    Object.assign(this.el.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` });
    for (const cv of [this.bg, this.fg]) {
      cv.width = Math.round(c.w * this.dpr);
      cv.height = Math.round(c.h * this.dpr);
      cv.style.width = `${c.w}px`;
      cv.style.height = `${c.h}px`;
    }
    this.dimPath = null;
    this.buildStatic();
    this.buildGlows();
    this.draw();
  }

  /** Cell top-left in canvas px. */
  cellXY(cell: number): { x: number; y: number } {
    return { x: this.geom.ox + (cell % this.level.W) * this.s, y: this.geom.oy + ((cell / this.level.W) | 0) * this.s };
  }

  /** Cell centre in page px (for ghost hands, tests). */
  cellCenterPage(cell: number): { x: number; y: number } {
    const p = this.cellXY(cell);
    return { x: this.geom.canvas.x + p.x + this.s / 2, y: this.geom.canvas.y + p.y + this.s / 2 };
  }

  /** Visual centre of a crate's top face (page px) — what a finger aims at. */
  crateCenterPage(slot: number): { x: number; y: number } {
    const c = this.crates[slot];
    return { x: this.geom.canvas.x + this.geom.ox + (c.x + 0.5) * this.s, y: this.geom.canvas.y + this.geom.oy + (c.y + 0.3) * this.s };
  }

  /** The warehouse's own outline (floor + visible walls) and the canvas origin in page px: the launch dims exactly this. */
  outlinePage(): { path: Path2D; x: number; y: number } {
    return { path: this.boardPath(), x: this.geom.canvas.x, y: this.geom.canvas.y };
  }

  /** The warehouse grid in page px (walls' raised tops included). */
  gridRectPage(): Rect {
    const g = this.geom;
    return { x: g.canvas.x + g.ox, y: g.canvas.y + g.oy - WALL_H * this.s, w: this.level.W * this.s, h: (this.level.H + WALL_H) * this.s };
  }

  robotCenterPage(): { x: number; y: number } {
    return { x: this.geom.canvas.x + this.geom.ox + (this.robot.x + 0.5) * this.s, y: this.geom.canvas.y + this.geom.oy + (this.robot.y + 0.35) * this.s };
  }

  private tile(ctx: CanvasRenderingContext2D, ox = this.geom.ox, oy = this.geom.oy): TileView {
    return { ctx, level: this.level, hall: this.hall, levelId: this.levelId, s: this.s, ox, oy };
  }

  private buildStatic(): void {
    const { s } = this;
    const l = this.level;
    const c = this.geom.canvas;
    for (const cv of this.wallRows) releaseCanvas(cv);
    for (const cv of this.floorRows) releaseCanvas(cv);
    this.wallRows = [];
    this.floorRows = [];
    this.rowBandTop = [];
    // bg: shadow + floor + pads
    const b = this.bgx;
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    b.clearRect(0, 0, c.w, c.h);
    drawShadow(this.tile(b));
    drawFloor(this.tile(b));
    // per-row wall images (band from the raised top face to the bottom of the front face)
    for (let r = 0; r < l.H; r += 1) {
      let any = false;
      for (let cc = 0; cc < l.W; cc += 1) if (visibleWall(l, r, cc)) any = true;
      const top = this.geom.oy + r * s - WALL_H * s - 4;
      this.rowBandTop.push(top);
      if (!any) {
        this.wallRows.push(null);
        continue;
      }
      const h = s + WALL_H * s + 8;
      const cv = takeCanvas(c.w * this.dpr, h * this.dpr);
      const x = cv.getContext('2d')!;
      x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      x.clearRect(0, 0, c.w, h);
      drawWallRow(this.tile(x, this.geom.ox, this.geom.oy - top), r);
      this.wallRows.push(cv);
    }
  }

  private buildFloorRows(): void {
    const { s } = this;
    const l = this.level;
    const c = this.geom.canvas;
    for (const cv of this.floorRows) releaseCanvas(cv);
    this.floorRows = [];
    for (let r = 0; r < l.H; r += 1) {
      const cv = takeCanvas(c.w * this.dpr, (s + 2) * this.dpr);
      const x = cv.getContext('2d')!;
      x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      x.clearRect(0, 0, c.w, s + 2);
      x.save();
      x.beginPath();
      x.rect(0, 0, c.w, s + 1);
      x.clip();
      drawFloor(this.tile(x, this.geom.ox, -r * s));
      x.restore();
      this.floorRows.push(cv);
    }
  }

  private buildGlows(): void {
    this.glowLayer.textContent = '';
    this.glowEls.clear();
    const l = this.level;
    const { s } = this;
    for (let i = 0; i < l.N; i += 1) {
      if (l.goal[i] < 0) continue;
      const p = this.cellXY(i);
      const d = document.createElement('div');
      d.className = 'sok-padglow';
      d.style.cssText = `left:${p.x + s * 0.02}px;top:${p.y + s * 0.02}px;width:${s * 0.96}px;height:${s * 0.96}px;--pad:${CRATES[l.goal[i]]?.top ?? CRATES[0].top}`;
      this.glowLayer.append(d);
      this.glowEls.set(i, d);
    }
    this.syncGlows();
  }

  private syncGlows(): void {
    const occupied = new Set(this.crates.map((c) => Math.round(c.y) * this.level.W + Math.round(c.x)));
    for (const [cell, el] of this.glowEls) el.classList.toggle('is-covered', occupied.has(cell));
  }

  /** Crates on their own pad get the locked look (no animation when `instant`). */
  syncLocks(instant = false): void {
    for (const c of this.crates) {
      const cell = Math.round(c.y) * this.level.W + Math.round(c.x);
      const on = this.level.goal[cell] === c.color;
      if (instant) {
        c.look.lock = on ? 1 : 0;
        c.marks = on ? 1 : 0;
      }
    }
    if (this.glowEls.size) this.syncGlows();
  }

  // ------------------------------------------------------------------ drawing

  requestFrame(): void {
    if (this.destroyed || this.hidden) return;
    this.stopIdle();
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    const dt = (this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60) / this.slowmo;
    this.lastFrame = now;
    const a = this.anim.tick(now);
    const p = this.particles.step(dt);
    this.draw();
    if (a || p) this.raf = requestAnimationFrame(this.frame);
    else {
      this.lastFrame = 0;
      this.startIdle();
    }
  };

  /** Full fg frame (or a clipped part of it). */
  draw(clip?: { x: number; y: number; w: number; h: number }): void {
    if (!this.geom) return;
    const t0 = performance.now();
    const g = this.fgx;
    const c = this.geom.canvas;
    const { s } = this;
    const l = this.level;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (clip) {
      g.save();
      g.beginPath();
      g.rect(clip.x, clip.y, clip.w, clip.h);
      g.clip();
      g.clearRect(clip.x, clip.y, clip.w, clip.h);
    } else g.clearRect(0, 0, c.w, c.h);
    const ent = this.entering;
    const robotRow = Math.ceil(this.robot.y - 1e-6);
    for (let r = 0; r < l.H; r += 1) {
      // floor rows during the entrance (the bg holds only the shadow then)
      if (ent && this.floorRows[r]) {
        const k = ent.floor[r];
        if (k > 0) {
          g.save();
          g.globalAlpha = Math.min(1, k * 1.4);
          const cy = this.geom.oy + (r + 0.5) * s;
          g.translate(c.w / 2, cy);
          const sc = 0.6 + 0.4 * k;
          g.scale(sc, sc);
          g.translate(-c.w / 2, -cy);
          g.drawImage(this.floorRows[r]!, 0, this.geom.oy + r * s, c.w, s + 2);
          g.restore();
        }
      }
      const wr = this.wallRows[r];
      if (wr) {
        const k = ent ? ent.walls[r] : 1;
        if (k > 0) {
          g.save();
          if (k < 1) {
            g.globalAlpha = Math.min(1, k * 2);
            g.translate(0, -(1 - k) * 0.6 * s);
          }
          g.drawImage(wr, 0, this.rowBandTop[r], c.w, s + WALL_H * s + 8);
          g.restore();
        }
      }
      // crates in this row (moving ones belong to the lower row)
      for (const cr of this.crates) {
        if (Math.ceil(cr.y - 1e-6) !== r) continue;
        const k = ent ? ent.crates[cr.slot] : 1;
        if (k <= 0) continue;
        const x = this.geom.ox + cr.x * s;
        const y = this.geom.oy + cr.y * s;
        if (cr.marks > 0) drawPadMarks(g, x, y, s, cr.color, cr.marks);
        const look = k < 1 ? { ...cr.look, lift: (1 - k) * 120, alpha: Math.min(1, k * 3) } : cr.look;
        drawCrate(g, x, y, s, look);
      }
      if (this.showRobot && robotRow === r && (!ent || ent.robot > 0)) {
        const k = ent ? ent.robot : 1;
        const pose = k < 1 ? { ...this.robot.pose, z: (1 - k) * 140 } : this.robot.pose;
        drawRobot(g, this.geom.ox + (this.robot.x + 0.5) * s, this.geom.oy + (this.robot.y + ROBOT_FEET) * s, s, pose);
      }
      this.particles.drawRow(g, r);
    }
    this.drawOverlay(g);
    if (clip) g.restore();
    this.lastDrawMs = performance.now() - t0;
  }

  private drawOverlay(g: CanvasRenderingContext2D): void {
    const { s } = this;
    const { ox, oy } = this.geom;
    const demo = this.demoState;
    if (demo && demo.dim > 0) {
      g.save();
      g.fillStyle = `rgba(3, 5, 22, ${0.2 * demo.dim})`;
      g.fill(this.boardPath());
      g.restore();
    }
    for (const c of this.lit) {
      const p = this.cellXY(c.cell);
      drawLitCell(g, p.x, p.y, s, c.a);
    }
    for (const gh of this.ghosts) this.drawGhost(g, gh);
    if (demo && demo.alpha > 0.01) this.drawGhost(g, { x: demo.robot.x, y: demo.robot.y, pose: demo.robot.pose, alpha: demo.alpha, crates: [...demo.crates.values()], hideRobot: demo.hideRobot });
    for (const [slot, m] of this.quizMarks) {
      const c = this.crates[slot];
      if (c) drawQuizMark(g, ox + (c.x + 0.5) * s, oy + (c.y + 0.36 - CRATE_H / 2) * s, s, m.t, m.ok);
    }
    for (const f of this.frames) {
      const p = this.cellXY(f.cell);
      drawUnreachable(g, p.x, p.y, s, f.alpha);
    }
    for (const t of this.targets) {
      const p = this.cellXY(t.cell);
      drawTargetRing(g, p.x, p.y, s, t.t);
    }
    for (const r of this.lockRings) drawLockRing(g, r.x, r.y, s, r.t);
    for (const [slot, m] of this.marks) {
      const c = this.crates[slot];
      if (!c) continue;
      const x = ox + c.x * s;
      const y = oy + c.y * s;
      drawDeadFrame(g, x, y, s, Math.min(1, m.t * 2));
      drawDeadBadge(g, x + 0.5 * s, y + 0.28 * s, s, m.t);
    }
    if (this.hint) {
      const c = this.crates[this.hint.slot];
      if (c) drawHintRing(g, ox + (c.x + 0.5) * s, oy + (c.y + 0.4) * s, s, this.hint.pulse);
    }
    if (this.hint2) {
      const c = this.crates[this.hint2.slot];
      if (c) drawPushChevron(g, ox + (c.x + 0.5) * s, oy + (c.y + 0.42 - CRATE_H / 2) * s, s, this.hint2.dir, this.hint2.t);
    }
    if (this.route) {
      const r = this.route;
      const pts = r.cells.map((cell) => {
        const p = this.cellXY(cell);
        return { x: p.x + s / 2, y: p.y + 0.55 * s };
      });
      // the walk emerges from behind 小推 (never drawn across his face)
      const fx = this.geom.ox + (this.robot.x + 0.5) * s;
      const fy = this.geom.oy + (this.robot.y + ROBOT_FEET) * s;
      const mask = new Path2D();
      mask.rect(0, 0, this.geom.canvas.w, this.geom.canvas.h);
      mask.rect(fx - 0.42 * s, fy - 1.28 * s, 0.84 * s, 1.34 * s);
      g.save();
      g.clip(mask, 'evenodd');
      drawRoute(g, pts, s, r.reveal, r.alpha);
      g.restore();
      if (r.prints > 0) {
        const last = this.cellXY(r.cells[r.cells.length - 1]);
        drawFootprints(g, last.x, last.y, s, r.dir, r.prints, r.alpha);
      }
    }
    for (const fp of this.footprints) {
      const p = this.cellXY(fp.cell);
      if (fp === this.heldFootprint) {
        // 脚印光圈 (spec §2.3): a soft LED ring under the held stand-cell footprint
        const k = Math.max(0, Math.min(1, fp.t)) * fp.alpha;
        g.save();
        g.globalAlpha *= k;
        g.fillStyle = 'rgba(143, 247, 236, 0.16)';
        g.strokeStyle = 'rgba(143, 247, 236, 0.85)';
        g.lineWidth = Math.max(2, s * 0.045);
        g.setLineDash([s * 0.09, s * 0.06]);
        g.beginPath();
        g.arc(p.x + s / 2, p.y + s / 2, s * 0.4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
      }
      drawFootprints(g, p.x, p.y, s, fp.dir, fp.t, fp.alpha);
    }
    if (this.arrows) {
      const c = this.crates[this.arrows.slot];
      if (c) for (const d of this.arrows.dirs) drawArrow(g, ox + (c.x + 0.5) * s, oy + (c.y + 0.4 - CRATE_H / 2) * s, s, d, this.arrows.t, this.arrows.pressed === d);
    }
    this.overlayHook?.(g, this);
    for (const r of this.ripples) drawRipple(g, r.x, r.y, r.t);
  }

  /**
   * A ghost (rewind after-image, demonstrations): the robot (+ crate) drawn into a small off-screen
   * canvas, tinted LED cyan there (`source-atop` only touches the ghost's own pixels), then laid over
   * the board at the ghost's alpha. Tinting on the board canvas itself would wash the walls too.
   */
  private drawGhost(g: CanvasRenderingContext2D, gh: { x: number; y: number; crate?: { x: number; y: number; color: number }; crates?: { x: number; y: number; color: number }[]; pose: RobotPose; alpha: number; plain?: boolean; hideRobot?: boolean }): void {
    if (gh.alpha <= 0.01) return;
    const { s } = this;
    const { ox, oy } = this.geom;
    const crates = gh.crates ?? (gh.crate ? [gh.crate] : []);
    // union box (canvas px) of the robot drawing and the crates
    let x0 = ox + (gh.x + 0.5) * s - 0.66 * s;
    let y0 = oy + (gh.y + ROBOT_FEET) * s - 1.62 * s - (gh.pose.z / 100) * s;
    let x1 = x0 + 1.32 * s;
    let y1 = oy + (gh.y + ROBOT_FEET) * s + 0.14 * s;
    for (const c of crates) {
      x0 = Math.min(x0, ox + c.x * s - 4);
      y0 = Math.min(y0, oy + (c.y - 0.16) * s);
      x1 = Math.max(x1, ox + (c.x + 1) * s + 4);
      y1 = Math.max(y1, oy + (c.y + 1) * s + 4);
    }
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    const w = Math.ceil(x1 - x0);
    const h = Math.ceil(y1 - y0);
    const pw = Math.ceil(w * this.dpr);
    const ph = Math.ceil(h * this.dpr);
    if (!this.ghostCanvas || this.ghostCanvas.width < pw || this.ghostCanvas.height < ph) {
      releaseCanvas(this.ghostCanvas);
      this.ghostCanvas = takeCanvas(Math.max(pw, this.ghostCanvas?.width ?? 0), Math.max(ph, this.ghostCanvas?.height ?? 0));
    }
    const cv = this.ghostCanvas;
    const o = cv.getContext('2d')!;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    o.clearRect(0, 0, pw, ph);
    o.setTransform(this.dpr, 0, 0, this.dpr, -x0 * this.dpr, -y0 * this.dpr);
    // painter order inside the ghost: crates above the robot's row first
    const robotBelow = crates.filter((c) => c.y <= gh.y);
    const robotAbove = crates.filter((c) => c.y > gh.y);
    for (const c of robotBelow) drawCrate(o, ox + c.x * s, oy + c.y * s, s, { color: c.color, lock: 0 });
    if (!gh.hideRobot) drawRobot(o, ox + (gh.x + 0.5) * s, oy + (gh.y + ROBOT_FEET) * s, s, gh.pose);
    for (const c of robotAbove) drawCrate(o, ox + c.x * s, oy + c.y * s, s, { color: c.color, lock: 0 });
    o.setTransform(1, 0, 0, 1, 0, 0);
    if (!gh.plain) {
      o.globalCompositeOperation = 'source-atop';
      o.fillStyle = 'rgba(143, 247, 236, 0.62)';
      o.fillRect(0, 0, pw, ph);
      o.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.globalAlpha = gh.alpha;
    g.drawImage(cv, 0, 0, pw, ph, x0, y0, pw / this.dpr, ph / this.dpr);
    g.restore();
  }

  /** The warehouse's own outline (floor + wall cells, walls with their raised tops): the H3 dim. */
  private boardPath(): Path2D {
    if (this.dimPath) return this.dimPath;
    const { s } = this;
    const l = this.level;
    const p = new Path2D();
    for (let r = 0; r < l.H; r += 1) {
      for (let c = 0; c < l.W; c += 1) {
        const i = r * l.W + c;
        if (l.floor[i]) p.rect(this.geom.ox + c * s, this.geom.oy + r * s, s, s);
        else if (l.wall[i] && visibleWall(l, r, c)) p.rect(this.geom.ox + c * s, this.geom.oy + (r - WALL_H) * s, s, s + WALL_H * s);
      }
    }
    this.dimPath = p;
    return p;
  }

  // ------------------------------------------------------------------ idle (12 fps, robot box only)

  noteInput(): void {
    this.lastInput = performance.now();
    if (this.robot.pose.eyes === 'sleepy') {
      this.robot.pose.eyes = 'normal';
      this.requestFrame();
    }
    // the idle loop may have stopped (asleep, spec §8.5): input wakes it
    if (!this.idleTimer && !this.raf) this.startIdle();
  }

  private startIdle(): void {
    if (this.instant || this.hidden || this.destroyed || this.idleTimer) return;
    this.idleT0 = performance.now();
    this.nextBlink = this.idleT0 + 2500 + this.particles.rand() * 3000;
    const tick = () => {
      this.idleTimer = null;
      if (this.destroyed || this.hidden || this.raf) return;
      const now = performance.now();
      const p = this.robot.pose;
      const quiet = now - this.lastInput;
      const sleepy = quiet > 45000;
      // spec §8.5/§6.6: asleep after 45 s → a slow bob at 4 fps; after 3 min the frame rests and the timer stops
      const rest = quiet > IDLE_STOP_MS;
      const period = sleepy ? 4200 : 2400;
      const ph = ((now - this.idleT0) % period) / period;
      const before = this.robotBox();
      p.bob = rest || this.reduced ? 0 : 1.2 * Math.sin(ph * Math.PI * 2);
      p.antenna = rest || this.reduced ? 0 : 0.1 * Math.sin(ph * Math.PI * 2 - 0.9);
      if (sleepy) p.eyes = 'sleepy';
      else if (now >= this.nextBlink) {
        p.eyes = 'blink';
        this.blinkUntil = now + 120;
        this.nextBlink = now + 2500 + this.particles.rand() * 3000;
      } else if (now >= this.blinkUntil && p.eyes === 'blink') p.eyes = 'normal';
      // 20 s without input: glance left and right once
      const g = quiet - 20000;
      p.look = g > 0 && g < 1600 ? Math.sin((g / 1600) * Math.PI * 2) : 0;
      const box = this.robotBox();
      this.draw(unionBox(before, box));
      if (rest) return;
      this.idleTimer = setTimeout(tick, sleepy ? 250 : 83);
    };
    this.idleTimer = setTimeout(tick, 83);
  }

  private stopIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Robot box in canvas px (r−1 … r+1 rows are redrawn inside it by the painter). */
  private robotBox(): { x: number; y: number; w: number; h: number } {
    const { s } = this;
    const fx = this.geom.ox + (this.robot.x + 0.5) * s;
    const fy = this.geom.oy + (this.robot.y + ROBOT_FEET) * s;
    return { x: Math.floor(fx - 0.66 * s), y: Math.floor(fy - 1.62 * s), w: Math.ceil(1.32 * s), h: Math.ceil(1.75 * s) };
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) {
      this.anim.finishAll();
      this.particles.items = [];
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.stopIdle();
      this.draw();
    } else {
      this.lastInput = performance.now();
      this.requestFrame();
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.stopIdle();
    this.anim.clear();
    for (const cv of [...this.wallRows, ...this.floorRows]) releaseCanvas(cv);
    releaseCanvas(this.ghostCanvas);
    this.ghostCanvas = null;
    this.wallRows = [];
    this.floorRows = [];
    this.bg.width = this.bg.height = 0;
    this.fg.width = this.fg.height = 0;
    this.el.remove();
  }

  // ------------------------------------------------------------------ hit testing (spec §3.2)

  /** What did the finger hit? (x, y) page px. Arrows → robot → crates (lower rows first) → visible floor → wall/void; 6 px slop. */
  hitTest(px: number, py: number): Hit {
    const { s } = this;
    const l = this.level;
    const lx = px - this.geom.canvas.x - this.geom.ox;
    const ly = py - this.geom.canvas.y - this.geom.oy;
    const slop = 6;
    const inR = (x: number, y: number, x0: number, y0: number, w: number, h: number, e = 0) => x >= x0 - e && x <= x0 + w + e && y >= y0 - e && y <= y0 + h + e;
    type Cand = { hit: Hit; cx: number; cy: number; prio: number; exact: boolean };
    const cands: Cand[] = [];
    if (this.arrows) {
      const c = this.crates[this.arrows.slot];
      for (const d of this.arrows.dirs) {
        const ax = (c.x + 0.5) * s + [0, 0, -0.68, 0.68][d] * s;
        const ay = (c.y + 0.4 - CRATE_H / 2) * s + [-0.68, 0.68, 0, 0][d] * s;
        const half = Math.max(32, 0.5 * s);
        if (inR(lx, ly, ax - half, ay - half, half * 2, half * 2, slop)) cands.push({ hit: { kind: 'arrow', dir: d }, cx: ax, cy: ay, prio: 0, exact: inR(lx, ly, ax - half, ay - half, half * 2, half * 2) });
      }
    }
    const rx = (this.robot.x + 0.5) * s;
    const ry = (this.robot.y + ROBOT_FEET) * s;
    if (this.showRobot && inR(lx, ly, rx - 0.4 * s, ry - 1.15 * s, 0.8 * s, 1.15 * s, slop)) cands.push({ hit: { kind: 'robot' }, cx: rx, cy: ry - 0.55 * s, prio: 1, exact: inR(lx, ly, rx - 0.4 * s, ry - 1.15 * s, 0.8 * s, 1.15 * s) });
    const order = [...this.crates].sort((a, b) => b.y - a.y);
    for (const c of order) {
      const x0 = (c.x + 0.08) * s;
      const y0 = (c.y + 0.08 - CRATE_H) * s;
      if (inR(lx, ly, x0, y0, 0.84 * s, (0.84 + CRATE_H) * s, slop)) cands.push({ hit: { kind: 'crate', slot: c.slot }, cx: (c.x + 0.5) * s, cy: (c.y + 0.4) * s, prio: 2, exact: inR(lx, ly, x0, y0, 0.84 * s, (0.84 + CRATE_H) * s) });
    }
    const col = Math.floor(lx / s);
    const row = Math.floor(ly / s);
    const cellHit = (r: number, cc: number, exact: boolean) => {
      if (r < 0 || cc < 0 || r >= l.H || cc >= l.W) return;
      const i = r * l.W + cc;
      if (l.floor[i]) {
        // the raised wall top of the row below hides this cell's bottom strip
        const covered = r + 1 < l.H && l.wall[(r + 1) * l.W + cc] ? WALL_H * s : 0;
        if (inR(lx, ly, cc * s, r * s, s, s - covered, exact ? 0 : slop)) cands.push({ hit: { kind: 'floor', cell: i }, cx: (cc + 0.5) * s, cy: (r + 0.5) * s, prio: 3, exact });
      }
    };
    cellHit(row, col, true);
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) cellHit(row + dr, col + dc, false);
    const exact = cands.filter((c) => c.exact).sort((a, b) => a.prio - b.prio);
    if (exact.length) return exact[0].hit;
    if (cands.length) {
      cands.sort((a, b) => Math.hypot(a.cx - lx, a.cy - ly) - Math.hypot(b.cx - lx, b.cy - ly));
      return cands[0].hit;
    }
    if (row >= 0 && col >= 0 && row < l.H && col < l.W && l.wall[row * l.W + col]) return { kind: 'wall', cell: row * l.W + col };
    return { kind: 'void' };
  }

  // ------------------------------------------------------------------ choreography

  /**
   * Motion epoch: bumped whenever the board is snapped to a new logical state (place / rewind /
   * restartTo / finishNow). A move coroutine (step / push / bump / lockIn) captures it at its start
   * and, after every await, returns without touching positions, particles or sfx once it changed —
   * so an undo/restart pressed mid-push can never be overwritten by the cancelled push (QA r2).
   */
  private epoch = 0;
  /** Current motion epoch (PlayScreen uses it to drop events of a cancelled move). */
  get motionEpoch(): number {
    return this.epoch;
  }

  private tween(ms: number, fn: (v: number) => void, o: { ease?: (t: number) => number; delay?: number } = {}): Promise<void> {
    const p = this.anim.add(ms, (v) => {
      fn(v);
    }, o);
    this.requestFrame();
    return p;
  }

  /** Board entrance (≤ 1.1 s): floor rows pop in bottom-up, walls drop, pads light, crates drop, robot lands. */
  async enter(quick = false): Promise<void> {
    const l = this.level;
    if (this.instant) return;
    if (quick) {
      this.el.style.opacity = '0';
      this.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 * this.anim.scale, fill: 'forwards' });
      await new Promise((r) => setTimeout(r, 400 * this.anim.scale));
      this.el.style.opacity = '';
      return;
    }
    this.buildFloorRows();
    this.entering = { floor: new Array(l.H).fill(0), walls: new Array(l.H).fill(0), crates: this.crates.map(() => 0), robot: 0, fade: 0 };
    const ent = this.entering;
    // bg: shadow only during the entrance
    const b = this.bgx;
    const c = this.geom.canvas;
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    b.clearRect(0, 0, c.w, c.h);
    this.glowLayer.style.opacity = '0';
    const jobs: Promise<void>[] = [];
    for (let r = l.H - 1, k = 0; r >= 0; r -= 1, k += 1) jobs.push(this.tween(180, (v) => (ent.floor[r] = v), { ease: ease.outBack, delay: k * 25 }));
    const floorEnd = (l.H - 1) * 25 + 180;
    for (let r = 0; r < l.H; r += 1) jobs.push(this.tween(200, (v) => (ent.walls[r] = v), { ease: ease.outQuad, delay: floorEnd - 60 + r * 12 }));
    const wallEnd = floorEnd + 140 + l.H * 12;
    jobs.push(this.tween(240, (v) => (this.glowLayer.style.opacity = String(v)), { delay: wallEnd - 80 }));
    this.crates.forEach((cr, i) => jobs.push(this.tween(260, (v) => (ent.crates[cr.slot] = v), { ease: ease.outBack, delay: wallEnd + i * 70 })));
    const crateEnd = wallEnd + this.crates.length * 70 + 120;
    setTimeout(() => this.sfx('jump', { volume: 0.5 }), Math.max(0, (crateEnd + 140) * this.anim.scale));
    jobs.push(this.tween(300, (v) => (ent.robot = v), { ease: ease.outBack, delay: crateEnd }));
    await Promise.all(jobs);
    await this.squash(0.12);
    this.entering = null;
    // composite the floor back into the static layer
    b.clearRect(0, 0, c.w, c.h);
    drawShadow(this.tile(b));
    drawFloor(this.tile(b));
    for (const cv of this.floorRows) releaseCanvas(cv);
    this.floorRows = [];
    this.glowLayer.style.opacity = '';
    this.requestFrame();
  }

  /** Landing squash (also used after jumps). */
  private squash(k: number): Promise<void> {
    const p = this.robot.pose;
    return this.tween(220, (v) => {
      const w = Math.sin(v * Math.PI);
      p.sx = 1 + k * w * 0.9;
      p.sy = 1 - k * w;
    }, { ease: ease.linear });
  }

  /** Face a direction (60 ms squash → swap → spring back). */
  async turnTo(dir: number): Promise<void> {
    const p = this.robot.pose;
    if (p.facing === dir) return;
    await this.tween(60, (v) => (p.sx = 1 - 0.15 * v), { ease: ease.outQuad });
    p.facing = dir as Facing;
    await this.tween(120, (v) => (p.sx = 0.85 + 0.15 * v), { ease: ease.outBack });
    p.sx = 1;
  }

  private stepCount = 0;

  /** Walk one cell (dir) — `last` decelerates (outQuad). */
  async step(dir: number, last: boolean, total: number): Promise<void> {
    const p = this.robot.pose;
    const ep = this.epoch;
    await this.turnTo(dir);
    if (ep !== this.epoch) return;
    const x0 = this.robot.x;
    const y0 = this.robot.y;
    const dx = [0, 0, -1, 1][dir];
    const dy = [-1, 1, 0, 0][dir];
    this.stepCount += 1;
    const n = this.stepCount;
    if (total <= 8 || n % 2 === 0) this.sfx('step', { volume: 0.35, rate: n % 2 ? 1 : 1.06 });
    const side = dir >= 2;
    await this.tween(STEP_MS, (v) => {
      this.robot.x = x0 + dx * v;
      this.robot.y = y0 + dy * v;
      p.tread = n + v;
      p.bob = 1.5 * Math.sin(v * Math.PI);
      if (side) p.lean = 0.087 * Math.sin(Math.min(1, v * 2) * Math.PI * 0.5) * (last ? 1 - v : 1);
      else p.sy = 1 + 0.03 * Math.sin(v * Math.PI);
    }, { ease: last ? ease.outQuad : ease.linear });
    if (ep !== this.epoch) return;
    this.robot.x = x0 + dx;
    this.robot.y = y0 + dy;
    if (last) {
      p.lean = 0;
      p.sy = 1;
      p.bob = 0;
    }
    if (n % 2 === 0) {
      const { s } = this;
      this.particles.dust(this.geom.ox + (this.robot.x + 0.5 - dx * 0.3) * s, this.geom.oy + (this.robot.y + 0.86) * s, s, 3, Math.ceil(this.robot.y), { x: dx, y: dy });
    }
  }

  /** Walk a path of cells; `stop()` returning true ends the walk after the current cell. */
  async walk(cells: number[], stop: () => boolean = () => false): Promise<number> {
    const l = this.level;
    const ep = this.epoch;
    let done = 0;
    for (let i = 0; i < cells.length; i += 1) {
      if (ep !== this.epoch) break;
      const from = Math.round(this.robot.y) * l.W + Math.round(this.robot.x);
      let dir = -1;
      for (let d = 0; d < 4; d += 1) if (nb(l, from, d) === cells[i]) dir = d;
      if (dir < 0) {
        this.robot.x = cells[i] % l.W;
        this.robot.y = (cells[i] / l.W) | 0;
        continue;
      }
      await this.step(dir, i === cells.length - 1 || stop(), cells.length);
      done += 1;
      if (stop()) break;
    }
    return done;
  }

  flashTarget(cell: number): void {
    const t = { cell, t: 0 };
    this.targets.push(t);
    void this.tween(240, (v) => (t.t = v), { ease: ease.outQuad }).then(() => {
      this.targets = this.targets.filter((x) => x !== t);
    });
  }

  /**
   * Push: charge 40 ms (squash, arms out) → the crate starts 20 ms after the robot → 150 ms slide
   * together (inOutQuad) with an 8° lean and >< eyes → the crate lands with an outBack overshoot + dust.
   */
  async push(slot: number, dir: number, o: { lockIn: boolean; unlatch: boolean; locked: number; redo?: boolean }): Promise<void> {
    const p = this.robot.pose;
    const cr = this.crates[slot];
    const ep = this.epoch;
    await this.turnTo(dir);
    if (ep !== this.epoch) return;
    const dx = [0, 0, -1, 1][dir];
    const dy = [-1, 1, 0, 0][dir];
    const side = dir >= 2;
    const dur = o.redo ? PUSH_MS * 0.8 : PUSH_MS;
    if (!o.redo) {
      await this.tween(40, (v) => {
        p.sx = 1 - 0.06 * v;
        p.sy = 1 + 0.04 * v;
        p.arm = v;
        p.eyes = 'effort';
      }, { ease: ease.outQuad });
      if (ep !== this.epoch) return;
    } else p.arm = 1;
    const rate = 0.95 + (((slot * 7 + Math.round(cr.x) * 3 + Math.round(cr.y)) % 11) / 10) * 0.1;
    this.sfx('push-crate', { volume: 0.8, rate: o.redo ? 1.1 : rate });
    if (o.unlatch) {
      this.sfx('sok-unlatch', { volume: 0.5 });
      void this.tween(100, (v) => {
        cr.look.lock = 1 - v;
        cr.marks = 1 - v;
      });
    }
    const rx0 = this.robot.x;
    const ry0 = this.robot.y;
    const cx0 = cr.x;
    const cy0 = cr.y;
    if (o.redo && !this.reduced && !this.instant) {
      // redo plays forward with a faint same-colour trail (spec §6.6: 15 %)
      const trail = { x: rx0, y: ry0, pose: { ...p }, alpha: 0.15, plain: true, crate: { x: cx0, y: cy0, color: cr.color } };
      this.ghosts.push(trail);
      void this.tween(dur + 60, (v) => (trail.alpha = 0.15 * (1 - v))).then(() => {
        this.ghosts = this.ghosts.filter((x) => x !== trail);
      });
    }
    const robotMove = this.tween(dur, (v) => {
      this.robot.x = rx0 + dx * v;
      this.robot.y = ry0 + dy * v;
      p.tread = this.stepCount + v;
      if (side) p.lean = 0.14 * Math.sin(Math.min(1, v * 1.6) * Math.PI * 0.5);
      else p.sy = 1 + 0.03 * Math.sin(v * Math.PI);
      p.sx = 1;
    }, { ease: ease.inOutQuad });
    const crateMove = this.tween(dur + 40, (v) => {
      cr.x = cx0 + dx * v;
      cr.y = cy0 + dy * v;
    }, { ease: ease.outBackK(1.4), delay: 20 });
    await Promise.all([robotMove, crateMove]);
    if (ep !== this.epoch) return;
    this.stepCount += 1;
    cr.x = cx0 + dx;
    cr.y = cy0 + dy;
    this.robot.x = rx0 + dx;
    this.robot.y = ry0 + dy;
    const { s } = this;
    this.particles.dust(this.geom.ox + (cr.x + 0.5 + dx * 0.3) * s, this.geom.oy + (cr.y + 0.95) * s, s, 6, Math.ceil(cr.y) + (dy > 0 ? 0 : 0), { x: -dx, y: -dy });
    this.sfx('sok-land', { volume: 0.45 });
    this.syncGlows();
    // relax
    void this.tween(160, (v) => {
      p.lean *= 1 - v;
      p.arm = 1 - v;
      p.sy = 1 + (p.sy - 1) * (1 - v);
    }, { ease: ease.outQuad }).then(() => {
      if (p.eyes === 'effort') p.eyes = 'normal';
    });
    if (o.lockIn) await this.lockIn(slot, o.locked, ep);
  }

  /** Lock-in: +40 ms clasps (120 ms outBack), LED ring, ✓ chip; rising pentatonic pitch by count. */
  async lockIn(slot: number, locked: number, ep = this.epoch): Promise<void> {
    const cr = this.crates[slot];
    const { s } = this;
    await this.anim.wait(40);
    if (ep !== this.epoch) return;
    const semis = [0, 2, 4, 7, 9, 12, 14, 16];
    const st = semis[Math.max(0, Math.min(semis.length - 1, locked - 1))];
    const rate = Math.pow(2, st / 12);
    this.sfx('lock-in', { volume: 0.9, rate });
    this.sfx('sok-lockchime', { volume: 0.35, rate });
    const ring = { x: this.geom.ox + (cr.x + 0.5) * s, y: this.geom.oy + (cr.y + 0.5) * s, t: 0 };
    this.lockRings.push(ring);
    void this.tween(320, (v) => (ring.t = v), { ease: ease.outCubic }).then(() => {
      this.lockRings = this.lockRings.filter((r) => r !== ring);
    });
    await this.tween(120, (v) => {
      cr.look.lock = v;
      cr.marks = v;
    }, { ease: ease.outBack });
    if (ep !== this.epoch) return;
    cr.look.lock = 1;
    cr.marks = 1;
  }

  /** Bump: lunge 0.12 s (90 ms) and spring back (140 ms outBack); the crate shakes ±2° twice. */
  async bump(dir: number, slot = -1): Promise<void> {
    const p = this.robot.pose;
    const ep = this.epoch;
    await this.turnTo(dir);
    if (ep !== this.epoch) return;
    const dx = [0, 0, -1, 1][dir];
    const dy = [-1, 1, 0, 0][dir];
    const x0 = this.robot.x;
    const y0 = this.robot.y;
    this.sfx('bump', { volume: 0.6 });
    p.eyes = 'surprised';
    if (slot >= 0) void this.shakeCrate(slot);
    await this.tween(90, (v) => {
      this.robot.x = x0 + dx * 0.12 * v;
      this.robot.y = y0 + dy * 0.12 * v;
      p.arm = v * 0.6;
    }, { ease: ease.outQuad });
    if (ep !== this.epoch) return;
    await this.tween(140, (v) => {
      this.robot.x = x0 + dx * 0.12 * (1 - v);
      this.robot.y = y0 + dy * 0.12 * (1 - v);
      p.arm = 0.6 * (1 - v);
    }, { ease: ease.outBack });
    if (ep !== this.epoch) return;
    this.robot.x = x0;
    this.robot.y = y0;
    p.eyes = 'normal';
  }

  shakeCrate(slot: number): Promise<void> {
    const cr = this.crates[slot];
    if (this.reduced) return Promise.resolve();
    return this.tween(160, (v) => (cr.look.rot = 2 * Math.sin(v * Math.PI * 4) * (1 - v * 0.3)), { ease: ease.linear }).then(() => {
      cr.look.rot = 0;
    });
  }

  /** Express (eyes) for a while, then back to normal. */
  express(eyes: Expr, ms: number): void {
    const p = this.robot.pose;
    p.eyes = eyes;
    this.requestFrame();
    void this.anim.wait(ms).then(() => {
      if (p.eyes === eyes) {
        p.eyes = 'normal';
        this.requestFrame();
      }
    });
  }

  /** Look toward a page point (near-miss gesture). */
  glance(px: number, py: number): void {
    const c = this.robotCenterPage();
    const p = this.robot.pose;
    p.look = Math.max(-1, Math.min(1, (px - c.x) / 120));
    void py;
    this.requestFrame();
    void this.anim.wait(300).then(() => {
      p.look = 0;
      this.requestFrame();
    });
  }

  /** Happy hop when the robot itself is tapped. */
  async hop(): Promise<void> {
    const p = this.robot.pose;
    p.eyes = 'happy';
    await this.tween(200, (v) => (p.z = 18 * Math.sin(v * Math.PI)), { ease: ease.linear });
    p.z = 0;
    p.eyes = 'normal';
  }

  ripple(px: number, py: number): void {
    const r = { x: px - this.geom.canvas.x, y: py - this.geom.canvas.y, t: 0 };
    this.ripples.push(r);
    void this.tween(240, (v) => (r.t = v), { ease: ease.outQuad }).then(() => {
      this.ripples = this.ripples.filter((x) => x !== r);
    });
  }

  unreachable(cell: number): void {
    const f = { cell, alpha: 1 };
    this.frames.push(f);
    this.express('question', 600);
    void this.tween(300, (v) => (f.alpha = 1 - v), { ease: ease.inQuad, delay: 120 }).then(() => {
      this.frames = this.frames.filter((x) => x !== f);
    });
  }

  /** Stand-cell footprints (120 ms pop, staggered 40 ms; 1.2 s; 300 ms fade). */
  showFootprints(spots: { cell: number; dir: number }[]): void {
    this.footprints = this.heldFootprint ? [this.heldFootprint] : [];
    spots.forEach((sp, i) => {
      const fp = { cell: sp.cell, dir: sp.dir, t: 0, alpha: 1 };
      this.footprints.push(fp);
      void this.tween(160, (v) => (fp.t = v), { ease: ease.outBack, delay: i * 40 })
        .then(() => this.anim.wait(1200))
        .then(() => this.tween(300, (v) => (fp.alpha = 1 - v)))
        .then(() => {
          this.footprints = this.footprints.filter((x) => x !== fp);
        });
    });
  }

  /** A footprint that stays on a stand cell until `releaseFootprint()` (0-1 tutor, spec §2.3 脚印光圈). */
  holdFootprint(cell: number, dir: number): void {
    if (this.heldFootprint || this.destroyed) return;
    const fp = { cell, dir, t: 0, alpha: 0.9 };
    this.heldFootprint = fp;
    this.footprints.push(fp);
    void this.tween(200, (v) => (fp.t = v), { ease: ease.outBack });
  }

  releaseFootprint(): void {
    const fp = this.heldFootprint;
    if (!fp) return;
    this.heldFootprint = null;
    void this.tween(250, (v) => (fp.alpha = 0.9 * (1 - v))).then(() => {
      this.footprints = this.footprints.filter((x) => x !== fp);
    });
  }

  get footprintHeld(): boolean {
    return !!this.heldFootprint;
  }

  /**
   * Show the way (tutor, spec §2.3): a dashed route from the robot along `cells` (stand cell last)
   * draws itself (≈0.9 s), the stand footprints pop facing `dir`, it stays 1.4 s and fades.
   */
  async showRoute(cells: number[], dir: number, hold = 1400): Promise<void> {
    const start = Math.round(this.robot.y) * this.level.W + Math.round(this.robot.x);
    const r = { cells: [start, ...cells], reveal: 0, alpha: 1, dir, prints: 0 };
    this.route = r;
    await this.tween(Math.min(1400, 160 + cells.length * 90), (v) => (r.reveal = v), { ease: ease.inOutQuad });
    await this.tween(200, (v) => (r.prints = v), { ease: ease.outBack });
    await this.anim.wait(hold);
    if (this.route !== r) return;
    await this.tween(300, (v) => (r.alpha = 1 - v));
    if (this.route === r) this.route = null;
    this.requestFrame();
  }

  hideRoute(): void {
    if (!this.route) return;
    this.route = null;
    this.requestFrame();
  }

  showArrows(slot: number, dirs: number[]): void {
    const a = { slot, dirs, t: 0, pressed: -1 };
    this.arrows = a;
    void this.tween(160, (v) => (a.t = v), { ease: ease.outBack });
  }

  hideArrows(): void {
    const a = this.arrows;
    if (!a) return;
    void this.tween(100, (v) => (a.t = 1 - v), { ease: ease.inQuad }).then(() => {
      if (this.arrows === a) this.arrows = null;
      this.requestFrame();
    });
  }

  /** ✕ badges pop (180 ms outBack); the robot turns to the crate and scratches its head (600 ms). */
  async showDead(slots: number[]): Promise<void> {
    for (const slot of slots) {
      const m = { t: 0 };
      this.marks.set(slot, m);
      void this.tween(180, (v) => (m.t = v), { ease: ease.linear });
      const cr = this.crates[slot];
      cr.look.dead = true;
    }
    const first = this.crates[slots[0]];
    if (!first) return;
    const ddx = first.x - this.robot.x;
    const ddy = first.y - this.robot.y;
    const dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? 2 : 3) : ddy < 0 ? 0 : 1;
    await this.turnTo(dir);
    const p = this.robot.pose;
    p.eyes = 'think';
    await this.tween(600, (v) => (p.scratch = v < 1 ? Math.max(0.0001, v) : 0), { ease: ease.linear });
    p.scratch = 0;
    p.eyes = 'normal';
  }

  clearDead(keep: Set<number> = new Set()): void {
    for (const slot of [...this.marks.keys()]) {
      if (keep.has(slot)) continue;
      this.marks.delete(slot);
      const cr = this.crates[slot];
      if (cr) cr.look.dead = false;
    }
    this.requestFrame();
  }

  /** Set every object to a snapshot without animation. */
  place(player: number, crates: ArrayLike<number>, facing?: number): void {
    this.epoch += 1;
    this.placeRaw(player, crates, facing);
  }

  private placeRaw(player: number, crates: ArrayLike<number>, facing?: number): void {
    const W = this.level.W;
    // settle any pose a cancelled move left half-way (wind-up squash, lean, raised arms)
    const p = this.robot.pose;
    p.lean = 0;
    p.sx = 1;
    p.sy = 1;
    p.bob = 0;
    p.arm = 0;
    if (p.eyes === 'effort') p.eyes = 'normal';
    for (const c of this.crates) c.look.rot = 0;
    this.robot.x = player % W;
    this.robot.y = (player / W) | 0;
    if (facing !== undefined) this.robot.pose.facing = facing as Facing;
    for (let i = 0; i < crates.length; i += 1) {
      this.crates[i].x = crates[i] % W;
      this.crates[i].y = (crates[i] / W) | 0;
    }
    this.syncLocks(true);
    this.requestFrame();
  }

  /**
   * Undo = rewind: everything slides back (120 ms outCubic) with two cyan after-images, the robot
   * ends where it stood for that push, facing the crate.
   */
  async rewind(toPlayer: number, toCrates: ArrayLike<number>, facing: number, rate: number): Promise<void> {
    const W = this.level.W;
    const ep = ++this.epoch;
    this.sfx('sok-rewind', { volume: 0.5, rate });
    const moves = this.crates.map((c, i) => ({ c, x0: c.x, y0: c.y, x1: toCrates[i] % W, y1: (toCrates[i] / W) | 0 })).filter((m) => m.x0 !== m.x1 || m.y0 !== m.y1);
    const rx0 = this.robot.x;
    const ry0 = this.robot.y;
    const rx1 = toPlayer % W;
    const ry1 = (toPlayer / W) | 0;
    if (!this.reduced && !this.instant) {
      for (let k = 0; k < 2; k += 1) {
        const gh = { x: rx0, y: ry0, pose: { ...this.robot.pose }, alpha: 0.3, crate: moves[0] ? { x: moves[0].x0, y: moves[0].y0, color: moves[0].c.color } : undefined };
        setTimeout(() => {
          this.ghosts.push(gh);
          void this.tween(160, (v) => (gh.alpha = 0.3 * (1 - v))).then(() => {
            this.ghosts = this.ghosts.filter((x) => x !== gh);
          });
        }, k * 40);
      }
    }
    this.robot.pose.facing = facing as Facing;
    this.robot.pose.eyes = 'normal';
    this.robot.pose.arm = 0;
    await this.tween(120, (v) => {
      this.robot.x = rx0 + (rx1 - rx0) * v;
      this.robot.y = ry0 + (ry1 - ry0) * v;
      for (const m of moves) {
        m.c.x = m.x0 + (m.x1 - m.x0) * v;
        m.c.y = m.y0 + (m.y1 - m.y0) * v;
      }
    }, { ease: ease.outCubic });
    if (ep !== this.epoch) return;
    this.placeRaw(toPlayer, toCrates);
  }

  /** Restart: objects fade 150 ms → the start pops in 0.9 → 1 (200 ms). */
  async restartTo(player: number, crates: ArrayLike<number>): Promise<void> {
    this.sfx('ui-slide', { volume: 0.6 });
    const p = this.robot.pose;
    const ep = ++this.epoch;
    const settle = () => {
      p.alpha = undefined;
      p.sx = p.sy = 1;
      for (const c of this.crates) {
        c.look.alpha = undefined;
        c.look.sx = c.look.sy = 1;
      }
      this.requestFrame();
    };
    await this.tween(150, (v) => {
      p.alpha = 1 - v;
      for (const c of this.crates) c.look.alpha = 1 - v;
    }, { ease: ease.inQuad });
    if (ep !== this.epoch) return settle();
    this.placeRaw(player, crates, 1);
    await this.tween(200, (v) => {
      p.alpha = v;
      p.sx = p.sy = 0.9 + 0.1 * v;
      for (const c of this.crates) {
        c.look.alpha = v;
        c.look.sx = c.look.sy = 0.9 + 0.1 * v;
      }
    }, { ease: ease.outBack });
    settle();
  }

  /** Two happy jumps (260 ms each: stretch 0.9×1.12, 0.25 s air, land 1.1×0.9), arms up, ^^ eyes. */
  async celebrate(): Promise<void> {
    const p = this.robot.pose;
    p.eyes = 'happy';
    p.facing = 1;
    for (let k = 0; k < 2; k += 1) {
      this.sfx('jump', { volume: 0.5 });
      await this.tween(260, (v) => {
        p.z = 25 * Math.sin(v * Math.PI);
        p.cheer = Math.min(1, v * 3);
        const w = v < 0.2 ? v / 0.2 : v > 0.85 ? (1 - v) / 0.15 : 0;
        p.sx = v < 0.2 ? 1 - 0.1 * w : v > 0.85 ? 1 + 0.1 * (1 - w) : 1;
        p.sy = v < 0.2 ? 1 + 0.12 * w : v > 0.85 ? 1 - 0.1 * (1 - w) : 1;
      }, { ease: ease.linear });
    }
    p.z = 0;
    p.sx = p.sy = 1;
    await this.tween(200, (v) => (p.cheer = 1 - v));
    p.cheer = 0;
  }

  /** Completion: pads flash in order (90 ms stagger, pentatonic chimes) → the lift sinks the cargo. */
  async finale(): Promise<void> {
    const order = [...this.crates].sort((a, b) => a.y - b.y || a.x - b.x);
    const { s } = this;
    order.forEach((cr, i) => {
      setTimeout(() => {
        this.sfx('chime', { volume: 0.6, rate: Math.pow(2, [0, 2, 4, 7, 9, 12, 14][Math.min(6, i)] / 12) });
        const ring = { x: this.geom.ox + (cr.x + 0.5) * s, y: this.geom.oy + (cr.y + 0.5) * s, t: 0 };
        this.lockRings.push(ring);
        void this.tween(360, (v) => (ring.t = v), { ease: ease.outCubic }).then(() => {
          this.lockRings = this.lockRings.filter((r) => r !== ring);
        });
      }, (250 + i * 90) * this.anim.scale);
    });
    void this.celebrate();
    await this.anim.wait(700);
    await this.tween(300, (v) => {
      for (const c of this.crates) c.look.sink = v;
    }, { ease: ease.inQuad });
  }

  /**
   * The 自动绕行 upgrade flourish (spec §6.6, ≈1.6 s): 小推 turns to the camera, the visor shows the
   * route pictogram inside a spinning LED ring, a little hop, then back to happy eyes.
   */
  async upgradeFlourish(): Promise<void> {
    const p = this.robot.pose;
    await this.turnTo(1);
    p.visor = 'route';
    p.halo = 0;
    p.haloSpin = 0;
    const spin = this.tween(1500, (v) => (p.haloSpin = v * Math.PI * 2.5), { ease: ease.linear });
    await this.tween(260, (v) => (p.halo = v), { ease: ease.outQuad });
    await this.tween(240, (v) => (p.z = 16 * Math.sin(v * Math.PI)), { ease: ease.linear });
    p.z = 0;
    await this.squash(0.08);
    await this.anim.wait(420);
    await this.tween(300, (v) => (p.halo = 1 - v), { ease: ease.inQuad });
    await spin;
    p.halo = 0;
    p.visor = undefined;
    p.eyes = 'happy';
    this.requestFrame();
  }

  /** Centre of the selection arrow `dir` around crate `slot` (page px) — where a finger would tap it. */
  arrowCenterPage(slot: number, dir: number): { x: number; y: number } {
    const c = this.crates[slot];
    const { s } = this;
    return {
      x: this.geom.canvas.x + this.geom.ox + (c.x + 0.5) * s + [0, 0, -0.68, 0.68][dir] * s,
      y: this.geom.canvas.y + this.geom.oy + (c.y + 0.4 - CRATE_H / 2) * s + [-0.68, 0.68, 0, 0][dir] * s,
    };
  }

  /**
   * Demonstration only (the real state never changes): a cyan ghost 小推 walks `path` (cells) and
   * pushes a ghost of crate `slot` one cell toward `dir`, then fades. Used by the upgrade demo.
   */
  async ghostWalkPush(path: number[], slot: number, dir: number): Promise<void> {
    const W = this.level.W;
    const cr = this.crates[slot];
    const gh = { x: this.robot.x, y: this.robot.y, pose: { ...restPose(this.robot.pose.facing), eyes: 'happy' as Expr }, alpha: 0, crate: undefined as { x: number; y: number; color: number } | undefined };
    this.ghosts.push(gh);
    await this.tween(160, (v) => (gh.alpha = 0.85 * v));
    let x = gh.x;
    let y = gh.y;
    for (const cell of path) {
      const nx = cell % W;
      const ny = (cell / W) | 0;
      const d = nx > x ? 3 : nx < x ? 2 : ny > y ? 1 : 0;
      gh.pose.facing = d as Facing;
      const x0 = x;
      const y0 = y;
      await this.tween(STEP_MS * 1.2, (v) => {
        gh.x = x0 + (nx - x0) * v;
        gh.y = y0 + (ny - y0) * v;
        gh.pose.tread = v;
        gh.pose.bob = 1.5 * Math.sin(v * Math.PI);
      }, { ease: ease.linear });
      x = nx;
      y = ny;
    }
    const dx = [0, 0, -1, 1][dir];
    const dy = [-1, 1, 0, 0][dir];
    gh.pose.facing = dir as Facing;
    gh.pose.arm = 1;
    gh.pose.eyes = 'effort';
    gh.crate = { x: cr.x, y: cr.y, color: cr.color };
    const c0 = { x: cr.x, y: cr.y };
    await this.tween(PUSH_MS * 1.4, (v) => {
      gh.x = x + dx * v;
      gh.y = y + dy * v;
      gh.crate!.x = c0.x + dx * v;
      gh.crate!.y = c0.y + dy * v;
    }, { ease: ease.inOutQuad });
    this.sfx('push-crate', { volume: 0.4, rate: 1.15 });
    await this.anim.wait(200);
    await this.tween(220, (v) => (gh.alpha = 0.85 * (1 - v)));
    this.ghosts = this.ghosts.filter((g) => g !== gh);
    this.requestFrame();
  }

  // ------------------------------------------------------------------ hints (spec §5.1)

  /** H1: a night-blue ring with a paper edge around the crate, pulsing 3 × 400 ms, then steady until cleared. */
  async showHintRing(slot: number): Promise<void> {
    const h = { slot, pulse: 0 };
    this.hint = h;
    await this.tween(1200, (v) => {
      if (this.hint === h) h.pulse = Math.sin(v * Math.PI * 3) ** 2;
    }, { ease: ease.linear });
    if (this.hint === h) h.pulse = 0;
    this.requestFrame();
  }

  /** H2: the push chevron on the crate + tread prints on the stand cell + the dotted route there (until cleared, ≤ 8 s). */
  showHint2(slot: number, dir: number, route: number[] | null, standDir: number): void {
    const h = { slot, dir, t: 0 };
    this.hint2 = h;
    void this.tween(250, (v) => (h.t = v), { ease: ease.outBack });
    if (route && route.length) void this.showRoute(route, standDir, 8000);
    else {
      // already standing there: the prints alone
      const cell = Math.round(this.robot.y) * this.level.W + Math.round(this.robot.x);
      this.route = { cells: [cell], reveal: 1, alpha: 1, dir: standDir, prints: 1 };
    }
    void this.anim.wait(8000).then(() => {
      if (this.hint2 === h) this.clearHints();
    });
  }

  /** Remove every hint signal (a push, a new hint, the level ending). */
  clearHints(): void {
    this.hint = null;
    this.hint2 = null;
    this.route = null;
    this.requestFrame();
  }

  get demoRunning(): boolean {
    return !!this.demoState;
  }

  /**
   * H3 (spec §5.1): a cyan ghost 小推 walks (180 ms/cell) and pushes (250 ms) the next pushes over a
   * board dimmed 20 %, pauses 600 ms, then rewinds and fades (300 ms). The real state never changes;
   * `abortDemo()` (a tap) fades it out at once. Resolves true when it played to the end.
   */
  async ghostDemo(steps: { walk: number[]; slot: number; dir: number }[]): Promise<boolean> {
    const W = this.level.W;
    this.demoAborted = false;
    const pose: RobotPose = { ...restPose(this.robot.pose.facing), eyes: 'happy' };
    const d = { robot: { x: this.robot.x, y: this.robot.y, pose }, crates: new Map<number, { x: number; y: number; color: number }>(), alpha: 0, dim: 0 };
    this.demoState = d;
    const startRobot = { x: d.robot.x, y: d.robot.y };
    const startCrates = new Map<number, { x: number; y: number }>();
    await this.tween(200, (v) => {
      if (!this.demoAborted) {
        d.alpha = 0.85 * v;
        d.dim = v;
      }
    });
    outer: for (const st of steps) {
      for (const cell of st.walk) {
        if (this.demoAborted) break outer;
        const nx = cell % W;
        const ny = (cell / W) | 0;
        const x0 = d.robot.x;
        const y0 = d.robot.y;
        pose.facing = (nx > x0 ? 3 : nx < x0 ? 2 : ny > y0 ? 1 : 0) as Facing;
        await this.tween(180, (v) => {
          d.robot.x = x0 + (nx - x0) * v;
          d.robot.y = y0 + (ny - y0) * v;
          pose.tread = v;
          pose.bob = 1.5 * Math.sin(v * Math.PI);
        }, { ease: ease.linear });
      }
      if (this.demoAborted) break;
      const real = this.crates[st.slot];
      const cr = d.crates.get(st.slot) ?? { x: real.x, y: real.y, color: real.color };
      if (!startCrates.has(st.slot)) startCrates.set(st.slot, { x: cr.x, y: cr.y });
      d.crates.set(st.slot, cr);
      const dx = [0, 0, -1, 1][st.dir];
      const dy = [-1, 1, 0, 0][st.dir];
      pose.facing = st.dir as Facing;
      pose.arm = 1;
      pose.eyes = 'effort';
      const rx = d.robot.x;
      const ry = d.robot.y;
      const cx = cr.x;
      const cy = cr.y;
      this.sfx('push-crate', { volume: 0.4, rate: 1.15 });
      await this.tween(250, (v) => {
        d.robot.x = rx + dx * v;
        d.robot.y = ry + dy * v;
        cr.x = cx + dx * v;
        cr.y = cy + dy * v;
      }, { ease: ease.inOutQuad });
      pose.arm = 0;
      pose.eyes = 'happy';
    }
    if (!this.demoAborted) {
      await this.anim.wait(600);
      // rewind to where it started while fading (300 ms)
      const from = { x: d.robot.x, y: d.robot.y };
      const cfrom = new Map([...d.crates].map(([k, c]) => [k, { x: c.x, y: c.y }]));
      await this.tween(300, (v) => {
        if (this.demoAborted) return;
        d.robot.x = from.x + (startRobot.x - from.x) * v;
        d.robot.y = from.y + (startRobot.y - from.y) * v;
        for (const [k, c] of d.crates) {
          const a = cfrom.get(k)!;
          const b = startCrates.get(k)!;
          c.x = a.x + (b.x - a.x) * v;
          c.y = a.y + (b.y - a.y) * v;
        }
        d.alpha = 0.85 * (1 - v);
        d.dim = 1 - v;
      }, { ease: ease.inOutQuad });
    }
    const ok = !this.demoAborted;
    if (!ok) await this.anim.wait(210); // the abort fade (abortDemo) ends first
    if (this.demoState === d) this.demoState = null;
    this.requestFrame();
    return ok;
  }

  /** A tap during the demo: fade it out at once (200 ms); the real board never changed. */
  abortDemo(): void {
    const d = this.demoState;
    if (!d || this.demoAborted) return;
    this.demoAborted = true;
    const a0 = d.alpha;
    const m0 = d.dim;
    void this.tween(200, (v) => {
      d.alpha = a0 * (1 - v);
      d.dim = m0 * (1 - v);
    }).then(() => {
      if (this.demoState === d) this.demoState = null;
      this.requestFrame();
    });
  }

  // ------------------------------------------------------------------ 侦探题 demonstrations (spec §3.7)

  /** Toggle the magnifier mark on a crate (120 ms pop). */
  setQuizMark(slot: number, on: boolean, ok = false): void {
    if (!on) {
      this.quizMarks.delete(slot);
      this.requestFrame();
      return;
    }
    const m = { t: 0, ok };
    this.quizMarks.set(slot, m);
    void this.tween(180, (v) => (m.t = v), { ease: ease.linear });
  }

  private ghostStart(at: { x: number; y: number }, hideRobot = false): { robot: { x: number; y: number; pose: RobotPose }; crates: Map<number, { x: number; y: number; color: number }>; alpha: number; dim: number; hideRobot?: boolean } {
    const d = { robot: { x: at.x, y: at.y, pose: { ...restPose(1), eyes: 'happy' as Expr } }, crates: new Map<number, { x: number; y: number; color: number }>(), alpha: 0.85, dim: 0, hideRobot };
    this.demoState = d;
    return d;
  }

  private ghostEnd(): void {
    this.demoState = null;
    this.requestFrame();
  }

  /**
   * "推不动": a ghost 小推 stands on each side it can reach and tries to push (a lunge and a bump,
   * `bump` 0.4) — every try fails. `tries` = stand cell + push direction.
   */
  async ghostTries(tries: { stand: number; dir: number }[]): Promise<void> {
    const W = this.level.W;
    if (!tries.length) return;
    const per = Math.max(260, Math.min(480, 1900 / tries.length));
    const d = this.ghostStart({ x: tries[0].stand % W, y: (tries[0].stand / W) | 0 });
    for (const t of tries) {
      d.robot.x = t.stand % W;
      d.robot.y = (t.stand / W) | 0;
      d.robot.pose.facing = t.dir as Facing;
      d.robot.pose.arm = 0.6;
      d.robot.pose.eyes = 'effort';
      const x0 = d.robot.x;
      const y0 = d.robot.y;
      const dx = [0, 0, -1, 1][t.dir];
      const dy = [-1, 1, 0, 0][t.dir];
      await this.tween(per * 0.45, (v) => {
        d.robot.x = x0 + dx * 0.16 * v;
        d.robot.y = y0 + dy * 0.16 * v;
      }, { ease: ease.outQuad });
      this.sfx('bump', { volume: 0.4 });
      d.robot.pose.eyes = 'surprised';
      await this.tween(per * 0.55, (v) => {
        d.robot.x = x0 + dx * 0.16 * (1 - v);
        d.robot.y = y0 + dy * 0.16 * (1 - v);
      }, { ease: ease.outBack });
    }
    await this.tween(200, (v) => (d.alpha = 0.85 * (1 - v)));
    this.ghostEnd();
  }

  /** "沿墙滑": a ghost copy of the crate slides along `path` (cells light up), then fades. */
  async ghostSlide(slot: number, path: number[]): Promise<void> {
    const W = this.level.W;
    const real = this.crates[slot];
    const d = this.ghostStart({ x: real.x, y: real.y }, true);
    const cr = { x: real.x, y: real.y, color: real.color };
    d.crates.set(slot, cr);
    const per = Math.max(140, Math.min(300, 1700 / Math.max(1, path.length)));
    for (const cell of path) {
      const x0 = cr.x;
      const y0 = cr.y;
      const x1 = cell % W;
      const y1 = (cell / W) | 0;
      await this.tween(per, (v) => {
        cr.x = x0 + (x1 - x0) * v;
        cr.y = y0 + (y1 - y0) * v;
      }, { ease: ease.inOutQuad });
      const l = { cell, a: 1 };
      this.lit.push(l);
    }
    await this.anim.wait(250);
    await this.tween(260, (v) => {
      d.alpha = 0.85 * (1 - v);
      for (const l of this.lit) l.a = 1 - v;
    });
    this.lit = [];
    this.ghostEnd();
  }

  /** "还能推到台上": a ghost 小推 plays a LURD line from `from` (compressed to ≤ `totalMs`); only ghosts move. */
  async ghostLine(lurd: string, from: number, totalMs = 2000): Promise<void> {
    const W = this.level.W;
    const l = this.level;
    const d = this.ghostStart({ x: from % W, y: (from / W) | 0 });
    const per = Math.max(90, Math.min(250, totalMs / Math.max(1, lurd.length)));
    let player = from;
    const at = (cell: number) => {
      for (const [k, c] of d.crates) if (Math.round(c.y) * W + Math.round(c.x) === cell) return k;
      for (const c of this.crates) if (!d.crates.has(c.slot) && Math.round(c.y) * W + Math.round(c.x) === cell) return c.slot;
      return -1;
    };
    for (const ch of lurd) {
      const k = 'udlr'.indexOf(ch.toLowerCase());
      const to = nb(l, player, k);
      if (to < 0) break;
      const dx = [0, 0, -1, 1][k];
      const dy = [-1, 1, 0, 0][k];
      d.robot.pose.facing = k as Facing;
      const push = ch !== ch.toLowerCase();
      let cr: { x: number; y: number; color: number } | null = null;
      if (push) {
        const slot = at(to);
        if (slot >= 0) {
          const real = this.crates[slot];
          cr = d.crates.get(slot) ?? { x: real.x, y: real.y, color: real.color };
          d.crates.set(slot, cr);
        }
        d.robot.pose.arm = 1;
        d.robot.pose.eyes = 'effort';
        this.sfx('push-crate', { volume: 0.35, rate: 1.2 });
      } else {
        d.robot.pose.arm = 0;
        d.robot.pose.eyes = 'happy';
      }
      const rx = d.robot.x;
      const ry = d.robot.y;
      const cx = cr?.x ?? 0;
      const cy = cr?.y ?? 0;
      await this.tween(per, (v) => {
        d.robot.x = rx + dx * v;
        d.robot.y = ry + dy * v;
        d.robot.pose.tread = v;
        if (cr) {
          cr.x = cx + dx * v;
          cr.y = cy + dy * v;
        }
      }, { ease: push ? ease.inOutQuad : ease.linear });
      player = to;
    }
    d.robot.pose.eyes = 'happy';
    await this.anim.wait(450);
    await this.tween(260, (v) => (d.alpha = 0.85 * (1 - v)));
    this.ghostEnd();
  }

  /** Flip the board in (a quiz board appearing: 300 ms, a card turning over). */
  async flipIn(): Promise<void> {
    if (this.instant) return;
    this.el.animate([{ transform: 'perspective(900px) rotateY(80deg)', opacity: 0 }, { transform: 'perspective(900px) rotateY(0)', opacity: 1 }], { duration: 300 * this.anim.scale, easing: 'cubic-bezier(.2,.8,.3,1)' });
    await new Promise((r) => setTimeout(r, 300 * this.anim.scale));
  }

  /** Draw-cost probe (dev/test, spec §8.6): `frames` full fg redraws and one static-layer rebuild. */
  bench(frames: number): { frameAvg: number; frameMax: number; staticMs: number; cells: number } {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < frames; i += 1) {
      this.robot.pose.bob = Math.sin(i / 3);
      this.draw();
      sum += this.lastDrawMs;
      max = Math.max(max, this.lastDrawMs);
    }
    this.robot.pose.bob = 0;
    const t0 = performance.now();
    this.buildStatic();
    const staticMs = performance.now() - t0;
    this.draw();
    return { frameAvg: +(sum / frames).toFixed(3), frameMax: +max.toFixed(3), staticMs: +staticMs.toFixed(2), cells: this.level.W * this.level.H };
  }

  /** Pause/resume and rotation helpers. */
  finishNow(): void {
    this.epoch += 1;
    this.anim.finishAll();
    this.particles.items = [];
    this.requestFrame();
  }
}

function unionBox(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
