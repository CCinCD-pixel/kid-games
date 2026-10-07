// Volume-2 parts (spec §6.3): 粮仓 bank · 转射机 radial · 橐 gust · 钩拒 hook (Mohist teal on wood) and 木鹊 flyer ·
// 烟车 smoker · 云梯车 ladder · 鼓车 drummer · 铜盾 shield · 夜枭木鸢 owl (鲁班's red lacquer, gold trim, black lacquer).
// Same rules as parts.ts: Path2D in design units + a material, shaded only through shadePart (no flat fills here).
import type { PartDef } from './parts';
import type { Mat } from './shade';

type PartFn = (w: number, h: number, mat: Mat, draw: (p: Path2D, m: Path2D) => void, o?: { markW?: number; markColor?: string; outline?: number }) => PartDef;
const rr = (p: Path2D, x: number, y: number, w: number, h: number, r: number): void => { p.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); };
const circ = (p: Path2D, cx: number, cy: number, r: number): void => { p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2); };
const ell = (p: Path2D, cx: number, cy: number, rx: number, ry: number, rot = 0): void => { p.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot)); p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); };
const poly = (p: Path2D, pts: number[]): void => { p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); p.closePath(); };
const line = (p: Path2D, ...pts: number[]): void => { p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); };
const GOLD = '#E8C35A';

