import { createRng } from '@kit/rng';
import { drillTables } from './drill';
import { displayPinyin, parseSyllable } from './pinyin';
import { pageText, pagesOfStation, rootOf, stationBlends, stationTones, stationWords, weakItems, weekRoots } from './progress';
import type { Bank, Save } from './types';

/**
 * The printable practice page (B8) and the weekly review (B9). One generator: the content comes from the data the game already has
 * (syllables, words, tone series, confusions): no book text, no pictures. Everything is black and white and fits one A4 page.
 */
export interface PrintBlend {
  initial: string;
  final: string;
}
export interface PrintWord {
  id: string;
  hanzi: string;
  display: string;
}
export interface PrintGroup {
  station: number;
  label: string;
  cells: string[];
  blends: PrintBlend[];
  words: PrintWord[];
  tone?: string[];
}
export type QuizItem =
  | { n: number; type: 'read'; text: string }
  | { n: number; type: 'blend'; initial: string; final: string }
  | { n: number; type: 'word'; hanzi: string; display: string }
  | { n: number; type: 'tone'; cells: string[] }
  | { n: number; type: 'pair'; a: string; b: string }
  | { n: number; type: 'letter'; text: string };
export interface Worksheet {
  kind: 'weak' | 'week' | 'lesson';
  title: string;
  note: string;
  groups: PrintGroup[];
  quiz: QuizItem[];
}
export const MAX_GROUPS = 3;
const CELLS = 8,
  BLENDS = 4,
  WORDS = 4;
export const QUIZ_LENGTH = 18;

const shown = (id: string) => id.replace(/v/g, 'ü');
function blendOf(id: string): PrintBlend | null {
  const p = parseSyllable(id);
  if (!p || !p.initial || ['y', 'w'].includes(p.initial)) return null;
  const whole = displayPinyin(id);
  return { initial: p.initial, final: whole.slice(p.initial.length) };
}
/** Preferred items first (shuffled), then the others (shuffled), without repeats, at most `n`. */
function take<T>(rng: ReturnType<typeof createRng>, pool: T[], liked: (x: T) => boolean, n: number): T[] {
  return [...rng.shuffle(pool.filter(liked)), ...rng.shuffle(pool.filter((x) => !liked(x)))].slice(0, n);
}

function group(b: Bank, station: number, weak: Set<string>, rng: ReturnType<typeof createRng>): PrintGroup {
  const likedSyl = (id: string) => weak.has(`syl:${id}`);
  const tables = drillTables(b, station);
  const grid = tables.find((t) => t.kind === 'blend') ?? tables.find((t) => t.kind === 'final');
  const weakCells = b.syllables.filter((x) => x.lesson === station && x.tone > 0 && !x.wordOnly && likedSyl(x.id)).map((x) => x.id);
  const cells = [...new Set([...weakCells, ...rng.shuffle(grid?.cells ?? [])])].slice(0, CELLS).map(displayPinyin);
  const blendPool = stationBlends(b, station);
  const blends = take(rng, blendPool, (x) => likedSyl(x.id), BLENDS).map((x) => blendOf(x.id)).filter((x): x is PrintBlend => !!x);
  const wordPool = stationWords(b, station);
  const words = take(rng, wordPool, (w) => weak.has(`word:${w.id}`), WORDS).map((w) => ({ id: w.id, hanzi: w.hanzi, display: w.display }));
  const series = take(rng, stationTones(b, station), (t) => weak.has(`tone4:${t.series}`), 1)[0];
  return {
    station,
    label: pageText(pagesOfStation(b, station)) || `第 ${station} 站`,
    cells,
    blends,
    words,
    tone: series ? series.ids.filter((_, m) => !(series.skip ?? []).includes(m + 1)).map(displayPinyin) : undefined,
  };
}
const empty = (g: PrintGroup) => !g.cells.length && !g.blends.length && !g.words.length && !g.tone;

/** B8: weak spots grouped by book page, or one chosen station. */
export function buildWorksheet(s: Save, b: Bank, scope: 'weak' | number, _now = Date.now()): Worksheet {
  const rng = createRng(`worksheet:${String(scope)}:${s.sessions}`);
  const weak = weakItems(s, b, 40);
  const weakSet = new Set(weak.map((w) => w.root));
  let stations: number[];
  if (typeof scope === 'number') stations = [scope];
  else {
    const score = new Map<number, number>();
    for (const w of weak) if (w.station !== undefined && w.station <= s.settings.lesson) score.set(w.station, (score.get(w.station) ?? 0) + w.score);
    stations = [...score].sort((x, y) => y[1] - x[1] || y[0] - x[0]).map(([st]) => st).slice(0, MAX_GROUPS);
    // nothing shaky yet: the practice page is about the station the teacher has reached
    if (!stations.length) stations = [s.settings.lesson];
  }
  const groups = stations.map((st) => group(b, st, typeof scope === 'number' ? new Set<string>() : weakSet, rng)).filter((g) => !empty(g));
  return {
    kind: typeof scope === 'number' ? 'lesson' : 'weak',
    title: typeof scope === 'number' ? `${pageText(pagesOfStation(b, scope)) || `第 ${scope} 站`} 练习` : '薄弱项练习页',
    note: typeof scope === 'number' ? '先读一读，再拼一拼、认一认。' : '这些是最近比较容易忘的，每一页读几遍就好。',
    groups,
    quiz: [],
  };
}

