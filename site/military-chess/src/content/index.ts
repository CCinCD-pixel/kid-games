/**
 * Content bundled with the page (Vite native JSON). Same files the validators read. Reply books are
 * small separate chunks loaded on demand (`loadBook`), precached by the service worker.
 */
import lines from '../../../../content/military-chess/lines.json';
import templates from '../../../../content/military-chess/templates.json';
import voice from '../../../../content/military-chess/voice.json';
import lessons from '../../../../content/military-chess/lessons.json';
import endgames from '../../../../content/military-chess/endgames.json';
import cards from '../../../../content/military-chess/cards.json';
import type { Book } from '../core/book';
import type { Outcome } from '../core/combat';
import type { PuzzleDef } from '../core/puzzle';

export interface Line {
  id: string;
  role: 'narrator' | 'companion' | 'word';
  text: string;
  pinyin?: Record<string, string>;
}
export interface Template {
  id: string;
  name: string;
  blurb: string;
  kid: boolean;
  layout: string;
}

// ------------------------------------------------------------------ 学堂 (spec §4.1, §8.2)
export type Role = 'intro' | 'practice' | 'review';
interface ItemBase {
  id: string;
  concept: string;
  also?: string[];
  role: Role;
  title: string;
  teaches: string;
  ghost?: boolean;
}
/** optimal-continuation tree of a static puzzle: every optimal move from every on-path position */
export interface OptNode {
  d: number;
  b: string[];
  m: Record<string, 'W' | OptNode>;
}
export interface BoardItem extends ItemBase, Omit<PuzzleDef, 'id'> {
  type: 'board';
  par: number;
  first: string[];
  legalFirst: number;
  uniqueFirst: boolean;
  line: string[];
  opt?: OptNode;
  book?: string;
}
export interface OrderItem extends ItemBase {
  type: 'order';
  cards: string[];
  dir: 'asc';
  answer: string[];
}
export interface CompareItem extends ItemBase {
  type: 'compare';
  pairs: Array<[string, string]>;
  answers: Outcome[];
  buttons: Outcome[];
}
export interface InferEvent {
  my?: string;
  act?: 'attack';
  outcome?: Outcome;
  flagShown?: boolean;
  moved?: boolean;
  from?: string;
  to?: string;
  unmoved?: boolean;
  backRow?: boolean;
}
export interface InferItem extends ItemBase {
  type: 'infer';
  events: InferEvent[];
  ask: 'can' | 'cannot';
  options: string[];
  answer: string;
}
export interface DeployItem extends ItemBase {
  type: 'deploy';
  template: string;
  blanks: Array<[number, number]>;
  place: string[];
  legalFillings: number;
  illegalFillings: number;
}
export interface DeployFullItem extends ItemBase {
  type: 'deploy-full';
  minSwaps: number;
}
export interface SceneStep {
  who: 'kid' | 'ai' | 'ref';
  act?: string;
  say?: string;
  expect?: Outcome;
  reject?: string;
}
export interface SceneItem extends ItemBase {
  type: 'scene';
  setup: { up?: Record<string, string>; down?: Record<string, string>; kid?: 'red' };
  steps: SceneStep[];
  trace: string[];
}
export type LessonItem = BoardItem | OrderItem | CompareItem | InferItem | DeployItem | DeployFullItem | SceneItem;
export interface Lesson {
  id: string;
  title: string;
  icon: string;
  wrap: string;
  teaches: string;
  stepsFirst?: boolean;
  unlocks?: string;
  items: LessonItem[];
}

// ------------------------------------------------------------------ 残局 (spec §4.2)
export interface Endgame extends PuzzleDef {
  id: string;
  tier: 1 | 2;
  title: string;
  teaches: string;
  idea: string;
  src: string;
  par: number;
  first: string[];
  legalFirst: number;
  line: string[];
  feats: string[];
  book: string;
  blue_moves: 'best';
}

export interface KnowledgeCard {
  id: string;
  title: string;
  line: string;
  art: string;
  unlock: { kind: 'lesson' | 'event'; id: string };
}

export const LINES = lines as Line[];
export const LINE_TEXT: Record<string, string> = Object.fromEntries(LINES.map((l) => [l.id, l.text]));
export const TEMPLATES = templates as Template[];
export const KID_TEMPLATES = TEMPLATES.filter((t) => t.kid);
export const VOICE = voice as { clips: boolean };
export const LESSONS = (lessons as unknown as { lessons: Lesson[] }).lessons;
export const ENDGAMES = (endgames as unknown as { puzzles: Endgame[] }).puzzles;
export const TIER_NAMES = (endgames as unknown as { tiers: Record<string, string> }).tiers;
export const CARDS = cards as KnowledgeCard[];

export const ALL_ITEMS: LessonItem[] = LESSONS.flatMap((l) => l.items);
export const itemById = (id: string): LessonItem | undefined => ALL_ITEMS.find((i) => i.id === id);
export const lessonOf = (itemId: string): Lesson | undefined => LESSONS.find((l) => l.items.some((i) => i.id === itemId));
export const endgameById = (id: string): Endgame | undefined => ENDGAMES.find((e) => e.id === id);

// ------------------------------------------------------------------ reply books (lazy)
const BOOK_FILES = import.meta.glob<{ default: Book }>('../../../../content/military-chess/books/*.json');
const bookCache = new Map<string, Book>();
/** `books/E2-01.json` → the book (separate chunk; cached) */
export async function loadBook(rel: string): Promise<Book> {
  const hit = bookCache.get(rel);
  if (hit) return hit;
  const key = Object.keys(BOOK_FILES).find((k) => k.endsWith('/' + rel));
  if (!key) throw new Error('no book ' + rel);
  const mod = await BOOK_FILES[key]();
  bookCache.set(rel, mod.default);
  return mod.default;
}
