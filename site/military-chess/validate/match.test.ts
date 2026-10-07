import { describe, expect, test } from 'vitest';
import { createRng } from '@kit/rng';
import { BLUE, RED } from '../src/core/board';
import { legalMoves, isFlip } from '../src/core/movegen';
import { toNote } from '../src/core/notation';
import { encode, setupFan, setupStandard } from '../src/core/state';
import { createMatch, transition, type Effect, type MatchCtx, type MatchEvent } from '../src/ctrl/match';
import { matchFromSave } from '../src/ctrl/setup';
import { defaultSave, normalizeSave, openStore, type SavedMatch } from '../src/ctrl/save';
import { MemoryStorage } from '../../../tests/helpers/memory-storage';
import { P, T, pos } from './helpers';

function run(ctx: MatchCtx, ...evs: MatchEvent[]): { ctx: MatchCtx; fx: Effect[] } {
  const fx: Effect[] = [];
  for (const ev of evs) {
    const r = transition(ctx, ev);
    ctx = r.ctx;
    fx.push(...r.effects);
  }
  return { ctx, fx };
}
const commits = (fx: Effect[]) => fx.filter((e) => e.kind === 'commit').length;
const ming = () => createMatch('m1', setupStandard('ming', { red: T('balanced'), blue: T('fortress') }), ['human', 'ai']);

