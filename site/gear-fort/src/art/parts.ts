// Parametric part library (spec §6.2/§6.3): every part is a Path2D in design units (1 tile = 100 du) + a material,
// shaded only through shadePart (shade.ts). Characters (rigs.ts) are 4–14 of these parts on rigid bones.
import type { Mat } from './shade';

export interface PartDef { w: number; h: number; mat: Mat; path: Path2D; marks?: Path2D; markW?: number; markColor?: string; seed: number; outline?: number }

const rr = (p: Path2D, x: number, y: number, w: number, h: number, r: number): void => { p.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); };
const circ = (p: Path2D, cx: number, cy: number, r: number): void => { p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2); };
const ell = (p: Path2D, cx: number, cy: number, rx: number, ry: number, rot = 0): void => { p.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot)); p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); };
const poly = (p: Path2D, pts: number[]): void => { p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); p.closePath(); };
const line = (p: Path2D, ...pts: number[]): void => { p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); };

let seedN = 1;
function part(w: number, h: number, mat: Mat, draw: (p: Path2D, m: Path2D) => void, o: { markW?: number; markColor?: string; outline?: number } = {}): PartDef {
  const path = new Path2D(); const marks = new Path2D(); draw(path, marks);
  return { w, h, mat, path, marks, seed: seedN++, ...o };
}

/** a spoked wheel (radius r, centred in its box) */
function wheel(r: number, mat: Mat = 'woodDark', spokes = 6): PartDef {
  return part(r * 2, r * 2, mat, (p, m) => {
    circ(p, r, r, r);
    for (let i = 0; i < spokes; i++) { const a = (i / spokes) * Math.PI * 2; line(m, r + Math.cos(a) * r * 0.22, r + Math.sin(a) * r * 0.22, r + Math.cos(a) * r * 0.78, r + Math.sin(a) * r * 0.78); }
    circ(m, r, r, r * 0.78); circ(m, r, r, r * 0.2);
  }, { markW: 1.4 });
}

