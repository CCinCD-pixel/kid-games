/**
 * Content (spec §8.3): the same JSON files the validators read. Pure module (no DOM), so vitest and
 * the tools import it too. Large optional content (the random fallback pool) is lazy-loaded
 * (`loadFallbackPool`); the room templates are imported by the Worker only (the generator runs there).
 */
import cardsJson from '../../../content/sokoban/cards.json';
import chaptersJson from '../../../content/sokoban/chapters.json';
import classicJson from '../../../content/sokoban/classic.json';
import cosmeticsJson from '../../../content/sokoban/cosmetics.json';
import levelsJson from '../../../content/sokoban/levels.json';
import linesJson from '../../../content/sokoban/lines.json';
import quizzesJson from '../../../content/sokoban/quizzes.json';
import voiceJson from '../../../content/sokoban/voice.json';

export type Lesson = 'plain' | 'turn' | 'trap' | 'order' | 'deep' | 'park' | 'color' | 'decoy' | 'square' | 'backward' | 'mixed';
export type Role = 'intro' | 'practice' | 'twist' | 'review' | 'boss' | 'breather' | 'quiz' | 'cert' | 'classic' | 'random' | 'tower';
/** 'tower' = 大师塔 (v2 backlog, spec §11 #3): same level schema, `release: 'v2'`, never loaded in v1 */
export type Track = 'main' | 'cert' | 'classic' | 'random' | 'twin' | 'tower';
export type Hall = 'tiangong' | 'moon' | 'mars' | 'classic';
export type Dest = 'tiangong' | 'moon' | 'mars';
export type DeadMarker = 'instant' | 'delayed' | 'afterCh4Open';

export interface LevelChecks {
  pushes?: [number, number];
  boxes?: number;
  greedy?: 'ok' | 'fail';
  seq?: boolean;
  seqFirst?: 'only';
  trap?: number;
  trapType?: 'corner' | 'wall' | 'pair' | 'square';
  trapDepth?: number;
  turnsMin?: number;
  switchesMin?: number;
  naiveMax?: number;
  invisMax?: number;
  colorDecoy?: boolean;
}

export interface LevelMetrics {
  D: number;
  k1: number | null;
  L1: number | null;
  states: number;
  trapFirst: number;
  firstPushes: number;
  seqFirsts: number | null;
  greedy: string;
  switches: number;
  turns: number;
  first: Partial<Record<'corner' | 'wall' | 'pair' | 'square', number | null>>;
  invis: number | null;
}

export interface LevelDef {
  id: string;
  was?: string | null;
  release: string;
  ch: number | 'cert' | 'classic' | 'random';
  track: Track;
  role: Role;
  review: boolean;
  name: string;
  teaches: string;
  /** narration id of the level's line (sok.lv.<id>; random levels: sok.rnd.<lesson>) */
  say: string;
  lesson: Lesson;
  map: string[];
  opt: { pushes: number; moves: number };
  star2: number;
  ref: string;
  twin: 'mirror' | 'flip' | 'rot180';
  checks: LevelChecks;
  metrics: LevelMetrics;
  /** 侦探题 node (no map: the boards are in quizzes.json) */
  kind?: 'quiz';
  quiz?: string;
  /** 镜子仓库: the level this one mirrors (track 'twin') */
  twinOf?: string;
  /** 随机新仓库: tier + seed (+ pool index when it came from the fallback pool) */
  random?: { tier: 1 | 2 | 3 | 4; seed: number; poolIdx?: number; hash: number; genMs?: number };
}

export interface TrackParams {
  id: string;
  name: string;
  goal?: string;
  hall: Hall | 'byTier';
  dest: Dest | 'byTier';
  emblem?: string;
  introLine?: string;
  order?: 'strict' | 'frontier2';
  h0Seconds?: number;
  deadMarker: DeadMarker;
  stuckDelay: { pushes: number; ms: number };
  rewindButton: boolean;
  inputMode: 'footprints' | 'arrows' | 'auto';
  swipeDefault: boolean | 'auto';
  graph: { maxStates: number; maxMs: number };
  hintMode: string;
  hints?: boolean;
  talk: number[];
}

export interface ChapterDef extends TrackParams {
  ch: number;
  release: string;
  hall: Hall;
  dest: Dest;
}

export interface Line {
  id: string;
  role: string;
  text: string;
  pinyin?: Record<string, string>;
}

export type DeadKind = 'corner' | 'wall' | 'pair' | 'square';

export interface QuizCrate {
  r: number;
  c: number;
}
export interface QuizSide {
  map: string[];
  dead: (QuizCrate & { type: DeadKind })[];
  alive: (QuizCrate & { demo: string })[];
  home: QuizCrate[];
}
export interface QuizBoard extends QuizSide {
  id: string;
  type: 'corner' | 'wall' | 'onpad' | 'pair' | 'square' | 'mixed';
  twin: QuizSide & { kind: 'mirror' | 'flip' | 'rot180' };
}
export interface QuizDef {
  name: string;
  teaches: string;
  say: string;
  level: string | null;
  boards: QuizBoard[];
}

export interface CardDef {
  id: string;
  release: string;
  ch: number | string;
  title: string;
  text: string;
  line: string;
  source: string;
  signedBy: string;
}

export type CosmeticSlot = 'plate' | 'hat' | 'lamp' | 'badge' | 'paint' | 'antenna' | 'tool' | 'tread';
export interface CosmeticDef {
  id: string;
  release: string;
  slot: CosmeticSlot;
  name: string;
  line: string;
  unlock: { type: 'chapter'; ch: number } | { type: 'classicAll' } | { type: 'random'; n: number } | { type: 'tower'; n: number };
}

