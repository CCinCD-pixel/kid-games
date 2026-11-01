// view/piece-layer.ts — DOM 棋子层：每子一个 absolutely-positioned 容器（translate3d），节点池化（≤32），可旋转（面对面）。
// 容器结构：.bk-piece（位置 / z-index）> .bk-sprite（抬起 / 弧线 / 压扁）> .bk-rot（f2f 旋转 180°）> 主题节点 el
import type { Piece, PieceNode, PieceSprites, Seat, Sq } from '../core/types';
import { pieceRotation } from './orientation';

export interface PieceEntry { sq: Sq; piece: Piece; node: PieceNode; wrap: HTMLElement; sprite: HTMLElement; rot: HTMLElement; x: number; y: number }
export interface PieceLayerOptions { sprites: PieceSprites; seat: Seat; label(sq: Sq, p: Piece): string; poolMax?: number }

export class PieceLayer {
  readonly el: HTMLElement;
  private px = 40;
  private readonly bySq = new Map<Sq, PieceEntry>();
  private readonly live = new Set<PieceEntry>();
  private free: PieceEntry[] = [];
  private rotMode: 'none' | 'seat' = 'none';
  constructor(host: HTMLElement, private readonly o: PieceLayerOptions) {
    this.el = host.ownerDocument.createElement('div'); this.el.className = 'bk-pieces'; this.el.setAttribute('role', 'presentation'); host.appendChild(this.el);
  }
  get size(): number { return this.px; }
  get(sq: Sq): PieceEntry | null { return this.bySq.get(sq) ?? null; }
  entries(): PieceEntry[] { return [...this.bySq.values()]; }
  get liveCount(): number { return this.live.size; }

  private build(p: Piece): PieceEntry {
    const d = this.el.ownerDocument;
    const wrap = d.createElement('div'); wrap.className = 'bk-piece'; wrap.setAttribute('role', 'gridcell');
    const sprite = d.createElement('div'); sprite.className = 'bk-sprite';
    const rot = d.createElement('div'); rot.className = 'bk-rot';
    const node = this.o.sprites.make(p, this.px);
    rot.appendChild(node.el); sprite.appendChild(rot); wrap.appendChild(sprite);
    return { sq: -1, piece: p, node, wrap, sprite, rot, x: 0, y: 0 };
  }
  private acquire(p: Piece): PieceEntry {
    const e = this.free.pop();
    if (e) { e.node.setPiece(p); e.piece = p; e.wrap.style.display = ''; e.wrap.style.opacity = ''; e.wrap.style.zIndex = ''; e.wrap.className = 'bk-piece'; return e; }
    const n = this.build(p); return n;
  }
  /** 退回池（超过上限就销毁） */
  release(e: PieceEntry): void {
    this.live.delete(e); if (this.bySq.get(e.sq) === e) this.bySq.delete(e.sq);
    e.wrap.style.display = 'none'; e.wrap.classList.remove('is-lifted', 'is-drag');
    for (const a of e.wrap.getAnimations?.() ?? []) a.cancel();
    for (const a of e.sprite.getAnimations?.() ?? []) a.cancel();
    if (this.free.length < (this.o.poolMax ?? 32)) this.free.push(e); else { e.node.dispose(); e.wrap.remove(); }
  }
  private applyPose(e: PieceEntry): void {
    e.wrap.style.width = e.wrap.style.height = this.px + 'px';
    e.wrap.style.transform = `translate3d(${e.x - this.px / 2}px,${e.y - this.px / 2}px,0)`;
    const deg = pieceRotation(e.piece, this.o.seat, this.rotMode, this.o.sprites.rotationFor);
    // 节点自带 data-bk-glyph：只转它的字形层（光源保持左上），整张位图不转；否则转整个精灵
    if (e.node.el.dataset?.bkGlyph) { e.rot.style.transform = ''; e.wrap.style.setProperty('--bk-deg', `${deg}deg`); }
    else { e.rot.style.transform = deg ? `rotate(${deg}deg)` : ''; if (deg) e.wrap.dataset.bkRot = String(deg); else delete e.wrap.dataset.bkRot; }
    e.wrap.setAttribute('aria-label', this.o.label(e.sq, e.piece));
  }
  /** 放置（立即，无动画）；x,y = 中心像素（相对棋盘元素） */
  put(sq: Sq, p: Piece, x: number, y: number): PieceEntry {
    const prev = this.bySq.get(sq); if (prev) this.release(prev);
    const e = this.acquire(p); e.sq = sq; e.piece = p; e.x = x; e.y = y;
    if (!e.wrap.parentNode) this.el.appendChild(e.wrap);
    this.bySq.set(sq, e); this.live.add(e); this.applyPose(e); return e;
  }
  /** 从格子映射里取走（仍留在 DOM / live 中，由调用方决定动画后 release） */
  take(sq: Sq): PieceEntry | null { const e = this.bySq.get(sq); if (!e) return null; this.bySq.delete(sq); return e; }
  /** 把（取走的）条目放到新格；设定终态位置样式（动画由调用方用 WAAPI 从旧位置补间） */
  place(e: PieceEntry, sq: Sq, x: number, y: number): void { e.sq = sq; e.x = x; e.y = y; this.bySq.set(sq, e); this.live.add(e); this.applyPose(e); }
  moveTo(e: PieceEntry, x: number, y: number): void { e.x = x; e.y = y; this.applyPose(e); }
  refresh(e: PieceEntry): void { this.applyPose(e); }
  setPiece(e: PieceEntry, p: Piece): void { e.piece = p; e.node.setPiece(p); this.applyPose(e); }
  clear(): void { for (const e of [...this.live]) this.release(e); this.bySq.clear(); }
  setRotationMode(m: 'none' | 'seat'): void { this.rotMode = m; for (const e of this.live) this.applyPose(e); }
  /** 像素尺寸变了（便宜）：只改容器尺寸与位置；位图仍是旧的（由 CSS 缩放），稍后 remake() 再烘焙 */
  reposition(px: number, center: (sq: Sq) => { x: number; y: number }): void {
    this.px = px;
    for (const e of this.live) { if (e.sq >= 0 && this.bySq.get(e.sq) === e) { const c = center(e.sq); e.x = c.x; e.y = c.y; } this.applyPose(e); }
  }
  /** 用新的像素尺寸重新 make 全部节点（先 await sprites.prepare） */
  remake(px: number): void {
    this.px = px;
    for (const e of this.free) { e.node.dispose(); e.wrap.remove(); } this.free = [];
    for (const e of this.live) { const fresh = this.o.sprites.make(e.piece, px); e.node.dispose(); e.rot.replaceChildren(fresh.el); e.node = fresh; this.applyPose(e); }
  }
  /** 重新按当前格中心摆放全部（朝向 / 布局变化后） */
  relayout(center: (sq: Sq) => { x: number; y: number }): void { for (const e of this.bySq.values()) { const c = center(e.sq); e.x = c.x; e.y = c.y; this.applyPose(e); } }
  destroy(): void { for (const e of [...this.live, ...this.free]) { e.node.dispose(); } this.live.clear(); this.free = []; this.bySq.clear(); this.el.remove(); }
}
