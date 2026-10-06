/**
 * Collision resolution (spec §3.6 R6.2). Returns
 *   'A' attacker wins (defender removed, attacker moves in)
 *   'D' defender wins (attacker removed)
 *   'B' both removed
 *   'F' flag captured (game over)
 */
import { BOMB, ENG, FLAG, MINE, rankOf } from './pieces';

export type Outcome = 'A' | 'D' | 'B' | 'F';

export function resolve(att: number, def: number): Outcome {
  if (def === FLAG) return 'F';
  if (att === BOMB || def === BOMB) return 'B';
  if (def === MINE) return att === ENG ? 'A' : 'D';
  if (att === MINE || att === FLAG) throw new Error('immobile attacker');
  const ra = rankOf(att), rd = rankOf(def);
  return ra > rd ? 'A' : ra < rd ? 'D' : 'B';
}
