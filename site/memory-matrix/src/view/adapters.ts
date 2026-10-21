// One adapter per sector: it owns the board, knows the answer, draws every reaction, and tells the round controller only what happened
// (tapOk / tapSlip / done). The controller owns rules (slip budget, looks, hints, voice, results).
import { ghostTap } from '@kit/ui';
import { sleep } from '@kit/tween';
import { createRng } from '@kit/rng';
import { StarBoard } from './board';
import { Town, type TownStim } from './town';
import { starHit } from '../core/layout';
import type { Plan } from '../core/session';

export interface Hooks { tapOk(step: number, total: number): void; tapSlip(why?: 'copy' | 'flip' | 'lure'): void; done(): void }
export interface Banner { title: string; sub: string; arrow?: 'left' | 'plain' }
export interface Adapter {
  readonly el: HTMLElement;
  readonly total: number;
  found(): number;
  /** show the stimulus (the voice stays quiet while this runs) */
  preview(): Promise<void>;
  /** cover it (cloud / roofs / tray) and get ready for answers */
  hide(): Promise<void>;
  open(on: boolean): void;
  /** 再看一眼: replay the stimulus without losing the answers already given */
  rewatch(): Promise<void>;
  hintNext(): void;
  reveal(): Promise<void>;
  celebrate(): Promise<void>;
  /** H3: the ghost hand solves this stimulus */
  demo(): Promise<void>;
  gift(): void;
  /** the first tap target in viewport coordinates (tutorial ghost hand) */
  firstTarget(): Element | null;
  scaleTo(S: number): void;
  banner(): Banner | null;
  breathe(on: boolean): void;
  destroy(): void;
}

const anchor = (host: HTMLElement, r: DOMRect | { left: number; top: number; width: number; height: number }): HTMLElement => {
  const a = document.createElement('div'); a.className = 'mm-anchor'; Object.assign(a.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, pointerEvents: 'none' });
  host.append(a); return a;
};
const once = async (host: HTMLElement, r: DOMRect): Promise<void> => { const a = anchor(host, r); try { await ghostTap(a); } finally { a.remove(); } };

/* ======================================================================= s1 记星星 */
export class S1Adapter implements Adapter {
  readonly board: StarBoard;
  readonly total: number;
  private live = false;
  private foundSet = new Set<number>(); private wrong = new Set<number>();
  private readonly cells: number[]; private readonly stim: Plan['stim'];
  constructor(plan: Plan, S: number, private hooks: Hooks) {
    this.stim = plan.stim; this.cells = plan.stim.cells; this.total = this.cells.length;
    this.board = new StarBoard({ S, kind: 's1', g: plan.stim.g });
    this.board.onPoint((x, y) => { if (this.live) this.tap(this.board.cellAt(x, y)); });
  }
  get el(): HTMLElement { return this.board.el; }
  found(): number { return this.foundSet.size; }
  private tap(i: number, quiet = false): void {
    if (i < 0 || this.foundSet.has(i) || this.wrong.has(i)) return;
    const [x, y] = this.board.center(i);
    if (this.cells.includes(i)) {
      this.foundSet.add(i); this.board.setCell(i, 'ok'); this.board.ring(x, y); this.board.burst(x, y);
      if (!quiet) this.hooks.tapOk(this.foundSet.size, this.total);
      if (this.foundSet.size === this.total && !quiet) this.hooks.done();
    } else { this.wrong.add(i); this.board.setCell(i, 'miss'); this.board.puff(x, y); if (!quiet) this.hooks.tapSlip(); }
  }
  async preview(): Promise<void> {
    for (const i of this.cells) this.board.setCell(i, 'lit');
    this.board.twinkle = true; this.board.kick();
    await sleep(this.stim.previewMs);
    this.board.twinkle = false;
  }
  async hide(): Promise<void> {
    await this.board.setFog(1, 600);
    for (const i of this.cells) if (!this.foundSet.has(i)) this.board.removeItem(`c${i}`);
    for (const i of this.foundSet) this.board.setCell(i, 'ok', { t0: -1e9 });
  }
  open(on: boolean): void { this.live = on; }
  async rewatch(): Promise<void> {
    const keep = this.board.saveState(); this.live = false;
    await this.board.setFog(0, 350);
    await this.preview(); await this.hide();
    this.board.restoreState(keep); this.live = true;
  }
  hintNext(): void { const i = this.cells.find((c) => !this.foundSet.has(c)); if (i === undefined) return; this.board.setCell(i, 'reveal'); this.board.pulse(`c${i}`, 2600); }
  async reveal(): Promise<void> {
    this.live = false;
    for (const i of this.cells) if (!this.foundSet.has(i)) { this.board.setCell(i, 'lit'); const [x, y] = this.board.center(i); this.board.burst(x, y); await sleep(300); }
    await this.board.setFog(0, 500); await sleep(150);
  }
  async celebrate(): Promise<void> {
    this.live = false;
    await this.board.setFog(0, 500); this.board.connect(this.cells); await sleep(Math.min(900, 120 * this.total + 300));
  }
  async demo(): Promise<void> {
    this.live = false;
    for (const i of this.cells) { if (this.foundSet.has(i)) continue; await once(this.el, this.board.screenRect(i)); this.tap(i, true); }
    await sleep(300);
  }
  gift(): void { const i = this.cells[0]; this.foundSet.add(i); this.board.setCell(i, 'ok'); }
  firstTarget(): Element | null { const r = this.board.screenRect(this.cells[0]); return anchor(this.el, r); }
  scaleTo(S: number): void { this.board.el.style.transform = `scale(${S / this.board.S})`; this.board.el.style.transformOrigin = '0 0'; }
  banner(): Banner | null { return null; }
  breathe(on: boolean): void { this.board.el.classList.toggle('is-breathe', on); }
  destroy(): void { this.board.destroy(); }
}

