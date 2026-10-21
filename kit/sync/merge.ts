// kit/sync/merge.ts — declarative merge engine ("CRDT-lite") for the cloud save. Port of the v1.1 prototype (~/kid-games-work/specs/sync-tools/merge.mjs); semantics are
// pinned by tests/sync/* (lattice laws, dominance, 78 semantic oracle assertions, 22 executable mutants). Zero dependencies, no clocks, no randomness.
//
// Wire state = { d: <data without device-local fields>, st: { <path>: [lc, dev] } (Lamport stamps of lww registers), g?: [lc, dev] (slot generation, bumped by a reset) }.
// Every rule is a join (commutative, associative, idempotent) over SANITISED inputs; wall clocks are never compared; remote data is untrusted (wrong types are dropped, never thrown).
import { MAX_SAFE, SUM_SLOT_MAX } from './contract';
import type { Rule, Stamp } from './rules';

// Wire values are untyped JSON by nature; the typing effort lives in rules.ts (RuleOf<T>).
type J = any;
type Obj = Record<string, J>;
type RuleObj = Extract<Rule, { k: 'obj' | 'gv' }>;
type RuleRank = Extract<Rule, { k: 'rank' }>;

export interface WireState { d: J; st: Record<string, Stamp>; g?: Stamp }
/** Sidecar context of one slot: per-device sum slots, FIFO order stamps, this device id and the Lamport tick (docs/specs/sync.md §3.2). */
export interface SyncCtx { slots: Record<string, Record<string, number>>; ords: Record<string, Record<string, number>>; dev: string; tick: () => number }
export interface OverlayCtx { replace?: boolean; kept?: number }
export interface Coverage { covered: number; local: number; any: string[]; total: number }

export const LIMIT = MAX_SAFE;   // numbers (epoch-ms, counters) up to 2^53-1 survive

export const canon = (v: J): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x)) as string;
const isObj = (x: J): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);
const typeRank = (x: J): number => (isObj(x) ? 5 : Array.isArray(x) ? 4 : typeof x === 'string' ? 3 : typeof x === 'number' ? 2 : typeof x === 'boolean' ? 1 : 0);
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const NEG: Stamp = [-1, ''];
const ZERO: Stamp = [0, ''];
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
export const cmpStamp = (a: Stamp, b: Stamp): number => (a[0] - b[0]) || cmpStr(a[1], b[1]);
const okStamp = (x: J): x is Stamp => Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && x[0] >= 0 && x[0] <= Number.MAX_SAFE_INTEGER && typeof x[1] === 'string' && x[1].length <= 16;
const ixCache = new WeakMap<RuleRank, Map<string | number, number>>();
const ixOf = (rule: RuleRank): Map<string | number, number> => { let m = ixCache.get(rule); if (!m) { m = new Map(rule.order.map((x, i) => [x, i])); ixCache.set(rule, m); } return m; };

