import data from '../../../../content/rover-code/levels.json';
import { parseLevel, type LevelData, type Level } from './sim';

export const CHAPTERS: { ch: number; title: string }[] = data.chapters;
export const LEVELS: Level[] = (data.levels as unknown as LevelData[]).map(parseLevel);
export const levelById = (id: string): Level | undefined => LEVELS.find((l) => l.id === id);
export const chapterLevels = (ch: number): Level[] => LEVELS.filter((l) => l.ch === ch);
export const nextLevel = (id: string): Level | undefined => LEVELS[LEVELS.findIndex((l) => l.id === id) + 1];
