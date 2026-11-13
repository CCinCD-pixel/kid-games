/**
 * Livery data: what a game gets back from the 涂装台. A game declares a target (its id + the parts that can be
 * painted); each part's look is a colour, a pattern and up to `maxStickers` stickers (ids from catalog.ts).
 * Looks are saved on this device only through kit/progress (`kg:v1:livery:<target>`), so the parent page's
 * export / import backs them up with everything else. No personal data, nothing leaves the device.
 */
import { createStore, type Store } from '../progress';
import { COLORS, PATTERNS, STICKERS, type LiveryColor } from './catalog';

export interface PartLook {
  color: string;
  pattern: string;
  /** sticker ids in the order they were put on (slot 1, 2, 3) */
  stickers: string[];
}
/** part id → look */
export type Looks = Record<string, PartLook>;

export interface LiveryPart {
  id: string;
  /** shown on the part tab when a target has more than one part ("小人" / "箱子") */
  label: string;
  /** 恢复原样 goes back to this */
  defaults: PartLook;
  /** 0 = this part takes no stickers; default 3 (never more than 3) */
  maxStickers?: number;
  /** this part's own original colour(s), listed first ("小推橙", "纸箱色"): 恢复原样 can then be exactly the game's
   *  own art, and the child can still put a pattern / stickers on it */
  ownColors?: LiveryColor[];
  /** limit the choice for this part (default: every colour / pattern / sticker; own colours are always offered) */
  colors?: string[];
  patterns?: string[];
  stickers?: string[];
}

export interface LiveryTarget {
  /** store id: `kg:v1:livery:<id>` (lower-case, digits, dashes) */
  id: string;
  parts: LiveryPart[];
}

export interface LiverySave {
  looks: Looks;
  /** how many times 保存 was pressed (for the parent summary: "made N looks"); never a score */
  saves: number;
}

export const MAX_STICKERS = 3;
export const LIVERY_VERSION = 1;

export const maxStickersOf = (part: LiveryPart) => Math.max(0, Math.min(MAX_STICKERS, part.maxStickers ?? MAX_STICKERS));
export const colorsOf = (part: LiveryPart): LiveryColor[] => [...(part.ownColors ?? []), ...COLORS.filter((c) => !part.colors || part.colors.includes(c.id))];
/** a colour of this part (its own colours included) */
export const partColor = (part: LiveryPart, id: string): LiveryColor => colorsOf(part).find((c) => c.id === id) ?? colorsOf(part)[0];
export const patternsOf = (part: LiveryPart) => PATTERNS.filter((p) => !part.patterns || part.patterns.includes(p.id));
export const stickersOf = (part: LiveryPart) => (maxStickersOf(part) === 0 ? [] : STICKERS.filter((s) => !part.stickers || part.stickers.includes(s.id)));

export const cloneLook = (l: PartLook): PartLook => ({ color: l.color, pattern: l.pattern, stickers: [...l.stickers] });
export const sameLook = (a: PartLook, b: PartLook) => a.color === b.color && a.pattern === b.pattern && a.stickers.length === b.stickers.length && a.stickers.every((s, i) => s === b.stickers[i]);
export const sameLooks = (a: Looks, b: Looks) => Object.keys({ ...a, ...b }).every((k) => !!a[k] && !!b[k] && sameLook(a[k], b[k]));

export function defaultLooks(target: LiveryTarget): Looks {
  const out: Looks = {};
  for (const p of target.parts) out[p.id] = sanitizeLook(p, p.defaults, true);
  return out;
}

/** a stored / imported look made safe for this part: unknown ids fall back to the part's defaults, stickers are
 *  de-duplicated and cut to the part's maximum */
