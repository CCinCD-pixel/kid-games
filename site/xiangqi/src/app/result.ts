// site/xiangqi/src/app/result.ts — 楚河棋院自己的"结果卡"（QA r2 M2）：取代 kit showResult 在本作里的所有用法。
// 为什么自己做：kit 的 .xg-modal 没有最大高度也不能滚，认输 / 长将判负卡在 SE（320×568）上高 656 / 900 px，按键全掉出屏幕。
// 结构：.xq-res（铺满、位置来自 layout.resultBox，永远避开 🏠）> .xq-res-card（flex 列 / 矮横屏两列）> [.xq-res-main（徽章、星、标题、可滚正文）][.xq-res-acts（按键行：永远整行可见）]。
import { h, starRow } from '@kit/ui';
import type { AppCtx } from './ctx';
import { K, resultBox } from './layout';

export interface ResAction { id: string; label: string; kind?: 'primary' | 'secondary' }
export interface ResOpts {
  /** 审计 / 截图用的卡片种类（data-kind） */ kind: string;
  ribbon?: string; title: string; text?: string; stars?: 0 | 1 | 2 | 3; stats?: { label: string; value: string | number }[]; actions: ResAction[];
}
/** 当前屏 🏠 的位置（setBack 写在 :root 的 --kit-back-x/y；没写 = 默认左上） */
function homeNow(): { x: number; y: number; w: number; h: number } | null {
  const cs = getComputedStyle(document.documentElement); const x = parseFloat(cs.getPropertyValue('--kit-back-x')), y = parseFloat(cs.getPropertyValue('--kit-back-y'));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, w: K.HOME, h: K.HOME } : null;
}
/** 刚弹出的这段时间卡片不接受点击（QA r3：最后一下点棋盘的 pointerup 之后，浏览器还会补一个 click，正好落在新弹出的按键上——
 *  L10 就这样没等孩子看见星星卡就"回学堂"了）。另外要求：按键必须被一次新的 pointerdown 按下过，才认随后的 click（键盘回车的 click.detail 为 0，照常放行）。 */
export const RESULT_GUARD_MS = 600;
/** 弹出结果卡，返回被点的按键 id。从不自动前进；不可点背景关闭（孩子必须选一个）。 */
export function xqResult(ctx: AppCtx, o: ResOpts): Promise<string> {
  return new Promise((resolve) => {
    const prim = o.actions.filter((a) => a.kind === 'primary'); const rest = o.actions.filter((a) => a.kind !== 'primary');
    const born = performance.now(); let armed: HTMLElement | null = null; const live = (): boolean => performance.now() - born >= RESULT_GUARD_MS;
    const btn = (a: ResAction): HTMLButtonElement => h('button', { type: 'button', class: `xq-btn xq-res-btn ${a.kind === 'primary' ? 'is-primary' : 'is-sub'}`, 'data-act': a.id,
      onpointerdown: (e: Event) => { armed = live() ? (e.currentTarget as HTMLElement) : null; },
      onclick: (e: MouseEvent) => { const me = e.currentTarget as HTMLElement; if (!live() || (e.detail !== 0 && armed !== me)) { armed = null; return; } armed = null; close(a.id); } }, a.label);
    const acts = h('div', { class: 'xq-res-acts' }, ...prim.map(btn), ...rest.map(btn));
    const stats = o.stats?.length ? h('div', { class: 'xq-res-stats' }, ...o.stats.map((s) => h('span', { class: 'chip' }, h('b', null, String(s.value)), h('i', null, s.label)))) : null;
    const body = h('div', { class: 'xq-res-body' }, ...(o.text ? [h('p', { class: 'xq-res-text' }, o.text)] : []), ...(stats ? [stats] : []));
    const main = h('div', { class: 'xq-res-main' }, ...(o.ribbon ? [h('div', { class: 'xq-res-rib' }, o.ribbon)] : []), ...(o.stars !== undefined ? [h('div', { class: 'xq-res-stars' }, starRow(o.stars))] : []), h('h2', { class: 'xq-res-title' }, o.title), body);
    const card = h('div', { class: 'xq-res-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title }, main, acts);
    const wrap = h('div', { class: 'xq-res', 'data-xq-result': o.kind, 'data-kind': o.kind }, card);
    const fit = (): void => { const R = resultBox(ctx.vp(), homeNow()); const st = wrap.style; st.padding = `${R.pad.t}px ${R.pad.r}px ${R.pad.b}px ${R.pad.l}px`; wrap.dataset.cols = String(R.cols); card.style.maxWidth = `${R.maxW}px`; };
    let closed = false; const onResize = (): void => { fit(); }; let t2: ReturnType<typeof setTimeout> | undefined;
    const onOrient = (): void => { onResize(); clearTimeout(t2); t2 = setTimeout(onResize, 350); };
    function close(id: string): void { if (closed) return; closed = true; window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onOrient); clearTimeout(t2); ctx.sfx('ui-close'); wrap.classList.add('is-leaving'); setTimeout(() => wrap.remove(), 200); resolve(id); }
    fit(); wrap.dataset.armed = '0'; setTimeout(() => { wrap.dataset.armed = '1'; }, RESULT_GUARD_MS); ctx.root.append(wrap); window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onOrient);
    ctx.sfx('ui-open'); (o.stars ?? 0) > 0 && setTimeout(() => ctx.sfx('level-complete', { volume: 0.7 }), 500);
    (prim[0] ? acts.querySelector<HTMLElement>('.is-primary') : acts.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
  });
}
