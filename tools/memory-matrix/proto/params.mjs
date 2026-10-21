// SINGLE SOURCE OF TRUTH for the 星图记忆站 difficulty tables (spec §5), v1.1 revision (D1-D15, mirror-only s4).
// Sectors: s1 星座复刻(记星星)  s2 流星轨迹(追流星)  s3 星球住户(送回家)  s4 镜子(照镜子).
// Wings: s1/s3 = ONE serial ladder D1..D15. s2/s4 = two wings: wing 1 D1..D10, wing 2 D11..D15 (relative 1..5), each restarts easy.
export const GATES = [5, 10, 15];
export const SECTOR_IDS = ['s1', 's2', 's3', 's4'];
export const WINGS = { s1: 'serial', s2: 'parallel', s3: 'serial', s4: 'parallel' };
export const NDIFF = 15;
export const TRACKS = {
  s1: [{ len: 15, offset: 0, gates: [5, 10, 15] }],
  s3: [{ len: 15, offset: 0, gates: [5, 10, 15] }],
  s2: [{ len: 10, offset: 0, gates: [5, 10] }, { len: 5, offset: 10, gates: [5] }],
  s4: [{ len: 10, offset: 0, gates: [5, 10] }, { len: 5, offset: 10, gates: [5] }],
};
export const START_L = { s1: 3, s2: 2, s3: 2, s4: 2 };      // first-ever round of a sector (spec 2.3): not the trivial D1
export const PLACEMENT = [3, 3, 3, 2, 2, 2, 2, 2];          // staircase step for the first 8 rounds of a track (a pass jumps this many levels)
export const PREVIEW_MIN_MS = 2000;                         // hard floor for any stimulus display
export const SLIPS = (budget) => budget + 1;                // 小星灯 shown = budget + 1 (round-local; no cumulative lives)

const t = (rows, f) => rows.map((r, i) => ({ D: i + 1, gate: GATES.includes(i + 1), ...f(r) }));

// s1: grid g, lit n, 8-connected clusters k. preview = 3000 + 300 * max(0, n-5). No fog in v1 (delayMs kept = 0 for v2).
export const s1Preview = (n) => 3000 + 300 * Math.max(0, n - 5);
export const S1 = t([
  [4, 3, 1], [4, 4, 1], [4, 4, 2], [4, 5, 2], [4, 5, 3],
  [5, 5, 2], [5, 6, 2], [5, 6, 3], [5, 7, 3], [5, 7, 4],
  [5, 7, 5], [6, 7, 4], [6, 7, 5], [6, 8, 5], [6, 8, 6],
], ([g, n, k]) => ({ g, n, k, delayMs: 0, previewMs: s1Preview(n), budget: 1, tags: [] }));
export const S1_NEW = ['看一眼记住 3 颗', '4 颗连成一块', '分成两组', '5 颗', '三组（只加组数）', '更大的窗 5×5', '6 颗', '6 颗三组', '7 颗', '四组', '五组', '最大的窗 6×6', '6×6 五组', '8 颗', '六组（只加组数）'];

// s2: sky stars m, sequence length L, direction F|B (what the child must tap: B = reverse of the shown order), route class c.
// c0 near hops, no crossing (only L<=3); c1 tangle in [0.5,1.5]; c2 tangle >= 1.5 (needs L >= 5). meteor: 700 ms lit + 300 ms gap per star.
export const S2 = t([
  [2, 'F', 0, 6], [3, 'F', 0, 6], [3, 'F', 1, 6], [3, 'F', 1, 7], [4, 'F', 1, 7],
  [4, 'F', 1, 8], [5, 'F', 1, 8], [6, 'F', 1, 8], [5, 'F', 2, 8], [5, 'F', 2, 9],
  [2, 'B', 0, 6], [3, 'B', 0, 6], [3, 'B', 1, 6], [3, 'B', 1, 7], [4, 'B', 1, 7],
], ([L, dir, c, m]) => ({ L, dir, c, m, delayMs: 0, litMs: 700, gapMs: 300, budget: 1, tags: [dir] }));
export const S2_NEW = ['2 颗', '3 颗', '路线拐弯', '夜空多 1 颗星', '4 颗', '夜空再多 1 颗', '5 颗', '6 颗', '路线交叉', '夜空 9 颗星', '倒着追（新规则）', '倒着 3 颗', '倒着+拐弯', '夜空多 1 颗星', '倒着 4 颗'];

