// Volume-2 rigs (spec §6.3): 4 cards (bank, radial, gust, hook) and 6 machines + the 夜枭木鸢 boss.
// Same conventions as rigs.ts: units face right (origin = cell centre at the feet), machines face left (origin = body
// centre at the feet), design units, rigid parts on bones; a rotating assembly shares one pivot (each part's px/py is
// the shared pivot in that part's own box).
import type { Pose, PoseState, Rig, RigPart } from './rigs';

const op = (x: number, y: number, b = 'op', foe = false): RigPart[] => foe ? [
  { p: 'dollBody', b, x: x - 7, y: y - 17 },
  { p: 'foeHead', b: b + 'H', x: x - 9, y: y - 33 },
  { p: 'foeCap', b: b + 'H', x: x - 10, y: y - 37 },
] : [
  { p: 'dollArm', b: b + 'A', x: x - 4, y: y - 15, px: 2.5, py: 2, r: -0.4 },
  { p: 'dollBody', b, x: x - 7, y: y - 17 },
  { p: 'dollHead', b: b + 'H', x: x - 9, y: y - 33 },
  { p: 'dollHair', b: b + 'H', x: x - 9, y: y - 34 },
  { p: 'dollBand', b: b + 'H', x: x - 9.5, y: y - 30 },
];
const wheels = (back = 22): RigPart[] => [{ p: 'rmWheel', b: 'wheel', x: -18, y: -9, px: 9, py: 9 }, { p: 'rmWheel', b: 'wheel', x: 16, y: -9, px: 9, py: 9 }].concat(back ? [] : []);

