import { createStore } from '@kit/progress';

export interface LevelRec { stars: number; tries: number }
export interface RoverSave { levels: Record<string, LevelRec>; chapter: number }
export const store = createStore<RoverSave>('rover-code', { version: 1, defaults: () => ({ levels: {}, chapter: 1 }) });

export const starsOf = (s: RoverSave, id: string): number => s.levels[id]?.stars ?? 0;
export const doneCount = (s: RoverSave): number => Object.values(s.levels).filter((r) => r.stars > 0).length;
