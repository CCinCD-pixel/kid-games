// Suite 1/4 -- auth, rate limits, caps. Spec docs/specs/sync.md section 5 + section 7 ("load.mjs" functional + abuse parts).
// Real server.mjs processes on localhost ports >= 59000; silent; needs Node >= 22.16 (resolved by helpers/proc.ts).
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { K, ENROLL, ORIGIN, boot, cli, enroll, fam, failures, mustRun, portAllocator, postLedger, putStore, rmrf, runScenario, sealB, tmpDir, type Fam, type Srv } from './helpers/proc';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const alloc = portAllocator(59100);
let dir = '';
const running: Srv[] = [];
const up = async (extra: Record<string, string> = {}, opts: { db?: string; name?: string } = {}) => {
  const s = await boot(alloc, dir, extra, opts);
  running.push(s);
  return s;
};
const down = async (s: Srv) => {
  await s.stop();
  running.splice(running.indexOf(s), 1);
};
beforeAll(() => {
  if (mustRun) dir = tmpDir('auth');
});
afterAll(async () => {
  await Promise.all(running.map((s) => s.stop()));
  if (dir) rmrf(dir);
});

describe.skipIf(!mustRun)('start-up refusals (fail closed)', () => {
  const dbf = () => path.join(dir, 'refuse.db');
  it.each([
    ['KG_TRUST_PROXY not set', { KG_TRUST_PROXY: '' }],
    ['KG_TRUST_PROXY=maybe', { KG_TRUST_PROXY: 'maybe' }],
    ['KG_TRUST_PROXY=1 without KG_PROXY_CIDR', { KG_TRUST_PROXY: '1' }],
    ['KG_ENROLL_CODE shorter than 12 characters', { KG_ENROLL_CODE: 'short' }],
    ['KG_ENROLL_CODE missing', { KG_ENROLL_CODE: '' }],
  ])('refuses to start: %s (exit 2)', (_name, extra) => {
    const r = cli(['serve'], { KG_PORT: String(59099), KG_DB: dbf(), ...extra }, 8000);
    expect(r.status).toBe(2);
  });
  it('an unknown CLI command prints usage and exits 2', () => {
    expect(cli(['frobnicate'], { KG_DB: dbf() }).status).toBe(2);
  });
});

