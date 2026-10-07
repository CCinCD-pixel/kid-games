// 宋城修复沙盘 (spec §5.7 化害为利, §6.3b): a lacquered tray of 宋城 with 22 repair parts (campaign.repairArt) and the
// 墨家旗 (≥ FLAG_STARS stars in a volume). One anchor table in a 240×180 design space; the map tray, the result-page
// zoom (2 s close-up of the part just repaired, a wooden carpenter knocking + 编钟) and the full-screen view all
// use it. Night falls on the tray while volume 2 is being played and the sun stays up after 2-10.
import { cost } from './perf';
import { CAMPAIGN, ORDER } from '../content';
import { rr, ell, poly, glow, lantern, kite, plough, doll, sun, stars, type C2 } from '../art/dolls';
import { PAL } from '../theme/mozi';
import { shift } from '../art/shade';
import type { SaveV1 } from '../save';

export const SONG_W = 240, SONG_H = 180;
/** stars per volume for the 墨家旗 (33 per volume). Volume 2's K2 expectation is 25.7 — Dad decides 27 vs 26 (report). */
export const FLAG_STARS = [27, 27];
const TAU = Math.PI * 2;
const O = { outline: 1.3 } as const;
const O2 = { outline: 1 } as const;

export interface SongState { done: Set<string>; flags: [boolean, boolean]; phase: 'day' | 'night' | 'dawn' }
const won = (s: SaveV1, id: string): boolean => (s.levels[id]?.wins ?? 0) > 0;
export function volStars(s: SaveV1, vol: number): number { return CAMPAIGN.volumes[vol - 1].levels.reduce((a, id) => a + (s.levels[id]?.best ?? 0), 0); }
export function songState(s: SaveV1, except?: string): SongState {
  const ids = ORDER.filter((id) => won(s, id) && id !== except);
  const done = new Set(ids.map((id) => CAMPAIGN.repairArt[id]).filter(Boolean));
  const w = (id: string): boolean => ids.includes(id);
  return { done, flags: [volStars(s, 1) >= FLAG_STARS[0], volStars(s, 2) >= FLAG_STARS[1]], phase: w('2-10') ? 'dawn' : w('1-11') ? 'night' : 'day' };
}
/** where each repair sits (design units) — the result-page zoom centres here */
export const ANCHOR: Record<string, [number, number]> = {
  'gate-bolt': [152, 138], 'field-1-sprout': [42, 62], 'wall-east': [220, 80], 'tower-ladder': [172, 122], 'moat-bridge': [152, 151],
  'well-windlass': [104, 108], 'field-2-tall': [42, 102], 'wall-west': [84, 108], 'smithy-fire': [199, 68], swing: [128, 110],
  'field-3-plough': [42, 143], lantern: [180, 102], scarecrow: [62, 96], 'mill-sails': [197, 108], 'chimney-smoke': [113, 56],
  'wind-chime': [219, 46], battlements: [152, 52], 'post-cart': [196, 161], 'time-drum': [152, 124], 'granary-full': [150, 78],
  sunrise: [190, 30], kite: [120, 94], flag: [152, 104],
};

const easeBack = (x: number): number => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
const ln = (c: C2, u: number, w: number, col: string, f: () => void): void => { c.strokeStyle = col; c.lineWidth = w / u; c.lineCap = 'round'; c.beginPath(); f(); c.stroke(); };

