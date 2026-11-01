/**
 * The ONE layout function of the mission screen (spec §2.2): computeLayout(viewport, safe insets, kind) → every region rectangle.
 * Pure and Node-testable; all CSS grid numbers are generated from its output (`layoutVars`), never written a second time.
 * kit .kit-back is a fixed 56×56 at (max(12, safe-left), max(12, safe-top)); regions never overlap and never leave the usable rect.
 */
export const KIT_BACK = 56;
export interface Rect { x: number; y: number; w: number; h: number }
export type ViewClass = 'ipad-p' | 'ipad-l' | 'phone-p' | 'phone-l';
export interface Viewport { w: number; h: number; cls: ViewClass }
export interface Insets { t: number; r: number; b: number; l: number }
/** 'keypad' (int/int2/compare2/multi/read…) keeps the 3×4 / 4×3 keys; 'folded' (place/build/order/open/steps) leaves a readout + ✓ row. */
export type LayoutKind = 'keypad' | 'folded';
export type RegionName = 'kitBack' | 'mapBtn' | 'hintBtn' | 'replayBtn' | 'order' | 'comm' | 'stage' | 'answer' | 'keypad' | 'tools' | 'okBtn';
export interface Layout { reg: Partial<Record<RegionName, Rect>> & { kitBack: Rect; stage: Rect; order: Rect; comm: Rect; answer: Rect }; usable: Rect }

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const right = (r: Rect) => r.x + r.w; const bottom = (r: Rect) => r.y + r.h;

export function classOf(w: number, h: number): ViewClass {
  const short = Math.min(w, h);
  if (short < 600) return w > h ? 'phone-l' : 'phone-p';
  return w > h ? 'ipad-l' : 'ipad-p';
}
export const vpOf = (w: number, h: number): Viewport => ({ w, h, cls: classOf(w, h) });