export function sanitizeLook(part: LiveryPart, raw: unknown, isDefault = false): PartLook {
  const fallback = isDefault ? null : sanitizeLook(part, part.defaults, true);
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PartLook, unknown>>;
  const colors = colorsOf(part), patterns = patternsOf(part), stickers = stickersOf(part);
  const color = typeof o.color === 'string' && colors.some((c) => c.id === o.color) ? o.color : fallback?.color ?? colors[0]?.id ?? COLORS[0].id;
  const pattern = typeof o.pattern === 'string' && patterns.some((p) => p.id === o.pattern) ? o.pattern : fallback?.pattern ?? patterns[0]?.id ?? 'plain';
  const list: string[] = [];
  if (Array.isArray(o.stickers)) for (const s of o.stickers) if (typeof s === 'string' && stickers.some((x) => x.id === s) && !list.includes(s)) list.push(s);
  return { color, pattern, stickers: list.slice(0, maxStickersOf(part)) };
}

export function sanitizeLooks(target: LiveryTarget, raw: unknown): Looks {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Looks = {};
  for (const p of target.parts) out[p.id] = o[p.id] === undefined ? sanitizeLook(p, p.defaults, true) : sanitizeLook(p, o[p.id]);
  return out;
}

/** 随机来一个: a fresh colour + pattern and 1–3 stickers (when the part takes any), never the same look as `from` */
export function randomLook(part: LiveryPart, rnd: () => number = Math.random, from?: PartLook): PartLook {
  const colors = colorsOf(part), patterns = patternsOf(part), stickers = stickersOf(part), max = maxStickersOf(part);
  const pick = <T,>(a: readonly T[]) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  for (let tries = 0; tries < 12; tries++) {
    const color = pick(colors).id, pattern = pick(patterns.filter((p) => p.id !== 'plain').length ? patterns.filter((p) => p.id !== 'plain') : patterns).id;
    const want = max === 0 || !stickers.length ? 0 : Math.min(max, stickers.length, 1 + Math.floor(rnd() * max));
    const pool = stickers.map((s) => s.id), chosen: string[] = [];
    while (chosen.length < want && pool.length) chosen.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const look = { color, pattern, stickers: chosen };
    if (!from || (look.color !== from.color && !sameLook(look, from))) return look;
  }
  return sanitizeLook(part, { ...(from ?? part.defaults), color: colors.find((c) => c.id !== from?.color)?.id });
}

/** put on / peel off one sticker. Returns the new list, or null when the part is already full (the studio wiggles). */
export function toggleSticker(part: LiveryPart, look: PartLook, id: string): string[] | null {
  if (look.stickers.includes(id)) return look.stickers.filter((s) => s !== id);
  if (look.stickers.length >= maxStickersOf(part)) return null;
  return [...look.stickers, id];
}

// ------------------------------------------------------------------ storage
export interface LiveryStore {
  readonly key: string;
  /** the saved looks (defaults until 保存 was pressed once), always sanitised */
  load(): Looks;
  save(looks: Looks): boolean;
  /** how many times a look was saved */
  saves(): number;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

const stores = new Map<string, Store<LiverySave>>();

export function liveryStore(target: LiveryTarget, storage?: Storage): LiveryStore {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(target.id)) throw new Error(`livery: bad target id "${target.id}"`);
  const mk = () => createStore<LiverySave>(`livery:${target.id}`, { version: LIVERY_VERSION, storage, defaults: () => ({ looks: defaultLooks(target), saves: 0 }) });
  let store = storage ? mk() : stores.get(target.id);
  if (!store) { store = mk(); stores.set(target.id, store); }
  const s = store;
  const read = (): LiverySave => {
    const d = s.load() as Partial<LiverySave> | null;
    return { looks: sanitizeLooks(target, d?.looks), saves: typeof d?.saves === 'number' && d.saves >= 0 ? Math.floor(d.saves) : 0 };
  };
  return {
    key: s.key,
    load: () => read().looks,
    save(looks) { const cur = read(); return s.save({ looks: sanitizeLooks(target, looks), saves: cur.saves + 1 }); },
    saves: () => read().saves,
    reset: () => s.reset(),
    subscribe: (fn) => s.subscribe(fn),
  };
}
