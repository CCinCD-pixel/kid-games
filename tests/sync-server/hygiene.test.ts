// Suite 3/4 -- hygiene (docs/specs/sync.md section 1, 5, 7): the structured log must never contain a secret (17+ probes), X-Forwarded-For is honoured ONLY from the
// proxy network, unknown-family vs wrong-key timing/response equality, nothing secret is stored in clear in the database, CORS defaults, unit scenarios.
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { K, boot, enroll, fam, failures, mustRun, portAllocator, postLedger, putStore, rmrf, runScenario, sealB, tmpDir, type Srv } from './helpers/proc';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 60_000 });
const alloc = portAllocator(59300);
let dir = '';
const running: Srv[] = [];
const up = async (extra: Record<string, string> = {}, name = 'hyg') => {
  const s = await boot(alloc, dir, extra, { name });
  running.push(s);
  return s;
};
const down = async (s: Srv) => {
  await s.stop();
  running.splice(running.indexOf(s), 1);
};
beforeAll(() => {
  if (mustRun) dir = tmpDir('hygiene');
});
afterAll(async () => {
  await Promise.all(running.map((s) => s.stop()));
  if (dir) rmrf(dir);
});

// a trusted proxy range that contains the test client (127.0.0.1) so that X-Forwarded-For can rotate the "source" and the failure buckets never trigger
const PROXY = { KG_TRUST_PROXY: '1', KG_PROXY_CIDR: '127.0.0.0/8', KG_RATE_MULT: '1000' };
let ipn = 0;
const xff = () => ({ 'x-forwarded-for': `10.${(ipn >> 8) & 255}.${ipn & 255}.${(ipn++ >> 16) + 1}` });