describe.skipIf(!mustRun)('enrol, stores, ledger, CORS (one server, request-rate limits lifted x10)', () => {
  let srv: Srv;
  let A: Fam;
  let env1 = '';
  beforeAll(async () => {
    srv = await up({ KG_LEDGER_MAX: '60000', KG_MAX_FAMILIES: '8', KG_ENROLL_PER_HOUR: '60', KG_ENROLL_GLOBAL_PER_HOUR: '120', KG_RATE_MULT: '10' });
    A = await fam();
    env1 = await K.seal(A.k, 'mars-base', 5, { d: { x: 1 }, st: {}, lc: 1 });
  });

  describe('enrol', () => {
    it('wrong code -> 403', async () => expect((await enroll(srv, A, 'nope')).s).toBe(403));
    it('missing code / non-string code -> 403', async () => {
      expect((await srv.call('POST', '/v1/enroll', { body: { fid: A.k.fid, auth: A.k.auth, del: A.k.del } })).s).toBe(403);
      expect((await srv.call('POST', '/v1/enroll', { body: { fid: A.k.fid, auth: A.k.auth, del: A.k.del, code: 12345 } })).s).toBe(403);
    });
    it('without a delete token -> 400', async () => expect((await srv.call('POST', '/v1/enroll', { body: { fid: A.k.fid, auth: A.k.auth, code: ENROLL } })).s).toBe(400));
    it.each([
      ['fid too short', { fid: 'short' }],
      ['fid with a dot', { fid: 'a'.repeat(15) + '.' }],
      ['auth too short', { auth: 'x'.repeat(10) }],
      ['del not base64url', { del: '!'.repeat(40) }],
    ])('malformed %s -> 400', async (_n, over) => {
      const f = await fam();
      expect((await srv.call('POST', '/v1/enroll', { body: { fid: f.k.fid, auth: f.k.auth, del: f.k.del, code: ENROLL, ...over } })).s).toBe(400);
    });
    it('201 with an epoch, then a second time -> 409 exists', async () => {
      const r = await enroll(srv, A);
      expect(r.s).toBe(201);
      expect(typeof r.j.epoch).toBe('string');
      expect((await enroll(srv, A)).s).toBe(409);
    });
    it('state without Authorization -> 401; garbage / truncated headers -> 401', async () => {
      expect((await srv.call('GET', '/v1/state')).s).toBe(401);
      for (const h of ['Bearer', 'Bearer x.y', 'Basic abc', `Bearer ${A.k.fid}`, `Bearer ${A.tok}x`.replace(/x$/, '!')]) {
        const r = await srv.call('GET', '/v1/state', { headers: { authorization: h } });
        expect(r.s).toBe(401);
      }
    });
  });

  describe('stores', () => {
    it('PUT without If-Match -> 428', async () => expect((await srv.call('PUT', '/v1/stores/mars-base', { auth: A.tok, body: { v: 5, env: env1 } })).s).toBe(428));
    it('PUT create (If-Match 0) -> 200 rev 1', async () => {
      const r = await putStore(srv, A, 'mars-base', 0, env1, 5);
      expect([r.s, r.j.rev]).toEqual([200, 1]);
    });
    it('PUT with a stale If-Match -> 412 carrying the current rev', async () => {
      const r = await putStore(srv, A, 'mars-base', 0, env1, 5);
      expect([r.s, r.j.rev]).toEqual([412, 1]);
    });
    it('v6 over v5 -> rev 2; v5 under stored v6 -> 409 schema_older (an old client can never overwrite a newer schema)', async () => {
      const r = await putStore(srv, A, 'mars-base', 1, env1, 6);
      expect([r.s, r.j.rev]).toEqual([200, 2]);
      const o = await putStore(srv, A, 'mars-base', 2, env1, 5);
      expect([o.s, o.j.error, o.j.v]).toEqual([409, 'schema_older', 6]);
    });
    it.each([[0], [10001], [1.5], ['5'], [null]])('schema version %j -> 400', async (v) => {
      const r = await srv.call('PUT', '/v1/stores/vtest', { auth: A.tok, body: { v, env: sealB() }, headers: { 'if-match': '"0"' } });
      expect(r.s).toBe(400);
    });
    it('GET returns env + rev; If-None-Match -> 304; unknown store -> 404', async () => {
      const g = await srv.call('GET', '/v1/stores/mars-base', { auth: A.tok });
      expect([g.s, g.j.rev, g.j.v, g.j.env]).toEqual([200, 2, 6, env1]);
      expect((await srv.call('GET', '/v1/stores/mars-base', { auth: A.tok, headers: { 'if-none-match': '"2"' } })).s).toBe(304);
      expect((await srv.call('GET', '/v1/stores/nothing', { auth: A.tok })).s).toBe(404);
    });
    it('store id traversal / uppercase / too long -> 404', async () => {
      for (const p of ['..%2f..%2fetc', 'UPPER', 'a'.repeat(33), '-lead', 'a_b']) expect((await srv.call('GET', '/v1/stores/' + p, { auth: A.tok })).s).toBe(404);
    });
    it('another family cannot see my store (404 on the same id)', async () => {
      const B = await fam();
      await enroll(srv, B);
      expect((await srv.call('GET', '/v1/stores/mars-base', { auth: B.tok })).s).toBe(404);
    });
    it.each([
      ['0-byte envelope ("A")', 'A'],
      ['1-byte envelope ("AA")', 'AA'],
      ['empty env', ''],
      ['28-byte envelope', sealB(28)],
      ['flag byte 2', K.b64u(new Uint8Array([2, ...new Uint8Array(40)]))],
      ['non-canonical base64url', sealB(40).slice(0, -1) + 'B'],
      ['not base64url', '!!!!' + sealB(40)],
    ])('PUT rejects %s -> 400 bad_envelope', async (_n, e) => {
      const r = await srv.call('PUT', '/v1/stores/xiangqi', { auth: A.tok, body: { v: 1, env: e }, headers: { 'if-match': '"0"' } });
      expect([r.s, r.j.error]).toEqual([400, 'bad_envelope']);
    });
    it('env missing / number / object -> 400', async () => {
      for (const env of [undefined, 5, { a: 1 }, null]) expect((await srv.call('PUT', '/v1/stores/xiangqi', { auth: A.tok, body: { v: 1, env }, headers: { 'if-match': '"0"' } })).s).toBe(400);
    });
    it('the smallest legal envelope (29 bytes) is accepted', async () => expect((await putStore(srv, A, 'tiny', 0, sealB(29))).s).toBe(200));
  });

  describe('ledger', () => {
    const mkEv = (id: string) => ({ id, d: 'a1b2c3d4', lc: 7, ts: 1792400000000, kind: 'earn', amount: 24, src: 'mission.new', ref: 'orbit.O1.0' });
    const ids = ['first:mars-base:orbit.O1.0', 'a1b2c3d4.lx3k9f2a.0a1', 'm:node:orbit.O1.1', 'rf:a1b2c3d4.lx3k9f2a.0a1', 'e:A1:3'];
    let evs: { id: string; env: string }[] = [];
    beforeAll(async () => {
      evs = await Promise.all(ids.map(async (id) => ({ id, env: await K.sealEvent(A.k, mkEv(id)) })));
    });
    it('5 sealed events with dotted / colon ids (the real id shapes) -> accepted 5, seq 5', async () => {
      const r = await postLedger(srv, A, evs);
      expect([r.j.accepted, r.j.seq]).toEqual([5, 5]);
    });
    it('re-posting is idempotent: dup 3, accepted 0, seq unchanged', async () => {
      const r = await postLedger(srv, A, evs.slice(2));
      expect([r.j.accepted, r.j.dup, r.j.seq]).toEqual([0, 3, 5]);
    });
    it('pull after 3 -> seq 4 and 5; the pulled event decrypts and carries its own id', async () => {
      const r = await srv.call('GET', '/v1/ledger?after=3', { auth: A.tok });
      expect(r.j.events.map((e: any) => e.seq)).toEqual([4, 5]);
      const back = await K.openEvent(A.k, r.j.events[0].id, r.j.events[0].env);
      expect(back.id).toBe(r.j.events[0].id);
    });
    it('limit / after parameters are clamped, not trusted', async () => {
      const r = await srv.call('GET', '/v1/ledger?after=-5&limit=2', { auth: A.tok });
      expect([r.j.events.length, r.j.more]).toEqual([2, true]);
      expect((await srv.call('GET', '/v1/ledger?after=abc&limit=zzz', { auth: A.tok })).s).toBe(200);
    });
    it('a batch with bad events -> 400 bad_event listing the BAD indexes only; the rest goes through afterwards (client bisect)', async () => {
      const ok2 = { id: 'ok.x.2', env: await K.sealEvent(A.k, mkEv('ok.x.2')) };
      const bm = await postLedger(srv, A, [evs[0], { id: 'bad id!', env: evs[1]!.env }, { id: 'ok.x.1', env: 'AA' }, ok2]);
      expect([bm.s, bm.j.error, JSON.stringify(bm.j.bad)]).toEqual([400, 'bad_event', '[1,2]']);
      const rest = await postLedger(srv, A, [evs[0], ok2]);
      expect([rest.j.accepted, rest.j.dup]).toEqual([1, 1]);
    });
    it('malformed event shapes are 400 bad_event, never a 500 (missing env, non-string env, null / array / number elements)', async () => {
      const shapes = [{ id: 'abc.def.1' }, { id: 'abc.def.2', env: 12345 }, { id: 'abc.def.3', env: null }, { id: 'abc.def.4', env: { x: 1 } }, null, [], 7, 'str', { env: sealB() }, { id: 5, env: sealB() }];
      for (const bad of shapes) {
        const r = await postLedger(srv, A, [bad]);
        expect([r.s, r.j.error]).toEqual([400, 'bad_event']);
      }
    });
    it('envelope shapes in the ledger: oversize (> 1400 chars) and 0/1-byte are refused', async () => {
      expect((await postLedger(srv, A, [{ id: 'big.env.1', env: K.b64u(new Uint8Array(2000)) }])).s).toBe(400);
      expect((await postLedger(srv, A, [{ id: 'abc.def.9', env: 'A' }])).s).toBe(400);
    });
    it('200 one-byte / zero-byte envelopes -> 400, nothing stored', async () => {
      const before = (await srv.call('GET', '/v1/state', { auth: A.tok })).j.ledger.count;
      const big = Array.from({ length: 200 }, (_, i) => ({ id: 'z.' + i + '.abc', env: i % 2 ? 'AA' : 'A' }));
      const r = await postLedger(srv, A, big);
      expect([r.s, r.j.bad.length]).toEqual([400, 50]);
      expect((await srv.call('GET', '/v1/state', { auth: A.tok })).j.ledger.count).toBe(before);
    });
    it('batch size: 0 events and 201 events -> 400; id traversal -> 400', async () => {
      expect((await postLedger(srv, A, [])).s).toBe(400);
      expect((await postLedger(srv, A, Array.from({ length: 201 }, (_, i) => ({ id: 'q.' + i + '.abc', env: sealB() })))).s).toBe(400);
      expect((await postLedger(srv, A, [{ id: '../x', env: sealB() }])).s).toBe(400);
      expect((await postLedger(srv, A, [{ id: 'a'.repeat(97), env: sealB() }])).s).toBe(400);
    });
    it('GET /v1/state lists stores, ledger seq/bytes/count, epoch and caps incl. pause=false', async () => {
      const st = await srv.call('GET', '/v1/state', { auth: A.tok });
      expect(st.j.stores['mars-base']).toMatchObject({ rev: 2, v: 6 });
      expect(st.j.ledger.seq).toBe(6);
      expect(st.j.ledger.count).toBe(6);
      expect(st.j.epoch).toBeTruthy();
      expect(st.j.caps).toMatchObject({ store: 65536, storesCount: 32, ledgerCount: 20000, pause: false });
    });
  });

  describe('CORS and response headers', () => {
    it('allowed origin echoed with Vary', async () => {
      const o = await fetch(srv.base + '/v1/ping', { headers: { origin: ORIGIN } });
      expect([o.headers.get('access-control-allow-origin'), o.headers.get('vary')]).toEqual([ORIGIN, 'Origin']);
    });
    it('foreign origin -> 403 and no ACAO header; no wildcard ever', async () => {
      const o = await fetch(srv.base + '/v1/ping', { headers: { origin: 'https://evil.example' } });
      expect(o.status).toBe(403);
      expect(o.headers.get('access-control-allow-origin')).toBeNull();
      const p = await fetch(srv.base + '/v1/ping', { headers: { origin: ORIGIN } });
      expect(p.headers.get('access-control-allow-origin')).not.toBe('*');
    });
    it('preflight -> 204 allowing Authorization, X-KG-Pair-Code, X-KG-Delete-Token, If-Match', async () => {
      const o = await fetch(srv.base + '/v1/state', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' } });
      const h = o.headers.get('access-control-allow-headers') ?? '';
      expect(o.status).toBe(204);
      for (const n of ['Authorization', 'X-KG-Pair-Code', 'X-KG-Delete-Token', 'If-Match']) expect(h).toContain(n);
    });
    it('every response is no-store + nosniff, JSON', async () => {
      const r = await fetch(srv.base + '/healthz');
      expect([r.headers.get('cache-control'), r.headers.get('x-content-type-options'), r.headers.get('content-type')]).toEqual(['no-store', 'nosniff', 'application/json']);
    });
    it('/healthz needs no auth and reports backupAgeH (null without backups)', async () => {
      const r = await srv.call('GET', '/healthz');
      expect([r.s, r.j.ok, r.j.backupAgeH]).toEqual([200, true, null]);
    });
    it('an unknown route is 404 JSON (after auth), unknown method too', async () => {
      expect((await srv.call('GET', '/v1/nothing', { auth: A.tok })).s).toBe(404);
      expect((await srv.call('PATCH', '/v1/state', { auth: A.tok })).s).toBe(404);
    });
  });

  describe('sizes and robustness', () => {
    it('100 KB body -> 413', async () => {
      const big = await srv.call('PUT', '/v1/stores/mars-base', { auth: A.tok, body: { v: 6, env: 'A'.repeat(100000) }, headers: { 'if-match': '"2"' } });
      expect(big.s).toBe(413);
    });
    it('5 MB body -> 413 or the connection is closed', async () => {
      const huge = await srv.call('PUT', '/v1/stores/mars-base', { auth: A.tok, raw: 'x'.repeat(5_000_000), headers: { 'if-match': '"2"', 'content-type': 'application/json' } }).catch(() => ({ s: 'closed' as const }));
      expect([413, 'closed']).toContain(huge.s);
    });
    it('a 66000-byte sealed envelope (over the 64 KB slot cap, under the 90 KB body cap) -> 413 store_too_large; 70 KB hits the body cap first -> 413 too_large', async () => {
      const r = await srv.call('PUT', '/v1/stores/xiangqi', { auth: A.tok, body: { v: 1, env: K.b64u(new Uint8Array(66000)) }, headers: { 'if-match': '"0"' } });
      expect([r.s, r.j.error]).toEqual([413, 'store_too_large']);
      const r2 = await srv.call('PUT', '/v1/stores/xiangqi', { auth: A.tok, body: { v: 1, env: K.b64u(new Uint8Array(70000)) }, headers: { 'if-match': '"0"' } });
      expect([r2.s, r2.j.error]).toEqual([413, 'too_large']);
    });
    it('exactly 64 KB is accepted', async () => expect((await putStore(srv, A, 'at-cap', 0, K.b64u(new Uint8Array(65536)))).s).toBe(200));
    it('bad JSON -> 400; a JSON array / scalar body behaves like an empty object (400)', async () => {
      expect((await srv.call('POST', '/v1/ledger', { auth: A.tok, raw: '{nope', headers: { 'content-type': 'application/json' } })).s).toBe(400);
      expect((await srv.call('POST', '/v1/ledger', { auth: A.tok, raw: '[1,2,3]', headers: { 'content-type': 'application/json' } })).s).toBe(400);
      expect((await srv.call('POST', '/v1/ledger', { auth: A.tok, raw: '12', headers: { 'content-type': 'application/json' } })).s).toBe(400);
    });
    it('prototype-pollution style bodies do not break anything', async () => {
      const r = await srv.call('POST', '/v1/ledger', { auth: A.tok, raw: '{"__proto__":{"events":[1]},"constructor":{"x":1},"events":[]}', headers: { 'content-type': 'application/json' } });
      expect(r.s).toBe(400);
      expect((await srv.call('GET', '/v1/state', { auth: A.tok })).s).toBe(200);
    });
    it('the ledger BYTE cap (60 KB here; every row counted as ciphertext + id + 64 B) -> 413 ledger_full', async () => {
      let flood = 0;
      let full = false;
      for (let i = 0; i < 400 && !full; i++) {
        const e = await postLedger(srv, A, Array.from({ length: 50 }, (_, k) => ({ id: `f.${i}.${k}`, env: sealB() })));
        if (e.s === 413) full = true;
        else flood += e.j.accepted;
      }
      expect(full).toBe(true);
      expect(flood).toBeGreaterThan(100);
      expect(flood).toBeLessThan(400);
    });
  });

  describe('robustness: nothing a client sends can produce a 5xx or take the server down', () => {
    // own server + family: the fuzz burns the failure buckets of its source on purpose
    let srv: Srv;
    let A: Fam;
    beforeAll(async () => {
      srv = await up({ KG_RATE_MULT: '1000' }, { name: 'fuzz' });
      A = await fam();
      await enroll(srv, A);
    });
    it('odd request lines are 4xx, not 500', async () => {
      for (const p of ['//', '///x', '/v1/%', '/v1/%zz', '/v1/stores/%E0%A4%A', '/v1/ledger?after=%E0%A4%A', '/v1/stores/\u0000', '/..', '/v1/../healthz']) {
        const r = await srv.call('GET', p, { auth: A.tok }).catch(() => ({ s: 0 }));
        expect(r.s, p).toBeLessThan(500);
      }
    });
    it('fuzz: 400 random methods / paths / headers / JSON bodies (valid and garbage credentials) -> never 5xx; the server still answers afterwards', async () => {
      let seed = 20261020;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;
      const junk = () => pick(['', 'x', 'A'.repeat(50), '\u0000', '../../etc/passwd', '<script>', '9'.repeat(30), '-1', 'null', '{}', '[]', '🙂', 'a b', '%00', "' OR 1=1 --", 'Bearer', 'constructor', '__proto__']);
      const val = (d = 0): unknown => {
        const k = Math.floor(rnd() * (d > 3 ? 5 : 8));
        return [() => null, () => junk(), () => Math.floor((rnd() - 0.5) * 1e12), () => rnd() < 0.5, () => 1e308, () => ({}), () => Array.from({ length: Math.floor(rnd() * 4) }, () => val(d + 1)), () => Object.fromEntries(Array.from({ length: Math.floor(rnd() * 5) }, () => [pick(['id', 'env', 'v', 'events', 'code', 'commit', 'label', 'apub', 'bpub', 'nB', 'grant', 'fid', 'auth', 'del', '__proto__', 'constructor']), val(d + 1)]))][k]!();
      };
      const paths = ['/v1/state', '/v1/ledger', '/v1/ledger?after=5&limit=2', '/v1/stores/mars-base', '/v1/stores/' + 'a'.repeat(40), '/v1/pair', '/v1/pair/claim', '/v1/pair/abcdefgh', '/v1/pair/abcdefgh/apub', '/v1/pair/abcdefgh/grant', '/v1/pair/abcdefgh/reveal', '/v1/enroll', '/v1/family', '/healthz', '/v1/ping', '/', '/v1', '/v1/' + junk()];
      const bad: string[] = [];
      for (let i = 0; i < 400; i++) {
        const method = pick(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
        const path = pick(paths);
        const useAuth = rnd() < 0.5;
        const headers: Record<string, string> = {};
        if (useAuth) headers.authorization = rnd() < 0.7 ? 'Bearer ' + A.tok : 'Bearer ' + junk();
        if (rnd() < 0.3) headers['if-match'] = pick(['"0"', '"1"', '*', 'x', '"99999999999999999999"']);
        if (rnd() < 0.2) headers['x-kg-pair-code'] = pick(['123456', '', 'x'.repeat(100)]);
        if (rnd() < 0.2) headers['x-kg-delete-token'] = junk();
        const body = rnd() < 0.8 ? JSON.stringify(val()) : junk();
        let r: { s: number };
        try {
          r = await srv.call(method === 'GET' ? 'GET' : method, path, { headers: { 'content-type': 'application/json', ...headers }, raw: method === 'GET' ? undefined : body }).catch(() => ({ s: 0 }));
        } catch {
          r = { s: 0 };
        }
        if (r.s >= 500) bad.push(`${method} ${path} -> ${r.s}`);
      }
      expect(bad).toEqual([]);
      expect((await srv.call('GET', '/healthz')).s).toBe(200);
    });
  });

  describe('delete token (a stolen Bearer is not enough)', () => {
    let D: Fam;
    let other: Fam;
    beforeAll(async () => {
      D = await fam();
      other = await fam();
      await enroll(srv, D);
      await putStore(srv, D, 'mars-base', 0);
      await postLedger(srv, D, [{ id: 'del.one.1', env: sealB() }]);
    });
    it('the old X-KG-Confirm header -> 403; no header -> 403; a token of ANOTHER family -> 403', async () => {
      expect((await srv.call('DELETE', '/v1/family', { auth: D.tok, headers: { 'x-kg-confirm': D.k.fid } })).s).toBe(403);
      expect((await srv.call('DELETE', '/v1/family', { auth: D.tok })).s).toBe(403);
      expect((await srv.call('DELETE', '/v1/family', { auth: D.tok, headers: { 'x-kg-delete-token': other.k.del } })).s).toBe(403);
      expect((await srv.call('DELETE', '/v1/family', { auth: D.tok, headers: { 'x-kg-delete-token': D.k.auth } })).s).toBe(403);
    });
    it('the data is intact after refused deletes', async () => {
      const st = await srv.call('GET', '/v1/state', { auth: D.tok });
      expect([st.s, Object.keys(st.j.stores), st.j.ledger.count]).toEqual([200, ['mars-base'], 1]);
    });
    it('the key-derived token -> 204, cascades: the family, its stores and its ledger are gone', async () => {
      expect((await srv.call('DELETE', '/v1/family', { auth: D.tok, headers: { 'x-kg-delete-token': D.k.del } })).s).toBe(204);
      expect((await srv.call('GET', '/v1/state', { auth: D.tok })).s).toBe(401);
    });
    it('re-enrol with the SAME key on the emptied / rebuilt server -> 201, same key works again, nothing of the old data is left', async () => {
      expect((await enroll(srv, D)).s).toBe(201);
      const st = await srv.call('GET', '/v1/state', { auth: D.tok });
      expect([st.s, Object.keys(st.j.stores).length, st.j.ledger.count]).toEqual([200, 0, 0]);
    });
  });
});

describe.skipIf(!mustRun)('failure buckets: per source and per (source, fid); VALID keys are never locked out', () => {
  it('11th wrong key for one family from one source -> 429, the valid key still works; spraying unknown fids is capped at 30 / 15 min', async () => {
    const srv = await up({ KG_RATE_MULT: '10' }, { name: 'buckets' });
    const A = await fam();
    const B2 = await fam();
    await enroll(srv, A);
    const wrong = `${A.k.fid}.${B2.k.auth}`;
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await srv.call('GET', '/v1/state', { auth: wrong })).s);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
    expect((await srv.call('GET', '/v1/state', { auth: A.tok })).s).toBe(200);
    let s429 = 0;
    for (let i = 0; i < 40; i++) {
      const x = await fam();
      if ((await srv.call('GET', '/v1/state', { auth: x.tok })).s === 429) s429++;
    }
    expect(s429).toBeGreaterThan(0);
    expect((await srv.call('GET', '/v1/state', { auth: A.tok })).s).toBe(200);
    const r = await srv.call('GET', '/v1/state', { auth: wrong });
    expect(r.h.get('retry-after')).toMatch(/^\d+$/);
    await down(srv);
  });
  it('unknown family and wrong key answer with the SAME status and body (no enumeration)', async () => {
    const srv = await up({ KG_RATE_MULT: '10' }, { name: 'same' });
    const A = await fam();
    const X = await fam();
    await enroll(srv, A);
    const known = await srv.call('GET', '/v1/state', { auth: `${A.k.fid}.${X.k.auth}` });
    const unknown = await srv.call('GET', '/v1/state', { auth: X.tok });
    expect([unknown.s, unknown.j]).toEqual([known.s, known.j]);
    await down(srv);
  });
});

