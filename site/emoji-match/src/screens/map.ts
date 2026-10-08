/**
 * S2 episode map (spec §2.4): the design-system nodeMap with 10 level nodes (boss = 10), plus the
 * episode's 星图谜题 as an 11th node on a dashed branch beside level 5 (kit request #5: nodeMap has
 * no branch nodes, so it is placed from the returned button positions). The puzzle node shows a
 * constellation glyph — never a star, so it cannot be confused with the boss's star. 「航线」 back
 * button right of 🏠, episode chip, stars n/30.
 */
import { bindPress, icon, nodeMap, type MapNode } from '@kit/ui';
import { EPISODES, levelsOf, puzzleOf } from '../content';
import type { AppCtx } from '../ctx';
import { play as sfx } from '../audio';
import type { SceneKey } from '../view/art/sky';
import { backdrop } from '../view/backdrop';
import { shipSvg } from '../view/art/ship';
import { installed } from './route';
import { isUnlocked } from '../save';

const GLYPH = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 34L19 14L31 22L40 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
  <circle cx="9" cy="34" r="4.5" fill="currentColor"/><circle cx="19" cy="14" r="4" fill="currentColor"/><circle cx="31" cy="22" r="4.5" fill="currentColor"/><circle cx="40" cy="9" r="3.5" fill="currentColor"/></svg>`;

export class MapScreen {
  el: HTMLElement;
  constructor(private app: AppCtx, private ep: number) {
    this.el = document.createElement('div');
    this.el.className = 'em-screen em-map';
  }
  mount(host: HTMLElement): void { host.append(this.el); this.app.music(true); this.render(); this.el.dataset.ready = '1'; }
  resize(): void { this.render(); }
  destroy(): void { this.el.remove(); }
  private render(): void {
    const li = this.app.layout();
    const land = li.width > li.height;
    const e = EPISODES.find((x) => x.ep === this.ep)!;
    const levels = levelsOf(this.ep);
    const order = levels.map((d) => d.id);
    const s = this.app.save.data;
    const stars = levels.reduce((a, d) => a + (s.levels[d.id]?.stars ?? 0), 0);
    this.el.innerHTML = `<div class="em-bg">${backdrop(`ep${this.ep}` as SceneKey, land)}</div>
      <div class="em-topbar"><button class="xg-btn xg-btn--night em-upbtn" data-sfx="ui-back">${icon('back')}<span>航线</span></button>
        <div class="em-chip em-chip--title"><span>${e.name}</span></div>
        <div class="em-chip em-chip--stars">${icon('star')}<b class="xg-num">${stars}</b><span class="xg-num">/30</span></div></div>
      <div class="em-map__nodes"></div>`;
    this.el.querySelector('.em-upbtn')!.addEventListener('click', () => this.app.go({ s: 'route' }));
    const host = this.el.querySelector<HTMLElement>('.em-map__nodes')!;
    const cur = levels.find((d) => (s.levels[d.id]?.stars ?? 0) === 0 && isUnlocked(s, d.id, order));
    const nodes: MapNode[] = levels.map((d) => {
      const st = s.levels[d.id]?.stars ?? 0;
      const open = isUnlocked(s, d.id, order);
      return { id: d.id, label: String(d.n), state: d === cur ? 'current' : st > 0 ? 'done' : open ? 'open' : 'locked', stars: st, boss: d.n === 10 };
    });
    const marker = document.createElement('span');
    marker.className = 'em-map__marker';
    marker.innerHTML = shipSvg(installed(this.app), { flame: false });
    requestAnimationFrame(() => {
      const btns = nodeMap(host, nodes, { marker, pad: Math.min(li.width, li.height) < 600 ? 34 : 64, onPick: (n) => { if (n.state === 'locked') { void this.app.voice.say('em.route.locked'); return; } this.app.go({ s: 'card', id: n.id, back: 'map' }); } });
      this.puzzleNode(host, btns, land);
      const mk = host.querySelector<HTMLElement>('.xg-node__marker'), bar = this.el.querySelector<HTMLElement>('.em-topbar');
      if (mk && bar && mk.getBoundingClientRect().top < bar.getBoundingClientRect().bottom + 24) mk.classList.add('is-beside');
      bindPress(this.el);
    });
  }
  /** the branch node beside level 5 (unlocks when level 5 is won, spec §8.7) */
  private puzzleNode(host: HTMLElement, btns: HTMLElement[], land: boolean): void {
    const p = puzzleOf(this.ep); if (!p || btns.length < 6) return;
    const s = this.app.save.data;
    const open = (s.levels[`${this.ep}-05`]?.stars ?? 0) > 0;
    const solved = !!s.puzzles[p.id]?.solved;
    const a = btns[4], prev = btns[3], next = btns[5];
    const ax = parseFloat(a.style.left), ay = parseFloat(a.style.top);
    const dx = parseFloat(next.style.left) - parseFloat(prev.style.left), dy = parseFloat(next.style.top) - parseFloat(prev.style.top);
    const len = Math.hypot(dx, dy) || 1;
    // perpendicular to the road, towards the roomier side of the box
    let nx = -dy / len, ny = dx / len;
    const w = host.clientWidth, h = host.clientHeight;
    if (nx * (w / 2 - ax) + ny * (h / 2 - ay) < 0) { nx = -nx; ny = -ny; }
    // QA r1: keep ≥ 24 px clear of every node (its disc, number and star row): try both sides of the road,
    // a few angles and distances, take the nearest spot that is clear (else the roomiest one)
    const hr = host.getBoundingClientRect();
    const mk = host.querySelector('.xg-node__marker');
    const boxes = [...btns, ...(mk ? [mk] : [])].map((e) => { const r = e.getBoundingClientRect(); return { x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top }; });
    const gapAt = (cx: number, cy: number) => Math.min(...boxes.map((b) => Math.max(b.x0 - (cx + 42), (cx - 42) - b.x1, b.y0 - (cy + 42), (cy - 42) - b.y1)));
    let best = { x: ax + nx * 128, y: ay + ny * 128, gap: -1e9, cost: 1e9 };
    for (const side of [1, -1]) for (const ang of [0, 0.35, -0.35, 0.7, -0.7]) for (const dist of land ? [118, 140, 165, 190] : [128, 150, 175, 200]) {
      const c = Math.cos(ang), sn = Math.sin(ang);
      const vx = (nx * c - ny * sn) * side, vy = (nx * sn + ny * c) * side;
      const x = Math.max(56, Math.min(w - 56, ax + vx * dist)), y = Math.max(56, Math.min(h - 56, ay + vy * dist));
      const gap = gapAt(x, y), cost = dist + Math.abs(ang) * 60 + (side < 0 ? 40 : 0);
      if ((gap >= 24 && (best.gap < 24 || cost < best.cost)) || (best.gap < 24 && gap > best.gap)) best = { x, y, gap, cost };
    }
    const { x, y } = best;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    line.setAttribute('class', 'em-map__branch');
    line.setAttribute('viewBox', `0 0 ${w} ${h}`);
    line.innerHTML = `<path d="M${ax} ${ay}L${x} ${y}" stroke="${open ? 'rgba(255,224,138,.8)' : 'rgba(207,216,255,.35)'}" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 14" fill="none"/>`;
    host.prepend(line);
    const b = document.createElement('button');
    b.className = `em-pnode${open ? '' : ' is-locked'}${solved ? ' is-solved' : open ? ' is-open' : ''}`;
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    b.setAttribute('aria-label', `星图谜题 ${p.id.slice(1)}${open ? '' : '（未解锁）'}`);
    b.innerHTML = `${open ? GLYPH : icon('lock')}${solved ? `<span class="em-pnode__ok">${icon('check')}</span>` : ''}`;
    b.addEventListener('click', () => {
      if (!open) { sfx('ui-locked'); void this.app.voice.say('em.route.locked', { interrupt: true }); return; }
      sfx('ui-press');
      this.app.go({ s: 'puzzle', id: p.id });
    });
    host.append(b);
  }
}
