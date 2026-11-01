// real.ts — the REAL defaults() of every store whose code can be imported into node without running the game (checked 2026-10-20: all of them).
// chess (棋手学院 not rebuilt yet), economy (kit/economy not built), hub-seen and metrics are mirrored in schemas.ts instead (drift is caught by tests/sync/coverage.test.ts).
// The imports are STATIC on purpose: if a game's save module starts touching the DOM at import time, this file breaks loudly and the store moves to the mirror list.
import { defaults as xiangqi } from '../../../site/xiangqi/src/progress/save';
import { defaultSave as marsBase } from '../../../site/mars-base/src/save/schema';
import { normalizeSave as memoryMatrix } from '../../../site/memory-matrix/src/core/session';
import { defaults as gearFort } from '../../../site/gear-fort/src/save';
import { defaults as snakeBattle } from '../../../site/snake-battle/src/save';
import { defaults as sokoban } from '../../../site/sokoban/src/app/save';
import { defaultSave as militaryChess } from '../../../site/military-chess/src/ctrl/save';
import { defaults as emojiMatch } from '../../../site/emoji-match/src/save';
import { DEFAULT_SETTINGS } from '../../../kit/settings';

/** Fresh copies on every call (the games mutate what they load). Deterministic: salts are fixed. */
export const REAL_DEFAULTS: Record<string, () => any> = {
  xiangqi: () => xiangqi(),
  'mars-base': () => marsBase(0),
  'memory-matrix': () => memoryMatrix(null, () => 'salt'),
  'gear-fort': () => gearFort(),
  'snake-battle': () => snakeBattle(),
  sokoban: () => sokoban(),
  'military-chess': () => militaryChess(),
  'emoji-match': () => emojiMatch(),
  settings: () => ({ ...DEFAULT_SETTINGS, hiddenGames: [...DEFAULT_SETTINGS.hiddenGames] }),
};
