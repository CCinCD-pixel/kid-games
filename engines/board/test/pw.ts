// engines/board/test/pw.ts — Playwright 助手（仅测试用；import 自 spec，不进游戏包）。
// 约定：页面暴露 window.__board = { view, input, game, rules, idle, ready, rectOf(sq), events, ... }（游乐场 site/dev/board 与各游戏页都照此暴露）。
// 点按用真触摸（page.touchscreen）；拖动用在棋盘元素上派发的合成 PointerEvent（touch 型）——Playwright 的 touchscreen 只有 tap。
// 所有 spec：try/finally 关浏览器（Playwright 的 fixture 已做）、?mute=1（kit 在 webdriver 下自动静音）；截图必须人眼看过。
import type { Page } from '@playwright/test';
import { SAFE_HOME_APP, VIEWPORTS } from '../view/layout-types';

export const PW_VIEWPORTS = {
  ipadP: { ...VIEWPORTS.ipadP, safeQuery: '24,0,20,0', safe: SAFE_HOME_APP.ipadP }, ipadL: { ...VIEWPORTS.ipadL, safeQuery: '24,0,20,0', safe: SAFE_HOME_APP.ipadL },
  phoneP: { ...VIEWPORTS.phoneP, safeQuery: '47,0,34,0', safe: SAFE_HOME_APP.phoneP }, se: { ...VIEWPORTS.se, safeQuery: '20,0,0,0', safe: SAFE_HOME_APP.se }, phoneL: { ...VIEWPORTS.phoneL, safeQuery: '0,47,21,47', safe: SAFE_HOME_APP.phoneL },
} as const;
export type PwViewport = keyof typeof PW_VIEWPORTS;
export interface PxRect { x: number; y: number; w: number; h: number }
export interface BoardSnapshot { fen: string; encoded: string[]; mode: string; selected: number | null; locked: boolean; ignoredTaps: number; idle: boolean; pieces: { sq: number; side: number; type: number; x: number; y: number }[]; marks: { kind: string; sqs: number[] }[]; events: string[] }
export interface DragOptions { steps?: number; holdMs?: number; end?: 'drop' | 'cancel' | 'lost'; pointerId?: number; toPx?: { x: number; y: number } }

