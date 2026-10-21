// mutate.ts — EXECUTABLE mutants of the real merge/ledger sources. A mutant is a set of exact text patches applied to kit/sync/<file>.ts; the patched source is transpiled with the
// TypeScript compiler API (CommonJS) and evaluated in memory, so production code carries no test hooks and no environment switches. Every anchor must match EXACTLY once: if the
// source is refactored without updating the mutant table, the suite fails loudly instead of silently testing nothing.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as contract from '@kit/sync/contract';
import type { MergeImpl } from './replica';
import type { LedgerImpl } from './suites/ledger';

const SRC = fileURLToPath(new URL('../../../kit/sync/', import.meta.url));
export type Patch = readonly [find: string, replace: string];
export interface Mutant { name: string; file: 'merge' | 'ledger'; /** lattice-valid but semantically wrong: the idempotent/commutative/associative laws alone cannot see it */ lawful?: boolean; why: string; patches: Patch[] }

const MAX_FIND = "return typeof a === 'string' ? a : b; return a >= b ? a : b; }";
const MIN_FIND = "return typeof a === 'string' ? a : b; return a <= b ? a : b; }";
export const MERGE_MUTANTS: Mutant[] = [
  { name: 'max-sum', file: 'merge', why: 'max adds instead of taking the larger', patches: [[MAX_FIND, "return typeof a === 'string' ? a : b; return typeof a === 'number' && typeof b === 'number' ? a + b : (a >= b ? a : b); }"]] },
  { name: 'lww-left', file: 'merge', why: 'equal stamps: left side wins (order dependent)', patches: [['else { win = ta; wv = cmpStr(canon(a), canon(b)) >= 0 ? a : b; }', 'else { win = ta; wv = a; }']] },
  { name: 'or-left', file: 'merge', why: 'or ignores the right side', patches: [["case 'or': return (a === true || b === true) ? true : (a ?? b);", "case 'or': return a ?? b;"]] },
  { name: 'ring-first', file: 'merge', why: 'ring keeps the first element with a key instead of the greater', patches: [['if (p === undefined || cmpStr(canon(x), canon(p)) > 0) m.set(k, x);', 'if (p === undefined) m.set(k, x);']] },
  { name: 'set-left', file: 'merge', why: 'set merge ignores the right side', patches: [["case 'set': { return [...new Set([...(a ?? []), ...(b ?? [])])].sort((x, y) => cmpStr(canon(x), canon(y))).slice(0, rule.cap ?? 4000); }", "case 'set': { return a ?? b; }"]] },
  { name: 'stamp-drop', file: 'merge', why: 'the merge result loses its lww stamps', patches: [['return { d, st: so, ...(ga !== ZERO ? { g: ga } : {}) };', 'return { d, st: {}, ...(ga !== ZERO ? { g: ga } : {}) };']] },
  { name: 'max-as-min', file: 'merge', lawful: true, why: 'max takes the smaller value (a valid lattice, the wrong one)', patches: [[MAX_FIND, "return typeof a === 'string' ? a : b; return a <= b ? a : b; }"]] },
  { name: 'or-as-and', file: 'merge', lawful: true, why: 'boolean flags need BOTH sides (a flag set on one device is lost)', patches: [["case 'or': return (a === true || b === true) ? true : (a ?? b);", "case 'or': { if (a === undefined) return b; if (b === undefined) return a; return a && b; }"]] },
  { name: 'set-intersect', file: 'merge', lawful: true, why: 'union replaced by intersection', patches: [["case 'set': { return [...new Set([...(a ?? []), ...(b ?? [])])].sort((x, y) => cmpStr(canon(x), canon(y))).slice(0, rule.cap ?? 4000); }", "case 'set': { if (a === undefined) return b; if (b === undefined) return a; return a.filter((x: J) => b.some((y: J) => canon(y) === canon(x))); }"]] },
  { name: 'rank-reversed', file: 'merge', lawful: true, why: 'rank keeps the EARLIER catalog step', patches: [['const d = rankKey(rule, a) - rankKey(rule, b); if (d) return d > 0 ? a : b;', 'const d = rankKey(rule, a) - rankKey(rule, b); if (d) return d > 0 ? b : a;']] },
  { name: 'min-as-max', file: 'merge', why: 'min takes the larger value', patches: [[MIN_FIND, "return typeof a === 'string' ? a : b; return a >= b ? a : b; }"]] },
  { name: 'pick-reversed', file: 'merge', why: 'pick keeps the record with LESS progress', patches: [['return cmpPick(rule, a, b) >= 0 ? a : b; }', 'return cmpPick(rule, a, b) <= 0 ? a : b; }']] },
  { name: 'longer-shorter', file: 'merge', why: 'longer keeps the shorter array', patches: [['const d = a.length - b.length; if (d) return d > 0 ? a : b;', 'const d = a.length - b.length; if (d) return d < 0 ? a : b;']] },
  { name: 'fifo-min', file: 'merge', why: 'fifo keeps the OLDER lc of an id (the window never advances)', patches: [['m[k] = m[k] === undefined ? o : Math.max(m[k]!, o);', 'm[k] = m[k] === undefined ? o : Math.min(m[k]!, o);']] },
  { name: 'sum-as-add', file: 'merge', why: 'per-device slots are added instead of max-ed (double counting on re-merge)', patches: [['o[k] = Math.max(a?.[k] ?? 0, b?.[k] ?? 0);', 'o[k] = (a?.[k] ?? 0) + (b?.[k] ?? 0);']] },
  { name: 'gv-ignore-g', file: 'merge', why: 'record generation ignored (a re-opened node is reverted)', patches: [['if (rule.guarded.includes(k) && ga !== gb) x =', 'if (rule.guarded.includes(k) && ga !== gb && false) x =']] },
  { name: 'gen-ignore', file: 'merge', why: 'slot generation ignored (a reset is resurrected)', patches: [['c = cmpStamp(ga, gb);', 'c = 0;']] },
  { name: 'cap1e12', file: 'merge', why: 'v1.0 numeric limit: epoch-ms (1.79e12) treated as garbage', patches: [['export const LIMIT = MAX_SAFE;', 'export const LIMIT = 1e12;']] },
  { name: 'sumcap1e9', file: 'merge', why: 'v1.0 slot limit: sokoban activeMs (2.6e9) dropped', patches: [['const lim = SUM_SLOT_MAX;', 'const lim = 1e9;']] },
  { name: 'overlay-delete', file: 'merge', why: 'write-back deletes local values the sanitiser could not represent', patches: [["if ((rule.k === 'set' || rule.k === 'ring') && !ctx.replace && Array.isArray(local)", "if (false && (rule.k === 'set' || rule.k === 'ring') && !ctx.replace && Array.isArray(local)"], ['if (rep === undefined && local !== undefined && !ctx.replace && coerce(rule, local) === undefined) {', 'if (false && rep === undefined && local !== undefined && !ctx.replace && coerce(rule, local) === undefined) {']] },
  { name: 'overlay-keep-all', file: 'merge', why: 'write-back never removes a local value (a generation-guarded unset is lost)', patches: [['if (rep === undefined && local !== undefined && !ctx.replace && coerce(rule, local) === undefined) {', 'if (rep === undefined && local !== undefined && !ctx.replace) {']] },
  { name: 'rank-string', file: 'merge', why: 'step pointers compared as plain strings (G1.9 > G1.10)', patches: [['const rankKey = (rule: RuleRank, v: J): number => ixOf(rule).get(v) ?? -1;', "const rankKey = (rule: RuleRank, v: J): number => (typeof v === 'string' ? 0 : ixOf(rule).get(v) ?? -1);"]] },
];
export const LEDGER_MUTANTS: Mutant[] = [
  { name: 'union-json', file: 'ledger', why: 'same-id collisions decided by JSON text (amount "60" < "5")', patches: [['if (c < 0) m.set(e.id, e);', 'if (JSON.stringify(e) < JSON.stringify(p)) m.set(e.id, e);']] },
];

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;
/** Apply the patches to the real source (each anchor must match exactly once), transpile and evaluate. */
export function loadMutant<T>(m: Pick<Mutant, 'file' | 'patches'>): T {
  let src = fs.readFileSync(`${SRC}${m.file}.ts`, 'utf8');
  for (const [find, repl] of m.patches) { const n = count(src, find); if (n !== 1) throw new Error(`mutant anchor matched ${n}x (must be exactly 1) in ${m.file}.ts: ${find.slice(0, 80)}`); src = src.replace(find, () => repl); }
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const req = (spec: string): unknown => { if (spec === './contract') return contract; throw new Error('mutant module requires ' + spec); };
  new Function('exports', 'require', 'module', js)(mod.exports, req, mod);
  return mod.exports as T;
}
export const loadMerge = (m: Mutant): MergeImpl => loadMutant<MergeImpl>(m);
export const loadLedger = (m: Mutant): LedgerImpl => loadMutant<LedgerImpl>(m);
