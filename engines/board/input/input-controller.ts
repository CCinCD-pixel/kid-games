// input/input-controller.ts — 点—点与拖动并存。状态机：idle → selected → dragging（叠加锁 anim / ai / modal / consent / lesson）。
// 输入只在 idle/selected 且轮到该座位时被接受；其余一律丢弃、不排队（ignoredTaps 计数）。第二指忽略；pointercancel / lostpointercapture → 回到 selected；
// 拖到棋盘外松手 → 飞回；同一帧两次点击只处理第一次；withLock 用 try/finally（reject 也释放）；DEV 看门狗自动释放卡死的锁。
import type { BoardView, GameRules, InputController, InputHooks, LockReason, Sq } from '../core/types';
import type { DragSurface } from '../view/board-view';
import { resolveTap, tuningForCell, type SnapTuning } from './snap';
import { attachKeyboard } from './keyboard';

/** 扩展钩子：rawTap = 抢先处理一次点击（返回 true = 已处理；课里"点亮格子"类步骤用） */
export interface InputHooksExt<M, S> extends InputHooks<M, S> { rawTap?(sq: Sq): boolean }
export interface InputControllerImpl<M, S> extends InputController {
  /** 临时覆盖钩子（课 / 谜题接管输入）；返回恢复函数，可嵌套（后覆盖者优先） */
  overrideHooks(h: Partial<InputHooksExt<M, S>>): () => void;
  /** 程序化提交一手（等价于孩子选中并走到目标；经锁 / canAct / 升变选择框）；测试 / 幽灵手 / 课使用 */
  submit(m: M): Promise<boolean>;
  /** 程序化选中（课 / 幽灵手 / 键盘）；null = 取消 */
  select(sq: Sq | null): void;
  /** 当作一次点击处理某个格（键盘 / 测试） */
  tapSquare(sq: Sq): void;
  readonly selected: Sq | null;
  readonly watchdogTrips: number;
  setSnap(c: Partial<SnapTuning>): void;
  readonly tuning: SnapTuning;
  /** 当前已选中棋子的合法着法（M[]） */
  selectedMoves(): readonly M[];
  readonly state: () => S;
}
export interface InputOptions {
  tuning?: Partial<SnapTuning>; slopPx?: number;
  /** 看门狗毫秒：anim / ai 超时自动释放并记录；false = 关。缺省：开发环境开 */
  watchdog?: { anim?: number; ai?: number } | false;
  setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void;
  keyboard?: boolean;
}
type View<M, S> = BoardView<M, S> & Partial<DragSurface> & { announce?(text: string): void };
const DOUBLE_MS = 2;
const isDev = (): boolean => { try { return !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV; } catch { return false; } };