// ---------- sanitize: remote data is untrusted; wrong types are dropped (never thrown)
const finite = (x: J): boolean => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= LIMIT;
const idLike = (k: J): boolean => typeof k === 'string' && k.length <= 128 && k !== '__proto__';
const fld = (rule: RuleObj, k: string): Rule => (own(rule.fields, k) ? rule.fields[k]! : rule.rest);     // own-property lookup: 'constructor' / 'toString' / '__proto__' never resolve to inherited members
const scrub = (v: J, d = 0): J => (d > 12 ? undefined : Array.isArray(v) ? v.map((x) => scrub(x, d + 1)) : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== '__proto__').map(([k, x]) => [k, scrub(x, d + 1)])) : v);   // no '__proto__' key survives inside opaque values
export function coerce(rule: Rule, v: J, depth = 0): J {
  if (v === undefined || depth > 12) return undefined;
  switch (rule.k) {
    case 'max': case 'min': return finite(v) || (typeof v === 'string' && v.length <= 64) ? v : undefined;
    case 'or': return typeof v === 'boolean' ? v : undefined;
    case 'sum': { if (!isObj(v)) return undefined; const o: Obj = {}; const lim = SUM_SLOT_MAX; for (const [k, n] of Object.entries(v)) if (k.length <= 16 && Number.isInteger(n) && n >= 0 && n <= lim) o[k] = n; return o; }
    case 'set': return Array.isArray(v) ? [...new Set(v.filter((x) => (typeof x === 'string' ? x.length <= 128 : finite(x))))].sort((a, b) => cmpStr(canon(a), canon(b))).slice(0, rule.cap ?? 4000) : undefined;
    case 'rank': return ixOf(rule).has(v) || (typeof v === 'string' && v.length <= 64) ? v : undefined;     // unknown token = "passenger" (lowest rank, carried, never deleted)
    case 'lww': case 'any': return v === null || canon(v).length <= 16384 ? scrub(v) : undefined;
    case 'longer': return Array.isArray(v) && v.length <= 400 ? v : undefined;
    case 'maxArr': return Array.isArray(v) && v.length <= 64 && v.every(finite) ? v : undefined;
    case 'pick': return isObj(v) ? v : undefined;
    case 'ring': return Array.isArray(v) ? v.filter((x) => (isObj(x) || typeof x === 'string' || finite(x)) && typeof rule.key(x) === 'string' && finite(rule.ord(x))).slice(-rule.cap * 2) : undefined;
    case 'fifo': { if (!isObj(v)) return undefined; const e = Object.entries(v).filter(([k, o]) => idLike(k) && Number.isInteger(o) && (o as number) >= 0 && (o as number) <= LIMIT) as [string, number][]; e.sort((a, b) => (a[1] - b[1]) || cmpStr(a[0], b[0])); return Object.fromEntries(e.slice(-rule.cap)); }
    case 'local': return undefined;
    case 'obj': case 'gv': {
      if (!isObj(v)) return undefined; const out: Obj = {};
      for (const [k, x] of Object.entries(v)) { if (k === '__proto__') continue; const r = fld(rule, k); if (r.k === 'local') continue; const c = coerce(r, x, depth + 1); if (c !== undefined) out[k] = c; }
      return out;
    }
    case 'map': {
      if (!isObj(v)) return undefined; const out: Obj = {};
      for (const [k, x] of Object.entries(v)) { if (!idLike(k)) continue; const c = coerce(rule.of, x, depth + 1); if (c !== undefined) out[k] = c; }
      return out;
    }
  }
  return undefined;
}

// ---------- strip local fields (what is uploaded) / overlay (what is written back)
export function strip(rule: Rule, v: J): J {
  if (v === undefined) return undefined;
  if (rule.k === 'local') return undefined;
  if (rule.k === 'obj' || rule.k === 'gv') { if (!isObj(v)) return v; const o: Obj = {}; for (const [k, x] of Object.entries(v)) { const r = fld(rule, k); const s = strip(r, x); if (s !== undefined) o[k] = s; } return o; }
  if (rule.k === 'map') { if (!isObj(v)) return v; const o: Obj = {}; for (const [k, x] of Object.entries(v)) { const s = strip(rule.of, x); if (s !== undefined) o[k] = s; } return o; }
  return v;
}
// overlay replicated state `rep` onto the local data. X fields keep the local value. A local value is NEVER deleted just because the merge result lacks it
// (coerce may have rejected it); ctx.replace = true is for adopting a higher slot generation (reset elsewhere): then rep wins wholesale (X fields still kept).
export function overlay(rule: Rule, local: J, rep: J, ctx: OverlayCtx = {}): J {
  if (rule.k === 'local') return local;
  if (rule.k === 'obj' || rule.k === 'gv' || rule.k === 'map') {
    if (local === undefined && rep === undefined) return undefined;       // a container field the game does not have (yet) stays absent: write-back must not invent `{}` (self-merge neutrality on real defaults(); found by tests/sync/coverage.test.ts)
    const o: Obj = {}; const L: Obj = isObj(local) ? local : {}; const Rp: Obj = isObj(rep) ? rep : {};
    const keys = rule.k === 'map' ? new Set([...Object.keys(L), ...Object.keys(Rp)]) : new Set([...Object.keys(L), ...Object.keys(Rp), ...Object.keys(rule.fields)]);
    for (const k of keys) { if (k === '__proto__') continue; const r = rule.k === 'map' ? rule.of : fld(rule, k); const x = overlay(r, L[k], Rp[k], ctx); if (x !== undefined) o[k] = x; }
    if (ctx.replace && rep === undefined && Object.keys(o).length === 0) return undefined;       // adopting a reset: records the new state does not have disappear (X fields nested inside keep them alive)
    return o;
  }
  if ((rule.k === 'set' || rule.k === 'ring') && !ctx.replace && Array.isArray(local) && Array.isArray(rep)) {   // elements coerce() refused (too long, bad ord) stay in the local array
    const rejected = local.filter((e) => { const c = coerce(rule, [e]); return Array.isArray(c) && c.length === 0; });
    ctx.kept = (ctx.kept ?? 0) + rejected.length;
    if (rule.k === 'ring') return [...rep, ...rejected];
    const inRep = new Set(rep.map(canon)); const mine = local.filter((e) => inRep.has(canon(e)) || rejected.includes(e)); const mineSet = new Set(mine.map(canon));
    return [...mine, ...rep.filter((e) => !mineSet.has(canon(e)))];        // sets keep the LOCAL order (no gratuitous re-sorting => no spurious dirty flags), new members appended
  }
  // a local value the sanitiser cannot represent (null under min/max, over-long id, ...) is never deleted by a write-back; a representable value the merge result lacks IS removed (generation-guarded unset)
  if (rep === undefined && local !== undefined && !ctx.replace && coerce(rule, local) === undefined) { ctx.kept = (ctx.kept ?? 0) + 1; return local; }
  return rep;
}

