import { createRng } from '@kit/rng';
import { displayPinyin } from './pinyin';
import { readsAsOne } from './sound';
import type { Bank, Syllable } from './types';

/**
 * 练读表: a grid of sounds the child reads one after the other (demonstration first if wanted). Tables are generated from the
 * data for a station: only syllables with a real recording and a tone mark (never a neutral tone, never a word-only syllable).
 */
export interface DrillTable {
  id: string;
  kind: 'final' | 'whole' | 'blend';
  station: number;
  title: string;
  note: string;
  cells: string[];
}
const playable = (b: Bank): Map<string, Syllable> => new Map(b.syllables.filter((s) => s.tone > 0 && !s.wordOnly).map((s) => [s.id, s]));
const MAX_CELLS = 36;

function seriesCells(b: Bank, kind: 'final' | 'whole', pick: (lesson: number) => boolean, max: number): string[] {
  const ok = playable(b);
  const out: string[] = [];
  for (const t of b.tone4 ?? []) {
    if (t.kind !== kind || !pick(t.lesson)) continue;
    t.ids.forEach((id, n) => {
      if (!(t.skip ?? []).includes(n + 1) && ok.has(id)) out.push(id);
    });
  }
  return out.slice(0, max);
}
export function drillTables(b: Bank, station: number): DrillTable[] {
  const out: DrillTable[] = [];
  const shuffled = (id: string, cells: string[]) => createRng(`drill:${id}`).shuffle(cells).slice(0, MAX_CELLS);
  const add = (kind: DrillTable['kind'], title: string, note: string, cells: string[]) => {
    if (cells.length < 8) return;
    const id = `${kind}:${station}`;
    out.push({ id, kind, station, title, note, cells: shuffled(id, cells) });
  };
  // 复韵母练读表: the vowels of this station and the two before it, all four tones mixed up (single vowels in the early stations)
  const compound = station >= 9;
  add(
    'final',
    compound ? '韵母四声练读表' : '单韵母四声练读表',
    compound ? '这一站和前两站的韵母，四个声调混在一起' : '韵母的四个声调，混在一起读',
    seriesCells(b, 'final', (l) => (compound ? l >= Math.max(9, station - 2) && l <= station : l <= station), MAX_CELLS),
  );
  // 整体认读音节专表: zhi chi shi zi ci si yi wu yu ye yue yin yun yuan …, tones mixed
  add('whole', '整体认读音节练读表', '整体认读音节的四声，混在一起，区分着读', seriesCells(b, 'whole', (l) => l <= station, 24));
  // 拼读练读表: the syllables of this station (and the one before), tones balanced
  const ok = playable(b);
  const byTone: string[][] = [[], [], [], []];
  for (const s of ok.values())
    if (s.initial && !readsAsOne(s) && s.lesson <= station && s.lesson >= station - 1 && !(b.tone4 ?? []).some((t) => t.ids.includes(s.id))) byTone[s.tone - 1].push(s.id);
  const cells: string[] = [];
  const rng = createRng(`drill:blend:${station}`);
  const lanes = byTone.map((l) => rng.shuffle(l));
  for (let i = 0; cells.length < MAX_CELLS && lanes.some((l) => i < l.length); i++) for (const l of lanes) if (i < l.length && cells.length < MAX_CELLS) cells.push(l[i]);
  add('blend', '拼读练读表', '这一站的拼读，四个声调轮流读', cells);
  return out;
}
/** The table the teacher's lesson points at (the vowel table for the new vowels, the spelling table for the new first sounds). */
export const defaultTable = (tables: DrillTable[], station: number): DrillTable | undefined =>
  tables.find((t) => t.kind === (station >= 9 ? 'final' : station >= 3 ? 'blend' : 'final')) ?? tables[0];
export const cellLabel = (id: string): string => displayPinyin(id);

/** Only for the child, never a ranking: faster by 3 s or more, about the same within 3 s, nothing when slower. */
export function compareTime(last: number | undefined, seconds: number): string | null {
  if (last === undefined) return '第一次读完，记下啦';
  const diff = last - seconds;
  if (diff >= 3) return `比上次快 ${diff} 秒`;
  if (Math.abs(diff) < 3) return '和上次差不多';
  return null;
}