/** One level of the 随机新仓库 fallback pool (content/sokoban/random-fallback.json). */
export interface PoolLevel {
  tier: 1 | 2 | 3 | 4;
  seed: number;
  map: string[];
  opt: { pushes: number; moves: number };
  ref: string;
  lesson: string;
  hash: number;
}

export const CHAPTERS: ChapterDef[] = (chaptersJson as unknown as { chapters: ChapterDef[] }).chapters.filter((c) => c.release === 'v1');
export const TRACKS = (chaptersJson as unknown as { tracks: Record<'cert' | 'classic' | 'random', TrackParams> }).tracks;
export const MAIN_LEVELS: LevelDef[] = (levelsJson as unknown as { levels: LevelDef[] }).levels.filter((l) => l.release === 'v1');
export const CLASSIC_LEVELS: LevelDef[] = (classicJson as unknown as { levels: LevelDef[] }).levels;
export const QUIZZES: Record<string, QuizDef> = (quizzesJson as unknown as { quizzes: Record<string, QuizDef> }).quizzes;
export const CARDS: CardDef[] = (cardsJson as unknown as { cards: CardDef[] }).cards.filter((c) => c.release === 'v1');
export const COSMETICS: CosmeticDef[] = (cosmeticsJson as unknown as { items: CosmeticDef[] }).items.filter((c) => c.release === 'v1');
export const LINES: Line[] = linesJson as Line[];
export const VOICE: { clips: boolean } = voiceJson as { clips: boolean };

const byId = new Map<string, LevelDef>();
for (const l of [...MAIN_LEVELS, ...CLASSIC_LEVELS]) byId.set(l.id, l);

/** A level by id: fixed levels, `<id>~twin` (镜子仓库) — never random levels (they live in the save / router). */
export function levelById(id: string): LevelDef | undefined {
  return byId.get(id) ?? twinLevel(id);
}

export const isQuiz = (l: Pick<LevelDef, 'kind'>): boolean => l.kind === 'quiz';

/** Main-track nodes of chapter `ch` in play order (push levels and 侦探题). */
export function chapterLevels(ch: number): LevelDef[] {
  return MAIN_LEVELS.filter((l) => l.track === 'main' && l.ch === ch);
}

export function certLevels(): LevelDef[] {
  return MAIN_LEVELS.filter((l) => l.track === 'cert');
}

export function chapterOf(ch: number): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.ch === ch);
}

/** Track parameters for a level (chapter / cert / classic / random; a twin plays by its original's rules). */
export function paramsFor(level: Pick<LevelDef, 'track' | 'ch'>): TrackParams {
  const track = level.track === 'twin' ? (level.ch === 'classic' ? 'classic' : level.ch === 'cert' ? 'cert' : 'main') : level.track;
  if (track === 'cert') return TRACKS.cert;
  if (track === 'classic') return TRACKS.classic;
  if (track === 'random') return TRACKS.random;
  return chapterOf(Number(level.ch)) ?? CHAPTERS[0];
}

/** Every shipped push level (main + cert + classic; no quizzes). */
export function allPushLevels(): LevelDef[] {
  return [...MAIN_LEVELS.filter((l) => !isQuiz(l)), ...CLASSIC_LEVELS];
}

/** star2 threshold (spec §3.5). */
export const star2Of = (opt: number): number => opt + Math.max(2, Math.ceil(0.25 * opt));

// ------------------------------------------------------------------ 镜子仓库 (spec §5.1)

export const TWIN_SUFFIX = '~twin';

function transform(rows: string[], kind: 'mirror' | 'flip' | 'rot180'): string[] {
  const W = Math.max(...rows.map((r) => r.length));
  const pad = rows.map((r) => r.padEnd(W, ' '));
  const mirror = (rs: string[]) => rs.map((r) => [...r].reverse().join(''));
  const out = kind === 'mirror' ? mirror(pad) : kind === 'flip' ? pad.slice().reverse() : mirror(pad).reverse();
  return out.map((r) => r.replace(/\s+$/, ''));
}

/** A LURD line under the same isometry (mirror swaps l/r, flip swaps u/d, rot180 both). */
export function transformLurd(lurd: string, kind: 'mirror' | 'flip' | 'rot180'): string {
  const swap: Record<string, string> = kind === 'mirror' ? { l: 'r', r: 'l' } : kind === 'flip' ? { u: 'd', d: 'u' } : { l: 'r', r: 'l', u: 'd', d: 'u' };
  return [...lurd].map((ch) => {
    const lo = ch.toLowerCase();
    const t = swap[lo] ?? lo;
    return ch === lo ? t : t.toUpperCase();
  }).join('');
}

/** The twin of a fixed push level: same rules, same optimum (an isometry), its own stars (`twinStars`). */
function twinLevel(id: string): LevelDef | undefined {
  if (!id.endsWith(TWIN_SUFFIX)) return undefined;
  const base = byId.get(id.slice(0, -TWIN_SUFFIX.length));
  if (!base || isQuiz(base) || base.track === 'cert') return undefined;
  return { ...base, id, twinOf: base.id, track: 'twin', map: transform(base.map, base.twin), ref: transformLurd(base.ref, base.twin) };
}

/** Lazy 随机新仓库 fallback pool (spec §3.9: a separate chunk, loaded when S8 opens). */
export async function loadFallbackPool(): Promise<PoolLevel[]> {
  try {
    const m = await import('../../../content/sokoban/random-fallback.json');
    return ((m as unknown as { default: { levels: PoolLevel[] } }).default ?? (m as unknown as { levels: PoolLevel[] })).levels ?? [];
  } catch {
    return [];
  }
}
