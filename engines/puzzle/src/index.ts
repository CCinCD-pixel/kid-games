/**
 * PuzzleKit public API (`@engines/puzzle/src/index`, spec §8.2). Pure TypeScript, no DOM: the page,
 * the Worker and the validators all run this same code. Analysis helpers for validators live in
 * ./analyze (never imported by the page).
 */
export * from './types';
export { LevelError, parseLevel, serialize, nb, mirrorRows, flipRows, rot180Rows, transposeRows, twinOf, transformRows, canonicalHash, type TwinKind } from './level';
export { canon, boxMap, isSolved, walkDist, minReach, normalize, legalPushes, applyPush, stateKey, replayLurd, type ReplayResult } from './rules';
export { walkPath, canReach, stepDir } from './path';
export { detectAll, detectDeadlock, onDeadSquare, DEAD_PRIORITY } from './deadlock';
export { StateGraph, type GraphOptions } from './stategraph';
export { solvePushOptimal, solveOptimal, pushDistances, lurdForPush, type SolveResult, type OptimalResult } from './solver';
export { nextPush, hintKind, referenceKeys, normalKey, type HintAnswer, type HintKind } from './hint';
export { fnv1a32 } from './fnv';
