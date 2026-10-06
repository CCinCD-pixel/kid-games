/**
 * Kid-model bots (spec §9.4) — calibration opponents, never shipped. Port of the reference `ai.mjs`
 * kidMove (v1.1). They only use public information: their own pieces, positions, face-up pieces and
 * (暗棋) their knowledge masks.
 *  A: knows the rules; takes sure wins (incl. the flag); otherwise 60% forward, 50% pokes unknown
 *     pieces with ≥ 团长.
 *  B: A + caution: never attacks a visible bigger piece; ≥ 团长 avoids stepping next to a visible
 *     piece that beats it (camps excepted); 暗棋: ≥ 师长 never pokes an unmoved back-row piece, 30%
 *     of the time an engineer probes one; 翻翻棋: flips 45% and never next to its own ≥ 军长.
 */
import { RED, Y, adj, indexToSlot, isCamp } from '../../site/military-chess/src/core/board';
import { resolve } from '../../site/military-chess/src/core/combat';
import { isFlip, isMove, legalMoves, type Action, type Move } from '../../site/military-chess/src/core/movegen';
import { ENG, isMobileType } from '../../site/military-chess/src/core/pieces';
import type { GameState } from '../../site/military-chess/src/core/state';
import { onlyType, popcount, type Knowledge } from '../../site/military-chess/src/core/belief';

const VAL = [0, 10, 30, 14, 6, 9, 13, 18, 25, 35, 50, 70];

export function kidMove(s: GameState, rng: () => number, k: Knowledge | null, skill: 'A' | 'B'): Action | null {
  const legal = legalMoves(s);
  if (!legal.length) return null;
  if (s.mode === 'fan' && s.turn === -1) return legal[Math.floor(rng() * legal.length)];
  const me = s.turn;
  const known = (p: number): boolean => s.mode === 'ming' || (s.mode === 'fan' ? !!s.pup[p] : s.pside[p] === me || (!!k && popcount(k.mask[p]) === 1));
  const tKnown = (p: number): number => (s.mode === 'an' && s.pside[p] !== me ? onlyType(k!.mask[p]) : s.ptype[p]);
  const moves = legal.filter(isMove) as Move[];
  // 1) sure wins (incl. the flag)
  const sure = moves.filter((m) => m.kind === 'attack' && known(s.board[m.to]) && ['A', 'F'].includes(resolve(s.ptype[m.pid], tKnown(s.board[m.to]))));
  if (sure.length) return sure.sort((a, b) => VAL[tKnown(s.board[b.to])] - VAL[tKnown(s.board[a.to])])[0];
  // 2) B: avoid poking unmoved back-row pieces with big pieces
  let pool: Move[] = moves;
  if (skill === 'B') {
    pool = pool.filter((m) => {
      if (m.kind !== 'attack') return true;
      const d = s.board[m.to];
      const unmovedBack = s.mode === 'an' && !s.pmoved[d] && indexToSlot(s.pinit[d]).r >= 5;
      return !(unmovedBack && s.ptype[m.pid] >= 9);
    });
  }
  if (skill === 'B' && s.mode === 'an' && rng() < 0.3) {
    const sweep = pool.filter((m) => m.kind === 'attack' && s.ptype[m.pid] === ENG && !s.pmoved[s.board[m.to]] && indexToSlot(s.pinit[s.board[m.to]]).r >= 5);
    if (sweep.length) return sweep[Math.floor(rng() * sweep.length)];
  }
  // 2b) B in 明棋/翻翻棋: never attack a visible bigger piece; avoid stepping next to a visible piece that beats it
  if (skill === 'B' && s.mode !== 'an') {
    const beatsMe = (q: number, t: number): boolean => !!s.palive[q] && s.pside[q] !== me && (s.mode !== 'fan' || !!s.pup[q]) && isMobileType(s.ptype[q]) && ['A', 'B'].includes(resolve(s.ptype[q], t));
    const safe = pool.filter((m) => {
      if (m.kind === 'attack' && known(s.board[m.to]) && resolve(s.ptype[m.pid], tKnown(s.board[m.to])) === 'D') return false;
      if (m.kind === 'move' && !isCamp(m.to) && adj[m.to].some((n) => {
        const q = s.board[n];
        return q >= 0 && q !== m.pid && beatsMe(q, s.ptype[m.pid]) && s.ptype[m.pid] >= 5;
      })) return false;
      return true;
    });
    if (safe.length) pool = safe;
  }
  // 3) 翻翻棋: flip 45% of the time; B avoids flipping right next to its own big face-up pieces
  if (s.mode === 'fan' && rng() < 0.45) {
    let flips = legal.filter(isFlip);
    if (skill === 'B') {
      const f2 = flips.filter((m) => !adj[m.flip].some((n) => {
        const q = s.board[n];
        return q >= 0 && !!s.pup[q] && s.pside[q] === me && s.ptype[q] >= 8;
      }));
      if (f2.length) flips = f2;
    }
    if (flips.length) return flips[Math.floor(rng() * flips.length)];
  }
  const pokes = pool.filter((m) => m.kind === 'attack' && !known(s.board[m.to]) && s.ptype[m.pid] >= 5);
  if (pokes.length && rng() < (skill === 'B' ? 0.3 : 0.5)) return pokes[Math.floor(rng() * pokes.length)];
  const safeVisible = pool.filter((m) => !(m.kind === 'attack' && known(s.board[m.to]) && ['D', 'B'].includes(resolve(s.ptype[m.pid], tKnown(s.board[m.to])))));
  const fwd = safeVisible.filter((m) => m.kind === 'move' && (me === RED ? Y(m.to) < Y(m.from) : Y(m.to) > Y(m.from)));
  const src: Action[] = fwd.length && rng() < 0.6 ? fwd : safeVisible.length ? safeVisible : legal;
  return src[Math.floor(rng() * src.length)];
}