export function buildParts(): Record<string, PartDef> {
  seedN = 1;
  const P: Record<string, PartDef> = {};
  // ── the Mohist operator doll (teal headband) ──
  P.dollHead = part(18, 18, 'skin', (p, m) => { circ(p, 9, 9, 8.5); circ(m, 6.4, 9.6, 0.5); circ(m, 11.6, 9.6, 0.5); m.moveTo(7.6, 12.6); m.quadraticCurveTo(9, 13.8, 10.4, 12.6); }, { markW: 1.8 });
  P.dollHair = part(18, 10, 'lacBlack', (p) => { p.moveTo(1, 9); p.quadraticCurveTo(2, 0.5, 9, 0.5); p.quadraticCurveTo(16, 0.5, 17, 9); p.quadraticCurveTo(9, 5.5, 1, 9); p.closePath(); circ(p, 9, 1.5, 3); });
  P.dollBand = part(19, 5, 'teal', (p) => { rr(p, 0, 0.5, 19, 4, 2); poly(p, [1, 2.5, -4, 0, -3.5, 5]); });
  P.dollBody = part(14, 17, 'wood', (p, m) => { p.moveTo(2, 0); p.lineTo(12, 0); p.quadraticCurveTo(15, 9, 14, 17); p.lineTo(0, 17); p.quadraticCurveTo(-1, 9, 2, 0); p.closePath(); line(m, 7, 2, 7, 15); }, { markW: 1.2 });
  P.dollArm = part(5, 12, 'wood', (p) => { rr(p, 0, 0, 5, 12, 2.5); });
  // ── enemy driver doll (red lacquer cap) ──
  P.foeHead = part(18, 18, 'skin', (p, m) => { circ(p, 9, 9, 8.5); m.moveTo(4.5, 9); m.lineTo(7.5, 10); m.moveTo(13.5, 9); m.lineTo(10.5, 10); m.moveTo(7, 13.3); m.lineTo(11, 13.3); }, { markW: 1.8 });
  P.foeCap = part(20, 9, 'lacRed', (p) => { p.moveTo(0, 9); p.quadraticCurveTo(1, 0, 10, 0); p.quadraticCurveTo(19, 0, 20, 9); p.closePath(); });

  // ── 连弩车 shooter ──
  P.shWheel = wheel(10);
  P.shFrame = part(60, 12, 'wood', (p, m) => { rr(p, 0, 0, 60, 12, 3); line(m, 14, 3, 14, 9); line(m, 46, 3, 46, 9); }, { markW: 1.3 });
  P.shStock = part(46, 9, 'woodDark', (p) => { poly(p, [0, 2, 46, 0, 46, 9, 0, 7]); });
  P.shBow = part(12, 44, 'woodRed', (p) => { p.moveTo(2, 0); p.quadraticCurveTo(14, 22, 2, 44); p.lineTo(6, 44); p.quadraticCurveTo(18, 22, 6, 0); p.closePath(); });
  P.shString = part(4, 44, 'rope', (p) => { rr(p, 1, 0, 1.6, 44, 0.8); }, { outline: 1.2 });
  P.shBox = part(16, 14, 'lacBlack', (p, m) => { rr(p, 0, 0, 16, 14, 2); for (let i = 0; i < 3; i++) line(m, 3, 3.5 + i * 3.5, 13, 3.5 + i * 3.5); }, { markW: 1.1, markColor: '#d9b37a' });
  P.shFlag = part(14, 22, 'teal', (p) => { rr(p, 0, 0, 2.5, 22, 1); poly(p, [2.5, 1, 14, 4, 2.5, 9]); });
  P.bolt = part(30, 6, 'wood', (p) => { rr(p, 0, 2, 24, 2.4, 1); poly(p, [24, 0.5, 30, 3.2, 24, 5.9]); poly(p, [0, 0.8, 5, 2.4, 5, 4.2, 0, 5.6]); });

  // ── 木垒 wall ──
  for (let i = 0; i < 4; i++) P['wlPlank' + i] = part(13, 62 - (i % 2) * 6, 'wood', (p) => { const h = 62 - (i % 2) * 6; p.moveTo(0, 5); p.lineTo(6.5, 0); p.lineTo(13, 5); p.lineTo(13, h); p.lineTo(0, h); p.closePath(); });
  P.wlBar = part(58, 7, 'woodDark', (p, m) => { rr(p, 0, 0, 58, 7, 2); circ(m, 6, 3.5, 1.2); circ(m, 52, 3.5, 1.2); }, { markW: 1.5 });
  P.wlMound = part(64, 14, 'soil', (p) => { p.moveTo(0, 14); p.quadraticCurveTo(10, 2, 32, 2); p.quadraticCurveTo(54, 2, 64, 14); p.closePath(); });
  P.wlRope = part(56, 8, 'gold', (p) => { rr(p, 0, 2, 56, 4, 2); }, { outline: 1.4 });

  // ── 禾田 farm ──
  P.fmBed = part(76, 22, 'soil', (p, m) => { ell(p, 38, 11, 37, 10.5); m.moveTo(8, 11); m.quadraticCurveTo(38, 5, 68, 11); m.moveTo(10, 15); m.quadraticCurveTo(38, 10, 66, 15); }, { markW: 1.2, markColor: '#6b4a2c' });
  P.fmStalk = part(16, 40, 'leaf', (p) => { rr(p, 6.8, 8, 2.4, 32, 1.2); poly(p, [8, 26, 0, 20, 2, 18, 8, 22]); poly(p, [8, 20, 16, 13, 14, 11, 8, 16]); });
  P.fmEar = part(12, 22, 'grain', (p, m) => { p.moveTo(6, 0); p.quadraticCurveTo(13, 8, 9, 22); p.quadraticCurveTo(6, 18, 3, 22); p.quadraticCurveTo(-1, 8, 6, 0); p.closePath(); for (let i = 0; i < 4; i++) { m.moveTo(3.5, 5 + i * 4); m.lineTo(8.5, 7 + i * 4); } }, { markW: 1, markColor: '#b3893f' });
  P.fmHat = part(26, 9, 'straw', (p) => { poly(p, [0, 9, 13, 0, 26, 9]); });
  P.grainBag = part(22, 20, 'paper', (p, m) => { p.moveTo(5, 5); p.quadraticCurveTo(0, 20, 11, 20); p.quadraticCurveTo(22, 20, 17, 5); p.lineTo(14, 2); p.lineTo(8, 2); p.closePath(); line(m, 7.5, 5.5, 14.5, 5.5); m.moveTo(9, 12); m.lineTo(13, 12); m.moveTo(11, 10); m.lineTo(11, 15); }, { markW: 1.5, markColor: '#a0662c' });

  // ── 籍车 lobber (traction trebuchet) ──
  P.lbBase = part(56, 12, 'woodDark', (p) => { rr(p, 0, 0, 56, 12, 3); });
  P.lbPost = part(10, 46, 'wood', (p) => { poly(p, [0, 46, 3, 0, 7, 0, 10, 46]); });
  P.lbArm = part(80, 7, 'wood', (p, m) => { rr(p, 0, 0, 80, 7, 3); circ(m, 30, 3.5, 1.6); }, { markW: 1.6 });
  P.lbWeight = part(20, 18, 'stone', (p) => { rr(p, 0, 0, 20, 18, 4); });
  P.lbPouch = part(14, 12, 'rope', (p) => { p.moveTo(0, 0); p.quadraticCurveTo(7, 16, 14, 0); p.closePath(); });
  P.stone = part(16, 15, 'stone', (p) => { p.moveTo(3, 2); p.lineTo(11, 0); p.lineTo(16, 6); p.lineTo(13, 14); p.lineTo(4, 15); p.lineTo(0, 8); p.closePath(); });

  // ── 铁蒺藜 spikes (flat) ──
  P.caltrop = part(16, 14, 'iron', (p) => { poly(p, [8, 0, 10, 5, 16, 6, 11, 9, 13, 14, 8, 11, 3, 14, 5, 9, 0, 6, 6, 5]); });

  // ── 陷坑 pit (flat) ──
  P.ptHole = part(70, 22, 'lacBlack', (p) => { ell(p, 35, 11, 34, 10); }, { outline: 1.6 });
  P.ptCover = part(72, 22, 'straw', (p, m) => { ell(p, 36, 11, 35, 10.5); for (let i = 0; i < 6; i++) { m.moveTo(8 + i * 11, 4); m.lineTo(4 + i * 11, 18); } }, { markW: 1.2, markColor: '#a98a3a' });
  P.ptSpade = part(10, 30, 'wood', (p) => { rr(p, 3.5, 0, 3, 20, 1.5); p.moveTo(0, 18); p.lineTo(10, 18); p.lineTo(8, 30); p.lineTo(2, 30); p.closePath(); });
  P.sealShou = part(22, 22, 'lacRed', (p, m) => { rr(p, 0, 0, 22, 22, 3); line(m, 5, 6, 17, 6); line(m, 11, 6, 11, 17); line(m, 5, 11, 17, 11); line(m, 6, 17, 16, 17); }, { markW: 2, markColor: '#fff3df' });

  // ── 火油罐 burner ──
  P.brFrame = part(44, 40, 'woodDark', (p) => { poly(p, [0, 40, 18, 0, 26, 0, 44, 40, 38, 40, 22, 8, 6, 40]); });
  P.brPot = part(20, 22, 'lacBlack', (p, m) => { p.moveTo(6, 0); p.lineTo(14, 0); p.lineTo(13, 4); p.quadraticCurveTo(21, 8, 19, 15); p.quadraticCurveTo(17, 22, 10, 22); p.quadraticCurveTo(3, 22, 1, 15); p.quadraticCurveTo(-1, 8, 7, 4); p.closePath(); m.moveTo(3, 12); m.quadraticCurveTo(10, 15, 17, 12); }, { markW: 1.6, markColor: PAL_RED });
  P.brFuse = part(8, 10, 'rope', (p) => { p.moveTo(2, 10); p.quadraticCurveTo(0, 4, 5, 0); p.lineTo(7, 1); p.quadraticCurveTo(3, 5, 4, 10); p.closePath(); }, { outline: 1.2 });
  P.flame = part(16, 22, 'gold', (p) => { p.moveTo(8, 0); p.quadraticCurveTo(16, 10, 13, 17); p.quadraticCurveTo(8, 24, 3, 17); p.quadraticCurveTo(0, 10, 8, 0); p.closePath(); }, { outline: 0 });

  // ── 礌石 strike ──
  P.boulder = part(48, 44, 'stone', (p, m) => { p.moveTo(10, 4); p.lineTo(30, 0); p.lineTo(46, 12); p.lineTo(48, 30); p.lineTo(34, 44); p.lineTo(12, 42); p.lineTo(0, 26); p.closePath(); line(m, 6, 18, 42, 10); line(m, 4, 30, 44, 26); line(m, 18, 2, 22, 42); line(m, 34, 2, 30, 43); }, { markW: 1.6, markColor: '#7a5b34' });

  // ── 阳燧 beam ──
  P.bmStand = part(30, 40, 'woodDark', (p) => { poly(p, [0, 40, 12, 6, 18, 6, 30, 40, 24, 40, 15, 14, 6, 40]); });
  P.bmMirror = part(14, 40, 'bronze', (p, m) => { p.moveTo(2, 0); p.quadraticCurveTo(16, 20, 2, 40); p.lineTo(8, 40); p.quadraticCurveTo(-2, 20, 8, 0); p.closePath(); m.moveTo(9, 6); m.quadraticCurveTo(4, 20, 9, 34); }, { markW: 1.2, markColor: '#fff2c4' });
  P.bmWheel = wheel(7, 'wood', 5);

  // ── 木甲兵 walker (red lacquer, faces left) ──
  P.wkLeg = part(8, 20, 'lacBlack', (p) => { rr(p, 0, 0, 8, 17, 3); rr(p, -3, 15, 11, 5, 2); });
  P.wkBody = part(26, 26, 'lacRed', (p, m) => { p.moveTo(3, 0); p.lineTo(23, 0); p.quadraticCurveTo(27, 13, 24, 26); p.lineTo(2, 26); p.quadraticCurveTo(-1, 13, 3, 0); p.closePath(); m.moveTo(4, 8); m.quadraticCurveTo(13, 12, 22, 8); circ(m, 13, 17, 3); }, { markW: 1.6, markColor: '#E8C35A' });
  P.wkHead = part(22, 22, 'lacRed', (p, m) => { rr(p, 0, 0, 22, 22, 7); m.moveTo(4, 9); m.lineTo(9, 10.5); m.moveTo(18, 9); m.lineTo(13, 10.5); circ(m, 6.5, 12, 0.9); circ(m, 15.5, 12, 0.9); m.moveTo(8, 16.5); m.quadraticCurveTo(11, 18.5, 14, 16.5); }, { markW: 1.7, markColor: '#E8C35A' });
  P.wkCrest = part(10, 9, 'gold', (p) => { poly(p, [0, 9, 5, 0, 10, 9]); });
  P.wkArm = part(7, 18, 'lacBlack', (p) => { rr(p, 0, 0, 7, 18, 3.5); });
  P.wkShieldS = part(12, 16, 'woodRed', (p, m) => { rr(p, 0, 0, 12, 16, 4); circ(m, 6, 8, 2); }, { markW: 1.4, markColor: '#E8C35A' });
  P.sdShield = part(14, 46, 'woodRed', (p, m) => { rr(p, 0, 0, 14, 46, 5); line(m, 7, 4, 7, 42); circ(m, 7, 23, 3.5); line(m, 2, 12, 12, 12); line(m, 2, 34, 12, 34); }, { markW: 1.6, markColor: '#E8C35A' });
  P.sdShieldHalf = part(14, 24, 'woodRed', (p) => { poly(p, [0, 4, 6, 0, 14, 3, 12, 24, 1, 22]); });

  // ── 冲车 ram ──
  P.rmBody = part(64, 22, 'lacRed', (p, m) => { rr(p, 0, 0, 64, 22, 4); line(m, 16, 3, 16, 19); line(m, 48, 3, 48, 19); }, { markW: 1.6, markColor: '#E8C35A' });
  P.rmRoof = part(70, 22, 'lacBlack', (p, m) => { p.moveTo(0, 22); p.lineTo(8, 4); p.quadraticCurveTo(35, -4, 62, 4); p.lineTo(70, 22); p.closePath(); m.moveTo(10, 14); m.quadraticCurveTo(35, 6, 60, 14); }, { markW: 1.4, markColor: '#C9A23A' });
  P.rmHead = part(30, 22, 'bronze', (p, m) => { p.moveTo(30, 3); p.lineTo(12, 0); p.quadraticCurveTo(0, 2, 2, 12); p.quadraticCurveTo(3, 20, 12, 22); p.lineTo(30, 19); p.closePath(); poly(p, [6, 3, 0, -7, 11, 1]); circ(m, 11, 9, 1.6); m.moveTo(4, 15); m.lineTo(9, 15); }, { markW: 1.8 });
  P.rmLog = part(40, 9, 'woodDark', (p) => { rr(p, 0, 0, 40, 9, 4); });
  P.rmWheel = wheel(9, 'lacBlack', 6);

  // ── 蚁傅 ant (one of eight) ──
  P.anBody = part(20, 11, 'lacRed', (p, m) => { ell(p, 13, 5.5, 7, 5.5); ell(p, 4.5, 5.5, 4.5, 4.5); circ(m, 3.5, 4.5, 0.8); }, { markW: 1.6 });
  P.anLegs = part(18, 7, 'lacBlack', (p) => { for (let i = 0; i < 3; i++) { rr(p, 2 + i * 6, 0, 2.2, 7, 1); } });

  // ── 铜甲力士 brute (bronze) ──
  P.btLeg = part(11, 24, 'bronze', (p) => { rr(p, 0, 0, 11, 20, 3); rr(p, -3, 18, 15, 6, 2); });
  P.btBody = part(40, 34, 'bronze', (p, m) => { p.moveTo(5, 0); p.lineTo(35, 0); p.quadraticCurveTo(42, 17, 37, 34); p.lineTo(3, 34); p.quadraticCurveTo(-2, 17, 5, 0); p.closePath(); line(m, 20, 3, 20, 31); m.moveTo(6, 12); m.quadraticCurveTo(20, 17, 34, 12); m.moveTo(6, 22); m.quadraticCurveTo(20, 27, 34, 22); }, { markW: 1.5, markColor: '#6f4a1e' });
  P.btHead = part(26, 24, 'bronze', (p, m) => { rr(p, 0, 2, 26, 22, 8); poly(p, [8, 4, 13, -4, 18, 4]); line(m, 4, 12, 22, 12); circ(m, 8, 16, 1); circ(m, 18, 16, 1); }, { markW: 1.8 });
  P.btArm = part(11, 26, 'bronze', (p) => { rr(p, 0, 0, 11, 26, 5); });

  // ── 铜犀冲车 rhino (boss) ──
  P.rhBody = part(130, 40, 'lacRed', (p, m) => { rr(p, 0, 0, 130, 40, 8); for (let i = 1; i < 5; i++) line(m, i * 26, 4, i * 26, 36); }, { markW: 1.8, markColor: '#E8C35A' });
  P.rhPlate = part(34, 30, 'bronze', (p, m) => { p.moveTo(0, 30); p.quadraticCurveTo(2, 0, 17, 0); p.quadraticCurveTo(32, 0, 34, 30); p.closePath(); circ(m, 17, 12, 2); }, { markW: 1.5, markColor: '#6f4a1e' });
  P.rhHead = part(52, 40, 'bronze', (p, m) => { p.moveTo(52, 6); p.lineTo(22, 2); p.quadraticCurveTo(2, 4, 3, 22); p.quadraticCurveTo(4, 38, 22, 40); p.lineTo(52, 36); p.closePath(); poly(p, [12, 8, -2, -16, 22, 4]); circ(m, 22, 17, 2.4); m.moveTo(8, 28); m.lineTo(16, 28); }, { markW: 2 });
  P.rhWheel = wheel(13, 'lacBlack', 8);
  P.crack = part(30, 26, 'white', (p) => { line(p, 15, 0, 12, 9, 18, 13, 10, 26); line(p, 12, 9, 2, 12); line(p, 18, 13, 29, 17); });

  // ── misc fx parts ──
  P.gear = part(14, 14, 'gold', (p) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rr(p, 7 + Math.cos(a) * 5.5 - 1.8, 7 + Math.sin(a) * 5.5 - 1.8, 3.6, 3.6, 0.8); } circ(p, 7, 7, 5); }, { outline: 1.4 });
  P.token = part(26, 26, 'bronze', (p, m) => { circ(p, 13, 13, 12.5); rr(m, 9, 9, 8, 8, 1); }, { markW: 1.6 });
  P.log = part(20, 20, 'woodDark', (p, m) => { circ(p, 10, 10, 9.5); circ(m, 10, 10, 6); circ(m, 10, 10, 2.5); }, { markW: 1.2, markColor: '#5f3b1e' });
  P.plank = part(18, 8, 'wood', (p) => { poly(p, [0, 1, 18, 0, 17, 8, 1, 7]); });
  P.chip = part(8, 5, 'lacRed', (p) => { poly(p, [0, 1, 8, 0, 7, 5, 1, 4]); });
  return P;
}
const PAL_RED = '#C8372D';