describe.skipIf(!mustRun)('log hygiene: no secret ever reaches the log', () => {
  it('17+ probes (keys, tokens, codes, ciphertext, ids, labels, raw IPs, Authorization) -> 0 occurrences; the log schema is a whitelist', async () => {
    const SECRET_ENROLL = 'enroll-SECRET-xyz-123';
    const s = await up({ ...PROXY, KG_QUIET: '0', KG_ENROLL_CODE: SECRET_ENROLL }, 'leaks');
    const S = K.newSecret();
    const k = await K.derive(S);
    const S2 = K.newSecret();
    const k2 = await K.derive(S2);
    const post = (p: string, body: unknown, h: Record<string, string> = {}) => s.call('POST', p, { body, headers: { ...xff(), ...h } });
    expect((await post('/v1/enroll', { fid: k.fid, auth: k.auth, del: k.del, code: SECRET_ENROLL })).s).toBe(201);

    const sealed = await K.seal(k, 'mars-base', 1, { d: { name: 'SECRETNAME-小步步' }, st: {}, lc: 1 });
    const AUTH = { authorization: `Bearer ${k.fid}.${k.auth}`, 'content-type': 'application/json' };
    const raw = async (method: string, p: string, h: Record<string, string>, body?: unknown) => (await fetch(s.base + p, { method, headers: { ...AUTH, ...xff(), ...h }, body: body === undefined ? undefined : JSON.stringify(body) })).status;
    await raw('PUT', '/v1/stores/leakslot-zz', { 'if-match': '"0"' }, { v: 1, env: sealed });
    await raw('GET', '/v1/stores/leakslot-yy', {});
    const ev = await K.sealEvent(k, { id: 'first:LEAKCHECK:orbit.O1.0', d: 'a1b2c3d4', lc: 1, ts: 1792400000000, kind: 'earn', amount: 24, src: 'mission.new', ref: 'orbit.O1.0' });
    await raw('POST', '/v1/ledger', {}, { events: [{ id: 'first:LEAKCHECK:orbit.O1.0', env: ev }] });
    await raw('POST', '/v1/ledger', {}, { events: [{ id: 'first:LEAKCHECK:bad', env: 'SECRETBADENVELOPE' }] }); // a 400 path that carries the id and a secret-looking env
    await fetch(s.base + '/v1/ledger', { method: 'POST', headers: { ...AUTH, ...xff() }, body: '{"BADJSON-SECRET": ' }); // bad JSON containing a marker

    const ea = await K.ecKey();
    const eb = await K.ecKey();
    const nB = K.newNonce();
    const commit = await K.pairCommit(eb.pub, nB);
    const pn = await (await fetch(s.base + '/v1/pair', { method: 'POST', headers: { ...AUTH, ...xff() }, body: '{}' })).json();
    await post('/v1/enroll', { fid: k2.fid, auth: k2.auth, del: k2.del, code: 'wrong-code-attempt-777' });
    await post('/v1/pair/claim', { code: pn.code, commit, label: 'LABEL-iPhone-secret' });
    await raw('POST', `/v1/pair/${pn.pid}/apub`, {}, { apub: K.b64u(ea.pub) });
    await fetch(`${s.base}/v1/pair/${pn.pid}/apub`, { headers: { 'x-kg-pair-code': pn.code, ...xff() } });
    await fetch(`${s.base}/v1/pair/${pn.pid}/reveal`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kg-pair-code': pn.code, ...xff() }, body: JSON.stringify({ bpub: K.b64u(eb.pub), nB: K.b64u(nB) }) });
    const grant = await K.wrap(await K.sharedKey(ea.priv, eb.pub), S, pn.pid);
    await raw('POST', `/v1/pair/${pn.pid}/grant`, {}, { grant });
    await fetch(`${s.base}/v1/pair/${pn.pid}/grant`, { headers: { 'x-kg-pair-code': pn.code, ...xff() } });
    await raw('DELETE', '/v1/family', { 'x-kg-delete-token': k.del });
    await fetch(s.base + '/v1/state', { headers: { authorization: `Bearer ${k.fid}.${k2.auth}`, ...xff() } }); // wrong key
    await new Promise((r) => setTimeout(r, 300));
    await down(s);

    const logs = s.logs();
    const needles: Record<string, string> = {
      'full auth key': k.auth,
      'full family id': k.fid,
      'family id prefix (8)': k.fid.slice(0, 8),
      'delete token': k.del,
      'wrong-key auth': k2.auth,
      'enrol code': SECRET_ENROLL,
      'wrong enrol code': 'wrong-code-attempt-777',
      'sealed envelope': sealed.slice(0, 40),
      'sealed ledger event': ev.slice(0, 40),
      'bad envelope marker': 'SECRETBADENVELOPE',
      'bad json marker': 'BADJSON-SECRET',
      'pair code': pn.code,
      'pair id': pn.pid,
      'pair commitment': commit,
      'public key': K.b64u(ea.pub).slice(0, 30),
      'nonce': K.b64u(nB),
      'wrapped grant': grant.slice(0, 30),
      'device label': 'LABEL-iPhone-secret',
      'plain name': 'SECRETNAME',
      'ledger id': 'LEAKCHECK',
      'store slot name': 'leakslot-',
      'Authorization header': 'Bearer',
      'raw forwarded IP': '"10.',
      'raw peer IP': '127.0.0.1',
    };
    expect(Object.keys(needles).length).toBeGreaterThanOrEqual(17);
    const leaks = Object.entries(needles).filter(([, v]) => logs.includes(v)).map(([n]) => n);
    expect(leaks).toEqual([]);

    // the log is JSON lines with a fixed schema: a new field (which could carry something) must be a conscious change of this test
    const lines = logs.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.length).toBeGreaterThan(15);
    const ALLOWED = new Set(['t', 'ev', 'm', 'r', 's', 'ms', 'ip']);
    for (const l of lines.filter((x) => x.ev === 'req')) {
      expect(Object.keys(l).every((key) => ALLOWED.has(key))).toBe(true);
      expect(l.ip).toMatch(/^[0-9a-f]{8}$/);
      expect(l.r).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(l.m).toMatch(/^[A-Z]+$/);
    }
    expect(lines.some((l) => l.ev === 'req' && l.r === 'pair.grant')).toBe(true); // the happy path really was exercised
    expect(lines.filter((l) => l.ev !== 'req').every((l) => ['listening', 'backup', 'disk_guard', 'error', 'fatal'].includes(l.ev))).toBe(true);
  });

  it('noise from one source is sampled: at most 5 lines per minute for 401 / 403 / 404 / 429', async () => {
    const s = await up({ KG_QUIET: '0' }, 'noise');
    for (let i = 0; i < 60; i++) await s.call('GET', '/v1/state'); // 30 x 401, then 429s (same source)
    await s.call('GET', '/healthz');
    await new Promise((r) => setTimeout(r, 200));
    const lines = s.logs().trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.ev === 'req');
    const noisy = lines.filter((l) => [401, 429].includes(l.s));
    expect(noisy.length).toBeGreaterThan(0);
    expect(noisy.length).toBeLessThanOrEqual(10); // 5 per minute bucket; the run may straddle one minute boundary
    expect(lines.some((l) => l.r === 'healthz' && l.s === 200)).toBe(true); // normal traffic is always logged
    await down(s);
  });

  it('the database holds hashes only: no auth key, no delete token, no enrolment code in clear (file + WAL scanned byte-wise)', async () => {
    const s = await up({ KG_ENROLL_CODE: 'enroll-in-db-scan-77' }, 'dbscan');
    const F = await fam();
    expect((await enroll(s, F, 'enroll-in-db-scan-77')).s).toBe(201);
    await putStore(s, F, 'mars-base', 0, await K.seal(F.k, 'mars-base', 1, { d: { name: 'PLAINTEXT-NAME-小步步' }, st: {}, lc: 1 }));
    await postLedger(s, F, [{ id: 'abc.def.1', env: sealB() }]);
    const bufs = ['', '-wal'].map((suf) => (fs.existsSync(s.db + suf) ? fs.readFileSync(s.db + suf) : Buffer.alloc(0)));
    const all = Buffer.concat(bufs);
    expect(all.length).toBeGreaterThan(4096);
    const hasBytes = (b: Buffer) => all.includes(b);
    const text = (t: string) => all.includes(Buffer.from(t, 'utf8'));
    expect(hasBytes(Buffer.from(F.k.auth, 'base64url'))).toBe(false);
    expect(text(F.k.auth)).toBe(false);
    expect(hasBytes(Buffer.from(F.k.del, 'base64url'))).toBe(false);
    expect(text(F.k.del)).toBe(false);
    expect(text('enroll-in-db-scan-77')).toBe(false);
    expect(text('PLAINTEXT-NAME')).toBe(false);
    await down(s);
  });
});

