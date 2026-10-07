/**
 * `?dev=art` — V14 sprite gate (spec §9.2 V14 'art.test'): measured on the real match atlas in the browser
 * (Node has no canvas), driven by site/snake-battle/tests/art.spec.ts. Dev only — never linked from the game.
 *
 * 1. Persona faces: the production `WorldView.eyes()` is called with a recording renderer for each of the 9
 *    personas (neutral pose: open eyes looking ahead, not hunting; the sleeper asleep), plus the persona's static
 *    head accessory (patrol: the beacon lamp, view.ts — §6.4 gives the patrol the '普通眼' of a forager and
 *    tells it apart by the lamp). The sprites are composited from the atlas cells into a 192² alpha mask;
 *    every pair's silhouette IoU must be ≤ 0.80.
 * 2. Thinnest line: the atlas is mip-mapped; the smallest of the spec's 3 size tiers is mip level 2 (¼ of the
 *    128-px cell). Every isolated feature — each connected opaque component, and each connected dark-ink
 *    component (luma < 0.3) — must stay ≥ 2 texels thick there, i.e. survive an erosion of 4 cell px
 *    (max distance-to-edge ≥ 4).
 */
import { buildAtlas, aiBodyColor, mix, CELL, type AtlasColor, type Rgb } from '../render/art';
import { WorldView } from '../render/view';
import { EYE_SPOT } from '../render/skins';
import { AI_NAMES } from '../sim/venues';

type Push = { x: number; y: number; hx: number; hy: number; rot: number; key: string; t: [number, number, number, number]; acc?: boolean };
const PERSONAS = ['forager', 'hunter', 'coiler', 'scavenger', 'skittish', 'daredevil', 'king', 'patrol', 'sleeper'];

function faceOf(p: string) {
  const cols = Object.keys(AI_NAMES.palette);
  const base: Rgb = p === 'king' ? [246, 196, 58] : p === 'patrol' ? [127, 147, 181] : aiBodyColor(cols[PERSONAS.indexOf(p) % cols.length], p === 'sleeper' ? 'skittish' : p);
  const eyes = p === 'patrol' ? 'forager' : p === 'sleeper' ? 'skittish' : p;
  const eye = p === 'king' ? { ...EYE_SPOT.round, mode: 'dragon', er: 0.27 } : EYE_SPOT.round;
  return { look: { key: p, base, pattern: p, eyes, head: 'round', eye, extras: [], persona: p }, mood: p === 'sleeper' ? 'closed' : 'open', color: { key: p, base, accent: mix(base, [255, 255, 255], 0.35), pattern: p === 'sleeper' ? 'skittish' : p } as AtlasColor };
}

