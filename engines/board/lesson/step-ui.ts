// lesson/step-ui.ts — 课步骤的默认 DOM 界面：答题按钮条（chooser）、小眼睛等按钮、计数徽标、分数筹码。
// 游戏可以整个替换（StepContextImpl.ui）；这里的实现挂在棋盘元素**旁边**（兄弟节点，不在棋盘里，免得抢指针捕获）：
// 缺省悬在棋盘正下方（absolute），游戏版面请给它留 ≥72 px，或传 slot 自己摆。按钮 ≥56 px 高，iPad 手指友好。
import type { Disposable, Sq } from '../core/types';
import type { BoardViewImpl } from '../view/board-view';
import { ease, play } from '../view/anim';
import type { ChoiceOption, Chooser, StepUi } from './registry';

const CSS = `.bk-su{position:absolute;display:flex;flex-wrap:wrap;gap:12px;justify-content:center;align-items:center;z-index:30;pointer-events:none}
.bk-su>*{pointer-events:auto}
.bk-su-btn{min-width:96px;min-height:56px;padding:0 22px;border-radius:18px;border:2px solid var(--bk-su-edge,#fdd877);background:var(--bk-su-bg,rgba(24,31,72,.94));color:var(--bk-su-fg,#fff);font:700 22px/1 system-ui,-apple-system,"PingFang SC",sans-serif;letter-spacing:.04em;box-shadow:0 4px 0 rgba(0,0,0,.35);touch-action:manipulation;transition:transform .12s,opacity .2s}
.bk-su-btn:active{transform:translateY(2px) scale(.97);box-shadow:0 2px 0 rgba(0,0,0,.35)}
.bk-su-btn.ok{background:#2f8f5b;border-color:#bff5cf}.bk-su-btn.soft{opacity:.55;transform:translateX(0);animation:bk-su-shake .32s}
.bk-su-btn.hint{animation:bk-su-pulse 1s ease-in-out infinite}.bk-su-btn.off{opacity:.25;pointer-events:none}
.bk-su-count{padding:8px 16px;border-radius:14px;background:rgba(24,31,72,.9);color:#fdd877;font:700 20px/1 system-ui,-apple-system,"PingFang SC",sans-serif}
.bk-chip{position:fixed;left:0;top:0;z-index:60;pointer-events:none;padding:6px 12px;border-radius:999px;font:800 26px/1 system-ui,-apple-system,sans-serif;color:#fff;box-shadow:0 3px 10px rgba(0,0,0,.4)}
/* 窄棋盘（手机横屏）：按钮收紧，保证一排放得下 */
.bk-su-narrow,.bk-su-narrow .bk-su{gap:8px;flex-wrap:nowrap}.bk-su-narrow .bk-su-btn{min-width:60px;min-height:46px;padding:0 10px;font-size:17px;letter-spacing:0;border-radius:14px}
@keyframes bk-su-shake{20%{transform:translateX(-6px)}60%{transform:translateX(6px)}}@keyframes bk-su-pulse{50%{box-shadow:0 0 0 6px rgba(253,216,119,.55)}}
@media (prefers-reduced-motion:reduce){.bk-su-btn,.bk-su-btn.soft,.bk-su-btn.hint{animation:none;transition:none}}`;
let cssDone = false;
function ensureCss(doc: Document): void { if (cssDone && doc.getElementById('bk-su-css')) return; cssDone = true; const s = doc.createElement('style'); s.id = 'bk-su-css'; s.textContent = CSS; doc.head.appendChild(s); }

