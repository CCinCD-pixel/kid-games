/**
 * Board view (spec §8.4): static board SVG → highlight SVG → 50 absolutely positioned piece divs
 * (transform only) → effect layer. Input: tap a station, or drag a piece (>8 px) and drop it on a
 * station (snaps within 60 px, otherwise springs back). Animations are WAAPI; no idle rAF loop.
 *
 * The view never decides rules: the match screen tells it what to show and gets taps/drops back.
 */
import { N, isRail, isRailEdge } from '../core/board';
import type { Move } from '../core/movegen';
import { FLAG } from '../core/pieces';
import type { GameState } from '../core/state';
import { EASE, MS, d, dm, railDuration, run } from './anim';
import { cachedBoardSvg } from './board-svg';
import { mcIcon } from './icons';
import { nearestStation, stationAt, stationLocal, type BoardGeom, type Pt } from './layout';
import { PAD, TILE, tileSvg, type Face } from './pieces-svg';

export interface ViewOpts {
  /** whose eyes: 0/1 = that side's own pieces are visible in 暗棋; −1 = everything visible (review) */
  viewer: number;
  /** text rotation per piece (seat) */
  rotOf: (pid: number) => number;
  numbers: boolean;
}

export interface BoardHandlers {
  onTap(at: number): void;
  onDrop(pid: number, at: number): void;
  /** may this piece be dragged right now? */
  canDrag(pid: number): boolean;
  /** called on any touch of the board (clears the last-move arrow etc.) */
  onTouch?(): void;
  /** a finger held still on a station for 520 ms (侦察便签 on an enemy piece) */
  onLongPress?(at: number): void;
}

interface PieceEl {
  el: HTMLDivElement;
  key: string;
  pos: number;
}

const SVGNS = 'http://www.w3.org/2000/svg';
const f = (n: number): string => (Math.round(n * 10) / 10).toString();

export class BoardView {
  readonly el: HTMLDivElement;
  readonly fxLayer: HTMLDivElement;
  private boardHost: HTMLDivElement;
  private hl: SVGSVGElement;
  private hlDest: SVGGElement;
  private hlLast: SVGGElement;
  private hlPath: SVGGElement;
  private hlCoach: SVGGElement;
  /** puzzle goal marks (stars / reticles / pennant) under the pieces */
  private hlGoal: SVGGElement;
  /** hint arrow (H2) above the pieces */
  private hlHint: SVGGElement;
  /** attack markers sit above the tiles they target */
  private hlTop: SVGSVGElement;
  private piecesLayer: HTMLDivElement;
  private hit: HTMLDivElement;
  private pieces = new Map<number, PieceEl>();
  g!: BoardGeom;
  private state: GameState | null = null;
  private opts: ViewOpts;
  private drag: { pid: number; start: Pt; id: number; active: boolean; at: number } | null = null;
  private anims = new Set<Animation>();
  /** a piece released by a drag, still sitting under the finger */
  private dropped = -1;
  private pressTimer = 0;

  constructor(private handlers: BoardHandlers, opts: Partial<ViewOpts> = {}) {
    this.opts = { viewer: 0, rotOf: () => 0, numbers: true, ...opts };
    this.el = document.createElement('div');
    this.el.className = 'mc-board';
    this.boardHost = document.createElement('div');
    this.hl = document.createElementNS(SVGNS, 'svg');
    this.hl.setAttribute('class', 'mc-hl');
    this.hlLast = document.createElementNS(SVGNS, 'g');
    this.hlDest = document.createElementNS(SVGNS, 'g');
    this.hlPath = document.createElementNS(SVGNS, 'g');
    this.hlCoach = document.createElementNS(SVGNS, 'g');
    this.hlGoal = document.createElementNS(SVGNS, 'g');
    this.hl.append(this.hlGoal, this.hlLast, this.hlPath, this.hlDest, this.hlCoach);
    this.hlTop = document.createElementNS(SVGNS, 'svg');
    this.hlTop.setAttribute('class', 'mc-hl mc-hl-top');
    this.hlHint = document.createElementNS(SVGNS, 'g');
    this.piecesLayer = document.createElement('div');
    this.piecesLayer.className = 'mc-pieces';
    this.fxLayer = document.createElement('div');
    this.fxLayer.className = 'mc-fx';
    this.hit = document.createElement('div');
    this.hit.className = 'mc-hit';
    this.hit.dataset.testid = 'board-hit';
    this.el.append(this.boardHost, this.hl, this.piecesLayer, this.hlTop, this.fxLayer, this.hit);
    this.bindInput();
  }