// ---------- merge
function mergeAny(a: J, b: J): J {
  if (a === undefined) return b; if (b === undefined) return a;
  const ta = typeRank(a), tb = typeRank(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (isObj(a)) { const o: Obj = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = mergeAny(a[k], b[k]); return o; }
  if (typeof a === 'number' && typeof b === 'number') return a >= b ? a : b;       // numbers by value ('9' must not beat '10')
  return cmpStr(canon(a), canon(b)) >= 0 ? a : b;
}
const cmpPick = (rule: Extract<Rule, { k: 'pick' }>, a: J, b: J): number => { const ra = rule.rank(a), rb = rule.rank(b); for (let i = 0; i < ra.length; i++) { if (ra[i] !== rb[i]) return ra[i]! - rb[i]!; } return cmpStr(canon(a), canon(b)); };
const rankKey = (rule: RuleRank, v: J): number => ixOf(rule).get(v) ?? -1;   // catalog index; unknown token = -1
const esc = (k: string): string => k.replace(/~/g, '~0').replace(/\//g, '~1');

type Stamps = Record<string, Stamp>;
function node(rule: Rule, a: J, b: J, path: string, sa: Stamps, sb: Stamps, so: Stamps): J {
  if (a === undefined && b === undefined) return undefined;
  switch (rule.k) {
    case 'max': { if (a === undefined) return b; if (b === undefined) return a; if (typeof a !== typeof b) return typeof a === 'string' ? a : b; return a >= b ? a : b; }
    case 'min': { if (a === undefined) return b; if (b === undefined) return a; if (typeof a !== typeof b) return typeof a === 'string' ? a : b; return a <= b ? a : b; }
    case 'sum': { const o: Obj = {}; for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) o[k] = Math.max(a?.[k] ?? 0, b?.[k] ?? 0); return o; }
    case 'or': return (a === true || b === true) ? true : (a ?? b);
    case 'set': { return [...new Set([...(a ?? []), ...(b ?? [])])].sort((x, y) => cmpStr(canon(x), canon(y))).slice(0, rule.cap ?? 4000); }
    case 'rank': {
      if (a === undefined) return b; if (b === undefined) return a;
      const d = rankKey(rule, a) - rankKey(rule, b); if (d) return d > 0 ? a : b; return cmpStr(canon(a), canon(b)) >= 0 ? a : b;
    }
    case 'longer': { if (a === undefined) return b; if (b === undefined) return a; const d = a.length - b.length; if (d) return d > 0 ? a : b; return cmpStr(canon(a), canon(b)) >= 0 ? a : b; }
    case 'maxArr': { const A: number[] = a ?? [], B: number[] = b ?? []; const n = Math.max(A.length, B.length); return Array.from({ length: n }, (_, i) => Math.max(A[i] ?? -Infinity, B[i] ?? -Infinity)).map((x) => (x === -Infinity ? 0 : x)); }
    case 'any': return mergeAny(a, b);
    case 'pick': { if (a === undefined) return b; if (b === undefined) return a; return cmpPick(rule, a, b) >= 0 ? a : b; }
    case 'lww': {
      const ta = a === undefined ? NEG : (sa[path] ?? NEG), tb = b === undefined ? NEG : (sb[path] ?? NEG);
      let win: Stamp, wv: J;
      const c = cmpStamp(ta, tb);
      if (c > 0) { win = ta; wv = a; } else if (c < 0) { win = tb; wv = b; }
      else if (a === undefined) { win = tb; wv = b; } else if (b === undefined) { win = ta; wv = a; }
      else { win = ta; wv = cmpStr(canon(a), canon(b)) >= 0 ? a : b; }
      if (wv !== undefined && win !== NEG) so[path] = win;
      return wv;
    }
    case 'ring': {
      const m = new Map<string, J>();
      for (const x of [...(a ?? []), ...(b ?? [])]) { const k = rule.key(x); const p = m.get(k); if (p === undefined || cmpStr(canon(x), canon(p)) > 0) m.set(k, x); }
      return [...m.values()].sort((x, y) => (rule.ord(x) - rule.ord(y)) || cmpStr(rule.key(x), rule.key(y))).slice(-rule.cap);
    }
    case 'fifo': {
      const m: Record<string, number> = {}; for (const src of [a ?? {}, b ?? {}]) for (const [k, o] of Object.entries(src) as [string, number][]) m[k] = m[k] === undefined ? o : Math.max(m[k]!, o);
      const e = Object.entries(m).sort((x, y) => (x[1] - y[1]) || cmpStr(x[0], y[0])); return Object.fromEntries(e.slice(-rule.cap));
    }
    case 'obj': {
      const o: Obj = {}; const A = a ?? {}, B = b ?? {};
      for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) { const r = fld(rule, k); const x = node(r, A[k], B[k], path + '/' + esc(k), sa, sb, so); if (x !== undefined) o[k] = x; }
      return o;
    }
    case 'gv': {   // generation-guarded record: guarded keys follow the higher `g` wholesale (even when the winner has the key unset); equal g -> normal field rules
      const o: Obj = {}; const A = a ?? {}, B = b ?? {}; const ga = Number.isInteger(A.g) ? A.g : 0, gb = Number.isInteger(B.g) ? B.g : 0;
      for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
        const r = fld(rule, k); let x: J;
        if (rule.guarded.includes(k) && ga !== gb) x = ga > gb ? A[k] : B[k]; else x = node(r, A[k], B[k], path + '/' + esc(k), sa, sb, so);
        if (x !== undefined) o[k] = x;
      }
      return o;
    }
    case 'map': {
      const o: Obj = {}; const A = a ?? {}, B = b ?? {};
      for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) { const x = node(rule.of, A[k], B[k], path + '/' + esc(k), sa, sb, so); if (x !== undefined) o[k] = x; }
      return o;
    }
    case 'local': return undefined;
  }
  return undefined;
}
export const emptyState = (): WireState => ({ d: undefined, st: {} });
const cleanSt = (rule: Rule, d: J, st: J): Stamps => { const keep = lwwPaths(rule, d); const o: Stamps = {}; for (const [p, s] of Object.entries(st ?? {})) if (p in keep && okStamp(s)) o[p] = s; return o; };
/** Merge two wire states under `rule` (inputs are sanitised here). Slot generation g: a higher g wins wholesale (the older side's data is discarded), equal g -> rule tree. */
export function merge(rule: Rule, A: WireState, B: WireState): WireState {
  const ga = okStamp(A.g) ? A.g : ZERO, gb = okStamp(B.g) ? B.g : ZERO, c = cmpStamp(ga, gb);
  const a = coerce(rule, A.d), b = coerce(rule, B.d);
  const adopt = (X: WireState, x: J, gx: Stamp): WireState => { const sx = cleanSt(rule, x, X.st), so: Stamps = {}; const d = node(rule, x, undefined, '', sx, {}, so); return { d, st: so, g: gx }; };   // winner of a higher generation, normalised exactly like merge(X, empty)
  if (c > 0) return adopt(A, a, ga);
  if (c < 0) return adopt(B, b, gb);
  const sa = cleanSt(rule, a, A.st), sb = cleanSt(rule, b, B.st), so: Stamps = {};
  const d = node(rule, a, b, '', sa, sb, so);
  return { d, st: so, ...(ga !== ZERO ? { g: ga } : {}) };
}
export const same = (X: WireState, Y: WireState): boolean => canon(X.d ?? null) === canon(Y.d ?? null) && canon(X.st) === canon(Y.st) && canon(X.g ?? null) === canon(Y.g ?? null);