/** draw the whole tray in design units (caller scaled the context; u = CSS px per du) */
export function drawSong(c: C2, u: number, st: SongState, t: number, pop?: { id: string; p: number }): void {
  const D = (id: string): boolean => st.done.has(id) || pop?.id === id;
  const wrap = (id: string, f: () => void): void => {
    if (pop?.id !== id) { f(); return; }
    const [ax, ay] = ANCHOR[id]; const s = Math.max(0.001, easeBack(Math.min(1, pop.p * 1.6)));
    c.save(); c.translate(ax, ay); c.scale(s, s); c.translate(-ax, -ay); f(); c.restore();
    if (pop.p < 0.7) { c.strokeStyle = `rgba(255,236,170,${0.9 * (1 - pop.p / 0.7)})`; c.lineWidth = 2.4 / u; c.beginPath(); c.arc(ax, ay, 6 + pop.p * 40, 0, TAU); c.stroke(); }
  };
  const night = st.phase === 'night' && !(pop?.id === 'sunrise');
  // ── backdrop board (sky) ──
  c.save(); const sky = new Path2D(); sky.roundRect(10, 2, 220, 42, 7); c.clip(sky);
  const g = c.createLinearGradient(0, 2, 0, 44);
  if (night) { g.addColorStop(0, '#26305E'); g.addColorStop(1, '#46508A'); } else if (st.phase === 'dawn' || pop?.id === 'sunrise') { g.addColorStop(0, '#9FD3EC'); g.addColorStop(1, '#FFE0A6'); } else { g.addColorStop(0, '#A9DCF0'); g.addColorStop(1, '#EAF4E6'); }
  c.fillStyle = g; c.fillRect(10, 2, 220, 42);
  if (night) stars(c, 14, 4, 212, 26, 22, t, 0.9);
  if (st.phase === 'dawn' || pop?.id === 'sunrise') wrap('sunrise', () => sun(c, 190, 34 - (pop?.id === 'sunrise' ? Math.min(1, pop.p) * 6 : 6), 9, t));
  c.fillStyle = night ? '#323C6E' : '#B9D3A0'; c.beginPath(); c.moveTo(10, 44); for (let x = 10; x <= 230; x += 22) c.quadraticCurveTo(x + 11, 30 + 6 * Math.sin(x), x + 22, 40); c.lineTo(230, 44); c.fill();
  c.restore();
  ln(c, u, 1.4, 'rgba(42,27,18,0.55)', () => c.roundRect(10, 2, 220, 42, 7));
  // ── tray ──
  rr(c, u, 'woodDark', 2, 30, 236, 148, 9, { seed: 4 });
  rr(c, u, 'paper', 9, 37, 222, 134, 5, { tint: PAL.sandHi, flat: true, outline: 1.6 });
  c.fillStyle = 'rgba(160,120,70,0.12)'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(12 + ((i * 53) % 216), 40 + ((i * 37) % 128), 0.7, 0, TAU); c.fill(); }
  // ── fields (west of the city) ──
  const field = (y: number, h: number, id: string, kind: 1 | 2 | 3): void => {
    rr(c, u, 'soil', 15, y, 54, h, 3, { ...O, seed: kind });
    wrap(id, () => {
      if (!D(id)) { c.fillStyle = 'rgba(70,50,30,0.35)'; for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(20 + i * 7.3, y + h * (0.3 + 0.4 * ((i * 7) % 3) / 2), 0.9, 0, TAU); c.fill(); } return; }
      if (kind === 3) { ln(c, u, 1.4, 'rgba(70,45,25,0.6)', () => { for (let r = 0; r < 5; r++) { c.moveTo(18, y + 5 + r * (h - 9) / 4); c.quadraticCurveTo(42, y + 3 + r * (h - 9) / 4, 66, y + 5 + r * (h - 9) / 4); } }); plough(c, u, 62, y + h - 3, 0.42); return; }
      for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) {
        const x = 20 + i * 7.3, yy = y + 6 + r * (h - 10) / 3; const sw = Math.sin(t * 1.6 + i + r) * 0.6;
        if (kind === 1) ln(c, u, 1.3, '#5E8F2E', () => { c.moveTo(x - 1.6, yy - 2.4); c.lineTo(x, yy); c.lineTo(x + 1.6 + sw * 0.4, yy - 2.6); });
        else { ln(c, u, 1.2, '#6E9A3A', () => { c.moveTo(x, yy + 1); c.lineTo(x + sw, yy - 6); }); c.fillStyle = '#E2B54A'; c.beginPath(); c.ellipse(x + sw, yy - 7, 1.2, 2, 0.2, 0, TAU); c.fill(); }
      }
    });
  };
  field(42, 36, 'field-1-sprout', 1); field(82, 36, 'field-2-tall', 2); field(122, 40, 'field-3-plough', 3);
  if (D('scarecrow')) wrap('scarecrow', () => { ln(c, u, 1.6, '#6E4A30', () => { c.moveTo(62, 104); c.lineTo(62, 88); c.moveTo(55, 93); c.lineTo(69, 93); }); rr(c, u, 'lacRed', 58.5, 91, 7, 7, 1.5, O2); ell(c, u, 'straw', 62, 88, 3, 2.6, O2); poly(c, u, 'straw', [56, 87, 62, 82.5, 68, 87], O2); });
  // ── city: north wall, interior, side walls, south wall + gate + tower ──
  rr(c, u, 'stone', 80, 46, 144, 8, 1.5, { ...O, seed: 1 });
  if (D('battlements')) wrap('battlements', () => { for (let x = 82; x < 222; x += 9) { rr(c, u, 'stone', x, 42.5, 5, 4, 0.8, { ...O2, seed: x }); rr(c, u, 'stone', x, 128.5, 5, 4, 0.8, { ...O2, seed: x + 1 }); } });
  if (D('wind-chime')) wrap('wind-chime', () => { ln(c, u, 1.2, '#6E4A30', () => { c.moveTo(219, 47); c.lineTo(219, 38); c.lineTo(223, 38); }); const sw = Math.sin(t * 2.4) * 0.5; c.save(); c.translate(223, 38); c.rotate(sw * 0.3); ln(c, u, 0.9, '#6E4A30', () => { c.moveTo(0, 0); c.lineTo(0, 3); }); ell(c, u, 'bronze', 0, 5, 2, 2.4, O2); ln(c, u, 1.2, PAL.lacRed, () => { c.moveTo(0, 7); c.quadraticCurveTo(1.5 + sw * 3, 10, sw * 4, 13); }); c.restore(); });
  // houses
  const house = (x: number, y: number, w: number, roof: 'lacBlack' | 'woodRed'): void => { rr(c, u, 'paper', x, y + 6, w, 10, 1, { ...O, tint: '#EADBB8' }); poly(c, u, roof, [x - 3, y + 7, x + 2, y, x + w - 2, y, x + w + 3, y + 7], O); rr(c, u, 'woodDark', x + w / 2 - 2, y + 10, 4, 6, 0.8, O2); };
  house(97, 58, 20, 'lacBlack'); rr(c, u, 'stone', 110.5, 52, 4, 8, 0.8, O2);
  if (D('chimney-smoke')) wrap('chimney-smoke', () => { for (let i = 0; i < 3; i++) { const ph = (t * 0.35 + i / 3) % 1; c.fillStyle = `rgba(236,232,224,${0.85 * (1 - ph)})`; c.beginPath(); c.arc(112.5 + Math.sin(ph * 5 + i) * 2.4, 50 - ph * 18, 2 + ph * 3.2, 0, TAU); c.fill(); } });
  house(124, 56, 16, 'woodRed');
  // granary
  wrap('granary-full', () => { rr(c, u, 'wood', 140, 70, 20, 14, 3, { ...O, seed: 6 }); poly(c, u, 'straw', [136.5, 72, 150, 59, 163.5, 72], { ...O, seed: 7 }); rr(c, u, D('granary-full') ? 'grain' : 'lacBlack', 147, 76, 6, 8, 1, O2); if (D('granary-full')) { ell(c, u, 'grain', 150, 86, 7.5, 2.6, O2); rr(c, u, 'paper', 160, 79, 5, 6.5, 1.6, { ...O2, tint: '#E8D3A6' }); rr(c, u, 'paper', 135, 80, 5, 6, 1.6, { ...O2, tint: '#E8D3A6' }); } });
  // smithy
  rr(c, u, 'woodDark', 188, 64, 22, 12, 1, { ...O, seed: 3 }); poly(c, u, 'lacBlack', [185, 65, 190, 58, 208, 58, 213, 65], O); rr(c, u, 'stone', 204, 52, 4, 8, 0.8, O2);
  wrap('smithy-fire', () => { rr(c, u, 'lacBlack', 194.5, 68.5, 9, 6.5, 2, O2); if (D('smithy-fire')) { const f = 0.75 + 0.25 * Math.sin(t * 9); c.fillStyle = PAL.fire2; c.beginPath(); c.ellipse(199, 73, 3.4, 2.4 * f, 0, 0, TAU); c.fill(); c.fillStyle = PAL.fire1; c.beginPath(); c.ellipse(199, 73.5, 2, 1.6 * f, 0, 0, TAU); c.fill(); c.fillStyle = '#FFD27A'; for (let i = 0; i < 3; i++) { const ph = (t * 0.9 + i / 3) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.arc(206 + Math.sin(i * 3 + t) * 1.5, 50 - ph * 8, 0.8, 0, TAU); c.fill(); } c.globalAlpha = 1; } });
  // swing, well, lantern, mill, ladder
  if (D('swing')) wrap('swing', () => { ln(c, u, 1.6, '#7A4F2E', () => { c.moveTo(121, 118); c.lineTo(123.5, 103); c.lineTo(126, 118); c.moveTo(130, 118); c.lineTo(132.5, 103); c.lineTo(135, 118); c.moveTo(123.5, 103); c.lineTo(132.5, 103); }); const a = Math.sin(t * 2.2) * 0.35; c.save(); c.translate(128, 103); c.rotate(a); ln(c, u, 0.9, '#5A3A22', () => { c.moveTo(-2, 0); c.lineTo(-2, 10); c.moveTo(2, 0); c.lineTo(2, 10); }); rr(c, u, 'lacRed', -3, 9.5, 6, 1.8, 0.6, O2); c.restore(); });
  wrap('well-windlass', () => { ell(c, u, 'stone', 104, 114, 6.5, 4, { ...O, seed: 5 }); ell(c, u, 'paper', 104, 113.6, 4, 2.2, { tint: '#3E6E8A', flat: true, outline: 0.8 }); if (D('well-windlass')) { rr(c, u, 'woodDark', 97.4, 102, 2, 12, 0.6, O2); rr(c, u, 'woodDark', 108.6, 102, 2, 12, 0.6, O2); rr(c, u, 'wood', 96.6, 103, 14.8, 2.4, 1, O2); ln(c, u, 0.8, '#5A3A22', () => { c.moveTo(104, 105); c.lineTo(104, 108); }); rr(c, u, 'wood', 102.4, 107.6, 3.2, 3, 0.6, O2); } });
  if (D('lantern')) wrap('lantern', () => { ln(c, u, 1.5, '#5A3A22', () => { c.moveTo(178, 116); c.lineTo(178, 98); c.lineTo(182.5, 98); }); lantern(c, u, 182.5, 103.5, 0.42, t, night ? 1 : 0.35); });
  wrap('mill-sails', () => { rr(c, u, 'paper', 189, 110, 16, 12, 1, { ...O, tint: '#EADBB8' }); poly(c, u, 'woodRed', [186.5, 111, 191, 105, 203, 105, 207.5, 111], O); ell(c, u, 'woodDark', 197, 104, 1.6, 1.6, O2);
    if (D('mill-sails')) { c.save(); c.translate(197, 104); c.rotate(t * 1.4); for (let i = 0; i < 4; i++) { c.rotate(TAU / 4); rr(c, u, 'paper', -1.6, -13, 3.2, 11, 0.8, { ...O2, tint: '#F3E6C8' }); } c.restore(); ell(c, u, 'gold', 197, 104, 1.6, 1.6, O2); }
    else { c.save(); c.translate(197, 104); c.rotate(0.6); rr(c, u, 'woodDark', -0.8, -5, 1.6, 5, 0.5, O2); c.restore(); } });
  wrap('tower-ladder', () => { if (D('tower-ladder')) { ln(c, u, 1.4, '#8A5A35', () => { c.moveTo(168.5, 132); c.lineTo(171, 113); c.moveTo(174.5, 132); c.lineTo(177, 113); for (let k = 0; k < 5; k++) { const y = 129 - k * 3.6; c.moveTo(168.9 + k * 0.47, y); c.lineTo(174.9 + k * 0.47, y); } }); } else ln(c, u, 1.4, '#8A5A35', () => { c.moveTo(166, 128); c.lineTo(174, 126); c.moveTo(169, 131); c.lineTo(176, 130.5); }); });
  // side walls (with the two gaps until 1-3 / 1-8)
  const wallV = (x: number, gap: [number, number] | null): void => {
    if (!gap) { rr(c, u, 'stone', x, 46, 8, 94, 1.5, { ...O, seed: x }); return; }
    rr(c, u, 'stone', x, 46, 8, gap[0] - 46, 1.5, { ...O, seed: x }); rr(c, u, 'stone', x, gap[1], 8, 140 - gap[1], 1.5, { ...O, seed: x + 3 });
    for (let i = 0; i < 4; i++) ell(c, u, 'stone', x + 2 + (i % 2) * 4, gap[0] + 5 + i * 5.5, 2.4, 1.8, { ...O2, seed: i });
  };
  wrap('wall-west', () => wallV(80, D('wall-west') ? null : [96, 120]));
  wrap('wall-east', () => wallV(216, D('wall-east') ? null : [66, 92]));
  rr(c, u, 'stone', 80, 132, 64, 8, 1.5, { ...O, seed: 8 }); rr(c, u, 'stone', 160, 132, 64, 8, 1.5, { ...O, seed: 9 });
  rr(c, u, 'paper', 80, 139, 64, 4, 1, { tint: shift('#9C968C', -0.22), flat: true, outline: 1.2 }); rr(c, u, 'paper', 160, 139, 64, 4, 1, { tint: shift('#9C968C', -0.22), flat: true, outline: 1.2 });
  // gate (askew until 1-1) + bolt
  wrap('gate-bolt', () => {
    const ok = D('gate-bolt');
    rr(c, u, 'lacRed', 144, 131, 8, 12.5, 1, { ...O2, seed: 1 });
    c.save(); if (!ok) { c.translate(160, 131); c.rotate(0.32); c.translate(-160, -131); } rr(c, u, 'lacRed', 152, 131, 8, 12.5, 1, { ...O2, seed: 2 }); c.restore();
    c.fillStyle = PAL.gold; for (const x of [146.5, 149.5, 154.5, 157.5]) for (const y of [134, 137.5, 141]) { if (!ok && x > 152) continue; c.beginPath(); c.arc(x, y, 0.55, 0, TAU); c.fill(); }
    if (ok) rr(c, u, 'bronze', 142.5, 136, 19, 2.6, 1, O2);
  });
  // tower (城楼) + drum + 墨家旗
  rr(c, u, 'lacRed', 140.5, 117, 2.6, 14, 0.8, O2); rr(c, u, 'lacRed', 160.9, 117, 2.6, 14, 0.8, O2);
  rr(c, u, 'wood', 138.5, 129, 27, 3, 1, O2);
  if (D('time-drum')) wrap('time-drum', () => { ln(c, u, 0.9, '#5A3A22', () => { c.moveTo(152, 118); c.lineTo(152, 121); }); ell(c, u, 'lacRed', 152, 124.5, 5, 3.8, O2); ln(c, u, 0.9, PAL.gold, () => { c.ellipse(152, 124.5, 5, 3.8, 0, -1.2, 1.2); }); });
  poly(c, u, 'lacBlack', [133, 120, 138.5, 111.5, 165.5, 111.5, 171, 120, 152, 117.5], { ...O, seed: 2 });
  ln(c, u, 1.2, PAL.gold, () => { c.moveTo(139, 111.6); c.lineTo(165, 111.6); });
  for (let v = 0; v < 2; v++) if (st.flags[v] || pop?.id === 'flag' + (v + 1)) {
    const x = v ? 166 : 138; const id = 'flag' + (v + 1);
    const f = (): void => { ln(c, u, 1.3, '#5A3A22', () => { c.moveTo(x, 112); c.lineTo(x, 96); }); const w = Math.sin(t * 3 + v) * 1.2; c.fillStyle = '#231815'; c.beginPath(); c.moveTo(x, 96.5); c.quadraticCurveTo(x + 6, 95.5 + w, x + 11, 97 + w); c.lineTo(x + 11, 104 + w); c.quadraticCurveTo(x + 6, 102.5 + w, x, 103.5); c.closePath(); c.fill(); c.fillStyle = '#F6EAD2'; c.beginPath(); c.arc(x + 5.6, 100 + w * 0.6, 1.9, 0, TAU); c.fill(); };
    if (pop?.id === id) { c.save(); const s = Math.max(0.001, easeBack(Math.min(1, pop.p * 1.6))); c.translate(x, 112); c.scale(1, s); c.translate(-x, -112); f(); c.restore(); } else f();
  }
  // moat + bridge + road + post cart
  c.save(); const mo = new Path2D(); mo.moveTo(78, 145); for (let x = 78; x <= 226; x += 12) mo.lineTo(x, 145 + Math.sin(x * 0.3) * 0.6); mo.lineTo(226, 157); for (let x = 226; x >= 78; x -= 12) mo.lineTo(x, 157 + Math.sin(x * 0.2) * 0.8); mo.closePath();
  const wg = c.createLinearGradient(0, 145, 0, 157); wg.addColorStop(0, '#5D97B8'); wg.addColorStop(1, '#3E7393'); c.fillStyle = wg; c.fill(mo); c.clip(mo);
  ln(c, u, 0.9, 'rgba(255,255,255,0.55)', () => { for (let i = 0; i < 6; i++) { const x = 84 + ((i * 29 + t * 6) % 140); c.moveTo(x, 149 + (i % 3) * 2.4); c.lineTo(x + 6, 149 + (i % 3) * 2.4); } }); c.restore();
  ln(c, u, 1.2, 'rgba(42,27,18,0.5)', () => { c.moveTo(78, 145); c.lineTo(226, 145); c.moveTo(78, 157); c.lineTo(226, 157); });
  rr(c, u, 'paper', 145, 157, 14, 15, 1, { tint: '#EBDDBA', flat: true, outline: 0 });
  wrap('moat-bridge', () => { rr(c, u, 'woodDark', 143.5, 143.5, 2.4, 15, 0.8, O2); rr(c, u, 'woodDark', 158.1, 143.5, 2.4, 15, 0.8, O2); if (D('moat-bridge')) for (let i = 0; i < 5; i++) rr(c, u, 'wood', 143.5, 144 + i * 2.8, 17, 2.4, 0.6, { ...O2, seed: i }); });
  wrap('post-cart', () => { if (D('post-cart')) { rr(c, u, 'wood', 186, 155, 20, 8, 1.6, { ...O, seed: 4 }); ln(c, u, 1.2, '#5A3A22', () => { c.moveTo(186, 159); c.lineTo(179, 161); }); for (const x of [190, 202]) { ell(c, u, 'woodDark', x, 164, 3.6, 3.6, O2); ell(c, u, 'iron', x, 164, 0.9, 0.9, { outline: 0.6 }); } ln(c, u, 1, '#5A3A22', () => { c.moveTo(204, 155); c.lineTo(204, 148); }); c.fillStyle = PAL.lacRed; c.beginPath(); c.moveTo(204, 148); c.lineTo(209 + Math.sin(t * 3), 149.5); c.lineTo(204, 151); c.fill(); }
    else { c.save(); c.translate(196, 162); c.rotate(-0.25); rr(c, u, 'wood', -10, -6, 20, 8, 1.6, { ...O, seed: 4 }); c.restore(); ell(c, u, 'woodDark', 206, 166, 3.6, 1.6, O2); } });
  // the kite flies from the tower
  if (D('kite')) wrap('kite', () => { ln(c, u, 0.7, 'rgba(60,40,25,0.7)', () => { c.moveTo(140, 113); c.quadraticCurveTo(128, 108, 121 + Math.sin(t * 1.7) * 1.4, 97); }); kite(c, u, 120 + Math.sin(t * 1.7) * 1.4, 93, 0.3, t); });
  // ── night: dim the tray, light the lamps ──
  if (night) {
    c.fillStyle = 'rgba(16,22,60,0.38)'; c.fillRect(0, 28, SONG_W, SONG_H - 28);
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,200,110,0.55)'; for (const [x, y] of [[100, 69], [112, 69], [128, 67], [190, 70], [192, 116]] as const) { c.fillRect(x, y, 2.6, 2.4); }
    if (D('lantern')) glow(c, 182.5, 103.5, 16, 'rgba(255,170,80,A)', 0.5);
    if (D('smithy-fire')) glow(c, 199, 72, 13, 'rgba(255,140,60,A)', 0.45 + 0.1 * Math.sin(t * 9));
    c.restore();
  }
}

