import { initialSave, rebuildAtoms, recordAttempt } from './learning';
import type { Attempt, Save } from './types';

export interface HistoryArchive {
  put(rows: Attempt[]): Promise<void>;
  all(): Promise<Attempt[]>;
}

// Keep the shared localStorage small. Detailed older attempts remain in this
// game's IndexedDB so a late parent correction can still be replayed in order.
export async function compactHistory(save: Save, archive: HistoryArchive): Promise<boolean> {
  const through = save.sessions - 60;
  const older = save.history.filter((a) => a.session <= through);
  if (!older.length) return false;
  await archive.put(older);
  // A correction or another answer may arrive while IndexedDB is committing.
  // Keep the live history in that case; the next save will retry its new values.
  if (
    save.history.filter((a) => a.session <= through).length !== older.length ||
    older.some((a) => !save.history.includes(a))
  )
    return false;
  const prefix = initialSave();
  prefix.snapshot = save.snapshot;
  prefix.history = older;
  rebuildAtoms(prefix);
  const seen = { ...save.snapshot?.seen };
  for (const a of older) seen[a.skill] = (seen[a.skill] ?? 0) + 1;
  save.snapshot = { through, atoms: prefix.atoms, confusions: prefix.confusions, seen };
  save.history = save.history.filter((a) => a.session > through);
  return true;
}

export async function reviseAttempt(save: Save, attempt: Attempt, archive: HistoryArchive) {
  if (!save.snapshot || attempt.session > save.snapshot.through) {
    recordAttempt(save, attempt);
    return;
  }
  const archived = await archive.all();
  if (!archived.length) throw new Error('history_archive_unavailable');
  const replay = structuredClone(save);
  delete replay.snapshot;
  replay.history = [...new Map([...archived, ...save.history].map((a) => [a.id, a])).values()];
  recordAttempt(replay, attempt);
  await compactHistory(replay, archive);
  save.history = replay.history;
  save.snapshot = replay.snapshot;
  save.atoms = replay.atoms;
  save.confusions = replay.confusions;
}
