// V21 degenerate strategies (spec §9.1, review B1) — 1:1 port of proto/bots/degenerate.mjs. None of these may earn
// 2★ (win with ≤ 2 檑木) on a level more often than the level's R band allows.
//   shovel:<card>  place the card in front of the nearest machine, shovel it 2–60 ticks later, repeat (the refund loop)
//   wall           walls only, every lane, re-placed when broken (stall)
//   spam:<card>    one card only, round-robin lanes, whenever affordable (no economy)
//   econ           farms / banks only
import { COLS } from '../lane/rules';
import { canPlace, topAt } from '../lane/sim';
import type { Action, Level, SimState } from '../lane/types';
import { prng, affordable, activeLanes, cards } from './common';

export const DEGENERATE = ['shovel:hook', 'shovel:gust', 'shovel:shooter', 'shovel:lobber', 'shovel:burner', 'shovel:beam', 'shovel:radial', 'wall', 'econ', 'spam:shooter', 'spam:lobber', 'spam:burner', 'spam:beam', 'spam:radial'];

export function makeDegenerate(_level: Level, seed: number, kind: string): (S: SimState) => Action[] {
  const r = prng(seed * 7717 + 5); const [mode, card] = kind.split(':'); let rr = 0; let pending: { lane: number; col: number; at: number } | null = null;
  return function D(S: SimState): Action[] {
    const acts: Action[] = []; for (const d of S.drops) acts.push({ t: 'collect', id: d.id });
    const lanes = activeLanes(S); const deck = cards(S);
    if (mode === 'shovel') {
      if (pending && S.tick >= pending.at) { acts.push({ t: 'shovel', lane: pending.lane, col: pending.col }); pending = null; return acts; }
      if (pending || !deck.includes(card) || !affordable(S, card)) return acts;
      const e = S.enemies.filter((x) => x.hp > 0 && !x.gone && x.x < COLS * 10000).sort((a, b) => a.x - b.x)[0]; const lane = e ? e.lane : lanes[rr++ % lanes.length];
      const col = e ? Math.max(0, Math.min(COLS - 1, Math.floor(e.x / 10000) - 2)) : 2;
      for (const c of [col, col - 1, col + 1, 1, 2, 3]) if (c >= 0 && c < COLS && canPlace(S, card, lane, c) === null) { acts.push({ t: 'place', card, lane, col: c }); pending = { lane, col: c, at: S.tick + 2 + Math.floor(r() * 58) }; break; }
      return acts;
    }
    const want = mode === 'wall' ? 'wall' : mode === 'econ' ? (deck.includes('bank') && r() < 0.5 ? 'bank' : 'farm') : card;
    if (!deck.includes(want) || !affordable(S, want)) return acts;
    for (let k = 0; k < lanes.length; k++) {
      const lane = lanes[(rr + k) % lanes.length];
      const cols = want === 'wall' ? [4, 5, 3, 6, 2] : want === 'farm' || want === 'bank' ? [0, 1, 2] : [1, 2, 0, 3];
      if (want === 'wall' && [4, 5, 3, 6, 2].some((c) => topAt(S, lane, c)?.k === 'wall')) continue;
      for (const c of cols) if (canPlace(S, want, lane, c) === null) { acts.push({ t: 'place', card: want, lane, col: c }); rr = (rr + k + 1) % lanes.length; return acts; }
    }
    return acts;
  };
}
