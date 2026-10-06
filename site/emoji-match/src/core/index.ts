/** 星晶消消乐 engine — public API (spec §8.3). Pure TS, zero DOM. */
export * from './types';
export { parseLevel } from './level';
export { newGame, cloneState, assignUids, remaining, isWon, boardString, snapshot, starsFor } from './state';
export { findGroups } from './match';
export { listMoves, countMoves, applyMove, swapValid, movable } from './moves';
export { settle } from './gravity';
export { propTarget, mostCommonColor } from './resolve';
export { shuffle, placeAssist, endOfMove } from './rules';
export { applyBooster, boosterTargets } from './boosters';
export { hint1Candidates, hint1Move, bestMove } from './hints';
export { chooseMove, playOut, measure, evalMove, scoreTransition } from './bots';
export { solve, accept, hintFrom, TRICKS } from './puzzle';
export { contentHash } from './hash';
export { rngNew, rngNext, rngBelow, rngFork, hashString } from './rng';
