/**
 * Lesson maps that keep every node clear of its neighbours.
 *
 * The design-system `nodeMap` lays nodes at equal arc length on a sine road. That is lovely in a wide
 * box, but in a near-square box (S2 landscape with the item strip open: 600×600) nodes that straddle a
 * crest end up ~90 px apart and their labels collide. For those boxes this draws the same road and
 * the same `.xg-node` buttons (identical DOM/classes, so the kit styles and press feedback apply) on a
 * serpentine: rows of equal spacing joined by bulging U-turns, gentle waves inside a row.
 * Wide boxes still use the kit `nodeMap` (kit request §8.12: a `layout: 'rows'` option there).
 */
import { bindPress, icon, nodeMap, starRating, type MapNode, type NodeMapOptions } from '@kit/ui';
import { rowPoints } from './rowmap-geom';

export interface RowMapOptions extends NodeMapOptions {
  /** extra room under each node (stars + label) */
  below?: number;
  /** extra room above each node (icon badge) */
  above?: number;
}

/** aspect ratio at or above which the kit sine road spaces 9 labelled nodes well (measured: ≥1.3) */
const WIDE = 1.3;

export function lessonMap(el: HTMLElement, nodes: MapNode[], o: RowMapOptions = {}): HTMLButtonElement[] {
  const w = el.clientWidth, h = el.clientHeight;
  if (w / Math.max(1, h) >= WIDE) return nodeMap(el, nodes, { ...o, waves: o.waves ?? 2 }) as HTMLButtonElement[];
  return rowMap(el, nodes, o);
}

export function rowMap(el: HTMLElement, nodes: MapNode[], o: RowMapOptions = {}): HTMLButtonElement[] {
  el.classList.add('xg-map');
  const w = el.clientWidth, h = el.clientHeight, n = nodes.length;
  const { pts, cols } = rowPoints(w, h, n, { pad: o.pad, above: o.above, below: o.below });
  const padX = o.pad ?? 76;
  const bulge = Math.max(24, Math.min(64, padX - 22));
  const seg = (i: number): string => {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (Math.floor(i / cols) !== Math.floor((i + 1) / cols)) {
      // U-turn between rows: swing outwards, away from the middle of the box
      const out = x0 > w / 2 ? 1 : -1;
      return `C${(x0 + out * bulge * 1.6).toFixed(1)} ${y0.toFixed(1)} ${(x1 + out * bulge * 1.6).toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    const dx = (x1 - x0) / 3;
    const wob = i % 2 === 0 ? 22 : -22;
    return `C${(x0 + dx).toFixed(1)} ${(y0 + wob).toFixed(1)} ${(x1 - dx).toFixed(1)} ${(y1 - wob).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const path = (upTo: number): string => {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < upTo && i < n - 1; i++) d += seg(i);
    return d;
  };
  const cur = nodes.reduce((a, nd, i) => (nd.state === 'done' || nd.state === 'current' ? i : a), -1);
  const d = path(n - 1);
  el.innerHTML = `<svg class="xg-map__path" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="rgba(52,30,12,.16)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 6)"/>
    <path d="${d}" fill="none" stroke="var(--xg-paper-0)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--xg-paper-300)" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.1 16"/>
    ${cur > 0 ? `<path d="${path(cur)}" fill="none" stroke="var(--xg-accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="0.1 16"/>` : ''}
  </svg>`;
  const els = nodes.map((nd, i) => {
    const b = document.createElement('button');
    const st = nd.state;
    b.className = `xg-node xg-node--${st === 'current' ? 'done xg-node--current' : st}${nd.boss ? ' xg-node--boss' : ''}`;
    b.style.left = `${pts[i][0]}px`;
    b.style.top = `${pts[i][1]}px`;
    b.setAttribute('aria-label', `${nd.label ?? i + 1}${st === 'locked' ? '（未解锁）' : ''}`);
    b.innerHTML = st === 'locked' ? icon('lock') : `<span>${nd.label ?? i + 1}</span>`;
    if (st === 'done' && nd.stars !== undefined) b.innerHTML += `<span class="xg-node__stars">${starRating(nd.stars, 3, 'xg-stars--arc')}</span>`;
    b.addEventListener('click', () => o.onPick?.(nd));
    el.appendChild(b);
    return b;
  });
  bindPress(el);
  return els;
}