describe.skipIf(!mustRun)('enrolment limits (production defaults)', () => {
  it('max 3 families (4th -> 507 full) and enrolment attempts limited to 5 per hour per source (6th -> 429)', async () => {
    const s = await up({ KG_MAX_FAMILIES: '3', KG_ENROLL_PER_HOUR: '5', KG_ENROLL_GLOBAL_PER_HOUR: '10' }, { name: 'enr' });
    const out: number[] = [];
    for (let i = 0; i < 7; i++) out.push((await enroll(s, await fam())).s);
    expect(out).toEqual([201, 201, 201, 507, 507, 429, 429]);
    await down(s);
  });
  it('the GLOBAL enrolment limit (10 / hour) holds even for many sources', async () => {
    const s = await up({ KG_TRUST_PROXY: '1', KG_PROXY_CIDR: '127.0.0.0/8', KG_MAX_FAMILIES: '50', KG_ENROLL_PER_HOUR: '99', KG_ENROLL_GLOBAL_PER_HOUR: '10', KG_RATE_MULT: '10' }, { name: 'enrg' });
    const out: number[] = [];
    for (let i = 0; i < 13; i++) {
      const f = await fam();
      out.push((await s.call('POST', '/v1/enroll', { body: { fid: f.k.fid, auth: f.k.auth, del: f.k.del, code: ENROLL }, headers: { 'x-forwarded-for': `198.51.100.${i + 1}` } })).s);
    }
    expect(out.filter((c) => c === 201).length).toBe(10);
    expect(out.slice(10)).toEqual([429, 429, 429]);
    await down(s);
  });
  it('a wrong enrolment code is 403 and costs the attacker an attempt', async () => {
    const s = await up({ KG_ENROLL_PER_HOUR: '5' }, { name: 'enrw' });
    const out: number[] = [];
    for (let i = 0; i < 7; i++) out.push((await enroll(s, await fam(), 'guess-' + i)).s);
    expect(out).toEqual([403, 403, 403, 403, 403, 429, 429]);
    await down(s);
  });
});

