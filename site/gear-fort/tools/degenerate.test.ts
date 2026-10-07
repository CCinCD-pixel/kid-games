// V21 (spec §9.1): each level × 14 degenerate bots × N seeds — the 2★ rate (win with ≤ 2 檑木) must stay inside the
// level type's R band (tutorials exempt, as in proto/v1/degenerate.mjs). 1★ "scrapes" carried by ≥ 3 檑木 are only
// reported. GF_FULL=1 runs N = 20 like the prototype (writes ~/kid-games-work/reports/gear-fort/degenerate-v<vol>.json);
// the default run is a 3-seed smoke of the same code.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSim, step } from '../src/lane/sim';
import { levelFor } from '../src/bots/run';
import { makeDegenerate, DEGENERATE } from '../src/bots/degenerate';
import { LEVELS, CAMPAIGN } from '../src/content';
import BANDS from '../../../content/gear-fort/bands.json';

const FULL = !!process.env.GF_FULL; const VOL = +(process.env.GF_VOL || 1); const N = FULL ? 20 : 3;
const TYPE = (BANDS as unknown as { TYPE: Record<string, { R: [number, number] }> }).TYPE;

describe(`V21 degenerate strategies, volume ${VOL} (N=${N})`, () => {
  it('no degenerate bot earns 2★ above the R band', () => {
    const out: Record<string, Record<string, number>> = {}; const bad: string[] = []; const notes: string[] = [];
    for (const id of CAMPAIGN.volumes[VOL - 1].levels) {
      const type = LEVELS[id].type!; const hi = TYPE[type].R[1]; const row: Record<string, number> = {};
      for (const kind of DEGENERATE) {
        let w = 0, n = 0, two = 0;
        for (let s = 1; s <= N; s++) {
          const lv = levelFor(LEVELS[id], 'R', s); const deck = lv.belt ? lv.belt.seq : lv.loadout || []; const card = kind.split(':')[1];
          if (card && !deck.includes(card)) break; if (kind === 'wall' && !deck.includes('wall')) break; if (kind === 'econ' && !deck.includes('farm') && !deck.includes('bank')) break;
          const S = createSim(lv, s); const b = makeDegenerate(lv, s, kind);
          while (!S.result && S.tick < 20 * 60 * 12) step(S, b(S));
          n++; if (S.result === 'win') { w++; if ((S.stats.logsUsed || 0) <= 2) two++; }
        }
        if (!n) continue; const pc = Math.round((100 * w) / n); const p2 = Math.round((100 * two) / n); row[kind] = pc; row[kind + '·2★'] = p2;
        if (p2 > hi && type !== 'tutorial') bad.push(`${id} ${kind} 2★ ${p2}% (win ${pc}%) > R band ${hi}%`);
        else if (pc > hi && type !== 'tutorial') notes.push(`${id} ${kind} wins ${pc}% only with ≥3 檑木 (2★ ${p2}%)`);
      }
      out[id] = row;
    }
    if (FULL) { const dir = path.join(os.homedir(), 'kid-games-work/reports/gear-fort'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `degenerate-v${VOL}.json`), JSON.stringify({ out, notes, bad }, null, 1)); }
    expect(bad).toEqual([]);
  }, 600_000);
});
