// Explicit unit assertions of the v1.1 semantics the property suites exercise statistically: numeric limits (2^53), Lamport stamps, per-record generations, slot generations (resets),
// FIFO windows, step pointers by catalog order, per-device sum slots over the wire transform, overlay neutrality, hostile input.
import { describe, expect, it } from 'vitest';
import { R, type Rule } from '@kit/sync/rules';
import * as M from '@kit/sync/merge';
import { bind } from './support/replica';

const { merge, coerce, overlay, strip, cmpStamp, canon, emptyState, toWire, fromWire, newCtx, coverage, ruleLeafPaths, lwwPaths } = M;
const w = (d: unknown, st: Record<string, [number, string]> = {}, g?: [number, string]) => ({ d, st, ...(g ? { g } : {}) });
const merged = (rule: Rule, a: unknown, b: unknown) => merge(rule, w(a), w(b)).d;

describe('rule vocabulary', () => {
  it('builders are plain data (inspectable, hashable) and gv always carries the generation field', () => {
    expect(R.max).toEqual({ k: 'max' });
    expect(R.setN(7)).toEqual({ k: 'set', cap: 7 });
    expect(R.set).toEqual({ k: 'set', cap: 4000 });
    const g = R.gv<any>({ st: R.rank(['open', 'done']) }, ['st']) as Extract<Rule, { k: 'gv' }>;
    expect(Object.keys(g.fields).sort()).toEqual(['g', 'st']);
    expect(g.guarded).toEqual(['st']);
    expect((R.obj<any>({ a: R.max }) as Extract<Rule, { k: 'obj' }>).rest).toEqual({ k: 'any' });
  });
  it('ruleLeafPaths lists what the TYPE promises, one entry per leaf', () => {
    expect(ruleLeafPaths(R.obj<any>({ a: R.max, m: R.map(R.obj<any>({ x: R.or })) }))).toEqual(['$.a:max', '$.m.*.x:or']);
  });
});

describe('numeric limits and stamps (v1.1: 2^53, not 1e12)', () => {
  const rule = R.obj<any>({ n: R.max, lo: R.min, f: R.fifo(5), r: R.ring<any>({ key: (x) => String(x.id), ord: (x) => x.t, cap: 5 }), l: R.lww });
  it('epoch-ms 1.79e12 and 2^53-1 survive max/min/ring/fifo; 2^53 and Infinity are refused', () => {
    expect(merged(rule, { n: 1.79e12 }, { n: 5 }).n).toBe(1.79e12);
    expect(merged(rule, { n: 2 ** 53 - 1 }, { n: 2 ** 53 - 2 }).n).toBe(2 ** 53 - 1);
    expect(merged(rule, { lo: 2 ** 53 - 1 }, { lo: 3 }).lo).toBe(3);
    expect(coerce(R.max, 2 ** 53)).toBeUndefined();
    expect(coerce(R.max, Infinity)).toBeUndefined();
    expect(coerce(R.max, Number.NaN)).toBeUndefined();
    expect(merged(rule, { r: [{ id: 'a', t: 1.79e12 }] }, { r: [{ id: 'b', t: 1.79e12 + 1 }] }).r.map((x: any) => x.id)).toEqual(['a', 'b']);
    expect(merged(rule, { f: { a: 2 ** 53 - 1 } }, { f: { b: 1 } }).f).toEqual({ b: 1, a: 2 ** 53 - 1 });
  });
  it('Lamport stamps compare counter first, then device id; the later stamp wins whatever the value is', () => {
    expect(cmpStamp([2, 'A'], [1, 'Z'])).toBeGreaterThan(0);
    expect(cmpStamp([1, 'A'], [1, 'B'])).toBeLessThan(0);
    const a = w({ l: 'old' }, { '/l': [1, 'A'] }), b = w({ l: 'new' }, { '/l': [2, 'B'] });
    expect(merge(rule, a, b).d.l).toBe('new'); expect(merge(rule, b, a).d.l).toBe('new');
    expect(merge(rule, a, b).st['/l']).toEqual([2, 'B']);
  });
  it('stamps beyond 2^53 or with a long device id are discarded (the value then loses to any stamped one)', () => {
    const bad = w({ l: 'x' }, { '/l': [2 ** 53 + 2, 'A'] as any }); const ok = w({ l: 'y' }, { '/l': [1, 'B'] });
    expect(merge(rule, bad, ok).d.l).toBe('y');
  });
});

