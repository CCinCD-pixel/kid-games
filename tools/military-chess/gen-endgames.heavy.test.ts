/**
 * 残局 generator (spec §8.10 gen-endgames.heavy, §4.2, §11 V1/V2) on the real core.
 *   MC_HEAVY=1 npx vitest run -c tools/military-chess/vitest.heavy.config.ts gen-endgames
 * 1. Regression: the classifier re-derives every shipped endgame's declared idea from its stored main line
 *    AND from the line of its rebuilt reply book; no rejected features; 8 distinct ideas per tier.
 * 2. Generation: a seeded candidate run per tier (MC_GEN_TRIES, default 120) → solved, classified pool
 *    written to ~/kid-games-work/military-chess/endgame-pool-<tier>.json for review + curation (titles and
 *    "这关教什么" are written by hand). Tier 3 (将军残局, v2) is exercised with its need: ['blueThreat'].
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { buildBook, lineFromBook } from '../../site/military-chess/src/core/book';
import { FLAVOURS, IDEAS, IDEA_NAMES, TIERS, classify, countsOk, generate, pickDistinct, quickClassify, type Cand, type Idea } from './endgame-gen';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(os.homedir(), 'kid-games-work/military-chess');
type Shipped = Cand & { id: string; tier: number; idea: Idea; par: number; line: string[] };

describe.skipIf(!process.env.MC_HEAVY)('endgame generator (heavy)', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/military-chess/endgames.json'), 'utf8')).puzzles as Shipped[];

  test('the 16 shipped endgames re-classify to their declared ideas (stored line and rebuilt book line)', () => {
    expect(shipped.length).toBe(16);
    for (const e of shipped) {
      expect(countsOk(e), e.id).toBe(true);
      const a = classify(e, e.line);
      expect(a.idea, `${e.id} stored line (${a.feats.join(',')})`).toBe(e.idea);
      expect(a.reject, e.id).toEqual([]);
      const b = classify(e, lineFromBook(buildBook(e, e.par).root));
      expect(b.idea, `${e.id} book line`).toBe(e.idea);
    }
    for (const t of [1, 2]) {
      const ideas = shipped.filter((e) => e.tier === t).map((e) => e.idea);
      expect(new Set(ideas).size, `tier ${t}`).toBe(8);
    }
  });

  test('a seeded generation run per tier yields classified candidates (pools written for review)', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const tries = Number(process.env.MC_GEN_TRIES ?? 120);
    const report: string[] = [];
    for (const tier of ['1', '2', '3']) {
      const t0 = Date.now();
      const pool = [];
      const whyAll: Record<string, number> = {};
      for (const [name, flavour] of Object.entries(FLAVOURS)) {
        if (tier === '1' && name === 'raider') continue;
        const { got, why } = generate(tier, Math.ceil(tries / 4), 1, { flavour });
        for (const [k, v] of Object.entries(why)) whyAll[k] = (whyAll[k] ?? 0) + v;
        for (const e of got) {
          const c = quickClassify(e);
          if (c && !c.reject.length) pool.push({ ...c, flavour: name });
        }
      }
      const count: Partial<Record<Idea, number>> = {};
      for (const e of pool) count[e.idea] = (count[e.idea] ?? 0) + 1;
      const pick = pickDistinct(pool);
      fs.writeFileSync(path.join(OUT, `endgame-pool-${tier}.json`), JSON.stringify({ tier, name: TIERS[tier].name, tries, rejected: whyAll, ideas: count, pick: pick.map((e) => ({ seed: e.seed, flavour: e.flavour, idea: e.idea, ideaName: IDEA_NAMES[e.idea], red: e.red, blue: e.blue, par: e.par, first: e.first, line: e.line })), pool }, null, 1));
      const line = `tier ${tier} (${TIERS[tier].name}): ${pool.length} classified candidates, ideas ${JSON.stringify(count)}, distinct pick ${pick.length}, rejected ${JSON.stringify(whyAll)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`;
      console.log(line);
      report.push(line);
      for (const e of pool) {
        expect(IDEAS).toContain(e.idea);
        expect(e.par).toBe(TIERS[tier].par);
        if (tier === '3') expect(e.feats).toContain('blueThreat');
      }
      if (tier !== '3') expect(pool.length, `tier ${tier} pool`).toBeGreaterThan(0);
    }
    fs.writeFileSync(path.join(OUT, `gen-endgames-${new Date().toISOString().slice(0, 10)}.txt`), report.join('\n') + '\n');
  });
});
