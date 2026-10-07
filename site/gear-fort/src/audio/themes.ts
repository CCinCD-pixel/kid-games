// Composed music data (spec §7.2): the 墨家动机 (宫–商–角–徵–宫, last note on the 编钟) and everything grown from it.
// Notes are [midi, beats, velocity 0..1, bell?]; midi 0 = rest. All pitches sit in the 宫/羽 pentatonic on C
// (C D E G A) — checked by themes.test.ts. Procedural code only arranges (qin pattern, xun long-tone placement) by
// seed; it never invents melody.
import type { NoteEv } from './synth';

export type Note = readonly [midi: number, beats: number, vel: number, bell?: 1];
export interface Theme { id: string; bpm: number; bars: number; melody: Note[]; roots: number[]; loop: boolean }

const n = (m: number, b: number, v = 0.8, bell?: 1): Note => (bell ? [m, b, v, 1] : [m, b, v]);

/** the 4-bar 墨家动机 */
export const MOTIF: Note[] = [n(60, 1.5), n(62, 0.5), n(64, 2), n(67, 1), n(64, 1), n(62, 2), n(60, 1), n(62, 1), n(64, 1), n(67, 1), n(72, 4, 0.9, 1)];

const A2: Note[] = [n(69, 1.5), n(67, 0.5), n(64, 2), n(62, 1), n(64, 1), n(67, 2), n(64, 1), n(62, 1), n(60, 1), n(57, 1), n(60, 4, 0.7)];
const B: Note[] = [
  n(69, 2, 0.7), n(72, 1), n(69, 1), n(67, 1.5), n(64, 0.5), n(62, 2), n(64, 1), n(67, 1), n(69, 2), n(67, 1), n(64, 1), n(69, 2),
  n(72, 1.5, 0.85), n(74, 0.5), n(76, 2), n(74, 1), n(72, 1), n(69, 2), n(67, 1), n(69, 1), n(64, 1), n(62, 1), n(57, 4, 0.6),
];
const A3: Note[] = [
  n(72, 1.5, 0.85), n(74, 0.5), n(76, 2), n(79, 1), n(76, 1), n(74, 2), n(72, 1), n(74, 1), n(76, 1), n(79, 1), n(81, 2, 0.9), n(79, 2),
  n(76, 1.5), n(74, 0.5), n(72, 2), n(69, 1), n(72, 1), n(74, 2), n(76, 1), n(74, 1), n(72, 1), n(69, 1), n(72, 4, 0.9, 1),
];
const CODA: Note[] = [
  n(67, 2, 0.6), n(64, 2, 0.6), n(62, 3, 0.6), n(0, 1), n(64, 1, 0.6), n(62, 1, 0.6), n(60, 2, 0.6), n(57, 2, 0.55), n(60, 2, 0.55),
  ...MOTIF.slice(0, 10).map((x) => n(x[0], x[1], 0.7)), n(60, 4, 0.75, 1),
];

/** 地图 / 菜单主题: 宫调 72 bpm, 琴 + 埙, 32 bars, loops */
export const MAP_THEME: Theme = {
  id: 'map', bpm: 72, bars: 32, loop: true,
  melody: [...MOTIF, ...A2, ...B, ...A3, ...CODA],
  // one harmonic root per bar (the qin's arpeggio and the xun's long tones follow it)
  roots: [48, 48, 45, 48, 45, 43, 48, 48, 45, 43, 40, 45, 48, 45, 43, 45, 48, 43, 48, 45, 40, 45, 40, 48, 43, 38, 48, 45, 48, 43, 48, 48],
};
/** 故事 / 卷尾主题: the same motif slowed, with 编钟 on every phrase end, 16 bars */
export const STORY_THEME: Theme = {
  id: 'story', bpm: 56, bars: 16, loop: false,
  melody: [...MOTIF.map((x, i) => (i === 2 || i === 5 ? n(x[0], x[1], x[2], 1) : x)), ...A2.slice(0, -1), n(60, 4, 0.8, 1), ...CODA],
  roots: [48, 48, 45, 48, 45, 43, 48, 48, 43, 38, 48, 45, 48, 43, 48, 48],
};

