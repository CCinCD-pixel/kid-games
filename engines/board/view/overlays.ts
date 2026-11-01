// view/overlays.ts — 高亮 / 箭头 / 触点预览 / 坐标 / 焦点环 / 印章。标记画在 SVG（viewBox 坐标），随棋盘缩放不用重画。
import type { Disposable, Geometry, MarkKind, Orientation, Sq } from '../core/types';

const NS = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const STAR = (cx: number, cy: number, r: number): string => { const pts: string[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.46 : r; pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); } return pts.join(' '); };

export class Overlays {
  readonly marksSvg: SVGSVGElement; readonly overSvg: SVGSVGElement; readonly stampsEl: HTMLElement;
  private readonly byId = new Map<string, SVGGElement>();
  private seq = 0;
  private preview: SVGGElement | null = null; private focus: SVGGElement | null = null;
  private coords: SVGGElement | null = null;
  constructor(host: HTMLElement, private readonly g: Geometry, private orient: Orientation, private readonly reduced: () => boolean) {
    const d = host.ownerDocument;
    this.marksSvg = svg('svg', { class: 'bk-marks', viewBox: `0 0 ${g.viewBox.w} ${g.viewBox.h}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    this.marksSvg.appendChild(this.defs());
    this.overSvg = svg('svg', { class: 'bk-over', viewBox: `0 0 ${g.viewBox.w} ${g.viewBox.h}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    this.stampsEl = d.createElement('div'); this.stampsEl.className = 'bk-stamps';
    host.appendChild(this.marksSvg);
    // 棋子层在 marks 与 over 之间（由 BoardView 插入）：这里只先放 marks；over 与 stamps 由 attachTop 追加
    this.host = host;
  }
  private host: HTMLElement;
  /** 在棋子层之上追加箭头层与印章层 */
  attachTop(): void { this.host.appendChild(this.overSvg); this.host.appendChild(this.stampsEl); }
  private defs(): SVGDefsElement {
    const defs = svg('defs'); const rg = svg('radialGradient', { id: 'bk-chk', cx: '50%', cy: '50%', r: '50%' });
    rg.append(svg('stop', { offset: '0%', 'stop-color': '#ff5a4a', 'stop-opacity': '.95' }), svg('stop', { offset: '55%', 'stop-color': '#ff5a4a', 'stop-opacity': '.55' }), svg('stop', { offset: '100%', 'stop-color': '#ff5a4a', 'stop-opacity': '0' }));
    defs.appendChild(rg); return defs;
  }
  setOrientation(o: Orientation): void { this.orient = o; }
  /** 取格中心（viewBox 单位） */
  private c(sq: Sq): { x: number; y: number } { return this.g.center(sq, this.orient); }
  /** 标记在朝向变化后需要重画：保存配置 */
  private readonly specs = new Map<string, { kind: MarkKind; sqs: Sq[]; pulse: boolean }>();

  private shape(kind: MarkKind, sq: Sq, u: number, pulse: boolean): SVGElement[] {
    const { x, y } = this.c(sq); const cls = (k: string) => `bk-mk bk-mk-${k}${pulse ? ' bk-pulse' : ''}`;
    switch (kind) {
      case 'legal': return [svg('circle', { class: cls('legal'), cx: x, cy: y, r: u * 0.17 })];
      case 'capture': return [svg('circle', { class: cls('capture'), cx: x, cy: y, r: u * 0.5 })];
      case 'select': return [svg('rect', { class: cls('select'), x: x - u * 0.48, y: y - u * 0.48, width: u * 0.96, height: u * 0.96, rx: u * 0.2 })];
      case 'last': return [svg('rect', { class: cls('last'), x: x - u * 0.5, y: y - u * 0.5, width: u, height: u, rx: u * 0.16 })];
      case 'check': return [svg('circle', { class: `bk-mk${pulse ? ' bk-pulse' : ''}`, cx: x, cy: y, r: u * 0.7, fill: 'url(#bk-chk)' })];
      case 'checker': return [svg('circle', { class: cls('checker'), cx: x, cy: y, r: u * 0.5 })];
      case 'danger': return [svg('circle', { class: cls('danger'), cx: x, cy: y, r: u * 0.5 })];
      case 'hint': return [svg('circle', { class: cls('hint'), cx: x, cy: y, r: u * 0.5 })];
      case 'dim': return [svg('rect', { class: cls('dim'), x: x - u * 0.5, y: y - u * 0.5, width: u, height: u, rx: u * 0.14 })];
      case 'star': return [svg('polygon', { class: cls('star'), points: STAR(x, y, u * 0.3) })];
      case 'sight': return [];   // 由 mark() 的两点形式处理
    }
  }
  /** 加一组标记；同 id 替换。sight 需要恰好两个格：画一条线 */
  mark(kind: MarkKind, sqs: readonly Sq[], o: { id?: string; pulse?: boolean } = {}): Disposable {
    const id = o.id ?? `${kind}#${++this.seq}`; this.byId.get(id)?.remove();
    const pulse = !!o.pulse && !this.reduced();
    const grp = svg('g', { 'data-kind': kind, 'data-id': id });
    const u = this.g.unit;
    if (kind === 'sight' && sqs.length >= 2) { const a = this.c(sqs[0]), b = this.c(sqs[1]); grp.appendChild(svg('line', { class: 'bk-mk-sight-glow', x1: a.x, y1: a.y, x2: b.x, y2: b.y })); grp.appendChild(svg('line', { class: 'bk-mk-sight', x1: a.x, y1: a.y, x2: b.x, y2: b.y })); }
    else for (const sq of sqs) for (const e of this.shape(kind, sq, u, pulse)) grp.appendChild(e);
    this.byId.set(id, grp); this.specs.set(id, { kind, sqs: [...sqs], pulse });
    this.marksSvg.appendChild(grp);
    return { dispose: () => { if (this.byId.get(id) === grp) { grp.remove(); this.byId.delete(id); this.specs.delete(id); } } };
  }
  clearKind(kind: MarkKind): void { for (const [id, s] of [...this.specs]) if (s.kind === kind) { this.byId.get(id)?.remove(); this.byId.delete(id); this.specs.delete(id); } }
  markCount(kind?: MarkKind): number { let n = 0; for (const s of this.specs.values()) if (!kind || s.kind === kind) n += s.sqs.length; return n; }
  kinds(): { kind: MarkKind; sqs: Sq[] }[] { return [...this.specs.values()].map((s) => ({ kind: s.kind, sqs: [...s.sqs] })); }
  /** 朝向变化后，按保存的规格重画全部标记 */
  redrawAll(): void {
    const specs = [...this.specs.entries()]; for (const g of this.byId.values()) g.remove(); this.byId.clear(); this.specs.clear();
    for (const [id, s] of specs) this.mark(s.kind, s.sqs, { id, pulse: s.pulse });
    if (this.coords) this.drawCoords(true);
  }
  arrow(from: Sq, to: Sq, kind: 'hint' | 'threat' | 'good' | 'warn'): Disposable {
    const a = this.c(from), b = this.c(to), u = this.g.unit; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const sx = a.x + ux * u * 0.3, sy = a.y + uy * u * 0.3, ex = b.x - ux * u * 0.3, ey = b.y - uy * u * 0.3, hw = u * 0.2, hl = u * 0.3;
    const grp = svg('g', { class: `bk-arrow bk-arrow-${kind}`, 'data-kind': 'arrow' });
    const shaft = svg('line', { x1: sx, y1: sy, x2: ex - ux * hl * 0.6, y2: ey - uy * hl * 0.6, 'stroke-width': u * 0.11, opacity: 0.92 });
    const head = svg('polygon', { points: `${ex},${ey} ${ex - ux * hl + -uy * hw},${ey - uy * hl + ux * hw} ${ex - ux * hl - -uy * hw},${ey - uy * hl - ux * hw}`, 'stroke-width': 2, fill: 'currentColor', opacity: 0.95 });
    head.setAttribute('class', 'bk-arrowhead'); head.setAttribute('style', 'fill:inherit'); grp.append(shaft, head); this.overSvg.appendChild(grp);
    // 箭头头部填充取同色
    const col = getComputedStyle(grp).stroke; if (col && col !== 'none') head.style.fill = col; head.style.stroke = col;
    return { dispose: () => grp.remove() };
  }
  clearArrows(): void { for (const g of [...this.overSvg.querySelectorAll('[data-kind="arrow"]')]) g.remove(); }
  /** 触点预览（手机：按下时画出"将提交的交点"，松手才提交） */
  showPreview(sq: Sq | null): void {
    this.preview?.remove(); this.preview = null; if (sq === null) return;
    const { x, y } = this.c(sq), u = this.g.unit; const g = svg('g'); g.appendChild(svg('circle', { class: 'bk-mk bk-mk-preview', cx: x, cy: y, r: u * 0.5 })); this.preview = g; this.marksSvg.appendChild(g);
  }
  showFocus(sq: Sq | null): void {
    this.focus?.remove(); this.focus = null; if (sq === null) return;
    const { x, y } = this.c(sq), u = this.g.unit; const g = svg('g'); g.appendChild(svg('rect', { class: 'bk-mk bk-mk-focus', x: x - u * 0.52, y: y - u * 0.52, width: u * 1.04, height: u * 1.04, rx: u * 0.2 })); this.focus = g; this.marksSvg.appendChild(g);
  }
  /** 方格棋盘的坐标字母 / 数字（画在外框边距里）；交叉点棋盘不画 */
  showCoords(on: boolean): void { if (!on) { this.coords?.remove(); this.coords = null; return; } this.drawCoords(false); }
  private drawCoords(redraw: boolean): void {
    if (this.g.kind !== 'squares') return; this.coords?.remove(); const grp = svg('g', { class: 'bk-coords', 'aria-hidden': 'true' }); const u = this.g.unit; let minX = Infinity, maxY = -Infinity;
    for (let q = 0; q < this.g.squares; q++) { const c = this.c(q); minX = Math.min(minX, c.x); maxY = Math.max(maxY, c.y); }
    for (let q = 0; q < this.g.squares; q++) {
      const c = this.c(q), nm = this.g.name(q);
      if (Math.abs(c.x - minX) < 1) { const t = svg('text', { class: 'bk-coord', x: c.x - u * 0.5 - 6, y: c.y + 7, 'text-anchor': 'end' }); t.textContent = nm.slice(1); grp.appendChild(t); }
      if (Math.abs(c.y - maxY) < 1) { const t = svg('text', { class: 'bk-coord', x: c.x, y: c.y + u * 0.5 + 26, 'text-anchor': 'middle' }); t.textContent = nm[0]; grp.appendChild(t); }
    }
    this.coords = grp; this.marksSvg.appendChild(grp); void redraw;
  }
  destroy(): void { this.marksSvg.remove(); this.overSvg.remove(); this.stampsEl.remove(); this.byId.clear(); this.specs.clear(); }
}