  private badges = new Map<number, string>();
  private tags = new Map<number, string>();
  /** 参谋笔记 badge (public knowledge only) — html of the pill or null */
  setBadge(pid: number, html: string | null): void {
    if (html) this.badges.set(pid, html);
    else this.badges.delete(pid);
    this.decorate(pid);
  }
  clearBadges(): void {
    const ids = [...this.badges.keys()];
    this.badges.clear();
    for (const p of ids) this.decorate(p);
  }
  /** 侦察便签 flag (the child's own guess) */
  setTag(pid: number, html: string | null): void {
    if (html) this.tags.set(pid, html);
    else this.tags.delete(pid);
    this.decorate(pid);
  }
  private decorate(pid: number): void {
    const el = this.pieceEl(pid);
    if (!el) return;
    el.querySelector('.mc-badge')?.remove();
    el.querySelector('.mc-tag')?.remove();
    const b = this.badges.get(pid), t = this.tags.get(pid);
    if (b) el.insertAdjacentHTML('beforeend', `<span class="mc-badge" data-testid="badge">${b}</span>`);
    if (t) el.insertAdjacentHTML('beforeend', `<span class="mc-tag" data-testid="tag">${t}</span>`);
  }

  /** puzzle goal marks: gold stars on reach targets, reticles on capture targets, a pennant over a flag */
  setGoalMarks(marks: Array<{ at: number; kind: 'star' | 'reticle' | 'pennant' }>): void {
    this.hlGoal.replaceChildren();
    for (const m of marks) {
      const c = this.local(m.at);
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', `mc-goal mc-goal--${m.kind}`);
      g.dataset.at = String(m.at);
      if (m.kind === 'star') {
        const r = 22, ri = 9.5;
        let d = '';
        for (let k = 0; k < 10; k++) {
          const ang = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 ? ri : r;
          d += `${k ? 'L' : 'M'}${f(c.x + Math.cos(ang) * rr)} ${f(c.y + Math.sin(ang) * rr)}`;
        }
        g.innerHTML = `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="27" fill="rgba(246,185,52,.22)"/><path d="${d}Z" fill="#f6c548" stroke="#a8730f" stroke-width="2" stroke-linejoin="round"/>`;
      } else if (m.kind === 'reticle') {
        const t = this.g.tile;
        const rx = t.w / 2 + 7, ry = t.h / 2 + 7;
        g.innerHTML = `<rect x="${f(c.x - rx)}" y="${f(c.y - ry)}" width="${f(rx * 2)}" height="${f(ry * 2)}" rx="14" fill="none" stroke="#f6c548" stroke-width="3.5" stroke-dasharray="14 8"/>`;
      } else {
        const t = this.g.tile;
        const top = c.y - t.h / 2 - 4;
        g.innerHTML = `<g transform="translate(${f(c.x + t.w / 2 - 14)} ${f(top - 22)})"><path d="M0 0v26" stroke="#5e3a1c" stroke-width="2.6" stroke-linecap="round"/><path d="M1.5 1h17l-5 6 5 6h-17z" fill="#f6c548" stroke="#a8730f" stroke-width="1.4"/></g>`;
      }
      this.hlGoal.appendChild(g);
    }
  }

