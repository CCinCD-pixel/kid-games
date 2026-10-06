/**
 * New-chapter check (spec §4.9; named *.test.ts so the repo's vitest include picks it up — skipped unless SB_CH is set): V3 (N = 200 by default, NOVICE / KID / EXPERT with hooks + the NOVICE twin)
 * and V4 for one chapter of missions.json, on the production sim. Prints the same table as the full V3 run
 * and writes ~/kid-games-work/snake-battle/validate-v3-missions.json.
 *   SB_CH=6 npx vitest run site/snake-battle/tools/chapter-check.test.ts        (SB_N=60 for a quick look)
 */
import { it } from 'vitest';
import { MISSIONS } from '../src/sim/mission';

const ch = Number(process.env.SB_CH ?? 0);
if (ch) {
  if (!MISSIONS.some((m) => m.ch === ch)) throw new Error(`chapter-check: chapter ${ch} is not in missions.json (have ${[...new Set(MISSIONS.map((m) => m.ch))].join(', ')})`);
  process.env.SB_FULL = '1';
  process.env.SB_LEVELS = MISSIONS.filter((m) => m.ch === ch).map((m) => m.id).join(',');
  await import('../validate/content.test');
  await import('../validate/v3-missions.test');
} else it.skip('chapter-check (set SB_CH)', () => {});