export const RIGS2: Record<string, Rig> = {
  bank: { shadow: 38, height: 106, parts: [
    { p: 'bkMound', x: -38, y: -13 },
    { p: 'bkSack', x: -48, y: -25, sx: 0.8, sy: 0.8 },
    { p: 'bkBody', b: 'body', x: -27, y: -52 },
    { p: 'bkHoop', b: 'body', x: -29, y: -47 },
    { p: 'bkHoop', b: 'body', x: -29, y: -25 },
    { p: 'bkDoor', b: 'body', x: -8, y: -33 },
    { p: 'bkGrain', b: 'grain', x: -15, y: -10 },
    { p: 'bkRoof', b: 'roof', x: -35, y: -83 },
    { p: 'bkKnob', b: 'roof', x: -5, y: -87 },
    { p: 'shFlag', b: 'flag', x: 0, y: -85, px: 1, py: 22 },
    { p: 'bkSack', x: -38, y: -19 },
    ...op(34, -10),
  ] },
  radial: { shadow: 34, height: 78, parts: [
    { p: 'shFlag', b: 'flag', x: -26, y: -30, px: 1, py: 22 },
    ...op(-30, -10),
    { p: 'rdDisc', x: -32, y: -17 },
    { p: 'rdPost', x: -6, y: -46 },
    { p: 'rdCollar', x: -15, y: -51 },
    { p: 'rdQuiver', b: 'arm', x: 0, y: -54, px: 22, py: 6 },
    { p: 'rdStock', b: 'arm', x: 0, y: -54, px: 18, py: 4.5 },
    { p: 'rdArrow', b: 'arm', x: 0, y: -54, px: -6, py: 7 },
    { p: 'rdString', b: 'arm', x: 0, y: -54, px: -27, py: 21 },
    { p: 'rdBow', b: 'arm', x: 0, y: -54, px: -28, py: 21 },
  ] },
  gust: { shadow: 34, height: 72, parts: [
    { p: 'gsStand', x: -30, y: -18 },
    ...op(-38, -10),
    { p: 'gsBoard', x: -30, y: -28 },
    { p: 'gsBag', x: -26, y: -47 },
    { p: 'gsBoard', b: 'top', x: 26, y: -48, px: 56, py: 4.5 },
    { p: 'gsHandle', b: 'top', x: 26, y: -48, px: 46, py: 18 },
    { p: 'gsNozzle', x: 22, y: -42 },
    { p: 'gsPuff', b: 'puff', x: 46, y: -47, px: 0, py: 9 },
  ] },
  hook: { shadow: 34, height: 66, parts: [
    { p: 'hkSled', x: -32, y: -12 },
    ...op(-34, -10),
    { p: 'hkFrame', x: -18, y: -48 },
    { p: 'hkPole', b: 'pole', x: -4, y: -46, px: 30, py: 3 },
    { p: 'hkBand', b: 'pole', x: -4, y: -46, px: 4, py: 4 },
    { p: 'hkHead', b: 'pole', x: -4, y: -46, px: -60, py: 14 },
  ] },
  flyer: { shadow: 18, height: 46, parts: [
    { p: 'frTail', b: 'tail', x: 16, y: -30, px: 0, py: 4.5 },
    { p: 'frWing', b: 'wingB', x: 2, y: -36, px: 4, py: 5, sx: 0.85, sy: 0.85 },
    { p: 'frFeet', b: 'feet', x: -7, y: -9 },
    { p: 'frBody', b: 'body', x: -20, y: -30 },
    { p: 'frBelly', b: 'body', x: -16, y: -21 },
    { p: 'frHead', b: 'head', x: -30, y: -41 },
    { p: 'frEye', b: 'head', x: -27, y: -37 },
    { p: 'frBeak', b: 'head', x: -39, y: -35 },
    { p: 'frWing', b: 'wingF', x: -2, y: -34, px: 4, py: 5 },
  ] },
  smoker: { shadow: 40, height: 104, parts: [
    { p: 'rmWheel', b: 'wheelB', x: 22, y: -9, px: 9, py: 9 },
    ...op(28, -30, 'drv', true),
    { p: 'smBody', x: -30, y: -32 },
    { p: 'smChim', x: -6, y: -75 },
    { p: 'smPot', x: -20, y: -54 },
    { p: 'smGlow', b: 'glow', x: -17, y: -55 },
    { p: 'smPuff', b: 'puffA', x: -2, y: -86, px: 12, py: 11 },
    { p: 'smPuff', b: 'puffB', x: 4, y: -100, px: 12, py: 11, sx: 0.75, sy: 0.75 },
    ...wheels(),
  ] },
  ladder: { shadow: 42, height: 72, parts: [
    { p: 'rmWheel', b: 'wheelB', x: 22, y: -9, px: 9, py: 9 },
    ...op(28, -28, 'drv', true),
    { p: 'ldBase', x: -31, y: -30 },
    { p: 'ldRest', x: 16, y: -46 },
    { p: 'ldLadder', b: 'lad', x: 24, y: -40, px: 92, py: 7 },
    { p: 'ldGrapnel', b: 'lad', x: 24, y: -40, px: 98, py: 9 },
    { p: 'ldMantlet', x: -42, y: -64 },
    ...wheels(),
  ] },
  drummer: { shadow: 40, height: 104, parts: [
    { p: 'rmWheel', b: 'wheelB', x: 22, y: -9, px: 9, py: 9 },
    { p: 'dmBody', x: -29, y: -31 },
    { p: 'dmFrame', x: -27, y: -62 },
    { p: 'dmDrum', b: 'drum', x: -4, y: -64, px: 19, py: 19 },
    { p: 'dmSkin', b: 'drum', x: -4, y: -64, px: 14, py: 14 },
    ...op(26, -31, 'drv', true),
    { p: 'dmStick', b: 'stick', x: 18, y: -46, px: 2.5, py: 22 },
    ...wheels(),
  ] },
  shielder_m: { shadow: 28, height: 72, parts: [
    { p: 'wkArm', b: 'armB', x: 6, y: -44, px: 3.5, py: 3 },
    { p: 'wkLeg', b: 'legB', x: 4, y: -20, px: 4, py: 1 },
    { p: 'wkBody', b: 'body', x: -13, y: -44 },
    { p: 'wkHead', b: 'head', x: -12, y: -66 },
    { p: 'wkCrest', b: 'head', x: -6, y: -73 },
    { p: 'wkLeg', b: 'legF', x: -10, y: -20, px: 4, py: 1 },
    { p: 'sdShieldM', b: 'shield', x: -27, y: -59 },
  ] },
  owl: { shadow: 52, height: 132, parts: [
    { p: 'owWing', b: 'wingB', x: 12, y: -98, px: 6, py: 14, sx: 0.9, sy: 0.9 },
    { p: 'owTail', b: 'tail', x: 20, y: -52, px: 0, py: 13 },
    { p: 'owTalon', b: 'feet', x: -16, y: -12 },
    { p: 'owTalon', b: 'feet', x: 2, y: -12 },
    { p: 'owBody', b: 'body', x: -32, y: -88 },
    { p: 'owBelly', b: 'body', x: -24, y: -62 },
    { p: 'owHead', b: 'head', x: -37, y: -124 },
    { p: 'owEye', b: 'eyes', x: -31, y: -113 },
    { p: 'owEye', b: 'eyes', x: -11, y: -113 },
    { p: 'owEyeRage', b: 'rage', x: -31, y: -113 },
    { p: 'owEyeRage', b: 'rage', x: -11, y: -113 },
    { p: 'owBeak', b: 'head', x: -22, y: -100 },
    { p: 'owWing', b: 'wingF', x: 2, y: -92, px: 6, py: 14 },
  ] },
};