describe.skipIf(!mustRun)('caps: counts, bytes, row overhead, zero-byte envelopes', () => {
  it('at most 32 stores per family (more distinct ids are refused); /v1/state stays under 6 KB', async () => {
    const s = await up({ KG_STORES_MAX: '4000000', KG_RATE_MULT: '100' }, { name: 'caps1' });
    const F = await fam();
    await enroll(s, F);
    let created = 0;
    let refused = 0;
    let firstErr = '';
    for (let i = 0; i < 3000 && refused < 20; i++) {
      const r = await putStore(s, F, `s${i}`, 0, sealB(40));
      if (r.s === 200) created++;
      else if (r.s === 413) {
        refused++;
        firstErr ||= r.j.error;
      }
    }
    expect(created).toBe(32);
    expect(firstErr).toBe('too_many_stores');
    const st = await s.call('GET', '/v1/state', { auth: F.tok });
    expect(JSON.stringify(st.j).length).toBeLessThan(6000);
    // updating an existing slot is still fine at the cap
    expect((await putStore(s, F, 's0', 1, sealB(40))).s).toBe(200);
    await down(s);
  });
  it('ledger COUNT cap (300 here; 20 000 in production) holds even with minimal 29-byte envelopes', async () => {
    const s = await up({ KG_LEDGER_COUNT: '300', KG_RATE_MULT: '100' }, { name: 'caps2' });
    const F = await fam();
    await enroll(s, F);
    let acc = 0;
    let ful: any = null;
    for (let i = 0; i < 5; i++) {
      const r = await postLedger(s, F, Array.from({ length: 200 }, (_, k) => ({ id: `c.${i}.${k}`, env: sealB(29) })));
      if (r.s === 413) {
        ful = r.j;
        break;
      }
      acc += r.j.accepted;
    }
    expect(ful?.error).toBe('ledger_full');
    expect(acc).toBe(200); // the whole second batch is refused atomically (rolled back), nothing partial
    const st = await s.call('GET', '/v1/state', { auth: F.tok });
    expect(st.j.ledger.count).toBe(200);
    // the cap is on the family, not global: another family is unaffected
    const G = await fam();
    await enroll(s, G);
    expect((await postLedger(s, G, [{ id: 'other.fam.1', env: sealB(29) }])).s).toBe(200);
    await down(s);
  });
  it('store BYTES cap counts the row overhead (id + 64 B) and not just the ciphertext', async () => {
    // cap 200 B: three 29-byte slots are only 87 raw bytes, but each row costs 29 + 1 + 64 = 94 -> the third no longer fits
    const s = await up({ KG_STORES_MAX: '200' }, { name: 'caps3' });
    const F = await fam();
    await enroll(s, F);
    const out: number[] = [];
    for (const id of ['a', 'b', 'c']) out.push((await putStore(s, F, id, 0, sealB(29))).s);
    expect(out).toEqual([200, 200, 413]);
    const r = await putStore(s, F, 'c', 0, sealB(29));
    expect(r.j.error).toBe('family_too_large');
    // an update that GROWS a slot is charged the difference
    expect((await putStore(s, F, 'a', 1, sealB(29 + 10))).s).toBe(200);
    expect((await putStore(s, F, 'a', 2, sealB(29 + 40))).s).toBe(413);
    await down(s);
  });
  it('ledger BYTES cap counts the row overhead: 29-byte events with 3-char ids cost 96 B each -> exactly 4 fit into 400 B', async () => {
    const s = await up({ KG_LEDGER_MAX: '400', KG_RATE_MULT: '10' }, { name: 'caps4' });
    const F = await fam();
    await enroll(s, F);
    const out: number[] = [];
    for (const id of ['aaa', 'aab', 'aac', 'aad', 'aae', 'aaf']) out.push((await postLedger(s, F, [{ id, env: sealB(29) }])).s);
    expect(out).toEqual([200, 200, 200, 200, 413, 413]);
    const st = await s.call('GET', '/v1/state', { auth: F.tok });
    expect([st.j.ledger.count, st.j.ledger.bytes]).toEqual([4, 384]);
    // a duplicate of an existing event is free (no second charge) even at the cap
    expect((await postLedger(s, F, [{ id: 'aaa', env: sealB(29) }])).j.dup).toBe(1);
    await down(s);
  });
  it('zero-byte and one-byte envelopes cannot be used to dodge the count cap: they are rejected, not stored', async () => {
    const s = await up({ KG_LEDGER_COUNT: '50', KG_RATE_MULT: '10' }, { name: 'caps5' });
    const F = await fam();
    await enroll(s, F);
    for (const env of ['A', 'AA', '']) expect((await postLedger(s, F, [{ id: 'zero.env.1', env }])).s).toBe(400);
    expect((await s.call('GET', '/v1/state', { auth: F.tok })).j.ledger.count).toBe(0);
    await down(s);
  });
});

