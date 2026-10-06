/**
 * TouchRouter (spec §3.4, §8.7): up to two tracked pointers — the first one down on the world (not on the
 * boost key) steers, the one down on the boost key boosts; a third finger and palm-size contacts are
 * ignored. Follow-finger mode: target = direction from his head's screen position to the finger (kept
 * when the finger is < 18 px from the head or lifted). Stick mode: a floating base (132) + knob (60)
 * appears where the finger lands; deflection > 14 px sets the heading; dragging past 66 px drags the base.
 * The pause key only fires on a real tap (down on it, < 10 px travel, < 600 ms) — steering across it never
 * pauses. Keyboard (dev/tests): arrows / WASD 8-way, Space boost, P pause.
 */
export interface RouterOpts {
  surface: HTMLElement;
  boostEl: HTMLElement;
  pauseEl: HTMLElement;
  headScreen: () => [number, number] | null;
  mode: () => 'follow' | 'stick';
  doubleTapBoost: () => boolean;
  onPause: () => void;
  onBoostLocked: () => void;
  canBoost: () => boolean;
  stickEl: HTMLElement;
}

export class TouchRouter {
  target: number | null = null;
  boost = false;
  /** last time any finger touched the world (H0 idle tip) */
  lastTouch = performance.now();
  private steerId: number | null = null;
  private boostId: number | null = null;
  private tapBoostId: number | null = null;
  private pauseDown: { id: number; x: number; y: number; t: number } | null = null;
  private fx = 0; private fy = 0;
  private base: { x: number; y: number } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 }; private downT = 0; private downX = 0; private downY = 0;
  private keys = new Set<string>();
  private off: (() => void)[] = [];
  enabled = true;

  constructor(private o: RouterOpts) {
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(ev, fn as EventListener, { passive: false });
      this.off.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    on(o.surface, 'pointerdown', (e) => this.down(e));
    on(o.surface, 'pointermove', (e) => this.move(e));
    on(o.surface, 'pointerup', (e) => this.up(e));
    on(o.surface, 'pointercancel', (e) => this.up(e, true));
    on(window, 'keydown', (e) => this.key(e, true));
    on(window, 'keyup', (e) => this.key(e, false));
  }
  dispose() { for (const f of this.off) f(); this.off = []; }

  private inside(el: HTMLElement, x: number, y: number, slop = 0) {
    if (el.hidden || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
  }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    e.preventDefault();
    if ((e.width || 0) > 70 && (e.height || 0) > 70) return;  // palm
    const tracked = [this.steerId, this.boostId, this.pauseDown?.id ?? null].filter((v) => v !== null).length;
    if (tracked >= 2) return;                                   // third finger: ignored
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    if (this.inside(this.o.pauseEl, e.clientX, e.clientY, 4)) { this.pauseDown = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; return; }
    if (this.boostId === null && this.inside(this.o.boostEl, e.clientX, e.clientY, 8)) {
      this.boostId = e.pointerId; this.setBoost(true); return;
    }
    if (this.steerId !== null) return;
    this.steerId = e.pointerId; this.lastTouch = performance.now();
    this.fx = e.clientX; this.fy = e.clientY;
    this.downT = performance.now(); this.downX = e.clientX; this.downY = e.clientY;
    if (this.o.mode() === 'stick') { this.base = { x: e.clientX, y: e.clientY }; this.showStick(); }
    else {
      if (this.o.doubleTapBoost() && performance.now() - this.lastTap.t < 250 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) <= 40) { this.tapBoostId = e.pointerId; this.setBoost(true); }
      this.aim();
    }
  }
  private move(e: PointerEvent) {
    if (e.pointerId === this.steerId) {
      e.preventDefault();
      this.fx = e.clientX; this.fy = e.clientY; this.lastTouch = performance.now();
      if (this.o.mode() === 'stick') this.stick(); else this.aim();
    }
  }
  private up(e: PointerEvent, cancel = false) {
    if (this.pauseDown && e.pointerId === this.pauseDown.id) {
      const p = this.pauseDown; this.pauseDown = null;
      if (!cancel && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10 && performance.now() - p.t < 600) this.o.onPause();
      return;
    }
    if (e.pointerId === this.boostId) { this.boostId = null; this.setBoost(false); return; }
    if (e.pointerId === this.steerId) {
      this.steerId = null;
      if (e.pointerId === this.tapBoostId) { this.tapBoostId = null; this.setBoost(false); }
      if (performance.now() - this.downT < 150 && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 20) this.lastTap = { t: performance.now(), x: e.clientX, y: e.clientY };
      this.base = null; this.o.stickEl.hidden = true;
    }
  }
  private setBoost(on: boolean) {
    if (on && !this.o.canBoost()) this.o.onBoostLocked();
    this.boost = on;
    this.o.boostEl.classList.toggle('is-down', on);
  }
  /** follow-finger heading (kept if the finger is within 18 px of the head) */
  aim() {
    if (this.steerId === null || this.o.mode() !== 'follow') return;
    const h = this.o.headScreen(); if (!h) return;
    const dx = this.fx - h[0], dy = this.fy - h[1];
    if (Math.hypot(dx, dy) < 18) return;
    this.target = Math.atan2(dy, dx);
  }
  private stick() {
    if (!this.base) return;
    let dx = this.fx - this.base.x, dy = this.fy - this.base.y; const d = Math.hypot(dx, dy);
    if (d > 66) { this.base.x = this.fx - (dx / d) * 66; this.base.y = this.fy - (dy / d) * 66; dx = this.fx - this.base.x; dy = this.fy - this.base.y; }
    if (d > 14) this.target = Math.atan2(dy, dx);
    this.showStick();
  }
  private showStick() {
    const el = this.o.stickEl; if (!this.base) return;
    el.hidden = false;
    el.style.transform = `translate3d(${this.base.x - 66}px, ${this.base.y - 66}px, 0)`;
    const knob = el.firstElementChild as HTMLElement | null;
    if (knob) { let dx = this.fx - this.base.x, dy = this.fy - this.base.y; const d = Math.hypot(dx, dy); if (d > 50) { dx *= 50 / d; dy *= 50 / d; } knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`; }
  }
  private key(e: KeyboardEvent, down: boolean) {
    const k = e.key.toLowerCase();
    if (k === 'p' && down) { this.o.onPause(); return; }
    if (k === ' ') { e.preventDefault(); if (this.boostId === null) this.setBoost(down); return; }
    const map: Record<string, string> = { arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd', arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' };
    const dir = map[k]; if (!dir) return;
    e.preventDefault();
    if (down) this.keys.add(dir); else this.keys.delete(dir);
    const x = (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0), y = (this.keys.has('d') ? 1 : 0) - (this.keys.has('u') ? 1 : 0);
    if (x || y) { this.target = Math.atan2(y, x); this.lastTouch = performance.now(); }
  }
  /** each frame: re-aim (his head moved under a still finger) */
  tick() { if (this.o.mode() === 'follow') this.aim(); }
  reset() { this.steerId = null; this.boostId = null; this.pauseDown = null; this.setBoost(false); this.o.stickEl.hidden = true; }
}
