/**
 * Style board (spec §6.7, `?dev=styleboard`): every tile, crate, pad, robot facing × expression,
 * cosmetics, the four v1 halls, the signals on each crate colour and the occlusion cases — drawn
 * with the production renderers, one canvas, for the self-review and Dad's review.
 */
import { parseLevel } from '@engines/puzzle/src/level';
import type { Level } from '@engines/puzzle/src/types';
import { mountSky } from '../render/backdrop';
import { ROBOT_FEET } from '../render/layout';
import { drawCrate, drawPadMarks } from '../render/crate';
import { chapterEmblem } from '../art/emblems';
import { drawArrow, drawDeadBadge, drawDeadFrame, drawFootprints, drawHintRing, drawLockRing, drawRoute, drawUnreachable } from '../render/fx';
import { HALLS, type HallKit } from '../render/halls';
import { EXPRESSIONS, drawRobot, restPose, type Facing, type RobotPose } from '../render/robot';
import { drawFloor, drawPadBase, drawShadow, drawWallRow, type TileView } from '../render/tiles';
import { ROCKET_H, RocketSprite, drawDestination, restRocket, type RocketKind } from '../render/rocket';

const SAMPLE = ['########', '#-.--#-#', '#-$#-$-#', '#--##-.#', '#-@--*-#', '########'];
const CLOSE = ['#######', '#--.--#', '#-$-#-#', '#-@-*-#', '#######'];

interface Extra {
  robot?: { cell: number; pose: Partial<RobotPose> };
  crates?: { cell: number; color: number; dead?: boolean }[];
}

function room(ctx: CanvasRenderingContext2D, l: Level, hall: HallKit, x: number, y: number, s: number, extra: Extra = {}): void {
  const t: TileView = { ctx, level: l, hall, levelId: 'styleboard', s, ox: x, oy: y };
  drawShadow(t);
  drawFloor(t);
  const crates = extra.crates ?? Array.from(l.start.boxes, (cell, i) => ({ cell, color: l.colorOf[i], dead: false }));
  const robot = extra.robot ?? { cell: l.start.player, pose: {} };
  for (let r = 0; r < l.H; r += 1) {
    drawWallRow(t, r);
    for (const c of crates) {
      if (((c.cell / l.W) | 0) !== r) continue;
      const cx = x + (c.cell % l.W) * s;
      const cy = y + r * s;
      const on = l.goal[c.cell] === c.color;
      if (on) drawPadMarks(ctx, cx, cy, s, c.color);
      drawCrate(ctx, cx, cy, s, { color: c.color, lock: on ? 1 : 0, dead: c.dead });
      if (c.dead) {
        drawDeadFrame(ctx, cx, cy, s, 1);
        drawDeadBadge(ctx, cx + 0.5 * s, cy + 0.28 * s, s, 1);
      }
    }
    if (((robot.cell / l.W) | 0) === r) drawRobot(ctx, x + ((robot.cell % l.W) + 0.5) * s, y + (r + ROBOT_FEET) * s, s, { ...restPose(1), ...robot.pose });
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 16): void {
  ctx.save();
  ctx.font = `700 ${size}px "XG WenKai", "PingFang SC", system-ui, sans-serif`;
  ctx.fillStyle = '#FFFAF0';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color = 'rgba(251, 243, 227, 0.94)'): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.restore();
}

