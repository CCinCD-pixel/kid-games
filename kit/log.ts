/**
 * Local play-session log (never leaves the device; exported with progress).
 *
 * One record per visit to a page. Active time only counts while the page is visible.
 *  - 15 s heartbeat updates `lastBeat`/`activeMs` (so a killed app loses ≤15 s)
 *  - hidden → the session pauses; hidden > 5 min → the session ends and a new one starts on return
 *  - pagehide / leaving through the shell → ended with a reason
 *  - a session found open on the next launch is closed at its last heartbeat ("recovered")
 * `source` records how the game was opened: from the hub, a hub suggestion, or directly.
 *
 *   const session = startSession('mars-base');      // the kit shell does this for you
 *   session.mark('level-complete', { level: 3, stars: 2 });
 */

export const LOG_KEY = 'kg:log:v1';
export const LAUNCH_KEY = 'kg:launch';
const MAX_SESSIONS = 600;
const MAX_EVENTS_PER_SESSION = 200;
const HEARTBEAT_MS = 15_000;
const IDLE_SPLIT_MS = 5 * 60_000;

export type LaunchSource = 'hub' | 'suggested' | 'direct' | 'resume';
export type EndReason = 'leave' | 'hidden-timeout' | 'unload' | 'recovered' | 'replaced';

export interface SessionEvent {
  t: number;
  name: string;
  data?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  game: string;
  source: LaunchSource;
  start: number;
  lastBeat: number;
  activeMs: number;
  end?: number;
  endReason?: EndReason;
  events: SessionEvent[];
}

export interface Session {
  readonly record: SessionRecord;
  mark(name: string, data?: Record<string, unknown>): void;
  end(reason: EndReason): void;
}

interface Env {
  storage?: Storage;
  session?: Storage;
  now: () => number;
  doc?: Document;
  win?: Window;
}

function env(overrides: Partial<Env> = {}): Env {
  const g = globalThis as unknown as { localStorage?: Storage; sessionStorage?: Storage; document?: Document; window?: Window };
  let storage: Storage | undefined;
  let session: Storage | undefined;
  try {
    storage = g.localStorage;
    session = g.sessionStorage;
  } catch {
    /* blocked */
  }
  return { storage, session, now: Date.now, doc: g.document, win: g.window, ...overrides };
}

