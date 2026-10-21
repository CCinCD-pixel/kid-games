// site/xiangqi/src/app/layout-check.ts — 布局断言（只在 vitest / 开发工具里 import，不进页面包）。
import { K, bottom, layoutHall, layoutMap, layoutRobots, layoutSheet, right, type Layout, type Rect, type Vp } from './layout';
const R = (x: number, y: number, w: number, h: number): Rect => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
// ---- 校验：一切可见元素在安全区内、可点元素 ≥44、互不重叠（嵌套除外）----
export function check(L: Layout, vp: Vp): string[] {
  const errs: string[] = []; const S = L.S; const inside = (r: Rect | null | undefined, nm: string): void => { if (!r) return; if (r.x < S.x - 0.5 || r.y < S.y - 0.5 || right(r) > right(S) + 0.5 || bottom(r) > bottom(S) + 0.5) errs.push(`${nm} 出界 ${JSON.stringify(r)} 安全区 ${JSON.stringify(S)}`); };
  const touch = (r: Rect | null | undefined, nm: string): void => { if (r && (r.w < K.TOUCH || r.h < K.TOUCH)) errs.push(`${nm} 小于 44：${r.w}×${r.h}`); };
  const named: Record<string, Rect | null> = { board: L.board, home: L.home, skip: L.skip, dock: L.dock, panel: L.panel, companion: L.companion, bubble: L.bubble, dots: L.dots };
  for (const [k, r] of Object.entries(named)) inside(r, k); L.keys.forEach((r, i) => { inside(r, 'key' + i); touch(r, 'key' + i); });
  touch(L.home, 'home'); touch(L.skip, 'skip'); if (L.trays.mode === 'frame') { inside(L.trays.top, 'trayTop'); inside(L.trays.bottom, 'trayBottom'); } else if (L.trays.mode === 'chip') { if ((L.trays as { chip?: Rect }).chip) { inside((L.trays as { chip?: Rect }).chip, 'chip'); touch((L.trays as { chip?: Rect }).chip, 'chip'); } inside(L.popover, 'popover'); }
  for (const cl of [L.blackCluster, L.redCluster]) if (cl) cl.keys.forEach((r, i) => { inside(r, 'clusterKey' + i); touch(r, 'clusterKey' + i); });
  // 托盘在 dock / 面板里（不再压在棋盘外框边距里：端线棋子半径占满了边距）；竖线号行在棋盘正下方、dock 之上
  if (L.trays.mode === 'frame') for (const t of [L.trays.top, L.trays.bottom]) { if (L.dock && !(t.x >= L.dock.x && right(t) <= right(L.dock) && t.y >= L.dock.y && bottom(t) <= bottom(L.dock))) errs.push('托盘不在 dock 内'); if (L.panel && !(t.x >= L.panel.x && right(t) <= right(L.panel) && t.y >= L.panel.y && bottom(t) <= bottom(L.panel))) errs.push('托盘不在面板内'); }
  if (L.coordRow) { inside(L.coordRow, 'coordRow'); if (L.coordRow.y < bottom(L.board)) errs.push('竖线号行压在棋盘上'); if (L.dock && L.coordRow.y + L.coordRow.h > L.dock.y) errs.push('竖线号行压在 dock 上'); }
  // 互不重叠：叶子元素两两不重叠；棋盘与 dock/面板不重叠；dock/面板里的元素在容器内
  const ov = (a: Rect | null | undefined, b: Rect | null | undefined): boolean | null | undefined => a && b && a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
  const within = (a: Rect | null | undefined, c: Rect | null | undefined): boolean | null | undefined => a && c && a.x >= c.x && a.y >= c.y && right(a) <= right(c) && bottom(a) <= bottom(c);
  const container = L.dock || L.panel; if (ov(L.board, container)) errs.push('棋盘与 dock/面板重叠');
  const leaves: Record<string, Rect | null | undefined> = { ...(L.trays.mode === 'frame' ? { trayTop: L.trays.top, trayBottom: L.trays.bottom } : {}), home: L.home, skip: L.skip, chip: (L.trays as { chip?: Rect }).chip, companion: L.companion, bubble: L.bubble, dots: L.dots, ...Object.fromEntries(L.keys.map((r, i) => ['key' + i, r])), ...(L.blackCluster ? Object.fromEntries(L.blackCluster.keys.map((r, i) => ['bk' + i, r])) : {}) };
  const names = Object.keys(leaves).filter((k) => leaves[k]);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (ov(leaves[names[i]], leaves[names[j]])) errs.push(`${names[i]} 与 ${names[j]} 重叠`);
  for (const k of names) { if (k === 'home' || k === 'skip') continue; if (L.dock && !within(leaves[k], L.dock) && !k.startsWith('bk')) errs.push(`${k} 不在 dock 内`); if (L.panel && !within(leaves[k], L.panel)) errs.push(`${k} 不在面板内`); }
  for (const k of names) if (ov(leaves[k], L.board) && !(k === 'home')) errs.push(`${k} 压在棋盘上`); if (ov(L.home, L.board)) errs.push('home 压在棋盘上');
  if (L.c < 30) errs.push('c 太小 ' + L.c);
  if (L.c * 10.1 > vp.h || L.c * 9.1 > vp.w) errs.push('棋盘大于视口');
  return errs;
}


