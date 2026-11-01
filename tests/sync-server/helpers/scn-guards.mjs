// scn-guards.mjs -- guards whose behaviour depends on TIME, run under a virtual clock: the disk/DB-size guard (re-evaluated every 30 s), the enrolment deadline
// (KG_ENROLL_OPEN_UNTIL), the per-source (240/min) and per-family (300/min) request limits with Retry-After, and the 15-minute failure windows.
import * as K from './kgcrypto.mjs';
import { virtual, checker, ENROLL } from './inproc.mjs';

const { chk, done } = checker();
const envB = (n = 110) => K.b64u(new Uint8Array(n));
const mk = async () => { const S = K.newSecret(); const k = await K.derive(S); return { k, tok: `${k.fid}.${k.auth}` }; };
const reg = (v, f) => v.call('POST', '/v1/enroll', { body: { fid: f.k.fid, auth: f.k.auth, del: f.k.del, code: ENROLL } });
const put = (v, f, id, rev, env = envB(50000)) => v.call('PUT', `/v1/stores/${id}`, { auth: f.tok, body: { v: 1, env }, h: { 'if-match': `"${rev}"` } });

{ // DB size guard: library + WAL above KG_DB_MAX_MB -> 507 for writes, reads keep working; the check is cached for 30 s
  const v = await virtual({ dbMaxMB: 1, storesMax: 4 * 1048576, storesCount: 32 }, 'guard-db');
  const f = await mk();
  await reg(v, f);
  let n = 0, last = 200;
  for (let i = 0; i < 32 && last === 200; i++) { last = (await put(v, f, 's' + i, 0)).s; if (last === 200) n++; }
  chk('writes work while the database is small (first check is cached for 30 s, so the guard does not trip mid-fill)', n === 32, `${n} stores written`);
  v.clock.t += 31;
  const w = await put(v, f, 'late', 0);
  chk('database + WAL above the maximum -> writes 507 disk_guard after the cache expires', w.s === 507 && w.j.error === 'disk_guard', `${w.s} ${w.j?.error}`);
  chk('reads still work under the disk guard', (await v.call('GET', '/v1/state', { auth: f.tok })).s === 200);
  chk('and a ledger POST is refused too', (await v.call('POST', '/v1/ledger', { auth: f.tok, body: { events: [{ id: 'abc.def.1', env: envB() }] } })).s === 507);
  v.close();
}
{ // enrolment deadline
  const v = await virtual({ enrollUntil: 1_800_000_000 + 100 }, 'guard-enroll');
  const a = await mk(), b = await mk();
  chk('enrolment before KG_ENROLL_OPEN_UNTIL works', (await reg(v, a)).s === 201);
  v.clock.t += 200;
  chk('enrolment after KG_ENROLL_OPEN_UNTIL -> 403, even with the right code', (await reg(v, b)).s === 403);
  chk('an enrolled family keeps working after the deadline', (await v.call('GET', '/v1/state', { auth: a.tok })).s === 200);
  v.close();
}
{ // per-source request limit 240/min with Retry-After; window passes -> allowed
  const v = await virtual({}, 'guard-ip');
  let first429 = -1, ra = null;
  for (let i = 0; i < 260; i++) { const r = await v.call('GET', '/v1/ping'); if (r.s === 429 && first429 < 0) { first429 = i; ra = r.h.get('retry-after'); } }
  chk('240 requests per minute per source, the 241st is refused (429) with Retry-After', first429 === 240 && Number(ra) > 0 && Number(ra) <= 60, `first 429 at #${first429}, Retry-After ${ra}`);
  v.clock.t += 61;
  chk('next minute: allowed again', (await v.call('GET', '/v1/ping')).s === 200);
  v.close();
}
{ // per-family limit 300/min (sources rotate through X-Forwarded-For from the trusted proxy range so only the family bucket can trigger)
  const v = await virtual({ trustProxy: true, proxyCidr: ['127.0.0.0/8'] }, 'guard-fam');
  const f = await mk();
  await reg(v, f);
  let n429 = 0, firstAt = -1;
  for (let i = 0; i < 330; i++) { const r = await v.call('GET', '/v1/state', { auth: f.tok, h: { 'x-forwarded-for': `10.1.${i >> 8}.${i & 255}` } }); if (r.s === 429) { n429++; if (firstAt < 0) firstAt = i; } }
  chk('300 requests per minute per family (the 301st refused), independent of the source', firstAt === 300 && n429 === 30, `first 429 at #${firstAt}, ${n429} refused`);
  v.clock.t += 61;
  chk('the family limit resets after a minute', (await v.call('GET', '/v1/state', { auth: f.tok, h: { 'x-forwarded-for': '10.9.9.9' } })).s === 200);
  v.close();
}
{ // failure windows: 10 wrong keys per (source,fid) per 15 min; the window passes -> the counter resets
  const v = await virtual({ trustProxy: true, proxyCidr: ['127.0.0.0/8'] }, 'guard-fail');
  const a = await mk(), wrong = await mk();
  await reg(v, a);
  const bad = () => v.call('GET', '/v1/state', { auth: `${a.k.fid}.${wrong.k.auth}`, h: { 'x-forwarded-for': '203.0.113.7' } });
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await bad()).s);
  chk('wrong key for a known family: 10 x 401, then 429', codes.slice(0, 10).every((c) => c === 401) && codes[10] === 429 && codes[11] === 429, codes.join(','));
  chk('the valid key from the same source still works while the failure bucket is full', (await v.call('GET', '/v1/state', { auth: a.tok, h: { 'x-forwarded-for': '203.0.113.7' } })).s === 200);
  v.clock.t += 901;
  chk('after 15 minutes the failure window resets (401 again, not 429)', (await bad()).s === 401);
  v.close();
}
done();
