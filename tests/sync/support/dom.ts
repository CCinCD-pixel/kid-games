// dom.ts — DOMINANCE: merge(a,b) must be >= a (and >= b) in EACH rule's own order. The lattice laws alone (idempotent/commutative/associative) are also satisfied by
// "semantically wrong but lawful" merges (max->min, or->and, union->intersection, rank reversed); dominance kills them.
import type { Rule, Stamp } from '@kit/sync/rules';
import { canon, cmpStamp } from '@kit/sync/merge';

type Stamps = Record<string, Stamp>;
const isObj = (x: any): boolean => x !== null && typeof x === 'object' && !Array.isArray(x);
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpPick = (rule: Extract<Rule, { k: 'pick' }>, a: any, b: any): number => { const ra = rule.rank(a), rb = rule.rank(b); for (let i = 0; i < ra.length; i++) { if (ra[i] !== rb[i]) return ra[i]! - rb[i]!; } return cmpStr(canon(a), canon(b)); };
const ix = (rule: Extract<Rule, { k: 'rank' }>, v: any): number => rule.order.indexOf(v);
const esc = (k: string): string => k.replace(/~/g, '~0').replace(/\//g, '~1');
// returns the list of violations of "m >= x" (m = merged value, x = one input) under `rule`; mst/xst = lww stamps
export function dominates(rule: Rule, m: any, x: any, mst: Stamps, xst: Stamps, path = '', out: string[] = []): string[] {
  if (x === undefined) return out;
  const bad = (why: string): void => { out.push(`${path || '/'} ${rule.k}: ${why} merged=${canon(m)} input=${canon(x)}`); };
  if (rule.k === 'local' || rule.k === 'any') return out;
  if (m === undefined) { bad('merged lost the value'); return out; }
  switch (rule.k) {
    case 'max': if (typeof m === typeof x ? m < x : typeof m !== 'string') bad('merged below input'); break;
    case 'min': if (typeof m === typeof x ? m > x : typeof m !== 'string') bad('merged above input'); break;
    case 'or': if (x === true && m !== true) bad('true was lost'); break;
    case 'set': if (m.length < rule.cap && !x.every((e: any) => m.some((y: any) => canon(y) === canon(e)))) bad('member lost'); break;
    case 'rank': { const d = ix(rule, m) - ix(rule, x); if (d < 0 || (d === 0 && cmpStr(canon(m), canon(x)) < 0)) bad('rank went down'); break; }
    case 'longer': if (m.length < x.length) bad('shorter'); break;
    case 'maxArr': x.forEach((v: number, i: number) => { if ((m[i] ?? -Infinity) < v) bad(`slot ${i} lowered`); }); break;
    case 'sum': for (const [k, v] of Object.entries<number>(x)) if ((m[k] ?? 0) < v) bad(`slot ${k} lowered`); break;
    case 'pick': if (cmpPick(rule, m, x) < 0) bad('less progress'); break;
    case 'lww': { const a = xst[path], b = mst[path]; if (a && (!b || cmpStamp(b, a) < 0)) bad('stamp went down'); break; }
    case 'ring': for (const e of x) { const k = rule.key(e); const f = m.find((y: any) => rule.key(y) === k); if (f) { if (cmpStr(canon(f), canon(e)) < 0) bad('ring element replaced by a lesser'); } else if (!(m.length >= rule.cap && m.every((y: any) => rule.ord(y) > rule.ord(e) || (rule.ord(y) === rule.ord(e) && rule.key(y) >= k)))) bad(`ring element ${k} dropped without being outranked`); } break;
    case 'fifo': for (const [k, o] of Object.entries<number>(x)) { if (k in m) { if (m[k] < o) bad(`id ${k} lc lowered`); } else { const me = Object.entries<number>(m); if (!(me.length >= rule.cap && me.every(([k2, o2]) => o2 > o || (o2 === o && k2 >= k)))) bad(`id ${k} dropped without being outranked`); } } break;
    case 'gv': {
      if (!isObj(m) || !isObj(x)) break; const gm = m.g ?? 0, gx = x.g ?? 0; if (gm < gx) bad('generation went down');
      for (const [k, v] of Object.entries(x)) { const r = rule.fields[k] ?? rule.rest; if (rule.guarded.includes(k) && gm > gx) continue; dominates(r, m[k], v, mst, xst, path + '/' + esc(k), out); }
      break;
    }
    case 'obj': if (isObj(m) && isObj(x)) for (const [k, v] of Object.entries(x)) dominates(rule.fields[k] ?? rule.rest, m[k], v, mst, xst, path + '/' + esc(k), out); break;
    case 'map': if (isObj(m) && isObj(x)) for (const [k, v] of Object.entries(x)) dominates(rule.of, m[k], v, mst, xst, path + '/' + esc(k), out); break;
  }
  return out;
}