export function checkScreens(vp: Vp): string[] { const errs: string[] = []; const S = R(vp.safe.l, vp.safe.t, vp.w - vp.safe.l - vp.safe.r, vp.h - vp.safe.t - vp.safe.b); const inS = (r: Rect | null | undefined, nm: string): void => { if (r && (r.x < S.x - 0.5 || r.y < S.y - 0.5 || right(r) > right(S) + 0.5 || bottom(r) > bottom(S) + 0.5)) errs.push(`${nm} 出界 ${JSON.stringify(r)}`); }; const ov = (a: Rect | null | undefined, b: Rect | null | undefined): boolean | null | undefined => a && b && a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
  for (const hasResume of [false, true]) { const H = layoutHall(vp, { hasResume }); const parts: Record<string, Rect | null> = { home: H.home, settings: H.settings, d0: H.doors[0], d1: H.doors[1], d2: H.doors[2], resume: H.resume, shelf: H.shelf, wall: H.wall, companion: H.companion, bubble: H.bubble }; const ns = Object.keys(parts).filter((k) => parts[k]); for (const k of ns) inS(parts[k], 'hall.' + k); for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) if (ov(parts[ns[i]], parts[ns[j]])) errs.push(`hall.${ns[i]} 与 ${ns[j]} 重叠(resume=${hasResume})`); for (const d of H.doors) if (d.w < 88 || d.h < 110) errs.push('hall 门太小 ' + d.w + '×' + d.h); if (H.shelf.h < 56 || H.wall.h < 48) errs.push('hall 陈列架/印墙过矮'); }
  const M = layoutMap(vp); for (const [k, r] of Object.entries({ head: M.head, home: M.home, placement: M.placement, map: M.map, dock: M.dock })) inS(r, 'map.' + k); if (M.map.h < 200) errs.push('学堂地图区过矮 ' + M.map.h); if (M.placement.h < K.TOUCH) errs.push('摸底条 <44');
  const Rb = layoutRobots(vp); for (const c of Rb.cards) { inS(c, 'robots.card'); if (c.w < 120 || c.h < 100) errs.push('机关人卡过小 ' + c.w + '×' + c.h); } inS(Rb.btn, 'robots.btn');
  const Sh = layoutSheet(vp); if (!Sh.fits) errs.push(`赛前面板需要 ${Sh.need} > 可用 ${S.h - 16}`); inS(Sh.sheet, 'sheet'); for (const r of Object.values(Sh.items)) { inS(r, 'sheet.item'); if (r.h < K.TOUCH && r.h !== 76 && r.h !== 96) errs.push('面板项 <44'); }
  return errs; }