/* ======================================================================= s2 追流星 */
export class S2Adapter implements Adapter {
  readonly board: StarBoard;
  readonly total: number;
  private live = false;
  private k = 0;
  private readonly stim: Plan['stim']; private readonly pts: [number, number][]; private readonly hit: number;
  private order: number[];
  /** star -> the step (k) it was wrongly tapped at: a repeat tap on it at the SAME step is a stutter and is ignored (a star tapped too early may still be the right one later) */
  private wrongAt = new Map<number, number>();
  private timers = new Set<number>();
  constructor(plan: Plan, S: number, private hooks: Hooks) {
    this.stim = plan.stim; this.total = plan.stim.L; this.order = plan.stim.target;
    this.board = new StarBoard({ S, kind: 's2' });
    const pad = this.board.pad + 6, span = S - 2 * pad;
    this.pts = plan.stim.pts.map((p: number[]) => [pad + p[0] * span, pad + p[1] * span] as [number, number]);
    this.hit = Math.max(22, starHit(S) / 1) ;
    this.pts.forEach(([x, y], i) => this.board.setItem(`s${i}`, x, y, 'sky', { t0: -1e9 }));
    this.board.onPoint((x, y) => { if (this.live) this.tap(this.near(x, y)); });
  }
  get el(): HTMLElement { return this.board.el; }
  found(): number { return this.k; }
  private near(x: number, y: number): number { let b = -1, bd = 1e9; this.pts.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; b = i; } }); return bd <= this.hit ? b : -1; }
  private tap(i: number, quiet = false): void {
    if (i < 0 || this.order.slice(0, this.k).includes(i) || this.wrongAt.get(i) === this.k) return;
    const [x, y] = this.pts[i];
    if (i === this.order[this.k]) {
      if (this.k > 0) this.board.addLine(this.pts[this.order[this.k - 1]], [x, y], { w: 2.6, ms: 220 });
      this.k += 1; this.board.setItem(`s${i}`, x, y, 'ok'); this.board.ring(x, y); this.board.burst(x, y);
      if (!quiet) { this.hooks.tapOk(this.k, this.total); if (this.k === this.total) this.hooks.done(); }
    } else {
      this.wrongAt.set(i, this.k); this.board.puff(x, y); const it = this.board.items.get(`s${i}`);
      if (it) {
        this.board.setItem(`s${i}`, x, y, 'miss');
        const h = window.setTimeout(() => { this.timers.delete(h); if (this.board.items.get(`s${i}`)?.kind === 'miss') this.board.setItem(`s${i}`, x, y, 'sky', { t0: -1e9 }); }, 700);
        this.timers.add(h);
      }
      if (!quiet) this.hooks.tapSlip();
    }
  }
  private clearTimers(): void { for (const h of this.timers) window.clearTimeout(h); this.timers.clear(); }
  private async sequence(): Promise<void> {
    const S = this.board.S;
    for (const i of this.stim.seq as number[]) {
      const [x, y] = this.pts[i], sx = x - S * 0.5 * (0.6 + Math.random() * 0), sy = y - S * 0.42;
      this.board.streak(Math.max(-20, sx), sy, x, y, 320); await sleep(300);
      this.board.setItem(`s${i}`, x, y, 'lit'); this.board.ring(x, y, 'gold'); this.board.twinkle = true;
      await sleep(Math.max(300, this.stim.litMs - 300)); this.board.twinkle = false;
      this.board.setItem(`s${i}`, x, y, 'sky', { t0: -1e9 }); await sleep(this.stim.gapMs);
    }
  }
  async preview(): Promise<void> { await sleep(250); await this.sequence(); }
  async hide(): Promise<void> { /* the sky is the sky: nothing to cover, the ORDER is what is forgotten */ }
  open(on: boolean): void { this.live = on; }
  async rewatch(): Promise<void> { const keep = this.board.saveState(); this.live = false; await this.sequence(); this.board.restoreState(keep); this.live = true; }
  hintNext(): void { const i = this.order[this.k]; const [x, y] = this.pts[i]; this.board.setItem(`s${i}`, x, y, 'reveal'); this.board.pulse(`s${i}`, 2600); }
  async reveal(): Promise<void> {
    this.live = false; this.board.lines = []; this.clearTimers();
    for (let j = 0; j < this.order.length; j += 1) {
      const i = this.order[j], [x, y] = this.pts[i]; if (j > 0) this.board.addLine(this.pts[this.order[j - 1]], [x, y], { w: 2.6, ms: 260 });
      this.board.setItem(`s${i}`, x, y, 'lit', { num: j + 1 }); this.board.burst(x, y); await sleep(380);
    }
    await sleep(250);
  }
  async celebrate(): Promise<void> { this.live = false; this.clearTimers(); for (const [i] of this.pts.entries()) { const it = this.board.items.get(`s${i}`); if (it && it.kind === 'ok') it.num = undefined; } await sleep(700); }
  async demo(): Promise<void> {
    this.live = false;
    for (const i of this.order) { const [x, y] = this.pts[i], r = this.board.screenPoint(x, y); await once(this.el, new DOMRect(r[0] - 24, r[1] - 24, 48, 48)); this.tap(i, true); }
    await sleep(300);
  }
  gift(): void { const i = this.order[0], [x, y] = this.pts[i]; this.k = 1; this.board.setItem(`s${i}`, x, y, 'ok'); }
  firstTarget(): Element | null { const [x, y] = this.pts[this.order[0]], r = this.board.screenPoint(x, y); return anchor(this.el, new DOMRect(r[0] - 24, r[1] - 24, 48, 48)); }
  scaleTo(S: number): void { this.board.el.style.transform = `scale(${S / this.board.S})`; this.board.el.style.transformOrigin = '0 0'; }
  banner(): Banner | null { return this.stim.dir === 'B' ? { title: '倒着追', sub: '最后一颗最先点', arrow: 'left' } : null; }
  breathe(on: boolean): void { this.board.el.classList.toggle('is-breathe', on); }
  destroy(): void { this.clearTimers(); this.board.destroy(); }
}

