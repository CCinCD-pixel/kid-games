/**
 * Pointer Events helpers for small fingers on an iPad.
 *
 *  - Primary pointer only: a resting palm or a second finger never moves a piece.
 *  - Tap vs drag: movement under `threshold` px (default 10) is a tap.
 *  - Drag with snapping: `snap` maps a drop point to a target (or null = return home).
 *  - Hit slop: grow small targets without changing layout (`hitSlop(el, 12)`), and geometry
 *    helpers for canvas games (`expandRect`, `pointInRect`, `nearest`).
 * Mark draggable areas with CSS `touch-action: none` (done for you by makeDraggable).
 *
 *   onTap(button, () => fire());
 *   makeDraggable(tile, {
 *     snap: (p) => nearest(p, slots, 60),
 *     onDrop: (slot) => slot ? place(tile, slot) : bounceBack(tile),
 *   });
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Unsubscribe = () => void;

export const TAP_SLOP_PX = 10;
export const TAP_MAX_MS = 600;

// ---------------------------------------------------------------- pure helpers (unit-tested)

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 'tap' if the pointer stayed within `slop` px and was short enough, otherwise 'drag' (or 'none' for a long still press). */
export function classifyGesture(dx: number, dy: number, durationMs: number, slop = TAP_SLOP_PX, maxTapMs = TAP_MAX_MS): 'tap' | 'drag' | 'none' {
  if (Math.hypot(dx, dy) > slop) return 'drag';
  return durationMs <= maxTapMs ? 'tap' : 'none';
}

/** Dominant swipe direction, or null if shorter than minDistance. */
export function swipeDirection(dx: number, dy: number, minDistance = 30): 'up' | 'down' | 'left' | 'right' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minDistance) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function expandRect(r: Rect, slop: number): Rect {
  return { left: r.left - slop, top: r.top - slop, right: r.right + slop, bottom: r.bottom + slop };
}

export function pointInRect(p: Point, r: Rect, slop = 0): boolean {
  const e = slop ? expandRect(r, slop) : r;
  return p.x >= e.left && p.x <= e.right && p.y >= e.top && p.y <= e.bottom;
}

/** Snap a point to the centre of a grid cell. */
export function snapToGrid(p: Point, cell: number, origin: Point = { x: 0, y: 0 }): Point & { col: number; row: number } {
  // `|| 0` turns Math.round's -0 into a plain 0 (Object.is, deep equality and 1/x see -0)
  const col = Math.round((p.x - origin.x - cell / 2) / cell) || 0;
  const row = Math.round((p.y - origin.y - cell / 2) / cell) || 0;
  return { col, row, x: origin.x + col * cell + cell / 2, y: origin.y + row * cell + cell / 2 };
}