export function buildVol2Parts(P: Record<string, PartDef>, part: PartFn): void {
  // ── 粮仓 bank: a round straw-roofed granary on a mound, hooped planks, a black door, grain sacks ──
  P.bkMound = part(76, 14, 'soil', (p) => { p.moveTo(0, 14); p.quadraticCurveTo(12, 2, 38, 2); p.quadraticCurveTo(64, 2, 76, 14); p.closePath(); });
  P.bkBody = part(54, 42, 'wood', (p, m) => { p.moveTo(2, 0); p.lineTo(52, 0); p.quadraticCurveTo(56, 21, 53, 42); p.lineTo(1, 42); p.quadraticCurveTo(-2, 21, 2, 0); p.closePath(); for (let i = 1; i < 6; i++) line(m, i * 9, 2, i * 9 + (i - 3) * 0.6, 40); }, { markW: 1.1 });
  P.bkHoop = part(58, 6, 'rope', (p, m) => { rr(p, 0, 0.5, 58, 5, 2.5); for (let i = 1; i < 10; i++) line(m, i * 5.8, 1, i * 5.8 - 2, 5); }, { markW: 0.9, outline: 1.4 });
  P.bkDoor = part(16, 20, 'lacBlack', (p, m) => { p.moveTo(0, 20); p.lineTo(0, 7); p.quadraticCurveTo(8, -2, 16, 7); p.lineTo(16, 20); p.closePath(); line(m, 8, 3, 8, 19); circ(m, 11.5, 13, 1); }, { markW: 1.1, markColor: GOLD });
  P.bkRoof = part(70, 34, 'straw', (p, m) => { p.moveTo(35, 0); p.quadraticCurveTo(52, 14, 70, 28); p.quadraticCurveTo(35, 38, 0, 28); p.quadraticCurveTo(18, 14, 35, 0); p.closePath(); for (let i = 0; i < 9; i++) { const x = 6 + i * 7.25; line(m, 35, 3, x, 28 + Math.sin((x / 70) * Math.PI) * 4); } }, { markW: 1, markColor: '#B48A2E' });
  P.bkKnob = part(10, 10, 'gold', (p) => { circ(p, 5, 5, 4.6); });
  P.bkSack = part(18, 18, 'paper', (p, m) => { p.moveTo(5, 3); p.quadraticCurveTo(9, 0, 13, 3); p.quadraticCurveTo(19, 9, 17, 16); p.quadraticCurveTo(9, 19, 1, 16); p.quadraticCurveTo(-1, 9, 5, 3); p.closePath(); m.moveTo(5, 5); m.quadraticCurveTo(9, 7, 13, 5); circ(m, 9, 11, 2.2); }, { markW: 1.2, markColor: '#B48A2E' });
  P.bkGrain = part(30, 8, 'grain', (p) => { ell(p, 15, 5, 14, 3.4); circ(p, 9, 3, 2.4); circ(p, 15, 2.4, 2.4); circ(p, 21, 3, 2.4); });

  // ── 转射机 radial: a crossbow on a turntable (it turns to shoot any way, the sky too) ──
  P.rdDisc = part(64, 16, 'woodDark', (p, m) => { ell(p, 32, 8, 31.5, 7.5); m.moveTo(4, 8); m.quadraticCurveTo(32, 16, 60, 8); for (let i = 0; i < 6; i++) { const x = 8 + i * 9.6; line(m, x, 9.5, x + 1, 13); } }, { markW: 1.1 });
  P.rdPost = part(12, 30, 'wood', (p, m) => { p.moveTo(2, 0); p.lineTo(10, 0); p.lineTo(12, 30); p.lineTo(0, 30); p.closePath(); line(m, 6, 3, 6, 27); }, { markW: 1 });
  P.rdCollar = part(30, 9, 'gold', (p) => { ell(p, 15, 4.5, 14.5, 4); }, { outline: 1.6 });
  P.rdStock = part(52, 9, 'woodDark', (p, m) => { poly(p, [0, 2, 52, 0, 52, 9, 0, 7]); line(m, 10, 2.5, 10, 6.5); }, { markW: 1.1 });
  P.rdBow = part(12, 42, 'woodRed', (p) => { p.moveTo(2, 0); p.quadraticCurveTo(14, 21, 2, 42); p.lineTo(6, 42); p.quadraticCurveTo(18, 21, 6, 0); p.closePath(); });
  P.rdString = part(4, 42, 'rope', (p) => { rr(p, 1, 0, 1.6, 42, 0.8); }, { outline: 1.2 });
  P.rdQuiver = part(14, 18, 'lacBlack', (p, m) => { rr(p, 0, 0, 14, 18, 2); for (let i = 0; i < 3; i++) line(m, 3 + i * 4, 1, 3 + i * 4, -5); }, { markW: 1.4, markColor: '#d9b37a' });
  P.rdArrow = part(26, 5, 'wood', (p) => { rr(p, 0, 1.6, 21, 2, 1); poly(p, [21, 0, 26, 2.5, 21, 5]); });

  // ── 橐 gust: a leather bellows on a stand; the top board swings on the nozzle hinge ──
  P.gsStand = part(60, 18, 'woodDark', (p, m) => { rr(p, 0, 0, 60, 7, 2); poly(p, [4, 6, 10, 6, 7, 18, 1, 18]); poly(p, [50, 6, 56, 6, 59, 18, 53, 18]); line(m, 8, 3.5, 52, 3.5); }, { markW: 0.9 });
  P.gsBoard = part(58, 9, 'woodRed', (p, m) => { p.moveTo(0, 2); p.quadraticCurveTo(28, -2, 58, 2.5); p.lineTo(58, 6.5); p.quadraticCurveTo(28, 11, 0, 7); p.closePath(); circ(m, 8, 4.5, 1.3); circ(m, 30, 4.5, 1.3); }, { markW: 1.3, markColor: GOLD });
  P.gsBag = part(48, 22, 'soil', (p, m) => { p.moveTo(0, 2); p.quadraticCurveTo(24, -3, 48, 6); p.lineTo(48, 16); p.quadraticCurveTo(24, 25, 0, 20); p.quadraticCurveTo(-3, 11, 0, 2); p.closePath(); for (let i = 1; i < 6; i++) { const x = i * 8; m.moveTo(x, 1.5); m.quadraticCurveTo(x - 3, 11, x, 20.5); } }, { markW: 1.2, markColor: '#5b3f26' });
  P.gsNozzle = part(24, 9, 'iron', (p, m) => { poly(p, [0, 0, 18, 2, 24, 1, 24, 8, 18, 7, 0, 9]); line(m, 18, 2, 18, 7); }, { markW: 1.1 });
  P.gsHandle = part(8, 20, 'wood', (p) => { rr(p, 2.5, 4, 3, 16, 1.5); rr(p, 0, 0, 8, 5, 2.5); });
  P.gsPuff = part(26, 18, 'white', (p) => { circ(p, 7, 10, 6.5); circ(p, 15, 7, 7); circ(p, 20, 11, 5.5); });

  // ── 钩拒 hook: a long pole with a hook and a pusher on an A-frame sled ──
  P.hkSled = part(64, 12, 'woodDark', (p, m) => { p.moveTo(0, 6); p.quadraticCurveTo(0, 0, 8, 0); p.lineTo(64, 0); p.lineTo(64, 8); p.lineTo(6, 12); p.closePath(); line(m, 10, 4, 60, 4); }, { markW: 1 });
  P.hkFrame = part(34, 38, 'wood', (p, m) => { poly(p, [14, 0, 20, 0, 34, 38, 28, 38, 17, 8, 6, 38, 0, 38]); line(m, 8, 26, 26, 26); }, { markW: 1.3 });
  P.hkPole = part(92, 6, 'wood', (p, m) => { rr(p, 0, 0.5, 92, 5, 2.5); for (let i = 1; i < 5; i++) line(m, i * 18, 0.8, i * 18, 5.2); }, { markW: 1, markColor: '#8b5a2b' });
  P.hkHead = part(22, 26, 'iron', (p) => { // hook (拒 pusher plate + 钩 hook curling back toward the wall)
    rr(p, 0, 9, 10, 8, 2); p.moveTo(8, 10); p.lineTo(15, 10); p.quadraticCurveTo(22, 4, 17, 0); p.lineTo(13, 3); p.quadraticCurveTo(15, 7, 11, 13); p.closePath(); rr(p, 6, 16, 4, 10, 1.5); });
  P.hkBand = part(8, 8, 'teal', (p) => { rr(p, 0, 0, 8, 8, 2); });

  // ── 木鹊 flyer: a lacquered wooden magpie (black back, white belly, gold beak), wings on pegs ──
  P.frBody = part(40, 20, 'lacBlack', (p, m) => { p.moveTo(0, 10); p.quadraticCurveTo(6, 0, 22, 1); p.quadraticCurveTo(38, 3, 40, 9); p.quadraticCurveTo(32, 19, 14, 19); p.quadraticCurveTo(2, 17, 0, 10); p.closePath(); m.moveTo(10, 6); m.quadraticCurveTo(22, 4, 34, 8); }, { markW: 1.2, markColor: '#6d7a8c' });
  P.frBelly = part(22, 10, 'paper', (p) => { p.moveTo(0, 3); p.quadraticCurveTo(11, -1, 22, 4); p.quadraticCurveTo(14, 11, 2, 9); p.closePath(); });
  P.frHead = part(16, 16, 'lacBlack', (p) => { circ(p, 8, 8, 7.6); });
  P.frEye = part(6, 6, 'gold', (p, m) => { circ(p, 3, 3, 2.8); circ(m, 2.6, 3, 1); }, { markW: 1.6, markColor: '#2a1b12' });
  P.frBeak = part(10, 6, 'gold', (p) => { poly(p, [10, 0.5, 0, 3, 10, 5.5]); });
  P.frTail = part(28, 9, 'lacBlack', (p, m) => { poly(p, [0, 3, 26, 0, 28, 3.5, 26, 9, 0, 6]); line(m, 4, 4.5, 24, 4.5); }, { markW: 1, markColor: '#4f6b8f' });
  P.frWing = part(34, 16, 'woodDark', (p, m) => { p.moveTo(0, 3); p.quadraticCurveTo(18, -2, 34, 4); p.lineTo(28, 8); p.lineTo(32, 11); p.lineTo(24, 13); p.lineTo(26, 16); p.quadraticCurveTo(8, 15, 0, 9); p.closePath(); for (let i = 0; i < 3; i++) { m.moveTo(6 + i * 7, 5); m.lineTo(12 + i * 7, 13); } circ(m, 4, 5.5, 1.6); }, { markW: 1.1, markColor: GOLD });
  P.frFeet = part(10, 6, 'gold', (p) => { line(p, 2, 0, 1, 6); line(p, 6, 0, 7, 6); rr(p, 1, 0, 2, 6, 1); rr(p, 5.5, 0, 2, 6, 1); });

  // ── 烟车 smoker: a red cart carrying an iron brazier with a chimney ──
  P.smBody = part(60, 24, 'lacRed', (p, m) => { rr(p, 0, 0, 60, 24, 4); line(m, 15, 3, 15, 21); line(m, 45, 3, 45, 21); m.moveTo(3, 5); m.lineTo(57, 5); }, { markW: 1.5, markColor: GOLD });
  P.smPot = part(34, 22, 'iron', (p, m) => { p.moveTo(0, 0); p.lineTo(34, 0); p.quadraticCurveTo(33, 20, 17, 22); p.quadraticCurveTo(1, 20, 0, 0); p.closePath(); m.moveTo(3, 5); m.lineTo(31, 5); circ(m, 9, 13, 1.6); circ(m, 25, 13, 1.6); }, { markW: 1.3 });
  P.smGlow = part(28, 6, 'gold', (p) => { ell(p, 14, 3, 13.5, 2.6); });
  P.smChim = part(12, 22, 'iron', (p, m) => { poly(p, [2, 0, 10, 0, 12, 22, 0, 22]); line(m, 1.5, 6, 10.5, 6); }, { markW: 1.1 });
  P.smPuff = part(24, 22, 'stone', (p) => { circ(p, 8, 13, 7.5); circ(p, 15, 8, 8); circ(p, 17, 15, 6.5); });

  // ── 云梯车 ladder: a red cart with a wooden mantlet and a tall folding ladder (grapnel at the tip) ──
  P.ldBase = part(62, 20, 'lacRed', (p, m) => { rr(p, 0, 0, 62, 20, 4); line(m, 20, 3, 20, 17); line(m, 42, 3, 42, 17); }, { markW: 1.5, markColor: GOLD });
  P.ldMantlet = part(18, 40, 'woodRed', (p, m) => { p.moveTo(2, 4); p.lineTo(16, 0); p.lineTo(18, 40); p.lineTo(0, 40); p.closePath(); line(m, 9, 4, 9, 37); line(m, 2, 15, 17, 13); line(m, 1.5, 28, 17.5, 27); }, { markW: 1.3, markColor: GOLD });
  P.ldLadder = part(96, 14, 'wood', (p, m) => { rr(p, 0, 0, 96, 3.6, 1.6); rr(p, 0, 10.4, 96, 3.6, 1.6); for (let i = 0; i < 9; i++) rr(p, 5 + i * 10.5, 2, 2.6, 10, 1); line(m, 2, 1.8, 94, 1.8); }, { markW: 0.8 });
  P.ldGrapnel = part(12, 18, 'iron', (p) => { rr(p, 4, 4, 4, 10, 1.5); p.moveTo(6, 0); p.quadraticCurveTo(12, 4, 9, 8); p.lineTo(7.5, 6); p.quadraticCurveTo(9, 3, 6, 2.5); p.closePath(); p.moveTo(6, 0); p.quadraticCurveTo(0, 4, 3, 8); p.lineTo(4.5, 6); p.quadraticCurveTo(3, 3, 6, 2.5); p.closePath(); });
  P.ldRest = part(10, 18, 'woodDark', (p) => { poly(p, [3, 0, 7, 0, 10, 18, 0, 18]); });

  // ── 鼓车 drummer: a red cart with a big upright drum on a frame ──
  P.dmBody = part(58, 22, 'lacRed', (p, m) => { rr(p, 0, 0, 58, 22, 4); line(m, 14, 3, 14, 19); line(m, 44, 3, 44, 19); m.moveTo(3, 5); m.lineTo(55, 5); }, { markW: 1.5, markColor: GOLD });
  P.dmFrame = part(46, 34, 'woodDark', (p, m) => { poly(p, [4, 34, 8, 34, 12, 4, 34, 4, 38, 34, 42, 34, 37, 0, 9, 0]); line(m, 10, 14, 36, 14); }, { markW: 1 });
  P.dmDrum = part(38, 38, 'lacRed', (p, m) => { circ(p, 19, 19, 18.5); circ(m, 19, 19, 15.5); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; circ(m, 19 + Math.cos(a) * 17, 19 + Math.sin(a) * 17, 0.9); } }, { markW: 1.4, markColor: GOLD });
  P.dmSkin = part(28, 28, 'paper', (p, m) => { circ(p, 14, 14, 13.4); circ(m, 14, 14, 6); m.moveTo(14, 8); m.lineTo(14, 20); }, { markW: 1.3, markColor: '#C8372D' });
  P.dmStick = part(5, 24, 'woodDark', (p) => { rr(p, 1, 3, 3, 21, 1.5); circ(p, 2.5, 3, 2.5); });

  // ── 铜盾甲兵: the same shield, cast in bronze (arrows and fire do nothing; a falling stone or pot does) ──
  // 铜盾甲兵 reads "made of bronze" at 32–60 px (QA r5): a round-topped, wider bronze shield with a big boss and studs,
  // a spiked bronze helmet instead of the gold crest, a bronze scale breastplate and bronze greaves — the
  // 盾甲兵 (all red lacquer, flat-topped wooden shield) and this one no longer share a silhouette
  P.sdShieldM = part(20, 50, 'bronze', (p, m) => { p.moveTo(0, 10); p.quadraticCurveTo(0, 0, 10, 0); p.quadraticCurveTo(20, 0, 20, 10); p.lineTo(20, 42); p.quadraticCurveTo(10, 52, 0, 42); p.closePath(); circ(m, 10, 24, 5.5); circ(m, 10, 24, 2); for (const [x, y] of [[4, 8], [16, 8], [4, 40], [16, 40]]) circ(m, x, y, 1.3); m.moveTo(3.5, 14); m.quadraticCurveTo(3, 24, 4.5, 33); }, { markW: 1.6, markColor: '#6a4a14' });
  P.smHelm = part(28, 22, 'bronze', (p, m) => { p.moveTo(0, 22); p.lineTo(1, 13); p.quadraticCurveTo(2, 5, 14, 5); p.quadraticCurveTo(26, 5, 27, 13); p.lineTo(28, 22); p.lineTo(24, 18); p.lineTo(4, 18); p.closePath(); poly(p, [11, 6, 14, 0, 17, 6]); line(m, 2, 14, 26, 14); circ(m, 14, 10, 1.4); }, { markW: 1.4, markColor: '#6a4a14' });
  P.smBody = part(26, 26, 'bronze', (p, m) => { p.moveTo(3, 0); p.lineTo(23, 0); p.quadraticCurveTo(27, 13, 24, 26); p.lineTo(2, 26); p.quadraticCurveTo(-1, 13, 3, 0); p.closePath(); for (const y of [7, 13, 19]) { m.moveTo(4, y); m.quadraticCurveTo(13, y + 3, 22, y); } }, { markW: 1.4, markColor: '#6a4a14' });
  P.smLeg = part(9, 20, 'bronze', (p, m) => { rr(p, 0, 0, 9, 17, 3); rr(p, -3, 15, 12, 5, 2); line(m, 1.5, 6, 7.5, 6); line(m, 1.5, 11, 7.5, 11); }, { markW: 1.2, markColor: '#6a4a14' });
  P.sdShieldMHalf = part(15, 24, 'bronze', (p) => { poly(p, [0, 4, 6, 0, 15, 3, 13, 24, 1, 22]); });

  // ── 夜枭木鸢 owl: a great night kite-owl of black lacquer and dark wood, gold eyes (red when it rages) ──
  P.owBody = part(64, 74, 'woodDark', (p, m) => { p.moveTo(32, 0); p.quadraticCurveTo(64, 6, 62, 40); p.quadraticCurveTo(58, 70, 32, 74); p.quadraticCurveTo(6, 70, 2, 40); p.quadraticCurveTo(0, 6, 32, 0); p.closePath(); for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - (r % 2); i++) { const x = 12 + i * 13 + (r % 2) * 6.5, y = 34 + r * 9; m.moveTo(x - 5, y); m.quadraticCurveTo(x, y + 6, x + 5, y); } }, { markW: 1.2, markColor: '#E0B47A' });
  P.owBelly = part(38, 40, 'wood', (p) => { p.moveTo(19, 0); p.quadraticCurveTo(38, 6, 36, 24); p.quadraticCurveTo(32, 40, 19, 40); p.quadraticCurveTo(6, 40, 2, 24); p.quadraticCurveTo(0, 6, 19, 0); p.closePath(); });
  P.owHead = part(58, 44, 'lacBlack', (p, m) => { p.moveTo(4, 0); p.quadraticCurveTo(14, 10, 29, 8); p.quadraticCurveTo(44, 10, 54, 0); p.quadraticCurveTo(60, 22, 52, 36); p.quadraticCurveTo(29, 48, 6, 36); p.quadraticCurveTo(-2, 22, 4, 0); p.closePath(); m.moveTo(29, 12); m.lineTo(29, 22); }, { markW: 1.4, markColor: GOLD });
  P.owEye = part(18, 18, 'gold', (p, m) => { circ(p, 9, 9, 8.6); circ(m, 9, 9, 4); circ(m, 9, 9, 1.4); }, { markW: 2.2, markColor: '#2a1b12' });
  P.owEyeRage = part(18, 18, 'lacRed', (p, m) => { circ(p, 9, 9, 8.6); circ(m, 9, 9, 3); }, { markW: 2.6, markColor: '#2a1b12' });
  P.owBeak = part(12, 14, 'gold', (p) => { p.moveTo(0, 0); p.lineTo(12, 0); p.quadraticCurveTo(9, 10, 5, 14); p.quadraticCurveTo(1, 8, 0, 0); p.closePath(); });
  P.owWing = part(104, 46, 'lacBlack', (p, m) => { p.moveTo(0, 8); p.quadraticCurveTo(50, -6, 104, 10); p.lineTo(92, 18); p.lineTo(100, 24); p.lineTo(84, 30); p.lineTo(90, 37); p.lineTo(70, 40); p.lineTo(72, 46); p.quadraticCurveTo(28, 44, 0, 26); p.closePath(); for (let i = 0; i < 5; i++) { m.moveTo(14 + i * 15, 10); m.quadraticCurveTo(20 + i * 15, 24, 18 + i * 14, 38); } circ(m, 8, 16, 2.5); }, { markW: 1.3, markColor: GOLD });
  P.owTail = part(46, 26, 'woodDark', (p, m) => { poly(p, [0, 4, 40, 0, 46, 6, 42, 13, 46, 20, 40, 26, 0, 22]); line(m, 4, 13, 40, 13); line(m, 4, 8, 36, 4); line(m, 4, 18, 36, 22); }, { markW: 1.1, markColor: GOLD });
  P.owTalon = part(16, 12, 'iron', (p) => { rr(p, 5, 0, 5, 7, 2); p.moveTo(0, 12); p.quadraticCurveTo(2, 5, 7, 6); p.lineTo(9, 6); p.quadraticCurveTo(15, 5, 16, 12); p.lineTo(13, 10); p.quadraticCurveTo(8, 8, 3, 10); p.closePath(); });
  P.owString = part(4, 60, 'rope', (p) => { rr(p, 1.2, 0, 1.6, 60, 0.8); }, { outline: 1 });
}