/** short event phrases (1–3 s): 大波, 新机关, 守住, 没守住, 天亮, Boss 折叠 */
export const STINGERS: Record<string, { bpm: number; notes: Note[]; drum?: number[] }> = {
  flag: { bpm: 120, notes: [n(60, 0.5, 0.9), n(62, 1.5, 0.9)], drum: [0, 0.5, 1] },
  newMachine: { bpm: 100, notes: [n(67, 0.5, 0.7), n(64, 0.5, 0.7), n(69, 1.5, 0.8)] },
  win: { bpm: 110, notes: [n(60, 0.5), n(62, 0.5), n(64, 0.5), n(67, 0.5), n(72, 2.5, 0.95, 1)] },
  lose: { bpm: 70, notes: [n(64, 1, 0.6), n(60, 2, 0.55)] },
  dawn: { bpm: 90, notes: [n(69, 0.5, 0.7), n(72, 0.5, 0.75), n(76, 1, 0.8), n(72, 2, 0.85, 1)] },
  bossFold: { bpm: 90, notes: [n(72, 0.75, 0.9, 1), n(76, 0.75, 0.9, 1), n(79, 2, 1, 1)] },
};

export const beatsOf = (ns: readonly Note[]): number => ns.reduce((a, x) => a + x[1], 0);
const PCS = new Set([0, 2, 4, 7, 9]);
export const inMode = (m: number): boolean => m === 0 || PCS.has(m % 12);

/** seed → arrangement choices (pure; same seed, same arrangement) */
export function arrangement(seed: number): { pattern: number[]; xunEvery: 1 | 2; xunOffset: number } {
  let s = (Math.imul(seed + 7, 2654435761) >>> 0) || 1; const r = (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  // qin arpeggio patterns in pentatonic DEGREES above the bar's root (so every note stays in the mode)
  const PATTERNS = [[0, 3, 5, 3], [0, 5, 3, 7], [0, 2, 3, 5], [0, 3, 4, 5]];
  return { pattern: PATTERNS[Math.floor(r() * PATTERNS.length)], xunEvery: r() < 0.5 ? 1 : 2, xunOffset: Math.floor(r() * 2) };
}

/** move k pentatonic degrees up from an in-mode pitch */
export function degUp(m: number, k: number): number {
  const L = [0, 2, 4, 7, 9]; const oct = Math.floor(m / 12); let i = L.indexOf(m % 12); if (i < 0) return m;
  i += k; return (oct + Math.floor(i / 5)) * 12 + L[((i % 5) + 5) % 5];
}

/** melody note → instrument events (bell notes double on the qin, as written) */
function voice(evs: NoteEv[], m: number, t: number, dur: number, v: number, isBell?: 1): void {
  const q = m >= 66 ? 'qinHi' : 'qin';
  if (isBell) { evs.push({ inst: 'bell', m, t, dur, vel: v }); evs.push({ inst: q, m, t, dur, vel: v * 0.6 }); } else evs.push({ inst: q, m, t, dur, vel: v });
}
/** one pass of a theme as timed events (s). The page scheduler and the offline renderer play this same list. */
export function scoreOf(theme: Theme, seed: number): { evs: NoteEv[]; len: number } {
  const spb = 60 / theme.bpm; const evs: NoteEv[] = []; let mt = 0;
  for (const [m, b, v, isBell] of theme.melody) { if (m) voice(evs, m, mt * spb, b * spb, v, isBell); mt += b; }
  const arr = arrangement(seed);
  for (let bar = 0; bar < theme.bars; bar++) {
    const t = bar * 4 * spb; const root = theme.roots[bar];
    arr.pattern.forEach((d, i) => evs.push({ inst: 'qin', m: degUp(root, d), t: t + i * spb, dur: spb, vel: 0.32 }));
    if ((bar + arr.xunOffset) % arr.xunEvery === 0) evs.push({ inst: 'xun', m: degUp(root, 5), t: t + 0.02, dur: 4 * spb * arr.xunEvery - 0.1, vel: 0.8 });
  }
  evs.sort((a, b) => a.t - b.t); return { evs, len: mt * spb };
}
export function stingerScore(id: string): { evs: NoteEv[]; len: number } {
  const s = STINGERS[id]; const spb = 60 / s.bpm; const evs: NoteEv[] = []; let t = 0;
  for (const [m, b, v, isBell] of s.notes) { if (m) voice(evs, m, t, b * spb, v, isBell); t += b * spb; }
  for (const d of s.drum || []) evs.push({ inst: 'drum', m: 0, t: d * spb, dur: 0.45, vel: 0.9 });
  evs.sort((a, b) => a.t - b.t); return { evs, len: t };
}
