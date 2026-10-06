/**
 * Board gestures (spec §3.2), judged by the board itself (primary pointer only):
 *   tap      ≤ 20 px and ≤ 600 ms
 *   swipe    ≥ 48 px and ≤ 350 ms along the main axis — only when swipe walking is on
 *   near miss anything else (20–48 px, a slow drag, a swipe while swiping is off) → a paper ripple
 *            at the release point and the robot glances that way: received, but it did not count.
 * Keyboard arrows / WASD act like swipes (dev, external keyboards).
 */
export type BoardGesture =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'swipe'; dir: 0 | 1 | 2 | 3; x: number; y: number }
  | { kind: 'miss'; x: number; y: number };

export const TAP_MAX_PX = 20;
export const TAP_MAX_MS = 600;
export const SWIPE_MIN_PX = 48;
export const SWIPE_MAX_MS = 350;

/** Pure classification (unit-tested). */
export function classify(dx: number, dy: number, ms: number, swipeOn: boolean): 'tap' | 'swipe' | 'miss' {
  const d = Math.hypot(dx, dy);
  if (d <= TAP_MAX_PX && ms <= TAP_MAX_MS) return 'tap';
  if (d >= SWIPE_MIN_PX && ms <= SWIPE_MAX_MS && swipeOn) return 'swipe';
  return 'miss';
}

export function swipeDir(dx: number, dy: number): 0 | 1 | 2 | 3 {
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : dy < 0 ? 0 : 1;
}

export function attachBoardInput(el: HTMLElement, o: { swipeOn: () => boolean; onGesture: (g: BoardGesture) => void; enabled: () => boolean }): () => void {
  let id: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  const down = (e: PointerEvent) => {
    if (!e.isPrimary || id !== null || e.button > 0) return;
    id = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    t0 = performance.now();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!o.enabled()) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    const kind = classify(dx, dy, performance.now() - t0, o.swipeOn());
    if (kind === 'tap') o.onGesture({ kind, x: x0, y: y0 });
    else if (kind === 'swipe') o.onGesture({ kind, dir: swipeDir(dx, dy), x: e.clientX, y: e.clientY });
    else o.onGesture({ kind, x: e.clientX, y: e.clientY });
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId === id) id = null;
  };
  const key = (e: KeyboardEvent) => {
    const map: Record<string, 0 | 1 | 2 | 3> = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, w: 0, s: 1, a: 2, d: 3, W: 0, S: 1, A: 2, D: 3 };
    const dir = map[e.key];
    if (dir === undefined || !o.enabled()) return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
    e.preventDefault();
    o.onGesture({ kind: 'swipe', dir, x: 0, y: 0 });
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key);
  };
}