describe('FIFO windows', () => {
  const f3 = R.obj<any>({ f: R.fifo(3) });
  it('keeps the NEWEST cap ids by lc, never the alphabetically last; associative at cap 3', () => {
    const a = { f: { a: 1, b: 2, c: 3 } }, b = { f: { d: 4, e: 5 } }, c = { f: { a: 9 } };
    expect(Object.keys(merged(f3, a, b).f)).toEqual(['c', 'd', 'e']);
    expect(canon(merged(f3, merged(f3, a, b), c))).toBe(canon(merged(f3, a, merged(f3, b, c))));
    expect(merged(f3, merged(f3, a, b), c).f).toEqual({ d: 4, e: 5, a: 9 });
  });
  it('wire transform: local order oldest->newest by (lc,id), ids stamped once', () => {
    let lc = 0; const ctx = newCtx('A', () => ++lc);
    const wire = toWire(f3, { f: ['x', 'y'] }, ctx); expect(wire).toEqual({ f: { x: 1, y: 2 } });
    expect(toWire(f3, { f: ['x', 'y', 'z'] }, ctx)).toEqual({ f: { x: 1, y: 2, z: 3 } });   // x, y keep their stamps
    expect(fromWire(f3, { f: { z: 3, x: 1, y: 2 } }, newCtx('B'))).toEqual({ f: ['x', 'y', 'z'] });
  });
});

describe('step pointers follow the catalog (never the string order)', () => {
  const order = ['G1.1', 'G1.2', 'G1.9', 'G1.10', 'B1', 'L08.1'];
  const rule = R.obj<any>({ s: R.rank(order) });
  it('G1.10 is after G1.9 and B1 after G1.10; unknown tokens are lowest-rank passengers that are never deleted', () => {
    expect(merged(rule, { s: 'G1.9' }, { s: 'G1.10' }).s).toBe('G1.10');
    expect(merged(rule, { s: 'G1.10' }, { s: 'B1' }).s).toBe('B1');
    expect(merged(rule, { s: 'future-step' }, { s: 'G1.1' }).s).toBe('G1.1');
    expect(merged(rule, { s: 'future-step' }, {}).s).toBe('future-step');
  });
});

describe('record generations (g++) and slot generations (reset)', () => {
  const node = R.obj<any>({ n: R.map(R.gv<any>({ st: R.rank(['open', 'skipped', 'done']), why: R.rank(['calib', 'cert']), stars: R.max }, ['st', 'why'])) });
  it('a higher record generation wins wholesale, including an UNSET guarded key; stars stay max', () => {
    const stale = { n: { a: { st: 'done', why: 'cert', stars: 3 } } }, reopened = { n: { a: { st: 'open', g: 1, stars: 1 } } };
    const out = merged(node, stale, reopened).n.a;
    expect(out).toEqual({ st: 'open', g: 1, stars: 3 });
    expect(merged(node, reopened, stale).n.a).toEqual(out);
    const later = { n: { a: { st: 'done', g: 1, stars: 2 } } };
    expect(merged(node, reopened, later).n.a.st).toBe('done');             // same g: normal rank rules (done beats open)
  });
  it('without g++ the re-open is reverted (this is the bug the audit found in mars cert.ts:100 / adaptive.ts:159)', () => {
    expect(merged(node, { n: { a: { st: 'done', stars: 1 } } }, { n: { a: { st: 'open', stars: 1 } } }).n.a.st).toBe('done');
  });
  it('slot reset: the higher generation discards the older side wholesale; X fields stay local; equal generations merge normally', () => {
    const rule = R.obj<any>({ best: R.max, keep: R.local, cards: R.set });
    const old = w({ best: 9, cards: ['a'] }), reset = w({ best: 0, cards: [] }, {}, [5, 'A']);
    expect(merge(rule, old, reset).d).toEqual({ best: 0, cards: [] });
    expect(merge(rule, reset, old).d).toEqual({ best: 0, cards: [] });
    expect(merge(rule, reset, old).g).toEqual([5, 'A']);
    expect(merge(rule, w({ best: 2 }, {}, [5, 'A']), w({ best: 3 }, {}, [5, 'A'])).d).toEqual({ best: 3 });
    const local = { best: 9, keep: 'mine', cards: ['a'] };
    expect(overlay(rule, local, merge(rule, old, reset).d, { replace: true })).toEqual({ best: 0, keep: 'mine', cards: [] });
  });
});

