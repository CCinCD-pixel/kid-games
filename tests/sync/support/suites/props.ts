// props.ts — property tests of the merge functions over randomized histories (real magnitudes, resets, passengers). Port of props.mjs v1.1.
//   idempotent | commutative | associative | identity | absorb (retry) | DOMINANCE (merge(a,b) >= a and >= b in each rule's own order; kills semantically wrong lawful mutants)
//   + garbage fuzz (never throws; __proto__/constructor/toString keys) + overlay round-trip identity on the FULL real-shaped fixtures (kills cap=1e12 and overlay-delete) + replace mode.
// Returns data instead of printing: the callers (vitest) assert on it; the mutant suite just needs failures > 0. Runs against ANY merge implementation (real or mutated).
import { canon, cmpStamp } from '@kit/sync/merge';
import { R } from '@kit/sync/rules';
import { dominates } from '../dom';
import { rng, genState, pick } from '../gen';
import { PROP_TREES, SAMPLES, DEFAULTS } from '../schemas';
import type { MergeImpl } from '../replica';

export interface PropsResult { total: number; passed: number; failures: string[]; fuzzOk: number; fuzzTotal: number; per: Record<string, { cases: number; passed: number; fuzz: number }> }
export interface PropsOpts { N: number; lawsOnly?: boolean; trees?: string[]; stopAtFirst?: boolean }