// s3: houses rows x cols, residents n, twin pairs, near lures (mix-and-match visitors), far lures (share nothing). show = min(10000, 1500 + 1500 n)
// budget (free slips): n = 3 -> 0 (a wrong placement ends the round gently), else 1 (D1 keeps its slack so the floor level is forgiving).
export const s3Show = (n) => Math.min(10000, 1500 + 1500 * n);
export const S3 = t([
  [2, 2, 2, 0, 0, 0], [2, 2, 3, 0, 0, 0], [2, 3, 3, 0, 0, 1], [2, 3, 3, 0, 1, 0], [2, 3, 4, 0, 0, 1],
  [2, 3, 4, 0, 1, 0], [3, 3, 4, 0, 1, 0], [3, 3, 4, 0, 2, 0], [3, 3, 5, 0, 1, 0], [3, 3, 5, 0, 2, 0],
  [3, 3, 5, 1, 2, 0], [3, 4, 5, 1, 2, 0], [3, 4, 6, 0, 2, 0], [3, 4, 6, 1, 2, 0], [3, 4, 6, 2, 2, 0],
], ([rows, cols, n, twins, near, far]) => ({ rows, cols, n, twins, near, far, delayMs: 0, showMs: s3Show(n), budget: n === 3 ? 0 : 1, tags: [...(near ? ['near'] : []), ...(far ? ['far'] : [])] }));
export const S3_NEW = ['2 位住户', '3 位', '陌生访客', '混搭访客', '4 位', '4 位+混搭', '更多房子 3×3', '2 个混搭', '5 位', '5 位+2 混搭', '双胞胎', '3×4 房子', '6 位', '6 位+双胞胎', '2 对双胞胎'];

// s4 (mirror-only in v1): ONE board g x g with a mirror strip through the middle. The source stars sit in one half (left|right for LR, top|bottom
// for UD; the side is random), the child taps the mirrored cells in the other half. mode vis = source half stays; peek = shown then hidden.
export const s4Preview = (n) => 3000 + 300 * Math.max(0, n - 4);
export const S4 = t([
  [4, 2, ['LR'], 'vis'], [4, 3, ['LR'], 'vis'], [4, 3, ['UD'], 'vis'], [4, 3, ['LR', 'UD'], 'vis'], [4, 4, ['LR', 'UD'], 'vis'],
  [6, 3, ['LR'], 'vis'], [6, 4, ['UD'], 'vis'], [6, 4, ['LR', 'UD'], 'vis'], [6, 5, ['LR', 'UD'], 'vis'], [6, 6, ['LR', 'UD'], 'vis'],
  [4, 2, ['LR'], 'peek'], [4, 3, ['LR'], 'peek'], [4, 3, ['LR', 'UD'], 'peek'], [6, 4, ['LR'], 'peek'], [6, 5, ['LR', 'UD'], 'peek'],
], ([g, n, axes, mode]) => ({ g, n, axes, mode, delayMs: 0, kLo: 1, kHi: n >= 5 ? 3 : 2, previewMs: mode === 'vis' ? 0 : s4Preview(n), budget: 1, tags: axes }));
export const S4_NEW = ['左右镜像', '3 颗', '上下镜像', '两种镜子', '4 颗', '更大的窗 6×6', '6×6 上下', '6×6 两种', '5 颗', '6 颗', '记着照（原图会躲）', '记着 3 颗', '记着+两种', '记着 6×6', '记着 6×6 5 颗'];