export function readSessions(storage: Storage | undefined = env().storage): SessionRecord[] {
  try {
    const list = JSON.parse(storage?.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(list) ? (list as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

function writeSessions(list: SessionRecord[], storage: Storage | undefined): void {
  if (!storage) return;
  const trimmed = list.slice(-MAX_SESSIONS);
  try {
    storage.setItem(LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // quota: drop the oldest half and retry once
    try {
      storage.setItem(LOG_KEY, JSON.stringify(trimmed.slice(Math.floor(trimmed.length / 2))));
    } catch {
      /* give up silently */
    }
  }
}

function upsert(record: SessionRecord, storage: Storage | undefined): void {
  const list = readSessions(storage);
  const i = list.findIndex((r) => r.id === record.id);
  if (i >= 0) list[i] = record;
  else list.push(record);
  writeSessions(list, storage);
}

/** Close sessions left open by a killed app (end = last heartbeat). Returns how many were fixed. */
export function recoverOpenSessions(storage: Storage | undefined = env().storage, exceptId?: string): number {
  const list = readSessions(storage);
  let n = 0;
  for (const r of list) {
    if (r.end === undefined && r.id !== exceptId) {
      r.end = r.lastBeat;
      r.endReason = 'recovered';
      n += 1;
    }
  }
  if (n) writeSessions(list, storage);
  return n;
}

/** The hub calls this right before navigating to a game. */
export function recordLaunch(game: string, source: LaunchSource, e: Partial<Env> = {}): void {
  const { session, now } = env(e);
  try {
    session?.setItem(LAUNCH_KEY, JSON.stringify({ game, source, at: now() }));
  } catch {
    /* ignore */
  }
}

/** Read and clear the launch hint; 'direct' when the page was opened any other way. */
export function consumeLaunchSource(game: string, e: Partial<Env> = {}): LaunchSource {
  const { session, now } = env(e);
  try {
    const raw = session?.getItem(LAUNCH_KEY);
    session?.removeItem(LAUNCH_KEY);
    if (!raw) return 'direct';
    const hint = JSON.parse(raw) as { game?: string; source?: LaunchSource; at?: number };
    if (hint.game === game && typeof hint.at === 'number' && now() - hint.at < 60_000 && hint.source) return hint.source;
  } catch {
    /* ignore */
  }
  return 'direct';
}

const newId = (now: number) => `${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * Start logging a visit. Installs visibility/pagehide/heartbeat handlers when a document exists.
 * `overrides` is for tests (fake clock/storage, no DOM).
 */
export function startSession(game: string, options: { source?: LaunchSource } = {}, overrides: Partial<Env> = {}): Session {
  const e = env(overrides);
  const t0 = e.now();
  const source = options.source ?? consumeLaunchSource(game, overrides);
  let record: SessionRecord = { id: newId(t0), game, source, start: t0, lastBeat: t0, activeMs: 0, events: [] };
  recoverOpenSessions(e.storage, record.id);
  let visibleSince: number | null = t0;
  let hiddenAt: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const accrue = () => {
    const now = e.now();
    if (visibleSince !== null) {
      record.activeMs += now - visibleSince;
      visibleSince = now;
    }
    record.lastBeat = now;
  };
  const persist = () => upsert(record, e.storage);
  const beat = () => {
    if (record.end !== undefined) return;
    accrue();
    persist();
  };

  const end = (reason: EndReason) => {
    if (record.end !== undefined) return;
    accrue();
    record.end = record.lastBeat;
    record.endReason = reason;
    persist();
    if (timer) clearInterval(timer);
    timer = null;
  };

  const onVisibility = () => {
    if (!e.doc) return;
    if (e.doc.visibilityState === 'hidden') {
      accrue();
      visibleSince = null;
      hiddenAt = e.now();
      persist();
    } else {
      const away = hiddenAt === null ? 0 : e.now() - hiddenAt;
      hiddenAt = null;
      if (record.end === undefined && away > IDLE_SPLIT_MS) {
        // Long break: close the old visit at the moment it was hidden, open a fresh one.
        record.end = record.lastBeat;
        record.endReason = 'hidden-timeout';
        persist();
        const t = e.now();
        record = { id: newId(t), game, source: 'resume', start: t, lastBeat: t, activeMs: 0, events: [] };
      }
      visibleSince = e.now();
      persist();
    }
  };

  if (e.doc && e.win) {
    e.doc.addEventListener('visibilitychange', onVisibility);
    e.win.addEventListener('pagehide', () => end('unload'));
    timer = setInterval(beat, HEARTBEAT_MS);
  }
  persist();

  return {
    get record() {
      return record;
    },
    mark(name, data) {
      if (record.events.length >= MAX_EVENTS_PER_SESSION) return;
      record.events.push({ t: e.now() - record.start, name, ...(data ? { data } : {}) });
      persist();
    },
    end,
  };
}

/** Minutes of active play per game over the last `days` days (for the parent page). */
export function summarize(days = 30, storage: Storage | undefined = env().storage, now = Date.now()): Record<string, { sessions: number; minutes: number }> {
  const since = now - days * 86_400_000;
  const out: Record<string, { sessions: number; minutes: number }> = {};
  for (const r of readSessions(storage)) {
    if (r.start < since) continue;
    const s = (out[r.game] ??= { sessions: 0, minutes: 0 });
    s.sessions += 1;
    s.minutes += r.activeMs / 60_000;
  }
  for (const k of Object.keys(out)) out[k].minutes = Math.round(out[k].minutes * 10) / 10;
  return out;
}