/** B9: 15 to 20 small questions about what was practised this week and what is due, a little of everything. */
export function buildWeeklyQuiz(s: Save, b: Bank, now = Date.now()): Worksheet {
  const rng = createRng(`weekly:${s.sessions}:${new Date(now).toDateString()}`);
  const L = s.settings.lesson;
  const wk = weekRoots(s, now);
  for (const w of weakItems(s, b, 20)) wk.add(w.root);
  const near = (lesson: number) => lesson <= L;
  const syl = b.syllables.filter((x) => near(x.lesson) && x.tone > 0 && !x.wordOnly);
  const blends = syl.filter((x) => x.initial && !['y', 'w'].includes(x.initial));
  const words = b.words.filter((w) => near(w.lesson) && !w.hold && !w.beyond && !['sentence', 'cloze'].includes(w.kind));
  const tones = (b.tone4 ?? []).filter((t) => near(t.lesson) && t.ids.filter((_, m) => !(t.skip ?? []).includes(m + 1)).length >= 3);
  const pairs = b.confusions.filter((c) => c.pair.every((id) => b.letters.some((l) => l.id === id && near(l.lesson))));
  const letters = b.letters.filter((l) => near(l.lesson) && l.kind !== 'whole');
  const pools = {
    read: take(rng, syl, (x) => wk.has(`syl:${x.id}`), 8),
    blend: take(rng, blends, (x) => wk.has(`syl:${x.id}`), 8),
    word: take(rng, words, (w) => wk.has(`word:${w.id}`), 8),
    tone: take(rng, tones, (t) => wk.has(`tone4:${t.series}`), 4),
    pair: take(rng, pairs, (c) => wk.has(`pair:${c.pair.join('|')}`), 4),
    letter: take(rng, letters, (l) => wk.has(`letter:${l.id}`), 4),
  };
  const order = ['word', 'blend', 'read', 'word', 'tone', 'blend', 'pair', 'word', 'read', 'letter', 'blend', 'word', 'read', 'tone', 'pair', 'blend', 'letter', 'read', 'word', 'blend'] as const;
  const used = { read: 0, blend: 0, word: 0, tone: 0, pair: 0, letter: 0 };
  const quiz: QuizItem[] = [];
  for (const type of order) {
    if (quiz.length >= QUIZ_LENGTH) break;
    const i = used[type]++;
    const n = quiz.length + 1;
    if (type === 'read' && pools.read[i]) quiz.push({ n, type, text: displayPinyin(pools.read[i].id) });
    else if (type === 'blend' && pools.blend[i]) {
      const x = blendOf(pools.blend[i].id);
      if (x) quiz.push({ n, type, ...x });
    } else if (type === 'word' && pools.word[i]) quiz.push({ n, type, hanzi: pools.word[i].hanzi, display: pools.word[i].display });
    else if (type === 'tone' && pools.tone[i]) {
      const t = pools.tone[i];
      quiz.push({ n, type, cells: t.ids.filter((_, m) => !(t.skip ?? []).includes(m + 1)).map(displayPinyin) });
    } else if (type === 'pair' && pools.pair[i]) quiz.push({ n, type, a: shown(pools.pair[i].pair[0]), b: shown(pools.pair[i].pair[1]) });
    else if (type === 'letter' && pools.letter[i]) quiz.push({ n, type, text: shown(pools.letter[i].id) });
  }
  // a small bank (early stations): top up with readings so the paper still has 15 questions
  const spare = rng.shuffle(syl.filter((x) => !quiz.some((q) => q.type === 'read' && q.text === displayPinyin(x.id))));
  const pad = [...spare.map((x) => displayPinyin(x.id)), ...letters.map((l) => shown(l.id)), ...syl.map((x) => displayPinyin(x.id))];
  for (let i = 0; quiz.length < 15 && pad.length && i < 60; i++) quiz.push({ n: quiz.length + 1, type: 'read', text: pad[i % pad.length] });
  return { kind: 'week', title: '一周回顾卷', note: '这一周练过的，每题读一读，读对了在方框里打勾。', groups: [], quiz };
}
export const worksheetRoots = (w: Worksheet): string[] => w.quiz.map((q) => `${q.type}:${q.n}`).concat(w.groups.map((g) => `page:${g.station}`));
export { rootOf };
