// V14 布局：10 视口 × 3 棋盘屏 + 4 类非棋盘屏（大厅有 / 无存局、学堂、机关人选择、赛前面板）：全部元素在安全区内、可点 ≥44、互不重叠、托盘在外框边距内、底部余量 ≥8、棋盘不超视口。
import { describe, expect, it } from 'vitest';
import { K, layout, layoutHall, layoutMap, layoutRobots, layoutSheet, type Screen, type Vp } from '../src/app/layout';
import { check, checkScreens } from '../src/app/layout-check';

export const VPS: [string, Vp][] = [
  ['ipadP 810×1080', { w: 810, h: 1080, safe: { t: 24, r: 0, b: 0, l: 0 } }], ['ipadL 1080×810', { w: 1080, h: 810, safe: { t: 24, r: 0, b: 0, l: 0 } }],
  ['phoneP 390×664（Safari 窗口）', { w: 390, h: 664, safe: { t: 0, r: 0, b: 0, l: 0 } }], ['phoneP 390×844（主屏 App）', { w: 390, h: 844, safe: { t: 47, r: 0, b: 34, l: 0 } }],
  ['se 320×568（Safari）', { w: 320, h: 568, safe: { t: 0, r: 0, b: 0, l: 0 } }], ['se 320×568（主屏 App）', { w: 320, h: 568, safe: { t: 20, r: 0, b: 0, l: 0 } }],
  ['phoneL 844×390（Safari）', { w: 844, h: 390, safe: { t: 0, r: 0, b: 0, l: 0 } }], ['phoneL 844×390（主屏 App）', { w: 844, h: 390, safe: { t: 0, r: 47, b: 21, l: 47 } }],
  ['ipad-air 820×1180（冒烟）', { w: 820, h: 1180, safe: { t: 24, r: 0, b: 0, l: 0 } }], ['ipad-mini-L 1133×744（冒烟）', { w: 1133, h: 744, safe: { t: 24, r: 0, b: 0, l: 0 } }],
];

describe('V14 布局（纯函数）', () => {
  for (const [nm, vp] of VPS) for (const screen of ['game', 'f2f', 'lesson'] as Screen[]) {
    it(`${nm} · ${screen}`, () => {
      const L = layout(vp, { screen }); const errs = check(L, vp); const slack = L.portrait ? vp.h - vp.safe.b - ((L.dock?.y ?? 0) + (L.dock?.h ?? 0)) : vp.h - vp.safe.b - (L.board.y + L.board.h);
      if (slack < K.SLACK - 1) errs.push(`底部余量 ${slack} < ${K.SLACK}`); expect(errs).toEqual([]);
    });
  }
  for (const [nm, vp] of VPS) for (const screen of ['game', 'f2f', 'lesson'] as Screen[]) for (const [tag, o] of [['竖线号', { coords: true }], ['左手', { lefty: true }], ['竖线号 + 左手', { coords: true, lefty: true }]] as const) {
    it(`${nm} · ${screen} · ${tag}`, () => {
      const L = layout(vp, { screen, ...o }); const errs = check(L, vp); const slack = L.portrait ? vp.h - vp.safe.b - ((L.dock?.y ?? 0) + (L.dock?.h ?? 0)) : vp.h - vp.safe.b - (L.coordRow ? L.coordRow.y + L.coordRow.h : L.board.y + L.board.h);
      if (slack < K.SLACK - 1) errs.push(`底部余量 ${slack} < ${K.SLACK}`); expect(errs).toEqual([]);
      if (o.coords && !(screen === 'lesson' && L.phone)) expect(L.coordRow).not.toBeNull();
      if (o.lefty && !L.portrait && screen !== 'f2f') { expect(L.board.x).toBeGreaterThan(L.panel!.x); expect(L.keys.every((k) => k.x < L.board.x)).toBe(true); }
      if (o.lefty && L.portrait && screen !== 'f2f' && !L.phone) { expect(L.keys[0].x).toBeLessThan(L.companion.x); }
    });
  }
  for (const [nm, vp] of VPS) it(`${nm} · 非棋盘屏（大厅 / 学堂 / 机关人 / 赛前面板）`, () => { expect(checkScreens(vp)).toEqual([]); });
  it('规定视口的 c（规格 §2.2 表）', () => {
    const c = (i: number, s: Screen = 'game'): number => layout(VPS[i][1], { screen: s }).c;
    expect([c(0), c(1), c(2), c(4), c(6)]).toEqual([81, 76, 40, 32, 37]);   // iPad 竖 / 横 · 手机竖 · SE 竖 · 手机横
    expect(layout(VPS[0][1]).trays.mode).toBe('frame'); { const L = layout(VPS[0][1]); const t = L.trays as { top: { y: number; h: number } }; expect(t.top.y).toBeGreaterThanOrEqual(L.dock!.y); }   // 托盘在 dock 里，不在棋盘外框边距里 expect(layout(VPS[2][1]).trays.mode).toBe('chip');
  });
  it('棋盘外框 9.1c × 10.1c，且随 viewport 单调不变形', () => { for (const [, vp] of VPS) { const L = layout(vp); expect(L.board.w).toBeCloseTo(9.1 * L.c, 0); expect(L.board.h).toBeCloseTo(10.1 * L.c, 0); } });
  it('各屏函数无副作用、同输入同输出', () => { const vp = VPS[0][1]; expect(layout(vp)).toEqual(layout(vp)); expect(layoutHall(vp, { hasResume: true })).toEqual(layoutHall(vp, { hasResume: true })); expect(layoutMap(vp).map.h).toBeGreaterThan(200); expect(layoutRobots(vp).cards.length).toBe(6); expect(layoutSheet(VPS[4][1]).fits).toBe(true); });
});

