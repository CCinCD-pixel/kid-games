// Sand-table geometry (spec §2.2) and the static background layer (spec §8.5 ①): table, bronze-capped frame,
// sand lanes, ink-line grid (墨斗), pegs, the city-wall strip and 鲁班's machine exit. Redrawn only on layout change.
import { PAL } from '../theme/mozi';
import { shift } from '../art/shade';

export interface Geo {
  W: number; H: number; dpr: number; landscape: boolean;
  w: number; h: number;            // tile width / lane height (CSS px)
  bx: number; by: number;          // board top-left (the wall strip starts here)
  wallW: number; spawnW: number; x0: number; // x0 = column 0 left edge
  bw: number; bh: number;          // board size
  k: number;                       // CSS px per design unit (w / 100)
}
/** CSS x of a kernel distance (ut from the wall) */
export const xOf = (g: Geo, ut: number): number => g.x0 + (ut / 10000) * g.w;
export const laneTop = (g: Geo, l: number): number => g.by + l * g.h;
/** ground line (feet) of a lane */
export const feetY = (g: Geo, l: number): number => g.by + l * g.h + g.h * 0.8;
export const cellCx = (g: Geo, c: number): number => g.x0 + (c + 0.5) * g.w;

export function makeGeo(W: number, H: number, T: number, dpr: number): Geo {
  const landscape = W >= H;
  let w: number, h: number, bx: number, by: number;
  if (landscape) {
    w = Math.min(Math.floor((W - 24) / 9.52), Math.floor((H - T - 104 - 36 - 150) / (5 * 0.86)));
    h = Math.round(0.86 * w); by = T + 144 + Math.max(0, Math.floor((H - T - 144 - 5 * h - 150) / 2));
  } else {
    w = Math.min(Math.floor((W - 24) / 9.52), Math.floor((H - T - 72 - 60 - 268 - 120 - 148) / (5 * 0.95)));
    h = Math.round(0.95 * w); by = T + 172;
  }
  const bw = Math.round(9.52 * w); bx = Math.round((W - bw) / 2);
  const wallW = Math.round(0.62 * w), spawnW = Math.round(0.9 * w);
  return { W, H, dpr, landscape, w, h, bx, by, wallW, spawnW, x0: bx + wallW, bw, bh: 5 * h, k: w / 100 };
}

