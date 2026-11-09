import data from '../../../../content/rover-code/levels.json';
import { parseLevel, parseRuleLevel, type AnyLevel, type Level, type LevelData, type RuleLevelData } from './sim';

export const CHAPTERS: { ch: number; title: string }[] = data.chapters;
export const LEVELS: AnyLevel[] = (data.levels as unknown as (LevelData | RuleLevelData)[]).map((l) => (l.kind === 'rules' ? parseRuleLevel(l) : parseLevel({ ...l, kind: 'grid' })));
export const levelById = (id: string): AnyLevel | undefined => LEVELS.find((l) => l.id === id);
export const chapterLevels = (ch: number): AnyLevel[] => LEVELS.filter((l) => l.ch === ch);
export const nextLevel = (id: string): AnyLevel | undefined => LEVELS[LEVELS.findIndex((l) => l.id === id) + 1];
/** the grid levels (a programme of cards), as opposed to the rule levels */
export const GRID_LEVELS: Level[] = LEVELS.filter((l): l is Level => l.kind === 'grid');