// QA r2 M2：结果卡永远在视口里——整张卡在安全区内、不压 🏠（用各屏 layout 里的真实 🏠 位置）、够高放下"标题 + 两三行字 + 按键行"。
import { resultBox } from '../src/app/layout';
describe('结果卡盒子 resultBox', () => {
  for (const [nm, vp] of VPS) for (const screen of ['game', 'f2f', 'lesson'] as Screen[]) {
    it(`${nm} · ${screen}`, () => {
      const home = layout(vp, { screen }).home; const R0 = resultBox(vp, home); const b = R0.box; const S = { x: vp.safe.l, y: vp.safe.t, r: vp.w - vp.safe.r, b: vp.h - vp.safe.b };
      expect(b.x).toBeGreaterThanOrEqual(S.x); expect(b.y).toBeGreaterThanOrEqual(S.y); expect(b.x + b.w).toBeLessThanOrEqual(S.r); expect(b.y + b.h).toBeLessThanOrEqual(S.b);
      const hit = b.x < home.x + home.w && b.x + b.w > home.x && b.y < home.y + home.h && b.y + b.h > home.y; expect(hit, `压到 🏠 ${JSON.stringify(home)} vs ${JSON.stringify(b)}`).toBe(false);
      expect(b.h, '卡片可用高度').toBeGreaterThanOrEqual(R0.cols === 2 ? 280 : 440); expect(b.w).toBeGreaterThanOrEqual(R0.cols === 2 ? 560 : 288);
      expect(R0.cols).toBe(vp.w > vp.h && vp.h < 560 ? 2 : 1);
    });
  }
});

// QA r2 m3：竖屏 dock 里的键行 / 伙伴 / 吃子小标离面板边线 ≥ 8 px（原先键下沿与面板圆角边线重合）。
describe('dock 内边距', () => {
  for (const [nm, vp] of VPS) for (const screen of ['game', 'f2f', 'lesson'] as Screen[]) for (const lefty of [false, true]) {
    if (vp.h < vp.w) continue;
    it(`${nm} · ${screen}${lefty ? ' · 左手' : ''}`, () => {
      const L = layout(vp, { screen, lefty }); const d = L.dock!; const errs: string[] = [];
      for (const [i, k] of L.keys.entries()) { if (k.y + k.h > d.y + d.h - 8) errs.push(`键${i}下沿贴边 ${d.y + d.h - (k.y + k.h)}`); if (k.x < d.x + 8) errs.push(`键${i}左贴边`); if (k.x + k.w > d.x + d.w - 8) errs.push(`键${i}右贴边 ${d.x + d.w - (k.x + k.w)}`); }
      if (L.trays.mode === 'chip') { const c = L.trays.chip; if (c.y < d.y + 4) errs.push(`吃子小标压上沿 ${c.y - d.y}`); if (c.x < d.x + 6 || c.x + c.w > d.x + d.w - 6) errs.push(`吃子小标贴左 / 右边线 ${c.x - d.x} / ${d.x + d.w - c.x - c.w}`); }
      if (L.companion.y < d.y + 4 && screen !== 'f2f') errs.push(`伙伴压上沿 ${L.companion.y - d.y}`);
      expect(errs).toEqual([]);
    });
  }
});
