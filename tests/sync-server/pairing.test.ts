// Suite 2/4 -- pairing (docs/specs/sync.md section 1 "配对中间人", section 5, section 7 pair-test): commit-then-reveal with REAL crypto against a real server,
// ordering/state-machine refusals, the code only in a header, separate claim / poll buckets, and the virtual-clock scenario (parent takes 20/60/100/130 s).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { K, ENROLL, boot, enroll, fam, failures, mustRun, portAllocator, rmrf, runScenario, tmpDir, type Fam, type Srv } from './helpers/proc';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const alloc = portAllocator(59200);
let dir = '';
const running: Srv[] = [];
const up = async (extra: Record<string, string> = {}, name = 'pair') => {
  const s = await boot(alloc, dir, { KG_RATE_MULT: '10', ...extra }, { name });
  running.push(s);
  return s;
};
beforeAll(() => {
  if (mustRun) dir = tmpDir('pairing');
});
afterAll(async () => {
  await Promise.all(running.map((s) => s.stop()));
  if (dir) rmrf(dir);
});

const hdr = (code: string) => ({ 'x-kg-pair-code': code });
/** one full pairing handshake up to (and not including) the grant, using the real client crypto */
async function handshake(srv: Srv, A: Fam) {
  const ea = await K.ecKey();
  const eb = await K.ecKey();
  const nB = K.newNonce();
  const commit = await K.pairCommit(eb.pub, nB);
  const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
  const cl = await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label: 'iPhone' } });
  const ap = await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: A.tok, body: { apub: K.b64u(ea.pub) } });
  const rv = await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: { bpub: K.b64u(eb.pub), nB: K.b64u(nB) } });
  return { ea, eb, nB, commit, pn, cl, ap, rv, pid: pn.j.pid as string, code: pn.j.code as string };
}

/** a fresh server + enrolled family per test: the claim bucket is only 8 / min per source, so tests must not share one */
async function fresh(name: string): Promise<{ srv: Srv; A: Fam }> {
  const srv = await up({}, name);
  const A = await fam();
  await enroll(srv, A);
  return { srv, A };
}

