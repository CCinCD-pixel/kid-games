/**
 * Family settings set on the parent page (/parent/) and read by every page. Local only; included
 * in the progress export (all `kg:*` keys are).
 *
 *   import { getSettings, onSettingsChange } from '@kit/settings';
 *   const { displayName, pinyin } = getSettings();     // '小步步', false
 *   onSettingsChange((s) => relabel(s.displayName));   // another tab / the parent page changed them
 *
 * Narration on/off is applied by kit/narration itself (lines are still shown as subtitles; an
 * explicit 再听一遍 still speaks). Games read `pinyin` to show pinyin above reading text and
 * `displayName` wherever the child is addressed in text (voice lines that contain the default
 * name have a name-free variant; see the hub). Hidden games disappear from the hub only — their
 * URLs and saves are untouched. There are deliberately no time limits or locks (Dad's rule).
 *
 * The parent PIN is a soft gate against a curious six-year-old, not security: 4–6 digits, stored
 * as a salted FNV-1a hash (works on plain-http LAN previews where crypto.subtle is unavailable).
 */

export const SETTINGS_KEY = 'kg:settings:v1';
export const PIN_KEY = 'kg:parent:pin';
export const DEFAULT_NAME = '小步步';
export const NAME_MAX = 8;

export interface Settings {
  /** how games address the child (default 小步步) */
  displayName: string;
  /** voice narration (subtitles are always shown) */
  narration: boolean;
  /** pinyin above reading text in games that support it */
  pinyin: boolean;
  /** registry ids hidden from the hub */
  hiddenGames: string[];
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ displayName: DEFAULT_NAME, narration: true, pinyin: false, hiddenGames: [] as string[] });

function storage(s?: Storage): Storage | undefined {
  if (s) return s;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Trim, collapse spaces, cap length; empty → default name. */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return s ? [...s].slice(0, NAME_MAX).join('') : DEFAULT_NAME;
}

function normalize(raw: unknown): Settings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    displayName: cleanName(o.displayName),
    narration: typeof o.narration === 'boolean' ? o.narration : DEFAULT_SETTINGS.narration,
    pinyin: typeof o.pinyin === 'boolean' ? o.pinyin : DEFAULT_SETTINGS.pinyin,
    hiddenGames: Array.isArray(o.hiddenGames) ? [...new Set(o.hiddenGames.filter((g): g is string => typeof g === 'string' && /^[a-z0-9-]+$/.test(g)))] : [],
  };
}

export function getSettings(store?: Storage): Settings {
  const st = storage(store);
  try {
    return normalize(JSON.parse(st?.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return normalize(null);
  }
}

export function updateSettings(patch: Partial<Settings>, store?: Storage): Settings {
  const next = normalize({ ...getSettings(store), ...patch });
  try {
    storage(store)?.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode: the change lives for this page only */
  }
  for (const cb of listeners) cb(next);
  return next;
}

const listeners = new Set<(s: Settings) => void>();
let storageHooked = false;

/** Called on changes from this page or another tab. Returns an unsubscribe function. */
export function onSettingsChange(cb: (s: Settings) => void): () => void {
  listeners.add(cb);
  if (!storageHooked && typeof window !== 'undefined') {
    storageHooked = true;
    window.addEventListener('storage', (e) => {
      if (e.key === SETTINGS_KEY) for (const fn of listeners) fn(getSettings());
    });
  }
  return () => listeners.delete(cb);
}

/** True when a line should be voiced (parent setting). */
export const narrationEnabled = (store?: Storage): boolean => getSettings(store).narration;

// ---------------------------------------------------------------- parent PIN

function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 64-bit-ish digest from two seeded FNV-1a passes, iterated (cheap key stretching). */
export function hashPin(pin: string, salt: string): string {
  let a = fnv1a(salt + ':' + pin);
  let b = fnv1a(pin + ':' + salt, 0x01000193);
  for (let i = 0; i < 2000; i += 1) {
    a = fnv1a(`${a.toString(36)}${pin}${b.toString(36)}`, a);
    b = fnv1a(`${b.toString(36)}${salt}${a.toString(36)}`, b ^ 0x5bd1e995);
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export const isValidPin = (pin: string): boolean => /^\d{4,6}$/.test(pin);

export function hasPin(store?: Storage): boolean {
  try {
    const raw = JSON.parse(storage(store)?.getItem(PIN_KEY) ?? 'null') as { salt?: string; hash?: string } | null;
    return !!(raw && raw.salt && raw.hash);
  } catch {
    return false;
  }
}

export function setPin(pin: string, store?: Storage): void {
  if (!isValidPin(pin)) throw new Error('PIN 需要 4–6 位数字');
  const salt = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  storage(store)?.setItem(PIN_KEY, JSON.stringify({ salt, hash: hashPin(pin, salt) }));
}

export function checkPin(pin: string, store?: Storage): boolean {
  try {
    const raw = JSON.parse(storage(store)?.getItem(PIN_KEY) ?? 'null') as { salt: string; hash: string } | null;
    return !!raw && hashPin(pin, raw.salt) === raw.hash;
  } catch {
    return false;
  }
}

/** Forgotten PIN: the parent page asks an adult arithmetic question first. Data is kept. */
export function clearPin(store?: Storage): void {
  storage(store)?.removeItem(PIN_KEY);
}
