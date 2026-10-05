import { describe, expect, it } from 'vitest';
import type { HubEntry } from 'virtual:kg-registry';
import type { SessionRecord } from '@kit/log';
import { cardProgress, greetingId, greetingSlot, initialPlace, isNew, pickContinue, pickSuggestion, playCounts, seenKey } from '../../site/_hub/state';

const entry = (id: string, place: HubEntry['place'], status: HubEntry['status'] = 'live', extra: Partial<HubEntry> = {}): HubEntry => ({
  id, title: id, subtitle: '', place, order: 0, status, accent: '#000', icon: `/icons/games/${id}.svg`, href: `/${id}/`, domains: ['number'], parentNote: '', ...extra,
});
const sess = (game: string, lastBeat: number, activeMs = 60_000): SessionRecord => ({ id: `${game}${lastBeat}`, game, source: 'hub', start: lastBeat - activeMs, lastBeat, activeMs, events: [] });

const reg = [entry('mars-base', 'base'), entry('moon-builder', 'base'), entry('story-box', 'base', 'wip'), entry('snake-battle', 'playground'), entry('sokoban', 'classic')];
const all = new Set(reg.map((e) => e.id));

describe('hub: 继续 / 推荐 / NEW (plan §4.1)', () => {
  it('继续 = the most recent real play among enterable games; hub visits and 2-second peeks do not count', () => {
    const s = [sess('sokoban', 100), sess('hub', 500), sess('snake-battle', 300), sess('mars-base', 400, 2_000)];
    expect(pickContinue(s, all)).toBe('snake-battle');
    expect(pickContinue(s, new Set(['sokoban']))).toBe('sokoban');
    expect(pickContinue([], all)).toBeNull();
  });

  it('推荐 rotates daily through live 基地 games only, never the 继续 card or a rest-area game', () => {
    const days = [0, 1, 2, 3].map((d) => pickSuggestion(reg, all, null, d));
    expect(new Set(days)).toEqual(new Set(['mars-base', 'moon-builder']));
    expect(pickSuggestion(reg, all, 'mars-base', 0)).toBe('moon-builder');
    expect(pickSuggestion([entry('snake-battle', 'playground'), entry('story-box', 'base', 'wip')], all, null, 0)).toBeNull();
  });

  it('NEW only for a declared content drop the child has not opened yet', () => {
    const e = entry('mars-base', 'base', 'live', { newContent: { id: 'ch2', label: '新章节' } });
    expect(isNew(e, new Set())).toBe(true);
    expect(isNew(e, new Set([seenKey(e)]))).toBe(false);
    expect(isNew(entry('mars-base', 'base'), new Set())).toBe(false);
    expect(isNew({ ...e, status: 'wip' }, new Set())).toBe(false);
  });
});

describe('hub: card progress lines', () => {
  it('prefers what the game reported, then legacy saves, then play count', () => {
    const hub = { 'mars-base': { label: '第 2 章', value: 0.4, updatedAt: 1 } };
    expect(cardProgress(reg[0], hub, {}, 3)).toEqual({ label: '第 2 章', value: 0.4 });
    expect(cardProgress(reg[4], {}, { sokoban: { best: { 0: 10, 1: 20, 2: 30 }, unlocked: 3 } }, 9)).toEqual({ label: '已过 3/10 关', value: 0.3 });
    expect(cardProgress(reg[3], {}, {}, 2)).toEqual({ label: '玩过 2 次' });
    expect(cardProgress(reg[3], {}, {}, 0)).toEqual({ label: '等你出发' });
    expect(cardProgress(reg[2], hub, {}, 5)).toBeNull(); // wip: the card shows 建造中 instead
  });

  it('counts plays of at least 5 s', () => {
    expect(playCounts([sess('a', 1), sess('a', 2), sess('a', 3, 1000), sess('b', 4)])).toEqual({ a: 2, b: 1 });
  });
});

describe('hub: greeting and first tab', () => {
  it('greets by time of day, welcomes back, and drops the name when the parent set another one', () => {
    expect([4, 5, 11, 12, 17, 18, 23].map(greetingSlot)).toEqual(['evening', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
    expect(greetingId(9, false, true)).toBe('hub.hello.morning');
    expect(greetingId(9, false, false)).toBe('hub.hello.morning.plain');
    expect(greetingId(20, true, true)).toBe('hub.back');
  });

  it('opens the remembered tab, else the 继续 card\'s place, else the first place with a live card', () => {
    expect(initialPlace(reg, all, null, 'classic')).toBe('classic');
    expect(initialPlace(reg, all, 'snake-battle')).toBe('playground');
    expect(initialPlace(reg, all, null)).toBe('base');
    expect(initialPlace([entry('x', 'base', 'wip'), entry('y', 'playground')], new Set(['x', 'y']), null)).toBe('playground');
  });
});