export function computeLayout(vp: Viewport, ins: Insets, kind: LayoutKind): Layout {
  const { w: W, h: H, cls } = vp; const reg: Record<string, Rect> = {};
  const phone = cls.startsWith('phone'); const se = cls === 'phone-p' && W <= 320;
  const M = phone ? (se ? 12 : 16) : 16;
  const xL = Math.max(M, ins.l), xR = W - Math.max(M, ins.r), yT = Math.max(12, ins.t), yB = H - Math.max(8, ins.b);
  const BTN = phone ? 44 : 56;
  reg.kitBack = R(xL, yT, KIT_BACK, KIT_BACK);
  if (cls === 'phone-l') {
    const railX = xL; reg.mapBtn = R(railX + 6, yT + KIT_BACK + 6, BTN, BTN);
    reg.hintBtn = R(railX + 6, bottom(reg.mapBtn) + 6, BTN, BTN); reg.replayBtn = R(railX + 6, bottom(reg.hintBtn) + 6, BTN, BTN);
    const cx0 = xL + KIT_BACK + 8, cw = xR - cx0, RW = kind === 'keypad' ? 286 : 150, gap = 12, LW = cw - RW - gap;
    reg.order = R(cx0, yT, LW, 48); reg.comm = R(cx0, bottom(reg.order) + 4, LW, 30);
    reg.stage = R(cx0, bottom(reg.comm) + 4, LW, yB - (bottom(reg.comm) + 4));
    const rx = cx0 + LW + gap; reg.answer = R(rx, yT, RW, kind === 'keypad' ? 52 : 56);
    if (kind === 'keypad') { reg.keypad = R(rx, bottom(reg.answer) + 8, RW, 200); reg.tools = R(rx, bottom(reg.keypad) + 8, RW, 44); }
    else { reg.tools = R(rx, bottom(reg.answer) + 8, RW, 44); reg.okBtn = R(rx, bottom(reg.tools) + 8, RW, 56); }
  } else if (cls === 'ipad-l') {
    const barH = 56; reg.mapBtn = R(right(reg.kitBack) + 8, yT, BTN, BTN); reg.hintBtn = R(xR - 2 * BTN - 8, yT, BTN, BTN); reg.replayBtn = R(xR - BTN, yT, BTN, BTN);
    const top = yT + barH + 8, RW = 392, LW = (xR - xL) - RW - 24, rx = xL + LW + 24;
    reg.order = R(xL, top, LW, 120); reg.tools = R(xL, yB - 72, LW, 72); reg.stage = R(xL, bottom(reg.order) + 8, LW, reg.tools.y - 8 - (bottom(reg.order) + 8));
    reg.comm = R(rx, top, RW, 96); reg.answer = R(rx, bottom(reg.comm) + 8, RW, kind === 'keypad' ? 96 : 110);
    if (kind === 'keypad') reg.keypad = R(rx, bottom(reg.answer) + 8, RW, 436); else reg.okBtn = R(rx, bottom(reg.answer) + 8, RW, 88);
  } else {
    const barH = KIT_BACK; reg.mapBtn = R(right(reg.kitBack) + 8, yT + (barH - BTN) / 2, BTN, BTN);
    reg.hintBtn = R(xR - 2 * BTN - 8, yT + (barH - BTN) / 2, BTN, BTN); reg.replayBtn = R(xR - BTN, yT + (barH - BTN) / 2, BTN, BTN);
    const g = phone ? 4 : 8, ow = xR - xL; let y = yT + barH + g;
    const orderH = phone ? (se ? 48 : 56) : 104, commH = phone ? (se ? 28 : 32) : 64;
    reg.order = R(xL, y, ow, orderH); y = bottom(reg.order) + g; reg.comm = R(xL, y, ow, commH); y = bottom(reg.comm) + g;
    const stageTop = y; let by = yB;
    if (kind === 'keypad') {
      const kh = phone ? (se ? 150 : 156) : 348; const kw = phone ? Math.min(ow, se ? 290 : 354) : 512;
      reg.keypad = R(phone ? xL + (ow - kw) / 2 : xR - 512, by - kh, kw, kh); by = reg.keypad.y - g;
      if (phone) { reg.answer = R(xL, by - 48, 160, 48); reg.tools = R(xR - 2 * 44 - 8, by - 48 + 2, 2 * 44 + 8, 44); by = reg.answer.y - g; }
      else { reg.answer = R(xL, reg.keypad.y, 250, 110); reg.tools = R(xL, reg.keypad.y - g - 56, ow, 56); by = reg.tools.y - g; }
    } else {
      const rh = phone ? 56 : 110, tw = 2 * BTN + 6, okw = phone ? 96 : 200, aw = phone ? ow - tw - okw - 16 : 250;
      reg.answer = R(xL, by - rh, aw, rh); reg.tools = R(xL + aw + 8, by - rh + (rh - BTN) / 2, tw, BTN); reg.okBtn = R(xR - okw, by - rh, okw, rh); by = reg.answer.y - g;
    }
    reg.stage = R(xL, stageTop, ow, by - stageTop);
  }
  return { reg: reg as Layout['reg'], usable: R(xL, yT, xR - xL, yB - yT) };
}

