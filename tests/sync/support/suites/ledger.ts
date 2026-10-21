// ledger.ts — properties of the coin ledger contract (docs/specs/sync.md §8.4). Port of ledger-props.mjs v1.1 (306 528 checks in the prototype).
//  union: idempotent / commutative / associative EVEN WHEN one id carries different content; balance is a pure function of the SET; balance >= 0;
//  earn/grant never lower, spend never raises, a spend of a lowers by AT MOST a (the "visible balance" bound); clamp only forgives; natural-id collisions are decided by (lc,d) not by amount text;
//  id validator accepts every real id shape; compaction by re-encoding keeps the fold; seeded Lamport => a fresh device's earn is never absorbed.
import { rng, int, pick } from '../gen';
import type * as Ledger from '@kit/sync/ledger';

export type LedgerImpl = typeof Ledger;
export interface LedgerResult { n: number; failures: string[] }

export function runLedger(L: LedgerImpl, rounds = 20000): LedgerResult {
  const { unionLedger, balance, rawSum, validEv, validNatural, ID_RE, packSegments, unpackSegments, cmpEv, natEvent } = L;
  const r = rng(4242); const out: LedgerResult = { n: 0, failures: [] };
  const chk = (ok: boolean, what: string, x?: unknown): void => { out.n++; if (!ok && out.failures.length < 8) out.failures.push(what + ' ' + JSON.stringify(x ?? null).slice(0, 300)); };
  const KINDS = ['earn', 'spend', 'grant'] as const;
  const mk = (id: string, kind: string, amount: number, lc: number, d: string, extra: object = {}): any => ({ id, d, lc, ts: 1790000000000 + lc, kind, amount, src: 's', ref: 'r', ...extra });
  const evs = (): any[] => Array.from({ length: int(r, 0, 14) }, () => { const id = 'e' + int(r, 0, 40); const kind = pick(r, ['earn', 'earn', 'spend', 'spend', 'grant']); return mk(id, kind, pick(r, [0, 5, 3, 8, 20, 10, 25, 60]), int(r, 0, 30), pick(r, ['A', 'B', 'C'])); });
  const j = (x: unknown): string => JSON.stringify(x);
  for (let i = 0; i < rounds; i++) {
    // ids deliberately collide WITH different content in half of the rounds (the union must still be a semilattice)
    const a = evs(), b = evs(), c = evs();
    chk(j(unionLedger(a, a)) === j(unionLedger(a, [])), 'idempotent', a);
    chk(j(unionLedger(a, b)) === j(unionLedger(b, a)), 'commutative', [a, b]);
    chk(j(unionLedger(unionLedger(a, b), c)) === j(unionLedger(a, unionLedger(b, c))), 'associative', [a, b, c]);
    const u = unionLedger(a, b), sh = [...u].sort(() => r() - 0.5);
    const B = balance(u);
    chk(B.balance === balance(sh).balance, 'permutation invariant', u);
    chk(B.balance >= 0, 'non-negative', u);
    chk(B.balance === rawSum(u) + B.forgiven, 'balance = rawSum + forgiven', u);
    chk(B.balance >= rawSum(u), 'clamp only forgives', u);
    const amt = int(r, 1, 30), lc = int(r, 0, 30);
    const earn = mk('new-earn', 'earn', amt, lc, 'B'), grant = { ...earn, id: 'new-grant', kind: 'grant' }, spend = { ...earn, id: 'new-spend', kind: 'spend' };
    chk(balance(unionLedger(u, [earn])).balance >= B.balance, 'adding an earn never lowers the balance', [u, earn]);
    chk(balance(unionLedger(u, [grant])).balance >= B.balance, 'adding a grant never lowers the balance', [u, grant]);
    chk(balance(unionLedger(u, [spend])).balance <= B.balance, 'adding a spend never raises the balance', [u, spend]);
    chk(balance(unionLedger(u, [spend])).balance >= B.balance - amt, 'a spend of a lowers by at most a', [u, spend]);
    // batch of remote events applied at a safe point: total drop <= sum of the spends in the batch
    const batch = unionLedger([], evs().map((e) => ({ ...e, id: 'x' + e.id }))); const after = balance(unionLedger(u, batch)).balance;
    const spends = batch.filter((e) => e.kind === 'spend').reduce((s, e) => s + e.amount, 0);
    chk(after >= B.balance - spends, 'visible drop is bounded by the arriving spends', [u, batch]);
    if (batch.every((e) => e.kind !== 'spend')) chk(after >= B.balance, 'a batch without spends never lowers the balance', [u, batch]);
    // compaction by re-encoding keeps the set (and so the fold), also with a late low-lc event arriving afterwards
    const segs = packSegments(u, 3), late = mk('late-1', pick(r, KINDS), int(r, 0, 20), 0, 'Z');
    chk(j(unpackSegments(segs)) === j(u), 'pack/unpack identity', u);
    chk(balance(unionLedger(unpackSegments(segs), [late])).balance === balance(unionLedger(u, [late])).balance, 'late event after packing', [u, late]);
    // seeded Lamport: a device whose counter starts above every existing lc is never absorbed: its earn adds exactly amt
    const top = u.reduce((m, e) => Math.max(m, e.lc), 0); const fresh = mk('fresh-earn', 'earn', amt, top + 1 + int(r, 0, 5), 'N');
    chk(balance(unionLedger(u, [fresh])).balance === B.balance + amt, 'a late-sorting earn is fully visible', [u, fresh]);
  }
  // same id, different content: winner decided by (lc,d), NOT by the amount text (60 vs 5, 9 vs 10), identical in both orders
  for (const [x, y] of [[60, 5], [9, 10], [5, 60], [100, 99]] as const) {
    const p = mk('first:g:n1', 'earn', x, 10, 'ipad'), q = mk('first:g:n1', 'earn', y, 12, 'phone');
    const w1 = unionLedger([p], [q])[0]!, w2 = unionLedger([q], [p])[0]!;
    chk(w1.d === 'ipad' && w2.d === 'ipad' && w1.amount === x, 'collision winner = smaller (lc,d), not amount', [x, y, w1]);
  }
  for (let i = 0; i < 3000; i++) {   // random collisions: the winner is ALWAYS the smaller (lc, d) whatever the JSON text / amount / device names look like
    const p = mk('first:g:n2', 'earn', int(r, 1, 99), int(r, 0, 9), pick(r, ['zed', 'abc', 'ipad', 'phone', 'a1b2c3d4', 'ffffffff'])), q = mk('first:g:n2', 'earn', int(r, 1, 99), int(r, 0, 9), pick(r, ['zed', 'abc', 'ipad', 'phone', 'a1b2c3d4', 'ffffffff']));
    const want = cmpEv(p, q) <= 0 ? p : q; const w1 = unionLedger([p], [q])[0]!, w2 = unionLedger([q], [p])[0]!;
    chk(w1.d === w2.d && w1.lc === w2.lc && w1.d === want.d && w1.lc === want.lc, 'collision winner is the smaller (lc,d) in both orders', [p, q, w1]);
  }
  // natural-id contract: canonical events (d='n', lc=0, ts=0, table amount) — identical bytes on every device, so first-arrival dedupe on the server cannot split the devices
  {
    const table = { 'first:g:n1': { kind: 'earn' as const, amount: 24, src: 'mission.new', ref: 'n1' } }; const e = natEvent('first:g:n1', table['first:g:n1']);
    chk(validEv(e) && validNatural(e, table) && !validNatural({ ...e, amount: 25 }, table) && !validNatural({ ...e, lc: 7 }, table) && !validNatural({ ...e, d: 'ipad' }, table) && !validNatural(natEvent('m:x:y', { kind: 'earn', amount: 1, src: 's', ref: 'r' }), table), 'natural-id contract');
    chk(JSON.stringify(natEvent('first:g:n1', table['first:g:n1'])) === JSON.stringify(natEvent('first:g:n1', table['first:g:n1'])) && unionLedger([e], [e]).length === 1, 'canonical natural event is byte-identical on every device');
  }
  // id shapes that really occur (star-pets 3.2, mars nodes, chess steps, xiangqi lessons)
  const goodIds = ['first:mars-base:orbit.O1.0', 'first:military-chess:items.T12.crossing', 'a1b2c3d4.lx3k9f2a.0a1', 'm:node:orbit.O1.0', 'm:badge:B3', 'rf:a1b2c3d4.lx3k9f2a.0a1', 'egg:rover', 'g:item-lamp', 'u:shelf-2', 'd1:2026-10-19', 'retro:mars-base:G1.10', 'first:chess:C1.8.2', 'e:A1:3', 'abc'];
  const badIds = ['', 'ab', 'a b', 'x'.repeat(97), '汉字id', 'a/b', 'a|b', 'a;b', "a'b", 'a\nb'];
  for (const id of goodIds) chk(ID_RE.test(id) && validEv(mk(id, 'earn', 1, 1, 'A')), 'good id ' + id, id);
  for (const id of badIds) chk(!ID_RE.test(id), 'bad id ' + id, id);
  chk(goodIds.every((x) => x.length <= 96) && 'first:military-chess:'.length + 40 <= 96, 'longest realistic id fits 96');
  // event validator
  for (const bad of [mk('abc', 'earn', -1, 1, 'A'), mk('abc', 'earn', 100001, 1, 'A'), mk('abc', 'x', 1, 1, 'A'), mk('abc', 'earn', 1.5, 1, 'A'), mk('abc', 'earn', 1, -1, 'A'), mk('abc', 'earn', 1, 1.5, 'A'), mk('abc', 'earn', 1, 1, 'A B'), mk('abc', 'earn', 1, 1, 'A', { src: 'x'.repeat(33) }), mk('abc', 'earn', 1, 1, 'A', { ts: -5 })]) chk(!validEv(bad), 'invalid event rejected', bad);
  chk(validEv(mk('abc', 'grant', 0, 0, 'A')), 'amount 0 grant is valid');
  return out;
}
