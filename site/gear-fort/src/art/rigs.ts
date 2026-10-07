// Rigid-part rigs (spec §6.2.4): every character = parts on bones, posed per frame from a few state numbers.
// Units face right (origin = cell centre at the feet); machines face left (origin = body centre at the feet).
// Coordinates in design units (1 tile = 100 du; y up is negative). Poses are pure functions of state — no allocation
// beyond the returned record, which the renderer reuses.

import { RIGS2, pose2 } from './rigs2';

export interface RigPart { p: string; b?: string; x: number; y: number; px?: number; py?: number; r?: number; sx?: number; sy?: number; z?: number }
export interface Rig { parts: RigPart[]; shadow: number /* shadow half-width du */; height: number }
export interface Bone { x?: number; y?: number; r?: number; s?: number; hide?: boolean }
export type Pose = Record<string, Bone>;
/** what the renderer knows about an entity this frame */
export interface PoseState { t: number; walk: number; atk: number; hurt: number; mode: number; hp: number; extra: number }

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

export const RIGS: Record<string, Rig> = {
  shooter: { shadow: 34, height: 66, parts: [
    { p: 'shWheel', b: 'wheel', x: -20, y: -11, px: 10, py: 10, sx: 0.9, sy: 0.9 },
    ...op(-30, -12),
    { p: 'shFrame', x: -30, y: -26 },
    { p: 'shStock', b: 'stock', x: -16, y: -36 },
    { p: 'shBox', b: 'stock', x: -8, y: -49 },
    { p: 'shBow', b: 'bow', x: 22, y: -55 },
    { p: 'shString', b: 'string', x: 21, y: -55 },
    { p: 'shWheel', b: 'wheel', x: 16, y: -10, px: 10, py: 10 },
    { p: 'shFlag', b: 'flag', x: -40, y: -60, px: 1, py: 22 },
  ] },
  wall: { shadow: 36, height: 70, parts: [
    { p: 'wlMound', x: -32, y: -12 },
    { p: 'wlPlank0', b: 'p0', x: -27, y: -68 },
    { p: 'wlPlank1', b: 'p1', x: -13.5, y: -62 },
    { p: 'wlPlank2', b: 'p2', x: 0, y: -68 },
    { p: 'wlPlank3', b: 'p3', x: 13.5, y: -62 },
    { p: 'wlBar', x: -29, y: -50 },
    { p: 'wlBar', x: -29, y: -28 },
    { p: 'wlRope', b: 'rope', x: -28, y: -40 },
  ] },
  farm: { shadow: 38, height: 60, parts: [
    { p: 'fmBed', x: -40, y: -18 },
    { p: 'fmStalk', b: 's0', x: -30, y: -6, px: 8, py: 40 }, { p: 'fmEar', b: 's0', x: -30, y: -6, px: 6, py: 58 },
    { p: 'fmStalk', b: 's1', x: -16, y: -10, px: 8, py: 40 }, { p: 'fmEar', b: 's1', x: -16, y: -10, px: 6, py: 58 },
    { p: 'fmStalk', b: 's2', x: -2, y: -6, px: 8, py: 40 }, { p: 'fmEar', b: 's2', x: -2, y: -6, px: 6, py: 58 },
    { p: 'fmStalk', b: 's3', x: 12, y: -10, px: 8, py: 40 }, { p: 'fmEar', b: 's3', x: 12, y: -10, px: 6, py: 58 },
    ...op(30, -6),
    { p: 'fmHat', b: 'opH', x: 17, y: -42 },
  ] },
  lobber: { shadow: 34, height: 74, parts: [
    { p: 'lbBase', x: -28, y: -14 },
    { p: 'lbPost', x: -5, y: -60 },
    { p: 'lbWeight', b: 'weight', x: 0, y: 0, px: 10, py: 2 },
    { p: 'lbArm', b: 'arm', x: 0, y: -56, px: 50, py: 3.5 },
    { p: 'lbPouch', b: 'pouch', x: 0, y: 0, px: 7, py: 1 },
    ...op(24, -12),
  ] },
  spikes: { shadow: 0, height: 10, parts: [
    { p: 'caltrop', b: 'c0', x: -30, y: -10 }, { p: 'caltrop', b: 'c1', x: -12, y: -4 }, { p: 'caltrop', b: 'c2', x: 6, y: -12 },
    { p: 'caltrop', b: 'c3', x: 18, y: -2 }, { p: 'caltrop', b: 'c4', x: -24, y: 4 },
  ] },
  pit: { shadow: 0, height: 20, parts: [
    { p: 'ptHole', x: -35, y: -14 },
    { p: 'ptCover', b: 'cover', x: -36, y: -15 },
    { p: 'ptSpade', b: 'spade', x: 22, y: -36, px: 5, py: 30 },
  ] },
  burner: { shadow: 30, height: 66, parts: [
    ...op(-26, -10),
    { p: 'brFrame', x: -18, y: -44 },
    { p: 'brPot', b: 'pot', x: -6, y: -64 },
    { p: 'brFuse', b: 'pot', x: 1, y: -73 },
    { p: 'flame', b: 'fuse', x: 2, y: -86, px: 8, py: 22, sx: 0.5, sy: 0.5 },
  ] },
  beam: { shadow: 30, height: 74, parts: [
    ...op(-26, -10),
    { p: 'bmStand', x: -12, y: -44 },
    { p: 'bmMirror', b: 'mirror', x: 3, y: -44, px: 16, py: 34 },
    { p: 'bmWheel', b: 'wheel', x: -2, y: -44, px: 7, py: 7 },
  ] },
  // ── machines (face left) ──
  // 礌石 (card icon / almanac; the falling stone itself is drawn by the stage)
  strike: { shadow: 30, height: 56, parts: [
    { p: 'stone', x: -40, y: -15, sx: 0.85, sy: 0.85 }, { p: 'boulder', x: -24, y: -50 }, { p: 'stone', x: 18, y: -16 }, { p: 'stone', x: 6, y: -9, sx: 0.6, sy: 0.6 },
  ] },
  walker: { shadow: 26, height: 70, parts: [
    { p: 'wkArm', b: 'armB', x: 6, y: -44, px: 3.5, py: 3 },
    { p: 'wkLeg', b: 'legB', x: 4, y: -20, px: 4, py: 1 },
    { p: 'wkBody', b: 'body', x: -13, y: -44 },
    { p: 'wkHead', b: 'head', x: -12, y: -66 },
    { p: 'wkCrest', b: 'head', x: -6, y: -73 },
    { p: 'wkLeg', b: 'legF', x: -10, y: -20, px: 4, py: 1 },
    { p: 'wkArm', b: 'armF', x: -10, y: -43, px: 3.5, py: 3 },
    { p: 'wkShieldS', b: 'armF', x: -16, y: -34 },
  ] },
  shielder: { shadow: 28, height: 72, parts: [
    { p: 'wkArm', b: 'armB', x: 6, y: -44, px: 3.5, py: 3 },
    { p: 'wkLeg', b: 'legB', x: 4, y: -20, px: 4, py: 1 },
    { p: 'wkBody', b: 'body', x: -13, y: -44 },
    { p: 'wkHead', b: 'head', x: -12, y: -66 },
    { p: 'wkCrest', b: 'head', x: -6, y: -73 },
    { p: 'wkLeg', b: 'legF', x: -10, y: -20, px: 4, py: 1 },
    { p: 'sdShield', b: 'shield', x: -26, y: -58 },
  ] },
  ram: { shadow: 40, height: 64, parts: [
    { p: 'rmWheel', b: 'wheelB', x: 22, y: -9, px: 9, py: 9 },
    ...op(26, -28, 'drv', true),
    { p: 'rmBody', b: 'body', x: -30, y: -32 },
    { p: 'rmLog', b: 'ram', x: -40, y: -27 },
    { p: 'rmHead', b: 'ram', x: -58, y: -34 },
    { p: 'rmRoof', b: 'roof', x: -34, y: -56 },
    { p: 'rmWheel', b: 'wheel', x: -18, y: -9, px: 9, py: 9 },
    { p: 'rmWheel', b: 'wheel', x: 16, y: -9, px: 9, py: 9 },
  ] },
  ant: { shadow: 9, height: 14, parts: [
    { p: 'anLegs', b: 'legs', x: -8, y: -7 },
    { p: 'anBody', b: 'body', x: -10, y: -14 },
  ] },
  brute: { shadow: 32, height: 100, parts: [
    { p: 'btArm', b: 'armB', x: 10, y: -64, px: 5.5, py: 4 },
    { p: 'btLeg', b: 'legB', x: 4, y: -24, px: 5.5, py: 1 },
    { p: 'btBody', b: 'body', x: -20, y: -60 },
    { p: 'btPaul', b: 'body', x: 8, y: -66 },
    { p: 'btHead', b: 'head', x: -14, y: -86 },
    { p: 'btPaul', b: 'body', x: -29, y: -66 },
    { p: 'btLeg', b: 'legF', x: -12, y: -24, px: 5.5, py: 1 },
    // the studded mace sits in the FRONT hand (its pivot = the grip); pose() moves it with that hand every frame
    { p: 'btMace', b: 'mace', x: -16, y: -42, px: 12, py: 44 },
    { p: 'btArm', b: 'armF', x: -16, y: -62, px: 5.5, py: 4 },
  ] },
  rhino: { shadow: 70, height: 96, parts: [
    { p: 'rhWheel', b: 'wheelB', x: 40, y: -13, px: 13, py: 13 },
    ...op(52, -50, 'drv', true),
    { p: 'rhBody', b: 'body', x: -60, y: -54 },
    { p: 'rhPlate', b: 'pl0', x: -38, y: -50, px: 17, py: 30 },
    { p: 'rhPlate', b: 'pl1', x: -10, y: -52, px: 17, py: 30 },
    { p: 'rhPlate', b: 'pl2', x: 18, y: -52, px: 17, py: 30 },
    { p: 'rhPlate', b: 'pl3', x: 44, y: -50, px: 17, py: 30 },
    { p: 'rhHead', b: 'head', x: -96, y: -60 },
    { p: 'rhWheel', b: 'wheel', x: -40, y: -13, px: 13, py: 13 },
    { p: 'rhWheel', b: 'wheel', x: 0, y: -13, px: 13, py: 13 },
  ] },
};

