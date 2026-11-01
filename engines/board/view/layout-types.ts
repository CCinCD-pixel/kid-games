// view/layout-types.ts — 布局类型与断言助手（布局纯函数各游戏自带；引擎只提供类型和"全部元素在安全区内、可点 ≥44、互不重叠、底部余量 ≥8"的断言）。
export interface Rect { x: number; y: number; w: number; h: number }
export interface Safe { t: number; r: number; b: number; l: number }
export interface Viewport { w: number; h: number; safe: Safe }
export const rectRight = (r: Rect): number => r.x + r.w;
export const rectBottom = (r: Rect): number => r.y + r.h;
export const safeRect = (vp: Viewport): Rect => ({ x: vp.safe.l, y: vp.safe.t, w: vp.w - vp.safe.l - vp.safe.r, h: vp.h - vp.safe.t - vp.safe.b });
export const rectsOverlap = (a: Rect, b: Rect, eps = 0.5): boolean => a.x < rectRight(b) - eps && b.x < rectRight(a) - eps && a.y < rectBottom(b) - eps && b.y < rectBottom(a) - eps;
export const rectInside = (inner: Rect, outer: Rect, eps = 0.5): boolean => inner.x >= outer.x - eps && inner.y >= outer.y - eps && rectRight(inner) <= rectRight(outer) + eps && rectBottom(inner) <= rectBottom(outer) + eps;

/** 把 aspect = w/h 的内容放进 box，居中，整数像素（棋盘用） */
export function fitRect(box: Rect, aspect: number, align: { x?: 'start' | 'center' | 'end'; y?: 'start' | 'center' | 'end' } = {}): Rect {
  let w = box.w, h = box.w / aspect;
  if (h > box.h) { h = box.h; w = h * aspect; }
  w = Math.floor(w); h = Math.floor(h);
  const ax = align.x ?? 'center', ay = align.y ?? 'center';
  const x = ax === 'start' ? box.x : ax === 'end' ? box.x + box.w - w : box.x + Math.floor((box.w - w) / 2);
  const y = ay === 'start' ? box.y : ay === 'end' ? box.y + box.h - h : box.y + Math.floor((box.h - h) / 2);
  return { x, y, w, h };
}
/** 设计单位 c（一格的像素数） */
export const cellSize = (boardPx: number, viewBoxW: number, unit = 100): number => (boardPx / viewBoxW) * unit;

export interface LayoutRule { name: string; rect: Rect | null | undefined; tappable?: boolean; /** 允许与这些名字重叠（容器 / 叠放） */ overlapOk?: readonly string[] }
export interface LayoutCheckOptions { minTouch?: number; bottomSlack?: number }
/** 断言布局：全部元素在安全区内、可点 ≥ minTouch（默认 44）、互不重叠（overlapOk 除外）、底部余量 ≥ bottomSlack（默认 8）。返回问题列表（空 = 通过） */
export function checkLayout(vp: Viewport, items: readonly LayoutRule[], o: LayoutCheckOptions = {}): string[] {
  const minTouch = o.minTouch ?? 44, slack = o.bottomSlack ?? 8, S = safeRect(vp), bad: string[] = [];
  const list = items.filter((i): i is LayoutRule & { rect: Rect } => !!i.rect);
  for (const i of list) {
    if (!rectInside(i.rect, S)) bad.push(`${i.name} 超出安全区`);
    if (i.tappable && (i.rect.w < minTouch - 0.5 || i.rect.h < minTouch - 0.5)) bad.push(`${i.name} 可点区域 < ${minTouch}px（${Math.round(i.rect.w)}×${Math.round(i.rect.h)}）`);
    if (rectBottom(i.rect) > rectBottom(S) - slack + 0.5 && i.rect.h > 0 && i.tappable) bad.push(`${i.name} 底部余量 < ${slack}px`);
  }
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const A = list[a], B = list[b];
    if (A.overlapOk?.includes(B.name) || B.overlapOk?.includes(A.name)) continue;
    if (rectsOverlap(A.rect, B.rect)) bad.push(`${A.name} 与 ${B.name} 重叠`);
  }
  return bad;
}
/** 常用视口（CSS px）：iPad 9 + 手机；safe = 主屏 App 安全区近似 */
export const VIEWPORTS = {
  ipadP: { w: 810, h: 1080 }, ipadL: { w: 1080, h: 810 }, phoneP: { w: 390, h: 664 }, se: { w: 320, h: 568 }, phoneL: { w: 844, h: 390 },
} as const;
export const SAFE_NONE: Safe = { t: 0, r: 0, b: 0, l: 0 };
export const SAFE_HOME_APP: Record<keyof typeof VIEWPORTS, Safe> = {
  ipadP: { t: 24, r: 0, b: 20, l: 0 }, ipadL: { t: 24, r: 0, b: 20, l: 0 }, phoneP: { t: 47, r: 0, b: 34, l: 0 }, se: { t: 20, r: 0, b: 0, l: 0 }, phoneL: { t: 0, r: 47, b: 21, l: 47 },
};
