// site/xiangqi/src/art/coords.ts — 竖线号（棋盘下方的数字行）。引擎 overlays 对交叉点棋盘不画坐标，也没地方画：外框边距只比端线棋子的半径多 0.12c。
// 所以数字画在棋盘正下方的一条 COORD_H 高的行里（layout.coordRow），与列对齐：红方一…九（执红：左→右 九…一），黑方 1…9（执黑旋转后左→右 9…1）。
import type { Orientation } from '@engines/board/core/types';
export const RED_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;
/** 屏幕从左到右第 k 列（0..8）的竖线号文字；bottomSide 0 = 红在下（九…一），1 = 黑在下（9…1） */
export const coordLabel = (k: number, bottomSide: 0 | 1): string => (bottomSide === 0 ? RED_NUM[8 - k] : String(9 - k));
export const bottomSideOf = (o: Orientation): 0 | 1 => (o === 'second-bottom' ? 1 : 0);
/** 把 9 个数字摆进 el（el 已由 place() 放到 coordRow：x = 第 0 列的竖线，宽 = 8c） */
export function renderCoordRow(el: HTMLElement, c: number, bottomSide: 0 | 1): void {
  el.replaceChildren(); el.dataset.side = String(bottomSide); el.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 9; k++) { const s = document.createElement('span'); s.textContent = coordLabel(k, bottomSide); s.style.left = `${k * c - c / 2}px`; s.style.width = `${c}px`; el.append(s); }
}

/** 读屏用的格子叫法：红方竖线号 + 横线（与摆到真棋盘 / 竖线号同一套）：a10 → 九线10行 */
export const spokenSq = (name: string): string => { const m = /^([a-i])(\d+)$/.exec(name); return m ? `${RED_NUM[8 - (m[1].charCodeAt(0) - 97)]}线${m[2]}行` : name; };
/** 引擎给棋盘 / 棋子的 aria-label 带英文 id 和字母数字坐标（"xiangqi 棋盘" / "黑车 a10"）：换成中文叫法。返回清理函数。 */
export function a11yRelabel(boardEl: HTMLElement): () => void {
  boardEl.setAttribute('aria-label', '象棋棋盘');
  const fix = (el: Element): void => { const t = el.getAttribute('aria-label'); if (!t) return; const m = /^(.*?)\s([a-i]\d+)$/.exec(t); if (m) el.setAttribute('aria-label', `${m[1]} ${spokenSq(m[2])}`); else if (t.endsWith(' 棋盘')) el.setAttribute('aria-label', '象棋棋盘'); };
  const mo = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') fix(m.target as Element); else m.addedNodes.forEach((n) => { if (n instanceof Element) { fix(n); n.querySelectorAll('[aria-label]').forEach(fix); } }); } });
  mo.observe(boardEl, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label'] }); boardEl.querySelectorAll('[aria-label]').forEach(fix); fix(boardEl);
  return () => mo.disconnect();
}