Object.assign(RIGS, RIGS2); // volume 2 (bank · radial · gust · hook · flyer · smoker · ladder · drummer · 铜盾 · owl)
const S = Math.sin;
/** pose for a kind; `out` is reused */
export function poseOf(kind: string, st: PoseState, out: Pose): Pose {
  for (const k in out) delete out[k];
  const t = st.t;
  const breathe = 1 + S(t * 3.9) * 0.012;
  switch (kind) {
    case 'shooter': {
      const k = st.atk > 0 ? S(Math.min(1, st.atk) * Math.PI) : 0;
      out.root = { x: -3 * k, r: -0.04 * k, s: breathe };
      out.string = { x: -4 * k }; out.bow = { r: 0 };
      out.flag = { r: S(t * 2.6) * 0.12 };
      out.wheel = { r: -k * 0.3 };
      out.opH = { y: S(t * 1.7) * 0.6 }; out.opA = { r: k * 0.5 };
      break;
    }
    case 'wall': out.root = { s: 1 + S(t * 2.2) * 0.004 }; out.rope = { hide: st.extra <= 0 }; for (let i = 0; i < 4; i++) out['p' + i] = { y: st.hurt > 0 ? S(t * 60 + i) * 0.8 : 0 }; break;
    case 'farm': {
      const k = st.atk > 0 ? S(Math.min(1, st.atk) * Math.PI) : 0;
      for (let i = 0; i < 4; i++) out['s' + i] = { r: S(t * 2.3 + i * 0.9) * 0.07 + k * 0.25 * (i % 2 ? 1 : -1) + (st.mode ? 0.35 : 0) };
      out.opH = { y: S(t * 1.6) * 0.7 }; out.root = {};
      break;
    }
    case 'lobber': {
      // arm: rest −0.5 rad (long end down at the back) → throw +1.25 → settle
      const a = st.atk; const th = a <= 0 ? -0.5 : a < 0.35 ? -0.5 - 0.25 * (a / 0.35) : a < 0.55 ? -0.75 + 2.0 * ((a - 0.35) / 0.2) : 1.25 - 1.75 * Math.min(1, (a - 0.55) / 0.45);
      out.arm = { r: th };
      const ax = 0, ay = -56; // pivot
      out.weight = { x: ax + Math.cos(th) * 28, y: ay + Math.sin(th) * 28 };
      out.pouch = { x: ax - Math.cos(th) * 50, y: ay - Math.sin(th) * 50 + 2, hide: a > 0.5 && a < 0.8 };
      out.opH = { y: S(t * 1.7) * 0.6 }; out.root = { s: breathe };
      break;
    }
    case 'spikes': for (let i = 0; i < 5; i++) out['c' + i] = { hide: i >= st.extra, y: st.atk > 0 ? -S(Math.min(1, st.atk) * Math.PI) * 4 : 0 }; break;
    case 'pit': out.cover = { hide: st.mode === 0 }; out.spade = { hide: st.mode !== 0, r: S(t * 7) * 0.5 }; break;
    case 'burner': { const k = st.atk > 0 ? Math.min(1, st.atk) : 0; out.pot = { hide: k > 0.15 && k < 0.85 }; out.fuse = { hide: k > 0.15 && k < 0.85, s: 1 + S(t * 18) * 0.15 }; out.opH = { y: S(t * 1.7) * 0.6 }; out.root = { s: breathe }; break; }
    case 'beam': out.mirror = { r: S(t * 0.8) * 0.05 }; out.wheel = { r: t * 0.6 }; out.opH = { y: S(t * 1.7) * 0.6 }; out.root = { s: breathe }; break;
    case 'walker': case 'shielder': case 'shielder_m': {
      const ph = st.walk * 0.11; const sw = S(ph);
      const bite = st.atk > 0 ? S(Math.min(1, st.atk) * Math.PI) : 0;
      out.legF = { r: sw * 0.5 }; out.legB = { r: -sw * 0.5 };
      out.armF = { r: -sw * 0.45 - bite * 1.3 }; out.armB = { r: sw * 0.45 - bite * 0.9 };
      out.body = { y: -Math.abs(S(ph)) * 1.6 }; out.head = { y: -Math.abs(S(ph)) * 1.6 + S(t * 2.1) * 0.5 };
      out.shield = { y: -Math.abs(S(ph)) * 1.4 - bite * 2, x: -bite * 3, hide: st.extra <= 0 };
      out.root = { x: -bite * 2 };
      break;
    }
    case 'ram': {
      const wr = -st.walk / 9; out.wheel = { r: wr }; out.wheelB = { r: wr };
      const pull = st.atk > 0 ? (st.atk < 0.7 ? (st.atk / 0.7) * 12 : 12 - ((st.atk - 0.7) / 0.3) * 18) : 0;
      out.ram = { x: pull }; out.roof = { y: S(st.walk * 0.4) * 1.2 * Math.min(1, st.extra) };
      out.body = { y: S(st.walk * 0.4 + 1) * 0.8 * Math.min(1, st.extra) };
      out.drvH = { y: S(t * 3) * 0.6 }; out.root = {};
      break;
    }
    case 'ant': { const ph = st.walk * 0.35; out.legs = { y: S(ph) * 1.2, x: S(ph + 1) * 0.8 }; out.body = { y: -Math.abs(S(ph)) * 1.2 }; out.root = {}; break; }
    case 'brute': {
      const ph = st.walk * 0.08; const sw = S(ph); const bite = st.atk > 0 ? S(Math.min(1, st.atk) * Math.PI) : 0;
      out.legF = { r: sw * 0.35 }; out.legB = { r: -sw * 0.35 };
      // front arm holds the mace raised overhead; a bite brings arm + mace down in front (the arm hangs from the
      // shoulder at (-16,-62); a 20-unit forearm → the grip is at shoulder + 20·(-sin r, cos r), rest grip (-16,-42))
      const rF = Math.PI - 0.25 + sw * 0.12 - bite * 1.75; const gx = -20 * Math.sin(rF), gy = 20 * Math.cos(rF) - 20;
      out.armF = { r: rF }; out.armB = { r: sw * 0.3 - bite * 0.4 };
      out.body = { y: -Math.abs(sw) * 2 }; out.head = { y: -Math.abs(sw) * 2 }; out.root = {};
      out.mace = { x: gx, y: gy, r: 0.22 + sw * 0.06 - bite * 2.3 };
      break;
    }
    case 'rhino': {
      const wr = -st.walk / 13; out.wheel = { r: wr }; out.wheelB = { r: wr };
      const shell = st.mode === 2 ? 1 : 0; // plates close down over the body in phase 2
      const shut = st.extra; // 0..1 closing progress
      for (let i = 0; i < 4; i++) out['pl' + i] = { r: (i < 2 ? -1 : 1) * (0.35 - 0.35 * shut) + (shell ? 0 : S(t * 2 + i) * 0.02), y: shut * 10, hide: st.mode === 3 };
      const stomp = st.atk > 0 ? S(st.atk * Math.PI * 3) * 3 : 0;
      out.head = { y: stomp, x: st.mode === 3 ? 0 : 0 }; out.body = { y: S(st.walk * 0.3) * 0.8 };
      out.drvH = { y: S(t * 3) * 0.6 }; out.root = {};
      break;
    }
    default: if (!pose2(kind, st, out)) out.root = {};
  }
  return out;
}