function rnd(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export interface BoardOpts { lanes: number[]; night?: boolean; fogCol?: number | null }

export function drawBoard(ctx: CanvasRenderingContext2D, g: Geo, o: BoardOpts): void {
  const r = rnd(2610);
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  // ── the table (warm walnut, long grain) ──
  const tg = ctx.createLinearGradient(0, 0, 0, g.H); tg.addColorStop(0, '#6b4429'); tg.addColorStop(1, '#4a2d1a');
  ctx.fillStyle = tg; ctx.fillRect(0, 0, g.W, g.H);
  ctx.globalAlpha = 0.1; ctx.strokeStyle = '#2a170c'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) { const y = r() * g.H; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(g.W * 0.3, y + (r() - 0.5) * 14, g.W * 0.7, y + (r() - 0.5) * 14, g.W, y + (r() - 0.5) * 8); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // soft vignette
  const vg = ctx.createRadialGradient(g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.3, g.W / 2, g.H / 2, Math.max(g.W, g.H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, g.W, g.H);

  // ── frame ──
  const fw = Math.max(8, Math.round(g.w * 0.11));
  const fx = g.bx - fw, fy = g.by - fw, fW = g.bw + fw * 2, fH = g.bh + fw * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(fx + 4, fy + 8, fW, fH, fw * 0.8); ctx.fill();
  const fg = ctx.createLinearGradient(0, fy, 0, fy + fH); fg.addColorStop(0, '#b97c45'); fg.addColorStop(1, '#7d4c28');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.roundRect(fx, fy, fW, fH, fw * 0.8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,190,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(fx + 2, fy + 2, fW - 4, fH - 4, fw * 0.7); ctx.stroke();
  ctx.strokeStyle = 'rgba(42,27,18,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(fx, fy, fW, fH, fw * 0.8); ctx.stroke();
  // cloud scrolls carved along the frame
  ctx.strokeStyle = 'rgba(60,32,14,0.45)'; ctx.lineWidth = 1.4;
  for (let x = fx + fw * 3; x < fx + fW - fw * 3; x += fw * 4) for (const yy of [fy + fw / 2, fy + fH - fw / 2]) { ctx.beginPath(); ctx.arc(x, yy, fw * 0.22, Math.PI, Math.PI * 2.6); ctx.arc(x + fw * 0.5, yy, fw * 0.22, Math.PI * 1.4, Math.PI * 3); ctx.stroke(); }
  // bronze corner caps
  for (const [cx, cy, sx, sy] of [[fx, fy, 1, 1], [fx + fW, fy, -1, 1], [fx, fy + fH, 1, -1], [fx + fW, fy + fH, -1, -1]] as number[][]) {
    const s = fw * 2.2; ctx.beginPath(); ctx.moveTo(cx, cy + sy * fw * 0.8); ctx.quadraticCurveTo(cx, cy, cx + sx * fw * 0.8, cy); ctx.lineTo(cx + sx * s, cy); ctx.lineTo(cx + sx * s * 0.55, cy + sy * fw * 0.95); ctx.lineTo(cx + sx * fw * 0.95, cy + sy * fw * 0.95); ctx.lineTo(cx + sx * fw * 0.95, cy + sy * s * 0.55); ctx.lineTo(cx, cy + sy * s); ctx.closePath();
    const bg = ctx.createLinearGradient(cx, cy, cx + sx * s, cy + sy * s); bg.addColorStop(0, shift(PAL.bronze, 0.2)); bg.addColorStop(1, shift(PAL.bronze, -0.15));
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = 'rgba(42,27,18,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(79,138,123,0.6)'; ctx.beginPath(); ctx.arc(cx + sx * fw * 1.5, cy + sy * fw * 0.45, fw * 0.16, 0, Math.PI * 2); ctx.fill();
  }

  // ── sand lanes ──
  for (let l = 0; l < 5; l++) {
    const y = laneTop(g, l);
    const sg = ctx.createLinearGradient(0, y, 0, y + g.h);
    const hi = l % 2 ? shift(PAL.sandHi, -0.02) : PAL.sandHi;
    sg.addColorStop(0, shift(hi, -0.04)); sg.addColorStop(0.5, hi); sg.addColorStop(1, PAL.sandLo);
    ctx.fillStyle = sg; ctx.fillRect(g.x0, y, g.w * 8, g.h);
    // sand speckle + ripples
    ctx.fillStyle = 'rgba(120,84,40,0.16)';
    for (let i = 0; i < 70; i++) { ctx.beginPath(); ctx.arc(g.x0 + r() * g.w * 8, y + r() * g.h, 0.6 + r() * 1.1, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,248,225,0.22)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) { const yy = y + g.h * (0.2 + r() * 0.65); const xx = g.x0 + r() * g.w * 7; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + g.w * 0.3, yy - 3, xx + g.w * 0.6, yy); ctx.stroke(); }
  }
  // ── ink-line grid (墨斗弹线): slightly uneven, darker where the ink pooled ──
  ctx.strokeStyle = PAL.ink; ctx.lineCap = 'round';
  for (let c = 0; c <= 8; c++) {
    const x = g.x0 + c * g.w; ctx.globalAlpha = c === 0 || c === 8 ? 0.55 : 0.28; ctx.lineWidth = c === 0 || c === 8 ? 2 : 1.3;
    ctx.beginPath(); ctx.moveTo(x, g.by + 2); ctx.bezierCurveTo(x + 0.8, g.by + g.bh * 0.3, x - 0.8, g.by + g.bh * 0.7, x + 0.4, g.by + g.bh - 2); ctx.stroke();
  }
  for (let l = 1; l < 5; l++) { const y = laneTop(g, l); ctx.globalAlpha = 0.34; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.bezierCurveTo(g.x0 + g.w * 3, y + 0.8, g.x0 + g.w * 5, y - 0.8, g.x0 + g.w * 8, y); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // wooden pegs at the corners of cells
  for (let l = 0; l <= 5; l++) for (let c = 0; c <= 8; c++) {
    const x = g.x0 + c * g.w, y = g.by + l * g.h; const pr = Math.max(2, g.w * 0.028);
    ctx.fillStyle = 'rgba(42,27,18,0.35)'; ctx.beginPath(); ctx.arc(x + 0.8, y + 1.2, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c99358'; ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.7)'; ctx.beginPath(); ctx.arc(x - pr * 0.3, y - pr * 0.3, pr * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  // ── city wall strip (宋城) ──
  const wx = g.bx, ww = g.wallW;
  const wg = ctx.createLinearGradient(wx, 0, wx + ww, 0); wg.addColorStop(0, '#b9a68a'); wg.addColorStop(1, '#d7c4a2');
  ctx.fillStyle = wg; ctx.fillRect(wx, g.by, ww, g.bh);
  ctx.strokeStyle = 'rgba(80,60,40,0.45)'; ctx.lineWidth = 1;
  const bH = g.h / 5;
  for (let y = g.by, row = 0; y < g.by + g.bh; y += bH, row++) { ctx.beginPath(); ctx.moveTo(wx, y); ctx.lineTo(wx + ww, y); ctx.stroke(); for (let x = wx + (row % 2 ? ww * 0.25 : ww * 0.5); x < wx + ww; x += ww * 0.5) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bH); ctx.stroke(); } }
  // battlements along the inner edge
  ctx.fillStyle = '#c9b48f'; ctx.strokeStyle = 'rgba(42,27,18,0.6)'; ctx.lineWidth = 1.2;
  for (let y = g.by; y < g.by + g.bh; y += g.h / 3) { ctx.beginPath(); ctx.rect(wx + ww - 5, y + 3, 8, g.h / 3 - 8); ctx.fill(); ctx.stroke(); }
  // gate arch per lane
  for (let l = 0; l < 5; l++) {
    const gy = laneTop(g, l) + g.h * 0.3, gh = g.h * 0.55, gw = ww * 0.55, gx = wx + ww * 0.12;
    ctx.fillStyle = '#4b2e1c'; ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx, gy + gw / 2); ctx.arc(gx + gw / 2, gy + gw / 2, gw / 2, Math.PI, 0); ctx.lineTo(gx + gw, gy + gh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(42,27,18,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(201,162,58,0.7)'; ctx.lineWidth = 1; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(gx + (gw * i) / 3, gy + gw * 0.3); ctx.lineTo(gx + (gw * i) / 3, gy + gh); ctx.stroke(); }
  }
  ctx.strokeStyle = 'rgba(42,27,18,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(wx, g.by, ww, g.bh);

  // ── 鲁班's machine exit (red lacquer, gold clouds) ──
  const sx = g.x0 + 8 * g.w, sw = g.spawnW;
  const rg = ctx.createLinearGradient(sx, 0, sx + sw, 0); rg.addColorStop(0, '#8e2a22'); rg.addColorStop(1, '#5b1914');
  ctx.fillStyle = rg; ctx.fillRect(sx, g.by, sw, g.bh);
  ctx.strokeStyle = 'rgba(201,162,58,0.55)'; ctx.lineWidth = 1.4;
  for (let l = 0; l < 5; l++) {
    const cy = laneTop(g, l) + g.h / 2;
    ctx.fillStyle = 'rgba(20,8,6,0.55)'; ctx.beginPath(); ctx.ellipse(sx + sw * 0.28, cy + g.h * 0.12, sw * 0.18, g.h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + sw * 0.62, cy - g.h * 0.22, sw * 0.09, Math.PI, Math.PI * 2.7); ctx.arc(sx + sw * 0.78, cy - g.h * 0.22, sw * 0.09, Math.PI * 1.3, Math.PI * 3); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(42,27,18,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(sx, g.by, sw, g.bh);
  ctx.strokeStyle = 'rgba(201,162,58,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 2, g.by); ctx.lineTo(sx + 2, g.by + g.bh); ctx.stroke();

  // ── closed lanes: wooden boards nailed over the sand ──
  for (let l = 0; l < 5; l++) if (!o.lanes[l]) {
    const y = laneTop(g, l) + 3, h = g.h - 6;
    for (let i = 0; i < 4; i++) {
      const px = g.x0 + 2 + (i * (g.w * 8 - 4)) / 4, pw = (g.w * 8 - 4) / 4 - 3;
      const pg = ctx.createLinearGradient(0, y, 0, y + h); pg.addColorStop(0, '#b98552'); pg.addColorStop(1, '#8f5f36');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(px, y, pw, h, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(42,27,18,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(60,32,14,0.25)'; ctx.lineWidth = 1; for (let j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(px + 6, y + (h * j) / 4); ctx.lineTo(px + pw - 6, y + (h * j) / 4 + (r() - 0.5) * 3); ctx.stroke(); }
      ctx.fillStyle = '#3d3a37'; for (const nx of [px + 7, px + pw - 7]) for (const ny of [y + 7, y + h - 7]) { ctx.beginPath(); ctx.arc(nx, ny, 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // ── fog (vol 2) and night (vol 2) are baked here too ──
  if (o.fogCol != null) { const fx0 = g.x0 + o.fogCol * g.w; const fgr = ctx.createLinearGradient(fx0 - g.w * 0.4, 0, fx0 + g.w, 0); fgr.addColorStop(0, 'rgba(220,230,238,0)'); fgr.addColorStop(1, 'rgba(220,230,238,0.85)'); ctx.fillStyle = fgr; ctx.fillRect(fx0 - g.w * 0.4, g.by, g.x0 + 8 * g.w + g.spawnW - fx0 + g.w * 0.4, g.bh); }
  if (o.night) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(30,42,74,0.55)'; ctx.fillRect(0, 0, g.W, g.H); ctx.globalCompositeOperation = 'source-over'; }
}