describe.skipIf(!mustRun)('disk guard and remote PAUSE', () => {
  it('free space below the minimum -> writes 507 disk_guard (store, ledger, enrol, pair); reads still work', async () => {
    const db = path.join(dir, 'disk.db');
    const s1 = await up({}, { db });
    const F = await fam();
    await enroll(s1, F);
    await down(s1);
    const s3 = await up({ KG_MIN_FREE_MB: '999999999' }, { db });
    const w = await putStore(s3, F, 'mars-base', 0);
    const lw = await postLedger(s3, F, [{ id: 'abc.def.1', env: sealB() }]);
    const pr = await s3.call('POST', '/v1/pair', { auth: F.tok, body: {} });
    const en = await enroll(s3, await fam());
    expect([w.s, w.j.error, lw.s, pr.s, en.s]).toEqual([507, 'disk_guard', 507, 507, 507]);
    expect((await s3.call('GET', '/v1/state', { auth: F.tok })).s).toBe(200);
    expect((await s3.call('GET', '/healthz')).s).toBe(200);
    expect(s3.logs()).not.toContain('"ev":"req"'); // KG_QUIET: no request lines
    await down(s3);
  });
  it('touch data/PAUSE: caps.pause=true and EVERY state change -> 503 paused (no restart); rm PAUSE: writes work again', async () => {
    const s = await up({ KG_RATE_MULT: '10' }, { name: 'pause' });
    const F = await fam();
    await enroll(s, F);
    const pf = path.join(path.dirname(s.db), 'PAUSE');
    expect((await putStore(s, F, 'mars-base', 0)).s).toBe(200);
    fs.writeFileSync(pf, '');
    const st = await s.call('GET', '/v1/state', { auth: F.tok });
    const put = await putStore(s, F, 'mars-base', 1);
    const led = await postLedger(s, F, [{ id: 'abc.def.1', env: sealB() }]);
    const pair = await s.call('POST', '/v1/pair', { auth: F.tok, body: {} });
    const en = await enroll(s, await fam());
    const del = await s.call('DELETE', '/v1/family', { auth: F.tok, headers: { 'x-kg-delete-token': F.k.del } });
    const claim = await s.call('POST', '/v1/pair/claim', { body: { code: '123456', commit: 'A'.repeat(43), label: 'iPad' } });
    expect(st.j.caps.pause).toBe(true);
    expect([put.s, led.s, pair.s, en.s, del.s, claim.s]).toEqual([503, 503, 503, 503, 503, 503]);
    expect(put.j.error).toBe('paused');
    // reads, the stored data and health keep working
    expect((await s.call('GET', '/v1/stores/mars-base', { auth: F.tok })).s).toBe(200);
    expect((await s.call('GET', '/healthz')).s).toBe(200);
    expect((await s.call('GET', '/v1/ledger', { auth: F.tok })).s).toBe(200);
    fs.rmSync(pf);
    expect((await s.call('GET', '/v1/state', { auth: F.tok })).j.caps.pause).toBe(false);
    expect((await putStore(s, F, 'mars-base', 1)).s).toBe(200);
    expect((await postLedger(s, F, [{ id: 'abc.def.1', env: sealB() }])).s).toBe(200);
    await down(s);
  });
  it('KG_PAUSE_FILE can point anywhere (e.g. a file on the mounted volume)', async () => {
    const pf = path.join(dir, 'custom-pause');
    const s = await up({ KG_PAUSE_FILE: pf }, { name: 'pause2' });
    const F = await fam();
    await enroll(s, F);
    fs.writeFileSync(pf, '');
    expect((await putStore(s, F, 'x', 0)).s).toBe(503);
    fs.rmSync(pf);
    expect((await putStore(s, F, 'x', 0)).s).toBe(200);
    await down(s);
  });
});

