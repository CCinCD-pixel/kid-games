/**
 * `?dev=style` style board (spec §6.12): every gem × state on both tile colours, specials with their
 * idle frames, blockers, the star gate, scene thumbnails both orientations, the ship and paint options,
 * HUD samples. Self-review page for "does this look cheap?".
 */
import { buildAtlas } from '../view/atlas';
import { BOARD, GEMS } from '../view/art/palette';
import type { SceneKey } from '../view/art/sky';
import { backdrop } from '../view/backdrop';
import { shipSvg, PAINTS } from '../view/art/ship';
import { planetSvg, type PlanetKey } from '../view/art/planets';
import { dustSvg, energySvg } from '../view/icons';
import { gemSvg } from '../view/art/gems';

export async function mountStyleBoard(root: HTMLElement): Promise<void> {
  const cell = 96, dpr = Math.min(2, devicePixelRatio || 1);
  const atlas = await buildAtlas(Math.round(cell * dpr));
  const el = document.createElement('div');
  el.className = 'em-style';
  root.append(el);
  const sec = (title: string) => { const h = document.createElement('h2'); h.textContent = title; el.append(h); const row = document.createElement('div'); row.className = 'em-style__row'; el.append(row); return row; };
  const tile = (row: HTMLElement, label: string, draw: (c: CanvasRenderingContext2D) => void, tileCol: string = BOARD.tileA) => {
    const wrap = document.createElement('div'); wrap.className = 'em-style__cell';
    const cv = document.createElement('canvas'); cv.width = cell * dpr; cv.height = cell * dpr; cv.style.width = cv.style.height = `${cell}px`;
    const c = cv.getContext('2d')!; c.scale(dpr, dpr);
    c.fillStyle = '#141a3d'; c.fillRect(0, 0, cell, cell);
    c.fillStyle = tileCol; c.beginPath(); c.roundRect(1, 1, cell - 2, cell - 2, cell * 0.1); c.fill();
    draw(c);
    wrap.append(cv, Object.assign(document.createElement('span'), { textContent: label }));
    row.append(wrap);
  };
  const at = (c: CanvasRenderingContext2D, key: string, s = 1) => atlas.draw(c, key, cell / 2, cell / 2, cell, s, s);
  const dust = (c: CanvasRenderingContext2D, lv: number) => { c.fillStyle = lv > 1 ? 'rgba(126,111,163,.92)' : 'rgba(169,155,196,.82)'; c.beginPath(); c.roundRect(3, 3, cell - 6, cell - 6, cell * 0.12); c.fill(); };
  for (const tileCol of [BOARD.tileA, BOARD.tileB]) {
    const row = sec(`晶石 × 状态（格子 ${tileCol}）`);
    for (const g of [0, 2, 3, 4, 5, 1]) {
      tile(row, GEMS[g].name, (c) => at(c, `gem${g}`), tileCol);
      tile(row, '选中', (c) => { at(c, `gem${g}`, 1.12); c.strokeStyle = 'rgba(255,240,180,.95)'; c.lineWidth = 4; c.shadowColor = '#fff3c4'; c.shadowBlur = 12; c.beginPath(); c.roundRect(4, 4, cell - 8, cell - 8, cell * 0.16); c.stroke(); }, tileCol);
      tile(row, '冰 1', (c) => { at(c, `gem${g}`); at(c, 'ice1'); }, tileCol);
      tile(row, '冰 2', (c) => { at(c, `gem${g}`); at(c, 'ice2'); }, tileCol);
      tile(row, '星尘上', (c) => { dust(c, 1); at(c, `gem${g}`); }, tileCol);
    }
  }
  const sp = sec('道具与待机动画');
  for (let f = -1; f < 5; f += 1) tile(sp, `横火箭 ${f}`, (c) => at(c, `rh${f}`));
  tile(sp, '竖火箭', (c) => at(c, 'rv-1'));
  for (let f = 0; f < 4; f += 1) tile(sp, `无人机 ${f}`, (c) => at(c, `prop${f}`));
  for (let f = 0; f < 3; f += 1) tile(sp, `星爆弹 ${f}`, (c) => at(c, `bomb${f}`));
  for (let f = 0; f < 8; f += 2) tile(sp, `星核 ${f}`, (c) => at(c, `orb${f}`));
  const bl = sec('障碍与格子层');
  tile(bl, '纸箱', (c) => at(c, 'crate1')); tile(bl, '铁箱', (c) => at(c, 'crate2')); tile(bl, '铁箱（裂）', (c) => at(c, 'crate2d')); tile(bl, '钛箱 v2', (c) => at(c, 'crate3'));
  tile(bl, '星尘 1', (c) => dust(c, 1)); tile(bl, '星尘 2', (c) => dust(c, 2)); tile(bl, '暗物质 v2', (c) => at(c, 'goo0')); tile(bl, '救援舱 v2', (c) => at(c, 'pod'));
  const ic = sec('目标卡图标');
  for (const svg of [gemSvg(2), dustSvg(1), dustSvg(2), energySvg(0.6)]) { const d = document.createElement('div'); d.style.width = d.style.height = '72px'; d.innerHTML = svg; ic.append(d); }
  const sc = sec('场景（竖 / 横）');
  for (const k of ['route', 'ep1', 'ep2', 'ep3', 'ep4'] as SceneKey[]) for (const land of [false, true]) { const d = document.createElement('div'); d.className = `em-style__thumb${land ? '' : ' is-p'}`; d.innerHTML = backdrop(k, land); sc.append(d); }
  const pl = sec('航线星球');
  for (const k of ['dock', 'moon', 'mars', 'belt', 'jupiter', 'saturn', 'neptune', 'pluto', 'earth'] as PlanetKey[]) { const d = document.createElement('div'); d.style.width = d.style.height = '112px'; d.innerHTML = planetSvg(k, ['jupiter', 'saturn', 'neptune', 'pluto', 'earth'].includes(k)); pl.append(d); }
  const sh = sec('星晶号：未装 / 全装 两种涂装');
  for (const paint of [null, 0, 1] as const) {
    const d = document.createElement('div'); d.style.width = '300px';
    d.innerHTML = shipSvg(paint === null ? {} : { thrusters: PAINTS.thrusters[paint], legs: PAINTS.legs[paint], arm: PAINTS.arm[paint], shield: PAINTS.shield[paint] });
    sh.append(d);
  }
}