// ---------- leaves of a value (coverage validator): every leaf path must be reached by a rule other than 'any'
export function coverage(rule: Rule, sample: J): Coverage {
  const out: Coverage = { covered: 0, local: 0, any: [], total: 0 };
  const walk = (r: Rule, v: J, path: string): void => {
    if (v === undefined) return;
    if (r.k === 'local') { out.local++; out.total++; return; }
    if (r.k === 'obj' || r.k === 'gv') { if (!isObj(v)) { out.total++; out.any.push(path); return; } for (const [k, x] of Object.entries(v)) walk(own(r.fields, k) ? r.fields[k]! : r.rest, x, path + '.' + k); return; }
    if (r.k === 'map') { if (!isObj(v)) { out.total++; return; } for (const [k, x] of Object.entries(v)) walk(r.of, x, path + '.' + k); return; }
    out.total++; if (r.k === 'any') out.any.push(path); else out.covered++;
  };
  walk(rule, sample, '$');
  return out;
}
/** Rule leaves reachable without any data (what the TYPE promises): used to cross-check fixtures (each declared rule field must appear in the full fixture and vice versa). */
export function ruleLeafPaths(rule: Rule, path = '$', out: string[] = []): string[] {
  if (rule.k === 'obj' || rule.k === 'gv') for (const [k, r] of Object.entries(rule.fields)) ruleLeafPaths(r, path + '.' + k, out);
  else if (rule.k === 'map') ruleLeafPaths(rule.of, path + '.*', out);
  else out.push(path + ':' + rule.k);
  return out;
}