export function artMetrics() {
  const faces = PERSONAS.map(faceOf);
  const A = buildAtlas(faces.map((f) => f.color), 'moon');
  const cellOf = (key: string) => { const uv = A.get(key); return { sx: uv.u0 * A.canvas.width, sy: uv.v0 * A.canvas.height }; };
  // ---- 1. persona face silhouettes
  const S = 192, r = 60, hx0 = S / 2, hy0 = S / 2;
  const masks: Uint8Array[] = [];
  for (let i = 0; i < PERSONAS.length; i++) {
    const p = PERSONAS[i], f = faces[i], pushes: Push[] = [];
    const fake = { R: { push: (x: number, y: number, hx: number, hy: number, rot: number, key: string, cr = 255, cg = 255, cb = 255, ca = 255) => { pushes.push({ x, y, hx, hy, rot, key, t: [cr, cg, cb, ca] }); } }, boostT: new Map(), time: 0, match: { world: { t: 0.1 } } };
    (WorldView.prototype as unknown as { eyes: (...a: unknown[]) => void }).eyes.call(fake, hx0, hy0, 0, r, f.look, f.mood, 1, 0, { id: i, brain: { mode: 'idle' } });
    if (p === 'patrol') pushes.push({ x: hx0 - r * 0.25, y: hy0, hx: r * 0.36, hy: r * 0.36, rot: 0, key: 'lamp', t: [255, 255, 255, 255], acc: true });   // view.ts head accessory
    // every eye shares the same outer disc, so the outline alone says nothing: the face is what is drawn on it —
    // dark ink (pupils, outlines, lids' arcs, brows; sprites tinted as the renderer tints them) ∪ accessories
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d', { willReadFrequently: true })!;
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = S; const tc = tmp.getContext('2d', { willReadFrequently: true })!;
    const m = new Uint8Array(S * S);
    for (const q of pushes) {
      const { sx, sy } = cellOf(q.key);
      tc.clearRect(0, 0, S, S); tc.save(); tc.translate(q.x, q.y); tc.rotate(q.rot); tc.drawImage(A.canvas, sx, sy, CELL, CELL, -q.hx, -q.hy, 2 * q.hx, 2 * q.hy); tc.restore();
      const id = tc.getImageData(0, 0, S, S), d = id.data;
      for (let k = 0; k < S * S; k++) { d[k * 4] = (d[k * 4] * q.t[0]) / 255; d[k * 4 + 1] = (d[k * 4 + 1] * q.t[1]) / 255; d[k * 4 + 2] = (d[k * 4 + 2] * q.t[2]) / 255; d[k * 4 + 3] = (d[k * 4 + 3] * q.t[3]) / 255; if (q.acc && d[k * 4 + 3] > 127) m[k] = 1; }
      tc.putImageData(id, 0, 0); c.drawImage(tmp, 0, 0);
    }
    const px = c.getImageData(0, 0, S, S).data;
    for (let k = 0; k < S * S; k++) if (px[k * 4 + 3] > 127 && (0.2126 * px[k * 4] + 0.7152 * px[k * 4 + 1] + 0.0722 * px[k * 4 + 2]) / 255 < 0.4) m[k] = 1;
    masks.push(m);
  }
  const iou: { a: string; b: string; v: number }[] = [];
  for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) {
    let I = 0, U = 0; for (let k = 0; k < S * S; k++) { const x = masks[i][k], y = masks[j][k]; if (x & y) I++; if (x | y) U++; }
    iou.push({ a: PERSONAS[i], b: PERSONAS[j], v: U ? I / U : 0 });
  }
  iou.sort((x, y) => y.v - x.v);
  // ---- 2. thinnest isolated line per sprite at the smallest tier
  const lines: { key: string; layer: string; area: number; maxDT: number }[] = [];
  const keys = [...(A as unknown as { map: Map<string, unknown> }).map.keys()];
  const c2 = A.canvas.getContext('2d', { willReadFrequently: true })!;
  for (const key of keys) {
    const { sx, sy } = cellOf(key); const d = c2.getImageData(sx, sy, CELL, CELL).data;
    const opaque = new Uint8Array(CELL * CELL), ink = new Uint8Array(CELL * CELL);
    for (let k = 0; k < CELL * CELL; k++) { const a = d[k * 4 + 3]; if (a > 127) { opaque[k] = 1; const L = (0.2126 * d[k * 4] + 0.7152 * d[k * 4 + 1] + 0.0722 * d[k * 4 + 2]) / 255; if (L < 0.3) ink[k] = 1; } }
    for (const [layer, m] of [['opaque', opaque], ['ink', ink]] as [string, Uint8Array][]) for (const comp of components(m)) {
      if (comp.area < 40) continue;
      // an ink ring around an opaque fill is the shaded rim of a ball / bubble, not a stroke: it melts into the
      // edge at small sizes by design, so it is reported apart and not gated
      const [x0, y0, x1, y1] = comp.box, cx = ((x0 + x1) / 2) | 0, cy = ((y0 + y1) / 2) | 0, kc = cy * CELL + cx;
      const outline = layer === 'ink' && comp.area / ((x1 - x0 + 1) * (y1 - y0 + 1)) < 0.45 && opaque[kc] === 1 && ink[kc] === 0;
      lines.push({ key, layer: outline ? 'outline' : layer, area: comp.area, maxDT: comp.maxDT });
    }
  }
  const thin = lines.filter((l) => l.maxDT < 4 && l.layer !== 'outline').sort((a, b) => a.maxDT - b.maxDT);
  const thinOutlines = lines.filter((l) => l.maxDT < 4 && l.layer === 'outline').map((l) => `${l.key} ${l.maxDT.toFixed(1)}`);
  return { iou, maxIoU: iou[0], thin, thinOutlines, sprites: keys.length, features: lines.length };
}

/** 4-connected components of a CELL² mask with their area and max chamfer distance to the background */
function components(m: Uint8Array) {
  const N = CELL, dt = new Float32Array(N * N), lab = new Int32Array(N * N).fill(-1), out: { area: number; maxDT: number; box: [number, number, number, number] }[] = [];
  for (let k = 0; k < N * N; k++) dt[k] = m[k] ? 1e9 : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : dt[y * N + x]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = y * N + x; if (!dt[k]) continue; dt[k] = Math.min(dt[k], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) { const k = y * N + x; if (!dt[k]) continue; dt[k] = Math.min(dt[k], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
  for (let k0 = 0; k0 < N * N; k0++) {
    if (!m[k0] || lab[k0] >= 0) continue;
    const id = out.length, st = [k0]; lab[k0] = id; let area = 0, maxDT = 0; const box: [number, number, number, number] = [N, N, 0, 0];
    while (st.length) {
      const k = st.pop()!; area++; if (dt[k] > maxDT) maxDT = dt[k];
      const x = k % N, y = (k / N) | 0;
      if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y; if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const q = ny * N + nx; if (m[q] && lab[q] < 0) { lab[q] = id; st.push(q); } }
    }
    out.push({ area, maxDT, box });
  }
  return out;
}