/* ======================================================================= s3 送回家 */
export class S3Adapter implements Adapter {
  readonly town: Town;
  readonly total: number;
  private placedN = 0;
  constructor(plan: Plan, S: number, phone: boolean, strong: boolean, private hooks: Hooks) {
    const st = plan.stim as TownStim; this.total = st.n;
    this.town = new Town(st, S, phone, strong, plan.seed);
    this.town.bindHouses();
    this.town.onPlace = (kind, res, house) => {
      const h = this.town.houses[house];
      if (kind === 'resident' && h.res === res && !h.placed) { this.placedN += 1; queueMicrotask(() => { this.hooks.tapOk(this.placedN, this.total); if (this.placedN === this.total) this.hooks.done(); }); return 'ok'; }
      queueMicrotask(() => this.hooks.tapSlip(kind === 'lure' ? 'lure' : undefined)); return 'slip';
    };
  }
  get el(): HTMLElement { return this.town.el; }
  found(): number { return this.placedN; }
  async preview(): Promise<void> { await sleep(250); await this.town.showResidents(this.town.stim.showMs); }
  async hide(): Promise<void> { await this.town.cover(); await this.town.showTray(); }
  open(on: boolean): void { this.town.setEnabled(on); }
  async rewatch(): Promise<void> { this.town.setEnabled(false); this.town.tray.classList.add('is-away'); await this.town.showResidents(this.town.stim.showMs); await this.town.cover(); this.town.tray.classList.remove('is-away'); this.town.setEnabled(true); }
  hintNext(): void { this.town.hint(); }
  async reveal(): Promise<void> { this.town.setEnabled(false); await this.town.reveal(); }
  async celebrate(): Promise<void> { this.town.setEnabled(false); this.town.celebrate(); await sleep(800); }
  async demo(): Promise<void> {
    this.town.setEnabled(false);
    for (let r = 0; r < this.town.stim.residents.length; r += 1) {
      const it = this.town.itemOf(r)!, h = this.town.homeOf(r)!; if (it.placed) continue;
      await once(it.el, it.el.getBoundingClientRect()); await once(this.el, h.hit.getBoundingClientRect());
      this.town.settle(it, h); this.placedN += 1;
    }
    await sleep(300);
  }
  gift(): void { const it = this.town.itemOf(0)!, h = this.town.homeOf(0)!; this.town.settle(it, h); this.placedN += 1; }
  firstTarget(): Element | null { return this.town.itemOf(0)?.el ?? null; }
  scaleTo(S: number): void { this.town.el.style.transform = `scale(${S / this.town.S})`; this.town.el.style.transformOrigin = '0 0'; }
  banner(): Banner | null { return null; }
  breathe(on: boolean): void { this.town.el.classList.toggle('is-breathe', on); }
  destroy(): void { this.town.destroy(); }
}