export async function mountStyleboard(host: HTMLElement): Promise<HTMLCanvasElement> {
  document.documentElement.classList.remove('kit-lock-scroll');
  document.body.classList.add('sok-styleboard');
  const W = window.innerWidth;
  const portrait = W < window.innerHeight;
  const H = portrait ? 5900 : 5120;
  // iOS Safari refuses canvases above ~16.7 M pixels: trade a little sharpness for a board that renders
  const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(16e6 / (W * H)));
  const cv = document.createElement('canvas');
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  cv.className = 'sok-styleboard__canvas';
  host.append(cv);
  mountSky(document.body, 'earth', 'styleboard');
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  label(ctx, '星港搬运工 · 风格板 v1（全部代码绘制，零位图）', 20, 14, 22);
  let y = 56;
  // 0. close-up at the largest cell size
  label(ctx, '特写 s = 96：墙（凸角圆角、纸边高光、正面厚度）、地板、发射台、补给箱（空 / 入位）、小推', 20, y);
  y += 30;
  const close = parseLevel(CLOSE);
  room(ctx, close, HALLS.tiangong, 30, y + 0.32 * 96 + 8, 96);
  y += 5 * 96 + 70;
  // 1. halls
  label(ctx, '四个 v1 货运厅：天宫厅 / 月宫厅 / 火星厅 / 经典厅', 20, y);
  y += 30;
  const lvl = parseLevel(SAMPLE);
  const hallS = portrait ? 44 : 56;
  (['tiangong', 'moon', 'mars', 'classic'] as const).forEach((id, i) => {
    const col = i % 2;
    const row = (i / 2) | 0;
    const x = 26 + col * (8 * hallS + 40);
    const yy = y + 26 + row * (6 * hallS + 66);
    label(ctx, HALLS[id].name, x, yy - 24, 15);
    room(ctx, lvl, HALLS[id], x, yy + 0.32 * hallS, hallS);
  });
  y += 2 * (6 * hallS + 66) + 20;
  // 2. crates × state + pads
  label(ctx, '补给箱 5 色 × 空 / 入位 / 死局，发射台 5 色（第 1–4 色是 v2 储备）', 20, y);
  y += 64;
  const cs = portrait ? 56 : 64;
  const padLevel = parseLevel(['###', '#@#', '###']);
  for (let k = 0; k < 5; k += 1) {
    const x = 26 + k * (cs * 2.6);
    card(ctx, x - 10, y - 0.42 * cs, cs * 2.4, cs * 2.75, HALLS.tiangong.floorA);
    drawCrate(ctx, x, y, cs, { color: k, lock: 0 });
    drawPadMarks(ctx, x + cs * 1.2, y, cs, k);
    drawCrate(ctx, x + cs * 1.2, y, cs, { color: k, lock: 1 });
    drawCrate(ctx, x, y + cs * 1.3, cs, { color: k, lock: 0, dead: true });
    drawDeadFrame(ctx, x, y + cs * 1.3, cs, 1);
    drawDeadBadge(ctx, x + cs * 0.5, y + cs * 1.3 + cs * 0.28, cs, 1);
    drawPadBase({ ctx, level: padLevel, hall: HALLS.tiangong, levelId: 'sb', s: cs, ox: x + cs * 1.2, oy: y + cs * 1.3 }, 0, 0, k);
  }
  y += cs * 2.6 + 26;
  // 3. robot facings × expressions at the smallest v1 cell size
  label(ctx, '小推：4 个朝向 × 8 种 LED 表情（s = 63，v1 最小格：横屏 10×10 / C10）', 20, y);
  y += 30;
  const rs = 63;
  const facings: Facing[] = [1, 3, 2, 0];
  const per = portrait ? 4 : 8;
  let row = 0;
  for (const f of facings) {
    EXPRESSIONS.forEach((e, ei) => {
      const col = ei % per;
      const rk = row + ((ei / per) | 0);
      const x = 52 + col * (rs * 1.32);
      const yy = y + rk * (rs * 1.62) + rs * 1.4;
      card(ctx, x - rs * 0.6, yy - rs * 1.4, rs * 1.2, rs * 1.55);
      drawRobot(ctx, x, yy, rs, { ...restPose(f), eyes: e, dots: e === 'think' ? 3 : 0 });
    });
    row += Math.ceil(EXPRESSIONS.length / per);
  }
  y += row * rs * 1.62 + 30;
  // 4. cosmetics × facings and poses
  label(ctx, '装扮（安全帽 / 双肩灯 / 三箱条纹）× 4 朝向', 20, y);
  y += 30;
  const ps = 72;
  const cos = [{ hat: true }, { lamp: true }, { stripes: true }];
  const perC = portrait ? 6 : 12;
  cos.forEach((c, ci) => {
    facings.forEach((f, fi) => {
      const k = ci * 4 + fi;
      const x = 56 + (k % perC) * (ps * 1.15);
      const yy = y + ps * 1.45 + ((k / perC) | 0) * ps * 1.75;
      drawRobot(ctx, x, yy, ps, { ...restPose(f), cosmetics: c, glow: 1 });
    });
  });
  y += Math.ceil(12 / perC) * ps * 1.75 + 20;
  label(ctx, '动作：推（侧 / 正 / 背）、挠头、庆祝跳、困', 20, y);
  y += 30;
  const poses: Partial<RobotPose>[] = [
    { facing: 3, arm: 1, eyes: 'effort', lean: 0.14 },
    { facing: 1, arm: 1, eyes: 'effort' },
    { facing: 0, arm: 1 },
    { facing: 1, scratch: 0.4, eyes: 'think' },
    { facing: 3, scratch: 0.3, eyes: 'think' },
    { facing: 1, cheer: 1, eyes: 'happy', z: 12 },
    { facing: 3, cheer: 1, eyes: 'happy' },
    { facing: 1, eyes: 'sleepy' },
  ];
  poses.forEach((pp, i) => {
    const x = 56 + (i % (portrait ? 6 : 8)) * (ps * 1.2);
    const yy = y + ps * 1.45 + (portrait && i >= 6 ? ps * 1.7 : 0);
    drawRobot(ctx, x, yy, ps, { ...restPose(1), ...pp } as RobotPose);
  });
  y += (portrait ? 2 : 1) * ps * 1.7 + 20;
  // 5. signals on each crate colour
  label(ctx, '信号（夜蓝 + 纸白描边，从不用箱色）：选中箭头、提示环、脚印、不可达框、锁定光', 20, y);
  y += 34;
  const ss = portrait ? 50 : 56;
  for (let k = 0; k < 5; k += 1) {
    const x = 26 + k * ss * 3.05;
    card(ctx, x, y, ss * 2.9, ss * 4.2, HALLS.moon.floorA);
    const cx = x + ss * 0.95;
    const cy = y + ss * 0.95;
    drawCrate(ctx, cx, cy, ss, { color: k, lock: 0 });
    for (const d of [0, 1, 2, 3]) drawArrow(ctx, cx + 0.5 * ss, cy + 0.3 * ss, ss, d, 1);
    drawCrate(ctx, x + ss * 0.3, y + ss * 2.75, ss, { color: k, lock: 0 });
    drawHintRing(ctx, x + ss * 0.8, y + ss * 3.15, ss, 0.5);
    drawFootprints(ctx, x + ss * 1.55, y + ss * 2.75, ss, 2, 1, 1);
    drawUnreachable(ctx, x + ss * 1.55, y + ss * 2.05, ss * 0.7, 1);
    drawLockRing(ctx, x + ss * 2.4, y + ss * 2.4, ss * 0.6, 0.2);
  }
  y += ss * 4.2 + 30;
  // 6. occlusion
  label(ctx, '遮挡：箱子和小推在墙北侧（脚被墙顶挡住）、小推在顶行（头顶不被裁）', 20, y);
  y += 30;
  const occ = parseLevel(['#########', '#@--$-#-#', '#-##--#.#', '#-----$-#', '###.-####', '#########']);
  const os = 60;
  room(ctx, occ, HALLS.moon, 30, y + 0.45 * os, os, {
    robot: { cell: 1 * 9 + 2, pose: { facing: 3 } },
    crates: [{ cell: 1 * 9 + 3, color: 0 }, { cell: 3 * 9 + 6, color: 0, dead: false }],
  });
  const stacked = 30 + 9 * os + 30 > W - 9 * os;
  room(ctx, occ, HALLS.moon, stacked ? 30 : 30 + 9 * os + 30, (stacked ? y + 6.6 * os : y) + 0.45 * os, os, {
    robot: { cell: 1 * 9 + 5, pose: { facing: 1, eyes: 'happy' } },
    crates: [{ cell: 1 * 9 + 4, color: 0 }, { cell: 3 * 9 + 5, color: 0, dead: true }],
  });
  y += (stacked ? 2 : 1) * 6.6 * os + 24;
  // 7. chapter emblems (DOM SVG in the game; rasterised here)
  label(ctx, '章节徽章：第 0–4 章 + 经典仓库（地图章节卡、关卡牌）', 20, y);
  y += 30;
  await Promise.all((['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'classic'] as const).map(async (key, i) => {
    const img = await svgImage(chapterEmblem(key, 84));
    ctx.drawImage(img, 26 + i * 104, y, 84, 84);
  }));
  y += 84 + 34;
  // 8. teaching signals
  label(ctx, '教学：路线虚线 + 站位脚印（0-2 提示）、自动绕行升级（面罩路线图 + LED 环）、幽灵示范（青色）', 20, y);
  y += 30;
  const rs2 = portrait ? 46 : 56;
  const tut = parseLevel(['########', '#------#', '#-####-#', '#--$-.@#', '########']);
  const rx = 26;
  const ry = y + 0.45 * rs2;
  room(ctx, tut, HALLS.tiangong, rx, ry, rs2);
  const cells = [3 * 8 + 6, 2 * 8 + 6, 1 * 8 + 6, 1 * 8 + 5, 1 * 8 + 4, 1 * 8 + 3, 1 * 8 + 2, 1 * 8 + 1, 2 * 8 + 1, 3 * 8 + 1, 3 * 8 + 2];
  const pts = cells.map((c) => ({ x: rx + (c % 8) * rs2 + rs2 / 2, y: ry + ((c / 8) | 0) * rs2 + 0.55 * rs2 }));
  pts[0] = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  drawRoute(ctx, pts, rs2, 1, 1);
  drawFootprints(ctx, rx + 2 * rs2, ry + 3 * rs2, rs2, 3, 1, 1);
  const bx = rx + 8 * rs2 + 70;
  card(ctx, bx - 56, y, 112, 150);
  drawRobot(ctx, bx, y + 132, 86, { ...restPose(1), visor: 'route', halo: 1, haloSpin: 0.6 });
  const gx = bx + 130;
  card(ctx, gx - 56, y, 200, 150, HALLS.moon.floorA);
  ghostSprite(ctx, gx, y + 132, 86, { ...restPose(3), arm: 1, eyes: 'effort' }, { x: gx + 43, y: y + 132 - 0.8 * 86 });
  y += Math.max(150, (tut.H + 0.45) * rs2 + 26) + 30;
  // 9. rockets (spec §6.4): on the pad, in flight, the boss booster separation, the destinations
  label(ctx, '三种火箭：天宫线 长征七号 + 天舟 / 月宫线 着陆器组合 / 火星线 重型货运船', 20, y);
  label(ctx, '左：待发射；右：点火升空（三层尾焰 + 发动机光）', 20, y + 22, 14);
  y += 60;
  const kinds: RocketKind[] = ['tiangong', 'moon', 'mars'];
  const rh = portrait ? 260 : 280;
  const sc = rh / ROCKET_H.tiangong;
  const colW = (W - 40) / 6;
  const sprites = kinds.map((k) => new RocketSprite(k, sc, dpr));
  kinds.forEach((_k, i) => {
    const x0 = 20 + colW * (2 * i) + colW / 2;
    const base = y + rh + 6;
    sprites[i].draw(ctx, x0, base, restRocket());
    sprites[i].draw(ctx, x0 + colW, base - 30, { flame: 1, frame: 3 + i, sep: 0, stage2: 0 });
    label(ctx, ['天宫线', '月宫线', '火星线'][i], x0 + colW / 2 - 24, base + 70, 15);
  });
  y += rh + 120;
  label(ctx, 'Boss 变体：1.6 s 助推器分离（旋转落下）→ 二级点火（蓝白尾焰）', 20, y);
  y += 30;
  const sepFrames: [number, number, number][] = [[2, 0.18, 1], [2, 0.5, 1], [1, 0.4, 1], [0, 0.5, 1]];
  sepFrames.forEach(([ki, sep, st], i) => {
    const x = 20 + ((W - 40) / 4) * i + (W - 40) / 8;
    sprites[ki].draw(ctx, x, y + rh - 20, { flame: 1, frame: 7 + i, sep, stage2: st });
  });
  for (const sp of sprites) sp.dispose();
  y += rh + 110;
  label(ctx, '目的地剪影：天宫空间站 / 月宫基地 / 火星基地（首发到达时一闪）', 20, y);
  y += 30;
  kinds.forEach((k, i) => {
    const x = 20 + ((W - 40) / 3) * i + (W - 40) / 6;
    drawDestination(ctx, k, x, y + 70, 46, 1);
  });
  y += 160;
  cv.dataset.contentHeight = String(Math.ceil(y));
  return cv;
}