describe('sum slots (exact under concurrent increments)', () => {
  const rule = R.obj<any>({ plays: R.sum });
  it('two devices incrementing offline add up exactly; re-merging never double counts; a smaller echo never lowers a slot', () => {
    const A = newCtx('A'), B = newCtx('B');
    const wa = toWire(rule, { plays: 3 }, A), wb = toWire(rule, { plays: 4 }, B);
    const m = merge(rule, w(wa), w(wb));
    expect(fromWire(rule, m.d, A)).toEqual({ plays: 7 });
    expect(canon(merge(rule, m, w(wa)).d)).toBe(canon(m.d));
    expect(merge(rule, m, w({ plays: { A: 1 } })).d.plays).toEqual({ A: 3, B: 4 });
    // after absorbing the other device's slot, my next local value is relative to what I already know
    expect(toWire(rule, { plays: 8 }, A)).toEqual({ plays: { A: 4, B: 4 } });
  });
  it('activeMs 2.6e9 + 1e9 and the 2^40 slot ceiling', () => {
    expect(merged(rule, { plays: { A: 2.6e9 } }, { plays: { B: 1e9 } }).plays).toEqual({ A: 2.6e9, B: 1e9 });
    expect(coerce(R.sum, { A: 2 ** 40 })).toEqual({ A: 2 ** 40 });
    expect(coerce(R.sum, { A: 2 ** 40 + 1, B: -1, C: 1.5, DDDDDDDDDDDDDDDDD: 1 })).toEqual({});
  });
});

describe('overlay never invents or deletes what the sanitiser cannot represent', () => {
  it('absent container fields stay absent (self-merge neutrality on real defaults)', () => {
    const rule = R.obj<any>({ a: R.max, m: R.map(R.max), o: R.obj<any>({ x: R.or }) });
    expect(overlay(rule, { a: 1 }, merge(rule, w(strip(rule, { a: 1 })), emptyState()).d)).toEqual({ a: 1 });
  });
  it('a legacy null under min and a 130-char set member survive a write-back', () => {
    const rule = R.obj<any>({ best: R.min, cards: R.set });
    const local = { best: null, cards: ['x'.repeat(130), 'ok'] };
    expect(overlay(rule, local, merge(rule, w(strip(rule, local)), emptyState()).d)).toEqual(local);
  });
  it('a representable value the merge result lacks IS removed (generation-guarded unset)', () => {
    const rule = R.obj<any>({ a: R.max, b: R.max });
    expect(overlay(rule, { a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
  });
});

describe('hostile input', () => {
  it('prototype keys, deep nesting and oversize values are dropped, never thrown, never polluting', () => {
    const rule = R.obj<any>({ m: R.map(R.lww), a: R.any });
    const evil = JSON.parse('{"m":{"__proto__":{"polluted":1},"ok":1},"a":{"__proto__":{"p":1},"x":1},"constructor":{"y":1}}');
    const out = merge(rule, w(evil), emptyState());
    expect(({} as any).polluted).toBeUndefined(); expect(({} as any).p).toBeUndefined();
    expect(Object.keys(out.d.m)).toEqual(['ok']);
    let deep: any = 1; for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(() => merge(rule, w({ a: deep }), emptyState())).not.toThrow();
    expect(coerce(R.lww, 'x'.repeat(20000))).toBeUndefined();
  });
  it('lwwPaths finds registers through maps and records; coverage reports leaves reached only by any', () => {
    const rule = R.obj<any>({ a: R.map(R.obj<any>({ v: R.lww })) });
    expect(Object.keys(lwwPaths(rule, { a: { 'k/1': { v: 1 } } }))).toEqual(['/a/k~11/v']);
    expect(coverage(R.obj<any>({ a: R.max }), { a: 1, extra: 2 }).any).toEqual(['$.extra']);
  });
});

describe('replica round trip', () => {
  const { Replica, Server1 } = bind(M);
  it('two devices converge on a store with every rule family in 3 syncs', () => {
    const rule = R.obj<any>({ best: R.min, plays: R.sum, done: R.fifo(4), tier: R.lww, flags: R.map(R.or), local: R.local });
    const base = { best: 99, plays: 0, done: [], tier: 1, flags: {}, local: 'x' }; const sv = new Server1();
    const A = new Replica(rule, 'A', base, base), B = new Replica(rule, 'B', base, base);
    A.data.best = 40; A.data.plays = 2; A.data.done = ['p1', 'p2']; A.data.tier = 3; A.data.flags = { t1: true }; A.data.local = 'A-only';
    B.data.best = 55; B.data.plays = 5; B.data.done = ['p3']; B.data.flags = { t2: true };
    A.sync(sv); B.sync(sv); A.sync(sv);
    const norm = (d: any) => ({ ...d, done: [...d.done].sort() });
    expect(norm(strip(rule, A.data))).toEqual(norm(strip(rule, B.data)));
    expect(A.data).toMatchObject({ best: 40, plays: 7, tier: 3, flags: { t1: true, t2: true }, local: 'A-only' });
    expect(B.data.local).toBe('x');
    expect(sv.puts).toBeLessThanOrEqual(3);
  });
});