describe('match reducer: input lock and races (spec §3.10, §8.3)', () => {
  test('start → human idle with lock 0', () => {
    const { ctx, fx } = run(ming(), { type: 'start' });
    expect(ctx.phase).toBe('idle');
    expect(ctx.lock).toBe(0);
    expect(fx).toContainEqual({ kind: 'turn', player: 0, ai: false });
  });
  test('select own piece shows destinations; second tap on it deselects', () => {
    let { ctx, fx } = run(ming(), { type: 'start' }, { type: 'tap', at: P('a6') });
    expect(ctx.phase).toBe('selected');
    const sel = fx.find((e) => e.kind === 'select');
    expect(sel && sel.kind === 'select' && sel.moves.length).toBeGreaterThan(0);
    ({ ctx, fx } = run(ctx, { type: 'tap', at: P('a6') }));
    expect(ctx.phase).toBe('idle');
    expect(fx).toContainEqual({ kind: 'deselect' });
  });
  test('double tap on a destination (80–450 ms later) produces exactly one COMMIT', () => {
    const r = run(ming(), { type: 'start' }, { type: 'tap', at: P('a6') }, { type: 'tap', at: P('b5') }, { type: 'tap', at: P('b5') }, { type: 'tap', at: P('b5') });
    expect(commits(r.fx)).toBe(1);
    expect(r.ctx.phase).toBe('animating');
    expect(r.fx.filter((e) => e.kind === 'deadTap').length).toBe(2);
  });
  test('taps while the AI thinks change nothing (own piece, enemy piece, empty station)', () => {
    let { ctx } = run(ming(), { type: 'start' }, { type: 'tap', at: P('a6') }, { type: 'tap', at: P('b5') }, { type: 'animDone' });
    expect(ctx.phase).toBe('thinking');
    const before = encode(ctx.state);
    const r = run(ctx, { type: 'tap', at: P('b6') }, { type: 'tap', at: P('c7') }, { type: 'tap', at: P('c4') });
    expect(encode(r.ctx.state)).toBe(before);
    expect(r.fx.every((e) => e.kind === 'deadTap')).toBe(true);
    ctx = r.ctx;
    expect(ctx.deadTaps).toBe(3);
  });
  test('AI answer with a stale id is dropped; the matching one commits', () => {
    let { ctx } = run(ming(), { type: 'start' }, { type: 'tap', at: P('a6') }, { type: 'tap', at: P('b5') }, { type: 'animDone' });
    const a = legalMoves(ctx.state)[0];
    let r = run(ctx, { type: 'aiMove', id: 'old:1', note: toNote(a), action: a });
    expect(commits(r.fx)).toBe(0);
    r = run(ctx, { type: 'aiMove', id: ctx.thinkId!, note: toNote(a), action: a });
    expect(commits(r.fx)).toBe(1);
    // the same answer delivered twice commits once
    r = run(r.ctx, { type: 'aiMove', id: ctx.thinkId!, note: toNote(a), action: a });
    expect(commits(r.fx)).toBe(0);
    ctx = r.ctx;
  });
  test('restart while thinking: a fresh match ignores the old request', () => {
    const { ctx } = run(ming(), { type: 'start' }, { type: 'tap', at: P('a6') }, { type: 'tap', at: P('b5') }, { type: 'animDone' });
    const oldId = ctx.thinkId!;
    const fresh = run(createMatch('m2', setupStandard('ming', { red: T('balanced'), blue: T('fortress') }), ['human', 'ai']), { type: 'start' }).ctx;
    const a = legalMoves(fresh.state)[0];
    expect(commits(run(fresh, { type: 'aiMove', id: oldId, note: toNote(a), action: a }).fx)).toBe(0);
  });
  test('taps while an overlay holds the lock are dead taps', () => {
    const { ctx } = run(ming(), { type: 'start' }, { type: 'lock' });
    const r = run(ctx, { type: 'tap', at: P('a6') });
    expect(r.fx).toEqual([{ kind: 'deadTap', animating: false }]);
    expect(run(r.ctx, { type: 'unlock' }, { type: 'tap', at: P('a6') }).ctx.phase).toBe('selected');
  });
  test('first flip in 翻翻棋 hands the turn to the other colour; an immediate tap is a dead tap', () => {
    const s = setupFan(createRng('mc:fan:t').next);
    let { ctx, fx } = run(createMatch('f', s, ['human', 'human']), { type: 'start' });
    const flip = legalMoves(ctx.state).find(isFlip)!;
    ({ ctx, fx } = run(ctx, { type: 'tap', at: flip.flip }, { type: 'tap', at: flip.flip }));
    expect(commits(fx)).toBe(1);
    const colour = s.pside[s.board[flip.flip]];
    expect(ctx.state.colorOf[0]).toBe(colour);
    expect(ctx.state.turn).toBe(1 - colour);
    ({ ctx, fx } = run(ctx, { type: 'animDone' }));
    expect(fx).toContainEqual({ kind: 'turn', player: 1, ai: false });
  });
  test('illegal destination → deny with the reason; selection kept', () => {
    const { ctx, fx } = run(ming(), { type: 'start' }, { type: 'tap', at: P('b6') }, { type: 'tap', at: P('b7') });
    expect(fx).toContainEqual(expect.objectContaining({ kind: 'deny', why: 'mountain' }));
    expect(ctx.phase).toBe('selected');
  });
  test('E22: tapping an immobile own piece → deny immobile / hq', () => {
    const { fx } = run(ming(), { type: 'start' }, { type: 'tap', at: P('a1') });
    expect(fx).toContainEqual(expect.objectContaining({ kind: 'deny', why: 'immobile' }));
    const r = run(ming(), { type: 'start' }, { type: 'tap', at: P('d1') });
    expect(r.fx).toContainEqual(expect.objectContaining({ kind: 'deny', why: 'hq' }));
  });
  test('E23: drag drop on a legal station commits; on an illegal one denies', () => {
    const s = setupStandard('ming', { red: T('balanced'), blue: T('fortress') });
    const pid = s.board[P('a6')];
    const r1 = run(createMatch('d', s, ['human', 'human']), { type: 'start' }, { type: 'drop', pid, at: P('b5') });
    expect(commits(r1.fx)).toBe(1);
    const pidB = s.board[P('b6')];
    const r2 = run(createMatch('d', s, ['human', 'human']), { type: 'start' }, { type: 'drop', pid: pidB, at: P('b7') });
    expect(r2.fx).toContainEqual(expect.objectContaining({ kind: 'deny', why: 'mountain', drop: true }));
  });
  test('E19: a saved ladder game whose last move was the child\'s resumes with a fresh AI request', () => {
    const save: SavedMatch = {
      v: 1, id: 'e19', mode: 'ming', setup: { firstMover: RED, red: '527369B841371652M41BMFM32', blue: '234216571B835B9146M723MFM' }, actions: ['a6-b5'],
      opponent: { kind: 'ai', level: 4 }, kidSide: RED, kidSeat: 'near', tags: {},
      hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: true,
    };
    const { ctx, fx } = run(matchFromSave(save), { type: 'start' });
    expect(ctx.notes).toEqual(['a6-b5']);
    expect(ctx.phase).toBe('thinking');
    const think = fx.find((e) => e.kind === 'think');
    expect(think && think.kind === 'think' && encode(think.state)).toBe(encode(ctx.state));
  });
  test('E20: 暗棋 tap on an enemy hidden piece → info only (no selection, no identity)', () => {
    const s = setupStandard('an', { red: T('balanced'), blue: T('fortress') });
    const { ctx, fx } = run(createMatch('e20', s, ['human', 'ai']), { type: 'start' }, { type: 'tap', at: P('c7') });
    expect(fx).toContainEqual({ kind: 'info', pid: s.board[P('c7')] });
    expect(fx.some((e) => e.kind === 'select')).toBe(false);
    expect(ctx.phase).toBe('idle');
  });
  test('E21: 翻翻棋 tap on an enemy face-up piece → its name only, not selected', () => {
    const s0 = setupFan(createRng('e21').next);
    let ctx = run(createMatch('e21', s0, ['human', 'human']), { type: 'start' }).ctx;
    const flip = legalMoves(ctx.state).find(isFlip)!;
    ctx = run(ctx, { type: 'tap', at: flip.flip }, { type: 'animDone' }).ctx;
    const st = ctx.state;
    const me = st.turn;
    const foe = [...Array(st.np).keys()].find((p) => st.palive[p] && st.pside[p] !== me && !st.pup[p])!;
    st.pup[foe] = 1; // the foe piece is turned up (as after the other side's flip)
    const r = run(ctx, { type: 'tap', at: st.ppos[foe] });
    expect(r.fx).toContainEqual({ kind: 'info', pid: foe });
    expect(r.fx.some((e) => e.kind === 'select')).toBe(false);
  });
  test('E4: last mobile piece into own HQ asks first; "no" keeps the position', () => {
    const s = pos({ b2: 'r5', a1: 'rM', c1: 'rM', d1: 'rF', e7: 'b4', b12: 'bF' });
    let { ctx, fx } = run(createMatch('h', s, ['human', 'human']), { type: 'start' }, { type: 'tap', at: P('b2') }, { type: 'tap', at: P('b1') });
    expect(ctx.phase).toBe('confirm');
    expect(fx.some((e) => e.kind === 'coach' && e.alert.code === 'C5')).toBe(true);
    ({ ctx, fx } = run(ctx, { type: 'confirm', yes: false }));
    expect(ctx.phase).toBe('idle');
    expect(commits(fx)).toBe(0);
    ({ ctx, fx } = run(ctx, { type: 'tap', at: P('b2') }, { type: 'tap', at: P('b1') }, { type: 'confirm', yes: true }));
    expect(commits(fx)).toBe(1);
  });
  test('undo (明棋 vs AI): back to before the child\'s last move, AI reply included', () => {
    let { ctx } = run(ming(), { type: 'start' }, { type: 'tap', at: P('a6') }, { type: 'tap', at: P('b5') }, { type: 'animDone' });
    const a = legalMoves(ctx.state).find((m) => 'kind' in m && m.kind === 'move')!;
    ({ ctx } = run(ctx, { type: 'aiMove', id: ctx.thinkId!, note: toNote(a), action: a }, { type: 'animDone' }));
    expect(ctx.notes.length).toBe(2);
    const r = run(ctx, { type: 'undo', player: 0 });
    expect(r.ctx.notes.length).toBe(0);
    expect(r.ctx.state.turn).toBe(RED);
    expect(r.ctx.phase).toBe('idle');
    expect(r.ctx.undos).toBe(1);
  });
  test('agreed draw ends the match', () => {
    const { ctx, fx } = run(createMatch('x', setupStandard('ming', { red: T('balanced'), blue: T('fortress') }), ['human', 'human']), { type: 'start' }, { type: 'agreeDraw' });
    expect(ctx.phase).toBe('ended');
    expect(fx).toContainEqual({ kind: 'end', result: { winner: -1, reason: 'agreed' } });
  });
  test('resume: replaying the saved notes reproduces the exact position', () => {
    const save: SavedMatch = {
      v: 1, id: 'abc', mode: 'fan', setup: { firstMover: RED, fanSeed: 'mc:fan:abc' }, actions: [],
      opponent: { kind: 'family', seating: 'side', names: ['小步步', '爸爸'] }, kidSide: RED, kidSeat: 'near', tags: {},
      hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false,
    };
    let ctx = run(matchFromSave(save), { type: 'start' }).ctx;
    const rng = createRng('drive');
    for (let i = 0; i < 40 && !ctx.state.result; i++) {
      const ms = legalMoves(ctx.state);
      const a = ms[Math.floor(rng.next() * ms.length)];
      const at = isFlip(a) ? a.flip : (a as { from: number }).from;
      if (isFlip(a)) ctx = run(ctx, { type: 'tap', at }).ctx;
      else ctx = run(ctx, { type: 'tap', at }, { type: 'tap', at: (a as { to: number }).to }).ctx;
      ctx = run(ctx, { type: 'animDone' }).ctx;
    }
    const restored = matchFromSave({ ...save, actions: ctx.notes });
    expect(encode(restored.state)).toBe(encode(ctx.state));
    expect(restored.notes).toEqual(ctx.notes);
  });
});

