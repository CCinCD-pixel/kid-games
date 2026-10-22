import { expect, it } from 'vitest';
import { compactHistory, reviseAttempt } from './history';
import { initialSave, recordAttempt, schedule } from './learning';
import { bank } from './content';
import type { Attempt } from './types';

function archive() {
  const data = new Map<string, Attempt>();
  return {
    data,
    put: async (rows: Attempt[]) => {
      rows.forEach((a) => data.set(a.id, structuredClone(a)));
    },
    all: async () => [...data.values()].map((a) => structuredClone(a)),
  };
}
function year() {
  const save = initialSave();
  for (let session = 1; session <= 365; session++) {
    save.sessions = session;
    for (const kind of ['E', 'F'] as const)
      recordAttempt(save, {
        id: `${session}:${kind}`,
        session,
        at: session * 1000,
        kind,
        skill: `word:li:${kind === 'E' ? 'decode' : 'spell'}`,
        correct: session !== 340,
        judge: 'deterministic',
      });
  }
  return save;
}

it('keeps sixty sessions in the shared save and preserves scheduling and mastery state', async () => {
  const save = year(),
    full = structuredClone(save),
    storage = archive();
  expect(await compactHistory(save, storage)).toBe(true);
  expect(save.history).toHaveLength(120);
  expect(storage.data.size).toBe(610);
  expect(save.atoms).toEqual(full.atoms);
  expect(schedule(save, bank, 'today')).toEqual(schedule(full, bank, 'today'));
  // New answers must start from the checkpoint, not erase all earlier learning.
  const a: Attempt = {
    id: '366:E',
    session: 366,
    kind: 'E',
    skill: 'word:li:decode',
    correct: true,
    judge: 'parent',
  };
  recordAttempt(save, a);
  recordAttempt(full, a);
  expect(save.atoms).toEqual(full.atoms);
});

it('replays an old recording correction chronologically after its session was folded', async () => {
  const save = year(),
    full = structuredClone(save),
    storage = archive();
  await compactHistory(save, storage);
  const a: Attempt = { ...full.history.find((a) => a.id === '12:E')!, correct: false, judge: 'parent' };
  await reviseAttempt(save, a, storage);
  recordAttempt(full, a);
  expect(save.atoms).toEqual(full.atoms);
  expect(save.confusions).toEqual(full.confusions);
  expect(save.history).toHaveLength(120);
  expect(storage.data.get(a.id)?.judge).toBe('parent');
});

it('retains the original save when archiving fails', async () => {
  const save = year(),
    before = structuredClone(save);
  await expect(
    compactHistory(save, {
      put: async () => {
        throw new Error('quota');
      },
      all: async () => [],
    }),
  ).rejects.toThrow('quota');
  expect(save).toEqual(before);
});

it('does not fold an attempt changed while its archive write is pending', async () => {
  const save = year(),
    storage = archive();
  const changed = { ...save.history[0], correct: false, judge: 'parent' as const };
  const put = storage.put;
  storage.put = async (rows) => {
    await put(rows);
    recordAttempt(save, changed);
  };
  expect(await compactHistory(save, storage)).toBe(false);
  expect(save.history.find((a) => a.id === changed.id)?.correct).toBe(false);
  expect(save.snapshot).toBeUndefined();
});
