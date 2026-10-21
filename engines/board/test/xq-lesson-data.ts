// test/xq-lesson-data.ts — 象棋课程数据（lessons.v1.json 33 课 + 题库子集，夹具在 fixtures/）→ LessonData。vitest 与游乐场（Vite 能 import JSON）用；
// Node ESM / Playwright 不能直接 import JSON：改用 xq-lesson-core.ts 的 makeXqLessonData 并自己读 JSON。
import type { GameRules } from '../core/types';
import type { LessonDef } from '../lesson/player';
import type { LessonData, LessonStep } from '../lesson/registry';
import lessonsJson from './fixtures/xq-lessons.v1.json';
import puzzlesJson from './fixtures/xq-puzzles.v1.json';
import { makeXqLessonData, puzzleFromRecord, type PuzzleBank } from './xq-lesson-core';

export const xqLessons = (lessonsJson as unknown as { lessons: (LessonDef & { ch: number; name: string })[] }).lessons;
export const xqPlacement = (lessonsJson as unknown as { placement: LessonStep[] }).placement;
export const xqLessonData = <M, S>(rules: GameRules<M, S>): LessonData => makeXqLessonData(rules, puzzlesJson as unknown as PuzzleBank);
export { puzzleFromRecord };
