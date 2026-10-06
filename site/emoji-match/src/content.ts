/**
 * Content (spec §8.2): the same JSON files the validators read (content/emoji-match/*.json).
 * Pure module (no DOM) — imported by the page, the vitest validators and the tools.
 */
import levelsJson from '../../../content/emoji-match/levels.json';
import puzzlesJson from '../../../content/emoji-match/puzzles.json';
import introsJson from '../../../content/emoji-match/intros.json';
import linesJson from '../../../content/emoji-match/lines.json';
import voiceJson from '../../../content/emoji-match/voice.json';
import constellationsJson from '../../../content/emoji-match/constellations.json';
import type { LevelDef, ObjectiveDef, StepDef } from './core/types';

export interface Episode { ep: number; key: string; name: string; dest: string; module: string; moduleName: string; card: string }
export interface LevelData extends LevelDef {
  id: string; ep: number; n: number; role: 'T' | 'E' | 'N' | 'H' | 'B' | 'R'; teach: string; moves: number; stars: [number, number];
}
export interface PuzzleData extends LevelDef { id: string; ep: number; par: number; trick: string; maxDepth: number; teach: string; moves: number; solution: StepDef[]; lines: StepDef[][] }
export interface IntroData { id: string; grid: string[]; dust?: string[]; ice?: string[]; exits?: number[]; colors: string; objectives: ObjectiveDef[]; steps: (StepDef & { expect: string[] })[] }
export interface Line { id: string; role: string; text: string; kind: 'sub' | 'card' }

export const EPISODES = (levelsJson as unknown as { episodes: Episode[] }).episodes;
export const LEVELS = (levelsJson as unknown as { levels: LevelData[] }).levels;
export const PUZZLES = (puzzlesJson as unknown as { puzzles: PuzzleData[] }).puzzles;
export const INTROS = (introsJson as unknown as { intros: IntroData[] }).intros;
export const LINES: Line[] = Object.entries(linesJson as Record<string, Omit<Line, 'id'>>).map(([id, l]) => ({ id, ...l }));
export const VOICE = voiceJson as { clips: boolean };
export interface Star { key: string; name: string; mag: number }
export interface Constellation { id: string; name: string; gate: number; line: string; stars: Star[]; lines: [string, string][]; xy: Record<string, [number, number]>; pointer?: [string, string, string][]; highlight?: string[]; milkyWay?: boolean | [string, string] }
export const CONSTELLATIONS = (constellationsJson as unknown as { constellations: Constellation[] }).constellations;

/** v1 (spec §0A.1): episodes 1–4 are playable; 5–9 are "建造中" on the route. */
export const PLAYABLE_EPISODES = 4;
/** v1 route: 9 destinations, 1–4 shipped, 5–9 "建造中" (spec §2.4) */
export const ROUTE = [
  { ep: 1, name: '星港', planet: 'dock' }, { ep: 2, name: '月球', planet: 'moon' }, { ep: 3, name: '火星', planet: 'mars' },
  { ep: 4, name: '小行星带', planet: 'belt' }, { ep: 5, name: '木星', planet: 'jupiter' }, { ep: 6, name: '土星', planet: 'saturn' },
  { ep: 7, name: '海王星', planet: 'neptune' }, { ep: 8, name: '冥王星', planet: 'pluto' }, { ep: 9, name: '回家', planet: 'earth' },
] as const;

export const levelById = (id: string): LevelData | undefined => LEVELS.find((l) => l.id === id);
export const puzzleById = (id: string): PuzzleData | undefined => PUZZLES.find((p) => p.id === id);
export const puzzleOf = (ep: number): PuzzleData | undefined => PUZZLES.find((p) => p.ep === ep);
/** a puzzle as a playable definition: fixed sparse board, no refill, par moves (spec §3.16) */
export const puzzleDef = (p: PuzzleData): LevelData => ({ ...p, n: 0, role: 'T', moves: p.par, stars: [0, 0], refill: false, fixedBoard: true });
/** 自由星海 (spec §3.17, §4.8): 8×8, rygbp, refill on, objective energy 1e9 (never "won", G33) */
export const FREE_DEF: LevelData = {
  id: 'free', ep: 0, n: 0, role: 'R', teach: '自由星海', colors: 'rygbp', moves: 0, stars: [0, 0],
  grid: ['........', '........', '........', '........', '........', '........', '........', '........'],
  objectives: [{ energy: 1e9 }],
};
/** energy per "满格" in free mode */
export const FREE_FULL = 300;
export const levelsOf = (ep: number): LevelData[] => LEVELS.filter((l) => l.ep === ep);
export const nextLevelId = (id: string): string | null => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1].id : null;
};
/** INTRO_ORDER (check.mjs): the element introduction order */
export const INTRO_ORDER = ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB',
  'crate', 'boosterTractor', 'crate2', 'comboPP', 'comboP', 'ice', 'boosterIon', 'ice2', 'comboOR'];