/** Rasterise an inline SVG string (the emblem markup) for the canvas. */
function svgImage(svg: string): Promise<HTMLImageElement> {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** The demo ghost as the board draws it: robot (+ crate) tinted LED cyan in its own layer. */
function ghostSprite(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, pose: RobotPose, crate: { x: number; y: number }): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = 2.4 * s;
  const h = 1.9 * s;
  const off = document.createElement('canvas');
  off.width = Math.ceil(w * dpr);
  off.height = Math.ceil(h * dpr);
  const o = off.getContext('2d')!;
  o.setTransform(dpr, 0, 0, dpr, (-x + 0.7 * s) * dpr, (-y + 1.7 * s) * dpr);
  drawCrate(o, crate.x, crate.y, s, { color: 0, lock: 0 });
  drawRobot(o, x, y, s, pose);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-atop';
  o.fillStyle = 'rgba(143, 247, 236, 0.62)';
  o.fillRect(0, 0, off.width, off.height);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(off, x - 0.7 * s, y - 1.7 * s, w, h);
  ctx.restore();
}

/** Sample points (CSS px on the swatch canvas) → what colour they must show. */
export interface SwatchPoints {
  crateTop: [number, number][];
  crateFront: [number, number][];
  robotBody: [number, number];
  floors: [number, number][];
  signals: [number, number][];
}

