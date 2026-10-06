import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ContentLevel {
  id: string;
  ch: number | string;
  track: string;
  role: string;
  map: string[];
  opt: { pushes: number; moves: number };
  star2: number;
  ref: string;
  twin: 'mirror' | 'flip' | 'rot180';
  checks: Record<string, unknown>;
  metrics: Record<string, unknown>;
  kind?: 'quiz';
}

export function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
}

/** Every shipped push level (main + cert + classic; the 侦探题 nodes have no map) from the game's content files. */
export function contentLevels(): ContentLevel[] {
  const main = readJson<{ levels: ContentLevel[] }>('content/sokoban/levels.json').levels.filter((l) => l.kind !== 'quiz');
  const classic = readJson<{ levels: ContentLevel[] }>('content/sokoban/classic.json').levels;
  return [...main, ...classic];
}

/** The room templates of 随机新仓库 (content/sokoban/rooms.json). */
export function contentRooms(): Record<string, string[]> {
  return readJson<{ rooms: Record<string, string[]> }>('content/sokoban/rooms.json').rooms;
}

export const FULL = !!process.env.SOK_FULL;
/** Levels too big for the fast suite (graph ≈ 170 k states): only with SOK_FULL=1. */
export const BIG = new Set(['C10']);
