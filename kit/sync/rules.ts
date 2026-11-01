// kit/sync/rules.ts — the declarative merge-rule vocabulary (docs/specs/sync.md §2-2, §4.1) and its compile-time layer.
//
//   RuleOf<T>   a rule that is valid for a value of type T (phantom, contravariant):  max: RuleOf<number|string>, or: RuleOf<boolean>, rank(['a','b']): RuleOf<'a'|'b'>
//   Rules<T>    one rule PER KEY of T (every key, optionals included)  ->  adding a field to the save type without a rule is a COMPILE error
//   obj<T>(...)/gv<T>(...)  are the only record builders and take Rules<T>; a rank() whose order lacks a member of a TS union is a compile error too (sync.md §4.3)
//
// Letters in comments follow the spec table: M max · m min · O boolean-rises · U union · K enum-higher · L LWW · S per-device sum · R ring · F FIFO · G generation-guarded · P progress-pick · X local.
// Zero dependencies. The runtime shape is plain data (no classes), so a rule tree can be inspected, hashed and walked by the coverage test.

/** Lamport stamp [counter, device]; compared counter first, then device id as a string. */
export type Stamp = readonly [number, string];

export type Rule =
  | { readonly k: 'max' } | { readonly k: 'min' } | { readonly k: 'or' } | { readonly k: 'lww' } | { readonly k: 'sum' }
  | { readonly k: 'local' } | { readonly k: 'any' } | { readonly k: 'longer' } | { readonly k: 'maxArr' }
  | { readonly k: 'set'; readonly cap: number }
  | { readonly k: 'rank'; readonly order: readonly (string | number)[] }
  | { readonly k: 'pick'; readonly rank: (v: any) => readonly number[] }
  | { readonly k: 'fifo'; readonly cap: number }
  | { readonly k: 'ring'; readonly key: (e: any) => string; readonly ord: (e: any) => number; readonly cap: number; readonly gen?: (r: () => number) => unknown }
  | { readonly k: 'map'; readonly of: Rule }
  | { readonly k: 'obj'; readonly fields: Readonly<Record<string, Rule>>; readonly rest: Rule }
  | { readonly k: 'gv'; readonly fields: Readonly<Record<string, Rule>>; readonly guarded: readonly string[]; readonly rest: Rule };

export type RuleKind = Rule['k'];
export type RuleOf<T> = Rule & { readonly _t?: (x: T) => void };
export type Rules<T> = { [K in keyof T]-?: RuleOf<NonNullable<T[K]>> };

const mk = <T>(r: Rule): RuleOf<T> => r;
export const max: RuleOf<number | string> = mk({ k: 'max' });        // M: counters, best-of, epoch-ms; strings compare as strings (ISO dates)
export const min: RuleOf<number | string> = mk({ k: 'min' });        // m: lowest-is-best (steps, times); null (legacy "never") is kept locally, never synced
export const or: RuleOf<boolean> = mk({ k: 'or' });                  // O: flags that only rise (done, seen, unlocked)
export const set: RuleOf<readonly (string | number)[]> = mk({ k: 'set', cap: 4000 });   // U: union, canonical sort; ONLY for monotone collections
export const lww: RuleOf<any> = mk({ k: 'lww' });                    // L: whole value, last Lamport stamp wins (anything the game can lower, replace or null)
export const sum: RuleOf<number> = mk({ k: 'sum' });                 // S: per-device slots {dev:n}, value = sum (exact under concurrent increments)
export const local: RuleOf<any> = mk({ k: 'local' });                // X: never leaves the device
export const any: RuleOf<any> = mk({ k: 'any' });                    // escape hatch for unknown future fields only; the coverage test forbids it on every known leaf
export const longer: RuleOf<readonly unknown[]> = mk({ k: 'longer' });
export const maxArr: RuleOf<readonly number[]> = mk({ k: 'maxArr' });
/** Bounded-domain set. `cap` MUST equal the cap the game itself trims to (tests/sync/coverage.test.ts compares them). */
export const setN = (cap: number): RuleOf<readonly (string | number)[]> => mk({ k: 'set', cap });
/** K / step pointers: order = the CATALOG order (never alphabetical, never "natural"); unknown tokens are carried as lowest-rank passengers. A TS union missing from `order` is a compile error. */
export const rank = <const U extends string | number>(order: readonly U[]): RuleOf<U> => mk({ k: 'rank', order });
/** P: pick the record with the lexicographically higher progress vector. */
export const pick = <V>(rankOf: (v: V) => readonly number[]): RuleOf<V> => mk({ k: 'pick', rank: rankOf });
/** F: recency window of ids. Local = string[] oldest->newest; wire = {id: lc}. `cap` = the game's own cap. */
export const fifo = (cap: number): RuleOf<readonly string[]> => mk({ k: 'fifo', cap });
/** R: ring of records. `ord` MUST be a pure function of the element (it is part of its identity). */
export const ring = <E>(o: { key: (e: E) => string; ord: (e: E) => number; cap: number; gen?: (r: () => number) => E }): RuleOf<readonly E[]> => mk({ k: 'ring', ...o });
export const map = <V>(of: RuleOf<V>): RuleOf<Record<string, V>> => mk({ k: 'map', of });
/** Record with one rule per key (compile-checked). Unknown keys from a NEWER client fall to `rest` (default: structural merge, carried not dropped). */
export const obj = <T>(fields: Rules<T>, rest: Rule = any): RuleOf<T> => mk({ k: 'obj', fields: fields as Readonly<Record<string, Rule>>, rest });
/** G: record with a generation `g` (max). `guarded` keys follow the higher generation wholesale; the game bumps `g` where it re-opens / clears the record. */
export const gv = <R extends { g?: number }>(fields: Rules<Omit<R, 'g'>>, guarded: readonly (keyof R & string)[], rest: Rule = any): RuleOf<R> =>
  mk({ k: 'gv', fields: { g: max, ...(fields as Readonly<Record<string, Rule>>) }, guarded, rest });

/** Builder namespace in the shape of the v1.1 prototype (`R.obj`, `R.max` ...) — tests and game save.ts files may use either style. */
export const R = { max, min, or, set, setN, lww, sum, local, any, longer, maxArr, rank, pick, fifo, ring, map, obj, gv } as const;