describe('save', () => {
  test('defaults load; partial saves are normalized; round trip through the kit store', () => {
    const store = openStore(new MemoryStorage());
    const d = store.load();
    expect(d).toEqual(defaultSave());
    store.update((s) => {
      s.family.games = 3;
    });
    expect(store.load().family.games).toBe(3);
    const n = normalizeSave({ rank: 2, family: { games: 1 } });
    expect(n.rank).toBe(2);
    expect(n.family.dadName).toBe('爸爸');
    expect(n.settings.numberBadges).toBe(true);
    expect(normalizeSave(null)).toEqual(defaultSave());
  });
  test('a partial same-version (v1) envelope loads normalized through openStore (QA r1)', () => {
    const mem = new MemoryStorage();
    const partial = JSON.parse(JSON.stringify(defaultSave()));
    delete partial.lastLayout;
    delete partial.settings.familyQuiet;
    delete partial.settings.shuttleMax;
    delete partial.family.log;
    delete partial.family.firstMover;
    delete partial.family.lastAttacker;
    delete partial.firstRun.seenCmpButtons;
    partial.family.games = 4;
    // write the partial v1 envelope under whatever key the kit uses (probed from a real save)
    const probe = new MemoryStorage();
    openStore(probe).update((s) => void (s.family.games = 1));
    for (let i = 0; i < probe.length; i++) mem.setItem(probe.key(i)!, JSON.stringify({ ...JSON.parse(probe.getItem(probe.key(i)!)!), v: 1, data: partial }));
    const s = openStore(mem).load();
    expect(s.family.games).toBe(4);
    const d = defaultSave();
    expect(s.settings.shuttleMax).toBe(d.settings.shuttleMax);
    expect(s.settings.familyQuiet).toBe(d.settings.familyQuiet);
    expect(s.family.log).toEqual(d.family.log);
    expect(s.family.firstMover).toEqual(d.family.firstMover);
    expect(s.family.lastAttacker).toEqual(d.family.lastAttacker);
    expect(s.lastLayout).toEqual(d.lastLayout);
    expect(s.firstRun.seenCmpButtons).toBe(false);
  });
  test('BLUE constant sanity', () => expect(BLUE).toBe(1));
});

