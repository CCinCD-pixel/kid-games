/**
 * 不偷看 (spec §8.5, review B5; §8.10 ai-nopeek.test): 200 positions per hidden-information mode
 * (暗棋, 翻翻棋) from seeded games. In each, the hidden identities are re-dealt in a way the
 * public information allows (暗棋: a fresh assignment consistent with the side's knowledge; 翻翻棋:
 * the face-down pieces shuffled within the public multiset). The public view must be byte-for-byte
 * the same and the AI (`think`, level 3) and the hint (`think`, hint level) must choose the same move.
 */
import { describe, expect, test } from 'vitest';
import { createRng } from '@kit/rng';
import { BLUE, RED, type Side } from '../src/core/board';
import { ALL, beliefInput, bit, newKnowledge, observe, sampleAssignment, type Knowledge } from '../src/core/belief';
import { LAYOUT_STYLES, aiLayout } from '../src/core/layout';
import { legalMoves } from '../src/core/movegen';
import { MARSHAL } from '../src/core/pieces';
import { redact } from '../src/core/redact';
import { apply } from '../src/core/rules';
import { clone, setupFan, setupStandard, type GameState } from '../src/core/state';
import { think } from '../src/ai/think';

interface Sample {
  s: GameState;
  k: Knowledge | null;
  me: Side;
}

/** seeded games with a light random policy (captures preferred), sampled every few plies */
function positions(mode: 'an' | 'fan', want: number): Sample[] {
  const out: Sample[] = [];
  for (let g = 0; out.length < want && g < 400; g++) {
    const rng = createRng(`nopeek:${mode}:${g}`);
    let s = mode === 'fan'
      ? setupFan(createRng(`nopeek:fan:${g}`).next, { endByCount: true }, 0)
      : setupStandard('an', { red: aiLayout(LAYOUT_STYLES.plain, createRng(`np:r:${g}`).next), blue: aiLayout(LAYOUT_STYLES.veteran, createRng(`np:b:${g}`).next), rules: { endByCount: true } });
    const know: [Knowledge, Knowledge] | null = mode === 'an' ? [newKnowledge(s, RED), newKnowledge(s, BLUE)] : null;
    const stop = 6 + Math.floor(rng.next() * 60);
    for (let ply = 0; ply < stop && !s.result; ply++) {
      const acts = legalMoves(s);
      if (!acts.length) break;
      const caps = acts.filter((a) => 'kind' in a && a.kind === 'attack');
      const a = caps.length && rng.next() < 0.5 ? caps[Math.floor(rng.next() * caps.length)] : acts[Math.floor(rng.next() * acts.length)];
      const { state, event } = apply(s, a);
      if (know) for (const k of know) observe(k, s, event);
      s = state;
    }
    if (s.result || s.turn === -1) continue;
    const me = s.turn as Side;
    out.push({ s, k: know ? know[me] : null, me });
  }
  return out;
}

/** 暗棋: the enemy's identities re-assigned within what `me` knows (dead 司令 only if its flag is shown) */
function reassign(x: Sample, seed: string): GameState {
  const s = clone(x.s);
  s.ptype = x.s.ptype.slice();
  const enemy = (1 - x.me) as Side;
  const inp = beliefInput(x.k!, s);
  inp.masks = inp.masks.map((m, i) => {
    const p = inp.pieces[i];
    let mm = m;
    if (!s.palive[p] && !s.flagShown[enemy]) mm &= ~bit(MARSHAL);
    if (s.palive[p] && s.flagShown[enemy]) mm &= ~bit(MARSHAL);
    return mm || ALL;
  });
  const rng = createRng(seed);
  const a = sampleAssignment(inp, () => rng.next());
  for (const [p, t] of a) s.ptype[p] = t;
  return s;
}

/** 翻翻棋: shuffle (side, type) among the face-down pieces */
function shuffleDown(x: Sample, seed: string): GameState {
  const s = clone(x.s);
  s.ptype = x.s.ptype.slice();
  s.pside = x.s.pside.slice();
  const down: number[] = [];
  for (let p = 0; p < s.np; p++) if (s.palive[p] && !s.pup[p]) down.push(p);
  const ids = down.map((p) => [s.pside[p], s.ptype[p]] as const);
  createRng(seed).shuffle(ids);
  down.forEach((p, i) => {
    s.pside[p] = ids[i][0];
    s.ptype[p] = ids[i][1];
  });
  return s;
}

const BUDGET = { nodes: 500, ms: 10_000 };

describe('ai-nopeek (§8.5)', () => {
  for (const mode of ['an', 'fan'] as const) {
    test(`${mode}: 200 positions — re-dealt hidden identities give the same public view and the same AI / hint move`, () => {
      const xs = positions(mode, 200);
      expect(xs.length).toBe(200);
      let diffs = 0;
      xs.forEach((x, i) => {
        const v1 = redact(x.s, x.me, x.k);
        const other = mode === 'an' ? reassign(x, `re:${i}`) : shuffleDown(x, `sh:${i}`);
        const v2 = redact(other, x.me, x.k);
        expect(JSON.stringify(v2), `view ${mode} #${i}`).toBe(JSON.stringify(v1));
        // think on every position, the (slower) hint level on every second one
        for (const level of (i % 2 ? [3] : [3, 'hint']) as Array<3 | 'hint'>) {
          const seed = `mc:ai:nopeek:${i}`;
          const a = think({ view: v1, level, seed, budget: BUDGET }).note;
          const b = think({ view: v2, level, seed, budget: BUDGET }).note;
          if (a !== b) diffs++;
        }
      });
      expect(diffs).toBe(0);
    }, 30_000);
  }
});