export function runProps(M: MergeImpl, o: PropsOpts): PropsResult {
  const { merge, same, strip, overlay, emptyState } = M;
  const res: PropsResult = { total: 0, passed: 0, failures: [], fuzzOk: 0, fuzzTotal: 0, per: {} };
  let failCount = 0;
  const fail = (name: string, prop: string, detail: string): void => { if (res.failures.length < 8) res.failures.push(`${name} ${prop} ${detail.slice(0, 300)}`); failCount++; };
  const norm = (rule: any, s: any) => merge(rule, s, emptyState());           // sanitize + canonical form
  const names = (o.trees ?? Object.keys(PROP_TREES));
  for (const name of names) {
    const rule = PROP_TREES[name]!;
    const r = rng(0xC0FFEE ^ name.length * 7919);
    let ok = 0, n = 0;
    for (let i = 0; i < o.N; i++) {
      const consistent = i % 2 === 0;                                // odd cases: same stamp may carry different values (worst case)
      const a = genState(rule, r, consistent), b = genState(rule, r, consistent), c = genState(rule, r, consistent);
      const na = norm(rule, a), m = merge(rule, a, b);
      const checks: [string, any, any][] = [
        ['idempotent', merge(rule, a, a), na],
        ['commutative', m, merge(rule, b, a)],
        ['associative', merge(rule, m, c), merge(rule, a, merge(rule, b, c))],
        ['identity', merge(rule, a, emptyState()), na],
        ['absorb', merge(rule, m, a), m],   // re-merging an already merged input changes nothing (retry safety)
      ];
      for (const [p, x, y] of checks) { n++; if (same(x, y)) ok++; else fail(name, p, canon({ a, b, c })); }
      // dominance: merged >= each input in the rule's own order (an input from a LOWER slot generation is discarded on purpose)
      const gm = m.g ?? [0, ''];
      if (!o.lawsOnly) for (const [lab, inp] of [['a', a], ['b', b]] as const) {
        n++; const gi = inp.g ?? [0, '']; if (cmpStamp(gm, gi) > 0) { ok++; continue; }
        const nin = norm(rule, inp); const viol = dominates(rule, m.d, nin.d, m.st, nin.st);
        if (!viol.length) ok++; else fail(name, 'dominance(' + lab + ')', viol.slice(0, 2).join(' | '));
      }
      if (o.stopAtFirst && failCount) break;
    }
    // fuzz: random garbage JSON never throws and yields a sanitized state that merges idempotently (incl. prototype-pollution keys)
    let fz = 0;
    const rr = rng(77 + name.length);
    const evil = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"x":1},"toString":5,"hasOwnProperty":{"a":1},"a":{"__proto__":{"p2":1}}}');
    const junk = (): unknown => pick<unknown>(rr, [null, 1, -5, 'x', true, [], [1, 'a'], {}, { a: 1 }, { a: { b: [1, { c: null }] } }, Array(500).fill(7), 'x'.repeat(200), evil, 1e30, NaN, Infinity, 2 ** 60]);
    const fuzzN = o.stopAtFirst ? 0 : 300;
    for (let i = 0; i < fuzzN; i++) {
      const g1 = { d: i % 3 === 0 ? junk() : genState(rule, rr).d, st: { '/a': junk(), '/zz': [junk(), 'A'] }, g: i % 5 === 0 ? junk() : undefined } as any; const g2 = genState(rule, rr);
      try { const m1 = merge(rule, g1, g2); const m2 = merge(rule, m1, m1); if (!same(m1, m2)) throw new Error('fuzz non-idempotent'); if (({} as any).polluted !== undefined || ({} as any).p2 !== undefined) throw new Error('prototype polluted'); fz++; } catch (e) { fail(name, 'fuzz:' + (e as Error).message, ''); }
    }
    res.per[name] = { cases: n, passed: ok, fuzz: fz }; res.fuzzOk += fz; res.fuzzTotal += fuzzN;
    if (o.stopAtFirst && failCount) break;
  }
  // ---- overlay round trip on the real-shaped fixtures: nothing a game saved may be lost or altered by merge-with-nothing + write-back (epoch-ms, 1e13, dotted ids, null, X fields)
  let rtN = 0, rtOk = 0;
  for (const name of o.lawsOnly || o.trees ? [] : Object.keys(SAMPLES)) {
    const rule = PROP_TREES[name]!; for (const [label, local] of [['full', SAMPLES[name]], ['defaults', DEFAULTS[name]]] as const) {
      if (local === undefined) continue; const w = { d: strip(rule, local), st: {} }; const m = merge(rule, w, emptyState());
      // a slot whose rule has `sum`/`fifo` leaves is checked through the wire transform in the semantic suite; here plain-number data are compared only where no transform applies
      rtN++; const back = overlay(rule, local, m.d); const hasXform = /"k":"(sum|fifo)"/.test(JSON.stringify(rule, (_k, v) => (typeof v === 'function' ? undefined : v)));
      if (hasXform) { rtOk++; continue; }
      if (canon(back) === canon(local)) rtOk++; else fail(name, 'round-trip ' + label, canon(back).slice(0, 150) + ' vs ' + canon(local).slice(0, 150));
    }
  }
  if (rtN) { res.per['round-trip(real fixtures)'] = { cases: rtN, passed: rtOk, fuzz: 0 }; }
  // ---- overlay: keeps a local value the merge dropped; replace mode adopts the remote wholesale (X fields kept)
  if (!o.lawsOnly && !o.trees) {
    const rr = R.obj<any>({ note: R.set, keep: R.local, x: R.max }); const L = { note: ['x'.repeat(130), 'ok'], keep: 7, x: 1 }; const m = merge(rr, { d: strip(rr, L), st: {} }, emptyState());
    const kept = overlay(rr, L, m.d); const rep = overlay(rr, L, { x: 9 }, { replace: true }); let ok2 = 0;
    if (kept.note.includes('x'.repeat(130)) && kept.keep === 7) ok2++; else fail('overlay', 'keep-local', '');
    if (rep.note === undefined && rep.keep === 7 && rep.x === 9) ok2++; else fail('overlay', 'replace', canon(rep));
    res.per['overlay keep/replace'] = { cases: 2, passed: ok2, fuzz: 0 };
  }
  for (const v of Object.values(res.per)) { res.total += v.cases; res.passed += v.passed; }
  return res;
}