describe.skipIf(!mustRun)('X-Forwarded-For is trusted ONLY from the proxy network', () => {
  const bad = 'A'.repeat(20) + '.' + 'B'.repeat(40);
  const hammer = async (srv: Srv, n: number, h: (i: number) => Record<string, string>) => {
    let n429 = 0;
    for (let i = 0; i < n; i++) if ((await srv.call('GET', '/v1/state', { auth: bad, headers: h(i) })).s === 429) n429++;
    return n429;
  };
  it('peer NOT in KG_PROXY_CIDR: forged XFF is ignored (45 "different" sources hit ONE bucket -> 429 after 30)', async () => {
    const s = await up({ KG_TRUST_PROXY: '1', KG_PROXY_CIDR: '10.9.9.0/24' }, 'xff1');
    expect(await hammer(s, 45, (i) => ({ 'x-forwarded-for': `203.0.113.${i + 1}` }))).toBe(15);
    await down(s);
  });
  it('KG_TRUST_PROXY=0: XFF is ignored even from a "proxy" address', async () => {
    const s = await up({ KG_TRUST_PROXY: '0', KG_PROXY_CIDR: '127.0.0.0/8' }, 'xff0');
    expect(await hammer(s, 45, (i) => ({ 'x-forwarded-for': `203.0.113.${i + 1}` }))).toBe(15);
    await down(s);
  });
  it('peer inside KG_PROXY_CIDR (the proxy): XFF is honoured, every client has its own bucket', async () => {
    const s = await up({ KG_TRUST_PROXY: '1', KG_PROXY_CIDR: '127.0.0.0/8' }, 'xff2');
    expect(await hammer(s, 45, (i) => ({ 'x-forwarded-for': `203.0.113.${i + 1}` }))).toBe(0);
    await down(s);
  });
  it('only the RIGHTMOST entry counts: a client cannot dodge its bucket by prepending fake addresses', async () => {
    const s = await up({ KG_TRUST_PROXY: '1', KG_PROXY_CIDR: '127.0.0.0/8' }, 'xff3');
    expect(await hammer(s, 45, (i) => ({ 'x-forwarded-for': `198.51.100.${i + 1}, 203.0.113.50` }))).toBe(15);
    await down(s);
  });
  it('a garbage XFF falls back to the peer address (and cannot crash the server)', async () => {
    const s = await up({ KG_TRUST_PROXY: '1', KG_PROXY_CIDR: '127.0.0.0/8' }, 'xff4');
    expect(await hammer(s, 40, () => ({ 'x-forwarded-for': '<script>, ../../etc, ' + 'x'.repeat(200) }))).toBe(10);
    expect((await s.call('GET', '/healthz')).s).toBe(200);
    await down(s);
  });
  it('IPv6 sources are aggregated per /64 (one subscriber cannot rotate through their whole prefix)', async () => {
    const s = await up({ KG_TRUST_PROXY: '1', KG_PROXY_CIDR: '127.0.0.0/8' }, 'xff6');
    expect(await hammer(s, 45, (i) => ({ 'x-forwarded-for': `2001:db8:0:1::${(i + 1).toString(16)}` }))).toBe(15);
    expect(await hammer(s, 20, (i) => ({ 'x-forwarded-for': `2001:db8:0:${(i + 2).toString(16)}::1` }))).toBe(0); // different /64s -> different buckets
    await down(s);
  });
});