/** The closest target within `radius` (centre distance), or null. Targets need x/y. */
export function nearest<T extends Point>(p: Point, targets: readonly T[], radius = Infinity): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const t of targets) {
    const d = distance(p, t);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** Centre of an element's bounding box in viewport coordinates. */
export function centerOf(el: Element): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---------------------------------------------------------------- primary pointer gate

/**
 * Tracks the single active primary pointer for an element. A second simultaneous pointer is
 * ignored until the first lifts (palm rejection).
 */
export class PrimaryPointer {
  private id: number | null = null;
  accept(e: PointerEvent): boolean {
    if (e.type === 'pointerdown') {
      if (this.id !== null || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return false;
      this.id = e.pointerId;
      return true;
    }
    return e.pointerId === this.id;
  }
  release(e: PointerEvent): void {
    if (e.pointerId === this.id) this.id = null;
  }
  get active(): boolean {
    return this.id !== null;
  }
  reset(): void {
    this.id = null;
  }
}

// ---------------------------------------------------------------- tap

export interface TapOptions {
  slop?: number;
  maxMs?: number;
}

/** Reliable tap on touch (no 300 ms delay, ignores drags and second fingers). */
export function onTap(el: HTMLElement, handler: (e: PointerEvent) => void, opts: TapOptions = {}): Unsubscribe {
  const gate = new PrimaryPointer();
  let start: { x: number; y: number; t: number } | null = null;
  const down = (e: PointerEvent) => {
    if (!gate.accept(e)) return;
    start = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const up = (e: PointerEvent) => {
    if (!gate.accept(e) || !start) return;
    gate.release(e);
    const kind = classifyGesture(e.clientX - start.x, e.clientY - start.y, e.timeStamp - start.t, opts.slop, opts.maxMs);
    start = null;
    if (kind === 'tap') handler(e);
  };
  const cancel = (e: PointerEvent) => {
    gate.release(e);
    start = null;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}

// ---------------------------------------------------------------- swipe

export function onSwipe(el: HTMLElement, handler: (dir: 'up' | 'down' | 'left' | 'right') => void, minDistance = 30): Unsubscribe {
  const gate = new PrimaryPointer();
  let start: Point | null = null;
  const down = (e: PointerEvent) => {
    if (gate.accept(e)) start = { x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    if (!gate.accept(e) || !start) return;
    gate.release(e);
    const dir = swipeDirection(e.clientX - start.x, e.clientY - start.y, minDistance);
    start = null;
    if (dir) handler(dir);
  };
  const cancel = (e: PointerEvent) => {
    gate.release(e);
    start = null;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}

// ---------------------------------------------------------------- drag

export interface DragInfo<S> {
  /** pointer position (viewport px) */
  point: Point;
  /** offset from the pointer-down position */
  delta: Point;
  /** current snap result (null = no target) */
  target: S | null;
  event: PointerEvent;
}

export interface DragOptions<S> {
  /** px before a press becomes a drag (default 10) */
  threshold?: number;
  /** Map the pointer to a snap target (or null). Called on every move. */
  snap?: (point: Point) => S | null;
  /** Move the element with the finger via transform (default true). */
  follow?: boolean;
  onTap?: (e: PointerEvent) => void;
  onStart?: (info: DragInfo<S>) => void;
  onMove?: (info: DragInfo<S>) => void;
  /** Dropped on `target` (null = nowhere). The element's transform is reset unless keepTransform. */
  onDrop?: (target: S | null, info: DragInfo<S>) => void;
  onCancel?: () => void;
  keepTransform?: boolean;
  /** Return false to refuse a drag (e.g. input locked while the AI moves). */
  enabled?: () => boolean;
}

export function makeDraggable<S = unknown>(el: HTMLElement, opts: DragOptions<S>): Unsubscribe {
  const gate = new PrimaryPointer();
  const threshold = opts.threshold ?? TAP_SLOP_PX;
  let origin: { x: number; y: number; t: number } | null = null;
  let dragging = false;
  let target: S | null = null;
  el.style.touchAction = 'none';

  const info = (e: PointerEvent): DragInfo<S> => ({
    point: { x: e.clientX, y: e.clientY },
    delta: { x: e.clientX - origin!.x, y: e.clientY - origin!.y },
    target,
    event: e,
  });
  const resetVisual = () => {
    if (opts.follow !== false && !opts.keepTransform) {
      el.style.transform = '';
      el.classList.remove('kit-dragging');
    }
  };

  const down = (e: PointerEvent) => {
    if (opts.enabled && !opts.enabled()) return;
    if (!gate.accept(e)) return;
    origin = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    dragging = false;
    target = null;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const move = (e: PointerEvent) => {
    if (!origin || !gate.accept(e)) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (!dragging) {
      if (Math.hypot(dx, dy) <= threshold) return;
      dragging = true;
      if (opts.follow !== false) el.classList.add('kit-dragging');
      opts.onStart?.(info(e));
    }
    target = opts.snap ? opts.snap({ x: e.clientX, y: e.clientY }) : null;
    if (opts.follow !== false) el.style.transform = `translate(${dx}px, ${dy}px)`;
    opts.onMove?.(info(e));
  };
  const up = (e: PointerEvent) => {
    if (!origin || !gate.accept(e)) return;
    gate.release(e);
    const wasDragging = dragging;
    const i = info(e);
    origin = null;
    dragging = false;
    if (!wasDragging) {
      opts.onTap?.(e);
      return;
    }
    resetVisual();
    opts.onDrop?.(target, i);
  };
  const cancel = (e: PointerEvent) => {
    if (!gate.accept(e)) return;
    gate.release(e);
    if (dragging) {
      resetVisual();
      opts.onCancel?.();
    }
    origin = null;
    dragging = false;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel as EventListener);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('lostpointercapture', cancel as EventListener);
  };
}

// ---------------------------------------------------------------- hit slop

/** Enlarge an element's touch area by `px` on every side without moving it (CSS ::after overlay). */
export function hitSlop(el: HTMLElement, px = 12): void {
  el.classList.add('kit-hit-slop');
  el.style.setProperty('--kit-hit-slop', `${px}px`);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
}