/**
 * `?dev=styleboard&swatches=1` (spec §9.4 group 7): the production renderers draw each crate colour,
 * the robot, every hall floor and the signals at s = 100 on one canvas, and `window.__sokSwatches`
 * lists interior points (away from tape, symbols, seams, outlines and lighting) whose rendered
 * pixels the browser test reads back and runs through the §6.2 palette gates.
 */
export function mountSwatches(host: HTMLElement): HTMLCanvasElement {
  document.documentElement.classList.remove('kit-lock-scroll');
  document.body.classList.add('sok-styleboard');
  const W = 780;
  const H = 640;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  cv.className = 'sok-styleboard__canvas sok-swatches';
  host.append(cv);
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0C1230';
  ctx.fillRect(0, 0, W, H);
  const pts: SwatchPoints = { crateTop: [], crateFront: [], robotBody: [0, 0], floors: [], signals: [] };
  // crates (s = 100): top-face point on the lighting gradient's neutral line, clear of tape/symbol/chip
  for (let k = 0; k < 5; k += 1) {
    const x = 20 + k * 112;
    const y = 30;
    drawCrate(ctx, x, y, 100, { color: k, lock: 0 });
    pts.crateTop.push([x + 70, y + 18]);
    pts.crateFront.push([x + 40, y + 82]);
  }
  // robot (s = 100, front view): plain body between the top highlight, the chest plate and the shade band
  drawRobot(ctx, 690, 250, 100, restPose(1));
  pts.robotBody = [690 - 20, 250 - 36];
  // hall floors (s = 64): both checker colours of every v1 hall, sampled in the upper middle of a cell
  const fl = parseLevel(['####', '#@-#', '#--#', '####']);
  (['tiangong', 'moon', 'mars', 'classic'] as const).forEach((id, i) => {
    const ox = 20 + i * 150 - 64;
    const oy = 300 - 64;
    drawFloor({ ctx, level: fl, hall: HALLS[id], levelId: 'swatch', s: 64, ox, oy });
    pts.floors.push([ox + 64 + 32, oy + 64 + 20], [ox + 128 + 32, oy + 64 + 20]);
  });
  // signals: the ✕ badge disc above its cross, and the night line of the hint ring
  drawDeadBadge(ctx, 80, 520, 100, 1);
  pts.signals.push([80, 520 - 12]);
  drawHintRing(ctx, 300, 520, 100, 0);
  pts.signals.push([300 + 56, 520]);
  (window as unknown as { __sokSwatches: SwatchPoints }).__sokSwatches = pts;
  return cv;
}
