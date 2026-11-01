// view/promotion-picker.ts — 升变选择框（棋手学院扩展点，由 engines-board 实现）。4 个大棋子，≥76 px，点外面 = 取消（兵回原位）；键盘 Tab / 方向键 / Enter / Esc；aria-live。
// 用法：const input = createInputController(view, rules, { ..., promotion: createPromotionPicker(view, rules, sprites, { names }) })
import type { GameRules, Piece, PieceSprites, Side, Sq } from '../core/types';
import type { BoardViewImpl } from './board-view';
import { ensureBoardStyles } from './styles';

export interface PromotionPickerOptions {
  /** 升变子类型 → 展示顺序（缺省按给定顺序） */
  order?: readonly number[];
  /** 无障碍名称：type → 名称（"后"、"车"…）；缺省用 sprites.label */
  names?(type: number): string;
  minPx?: number;
}
export function createPromotionPicker<M, S>(view: BoardViewImpl<M, S>, rules: GameRules<M, S>, sprites: PieceSprites, o: PromotionPickerOptions = {}) {
  return async (from: Sq, to: Sq, options: { move: M; promotion: number }[]): Promise<M | null> => {
    const doc = view.el.ownerDocument; ensureBoardStyles(doc);
    const side: Side = inferSide(rules, view, from);
    const cell = Math.max(o.minPx ?? 76, Math.round(view.cellPx * 1.05));
    const order = o.order ? [...options].sort((a, b) => o.order!.indexOf(a.promotion) - o.order!.indexOf(b.promotion)) : options;
    return new Promise<M | null>((resolve) => {
      const root = doc.createElement('div'); root.className = 'bk-promo'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '选择升变的棋子');
      const card = doc.createElement('div'); card.className = 'bk-promo-card'; root.appendChild(card);
      const done = (m: M | null): void => { doc.removeEventListener('keydown', onKey, true); root.remove(); resolve(m); };
      const btns: HTMLButtonElement[] = [];
      for (const opt of order) {
        const b = doc.createElement('button'); b.type = 'button'; b.className = 'bk-promo-btn'; b.style.width = b.style.height = `${cell}px`;
        const p: Piece = { type: opt.promotion, side }; const sp = doc.createElement('div'); sp.className = 'bk-sprite';
        const node = sprites.make(p, Math.round(cell * 0.88)); sp.appendChild(node.el); b.appendChild(sp);
        b.setAttribute('aria-label', o.names ? o.names(opt.promotion) : sprites.label(p));
        b.addEventListener('click', (e) => { e.stopPropagation(); done(opt.move); }); card.appendChild(b); btns.push(b);
      }
      root.addEventListener('pointerdown', (e) => { if (e.target === root) { e.preventDefault(); done(null); } });
      const onKey = (e: KeyboardEvent): void => {
        const i = btns.indexOf(doc.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1 + btns.length) % btns.length].focus(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
      };
      doc.addEventListener('keydown', onKey, true);
      view.el.appendChild(root); view.announce('选择升变的棋子'); btns[0]?.focus({ preventScroll: true }); void to;
    });
  };
}
/** 推断升变方：起点格上的兵属于哪一方（从视图当前棋子里找） */
function inferSide<M, S>(_rules: GameRules<M, S>, view: BoardViewImpl<M, S>, from: Sq): Side {
  const p = view.debug().pieces.find((x) => x.sq === from); return (p ? p.side : 0) as Side;
}