const S = Math.sin;
/** poses for the volume-2 kinds; returns false for a kind it does not know */
export function pose2(kind: string, st: PoseState, out: Pose): boolean {
  const t = st.t; const breathe = 1 + S(t * 3.9) * 0.012; const k = st.atk > 0 ? S(Math.min(1, st.atk) * Math.PI) : 0;
  switch (kind) {
    case 'bank': // the roof lifts and grain spills at the door just before a yield (extra = 0..1 how close)
      out.root = { s: breathe }; out.roof = { y: -k * 7 - (st.extra > 0.85 ? S(t * 30) * 0.8 : 0) }; out.flag = { r: S(t * 2.3) * 0.12 };
      out.grain = { hide: st.extra < 0.6, s: 0.6 + st.extra * 0.4 }; out.opA = { r: S(t * 2) * 0.2 }; out.opH = { y: S(t * 1.7) * 0.6 }; return true;
    case 'radial': // the turntable sweeps; mode 1 = it is shooting at the sky (aims up)
      out.root = { s: breathe }; out.arm = { r: st.mode === 1 ? -0.55 + S(t * 1.3) * 0.05 : -0.08 + S(t * 0.8) * 0.28, x: -3 * k };
      out.flag = { r: S(t * 2.1) * 0.15 }; out.opH = { y: S(t * 1.7) * 0.6 }; return true;
    case 'gust': { // the top board breathes open; a blast snaps it shut and puffs wind out of the nozzle
      const open = st.atk > 0 ? 0.04 + 0.2 * Math.min(1, st.atk * 1.4 - 0.2) * (st.atk > 0.15 ? 1 : 0) : 0.12 + S(t * 1.6) * 0.05;
      out.root = { s: breathe }; out.top = { r: Math.max(0, open) }; out.puff = { hide: !(st.atk > 0 && st.atk < 0.8), s: 0.5 + st.atk * 1.3, x: st.atk * 30 };
      out.opA = { r: -0.4 + (st.atk > 0 ? -0.6 * k : S(t * 1.6) * 0.25) }; out.opH = { y: S(t * 1.7) * 0.6 }; return true;
    }
    case 'hook': // the pole thrusts out and hauls back
      out.root = { s: breathe }; out.pole = { r: -0.1 + S(t * 1.1) * 0.03 - k * 0.06, x: k * 16 }; out.opA = { r: -0.3 - k * 0.5 }; out.opH = { y: S(t * 1.7) * 0.6 }; return true;
    case 'flyer': { // mode 0 flying (flap), 1 perched on a field (pecking), 2 blown down (dazed, wings drooped)
      if (st.mode === 0) { const f = S(t * 15); out.wingF = { r: -0.15 + f * 0.75 }; out.wingB = { r: -0.25 + f * 0.65 }; out.body = { y: f * 1.2 }; out.head = { y: f * 1.2 }; out.tail = { r: S(t * 7) * 0.12 }; out.feet = { hide: true }; }
      else if (st.mode === 1) { const pk = Math.max(0, S(t * 9)); out.wingF = { r: 0.25 }; out.wingB = { r: 0.2 }; out.head = { y: pk * 4, x: -pk * 1.5 }; out.body = {}; out.tail = { r: -0.15 + S(t * 3) * 0.05 }; }
      else { out.wingF = { r: 0.55 + S(t * 20) * 0.05 }; out.wingB = { r: 0.5 }; out.head = { y: 2 }; out.tail = { r: 0.25 }; }
      out.root = {}; return true;
    }
    case 'smoker': {
      const wr = -st.walk / 9; out.wheel = { r: wr }; out.wheelB = { r: wr };
      const a = (t * 0.7) % 1, b = (t * 0.7 + 0.5) % 1;
      out.puffA = { y: -a * 22, x: a * 6, s: 0.55 + a * 0.75, hide: a > 0.92 }; out.puffB = { y: -b * 22, x: b * 6, s: 0.55 + b * 0.75, hide: b > 0.92 };
      out.glow = { s: 1 + S(t * 9) * 0.05 }; out.drvH = { y: S(t * 3) * 0.6 }; out.root = { y: S(st.walk * 0.6) * 0.5 }; return true;
    }
    case 'ladder': { // mode = kernel lad state: 0 rolling, 1 raising (extra = progress), 2 leaning on a unit, 3 pulled down
      const wr = -st.walk / 9; out.wheel = { r: wr }; out.wheelB = { r: wr };
      const r = st.mode === 0 ? 0.06 + S(t * 4) * 0.015 : st.mode === 1 ? 0.06 + st.extra * 0.94 : st.mode === 2 ? 1.0 + S(t * 2) * 0.01 : -0.04;
      out.lad = { r }; out.drvH = { y: S(t * 3) * 0.6 }; out.root = { y: S(st.walk * 0.6) * 0.5 }; return true;
    }
    case 'drummer': { // BOOM on the beat: stick strikes, the drum pulses
      const wr = -st.walk / 9; out.wheel = { r: wr }; out.wheelB = { r: wr };
      const beat = (t * 2.2) % 1; const hit = beat < 0.18 ? 1 - beat / 0.18 : 0;
      out.stick = { r: -0.2 - (1 - hit) * 0.55 + hit * 0.15 }; out.drum = { s: 1 + hit * 0.06 }; out.drvH = { y: hit * 1.5 }; out.root = { y: S(st.walk * 0.6) * 0.5 }; return true;
    }
    case 'owl': { // mode 0 high · 1 swoop warning (wings tucked, shivering) · 2 swooping · 3 down / landed; extra = rage
      out.eyes = { hide: st.extra > 0 }; out.rage = { hide: !(st.extra > 0) };
      if (st.mode === 0) { const f = S(t * 3.4); out.wingF = { r: -0.3 + f * 0.45 }; out.wingB = { r: -0.35 + f * 0.4 }; out.body = { y: f * 2 }; out.head = { y: f * 2 }; out.tail = { r: S(t * 2) * 0.08 }; out.root = { r: S(t * 1.1) * 0.03 }; }
      else if (st.mode === 1) { const sh = S(t * 46) * 1.2; out.wingF = { r: 0.75 }; out.wingB = { r: 0.7 }; out.head = { x: sh, y: -2 }; out.body = { x: sh * 0.5 }; out.tail = { r: -0.1 }; out.root = { r: -0.06 }; }
      else if (st.mode === 2) { out.wingF = { r: 1.0 }; out.wingB = { r: 0.95 }; out.head = { y: 3 }; out.body = {}; out.tail = { r: -0.25 }; out.root = { r: -0.28 }; }
      else { const w = S(st.walk * 0.5); out.wingF = { r: 0.32 + S(t * 1.5) * 0.04 }; out.wingB = { r: 0.28 }; out.body = { y: Math.abs(w) * 2 }; out.head = { y: Math.abs(w) * 2, r: w * 0.04 }; out.tail = { r: 0.15 }; out.feet = { x: w * 3 }; out.root = { r: w * 0.03 }; }
      return true;
    }
    default: return false;
  }
}