// ---------- lww bookkeeping: current value of every lww register in `v` (path -> value); used to stamp local writes by diffing against what was last seen
export function lwwPaths(rule: Rule, v: J, path = '', out: Record<string, J> = {}): Record<string, J> {
  if (v === undefined) return out;
  if (rule.k === 'lww') out[path] = v;
  else if ((rule.k === 'obj' || rule.k === 'gv') && isObj(v)) for (const [k, x] of Object.entries(v)) lwwPaths(fld(rule, k), x, path + '/' + esc(k), out);
  else if (rule.k === 'map' && isObj(v)) for (const [k, x] of Object.entries(v)) lwwPaths(rule.of, x, path + '/' + esc(k), out);
  return out;
}

// ---------- wire transforms. The game keeps plain values; the wire form of two rules differs:
//   sum  : game keeps a number V; wire = per-device slots {dev: n}; V = sum of slots (exact under concurrent increments)
//   fifo : game keeps string[] oldest->newest; wire = {id: lc}; local order after apply = (lc, id) ascending
// ctx lives in the sidecar and is written atomically with the data (docs/specs/sync.md §3.2).
export function toWire(rule: Rule, v: J, ctx: SyncCtx, path = ''): J {
  if (v === undefined) return undefined;
  if (rule.k === 'sum') { if (!Number.isFinite(v)) return {}; const known = ctx.slots[path] ?? {}; const others = Object.entries(known).filter(([d]) => d !== ctx.dev).reduce((s, [, n]) => s + n, 0); ctx.slots[path] = { ...known, [ctx.dev]: Math.max(known[ctx.dev] ?? 0, Math.max(0, Math.round(v) - others)) }; return { ...ctx.slots[path] }; }
  if (rule.k === 'fifo') {
    if (!Array.isArray(v)) return {}; const known = (ctx.ords[path] ??= {}); const o: Record<string, number> = {};
    for (const id of v) { if (typeof id !== 'string') continue; if (known[id] === undefined) known[id] = ctx.tick(); o[id] = known[id]!; }
    return o;
  }
  if ((rule.k === 'obj' || rule.k === 'gv') && isObj(v)) { const o: Obj = {}; for (const [k, x] of Object.entries(v)) { const y = toWire(fld(rule, k), x, ctx, path + '/' + esc(k)); if (y !== undefined) o[k] = y; } return o; }
  if (rule.k === 'map' && isObj(v)) { const o: Obj = {}; for (const [k, x] of Object.entries(v)) { const y = toWire(rule.of, x, ctx, path + '/' + esc(k)); if (y !== undefined) o[k] = y; } return o; }
  return v;
}
export function fromWire(rule: Rule, w: J, ctx: SyncCtx, path = ''): J {
  if (w === undefined) return undefined;
  if (rule.k === 'sum') { ctx.slots[path] = { ...w }; return (Object.values(w) as number[]).reduce((s, n) => s + n, 0); }
  if (rule.k === 'fifo') { ctx.ords[path] = { ...w }; return (Object.entries(w) as [string, number][]).sort((x, y) => (x[1] - y[1]) || cmpStr(x[0], y[0])).map(([k]) => k).slice(-rule.cap); }
  if ((rule.k === 'obj' || rule.k === 'gv') && isObj(w)) { const o: Obj = {}; for (const [k, x] of Object.entries(w)) { const y = fromWire(fld(rule, k), x, ctx, path + '/' + esc(k)); if (y !== undefined) o[k] = y; } return o; }
  if (rule.k === 'map' && isObj(w)) { const o: Obj = {}; for (const [k, x] of Object.entries(w)) { const y = fromWire(rule.of, x, ctx, path + '/' + esc(k)); if (y !== undefined) o[k] = y; } return o; }
  return w;
}
export const newCtx = (dev: string, tick?: () => number): SyncCtx => ({ slots: {}, ords: {}, dev, tick: tick ?? (() => 0) });