describe.skipIf(!mustRun)('unknown family vs wrong key', () => {
  it('same status, same body, same headers; the median latency difference is negligible', async () => {
    const s = await up(PROXY, 'timing');
    const A = await fam();
    const X = await fam();
    await enroll(s, A);
    const unknownTok = X.tok;
    const wrongTok = `${A.k.fid}.${X.k.auth}`;
    const one = async (tok: string) => {
      const t0 = performance.now();
      const r = await fetch(s.base + '/v1/state', { headers: { authorization: 'Bearer ' + tok, ...xff() } });
      const body = await r.text();
      return { ms: performance.now() - t0, status: r.status, body, ct: r.headers.get('content-type') };
    };
    for (let i = 0; i < 100; i++) {
      await one(unknownTok);
      await one(wrongTok);
    }
    const a: number[] = [];
    const b: number[] = [];
    const shapes = new Set<string>();
    for (let i = 0; i < 400; i++) {
      // interleaved so that drift (GC, CPU frequency, other test files) hits both samples equally
      const u = await one(unknownTok);
      const w = await one(wrongTok);
      a.push(u.ms);
      b.push(w.ms);
      shapes.add(`${u.status}|${u.body}|${u.ct}`);
      shapes.add(`${w.status}|${w.body}|${w.ct}`);
    }
    expect([...shapes]).toEqual(['401|{"error":"unauthorized"}|application/json']);
    const med = (xs: number[]) => [...xs].sort((p, q) => p - q)[xs.length >> 1]!;
    const diff = Math.abs(med(a) - med(b));
    // prototype: 0.03 ms. The bound is generous for a loaded CI box but would still catch a genuine early return (a DB read or hash skipped on one path costs >> this)
    expect(diff).toBeLessThan(Math.max(0.3, med(a) * 0.35));
    await down(s);
  });
});

describe.skipIf(!mustRun)('CORS defaults', () => {
  it('KG_ALLOW_LOCALHOST unset: a localhost page origin is refused (403); no KG_ORIGINS: every browser origin is refused, non-browser callers still work', async () => {
    const s = await up({ KG_ALLOW_LOCALHOST: '0', KG_ORIGINS: '' }, 'cors');
    const o = await fetch(s.base + '/v1/ping', { headers: { origin: 'http://localhost:5173' } });
    const p = await fetch(s.base + '/v1/ping', { headers: { origin: 'https://kg-test.example' } });
    const n = await fetch(s.base + '/v1/ping');
    expect([o.status, p.status, n.status]).toEqual([403, 403, 200]);
    expect(o.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await fetch(s.base + '/v1/state', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(pre.status).toBe(403);
    await down(s);
  });
  it('KG_ORIGINS is an exact list: sub-domains and look-alikes are refused', async () => {
    const s = await up({ KG_ORIGINS: 'https://app.example, https://preview.example', KG_ALLOW_LOCALHOST: '0' }, 'cors2');
    const st = async (o: string) => (await fetch(s.base + '/v1/ping', { headers: { origin: o } })).status;
    expect([await st('https://app.example'), await st('https://preview.example'), await st('https://app.example.evil.example'), await st('https://sub.app.example'), await st('http://app.example'), await st('null')]).toEqual([200, 200, 403, 403, 403, 403]);
    await down(s);
  });
});

describe.skipIf(!mustRun)('server units', () => {
  it('ip normalisation, CIDR, limiter hard cap, backup rotation (14 daily + 8 weekly), atomic LAST_OK, schema-version refusal', () => {
    const d = tmpDir('units');
    try {
      const res = runScenario('scn-units.mjs', { KG_TEST_DIR: d });
      expect(res.checks.length).toBeGreaterThanOrEqual(14);
      expect(failures(res)).toEqual([]);
    } finally {
      rmrf(d);
    }
  });
});