export function createInputController<M, S>(view: View<M, S>, rules: GameRules<M, S>, baseHooks: InputHooksExt<M, S>, opts: InputOptions = {}): InputControllerImpl<M, S> {
  const overrides: Partial<InputHooksExt<M, S>>[] = [];
  const H = (): InputHooksExt<M, S> => (overrides.length ? Object.assign({}, baseHooks, ...overrides) as InputHooksExt<M, S> : baseHooks);
  const el = view.el; const g = rules.geometry;
  const setT = opts.setTimer ?? ((f, ms) => setTimeout(f, ms)); const clrT = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const wd = opts.watchdog === undefined ? (isDev() ? { anim: 2000, ai: 3000 } : false) : opts.watchdog;
  const slop = opts.slopPx ?? 10;
  let tuningOverride: Partial<SnapTuning> = { ...opts.tuning };
  const T = (): SnapTuning => ({ ...tuningForCell(view.cellPx ?? 80), ...tuningOverride });

  let enabled = true; let ignored = 0; let trips = 0; let lastDownAt = -1e9;
  const locks = new Map<number, { reason: LockReason; timer: unknown }>(); let lockSeq = 0;
  let sel: { sq: Sq; moves: M[]; targets: Set<Sq> } | null = null; let mode: 'idle' | 'selected' | 'dragging' = 'idle';
  let selMarks: { dispose(): void }[] = [];
  let down: { id: number; x: number; y: number; dragPossible: boolean; onSelected: boolean; moved: boolean; preview: boolean } | null = null;
  let activeId: number | null = null;

  const state = (): S => H().state();
  const seat = (): number => H().seatToMove();
  const clearSel = (): void => { for (const m of selMarks) m.dispose(); selMarks = []; view.liftPiece?.(null); view.showPreview?.(null); };
  const cellDist = (cx: number, cy: number, sq: Sq): number => { const r = view.rect(sq); return Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)) / (r.width || 1); };

  function lock(reason: LockReason): () => void {
    const id = ++lockSeq; let timer: unknown = null;
    const ms = wd && (reason === 'anim' ? wd.anim : reason === 'ai' ? wd.ai : undefined);
    const release = (): void => { const l = locks.get(id); if (!l) return; if (l.timer !== null) clrT(l.timer); locks.delete(id); };
    if (ms) timer = setT(() => { if (locks.has(id)) { trips++; console.warn(`[board] 输入锁 ${reason} 超过 ${ms} ms，自动释放`); release(); } }, ms);
    locks.set(id, { reason, timer }); return release;
  }
  async function withLock<T>(reason: LockReason, f: () => Promise<T>): Promise<T> { const rel = lock(reason); try { return await f(); } finally { rel(); } }

  function select(sq: Sq | null): void {
    clearSel();
    if (sq === null) { sel = null; mode = 'idle'; H().onSelect?.(null, []); return; }
    const s = state(); const moves = rules.legalFrom(s, sq); const targets = new Set<Sq>(); const quiet: Sq[] = [], caps: Sq[] = [];
    for (const m of moves) { const i = rules.moveInfo(s, m); if (!targets.has(i.to)) { targets.add(i.to); (i.capture ? caps : quiet).push(i.to); } }
    sel = { sq, moves, targets }; mode = 'selected';
    selMarks.push(view.mark('select', [sq], { id: 'bk-select' })); if (quiet.length) selMarks.push(view.mark('legal', quiet, { id: 'bk-legal' })); if (caps.length) selMarks.push(view.mark('capture', caps, { id: 'bk-capture' }));
    view.liftPiece?.(sq); if (!moves.length) view.bump?.(sq);
    view.announce?.(`选中 ${g.name(sq)}，${targets.size} 个可走位置`);
    H().onSelect?.(sq, [...targets]);
  }
  /** 把 (from,to) 的着法交给游戏：升变多条 → 选择框；null = 取消（子回原位，保持选中） */
  async function commitTo(to: Sq): Promise<boolean> {
    if (!sel) return false; const s0 = state(); const from = sel.sq; const cands = sel.moves.filter((m) => rules.moveInfo(s0, m).to === to);
    if (!cands.length) return false; let m: M | null = cands[0];
    if (cands.length > 1) {
      if (H().promotion) { const opts2 = cands.map((mv) => ({ move: mv, promotion: rules.moveInfo(s0, mv).promotion ?? 0 })); m = await withLock('modal', () => H().promotion!(from, to, opts2)); }
    }
    if (m === null) { await view.dragCancel?.(); return false; }
    clearSel(); sel = null; mode = 'idle'; H().onSelect?.(null, []);
    const rel = lock('anim'); try { await H().commit(m); } finally { rel(); }
    return true;
  }
  function illegal(to: Sq): void { if (!sel) return; const why = rules.whyIllegal(state(), sel.sq, to); H().onIllegal(why, sel.sq, to); view.bump?.(sel.sq); }

  function context(cx: number, cy: number, sq: Sq | null): Parameters<typeof resolveTap>[0] {
    const t = T(); const s = state(); const me = seat();
    const own = (q: Sq): boolean => { const p = rules.pieceAt(s, q); return !!p && p.side === me && p.type !== 99; };
    const near: { sq: Sq; dist: number }[] = []; if (sel) for (const q of sel.targets) { const d = cellDist(cx, cy, q); if (d <= t.targetRadius + 1e-9) near.push({ sq: q, dist: d }); }
    const ownNear: { sq: Sq; dist: number }[] = [];
    if (t.selectRadius > 0) for (let q = 0; q < g.squares; q++) { if (!own(q) || q === sel?.sq) continue; const d = cellDist(cx, cy, q); if (d <= t.selectRadius && rules.legalFrom(s, q).length) ownNear.push({ sq: q, dist: d }); }
    return { nearest: sq, dist: sq === null ? Infinity : cellDist(cx, cy, sq), selected: sel?.sq ?? null, legal: sel?.targets ?? new Set(), ownAtNearest: sq !== null && own(sq), near, ownNear };
  }
  const act = (cx: number, cy: number, sq: Sq | null, fromPx = false): void => {
    const r = resolveTap(context(cx, cy, sq), T());
    switch (r.kind) {
      case 'select': select(r.sq); break;
      case 'toggle': if (fromPx) break; select(null); break;
      case 'move': void commitTo(r.sq).then((ok) => { if (!ok && sel) mode = 'selected'; }); break;
      case 'illegal': illegal(r.sq); break;
      case 'cancel': if (sel) select(null); break;
    }
  };
  const resolvedTarget = (cx: number, cy: number): Sq | null => {
    if (!sel) return null; const r = resolveTap(context(cx, cy, view.hitTest(cx, cy)), T()); return r.kind === 'move' ? r.sq : null;
  };

  const blocked = (): boolean => !enabled || locks.size > 0 || !H().canAct(seat() as 0 | 1);
  const onDown = (e: PointerEvent): void => {
    if (activeId !== null && e.pointerId !== activeId) { ignored++; return; }       // 第二指
    if (!e.isPrimary) { ignored++; return; }
    if (blocked() || e.timeStamp - lastDownAt < DOUBLE_MS) { ignored++; return; }          // 同一次点击的重复派发（touch + 合成鼠标）只处理第一次
    lastDownAt = e.timeStamp;
    view.refreshRect?.(); activeId = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    const sq = view.hitTest(e.clientX, e.clientY); const ctx = context(e.clientX, e.clientY, sq);
    const onSelected = !!sel && sq === sel.sq && ctx.ownAtNearest;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, dragPossible: false, onSelected, moved: false, preview: (view.cellPx ?? 80) < 44 };
    if (H().rawTap) return;                                                                     // 课里"点亮格子"类步骤接管点击：不选子、不拖动，抬手时只交给 rawTap
    if (ctx.ownAtNearest && sq !== null) { if (!onSelected) select(sq); down.dragPossible = !!sel && sel.moves.length > 0; }
    else if (down.preview && sel) view.showPreview?.(resolvedTarget(e.clientX, e.clientY));
  };
  const onMove = (e: PointerEvent): void => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > slop) down.moved = true;
    if (mode === 'selected' && down.dragPossible && down.moved && sel && view.dragBegin?.(sel.sq)) mode = 'dragging';
    if (mode === 'dragging') view.dragMove?.(e.clientX, e.clientY);
    else if (down.preview && sel && !down.dragPossible) view.showPreview?.(resolvedTarget(e.clientX, e.clientY));
  };
  const finishPointer = (): void => { down = null; activeId = null; view.showPreview?.(null); };
  const onUp = (e: PointerEvent): void => {
    if (!down || e.pointerId !== down.id) return; const d = down; finishPointer();
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (mode === 'dragging') {
      const pos = view.dragEnd?.() ?? null; const r = view.el.getBoundingClientRect(); mode = 'selected';
      if (pos) {
        const cx = r.left + pos.x, cy = r.top + pos.y; const sq = view.hitTest(cx, cy); const res = resolveTap(context(cx, cy, sq), T());
        if (res.kind === 'move') { void commitTo(res.sq).then((ok) => { if (!ok) { mode = sel ? 'selected' : 'idle'; } }); return; }
        if (res.kind === 'illegal') illegal(res.sq);
      }
      void view.dragCancel?.(); return;
    }
    if (d.dragPossible && !d.moved && d.onSelected) { select(null); return; }          // 再点已选中的子 = 取消选择
    if (d.dragPossible && !d.moved) return;                                              // 刚刚选中（pointerdown 已处理）
    const sq = view.hitTest(e.clientX, e.clientY); if (sq !== null && H().rawTap?.(sq)) return; act(e.clientX, e.clientY, sq, true);
  };
  const onCancel = (e: PointerEvent): void => {
    if (!down || e.pointerId !== down.id) return; finishPointer();
    if (mode === 'dragging') { mode = sel ? 'selected' : 'idle'; view.dragEnd?.(); void view.dragCancel?.(); }
  };
  const onLost = (e: PointerEvent): void => { if (down && e.pointerId === down.id) onCancel(e); };

  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel); el.addEventListener('lostpointercapture', onLost);
  const detachKb = opts.keyboard === false ? () => undefined : attachKeyboard(el, g, () => view.orientation ?? 'first-bottom',
    { tapSquare, cancel: () => select(null), focus: (sq) => view.showFocus?.(sq), cursor: () => null }, () => { const s = state(); for (let q = 0; q < g.squares; q++) { const p = rules.pieceAt(s, q); if (p && p.side === seat()) return q; } return 0; });
  function tapSquare(sq: Sq): void {
    if (blocked()) { ignored++; return; }
    if (H().rawTap?.(sq)) return;
    const r = view.rect(sq); act(r.left + r.width / 2, r.top + r.height / 2, sq);
  }

  const api: InputControllerImpl<M, S> = {
    lock, withLock,
    get locked() { return locks.size > 0; }, get ignoredTaps() { return ignored; }, get mode() { return mode; }, get selected() { return sel?.sq ?? null; }, get watchdogTrips() { return trips; },
    get tuning() { return T(); }, state,
    setSnap(c) { tuningOverride = { ...tuningOverride, ...c }; },
    enable(on) { enabled = on; if (!on) { finishPointer(); if (mode === 'dragging') { view.dragEnd?.(); void view.dragCancel?.(); } select(null); } },
    destroy() {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel); el.removeEventListener('lostpointercapture', onLost); detachKb(); clearSel();
      for (const l of locks.values()) if (l.timer !== null) clrT(l.timer); locks.clear();
    },
    select, tapSquare, selectedMoves: () => sel?.moves ?? [],
    overrideHooks(h) { overrides.push(h); return () => { const i = overrides.indexOf(h); if (i >= 0) overrides.splice(i, 1); }; },
    async submit(m) { if (blocked()) { ignored++; return false; } const info = rules.moveInfo(state(), m); select(info.from); return commitTo(info.to); },
  };
  return api;
}