/* ======================================================================= s4 照镜子 */
export class S4Adapter implements Adapter {
  readonly board: StarBoard;
  readonly total: number;
  private live = false;
  private foundSet = new Set<number>(); private wrong = new Set<number>();
  private readonly stim: Plan['stim']; private readonly src: number[]; private readonly target: number[];
  private ghostFrac: number | null;
  constructor(plan: Plan, S: number, mirrorW: number, private hooks: Hooks) {
    this.stim = plan.stim; this.src = plan.stim.cells; this.target = plan.stim.target; this.total = this.target.length; this.ghostFrac = plan.ghost;
    this.board = new StarBoard({ S, kind: 's4', g: plan.stim.g, axis: plan.stim.axis, mirrorW });
    this.board.srcHalf = plan.stim.side;
    this.board.onPoint((x, y) => { if (this.live) this.tap(this.board.cellAt(x, y)); });
  }
  get el(): HTMLElement { return this.board.el; }
  found(): number { return this.foundSet.size; }
  /** the cell a shadow belongs to (its reflection) */
  private mirrorOf(i: number): number { const g = this.stim.g, r = Math.floor(i / g), c = i % g; return this.stim.axis === 'LR' ? r * g + (g - 1 - c) : (g - 1 - r) * g + c; }
  private tap(i: number, quiet = false): void {
    if (i < 0 || this.foundSet.has(i) || this.wrong.has(i)) return;
    if (this.board.halfOfCell(i) === this.stim.side) return;                                           // the original half is not an answer: ignored
    const [x, y] = this.board.center(i);
    if (this.target.includes(i)) {
      this.foundSet.add(i); this.board.setCell(i, 'shadow'); this.board.ring(x, y, 'ice'); this.board.burst(x, y, 'ice');
      this.board.addLine(this.board.center(this.mirrorOf(i)), [x, y], { dash: true, color: '#9fd0ff', w: 1.8, alpha: 0.7, ms: 300 });
      if (!quiet) { this.hooks.tapOk(this.foundSet.size, this.total); if (this.foundSet.size === this.total) this.hooks.done(); }
    } else {
      this.wrong.add(i); this.board.setCell(i, 'miss'); this.board.puff(x, y);
      if (!quiet) this.hooks.tapSlip(this.stim.copy.includes(i) ? 'copy' : this.stim.flip.includes(i) ? 'flip' : undefined);
    }
  }
  private guides(): void {
    if (this.ghostFrac === null || this.ghostFrac <= 0) return;
    const n = Math.ceil(this.target.length * this.ghostFrac);
    this.target.slice(0, n).forEach((i) => { if (!this.foundSet.has(i)) this.board.setCell(i, 'ghost'); });
  }
  async preview(): Promise<void> {
    for (const i of this.src) this.board.setCell(i, 'lit');
    this.board.twinkle = true; this.board.kick();
    await sleep(this.stim.mode === 'peek' ? this.stim.previewMs : 1400);
    this.board.twinkle = false;
  }
  async hide(): Promise<void> {
    if (this.stim.mode === 'peek') {
      await this.board.setFog(1, 600, this.stim.side === 0 ? 'half0' : 'half1');
      for (const i of this.src) this.board.removeItem(`c${i}`);
    }
    this.guides();
  }
  open(on: boolean): void { this.live = on; }
  async rewatch(): Promise<void> {
    const keep = this.board.saveState(); this.live = false;
    if (this.stim.mode === 'peek') await this.board.setFog(0, 350);
    for (const i of this.src) this.board.setCell(i, 'lit'); this.board.twinkle = true; this.board.kick();
    await sleep(this.stim.mode === 'peek' ? this.stim.previewMs : 1200); this.board.twinkle = false;
    if (this.stim.mode === 'peek') await this.board.setFog(1, 500, this.stim.side === 0 ? 'half0' : 'half1');
    this.board.restoreState(keep); if (this.stim.mode === 'peek') for (const i of this.src) this.board.removeItem(`c${i}`);
    this.live = true;
  }
  hintNext(): void { const i = this.target.find((t) => !this.foundSet.has(t)); if (i === undefined) return; this.board.setCell(i, 'reveal', { hue: 'ice' }); this.board.pulse(`c${i}`, 2600); }
  /** every remaining shadow flips across the mirror, one by one (0.7 s each, spec §9.2) */
  private async flipAcross(list: number[]): Promise<void> {
    if (this.stim.mode === 'peek') { await this.board.setFog(0, 400); for (const i of this.src) this.board.setCell(i, 'lit'); }
    for (const i of list) {
      const s = this.board.center(this.mirrorOf(i)), t = this.board.center(i);
      this.board.streak(s[0], s[1], t[0], t[1], 520); await sleep(480);
      this.board.setCell(i, 'shadow'); this.board.ring(t[0], t[1], 'ice'); this.board.addLine(s, t, { dash: true, color: '#9fd0ff', w: 1.8, alpha: 0.7, ms: 200 }); await sleep(220);
    }
  }
  async reveal(): Promise<void> { this.live = false; await this.flipAcross(this.target.filter((t) => !this.foundSet.has(t))); await sleep(200); }
  async celebrate(): Promise<void> { this.live = false; await sleep(750); }
  async demo(): Promise<void> {
    this.live = false;
    if (this.stim.mode === 'peek') { await this.board.setFog(0, 400); for (const i of this.src) this.board.setCell(i, 'lit'); }
    for (const i of this.target) { if (this.foundSet.has(i)) continue; await once(this.el, this.board.screenRect(i)); this.tap(i, true); }
    await sleep(300);
  }
  gift(): void { const i = this.target[0]; this.foundSet.add(i); this.board.setCell(i, 'shadow'); }
  firstTarget(): Element | null { return anchor(this.el, this.board.screenRect(this.target[0])); }
  scaleTo(S: number): void { this.board.el.style.transform = `scale(${S / this.board.S})`; this.board.el.style.transformOrigin = '0 0'; }
  banner(): Banner | null { return { title: this.stim.axis === 'LR' ? '左右镜像' : '上下镜像', sub: this.stim.mode === 'peek' ? '记着照：原图会躲起来' : '看着照' }; }
  breathe(on: boolean): void { this.board.el.classList.toggle('is-breathe', on); }
  destroy(): void { this.board.destroy(); }
}

export function makeAdapter(plan: Plan, S: number, o: { phone: boolean; strong: boolean; mirrorW: number }, hooks: Hooks): Adapter {
  void createRng;
  if (plan.sector === 's1') return new S1Adapter(plan, S, hooks);
  if (plan.sector === 's2') return new S2Adapter(plan, S, hooks);
  if (plan.sector === 's3') return new S3Adapter(plan, S, o.phone, o.strong, hooks);
  return new S4Adapter(plan, S, o.mirrorW, hooks);
}
