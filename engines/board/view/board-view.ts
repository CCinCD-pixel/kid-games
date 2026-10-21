// view/board-view.ts — SVG 棋盘 + DOM 棋子层 + 高亮 / 箭头 / 印章 + 动画（WAAPI，只动 transform/opacity）。
// 几何完全由游戏提供的 Geometry 驱动；主题提供静态棋盘 SVG 与棋子精灵（prepare + make）。
// 层次（静态层不重绘）：.bk-art（静态 SVG）→ .bk-marks（高亮）→ .bk-pieces（DOM 棋子）→ .bk-over（箭头）→ .bk-stamps（印章）。
import type { BoardView, BoardViewOptions, Disposable, GameRules, MarkKind, Orientation, Piece, Side, Sq, ViewEvent } from '../core/types';
import { createAnimQueue, ease, play, type JobHandle, type PlayHandle } from './anim';
import { planEffects, UNDO_MS, type PlanItem } from './effects';
import { Overlays } from './overlays';
import { PieceLayer, type PieceEntry } from './piece-layer';
import { flipOrientation } from './orientation';
import { ensureBoardStyles } from './styles';

export interface DragSurface {
  dragBegin(sq: Sq): boolean;
  dragMove(clientX: number, clientY: number): void;
  /** 结束拖动：返回棋子当前视觉中心（相对棋盘元素的像素，供 animateMove 的 fromPx） */
  dragEnd(): { x: number; y: number } | null;
  /** 取消拖动：棋子飞回原格 */
  dragCancel(): Promise<void>;
  liftPiece(sq: Sq | null): void;
  bump(sq: Sq): void;
  showPreview(sq: Sq | null): void;
  showFocus(sq: Sq | null): void;
  refreshRect(): void;
  /** 客户端坐标 → 棋盘 viewBox 坐标；cellPx = 一个设计单位对应的屏幕像素 × unit */
  localUnits(clientX: number, clientY: number): { x: number; y: number };
  readonly cellPx: number;
  readonly orientation: Orientation;
}
export interface BoardViewImpl<M, S> extends BoardView<M, S>, DragSurface {
  /** prepare 完成（字体就绪、位图烘焙）后 resolve；之前 setState 会被延后 */
  readonly ready: Promise<void>;
  readonly rules: GameRules<M, S>;
  setLastMove(from: Sq | null, to?: Sq): void;
  setTrayAnchor(side: Side, get: () => DOMRect | null): void;
  announce(text: string): void;
  clearMarks(kind: MarkKind): void;
  clearArrows(): void;
  pieceCount(): number;
  /** 测试 / 调试：当前棋子、标记与布局快照 */
  debug(): { pieces: { sq: Sq; side: number; type: number; x: number; y: number }[]; marks: { kind: MarkKind; sqs: Sq[] }[]; idle: boolean; scale: number; px: number; orientation: Orientation; pending: number };
  readonly reduced: boolean;
}

const DEFAULT_PIECE_SCALE = 0.86;
const dprNow = (): number => Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
const tr = (x: number, y: number, px: number, extra = ''): string => `translate3d(${x - px / 2}px,${y - px / 2}px,0)${extra ? ' ' + extra : ''}`;

class Timers {
  private items: { at: number; fn: () => void; h: ReturnType<typeof setTimeout> | null; done: boolean }[] = [];
  at(ms: number, fn: () => void): void {
    const it = { at: ms, fn, h: null as ReturnType<typeof setTimeout> | null, done: false };
    const run = (): void => { if (it.done) return; it.done = true; if (it.h !== null) clearTimeout(it.h); fn(); };
    it.fn = run; it.h = setTimeout(run, Math.max(0, ms)); this.items.push(it);
  }
  flush(): void { for (const it of [...this.items].sort((a, b) => a.at - b.at)) it.fn(); }
}