/** a self-sizing tray canvas: map plaque, result-page close-up (zoomTo + pop) or the big view */
export function mountSong(host: HTMLElement, save: SaveV1, dpr: number, o: { zoomTo?: string; popLevel?: string; popFlag?: 1 | 2; onPop?(): void; fps?: number } = {}): { destroy(): void; canvas: HTMLCanvasElement } {
  const cv = document.createElement('canvas'); cv.className = 'gf-song__cv'; host.appendChild(cv);
  const c = cv.getContext('2d')!;
  const popId = o.popFlag ? 'flag' + o.popFlag : o.popLevel ? CAMPAIGN.repairArt[o.popLevel] : undefined;
  const st = songState(save, o.popLevel);
  let W = 0, H = 0; let raf = 0; let dead = false; const t0 = performance.now(); let last = 0;
  const fit = (): void => { W = Math.max(40, host.clientWidth); H = Math.max(30, host.clientHeight); // layout size (a popping modal's scale must not shrink the canvas)
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; };
  // render on change, never an idle loop (GAME_AUTHORING budgets, spec §8.5): the pop / zoom plays out, the plaque and the
  // big view breathe a few seconds, then the tray holds still; a resize redraws one frame. Reduced motion: one frame.
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animFor = popId ? 4.4 : reduce ? 0 : (o.fps ?? 24) >= 30 ? 5 : 2.5;
  const kick = (): void => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
  fit(); const ro = new ResizeObserver(() => { fit(); kick(); }); ro.observe(host);
  const frameMs = 1000 / (o.fps ?? 24); let popped = false;
  function frame(now: number): void {
    if (dead) return; const more = (now - t0) / 1000 < animFor; raf = more ? requestAnimationFrame(frame) : 0;
    if (more && now - last < frameMs - 2) return; last = now;
    const t = (now - t0) / 1000; const c0 = performance.now();
    const base = Math.min(W / SONG_W, H / SONG_H);
    // camera: hold a 2.2× close-up on the part for 2 s, then ease out to the whole tray
    let z = 1, cx = SONG_W / 2, cy = SONG_H / 2; let pop: { id: string; p: number } | undefined;
    if (popId) {
      const a = ANCHOR[popId === 'flag1' || popId === 'flag2' ? 'flag' : popId] ?? [120, 90];
      const k = o.zoomTo === undefined ? 1 : t < 2.2 ? 0 : Math.min(1, (t - 2.2) / 0.7); const e = 1 - (1 - k) ** 3;
      z = 2.2 + (1 - 2.2) * e; cx = a[0] + (SONG_W / 2 - a[0]) * e; cy = a[1] + (SONG_H / 2 - a[1]) * e;
      pop = { id: popId, p: Math.max(0, Math.min(1, (t - 0.35) / 0.9)) };
      if (!popped && t > 0.35) { popped = true; o.onPop?.(); }
    }
    const s = base * z; const hw = W / 2, hh = H / 2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    // keep the tray filling the frame while zoomed
    const minX = hw / s, maxX = SONG_W - hw / s, minY = hh / s, maxY = SONG_H - hh / s;
    if (z > 1) { cx = Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), cx)); cy = Math.max(Math.min(minY, maxY), Math.min(Math.max(minY, maxY), cy)); }
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * (hw - cx * s), dpr * (hh - cy * s));
    drawSong(c, s, st, t, pop);
    if (pop && pop.p > 0 && pop.p < 1 && popId && !popId.startsWith('flag')) { const a = ANCHOR[popId]; doll(c, s, 'smith', a[0] + 13, a[1] + 9, 0.22, { t, arm: 0.5 + 0.5 * Math.abs(Math.sin(t * 9)), carry: 'hammer', face: 'happy' }); }
    cost('song', performance.now() - c0);
  }
  raf = requestAnimationFrame(frame);
  return { canvas: cv, destroy: () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); cv.remove(); } };
}
