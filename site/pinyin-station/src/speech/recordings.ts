import type { Attempt, Kind } from '../domain/types';
import type { HistoryArchive } from '../domain/history';
import type { AssessmentPlan } from './reference';
import type { Verdict, Dim } from './normalize';
export interface Recording {
  id: string;
  blob: Blob;
  at: number;
  wordId: string;
  skill: string;
  session: number;
  kind: Kind;
  mode?: 8 | 1 | 6;
  assessment?: AssessmentPlan;
  ref?: string;
  lab?: boolean;
  assisted?: boolean;
  expected?: 'correct' | Dim;
  verdict?: Verdict;
  parent?: 'correct' | Dim;
  /** On-device scorer summary (trial; never feeds mastery). Kept for later calibration against parent labels. */
  local?: {
    verdict: 'match' | 'unsure' | 'differs';
    confidence: number;
    reason?: string;
    heard?: string;
    scorers: string[];
    /** 10-point semitone contour, median Hz and the scorer's feature numbers: what a later calibration needs. */
    contour?: number[];
    medianHz?: number;
    rangeSt?: number;
    features?: Record<string, number | string>;
    elapsedMs?: number;
  };
  /** Parent pressed 拿不准 in batch review: not a label, so it never feeds mastery or calibration. */
  unsure?: boolean;
  /** Everything needed to interpret the recording later; local only. */
  meta?: RecordingMeta;
}
export interface RecordingMeta {
  v: 1;
  target?: { syllable: string; initial: string; final: string; tone: number };
  confusions?: { tones?: number[]; initials?: string[]; finals?: string[] };
  device: { ua: string; viewport: [number, number]; dpr: number; standalone: boolean };
  capture: { source: 'worklet' | 'script-processor' | 'legacy-mic'; quality?: Record<string, number | boolean> };
  speakerN?: number;
}
/** Local library size. Calibration needs a few hundred labelled clips, so this is larger than the AI-trial era's 200. */
export const MAX_RECORDINGS = 500;
let connection: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('kg-pinyin-station', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('recordings')) {
        const store = database.createObjectStore('recordings', { keyPath: 'id' });
        store.createIndex('at', 'at');
        database.createObjectStore('pictures');
      }
      if (!database.objectStoreNames.contains('attempts'))
        database.createObjectStore('attempts', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = null;
      reject(new Error('local_storage_unavailable'));
    };
  }));
}
export const historyArchive: HistoryArchive = {
  async put(rows) {
    const database = await db();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction('attempts', 'readwrite');
      for (const row of rows) tx.objectStore('attempts').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('local_history_archive_unavailable'));
    });
  },
  async all() {
    const database = await db();
    return new Promise<Attempt[]>((resolve, reject) => {
      const request = database.transaction('attempts').objectStore('attempts').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('local_history_archive_unavailable'));
    });
  },
};
export async function saveRecording(recording: Recording) {
  const database = await db();
  // ArrayBuffer avoids Safari/WebKit Blob persistence failures in some storage contexts.
  const { blob, ...metadata } = recording;
  const stored = { ...metadata, audio: await blob.arrayBuffer(), mime: blob.type };
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('recordings', 'readwrite'),
      store = tx.objectStore('recordings');
    store.put(stored);
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_RECORDINGS;
      if (extra <= 0) return;
      const cursor = store.index('at').openCursor();
      cursor.onsuccess = () => {
        if (extra-- <= 0 || !cursor.result) return;
        cursor.result.delete();
        cursor.result.continue();
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error(`local_storage_full:${tx.error?.name ?? 'unknown'}`));
  });
}
export async function recordings(): Promise<Recording[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('recordings').objectStore('recordings').getAll();
    request.onsuccess = () =>
      resolve(
        request.result
          .map((value: Recording & { audio?: ArrayBuffer; mime?: string }) => {
            const { audio, mime, ...record } = value;
            return {
              ...record,
              blob: audio ? new Blob([audio], { type: mime || 'audio/wav' }) : record.blob,
            };
          })
          .sort((a: Recording, b: Recording) => b.at - a.at),
      );
    request.onerror = () => reject(new Error('local_storage_unavailable'));
  });
}
export async function savePicture(id: string, blob: Blob) {
  const database = await db(),
    data = await blob.arrayBuffer();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction('pictures', 'readwrite');
    tx.objectStore('pictures').put({ data, mime: blob.type }, id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error(`local_storage_full:${tx.error?.name ?? 'unknown'}`));
  });
}
export async function getPicture(id: string): Promise<Blob | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const r = database.transaction('pictures').objectStore('pictures').get(id);
    r.onsuccess = () =>
      resolve(r.result?.data ? new Blob([r.result.data], { type: r.result.mime }) : r.result);
    r.onerror = () => reject(new Error('local_storage_unavailable'));
  });
}