export function createBoardView<M, S>(host: HTMLElement, o: BoardViewOptions<M, S>): BoardViewImpl<M, S> {
  const doc = host.ownerDocument; ensureBoardStyles(doc);
  const { rules, theme } = o; const g = rules.geometry;
  let orient: Orientation = o.orientation; let state: S | null = null;
  let scale = 1; let px = 40; let boxW = g.viewBox.w, boxH = g.viewBox.h; let rectCache: DOMRect | null = null; let rectDirty = true;
  const pieceScale = Number.parseFloat(theme.tokens['--bk-piece-scale'] ?? '') || DEFAULT_PIECE_SCALE;
  const reducedNow = (): boolean => o.reducedMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const el = doc.createElement('div'); el.className = 'bk-board'; el.setAttribute('role', 'grid'); el.setAttribute('aria-label', `${rules.id} 棋盘`); el.tabIndex = 0; el.dataset.bkOrientation = orient;
  for (const [k, v] of Object.entries(theme.tokens)) if (k.startsWith('--')) el.style.setProperty(k, v);
  const art = doc.createElement('div'); art.className = 'bk-art'; el.appendChild(art);
  const overlays = new Overlays(el, g, orient, reducedNow);
  const layer = new PieceLayer(el, { sprites: theme.pieces, seat: o.seat, label: (sq, p) => `${theme.pieces.label(p)} ${g.name(sq)}` });
  overlays.attachTop();
  const live = doc.createElement('div'); live.className = 'bk-live'; live.setAttribute('aria-live', 'polite'); el.appendChild(live);
  host.appendChild(el);
  const mountArt = (): void => { art.replaceChildren(theme.boardArt(g, orient)); };
  mountArt(); overlays.showCoords(o.coords);

  const queue = createAnimQueue();
  const listeners = new Map<ViewEvent, Set<(e: { sq: Sq; piece?: Piece }) => void>>();
  const emit = (ev: ViewEvent, e: { sq: Sq; piece?: Piece }): void => { for (const cb of [...(listeners.get(ev) ?? [])]) { try { cb(e); } catch (err) { console.warn('[board] listener', err); } } };
  const trayGetters: [() => DOMRect | null, () => DOMRect | null] = [() => null, () => null];

  const centerUnits = (sq: Sq): { x: number; y: number } => g.center(sq, orient);
  const centerPx = (sq: Sq): { x: number; y: number } => { const c = centerUnits(sq); return { x: c.x * scale, y: c.y * scale }; };
  const getRect = (): DOMRect => { if (!rectCache || rectDirty) { rectCache = el.getBoundingClientRect(); rectDirty = false; } return rectCache; };
  const markDirty = (): void => { rectDirty = true; };
  if (typeof window !== 'undefined') { window.addEventListener('scroll', markDirty, { passive: true, capture: true }); window.addEventListener('resize', markDirty, { passive: true }); }

  // ───────── prepare / ready（字体就绪后烘焙；resize 防抖 120 ms）─────────
  let preparedPx = 0; let prepareTimer: ReturnType<typeof setTimeout> | null = null; let readyRes!: () => void;
  const ready = new Promise<void>((r) => (readyRes = r)); let isReady = false; let pendingApply: (() => void) | null = null; let epoch = 0;
  const rebake = (): void => {
    const want = px; const my = ++epoch;
    void theme.pieces.prepare(want, dprNow()).then(() => {
      if (my !== epoch) return; preparedPx = want;
      if (isReady) layer.remake(want); else { isReady = true; if (pendingApply) { const f = pendingApply; pendingApply = null; f(); } readyRes(); }
    }, (err) => { console.warn('[board] prepare failed', err); if (!isReady) { isReady = true; readyRes(); } });
  };

  // ───────── 状态 ─────────
  const applyState = (s: S): void => {
    layer.clear();
    for (let sq = 0; sq < g.squares; sq++) { const p = rules.pieceAt(s, sq); if (p) { const c = centerPx(sq); layer.put(sq, p, c.x, c.y); } }
  };
  let lastSqs: [Sq, Sq] | null = null; let lastMark: Disposable | null = null;
  const setLast = (from: Sq | null, to?: Sq): void => { lastMark?.dispose(); lastMark = null; lastSqs = from === null || to === undefined ? null : [from, to]; if (lastSqs) lastMark = overlays.mark('last', lastSqs, { id: 'last' }); };

  // ───────── 拖动 ─────────
  let drag: { e: PieceEntry; x: number; y: number } | null = null; let pendingDrop: { x: number; y: number; sq: Sq; t: number } | null = null; let liftedEntry: PieceEntry | null = null;
  const unlift = (): void => { if (liftedEntry) { liftedEntry.wrap.classList.remove('is-lifted'); liftedEntry = null; } };

  // ───────── 动画任务 ─────────
  function startMoveJob(m: M, before: S, opt: { fromPx?: { x: number; y: number }; speed?: number }): JobHandle {
    const eff = rules.effects(before, m); const info = rules.moveInfo(before, m); const reduced = reducedNow();
    unlift();
    const fromPx = opt.fromPx ?? (pendingDrop && pendingDrop.sq === info.from && Date.now() - pendingDrop.t < 3000 ? pendingDrop : undefined); pendingDrop = null;
    const plan = planEffects(eff, { unit: g.unit * scale, center: centerPx, motion: theme.motion, speed: opt.speed, reduced, mainFrom: info.from });
    const timers = new Timers(); const handles: PlayHandle[] = []; let desync = false;
    const caps = plan.items.filter((i) => i.effect.k === 'capture'), moves = plan.items.filter((i) => i.effect.k === 'move'), promos = plan.items.filter((i) => i.effect.k === 'promote');
    // 模型变化：先吃 → 再走 → 后升变（语义与 phase 无关）
    const dying = caps.map((i) => ({ i, e: layer.take((i.effect as { sq: Sq }).sq) }));
    const moving = moves.map((i) => { const ef = i.effect as { from: Sq; to: Sq; piece: Piece; arc?: boolean }; const e = layer.take(ef.from); return { i, ef, e, from: e ? { x: e.x, y: e.y } : centerPx(ef.from) }; });
    for (const mv of moving) { const c = centerPx(mv.ef.to); if (mv.e) layer.place(mv.e, mv.ef.to, c.x, c.y); else { desync = true; mv.e = layer.put(mv.ef.to, mv.ef.piece, c.x, c.y); } }
    setLast(info.from, info.to);
    let lastLanding = 0;
    for (const mv of moving) {
      const { i, ef, e } = mv; if (!e) continue; const to = centerPx(ef.to), from = i.main && fromPx ? fromPx : mv.from;
      e.wrap.style.zIndex = '6';
      handles.push(play(e.wrap, [{ transform: tr(from.x, from.y, px) }, { transform: tr(to.x, to.y, px) }], { duration: i.durMs, delay: i.startMs, easing: ease.slide }));
      if (!reduced) {
        const squash = theme.motion.squash, lift = theme.motion.liftPx * scale / 1;
        const tail = squash[2], tot = i.durMs + tail;
        const kf: Keyframe[] = ef.arc
          ? [{ transform: 'translateY(0) scale(1)', offset: 0 }, { transform: `translateY(${-lift}px) scale(1.14)`, offset: (i.durMs * 0.5) / tot, easing: 'ease-in' }, { transform: 'translateY(0) scale(1)', offset: i.durMs / tot }, { transform: `scale(${squash[0]},${squash[1]})`, offset: (i.durMs + tail * 0.35) / tot }, { transform: 'scale(1)', offset: 1 }]
          : [{ transform: 'scale(1)', offset: 0 }, { transform: 'translateY(0) scale(1)', offset: i.durMs / tot }, { transform: `scale(${squash[0]},${squash[1]})`, offset: (i.durMs + tail * 0.35) / tot }, { transform: 'scale(1)', offset: 1 }];
        handles.push(play(e.sprite, kf, { duration: tot, delay: i.startMs, easing: 'linear' }));
      }
      lastLanding = Math.max(lastLanding, i.startMs + i.durMs);
      timers.at(i.startMs + i.durMs, () => { e.wrap.style.zIndex = ''; emit('landed', { sq: ef.to, piece: ef.piece }); });
    }
    if (moving.length > 1) timers.at(lastLanding, () => emit('castled', { sq: info.to, piece: info.piece }));
    for (const d of dying) {
      const e = d.e; const ef = d.i.effect as { sq: Sq; piece: Piece }; if (!e) { desync = true; continue; }
      e.wrap.style.zIndex = '2'; const c = { x: e.x, y: e.y }; let dx = 0, dy = 0;
      const tray = trayGetters[ef.piece.side](), br = getRect();
      if (tray && tray.width > 0) { dx = tray.left + tray.width / 2 - (br.left + c.x); dy = tray.top + tray.height / 2 - (br.top + c.y); const mag = Math.hypot(dx, dy), max = Math.max(br.width, br.height) * 1.2; if (mag > max) { dx *= max / mag; dy *= max / mag; } }
      const sc = reduced ? 1 : 0.5;
      handles.push(play(e.wrap, [{ transform: tr(c.x, c.y, px), opacity: 1 }, { transform: tr(c.x + dx, c.y + dy, px, `scale(${sc})`), opacity: 0 }], { duration: d.i.durMs, delay: d.i.startMs, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'both' }));
      timers.at(d.i.startMs, () => emit('captured', { sq: ef.sq, piece: ef.piece }));
      timers.at(d.i.startMs + d.i.durMs, () => layer.release(e));
    }
    for (const pr of promos) {
      const ef = pr.effect as { sq: Sq; from: Piece; to: Piece }; const e = layer.get(ef.sq); if (!e) { desync = true; continue; }
      if (!reduced) handles.push(play(e.sprite, [{ transform: 'scale(1)' }, { transform: 'scale(.55)', offset: 0.42 }, { transform: 'scale(1.2)', offset: 0.75 }, { transform: 'scale(1)' }], { duration: pr.durMs, delay: pr.startMs, easing: 'ease-in-out' }));
      timers.at(pr.startMs + pr.durMs * 0.42, () => { layer.setPiece(e, ef.to); emit('promoted', { sq: ef.sq, piece: ef.to }); });
    }
    const tail = reduced ? 0 : theme.motion.squash[2];
    let finished = false; let resolveDone!: () => void; const done = new Promise<void>((r) => (resolveDone = r));
    const finalize = (): void => {
      if (finished) return; finished = true; timers.flush();
      if (desync) { console.warn('[board] 视图与状态不同步，已按 apply() 重置'); applyState(rules.apply(before, m)); }
      resolveDone();
    };
    timers.at(plan.totalMs + tail + 12, finalize);
    return { done, finish() { for (const h of handles) h.finish(); finalize(); } };
  }

  function startUndoJob(m: M, _after: S, before: S): JobHandle {
    const eff = rules.effects(before, m); const reduced = reducedNow(); const dur = reduced ? 80 : UNDO_MS;
    unlift(); setLast(null);
    const timers = new Timers(); const handles: PlayHandle[] = []; let desync = false;
    // 逆序：升变换回 → 走子倒滑 → 被吃子复现
    for (const e of eff) if (e.k === 'promote') { const en = layer.get(e.sq); if (en) { layer.setPiece(en, e.from); handles.push(play(en.sprite, [{ transform: 'scale(.7)' }, { transform: 'scale(1)' }], { duration: dur, easing: 'ease-out' })); } else desync = true; }
    const mv = eff.filter((e) => e.k === 'move').map((e) => { const ef = e as { from: Sq; to: Sq; piece: Piece }; const en = layer.take(ef.to); return { ef, en, at: en ? { x: en.x, y: en.y } : centerPx(ef.to) }; });
    for (const x of mv) { const c = centerPx(x.ef.from); if (x.en) { layer.place(x.en, x.ef.from, c.x, c.y); x.en.wrap.style.zIndex = '6'; handles.push(play(x.en.wrap, [{ transform: tr(x.at.x, x.at.y, px) }, { transform: tr(c.x, c.y, px) }], { duration: dur, easing: ease.out })); timers.at(dur, () => { x.en!.wrap.style.zIndex = ''; }); } else { desync = true; layer.put(x.ef.from, x.ef.piece, c.x, c.y); } }
    for (const e of eff) if (e.k === 'capture') { const c = centerPx(e.sq); const en = layer.put(e.sq, e.piece, c.x, c.y); en.wrap.style.zIndex = '2'; handles.push(play(en.wrap, [{ transform: tr(c.x, c.y, px, 'scale(.6)'), opacity: 0 }, { transform: tr(c.x, c.y, px), opacity: 1 }], { duration: dur, delay: reduced ? 0 : 60, easing: ease.out })); timers.at(dur + 60, () => { en.wrap.style.zIndex = ''; }); }
    let finished = false; let resolveDone!: () => void; const done = new Promise<void>((r) => (resolveDone = r));
    const finalize = (): void => { if (finished) return; finished = true; timers.flush(); if (desync) applyState(before); resolveDone(); };
    timers.at(dur + 80, finalize);
    return { done, finish() { for (const h of handles) h.finish(); finalize(); } };
  }

  const view: BoardViewImpl<M, S> = {
    el, rules, get ready() { return ready; },
    get idle() { return queue.idle; },
    get reduced() { return reducedNow(); },
    get cellPx() { return g.unit * scale; },
    get orientation() { return orient; },
    layout(box) {
      view.finishAnimations();
      scale = Math.min(box.w / g.viewBox.w, box.h / g.viewBox.h);
      boxW = Math.max(1, Math.round(g.viewBox.w * scale)); boxH = Math.max(1, Math.round(g.viewBox.h * scale)); scale = boxW / g.viewBox.w;
      el.style.left = `${Math.round(box.x + (box.w - boxW) / 2)}px`; el.style.top = `${Math.round(box.y + (box.h - boxH) / 2)}px`; el.style.width = `${boxW}px`; el.style.height = `${boxH}px`;
      el.style.setProperty('--bk-cell', `${g.unit * scale}px`); el.style.setProperty('--bk-stamp-size', `${Math.max(22, Math.round(g.unit * scale * 0.5))}px`);
      px = Math.max(16, Math.round(g.unit * scale * pieceScale)); rectDirty = true;
      layer.reposition(px, centerPx);
      if (prepareTimer) clearTimeout(prepareTimer);
      if (!isReady && epoch === 0) rebake(); else if (px !== preparedPx) prepareTimer = setTimeout(rebake, 120);
    },
    setState(s, opt) {
      view.finishAnimations(); state = s; unlift(); pendingDrop = null; view.dragCancel().catch(() => undefined);
      const apply = (): void => { applyState(s); };
      if (isReady) apply(); else pendingApply = apply;
      if (opt && 'last' in opt) setLast(null);
    },
    mark: (kind, sqs, opt) => overlays.mark(kind, sqs, opt),
    arrow: (from, to, kind) => overlays.arrow(from, to, kind),
    async stamp(kind, at) {
      const text = theme.tokens[`stamp-${kind}`] ?? (kind === 'check' ? '将军' : kind === 'mate' ? '将死' : '困毙');
      const s = doc.createElement('div'); s.className = `bk-stamp is-${kind}`; s.textContent = text; overlays.stampsEl.appendChild(s);
      const c = centerPx(at); const w = s.offsetWidth || 90; const x = Math.min(Math.max(c.x, w / 2 + 4), boxW - w / 2 - 4); const y = Math.max(c.y - px * 0.95, 24);
      s.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      if (kind === 'check') emit('checked', { sq: at });
      const reduced = reducedNow(); const base = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      const h = play(s, reduced ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }] : [{ transform: `${base} scale(.4)`, opacity: 0 }, { transform: `${base} scale(1.14)`, opacity: 1, offset: 0.22 }, { transform: `${base} scale(1)`, opacity: 1, offset: 0.34 }, { transform: `${base} scale(1)`, opacity: 1, offset: 0.82 }, { transform: `${base} translateY(-10px) scale(.96)`, opacity: 0 }], { duration: reduced ? 900 : kind === 'check' ? 1100 : 1500, easing: 'ease-out' });
      await h.finished; s.remove();
    },
    async animateMove(m, before, opt = {}) { await ready; const after = rules.apply(before, m); state = after; return queue.enqueue({ start: () => startMoveJob(m, before, opt) }); },
    async animateUndo(m, after, before) { await ready; state = before; return queue.enqueue({ start: () => startUndoJob(m, after, before) }); },
    finishAnimations() { queue.finishAll(); },
    setOrientation(next, animate = false) {
      if (next === orient) return; view.finishAnimations(); const old = layer.entries().map((e) => ({ e, x: e.x, y: e.y }));
      orient = next; el.dataset.bkOrientation = orient; mountArt(); overlays.setOrientation(orient); overlays.redrawAll(); layer.relayout(centerPx);
      if (animate && !reducedNow()) for (const { e, x, y } of old) play(e.wrap, [{ transform: tr(x, y, px) }, { transform: tr(e.x, e.y, px) }], { duration: 340, easing: ease.inOut });
    },
    rect(sq) { const r = getRect(), c = centerPx(sq), cell = g.unit * scale; return new DOMRect(r.left + c.x - cell / 2, r.top + c.y - cell / 2, cell, cell); },
    hitTest(cx, cy) { const p = view.localUnits(cx, cy); return g.hit(p.x, p.y, orient); },
    trayAnchor(side) {
      const t = trayGetters[side](); if (t) return t; const r = getRect(); const atBottom = (side === 0) === (orient === 'first-bottom');
      return new DOMRect(r.left + r.width / 2, atBottom ? r.bottom : r.top, 0, 0);
    },
    setPieceRotation(mode) { layer.setRotationMode(mode); },
    on(ev, cb) { let set = listeners.get(ev); if (!set) listeners.set(ev, (set = new Set())); set.add(cb); return { dispose: () => set!.delete(cb) }; },
    destroy() {
      view.finishAnimations(); if (prepareTimer) clearTimeout(prepareTimer); epoch++; lastMark?.dispose();
      if (typeof window !== 'undefined') { window.removeEventListener('scroll', markDirty, true); window.removeEventListener('resize', markDirty); }
      layer.destroy(); overlays.destroy(); el.remove(); listeners.clear(); void state;
    },
    // ── 扩展 ──
    localUnits(cx, cy) { const r = getRect(); return { x: (cx - r.left) / scale, y: (cy - r.top) / scale }; },
    refreshRect() { rectDirty = true; getRect(); },
    setLastMove: setLast,
    setTrayAnchor(side, get) { trayGetters[side] = get; },
    announce(text) { live.textContent = text; },
    clearMarks(kind) { overlays.clearKind(kind); },
    clearArrows() { overlays.clearArrows(); },
    pieceCount: () => layer.liveCount,
    liftPiece(sq) { unlift(); if (sq === null) return; const e = layer.get(sq); if (!e) return; e.wrap.classList.add('is-lifted'); liftedEntry = e; emit('lift', { sq, piece: e.piece }); },
    bump(sq) {
      const e = layer.get(sq); emit('bump', { sq, piece: e?.piece }); if (!e || reducedNow()) return;
      play(e.sprite, [{ transform: 'translateX(0)' }, { transform: `translateX(${-px * 0.07}px)` }, { transform: `translateX(${px * 0.06}px)` }, { transform: `translateX(${-px * 0.03}px)` }, { transform: 'translateX(0)' }], { duration: 220, easing: 'ease-out' });
    },
    showPreview: (sq) => overlays.showPreview(sq),
    showFocus: (sq) => overlays.showFocus(sq),
    dragBegin(sq) {
      const e = layer.get(sq); if (!e) return false; view.refreshRect(); drag = { e, x: e.x, y: e.y };
      e.wrap.classList.add('is-drag', 'is-lifted'); e.wrap.style.zIndex = '9'; liftedEntry = e; return true;
    },
    dragMove(cx, cy) {
      if (!drag) return; const r = getRect(); const x = cx - r.left, y = cy - r.top - px * 0.26; drag.x = x; drag.y = y;
      drag.e.wrap.style.transform = tr(x, y, px);
    },
    dragEnd() {
      if (!drag) return null; const d = drag; drag = null; d.e.wrap.classList.remove('is-drag'); unlift(); d.e.wrap.style.zIndex = ''; pendingDrop = { x: d.x, y: d.y, sq: d.e.sq, t: Date.now() }; return { x: d.x, y: d.y };
    },
    async dragCancel() {
      if (!drag) return; const d = drag; drag = null; pendingDrop = null; const e = d.e; e.wrap.classList.remove('is-drag'); unlift(); e.wrap.style.zIndex = '7';
      layer.refresh(e);
      const h = play(e.wrap, [{ transform: tr(d.x, d.y, px) }, { transform: tr(e.x, e.y, px) }], { duration: reducedNow() ? 60 : 150, easing: ease.out });
      await h.finished; e.wrap.style.zIndex = '';
    },
    debug() { return { pieces: layer.entries().map((e) => ({ sq: e.sq, side: e.piece.side, type: e.piece.type, x: e.x, y: e.y })), marks: overlays.kinds(), idle: queue.idle, scale, px, orientation: orient, pending: queue.pending }; },
  };
  void flipOrientation; void (null as PlanItem | null);
  return view;
}