describe.skipIf(!mustRun)('slow clients', () => {
  it('a slow-header connection (slowloris) is closed by the server', async () => {
    const s = await up({ KG_HEADERS_TIMEOUT_MS: '1500' }, { name: 'slow' });
    const t0 = Date.now();
    const dropped = await new Promise<number>((resolve) => {
      const sock = net.connect(s.port, '127.0.0.1', () => sock.write('GET /healthz HTTP/1.1\r\nHost: x\r\nX-Slow: '));
      sock.on('data', () => {});
      sock.on('close', () => resolve(Date.now() - t0));
      sock.on('error', () => {});
      setTimeout(() => resolve(-1), 12000);
    });
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(8000);
    expect((await s.call('GET', '/healthz')).s).toBe(200); // the server is still fine
    await down(s);
  });
});

describe.skipIf(!mustRun)('time-dependent guards under a virtual clock', () => {
  it('DB-size guard (30 s cache), enrolment deadline, 240 / min per source, 300 / min per family, 15-minute failure windows', () => {
    const d = tmpDir('guards');
    try {
      const res = runScenario('scn-guards.mjs', { KG_TEST_DIR: d });
      expect(res.checks.length).toBeGreaterThanOrEqual(14);
      expect(failures(res)).toEqual([]);
    } finally {
      rmrf(d);
    }
  });
});
