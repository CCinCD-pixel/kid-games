/**
 * The match hint (💡, spec §5.1, §9.5, §8.10 hint.test): the dedicated hint level has no randomness —
 * the same position always gets the same hint (明棋 / 翻翻棋: whatever the seed; 暗棋: the seed is
 * the fixed `mc:hint:<matchId>:<ply>`), it takes a sure flag capture, and it does not hand the
 * opponent the flag.
 */
import { describe, expect, test } from 'vitest';
import { RED } from '../src/core/board';
import { newKnowledge } from '../src/core/belief';
import { hintCfg } from '../src/ai/levels';
import { parseNote } from '../src/core/notation';
import { redact } from '../src/core/redact';
import { apply } from '../src/core/rules';
import { legalMoves } from '../src/core/movegen';
import { think } from '../src/ai/think';
import { P, pos } from './helpers';

describe('match hint', () => {
  test('the hint level is the strongest level without randomness', () => {
    for (const mode of ['ming', 'fan', 'an'] as const) {
      const c = hintCfg(mode);
      expect(c.temp).toBe(0);
      expect(c.topK).toBe(1);
      expect(c.overlook).toBe(0);
      expect(c.wander).toBe(0);
      expect(c.samples).toBe(mode === 'an' ? 8 : 1);
    }
  });

  test('明棋 / 翻翻棋: the same position gets the same hint whatever the seed', () => {
    const ming = pos({ a6: 'r7', c6: 'r5', b1: 'rF', a7: 'b4', c8: 'b9', d12: 'bF', a12: 'bM' });
    const fan = pos({ a6: 'r7^', c6: 'r5^', b1: 'rF^', a7: 'b4^', c8: 'b9', d12: 'bF', a12: 'bM', e3: 'r2' }, { mode: 'fan' });
    for (const s of [ming, fan]) {
      const v = redact(s, RED, null);
      const hints = ['a', 'b', 'c', 'd'].map((seed) => think({ view: v, level: 'hint', seed }).note);
      expect(new Set(hints).size).toBe(1);
    }
  });

  test('暗棋: the hint uses the child\'s own belief (8 worlds) and the fixed seed → stable', () => {
    const s = pos({ a6: 'r7', c6: 'r5', b1: 'rF', a7: 'b4', c8: 'b9', d12: 'bF', a12: 'bM', b12: 'b3' }, { mode: 'an' });
    const v = redact(s, RED, newKnowledge(s, RED));
    const a = think({ view: v, level: 'hint', seed: 'mc:hint:m1:0' }).note;
    const b = think({ view: v, level: 'hint', seed: 'mc:hint:m1:0' }).note;
    expect(a).toBe(b);
  });

  test('takes a sure flag capture', () => {
    const s = pos({ d11: 'r2', c6: 'r9', b1: 'rF', d12: 'bF', c12: 'bM', e12: 'bM', a9: 'b8' });
    expect(think({ view: redact(s, RED, null), level: 'hint', seed: 'x' }).note).toBe('d11xd12');
  });

  test('never leaves the flag to a capture when a defence exists (明棋)', () => {
    // BLUE's 排长 at a1 threatens the flag at b1; RED's 团长 at a2 can take it
    const s = pos({ b1: 'rF', a2: 'r5', e6: 'r3', a1: 'b2', d12: 'bF', c9: 'b7' });
    const note = think({ view: redact(s, RED, null), level: 'hint', seed: 'x' }).note;
    const after = apply(s, parseNote(s, note)!).state;
    const blue = legalMoves(after);
    const flagAt = P('b1');
    expect(blue.some((m) => 'to' in m && m.to === flagAt)).toBe(false);
    expect(note).toBe('a2xa1');
  });
});
