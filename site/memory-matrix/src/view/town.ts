// 送回家: an <svg> town (houses as dome huts, aliens as <symbol>/<use>) over a tray of HTML buttons. One tap-select + tap-house path and one drag path
// (spec §3.4: both channels, hot areas >= 44/56 px). ≈70 nodes in total (spec §10.1).
import { startDrag } from '@kit/ui';
import { sleep } from '@kit/tween';
import { createRng } from '@kit/rng';
import { alienLabel, alienSymbol } from '../art/aliens';

const NS = 'http://www.w3.org/2000/svg';
export interface TownStim { rows: number; cols: number; n: number; residents: { s: number; c: number; h: number }[]; lures: { s: number; c: number; kind: string }[]; showMs: number; budget: number }
export type Placed = 'ok' | 'slip' | 'ignore';
interface House { g: SVGGElement; hit: SVGRectElement; cx: number; cy: number; k: number; res: number; placed: boolean }
interface Item { el: HTMLButtonElement; s: number; c: number; res: number; placed: boolean }

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); parent?.append(e); return e;
};

export class Town {
  readonly el: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly tray: HTMLDivElement;
  houses: House[] = [];
  items: Item[] = [];
  selected: Item | null = null;
  enabled = false;
  /** the one pointer that may drag (a second finger is ignored, spec §3.6) */
  private activePointer: number | null = null;
  onPlace: (kind: 'resident' | 'lure', res: number, house: number) => Placed = () => 'ignore';
  private readonly Hh: number;

  constructor(readonly stim: TownStim, readonly S: number, readonly phone: boolean, strong = false, seed = 'town') {
    this.el = document.createElement('div'); this.el.className = 'mm-town'; this.el.style.width = this.el.style.height = `${S}px`;
    this.Hh = Math.round(S * (phone ? 0.56 : 0.6));
    this.svg = svgEl('svg', { class: 'mm-town-svg', viewBox: `0 0 ${S} ${this.Hh}`, width: S, height: this.Hh, role: 'img', 'aria-label': '外星小镇' });
    const defs = svgEl('defs', {}, this.svg);
    const lg = svgEl('linearGradient', { id: 'mm-room', x1: 0, y1: 0, x2: 0, y2: 1 }, defs); svgEl('stop', { offset: 0, 'stop-color': '#ffe9a6' }, lg); svgEl('stop', { offset: 1, 'stop-color': '#ff9f5c' }, lg);
    const pg = svgEl('radialGradient', { id: 'mm-ground', cx: '50%', cy: '0%', r: '90%' }, defs); svgEl('stop', { offset: 0, 'stop-color': '#35478f' }, pg); svgEl('stop', { offset: 1, 'stop-color': '#1a2558' }, pg);
    const used = new Set<string>(); const symbols: string[] = [];
    for (const a of [...stim.residents, ...stim.lures]) { const id = `${a.s}${a.c}`; if (!used.has(id)) { used.add(id); symbols.push(alienSymbol(a.s, a.c, strong)); } }
    const holder = svgEl('g', {}, defs); holder.innerHTML = symbols.join('');
    // ground: a curved planet horizon the huts stand on
    svgEl('ellipse', { cx: S / 2, cy: this.Hh + S * 0.55, rx: S * 0.95, ry: S * 0.62, fill: 'url(#mm-ground)', stroke: '#51629f', 'stroke-width': 2, opacity: 0.95 }, this.svg);
    this.buildHouses(); this.svg.append(...this.houses.map((h) => h.g));
    this.tray = document.createElement('div'); this.tray.className = 'mm-tray'; this.tray.style.height = `${S - this.Hh}px`; this.tray.hidden = true;
    this.el.append(this.svg, this.tray);
    this.buildTray(seed);
  }