// STRETCH (not in v1; ships only after the dad probe, spec 5.5): rotation about a MARKED PIVOT. 5x5 boards, pivot = centre cell (index 12), always empty.
export const PIVOT = 12;
export const STRETCH = [
  [5, 3, ['CW'], 'vis'], [5, 3, ['CCW'], 'vis'], [5, 4, ['CW', 'CCW'], 'vis'], [5, 4, ['R180'], 'vis'], [5, 4, ['CW', 'CCW', 'R180'], 'vis'],
].map(([g, n, ops, mode], i) => ({ D: i + 1, gate: i === 4, g, n, ops, mode, kLo: 1, kHi: 2, delayMs: 0, previewMs: 0, budget: 1, tags: ops }));

export const TABLE = { s1: S1, s2: S2, s3: S3, s4: S4 };
export const NEWCOL = { s1: S1_NEW, s2: S2_NEW, s3: S3_NEW, s4: S4_NEW };
for (const s of SECTOR_IDS) if (TABLE[s].length !== NDIFF) throw new Error(`${s}: ${TABLE[s].length} rows, expected ${NDIFF}`);
export const trackIdx = (sector, D) => { const tr = TRACKS[sector]; return D > tr[0].len && tr.length > 1 ? 1 : 0; };
export const track = trackIdx;
export const rel = (sector, D) => D - TRACKS[sector][trackIdx(sector, D)].offset;

// ---- DEMAND: effective "slots" a round asks of the child (modelling HYPOTHESES, spec 11.3). Used by the simulated child (measured on the
// ACTUAL stimulus) and by the ladder-monotone validator.
export const W2 = { tangle: 1.0, m: 0.3 };               // s2 weights (tangle weight raised from 0.5; 1.5 would make c1->c2 a >1.5-slot cliff)
export const OPCOST = { LR: 1.0, UD: 1.2, CW: 1.8, CCW: 2.0, R180: 2.2 };
export const demand = {
  s1: (x) => 0.5 * (x.n + x.k) + 0.8 * (x.g - 4) + 0.3 * x.delayMs / 1000,
  s2: (x) => x.L + (x.dir === 'B' ? 1.2 : 0) + W2.tangle * x.tangle + W2.m * (x.m - 6),
  s3: (x) => x.n + 0.15 * (x.rows * x.cols - x.n) + 0.5 * x.near + 0.1 * x.far + 0.35 * x.twins + 0.3 * x.delayMs / 1000,
  s4: (x) => OPCOST[x.op] + (x.axes && x.axes.length > 1 ? 0.4 : x.ops && x.ops.length > 1 ? 0.4 : 0) + 0.35 * x.n + 0.6 * (x.g - 4) + (x.mode === 'vis' ? 0 : 1.0) + 0.3 * x.delayMs / 1000,
};
// Nominal (table-only) demand of row r. s2 uses the mean measured tangle of each class (c0 0, c1 0.9, c2 2.5; stats.mjs prints the real ones).
export const TANGLE_NOMINAL = [0, 0.9, 2.5];
export const nominal = (sector, r) => {
  if (sector === 's1') return demand.s1({ ...r });
  if (sector === 's2') return demand.s2({ ...r, tangle: TANGLE_NOMINAL[r.c] });
  if (sector === 's3') return demand.s3({ ...r });
  const ops = r.axes || r.ops;
  return ops.reduce((s, o) => s + demand.s4({ ...r, op: o }), 0) / ops.length;
};
// Concept tags a round carries (unaided passes with a tag are counted; a gate needs tagMin passes of every tag in its row).
export const tagsOf = (sector, stim) => (sector === 's4' ? [stim.op || stim.axis] : sector === 's2' ? [stim.dir] : sector === 's3' ? [...(stim.near ? ['near'] : []), ...(stim.far ? ['far'] : [])] : []);