  /** H2: gold dashed arrow along the real path of a move */
  showHintArrow(path: number[]): void {
    this.clearHintArrow();
    if (path.length < 2) return;
    if (!this.hlHint.isConnected) this.hlTop.appendChild(this.hlHint);
    const pts = path.map((i) => this.local(i));
    const b = pts[pts.length - 1], prev = pts[pts.length - 2];
    const ang = Math.atan2(b.y - prev.y, b.x - prev.x);
    const tile = this.g.tile;
    const back = Math.min(tile.w, tile.h) / 2 + 4;
    const tip = { x: b.x - Math.cos(ang) * back, y: b.y - Math.sin(ang) * back };
    const line = [...pts.slice(0, -1), tip];
    const d0 = line.map((q, k) => `${k ? 'L' : 'M'}${f(q.x)} ${f(q.y)}`).join('');
    const head = `M${f(tip.x + Math.cos(ang) * 6)} ${f(tip.y + Math.sin(ang) * 6)}L${f(tip.x - Math.cos(ang - 0.55) * 20)} ${f(tip.y - Math.sin(ang - 0.55) * 20)}L${f(tip.x - Math.cos(ang + 0.55) * 20)} ${f(tip.y - Math.sin(ang + 0.55) * 20)}Z`;
    this.hlHint.innerHTML = `<path class="mc-hint-arrow" d="${d0}"/><path class="mc-hint-head" d="${head}"/>`;
    this.hlHint.dataset.testid = 'hint-arrow';
    this.hlHint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d(220), fill: 'forwards' });
  }
  clearHintArrow(): void {
    this.hlHint.replaceChildren();
  }

  setOpts(o: Partial<ViewOpts>): void {
    this.opts = { ...this.opts, ...o };
    if (this.state) this.render(this.state, true);
  }
  get viewOpts(): ViewOpts {
    return this.opts;
  }

  /** (re)build for a geometry — orientation change: finish animations, rebuild svg, move pieces instantly */
  setGeom(g: BoardGeom): void {
    this.finishAll();
    this.cancelDrag();
    this.g = g;
    Object.assign(this.el.style, { left: `${g.rect.x}px`, top: `${g.rect.y}px`, width: `${g.rect.w}px`, height: `${g.rect.h}px` });
    this.boardHost.innerHTML = cachedBoardSvg(g);
    for (const e of [this.hl, this.hlTop]) {
      e.setAttribute('width', String(g.rect.w));
      e.setAttribute('height', String(g.rect.h));
      e.setAttribute('viewBox', `0 0 ${g.rect.w} ${g.rect.h}`);
    }
    Object.assign(this.hit.style, { width: `${g.rect.w}px`, height: `${g.rect.h}px` });
    this.clearHighlights();
    this.clearLastMove();
    if (this.state) this.render(this.state, true);
  }

  local(i: number): Pt {
    return stationLocal(this.g, i);
  }

  // ------------------------------------------------------------------ pieces
  faceOf(s: GameState, pid: number): Face {
    if (s.mode === 'fan') return s.pup[pid] ? 'up' : 'fan';
    if (s.mode === 'ming' || this.opts.viewer < 0) return 'up';
    if (s.pside[pid] === this.opts.viewer) return 'up';
    if (s.ptype[pid] === FLAG && s.flagShown[s.pside[pid]]) return 'up';
    return 'back';
  }

  private pieceKey(s: GameState, pid: number): string {
    const face = this.faceOf(s, pid);
    // a hidden enemy piece's markup must not depend on its type (no leak in the DOM)
    const type = face === 'up' ? s.ptype[pid] : -1;
    return `${this.g.tile.shape}|${s.pside[pid]}|${type}|${face}|${this.opts.numbers ? 1 : 0}|${face === 'up' ? this.opts.rotOf(pid) : 0}`;
  }

  private paint(pe: PieceEl, s: GameState, pid: number): void {
    const key = this.pieceKey(s, pid);
    if (pe.key === key) return;
    pe.key = key;
    const face = this.faceOf(s, pid);
    const side = s.pside[pid];
    const visible = face === 'up';
    pe.el.innerHTML =
      tileSvg({ side, type: visible ? s.ptype[pid] : 0, shape: this.g.tile.shape, face, numbers: this.opts.numbers, rot: this.opts.rotOf(pid) }) +
      `<i class="mc-sel"></i>${mcIcon('lock', 'mc-lock')}<b class="mc-q">?</b>`;
    pe.el.dataset.side = face === 'fan' ? 'hidden' : String(side);
    if (visible) pe.el.dataset.type = String(s.ptype[pid]);
    else delete pe.el.dataset.type;
    pe.el.dataset.face = face;
    if (this.badges.has(pid) || this.tags.has(pid)) queueMicrotask(() => this.decorate(pid));
  }

  private placeEl(el: HTMLElement, i: number, lift = 0): void {
    const p = this.local(i);
    const t = TILE[this.g.tile.shape];
    el.style.transform = `translate3d(${f(p.x - t.w / 2 - PAD)}px, ${f(p.y - t.h / 2 - PAD - lift)}px, 0)`;
  }
  private xyOf(i: number): string {
    const p = this.local(i);
    const t = TILE[this.g.tile.shape];
    return `translate3d(${f(p.x - t.w / 2 - PAD)}px, ${f(p.y - t.h / 2 - PAD)}px, 0)`;
  }

  /** sync every piece element with the state (no animation) */
  render(s: GameState, force = false): void {
    this.state = s;
    if (force) for (const pe of this.pieces.values()) pe.key = '';
    for (let pid = 0; pid < s.np; pid++) {
      let pe = this.pieces.get(pid);
      if (!s.palive[pid]) {
        if (pe) {
          pe.el.remove();
          this.pieces.delete(pid);
        }
        continue;
      }
      if (!pe) {
        const el = document.createElement('div');
        el.className = 'mc-piece';
        el.dataset.pid = String(pid);
        pe = { el, key: '', pos: -1 };
        this.pieces.set(pid, pe);
        this.piecesLayer.appendChild(el);
      }
      this.paint(pe, s, pid);
      pe.pos = s.ppos[pid];
      pe.el.style.zIndex = String(10 + Math.floor(stationLocal(this.g, pe.pos).y / 10));
      this.placeEl(pe.el, pe.pos);
      pe.el.classList.toggle('is-flagshown', s.ptype[pid] === FLAG && s.flagShown[s.pside[pid]] && this.faceOf(s, pid) === 'up');
    }
    for (const [pid, pe] of this.pieces) {
      if (pid >= s.np) {
        pe.el.remove();
        this.pieces.delete(pid);
      }
    }
  }

  pieceEl(pid: number): HTMLDivElement | null {
    return this.pieces.get(pid)?.el ?? null;
  }

  setLifted(pid: number, on: boolean): void {
    const el = this.pieceEl(pid);
    if (!el) return;
    el.classList.toggle('is-lifted', on);
    el.style.zIndex = on ? '200' : String(10 + Math.floor(stationLocal(this.g, this.pieces.get(pid)!.pos).y / 10));
  }

  /** small "no" shake + optional lock / ? badge */
  async deny(pid: number, badge: 'lock' | 'q' | null = null): Promise<void> {
    const el = this.pieceEl(pid);
    if (!el) return;
    if (badge === 'lock') el.classList.add('show-lock');
    if (badge === 'q') el.classList.add('show-q');
    const tile = el.firstElementChild as SVGElement;
    await run(tile, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: d(260), easing: 'ease-out', fill: 'none' });
    setTimeout(() => el.classList.remove('show-lock', 'show-q'), d(1200));
  }

  // ------------------------------------------------------------------ highlights
  clearHighlights(): void {
    this.hlDest.replaceChildren();
    this.hlPath.replaceChildren();
    this.hlTop.replaceChildren();
  }

  /** destinations of a selected piece: rings on empty stations, crossed swords on targets, rail network in gold */
  showMoves(moves: Move[]): void {
    this.clearHighlights();
    const tile = this.g.tile;
    const railEdges = new Set<string>();
    for (const m of moves) {
      if (m.path.length > 2 || (m.path.length === 2 && isRail(m.path[0]) && isRail(m.path[1]) && isRailEdge(m.path[0], m.path[1]))) {
        for (let k = 0; k + 1 < m.path.length; k++) {
          const a = Math.min(m.path[k], m.path[k + 1]), b = Math.max(m.path[k], m.path[k + 1]);
          railEdges.add(`${a}-${b}`);
        }
      }
    }
    if (railEdges.size) {
      let dpath = '';
      for (const e of railEdges) {
        const [a, b] = e.split('-').map(Number);
        const pa = this.local(a), pb = this.local(b);
        dpath += `M${f(pa.x)} ${f(pa.y)}L${f(pb.x)} ${f(pb.y)}`;
      }
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', dpath);
      p.setAttribute('class', 'mc-path');
      p.setAttribute('opacity', '.55');
      this.hlPath.appendChild(p);
      p.animate([{ opacity: 0 }, { opacity: 0.55 }], { duration: d(MS.destAppear), fill: 'forwards' });
    }
    const from = moves[0]?.from ?? -1;
    moves.forEach((m) => {
      const c = this.local(m.to);
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', m.kind === 'attack' ? 'mc-atk-g' : 'mc-dest-g');
      g.dataset.to = String(m.to);
      if (m.kind === 'attack') {
        const rx = tile.w / 2 + 3, ry = tile.h / 2 + 3;
        g.innerHTML = `<rect x="${f(c.x - rx)}" y="${f(c.y - ry - 3)}" width="${f(rx * 2)}" height="${f(ry * 2)}" rx="12" fill="rgba(244,150,40,.16)" stroke="#f3a43c" stroke-width="3.5" stroke-dasharray="9 5"/>` +
          `<g transform="translate(${f(c.x + tile.w / 2 - 6)} ${f(c.y - tile.h / 2 - 8)})"><circle r="15" fill="#f3a43c" stroke="#fff" stroke-width="2"/><g transform="translate(-10 -10) scale(.625)" color="#fff">${mcIcon('swords').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></g>`;
      } else {
        g.innerHTML = `<circle class="mc-dest-in" cx="${f(c.x)}" cy="${f(c.y)}" r="15"/><circle class="mc-dest" cx="${f(c.x)}" cy="${f(c.y)}" r="15"/>`;
      }
      (m.kind === 'attack' ? this.hlTop : this.hlDest).appendChild(g);
      const dist = from >= 0 ? Math.max(1, m.path.length - 1) : 1;
      g.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], {
        duration: d(MS.destAppear),
        delay: d(MS.destStagger * dist),
        easing: 'ease-out',
        fill: 'backwards',
      }).onfinish = null;
      g.style.transformOrigin = `${f(c.x)}px ${f(c.y)}px`;
      g.style.transformBox = 'view-box';
    });
  }

  /** gold path along a move (preview while animating / hint) */
  flashPath(path: number[], ms = 600): void {
    if (path.length < 2) return;
    const pts = path.map((i) => this.local(i));
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', pts.map((q, k) => `${k ? 'L' : 'M'}${f(q.x)} ${f(q.y)}`).join(''));
    p.setAttribute('class', 'mc-path');
    this.hlPath.appendChild(p);
    const a = p.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.2 }, { opacity: 0.95, offset: 0.75 }, { opacity: 0 }], { duration: d(ms), fill: 'forwards' });
    a.onfinish = () => p.remove();
  }

  /** the opponent's last move: faint ring at the start, white arrow to the end */
  showLastMove(path: number[]): void {
    this.clearLastMove();
    if (path.length < 2) return;
    const pts = path.map((i) => this.local(i));
    const a = pts[0], b = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const ang = Math.atan2(b.y - prev.y, b.x - prev.x);
    const tile = this.g.tile;
    const back = Math.min(tile.w, tile.h) / 2 + 2;
    const tip = { x: b.x - Math.cos(ang) * back, y: b.y - Math.sin(ang) * back };
    const line = [...pts.slice(0, -1), tip];
    const dpath = line.map((q, k) => `${k ? 'L' : 'M'}${f(q.x)} ${f(q.y)}`).join('');
    const head = `M${f(tip.x + Math.cos(ang) * 4)} ${f(tip.y + Math.sin(ang) * 4)}L${f(tip.x - Math.cos(ang - 0.6) * 15)} ${f(tip.y - Math.sin(ang - 0.6) * 15)}L${f(tip.x - Math.cos(ang + 0.6) * 15)} ${f(tip.y - Math.sin(ang + 0.6) * 15)}Z`;
    this.hlLast.innerHTML = `<circle class="mc-last-from" cx="${f(a.x)}" cy="${f(a.y)}" r="${Math.min(tile.w, tile.h) / 2}"/><path class="mc-last-arrow" d="${dpath}"/><path class="mc-last-head" d="${head}"/>`;
    this.hlLast.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d(MS.lastArrow), fill: 'forwards' });
  }
  clearLastMove(): void {
    this.hlLast.replaceChildren();
  }

  /** amber pulse ring on stations (coach / tutorial highlight) */
  pulse(stations: number[], times = 2): void {
    this.hlCoach.replaceChildren();
    for (const i of stations) {
      const c = this.local(i);
      const r = Math.max(this.g.tile.w, this.g.tile.h) / 2 + 4;
      const ring = document.createElementNS(SVGNS, 'circle');
      ring.setAttribute('cx', f(c.x));
      ring.setAttribute('cy', f(c.y));
      ring.setAttribute('r', f(r));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#f6b934');
      ring.setAttribute('stroke-width', '4');
      this.hlCoach.appendChild(ring);
      ring.animate([{ opacity: 0.2, strokeWidth: '8' }, { opacity: 1, strokeWidth: '4' }, { opacity: 0.2, strokeWidth: '8' }], { duration: d(1200), iterations: times }).onfinish = () => ring.remove();
    }
  }

  /** strong gold glow ABOVE the pieces (a face-down tile the hint says to flip) + a little hop of the tile */
  pulseTop(stations: number[], times = 3): void {
    const grp = document.createElementNS(SVGNS, 'g');
    grp.dataset.testid = 'hint-glow';
    this.hlTop.appendChild(grp);
    const t = this.g.tile;
    for (const i of stations) {
      const c = this.local(i);
      const w = t.w + 10, h = t.h + 10;
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', f(c.x - w / 2));
      r.setAttribute('y', f(c.y - h / 2));
      r.setAttribute('width', f(w));
      r.setAttribute('height', f(h));
      r.setAttribute('rx', '9');
      r.setAttribute('fill', 'rgba(255,214,90,.28)');
      r.setAttribute('stroke', '#ffc93a');
      r.setAttribute('stroke-width', '5');
      grp.appendChild(r);
      const pid = this.state ? this.state.board[i] : -1;
      const el = pid >= 0 ? this.pieceEl(pid) : null;
      if (el) {
        el.animate([{ translate: '0 0' }, { translate: '0 -6px' }, { translate: '0 0' }], { duration: d(600), iterations: times, easing: 'ease-in-out' });
      }
    }
    grp.animate([{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.35 }], { duration: d(1200), iterations: times }).onfinish = () => grp.remove();
  }

  // ------------------------------------------------------------------ animations
  private track(a: Animation): Animation {
    this.anims.add(a);
    a.addEventListener('finish', () => this.anims.delete(a));
    a.addEventListener('cancel', () => this.anims.delete(a));
    return a;
  }
  /** jump every running animation to its end (rotation, page hidden) */
  finishAll(): void {
    for (const a of [...this.anims]) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
    this.anims.clear();
  }

  /** move a piece element along stations; rail moves click per station */
  async moveAlong(pid: number, path: number[], o: { rail: boolean; stopShort?: number; onStation?: (k: number) => void } = { rail: false }): Promise<void> {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    pe.el.style.zIndex = '200';
    const n = path.length - 1;
    const total = o.rail ? dm(railDuration(n)) : dm(MS.road);
    const frames: Keyframe[] = path.map((i, k) => ({ transform: this.xyOf(i), offset: n ? k / n : 1 }));
    if (o.stopShort !== undefined && path.length >= 2) {
      // collision approach: end at 70 % of the last segment
      const a = this.local(path[n - 1]), b = this.local(path[n]);
      const t = TILE[this.g.tile.shape];
      const x = a.x + (b.x - a.x) * o.stopShort, y = a.y + (b.y - a.y) * o.stopShort;
      frames[n] = { transform: `translate3d(${f(x - t.w / 2 - PAD)}px, ${f(y - t.h / 2 - PAD)}px, 0)`, offset: 1 };
    }
    const anim = this.track(pe.el.animate(frames, { duration: total, easing: o.rail ? EASE.inOut : EASE.road, fill: 'forwards' }));
    if (o.onStation && n > 1) {
      for (let k = 1; k <= n; k++) setTimeout(() => o.onStation!(k), (total * k) / n);
    }
    await anim.finished.catch(() => undefined);
    anim.cancel();
    if (o.stopShort === undefined) {
      pe.pos = path[n];
      this.placeEl(pe.el, pe.pos);
    } else {
      pe.el.style.transform = String(frames[n].transform);
    }
  }

  /** settle a piece onto a station after an approach */
  async settle(pid: number, at: number): Promise<void> {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    const from = pe.el.style.transform;
    const anim = this.track(pe.el.animate([{ transform: from }, { transform: this.xyOf(at) }], { duration: dm(MS.winnerSettle), easing: EASE.back }));
    await anim.finished.catch(() => undefined);
    pe.pos = at;
    this.placeEl(pe.el, at);
  }

  /** a piece leaves: tips over and shrinks toward `toward` (tray), or just fades */
  async remove(pid: number, toward?: Pt): Promise<void> {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    const tile = pe.el.firstElementChild as SVGElement;
    const from = pe.el.style.transform;
    const p = this.local(pe.pos);
    const dx = toward ? toward.x - p.x : 0, dy = toward ? toward.y - p.y : 40;
    const a1 = this.track(tile.animate([{ transform: 'perspective(300px) rotateX(0) scale(1)', opacity: 1 }, { transform: 'perspective(300px) rotateX(70deg) scale(.6)', opacity: 0.0 }], { duration: dm(MS.loserOut), easing: EASE.in, fill: 'forwards' }));
    const a2 = this.track(pe.el.animate([{ transform: from }, { transform: `${from} translate(${f(dx * 0.35)}px, ${f(dy * 0.35)}px)` }], { duration: dm(MS.loserOut), easing: EASE.in, fill: 'forwards' }));
    await Promise.all([a1.finished.catch(() => undefined), a2.finished.catch(() => undefined)]);
    pe.el.remove();
    this.pieces.delete(pid);
  }

  /** turn a tile over (翻翻棋 flip / reveal): rotateY 0→90 swap face 90→0 */
  async flip(pid: number, s: GameState): Promise<void> {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    const half = dm(MS.flip) / 2;
    const tile = () => pe.el.firstElementChild as SVGElement;
    await this.track(tile().animate([{ transform: 'perspective(400px) rotateY(0)' }, { transform: 'perspective(400px) rotateY(90deg)' }], { duration: half, easing: 'ease-in', fill: 'forwards' })).finished.catch(() => undefined);
    this.paint(pe, s, pid);
    await this.track(tile().animate([{ transform: 'perspective(400px) rotateY(-90deg)' }, { transform: 'perspective(400px) rotateY(0)' }], { duration: half, easing: 'ease-out' })).finished.catch(() => undefined);
  }

  /** two tiles shake toward each other (clash) */
  async clash(a: number, b: number): Promise<void> {
    const els = [this.pieceEl(a), this.pieceEl(b)].filter(Boolean) as HTMLDivElement[];
    await Promise.all(els.map((el, k) => this.track((el.firstElementChild as SVGElement).animate(
      [{ transform: 'translate(0,0)' }, { transform: `translate(${k ? -4 : 4}px, 0)` }, { transform: 'translate(0,0)' }, { transform: `translate(${k ? -4 : 4}px, 0)` }, { transform: 'translate(0,0)' }],
      { duration: d(MS.clash) },
    )).finished.catch(() => undefined)));
  }

  /** board shake (bomb 6 px / mine 3 px) */
  async shake(px: number, ms: number): Promise<void> {
    if (px <= 0) return;
    await this.track(this.el.animate(
      [{ transform: 'translate(0,0)' }, { transform: `translate(${px}px, ${-px / 2}px)` }, { transform: `translate(${-px}px, ${px / 2}px)` }, { transform: `translate(${px / 2}px, ${px}px)` }, { transform: 'translate(0,0)' }],
      { duration: d(ms) },
    )).finished.catch(() => undefined);
  }

  /** gold sweep on the winner */
  async gleam(pid: number): Promise<void> {
    const el = this.pieceEl(pid);
    if (!el) return;
    await this.track((el.firstElementChild as SVGElement).animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.45) drop-shadow(0 0 6px #ffd56b)' }, { filter: 'brightness(1)' }], { duration: d(MS.winnerSettle + 120) })).finished.catch(() => undefined);
  }

  /** move a piece element instantly (deployment swaps use their own arcs) */
  snapTo(pid: number, at: number): void {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    pe.pos = at;
    this.placeEl(pe.el, at);
  }

  /** arc a piece element to a station (swap / layout change) */
  async arcTo(pid: number, at: number, ms: number, lift = 30): Promise<void> {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    const from = pe.el.style.transform;
    const a = this.local(pe.pos), b = this.local(at);
    const t = TILE[this.g.tile.shape];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - lift;
    const mid = `translate3d(${f(mx - t.w / 2 - PAD)}px, ${f(my - t.h / 2 - PAD)}px, 0)`;
    pe.el.style.zIndex = '150';
    const anim = this.track(pe.el.animate([{ transform: from }, { transform: mid }, { transform: this.xyOf(at) }], { duration: dm(ms), easing: EASE.inOut, fill: 'forwards' }));
    await anim.finished.catch(() => undefined);
    pe.pos = at;
    this.placeEl(pe.el, at);
    anim.cancel();
    pe.el.style.zIndex = String(10 + Math.floor(b.y / 10));
  }

  // ------------------------------------------------------------------ input
  private toLocal(ev: PointerEvent): Pt {
    const r = this.el.getBoundingClientRect();
    const k = r.width / this.g.rect.w || 1;
    return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k };
  }

  private bindInput(): void {
    const el = this.hit;
    el.addEventListener('pointerdown', (ev) => {
      if (this.drag || !ev.isPrimary) return;
      this.handlers.onTouch?.();
      const p = this.toLocal(ev);
      const at = stationAt(this.g, p.x + this.g.rect.x, p.y + this.g.rect.y);
      const pid = at >= 0 && this.state ? this.state.board[at] : -1;
      this.drag = { pid: pid >= 0 && this.handlers.canDrag(pid) ? pid : -1, start: p, id: ev.pointerId, active: false, at };
      clearTimeout(this.pressTimer);
      if (this.handlers.onLongPress && at >= 0) {
        const id = ev.pointerId;
        this.pressTimer = window.setTimeout(() => {
          const dr = this.drag;
          if (!dr || dr.id !== id || dr.active) return;
          this.drag = null;
          this.handlers.onLongPress!(at);
        }, 520);
      }
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* synthetic events */
      }
    });
    el.addEventListener('pointermove', (ev) => {
      const dr = this.drag;
      if (!dr || ev.pointerId !== dr.id) return;
      const p = this.toLocal(ev);
      if (Math.hypot(p.x - dr.start.x, p.y - dr.start.y) > 10) clearTimeout(this.pressTimer);
      if (dr.pid < 0) return;
      if (!dr.active && Math.hypot(p.x - dr.start.x, p.y - dr.start.y) > 8) {
        clearTimeout(this.pressTimer);
        dr.active = true;
        this.setLifted(dr.pid, true);
      }
      if (dr.active) {
        const pe = this.pieces.get(dr.pid)!;
        const t = TILE[this.g.tile.shape];
        pe.el.style.transform = `translate3d(${f(p.x - t.w / 2 - PAD)}px, ${f(p.y - t.h / 2 - PAD - 10)}px, 0)`;
      }
    });
    const end = (ev: PointerEvent, cancelled: boolean): void => {
      clearTimeout(this.pressTimer);
      const dr = this.drag;
      if (!dr || ev.pointerId !== dr.id) return;
      this.drag = null;
      const p = this.toLocal(ev);
      if (!dr.active) {
        if (!cancelled && Math.hypot(p.x - dr.start.x, p.y - dr.start.y) <= 12) {
          const at = stationAt(this.g, p.x + this.g.rect.x, p.y + this.g.rect.y);
          if (at >= 0) this.handlers.onTap(at);
        }
        return;
      }
      const pe = this.pieces.get(dr.pid);
      const at = cancelled ? -1 : nearestStation(this.g, p.x + this.g.rect.x, p.y + this.g.rect.y, 60);
      if (pe && (at < 0 || at === pe.pos)) {
        void this.springBack(dr.pid);
        return;
      }
      if (at >= 0) {
        this.dropped = dr.pid;
        this.handlers.onDrop(dr.pid, at);
      }
    };
    el.addEventListener('pointerup', (ev) => end(ev, false));
    el.addEventListener('pointercancel', (ev) => end(ev, true));
  }

  /** a dragged piece returns to its station (illegal drop) */
  async springBack(pid: number): Promise<void> {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    const from = pe.el.style.transform;
    this.setLifted(pid, false);
    await this.track(pe.el.animate([{ transform: from }, { transform: this.xyOf(pe.pos) }], { duration: dm(MS.bounce), easing: EASE.spring })).finished.catch(() => undefined);
    this.placeEl(pe.el, pe.pos);
  }

  /** was this piece just dropped by a drag (so it should glide from the finger, not replay its path)? */
  takeDropped(pid: number): boolean {
    const was = this.dropped === pid;
    this.dropped = -1;
    if (was) this.setLifted(pid, false);
    return was;
  }

  /** glide a dragged piece from where the finger left it toward a station (fraction 1 = onto it) */
  async glideTo(pid: number, at: number, fraction = 1): Promise<void> {
    const pe = this.pieces.get(pid);
    if (!pe) return;
    const from = pe.el.style.transform;
    const p0 = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(from);
    const t = TILE[this.g.tile.shape];
    const c = this.local(at);
    const tx = c.x - t.w / 2 - PAD, ty = c.y - t.h / 2 - PAD;
    const x0 = p0 ? +p0[1] : tx, y0 = p0 ? +p0[2] : ty;
    const to = `translate3d(${f(x0 + (tx - x0) * fraction)}px, ${f(y0 + (ty - y0) * fraction)}px, 0)`;
    pe.el.style.zIndex = '200';
    const a = this.track(pe.el.animate([{ transform: from }, { transform: to }], { duration: dm(MS.snap), easing: EASE.spring, fill: 'forwards' }));
    await a.finished.catch(() => undefined);
    a.cancel();
    pe.el.style.transform = to;
    if (fraction === 1) {
      pe.pos = at;
      this.placeEl(pe.el, at);
    }
  }

  /** has a pending drag-drop been refused? spring back and forget it */
  dropRefused(pid: number): void {
    if (this.dropped === pid) this.dropped = -1;
  }

  cancelDrag(): void {
    if (!this.drag) return;
    const pid = this.drag.pid;
    this.drag = null;
    if (pid >= 0) void this.springBack(pid);
  }

  isDragging(): boolean {
    return !!this.drag?.active;
  }

  /** centre of a station in the board's local coordinates */
  center(i: number): Pt {
    return this.local(i);
  }

  destroy(): void {
    clearTimeout(this.pressTimer);
    this.finishAll();
    this.el.remove();
  }
}

export const ALL_STATIONS = Array.from({ length: N }, (_, i) => i);
