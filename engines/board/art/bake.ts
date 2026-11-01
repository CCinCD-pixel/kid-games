// art/bake.ts — 位图棋子烘焙："车削木玩具"圆片（象棋）。字体就绪后才烘焙（防回退字形被永久缓存）；每种 (type, side) 一次，按当前像素尺寸；
// 节点 = <div class="bk-toy"> 内两张 <canvas>（身体层 + 字形层）；f2f 黑方只转字形层，光源保持左上（节点带 data-bk-glyph，piece-layer 据此改写 --bk-deg）。
// 不用 ImageBitmap 当 CSS 背景；DPR ≤ 2。纯 Canvas2D，无依赖。
import type { Piece, PieceNode, PieceSprites } from '../core/types';
import { createRng } from '../core/rng';
import { alpha, lighten } from './shade';

export interface ToySpec {
  hi: string; lo: string; rim: string; side: string;
  /** 字与刻线圈的墨色 */
  ink: string; glyph: string;
  /** 字体 CSS 族与字重；font-size 由烘焙按像素算 */
  family: string; weight: number;
  /** 刻线圈（c ≥ 44 才画；调用方按 px 判断后传入 `ring`） */
  ring: boolean;
  grain: 'wood' | 'lacquer';
  /** 乌木亮缘（≥3:1）与脚下浅色软光晕 */
  edge?: string; halo?: string;
  /** 字号 / 圆片直径（缺省 0.60；c<44 的小棋子放大到 0.67） */
  glyphEm?: number;
  /** 稳定种子：木纹每次烘焙一致 */
  seed: number;
}
export interface ToyOptions { /** 圆片直径 / 节点边长（缺省 0.86） */ diameter?: number; /** 侧面厚度 / 节点边长（缺省 0.07） */ thickness?: number }
export interface Baked { body: HTMLCanvasElement; glyph: HTMLCanvasElement }

const mk = (doc: Document, w: number, h: number): HTMLCanvasElement => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };

/** 画一张圆片：px = 节点边长（CSS 像素），dpr ≤ 2。圆片几何居中偏上，下面留出侧面厚度。 */
export function bakeToy(spec: ToySpec, px: number, dprIn: number, o: ToyOptions = {}, doc: Document = document): Baked {
  const dpr = Math.min(2, Math.max(1, dprIn)); const S = Math.max(8, Math.round(px * dpr));
  const body = mk(doc, S, S), glyph = mk(doc, S, S); const ctx = body.getContext('2d'), gx = glyph.getContext('2d');
  if (!ctx || !gx) return { body, glyph };
  const u = S;                                    // 画布单位 = 设备像素；下面都用相对 u 的比例
  const R = ((o.diameter ?? 0.86) * u) / 2, T = (o.thickness ?? 0.07) * u;
  const cx = u / 2, cy = u / 2 - T / 2 - 0.005 * u;
  const line = Math.max(1.2 * dpr, 0.03 * u);
  const rng = createRng(spec.seed);

  // 脚下软光晕（乌木：让深色子在深靛棋盘上分得出来）
  if (spec.halo) { const g = ctx.createRadialGradient(cx, cy + T * 0.7, R * 0.7, cx, cy + T * 0.7, R + 0.07 * u); g.addColorStop(0, spec.halo); g.addColorStop(1, alpha('#9fb0ee', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy + T * 0.7, R + 0.07 * u, 0, Math.PI * 2); ctx.fill(); }

  // 侧面：下圆 + 连接矩形，上下渐变（下沿更暗）
  { const g = ctx.createLinearGradient(0, cy, 0, cy + T + R); g.addColorStop(0, spec.side); g.addColorStop(1, alpha(spec.side, 1));
    ctx.fillStyle = spec.side; ctx.beginPath(); ctx.arc(cx, cy + T, R, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - R, cy, 2 * R, T);
    const sh = ctx.createLinearGradient(cx - R, 0, cx + R, 0); sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.26)'); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy + T, R, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - R, cy, 2 * R, T); void g; }

  // 面：左上亮 → 右下暗
  { const g = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.4, R * 0.08, cx, cy, R * 1.28); g.addColorStop(0, spec.hi); g.addColorStop(1, spec.lo); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); }

  // 材质（裁剪在面内）
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - line * 0.4, 0, Math.PI * 2); ctx.clip();
  if (spec.grain === 'wood') {
    ctx.lineCap = 'round'; ctx.strokeStyle = alpha(spec.side, 0.16); const n = 4;
    for (let i = 0; i < n; i++) { const y0 = cy - R * 0.8 + ((i + 0.5) / n) * R * 1.6 + (rng.next() - 0.5) * R * 0.12, amp = R * (0.04 + rng.next() * 0.08), ph = rng.next() * 2; ctx.lineWidth = Math.max(0.8 * dpr, u * (0.011 + rng.next() * 0.008));
      ctx.beginPath(); ctx.moveTo(cx - R, y0 + Math.sin(ph) * amp); ctx.bezierCurveTo(cx - R * 0.35, y0 - amp * (1 + rng.next()), cx + R * 0.35, y0 + amp * (1 + rng.next()), cx + R, y0 + Math.sin(ph + 2.4) * amp); ctx.stroke(); }
  } else {
    const g = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.72); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, u, u);
  }
  // 面下沿的内阴影（立体感）
  { const g = ctx.createLinearGradient(0, cy, 0, cy + R); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.16)'); ctx.fillStyle = g; ctx.fillRect(0, 0, u, u); }
  ctx.restore();

  // 外缘：墨线（木）/ 亮缘（乌木）
  ctx.lineWidth = line; ctx.strokeStyle = spec.rim; ctx.beginPath(); ctx.arc(cx, cy, R - line / 2, 0, Math.PI * 2); ctx.stroke();
  if (spec.edge) { ctx.lineWidth = Math.max(1.5 * dpr, 0.022 * u); ctx.strokeStyle = spec.edge; ctx.beginPath(); ctx.arc(cx, cy, R - line - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke(); }
  // 面上缘一线高光（左上）
  { ctx.lineWidth = Math.max(1 * dpr, 0.014 * u); ctx.strokeStyle = alpha(lighten(spec.hi, 0.12, 0.4), 0.7); ctx.beginPath(); ctx.arc(cx, cy, R - line - 0.6 * dpr, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke(); }

  // 字形层（单独一张，供 f2f 旋转）
  if (spec.ring) { gx.lineWidth = Math.max(1 * dpr, 0.016 * u); gx.strokeStyle = alpha(spec.ink, 0.72); gx.beginPath(); gx.arc(cx, cy, R * 0.8, 0, Math.PI * 2); gx.stroke(); }
  const em = (spec.glyphEm ?? (spec.ring ? 0.6 : 0.67)) * 2 * R; gx.font = `${spec.weight} ${em}px ${spec.family}`; gx.textAlign = 'center'; gx.textBaseline = 'alphabetic';
  const m = gx.measureText(spec.glyph); const asc = m.actualBoundingBoxAscent || em * 0.8, desc = m.actualBoundingBoxDescent || em * 0.1; const by = cy + (asc - desc) / 2, bx = cx - ((m.actualBoundingBoxRight || 0) - (m.actualBoundingBoxLeft || 0)) / 2;
  gx.fillStyle = alpha(lighten(spec.hi, 0.1, 0.5), 0.55); gx.fillText(spec.glyph, bx + 0.012 * u, by + 0.016 * u);      // 压印高光（右下偏一点）
  gx.fillStyle = spec.ink; gx.fillText(spec.glyph, bx, by);
  if (!spec.ring) { gx.lineWidth = Math.max(0.9 * dpr, 0.012 * u); gx.strokeStyle = spec.ink; gx.lineJoin = 'round'; gx.strokeText(spec.glyph, bx, by); }      // c<44：0.9 px 同色加粗
  return { body, glyph };
}

export interface ToySpritesConfig {
  /** 全部要烘焙的子（类型 × 颜色） */
  variants: readonly Piece[];
  /** 子 → 烘焙参数；px = 节点边长，据此决定 ring / 字号等 */
  describe(p: Piece, px: number): ToySpec;
  label(p: Piece): string;
  /** 烘焙前要等的字体：document.fonts.load(font, text) */
  fonts?: readonly { font: string; text: string }[];
  options?: ToyOptions;
  /** 等字体的最长毫秒（超时用回退字体烘焙，但标记 stale，字体到了再重烘） */
  fontTimeoutMs?: number;
}
export interface ToySprites extends PieceSprites { /** 当前缓存的变体数 */ readonly cached: number; /** 字体未就绪即烘焙过（等 loadingdone 重烘） */ readonly stale: boolean }

const keyOf = (p: Piece): string => `${p.type}:${p.side}`;
export function createToySprites(cfg: ToySpritesConfig, doc: Document = document): ToySprites {
  const cache = new Map<string, Baked>(); let curPx = 0, curDpr = 1, stale = false; const live = new Set<{ el: HTMLElement; piece: Piece }>(); let bound = false;
  const paint = (n: { el: HTMLElement; piece: Piece }): void => {
    const b = cache.get(keyOf(n.piece)); const [bc, gc] = n.el.children as unknown as [HTMLCanvasElement, HTMLCanvasElement];
    for (const [dst, src] of [[bc, b?.body], [gc, b?.glyph]] as const) { dst.width = src?.width ?? 1; dst.height = src?.height ?? 1; const c = dst.getContext('2d'); if (c && src) c.drawImage(src, 0, 0); }
  };
  const bakeAll = (): void => { cache.clear(); for (const v of cfg.variants) cache.set(keyOf(v), bakeToy(cfg.describe(v, curPx), curPx, curDpr, cfg.options, doc)); for (const n of live) paint(n); };
  const fontsReady = (): boolean => (cfg.fonts ?? []).every((f) => { try { return doc.fonts.check(f.font, f.text); } catch { return true; } });
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> => new Promise((res) => { const t = setTimeout(() => res(undefined), ms); p.then((v) => { clearTimeout(t); res(v); }, () => { clearTimeout(t); res(undefined); }); });
  return {
    get cached() { return cache.size; }, get stale() { return stale; },
    async prepare(px, dpr) {
      if (cfg.fonts?.length && doc.fonts) await withTimeout(Promise.all(cfg.fonts.map((f) => doc.fonts.load(f.font, f.text))), cfg.fontTimeoutMs ?? 2500);
      curPx = px; curDpr = dpr; const ok = fontsReady(); stale = !ok; bakeAll();
      if (!ok && !bound && doc.fonts) { bound = true; doc.fonts.addEventListener('loadingdone', () => { if (stale && fontsReady()) { stale = false; bakeAll(); } }); }
    },
    make(p, _px): PieceNode {
      const el = doc.createElement('div'); el.className = 'bk-toy'; el.dataset.bkGlyph = '1';
      const body = doc.createElement('canvas'), glyph = doc.createElement('canvas'); body.className = 'bk-toy-body'; glyph.className = 'bk-toy-glyph'; el.append(body, glyph);
      const n = { el, piece: p }; live.add(n); paint(n);
      return { el, setPiece(q) { n.piece = q; paint(n); }, dispose() { live.delete(n); } };
    },
    label: cfg.label,
  };
}