/** Smallest stage height each class needs; a folded phone stage needs 246 px (magnifier 190 clear above the finger + 56 for the track). */
export function minStageOf(vp: Viewport, kind: LayoutKind): number {
  const phone = vp.cls.startsWith('phone');
  return kind === 'folded' ? (phone ? 246 : 360) : (vp.cls === 'phone-p' ? (vp.w <= 320 ? 190 : 230) : vp.cls === 'phone-l' ? 262 : 360);
}
export const slackOf = (L: Layout, vp: Viewport, kind: LayoutKind): number => Math.round(L.reg.stage.h - minStageOf(vp, kind));
/** Key geometry (px) the keypad uses inside its rectangle (null for a folded layout). */
export function keyGeometry(L: Layout, vp: Viewport): { cols: number; rows: number; gap: number; w: number; h: number } | null {
  const kp = L.reg.keypad; if (!kp) return null;
  const cols = vp.cls === 'phone-p' ? 4 : 3, rows = vp.cls === 'phone-p' ? 3 : 4, gap = vp.cls === 'phone-p' ? 6 : vp.cls === 'phone-l' ? 8 : 12;
  return { cols, rows, gap, w: Math.floor((kp.w - gap * (cols - 1)) / cols), h: Math.floor((kp.h - gap * (rows - 1)) / rows) };
}
const inter = (a: Rect, b: Rect) => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
/** Every geometric rule of §2.2 / V10 (a): returns the violations (empty = fine). */
export function checkLayout(L: Layout, vp: Viewport, kind: LayoutKind): string[] {
  const errs: string[] = []; const names = Object.keys(L.reg) as RegionName[];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (inter(L.reg[names[i]]!, L.reg[names[j]]!)) errs.push(`overlap ${names[i]}×${names[j]}`);
  for (const n of names) { const r = L.reg[n]!; if (r.x < -0.01 || r.y < -0.01 || right(r) > vp.w + 0.01 || bottom(r) > vp.h + 0.01) errs.push(`${n} outside viewport`); }
  const phone = vp.cls.startsWith('phone'), minTap = phone ? 44 : 56;
  for (const n of ['mapBtn', 'hintBtn', 'replayBtn', 'okBtn'] as RegionName[]) { const r = L.reg[n]; if (r && (r.w < minTap || r.h < minTap)) errs.push(`${n} < ${minTap}`); }
  if (L.reg.kitBack.w < 56) errs.push('kit back < 56');
  const minStage = minStageOf(vp, kind);
  if (L.reg.stage.h < minStage) errs.push(`stage ${L.reg.stage.h} < ${minStage}`);
  if (slackOf(L, vp, kind) < 8) errs.push(`stage slack ${slackOf(L, vp, kind)} < 8`);
  const k = keyGeometry(L, vp);
  if (k && (k.h < (phone ? 44 : 72) || k.w < (phone ? 44 : 72))) errs.push(`key ${k.w}×${k.h} too small`);
  return errs;
}
/** CSS custom properties (`--mb-*`) for the mission screen: every region as left/top/width/height + key geometry. */
export function layoutVars(L: Layout, vp: Viewport): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [n, r] of Object.entries(L.reg) as [string, Rect][]) { v[`--mb-${n}-x`] = `${r.x}px`; v[`--mb-${n}-y`] = `${r.y}px`; v[`--mb-${n}-w`] = `${r.w}px`; v[`--mb-${n}-h`] = `${r.h}px`; }
  const k = keyGeometry(L, vp);
  if (k) { v['--mb-cols'] = String(k.cols); v['--mb-gap'] = `${k.gap}px`; v['--mb-kw'] = `${k.w}px`; v['--mb-kh'] = `${k.h}px`; }
  v['--mb-xl'] = `${L.reg.kitBack.x}px`; v['--mb-yt'] = `${L.reg.kitBack.y}px`;
  return v;
}
/** The six acceptance viewports + the injected real-device insets of V10. */
export const ACCEPTANCE: { name: string; vp: Viewport; ins: Insets[] }[] = [
  { name: 'iPad portrait 810×1080', vp: vpOf(810, 1080), ins: [{ t: 0, r: 0, b: 0, l: 0 }, { t: 24, r: 0, b: 20, l: 0 }] },
  { name: 'iPad landscape 1080×810', vp: vpOf(1080, 810), ins: [{ t: 0, r: 0, b: 0, l: 0 }, { t: 24, r: 0, b: 20, l: 0 }] },
  { name: 'iPhone 13 portrait 390×664', vp: vpOf(390, 664), ins: [{ t: 0, r: 0, b: 0, l: 0 }] },
  { name: 'iPhone 13 PWA portrait 390×844', vp: vpOf(390, 844), ins: [{ t: 47, r: 0, b: 34, l: 0 }] },
  { name: 'iPhone SE 320×568', vp: vpOf(320, 568), ins: [{ t: 0, r: 0, b: 0, l: 0 }] },
  { name: 'iPhone 13 landscape 844×390', vp: vpOf(844, 390), ins: [{ t: 0, r: 0, b: 0, l: 0 }, { t: 0, r: 47, b: 21, l: 47 }] },
];