  private buildHouses(): void {
    const { rows, cols, residents } = this.stim, m = this.phone ? 6 : 12, cw = (this.S - 2 * m) / cols, ch = (this.Hh - 8) / rows, size = Math.min(cw, ch) * 0.9, k = size / 108;
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c, cx = m + cw * (c + 0.5), cy = 8 + ch * (r + 0.5) + 4 * k, res = residents.findIndex((x) => x.h === idx);
      const g = svgEl('g', { class: 'mm-house', 'data-h': idx, transform: `translate(${cx} ${cy}) scale(${k})` });
      svgEl('path', { d: 'M-36 44V-4Q-36 -9 -31 -9H31Q36 -9 36 -4V44Z', fill: 'url(#mm-room)', class: 'mm-room' }, g);
      if (res >= 0) { const u = svgEl('use', { href: `#al-${residents[res].s}${residents[res].c}`, x: -30, y: -10, width: 60, height: 60, class: 'mm-al' }, g); u.setAttribute('aria-hidden', 'true'); }
      const panel = svgEl('g', { class: 'mm-panel' }, g);
      svgEl('path', { d: 'M-36 44V-4Q-36 -9 -31 -9H31Q36 -9 36 -4V44Z', fill: '#2a3a7c', stroke: '#4d63b8', 'stroke-width': 3 }, panel);
      svgEl('path', { d: 'M-11 44V30A11 11 0 0 1 11 30V44Z', fill: '#0c1230' }, panel);
      svgEl('path', { d: 'M-27 7a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3ZM12 7a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3Z', fill: '#ffd863', opacity: 0.85 }, panel);
      const roof = svgEl('g', { class: 'mm-roof' }, g);
      svgEl('path', { d: 'M-46 -4Q-46 -50 0 -50Q46 -50 46 -4Z', fill: '#1f9fbd', stroke: '#6fd3ea', 'stroke-width': 3 }, roof);
      svgEl('path', { d: 'M-30 -22Q-24 -38 -6 -42', fill: 'none', stroke: '#bff0fb', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.7 }, roof);
      svgEl('circle', { cx: 0, cy: -53, r: 5, fill: '#ffd863' }, roof);
      const hit = svgEl('rect', { class: 'mm-hit', x: -(cw / k) / 2, y: -(ch / k) * 0.56, width: cw / k, height: ch / k, fill: 'transparent' }, g);
      this.houses.push({ g, hit, cx, cy, k, res, placed: false });
    }
  }

  private buildTray(seed: string): void {
    const rng = createRng(`mm:tray:${seed}`), all = [...this.stim.residents.map((a, i) => ({ s: a.s, c: a.c, res: i })), ...this.stim.lures.map((a) => ({ s: a.s, c: a.c, res: -1 }))];
    const n = all.length, per = n <= 4 ? n : Math.ceil(n / 2), size = Math.min(this.phone ? 64 : 78, Math.floor((this.S - 8 - (per - 1) * 6) / per), Math.floor((this.S - this.Hh - 12) / (n <= 4 ? 1 : 2)) - 6);
    this.tray.style.setProperty('--tile', `${Math.max(44, size)}px`);
    for (const a of rng.shuffle(all)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mm-visitor'; b.setAttribute('aria-label', alienLabel(a.s, a.c));
      b.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#al-${a.s}${a.c}"/></svg>`;
      const item: Item = { el: b, s: a.s, c: a.c, res: a.res, placed: false };
      this.items.push(item); this.tray.append(b);
      this.wireItem(item);
    }
  }

  private wireItem(item: Item): void {
    const b = item.el; let down: PointerEvent | null = null, drag: ReturnType<typeof startDrag> | null = null, moved = false;
    const houseAt = (x: number, y: number): House | null => this.houses.find((h) => { const r = h.hit.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) ?? null;
    b.addEventListener('pointerdown', (e) => { if (!this.enabled || item.placed || this.activePointer !== null) return; this.activePointer = e.pointerId; down = e; moved = false; try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } });
    b.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== this.activePointer) return;
      if (!moved && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 10) { moved = true; this.select(null); drag = startDrag(b, down, this.houses.map((h) => h.hit as unknown as HTMLElement)); }
      if (moved && drag) drag.move(e.clientX, e.clientY);
    });
    const end = async (e: PointerEvent): Promise<void> => {
      if (!down || e.pointerId !== this.activePointer) return; const was = moved, d = drag; down = null; drag = null; this.activePointer = null;
      try { b.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      if (!was) { this.select(this.selected === item ? null : item); return; }
      const h = houseAt(e.clientX, e.clientY);
      await d?.drop((h?.hit ?? null) as unknown as HTMLElement | null);
      if (h) this.place(item, h);
    };
    b.addEventListener('pointerup', (e) => void end(e)); b.addEventListener('pointercancel', (e) => {
      // iPad system gestures / palm touches cancel the pointer: the ghost tile flies back and the source tile is released (never left lifted)
      if (e.pointerId !== this.activePointer) return;
      const d = drag; down = null; drag = null; moved = false; this.activePointer = null; this.select(null);
      if (d) void d.drop(null); else b.classList.remove('is-lifted');
    });
  }
  select(item: Item | null): void { this.selected = item; for (const it of this.items) it.el.classList.toggle('is-selected', it === item); }
  /** tap on a house: place the selected visitor there */
  bindHouses(): void { this.houses.forEach((h) => h.hit.addEventListener('click', () => { if (this.enabled && this.selected) this.place(this.selected, h); })); }

  place(item: Item, h: House): void {
    if (!this.enabled || item.placed) return;
    const r = this.onPlace(item.res >= 0 ? 'resident' : 'lure', item.res, this.houses.indexOf(h));
    if (r === 'ok') this.settle(item, h);
    else if (r === 'slip') { this.select(null); item.el.classList.remove('is-shake'); void item.el.offsetWidth; item.el.classList.add('is-shake'); h.g.classList.remove('is-wobble'); void (h.g as unknown as HTMLElement).getBoundingClientRect(); h.g.classList.add('is-wobble'); }
  }
  /** the resident goes home: its house stays lit with the alien inside */
  settle(item: Item, h: House): void {
    item.placed = true; h.placed = true; this.select(null);
    item.el.classList.add('is-placed'); h.g.classList.add('is-home'); h.g.classList.remove('is-wobble');
  }

  /* ------------------------------------------------------------ phases */
  async showResidents(ms: number): Promise<void> {
    for (const h of this.houses) h.g.classList.add('is-open');
    await sleep(ms);
    for (const h of this.houses) h.g.classList.remove('is-open');
  }
  async cover(): Promise<void> { for (const h of this.houses) h.g.classList.remove('is-open'); await sleep(520); }
  async showTray(): Promise<void> { this.tray.hidden = false; this.tray.classList.add('is-in'); await sleep(360); }
  setEnabled(on: boolean): void { this.enabled = on; this.el.classList.toggle('is-live', on); }
  homeOf(res: number): House | undefined { return this.houses.find((h) => h.res === res); }
  itemOf(res: number): Item | undefined { return this.items.find((i) => i.res === res); }
  remaining(): number { return this.stim.residents.filter((_, i) => !this.itemOf(i)?.placed).length; }
  nextResident(): number { return this.stim.residents.findIndex((_, i) => !this.itemOf(i)?.placed); }
  /** H2 lightbulb: the next resident's tile and house pulse */
  hint(): void { const r = this.nextResident(); if (r < 0) return; const it = this.itemOf(r)!, h = this.homeOf(r)!; for (const el of [it.el, h.g as unknown as HTMLElement]) { el.classList.remove('is-hint'); void el.getBoundingClientRect(); el.classList.add('is-hint'); } window.setTimeout(() => { it.el.classList.remove('is-hint'); h.g.classList.remove('is-hint'); }, 2600); }
  /** reveal after a miss: everybody walks home, visitors fade */
  async reveal(): Promise<void> {
    for (const it of this.items) if (it.res < 0) it.el.classList.add('is-faded');
    for (let r = 0; r < this.stim.residents.length; r += 1) { const it = this.itemOf(r)!, h = this.homeOf(r)!; if (it.placed) continue; h.g.classList.add('is-open', 'is-home', 'is-reveal'); it.el.classList.add('is-placed'); await sleep(420); }
  }
  /** pass: every house glows once */
  celebrate(): void { this.houses.forEach((h, i) => window.setTimeout(() => h.g.classList.add('is-cheer'), i * 60)); }
  destroy(): void { this.activePointer = null; document.querySelectorAll('.xg-drag-ghost').forEach((g) => g.remove()); this.el.remove(); }
}
