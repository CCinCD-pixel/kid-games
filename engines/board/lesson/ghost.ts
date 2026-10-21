// lesson/ghost.ts — 幽灵手：半透明的手指在棋盘上点 / 拖 / 走一串着法，演示"这样走"。纯 DOM + WAAPI（只动 transform / opacity）。
import type { GhostHand, GameRules, Sq } from '../core/types';
import { ease, play } from '../view/anim';
import type { BoardViewImpl } from '../view/board-view';

export interface GhostOptions<M> {
  /** path() 里每一手真的走到棋盘上（课：动画走子；演示完由调用方悔回） */
  playMove?(enc: string): Promise<void>;
  speed?: number;
  /** 编码着法 → 起止格；缺省按 geometry.name 解析 'e2e4' / 'h3e3' / 'i10i9' */
  parse?(enc: string): { from: Sq; to: Sq } | null;
  _m?: M;
}
export interface GhostImpl extends GhostHand { destroy(): void; readonly el: HTMLElement; readonly busy: boolean; cancel(): void }
const HAND = '<svg viewBox="0 0 48 56" width="100%" height="100%" aria-hidden="true"><defs><filter id="bk-gs" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity=".4"/></filter></defs><g filter="url(#bk-gs)"><path d="M17 4c2.6 0 4.5 1.9 4.5 4.5V24l1-.2c.6-2.3 3-3.6 5.2-3 1.6.4 2.7 1.5 3.1 2.9 1.4-.8 3.2-.8 4.7.2 1.1.8 1.8 1.9 2 3.2 1.6-.3 3.2.2 4.2 1.6.5.7.8 1.6.8 2.5v10.2c0 6.6-5.1 12-11.6 12H28c-4.6 0-8.2-2.2-11-6L7.600 33.200c-1.200-1.700-.9-3.800.7-5 1.600-1.200 3.800-.9 5.100.700l3.600 3.600V8.500C13 5.900 14.700 4 17 4z" fill="#fff" fill-opacity=".92" stroke="#35468c" stroke-width="2.4" stroke-linejoin="round"/></g></svg>';
export function createGhost<M, S>(view: BoardViewImpl<M, S>, rules: GameRules<M, S>, o: GhostOptions<M> = {}): GhostImpl {
  const doc = view.el.ownerDocument; const g = rules.geometry; const names = new Map<string, Sq>(); for (let q = 0; q < g.squares; q++) names.set(g.name(q), q);
  const parse = o.parse ?? ((enc: string) => { const m = /^([a-z]\d{1,2})([a-z]\d{1,2})/.exec(enc); if (!m) return null; const a = names.get(m[1]), b = names.get(m[2]); return a === undefined || b === undefined ? null : { from: a, to: b }; });
  const el = doc.createElement('div'); el.className = 'bk-ghost'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = HAND; Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: '56px', height: '66px', pointerEvents: 'none', opacity: '0', zIndex: '50', willChange: 'transform,opacity' }); view.el.appendChild(el);
  const ring = doc.createElement('div'); Object.assign(ring.style, { position: 'absolute', left: '0', top: '0', width: '60px', height: '60px', borderRadius: '50%', border: '4px solid #fdd877', pointerEvents: 'none', opacity: '0', zIndex: '49' }); view.el.appendChild(ring);
  let busy = false; let cancelled = false; let cur: { x: number; y: number } | null = null;
  const speed = (): number => (view.reduced ? 4 : o.speed ?? 1); const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms / speed()));
  const at = (sq: Sq): { x: number; y: number } => { const r = view.rect(sq), b = view.el.getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 }; };
  const pos = (p: { x: number; y: number }, dy = 0): string => `translate3d(${p.x - 18}px,${p.y - 8 + dy}px,0)`;
  async function glide(to: { x: number; y: number }, ms: number): Promise<void> { const from = cur ?? { x: to.x + 60, y: to.y + 90 }; el.style.transform = pos(to); await play(el, [{ transform: pos(from), opacity: cur ? 1 : 0 }, { transform: pos(to), opacity: 1 }], { duration: ms / speed(), easing: ease.inOut }).finished; cur = to; el.style.opacity = '1'; }
  async function press(): Promise<void> { if (!cur) return; ring.style.transform = `translate3d(${cur.x - 30}px,${cur.y - 30}px,0)`; await Promise.all([play(el, [{ transform: pos(cur) }, { transform: pos(cur, 6) + ' scale(.92)' }, { transform: pos(cur) }], { duration: 260 / speed(), easing: 'ease-in-out' }).finished, play(ring, [{ transform: `translate3d(${cur.x - 30}px,${cur.y - 30}px,0) scale(.4)`, opacity: 0.9 }, { transform: `translate3d(${cur.x - 30}px,${cur.y - 30}px,0) scale(1.25)`, opacity: 0 }], { duration: 480 / speed(), easing: 'ease-out' }).finished]); }
  const hide = async (): Promise<void> => { await play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 / speed() }).finished; el.style.opacity = '0'; cur = null; };
  const run = async (f: () => Promise<void>): Promise<void> => { if (busy) return; busy = true; cancelled = false; try { await f(); } finally { await hide().catch(() => undefined); busy = false; } };
  const api: GhostImpl = {
    el, get busy() { return busy; }, cancel() { cancelled = true; },
    tap: (sq) => run(async () => { await glide(at(sq), 520); if (cancelled) return; await press(); await wait(120); }),
    drag: (from, to) => run(async () => { await glide(at(from), 480); if (cancelled) return; await press(); await glide(at(to), 620); if (cancelled) return; await wait(100); }),
    path: (moves) => run(async () => { for (const enc of moves) { if (cancelled) return; const m = parse(enc); if (!m) continue; await glide(at(m.from), 420); await press(); await glide(at(m.to), 520); if (o.playMove) await o.playMove(enc); await wait(250); } }),
    destroy() { cancelled = true; el.remove(); ring.remove(); },
  };
  return api;
}
