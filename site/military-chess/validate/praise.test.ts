/** Process praise is matched to the situation (QA r1 major: lines were picked by id length). */
import { describe, expect, test } from 'vitest';
import { ALL_ITEMS, ENDGAMES, lessonOf, type BoardItem } from '../src/content';
import { PRAISE_ALLOWED, praiseLine, type PraiseCtx } from '../src/core/praise';

const kindOf = (t: string): PraiseCtx['kind'] => (t === 'deploy' || t === 'deploy-full' ? 'deploy' : (t as PraiseCtx['kind']));

describe('process praise', () => {
  test('every item type hears only a line from its allowed set (any moves / rail / retry)', () => {
    let n = 0;
    for (const it of ALL_ITEMS) {
      const kind = kindOf(it.type);
      for (const retried of [false, true]) {
        if (it.type === 'board') {
          const b = it as BoardItem;
          for (const rail of [false, true])
            for (const moves of [b.par, b.par + 1]) {
              const line = praiseLine({ kind: 'board', goal: b.goal.kind, guard: b.goal.guard, lesson: lessonOf(b.id)?.id, moves, par: b.par, rail, retried });
              expect(PRAISE_ALLOWED.board, `${b.id}`).toContain(line);
              n++;
            }
        } else {
          const line = praiseLine({ kind, retried } as PraiseCtx);
          expect(PRAISE_ALLOWED[kind], `${it.id}`).toContain(line);
          n++;
        }
      }
    }
    for (const e of ENDGAMES) expect(PRAISE_ALLOWED.board).toContain(praiseLine({ kind: 'board', goal: e.goal.kind, guard: e.goal.guard, moves: 3, par: 3, rail: false, retried: false }));
    expect(n).toBeGreaterThan(150);
  });

  test('situations map to the right line', () => {
    const board = (o: Partial<Extract<PraiseCtx, { kind: 'board' }>>) => praiseLine({ kind: 'board', goal: 'capture', moves: 1, par: 1, rail: false, retried: false, ...o });
    expect(board({})).toBe('mc.ok.3'); // first-try capture: the right piece
    expect(board({ goal: 'flag' })).toBe('mc.ok.3');
    expect(board({ rail: true })).toBe('mc.ok.2');
    expect(board({ goal: 'reach', moves: 3, par: 3 })).toBe('mc.ok.4');
    expect(board({ goal: 'reach', moves: 4, par: 3 })).toBe('mc.ok.1');
    expect(board({ goal: 'survive', guard: 'flag' })).toBe('mc.ok.5');
    expect(board({ lesson: 'L6' })).toBe('mc.ok.5');
    expect(board({ retried: true })).toBe('mc.ok.8');
    expect(praiseLine({ kind: 'infer', retried: false })).toBe('mc.ok.6');
    expect(praiseLine({ kind: 'deploy', retried: true })).toBe('mc.ok.7');
    // the deploy line and the "changed approach" line never reach a first-try board / card
    for (const k of ['order', 'compare', 'infer', 'scene'] as const) expect(['mc.ok.7', 'mc.ok.8']).not.toContain(praiseLine({ kind: k, retried: false }));
  });

  test('the shipped capture items praise the piece, not the deploy rules', () => {
    const caps = ALL_ITEMS.filter((i): i is BoardItem => i.type === 'board' && i.goal.kind === 'capture' && lessonOf(i.id)?.id !== 'L6');
    expect(caps.length).toBeGreaterThan(3);
    for (const b of caps) expect(praiseLine({ kind: 'board', goal: 'capture', lesson: lessonOf(b.id)?.id, moves: b.par, par: b.par, rail: false, retried: false })).toMatch(/^mc\.ok\.[34]$/);
  });
});