export interface StepUiImpl extends StepUi { destroy(): void; readonly slot: HTMLElement }
export function createStepUi(view: BoardViewImpl<never, never>, o: { slot?: HTMLElement } = {}): StepUiImpl {
  const doc = view.el.ownerDocument; ensureCss(doc);
  const own = !o.slot; const slot = o.slot ?? doc.createElement('div'); slot.classList.add('bk-su'); slot.setAttribute('role', 'group'); slot.setAttribute('aria-label', '答题'); if (own) (view.el.parentElement ?? doc.body).appendChild(slot);
  const place = (): void => { if (!own) return; const b = view.el.getBoundingClientRect(), p = (slot.parentElement ?? doc.body).getBoundingClientRect(); slot.style.left = `${b.left - p.left}px`; slot.style.width = `${b.width}px`; slot.style.top = `${b.bottom - p.top + 10}px`; slot.classList.toggle('bk-su-narrow', b.width < 320); };
  const onResize = (): void => place(); window.addEventListener('resize', onResize);
  const mk = (cls: string, text: string): HTMLButtonElement => { const b = doc.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; return b; };
  const api: StepUiImpl = {
    slot,
    choose(opts: readonly ChoiceOption[]): Chooser {
      place(); const row = doc.createElement('div'); row.className = 'bk-su'; Object.assign(row.style, { position: 'static', pointerEvents: 'auto' }); const btns = new Map<string, HTMLButtonElement>(); let resolve: ((id: string) => void) | null = null; const queue: string[] = [];
      for (const op of opts) { const b = mk('bk-su-btn', op.label); b.dataset.id = op.id; b.addEventListener('click', () => { if (b.classList.contains('off')) return; if (resolve) { const r = resolve; resolve = null; r(op.id); } else queue.push(op.id); }); btns.set(op.id, b); row.appendChild(b); }
      slot.appendChild(row);
      return {
        pick: () => (queue.length ? Promise.resolve(queue.shift() as string) : new Promise<string>((r) => { resolve = r; })),
        mark(id, state) { const b = btns.get(id); if (!b) return; b.classList.remove('ok', 'soft', 'hint', 'off'); b.classList.add(state); if (state === 'soft') setTimeout(() => b.classList.remove('soft'), 340); },
        dispose() { row.remove(); resolve = null; },
      };
    },
    button(label, onPress, bo = {}): Disposable { place(); const b = mk('bk-su-btn', label); if (bo.id) b.dataset.id = bo.id; b.addEventListener('click', onPress); slot.appendChild(b); return { dispose: () => b.remove() }; },
    counter(text) { place(); const el = doc.createElement('div'); el.className = 'bk-su-count'; el.textContent = text; slot.appendChild(el); return { set: (t) => { el.textContent = t; }, dispose: () => el.remove() }; },
    async chip(sq: Sq, net: number): Promise<void> {
      const r = view.rect(sq); const el = doc.createElement('div'); el.className = 'bk-chip'; el.textContent = net > 0 ? `+${net}` : net < 0 ? `−${-net}` : '±0'; el.style.background = net > 0 ? '#2f8f5b' : net < 0 ? '#c0473c' : '#8a7a2e';
      doc.body.appendChild(el); const x = r.left + r.width / 2 - 28, y = r.top + r.height / 2 - 18; const t = view.trayAnchor(0); const tx = t && t.width ? t.left + t.width / 2 - 28 : x, ty = t && t.height ? t.top + t.height / 2 - 18 : y - 60;
      const T = (px: number, py: number, sc: number): string => `translate3d(${px}px,${py}px,0) scale(${sc})`;
      if (view.reduced) { await play(el, [{ opacity: 0, transform: T(x, y, 1) }, { opacity: 1, transform: T(x, y, 1) }], { duration: 80, fill: 'forwards' }).finished; await new Promise((res) => setTimeout(res, 500)); el.remove(); return; }
      await play(el, [{ opacity: 0, transform: T(x, y + 10, 0.6) }, { opacity: 1, transform: T(x, y - 26, 1.15) }], { duration: 260, easing: ease.out, fill: 'forwards' }).finished;
      await new Promise((res) => setTimeout(res, 300)); await play(el, [{ opacity: 1, transform: T(x, y - 26, 1.15) }, { opacity: 0.2, transform: T(tx, ty, 0.5) }], { duration: 420, easing: ease.inOut, fill: 'forwards' }).finished; el.remove();
    },
    destroy() { window.removeEventListener('resize', onResize); if (own) slot.remove(); else slot.replaceChildren(); },
  };
  return api;
}