describe.skipIf(!mustRun)('commit-then-reveal, end to end with real crypto', () => {
  it('full v1.1 flow: commit (B) -> apub (A) -> reveal (B) -> equal 6-digit SAS -> grant -> B recovers the family secret; grant is single use', async () => {
    const { srv, A } = await fresh('e2e');
    const ea = await K.ecKey();
    const eb = await K.ecKey();
    const nB = K.newNonce();
    const commit = await K.pairCommit(eb.pub, nB);

    const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    expect(pn.j.code).toMatch(/^\d{6}$/);
    expect(pn.j.ttl).toBe(180);

    // wrong code -> 404 (and it costs the guesser a failure)
    expect((await srv.call('POST', '/v1/pair/claim', { body: { code: String((Number(pn.j.code) + 1) % 1000000).padStart(6, '0'), commit, label: 'x' } })).s).toBe(404);

    // B claims with the COMMITMENT only: no public key is on the server yet, the pid comes back
    const cl = await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label: 'iPhone' } });
    expect(cl.s).toBe(200);
    expect(cl.j.pid).toBe(pn.j.pid);
    expect(cl.j).not.toHaveProperty('apub');
    expect((await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label: 'x' } })).s).toBe(404); // single use

    // B cannot get apub before A posted it (202), cannot reveal early (409)
    expect((await srv.call('GET', `/v1/pair/${pn.j.pid}/apub`, { headers: hdr(pn.j.code) })).s).toBe(202);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: { bpub: K.b64u(eb.pub), nB: K.b64u(nB) } })).s).toBe(409);

    // A sees the claim: commit + label, no bpub yet
    const pg = await srv.call('GET', '/v1/pair/' + pn.j.pid, { auth: A.tok });
    expect([pg.j.state, pg.j.commit, pg.j.label, pg.j.bpub]).toEqual(['claimed', commit, 'iPhone', null]);

    // A posts apub only after the commitment
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: A.tok, body: { apub: K.b64u(ea.pub) } })).s).toBe(200);
    const ga = await srv.call('GET', `/v1/pair/${pn.j.pid}/apub`, { headers: hdr(pn.j.code) });
    expect([ga.s, ga.j.apub]).toEqual([200, K.b64u(ea.pub)]);

    // reveal: wrong key (commitment mismatch) -> 400; wrong code -> 404; right -> 200
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: { bpub: K.b64u((await K.ecKey()).pub), nB: K.b64u(nB) } })).s).toBe(400);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr('000000'), body: { bpub: K.b64u(eb.pub), nB: K.b64u(nB) } })).s).toBe(404);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: { bpub: K.b64u(eb.pub), nB: K.b64u(nB) } })).s).toBe(200);

    // A fetches bpub + nB, verifies H(bpub || nB) == commit, both screens show the same 6 digits
    const pg2 = await srv.call('GET', '/v1/pair/' + pn.j.pid, { auth: A.tok });
    const bpubA = K.unb64u(pg2.j.bpub);
    const nBA = K.unb64u(pg2.j.nB);
    expect(await K.pairCommit(bpubA, nBA)).toBe(commit);
    const sasA = await K.sas(ea.pub, bpubA, nBA);
    const sasB = await K.sas(K.unb64u(ga.j.apub), eb.pub, nB);
    expect(sasA).toBe(sasB);
    expect(sasA).toMatch(/^\d{6}$/);

    // grant: not yet -> 202; A posts the wrapped secret; wrong code -> 404; right code -> secret recovered; second fetch -> 404
    const wrapped = await K.wrap(await K.sharedKey(ea.priv, bpubA), A.S, pn.j.pid);
    expect((await srv.call('GET', `/v1/pair/${pn.j.pid}/grant`, { headers: hdr(pn.j.code) })).s).toBe(202);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: A.tok, body: { grant: wrapped } })).s).toBe(200);
    expect((await srv.call('GET', `/v1/pair/${pn.j.pid}/grant`, { headers: hdr('999999') })).s).toBe(404);
    const gg = await srv.call('GET', `/v1/pair/${pn.j.pid}/grant`, { headers: hdr(pn.j.code) });
    const S2 = await K.unwrap(await K.sharedKey(eb.priv, K.unb64u(ga.j.apub)), gg.j.grant, pn.j.pid);
    expect(Buffer.from(S2).equals(Buffer.from(A.S))).toBe(true);
    expect((await srv.call('GET', `/v1/pair/${pn.j.pid}/grant`, { headers: hdr(pn.j.code) })).s).toBe(404);
    expect((await srv.call('GET', '/v1/pair/' + pn.j.pid, { auth: A.tok })).s).toBe(404); // the finished pairing is gone
  });

  it('the server never learns the family secret: the grant it relays is opaque (cannot be unwrapped without B\'s private key)', async () => {
    const { srv, A } = await fresh('opaque');
    const h = await handshake(srv, A);
    const wrapped = await K.wrap(await K.sharedKey(h.ea.priv, h.eb.pub), A.S, h.pid);
    await srv.call('POST', `/v1/pair/${h.pid}/grant`, { auth: A.tok, body: { grant: wrapped } });
    const gg = await srv.call('GET', `/v1/pair/${h.pid}/grant`, { headers: hdr(h.code) });
    const stranger = await K.ecKey();
    await expect(K.unwrap(await K.sharedKey(stranger.priv, h.ea.pub), gg.j.grant, h.pid)).rejects.toBeTruthy();
    expect(gg.j.grant).not.toContain(K.b64u(A.S));
  });

  it('the device label is an enum (anything else becomes 其他)', async () => {
    const { srv, A } = await fresh('label');
    const eb = await K.ecKey();
    const commit = await K.pairCommit(eb.pub, K.newNonce());
    const out: string[] = [];
    for (const label of ['<script>alert(1)</script>', 'iPad', '电脑', 'iPhone ', undefined]) {
      const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
      await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label } });
      out.push((await srv.call('GET', '/v1/pair/' + pn.j.pid, { auth: A.tok })).j.label);
    }
    expect(out).toEqual(['其他', 'iPad', '电脑', '其他', '其他']);
  });

  it('another family can neither read nor drive my pairing (404)', async () => {
    const { srv, A } = await fresh('foreign');
    const X = await fam();
    await enroll(srv, X);
    const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    const eb = await K.ecKey();
    await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit: await K.pairCommit(eb.pub, K.newNonce()), label: 'iPad' } });
    expect((await srv.call('GET', '/v1/pair/' + pn.j.pid, { auth: X.tok })).s).toBe(404);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: X.tok, body: { apub: K.b64u((await K.ecKey()).pub) } })).s).toBe(404);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: X.tok, body: { grant: 'AAAA' } })).s).toBe(404);
  });

  it('a new pairing from the same family supersedes the old one (the old code stops working)', async () => {
    const { srv, A } = await fresh('supersede');
    const p1 = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    const p2 = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    const commit = await K.pairCommit((await K.ecKey()).pub, K.newNonce());
    expect((await srv.call('POST', '/v1/pair/claim', { body: { code: p1.j.code, commit, label: 'iPad' } })).s).toBe(404);
    expect((await srv.call('POST', '/v1/pair/claim', { body: { code: p2.j.code, commit, label: 'iPad' } })).s).toBe(200);
  });
});

