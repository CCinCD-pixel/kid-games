import { createStore } from '@kit/progress';

export interface LevelRec { stars: number; tries: number }
/** a map the child drew; it is only kept once he has driven through it himself */
export interface CustomMap { map: string[]; solved: boolean }
/** 月面巡逻: how many patrols were driven, how many with three stars, and the day the daily one was last done */
export interface PatrolRec { count: number; best3: number; daily?: string }
export interface RoverSave { levels: Record<string, LevelRec>; chapter: number; custom?: CustomMap[]; patrol?: PatrolRec }
export const store = createStore<RoverSave>('rover-code', { version: 1, defaults: () => ({ levels: {}, chapter: 1 }) });

export const starsOf = (s: RoverSave, id: string): number => s.levels[id]?.stars ?? 0;
export const doneCount = (s: RoverSave): number => Object.values(s.levels).filter((r) => r.stars > 0).length;

export const MAX_CUSTOM = 6;