describe('家规 fanFlagRule is family-only: robot (ladder) 翻翻棋 always keeps the standard mine lock (dad 2026-10-07)', () => {
  test('easy house rule does not reach ladder 翻翻棋; standard stays standard', async () => {
    const { newLadderMatch } = await import('../src/ctrl/ladder');
    const { startState } = await import('../src/ctrl/setup');
    const save = defaultSave();
    expect(save.settings.fanFlagRule).toBe('standard');
    save.settings.fanFlagRule = 'easy';
    for (const level of [1, 2, 3, 4] as const) {
      const m = newLadderMatch(save, 'fan', level);
      expect(m.house?.fanFlagLock ?? true).toBe(true);
      expect(startState(m).rules.fanFlagLock).toBe(true);
    }
    expect(newLadderMatch(save, 'ming', 1).house?.fanFlagLock ?? true).toBe(true);
    save.settings.fanFlagRule = 'standard';
    expect(startState(newLadderMatch(save, 'fan', 3)).rules.fanFlagLock).toBe(true);
  });
});

describe('save robustness: malformed fields never brick boot (QA r3)', () => {
  test('wrong-typed fields fall back to their defaults', () => {
    const d = defaultSave();
    const n = normalizeSave({
      items: null, cards: null, rank: 'x', family: 7, ladder: { fan: { wins: 'no', unlocked: '3' } },
      settings: { music: 'loud', shuttleMax: NaN }, deployments: [1, 2], resume: { id: 'r' }, puzzleResume: 5, tagStats: [],
    });
    expect(n.items).toEqual({});
    expect(n.cards).toEqual([]);
    expect(n.rank).toBe(-1);
    expect(n.family).toEqual(d.family);
    expect(n.ladder.fan.wins).toEqual([0, 0, 0, 0]);
    expect(n.ladder.fan.unlocked).toBe(1);
    expect(n.settings.music).toBe(true);
    expect(n.settings.shuttleMax).toBe(d.settings.shuttleMax);
    expect(n.deployments).toEqual([null, null, null]);
    expect(n.resume).toBeNull();
    expect(n.puzzleResume).toBeNull();
    expect(n.tagStats).toEqual(d.tagStats);
  });
  test('valid values and record entries survive; bad entries are dropped', () => {
    const n = normalizeSave({ items: { 'L1-1': { stars: 3 }, bad: null }, cards: ['c1', 4], ladder: { ming: { wins: [1, 2, 0, 0] } }, settings: { music: false } });
    expect(Object.keys(n.items)).toEqual(['L1-1']);
    expect(n.cards).toEqual(['c1']);
    expect(n.ladder.ming.wins).toEqual([1, 2, 0, 0]);
    expect(n.settings.music).toBe(false);
  });
});