describe.skipIf(!mustRun)('state machine: nothing can be done out of order', () => {
  it('apub before claim, reveal before apub, grant before reveal, repeats -> 409; B-side calls need the exact code in the HEADER', async () => {
    const srv = await up({}, 'order');
    const A = await fam();
    await enroll(srv, A);
    const ea = await K.ecKey();
    const eb = await K.ecKey();
    const nB = K.newNonce();
    const commit = await K.pairCommit(eb.pub, nB);
    const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    const apubBody = { apub: K.b64u(ea.pub) };
    const revealBody = { bpub: K.b64u(eb.pub), nB: K.b64u(nB) };

    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: A.tok, body: apubBody })).s).toBe(409); // not claimed yet
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: A.tok, body: { grant: 'AAAA' } })).s).toBe(409);
    expect((await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit: 'short', label: 'iPad' } })).s).toBe(404); // malformed commitment
    expect((await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label: 'iPad' } })).s).toBe(200);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: A.tok, body: { apub: 'tooshort' } })).s).toBe(409);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: A.tok, body: apubBody })).s).toBe(200);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: A.tok, body: apubBody })).s).toBe(409); // apub is write-once
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: A.tok, body: { grant: 'AAAA' } })).s).toBe(409); // grant before reveal

    // code only in the query string / only in the path: NOT accepted
    expect((await srv.call('GET', `/v1/pair/${pn.j.pid}/apub?code=${pn.j.code}`)).s).toBe(404);
    expect((await srv.call('GET', `/v1/pair/${pn.j.pid}/apub`, { headers: hdr('12345') })).s).toBe(404);
    expect((await srv.call('GET', `/v1/pair/${pn.j.pid}/apub`)).s).toBe(404);
    // malformed reveal bodies
    for (const body of [{}, { bpub: 'x', nB: 'y' }, { bpub: revealBody.bpub }, { nB: revealBody.nB }, { bpub: 5, nB: 6 }]) {
      expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body })).s).toBe(409);
    }
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: revealBody })).s).toBe(200);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: revealBody })).s).toBe(409); // reveal is write-once
    // grant size limit and charset
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: A.tok, body: { grant: 'A'.repeat(401) } })).s).toBe(409);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: A.tok, body: { grant: '<script>' } })).s).toBe(409);
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: A.tok, body: { grant: 'A'.repeat(100) } })).s).toBe(200);
    // an unauthenticated caller cannot use the A-side endpoints
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/grant`, { body: { grant: 'AAAA' } })).s).toBe(401);
    expect((await srv.call('GET', '/v1/pair/' + pn.j.pid)).s).toBe(401);
    expect((await srv.call('POST', '/v1/pair', { body: {} })).s).toBe(401);
  });

  it('a malicious B cannot swap its key after seeing apub: the reveal must hash to the commitment', async () => {
    const srv = await up({}, 'swap');
    const A = await fam();
    await enroll(srv, A);
    const ea = await K.ecKey();
    const eb = await K.ecKey();
    const evil = await K.ecKey();
    const nB = K.newNonce();
    const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit: await K.pairCommit(eb.pub, nB), label: 'iPad' } });
    await srv.call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: A.tok, body: { apub: K.b64u(ea.pub) } });
    // after seeing apub the attacker tries to reveal a DIFFERENT key (grinding the SAS) or a different nonce
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: { bpub: K.b64u(evil.pub), nB: K.b64u(nB) } })).j.error).toBe('commit_mismatch');
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: { bpub: K.b64u(eb.pub), nB: K.b64u(K.newNonce()) } })).j.error).toBe('commit_mismatch');
    // the honest reveal still works
    expect((await srv.call('POST', `/v1/pair/${pn.j.pid}/reveal`, { headers: hdr(pn.j.code), body: { bpub: K.b64u(eb.pub), nB: K.b64u(nB) } })).s).toBe(200);
    const pg = await srv.call('GET', '/v1/pair/' + pn.j.pid, { auth: A.tok });
    expect(pg.j.state).toBe('revealed');
  });
});

describe.skipIf(!mustRun)('rate limits: claim and poll are SEPARATE buckets', () => {
  it('B polling quickly never uses up the claim bucket (8 / min); the per-pair poll limit (40 / min) still exists', async () => {
    const srv = await up({}, 'buckets');
    const A = await fam();
    await enroll(srv, A);
    const commit = await K.pairCommit((await K.ecKey()).pub, K.newNonce());
    const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label: 'iPad' } });
    const codes: number[] = [];
    for (let i = 0; i < 45; i++) codes.push((await srv.call('GET', `/v1/pair/${pn.j.pid}/apub`, { headers: hdr(pn.j.code) })).s);
    expect(codes.slice(0, 40).every((c) => c === 202)).toBe(true); // 40 polls in a minute are fine (every 2 s for 80 s)
    expect(codes.slice(40).every((c) => c === 429)).toBe(true); // the 41st+ is refused with 429
    // the claim bucket is untouched by 45 polls: a brand-new pairing can still be claimed (and more than once is not needed)
    const p2 = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    expect((await srv.call('POST', '/v1/pair/claim', { body: { code: p2.j.code, commit, label: 'iPad' } })).s).toBe(200);
  });
  it('claim bucket: 8 attempts / min / source (default multiplier), Retry-After set; 10 failures in 15 min lock the guesser out', async () => {
    const srv = await up({ KG_RATE_MULT: '1' }, 'claim');
    const A = await fam();
    await enroll(srv, A);
    await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    const commit = 'A'.repeat(43);
    const out: number[] = [];
    let ra: string | null = null;
    for (let i = 0; i < 12; i++) {
      const r = await srv.call('POST', '/v1/pair/claim', { body: { code: String(100000 + i), commit, label: 'x' } });
      out.push(r.s);
      if (r.s === 429) ra = r.h.get('retry-after');
    }
    expect(out.slice(0, 8).every((c) => c === 404)).toBe(true);
    expect(out.slice(8).every((c) => c === 429)).toBe(true);
    expect(Number(ra)).toBeGreaterThan(0);
  });
  it('wrong-pair-code polls on the B side count as failures too (10 per 15 min), so the 6-digit code cannot be ground through the poll endpoints', async () => {
    const srv = await up({ KG_RATE_MULT: '1' }, 'polls');
    const A = await fam();
    await enroll(srv, A);
    const pn = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    const commit = await K.pairCommit((await K.ecKey()).pub, K.newNonce());
    await srv.call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label: 'iPad' } });
    for (let i = 0; i < 11; i++) await srv.call('GET', `/v1/pair/${pn.j.pid}/apub`, { headers: hdr(String(200000 + i)) });
    // the guesser's failure counter is now above 10: even a CLAIM with a correct code from the same source is refused (a lucky guess does not count)
    const p2 = await srv.call('POST', '/v1/pair', { auth: A.tok, body: {} });
    const r = await srv.call('POST', '/v1/pair/claim', { body: { code: p2.j.code, commit, label: 'x' } });
    expect(r.s).toBe(429);
  });
});

describe.skipIf(!mustRun)('pairing under a virtual clock (the parent takes a while to compare the numbers)', () => {
  it('parent allows after 20 / 60 / 100 s -> delivered with no 429; after 130 s -> expired; unfinished pairings expire at 180 s; code guessing is locked out', () => {
    const d = tmpDir('pairclock');
    try {
      const res = runScenario('scn-pair-clock.mjs', { KG_TEST_DIR: d });
      expect(res.checks.length).toBe(8);
      expect(failures(res)).toEqual([]);
    } finally {
      rmrf(d);
    }
  });
});

describe.skipIf(!mustRun)('enrolment code is not part of pairing', () => {
  it('claiming never needs (or leaks) the enrolment code', async () => {
    const srv = await up({}, 'noenroll');
    const A = await fam();
    await enroll(srv, A);
    const h = await handshake(srv, A);
    expect([h.cl.s, h.ap.s, h.rv.s]).toEqual([200, 200, 200]);
    for (const s of ['bpub', 'apub', 'commit']) expect(JSON.stringify(h.cl.j)).not.toContain(s);
    expect(JSON.stringify(h.rv.j)).not.toContain(ENROLL);
  });
});