export function boardPage(page: Page) {
  const sqOf = async (s: string | number): Promise<number> => (typeof s === 'number' ? s : page.evaluate((nm) => { const b = (window as any).__board; for (let q = 0; q < b.rules.geometry.squares; q++) if (b.rules.geometry.name(q) === nm) return q; throw new Error('no square ' + nm); }, s)); // eslint-disable-line @typescript-eslint/no-explicit-any
  const center = async (s: string | number): Promise<{ x: number; y: number }> => { const sq = await sqOf(s); return page.evaluate((q) => { const r = (window as any).__board.rectOf(q); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }, sq); }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const api = {
    sqOf, center,
    async waitReady(): Promise<void> { await page.evaluate(() => (window as any).__board.ready); }, // eslint-disable-line @typescript-eslint/no-explicit-any
    async waitIdle(timeout = 8000): Promise<void> { await page.waitForFunction(() => (window as any).__board.idle, null, { timeout }); }, // eslint-disable-line @typescript-eslint/no-explicit-any
    /** 真触摸点按；offset = 离格中心的偏移（单位：格） */
    async tapSq(s: string | number, offset: { dx?: number; dy?: number } = {}): Promise<void> {
      const c = await center(s); const cell = await page.evaluate(() => (window as any).__board.view.cellPx as number); // eslint-disable-line @typescript-eslint/no-explicit-any
      await page.touchscreen.tap(c.x + (offset.dx ?? 0) * cell, c.y + (offset.dy ?? 0) * cell);
    },
    /** 合成触摸拖动（PointerEvent）；end: drop = 松手，cancel = pointercancel，lost = lostpointercapture */
    async dragSq(from: string | number, to: string | number | null, o: DragOptions = {}): Promise<void> {
      const a = await center(from); const b = o.toPx ?? (to === null ? { x: -50, y: -50 } : await center(to));
      await page.evaluate(async ({ a, b, steps, hold, end, id }) => {
        const el = document.querySelector('.bk-board') as HTMLElement; const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
        const mk = (type: string, x: number, y: number): PointerEvent => new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 });
        el.dispatchEvent(mk('pointerdown', a.x, a.y)); await frame();
        for (let i = 1; i <= steps; i++) { el.dispatchEvent(mk('pointermove', a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)); await frame(); }
        if (hold) await new Promise((r) => setTimeout(r, hold));
        el.dispatchEvent(mk(end === 'cancel' ? 'pointercancel' : end === 'lost' ? 'lostpointercapture' : 'pointerup', b.x, b.y));
      }, { a, b, steps: o.steps ?? 8, hold: o.holdMs ?? 0, end: o.end ?? 'drop', id: o.pointerId ?? 41 });
    },
    /** 第二根手指：在 (x,y) 派发一个非主指 pointerdown（应被忽略并计入 ignoredTaps） */
    async secondFinger(s: string | number): Promise<void> {
      const c = await center(s); await page.evaluate((c2) => { const el = document.querySelector('.bk-board') as HTMLElement; el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'touch', isPrimary: false, clientX: c2.x, clientY: c2.y, bubbles: true })); }, c);
    },
    async state(): Promise<BoardSnapshot> {
      return page.evaluate(() => { const b = (window as any).__board; const d = b.view.debug(); return { fen: b.fen(), encoded: b.encoded(), mode: b.input.mode, selected: b.input.selected, locked: b.input.locked, ignoredTaps: b.input.ignoredTaps, idle: b.idle, pieces: d.pieces, marks: d.marks, events: [...b.events] }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    /** 当前高亮：legal / capture / select 的格名 */
    async legalMarks(): Promise<{ legal: string[]; capture: string[]; select: string[] }> {
      return page.evaluate(() => { const b = (window as any).__board; const nm = (s: number[]): string[] => s.map((q) => b.rules.geometry.name(q)).sort(); const m = b.view.debug().marks as { kind: string; sqs: number[] }[]; const pick = (k: string): string[] => nm(m.filter((x) => x.kind === k).flatMap((x) => x.sqs)); return { legal: pick('legal'), capture: pick('capture'), select: pick('select') }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    /** 视图与状态一致：每格的棋子（类型 / 颜色）与 rules.pieceAt 相同，且无多余节点 */
    async viewMatchesState(): Promise<string | null> {
      return page.evaluate(() => { const b = (window as any).__board; const g = b.rules.geometry; const s = b.game.state(); const pcs = b.view.debug().pieces as { sq: number; side: number; type: number; x: number; y: number }[]; const r = b.view.el.getBoundingClientRect(); void r;
        const exp = new Map<number, string>(); for (let q = 0; q < g.squares; q++) { const p = b.rules.pieceAt(s, q); if (p) exp.set(q, `${p.type}:${p.side}`); }
        if (pcs.length !== exp.size) return `棋子数 ${pcs.length} ≠ ${exp.size}`; for (const p of pcs) { if (exp.get(p.sq) !== `${p.type}:${p.side}`) return `${g.name(p.sq)} 视图 ${p.type}:${p.side} ≠ 状态 ${exp.get(p.sq)}`; const c = g.center(p.sq, b.view.orientation); const cell = b.view.cellPx / g.unit; if (Math.abs(p.x - c.x * cell) > 1.5 || Math.abs(p.y - c.y * cell) > 1.5) return `${g.name(p.sq)} 位置 (${p.x.toFixed(1)},${p.y.toFixed(1)}) ≠ (${(c.x * cell).toFixed(1)},${(c.y * cell).toFixed(1)})`; }
        return null; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    async expectInViewport(selector = '.bk-board'): Promise<string | null> { return page.evaluate((sel) => { const r = (document.querySelector(sel) as HTMLElement).getBoundingClientRect(); return r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 ? null : `${sel} 超出视口：${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)} / ${innerWidth}×${innerHeight}`; }, selector); },
    async expectNoOverflow(): Promise<string | null> { return page.evaluate(() => { const de = document.documentElement; return de.scrollWidth <= innerWidth + 1 && de.scrollHeight <= innerHeight + 1 ? null : `页面可滚动：${de.scrollWidth}×${de.scrollHeight} > ${innerWidth}×${innerHeight}`; }); },
    /** DOM 矩形 ≈ 布局函数输出（±1 px）：expected = { 选择器: 矩形 } */
    async expectLayout(expected: Record<string, PxRect>): Promise<string[]> {
      return page.evaluate((exp) => { const bad: string[] = []; for (const [sel, r] of Object.entries(exp)) { const el = document.querySelector(sel) as HTMLElement | null; if (!el) { bad.push(`${sel} 不存在`); continue; } const b = el.getBoundingClientRect(); if (Math.abs(b.left - r.x) > 1 || Math.abs(b.top - r.y) > 1 || Math.abs(b.width - r.w) > 1 || Math.abs(b.height - r.h) > 1) bad.push(`${sel}: DOM ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)}×${Math.round(b.height)} ≠ ${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)}×${Math.round(r.h)}`); } return bad; }, expected);
    },
    async shotBoard(path: string): Promise<void> { await page.screenshot({ path }); },
  };
  return api;
}
