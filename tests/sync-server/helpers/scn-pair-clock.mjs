// scn-pair-clock.mjs -- pairing polling under a VIRTUAL clock (port of the prototype pair-test.mjs): device B polls every 2 s while the parent takes 20/60/100/130 s
// to compare the numbers and tap "allow". v1.0 shared one 8/min bucket between claim and poll and B was rate-limited after ~14 s; v1.1 has separate buckets.
import * as K from './kgcrypto.mjs';
import { virtual, checker, ENROLL } from './inproc.mjs';

const { chk, done } = checker();
const v = await virtual({}, 'pair-clock');
const { call, clock } = v;
const S = K.newSecret();
const k = await K.derive(S);
await call('POST', '/v1/enroll', { body: { fid: k.fid, auth: k.auth, del: k.del, code: ENROLL } });
const tok = `${k.fid}.${k.auth}`;

for (const waitS of [20, 60, 100, 130]) {
  const ea = await K.ecKey(), eb = await K.ecKey(), nB = K.newNonce(), commit = await K.pairCommit(eb.pub, nB);
  const t0 = clock.t;
  const pn = await call('POST', '/v1/pair', { auth: tok, body: {} });
  clock.t += 8;
  await call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit, label: 'iPhone' } });
  let s429 = 0, polls = 0;
  const step = async (s) => {
    for (let i = 0; i < s / 2; i++) {
      clock.t += 2;
      const a = await call('GET', '/v1/pair/' + pn.j.pid, { auth: tok });
      const b = await call('GET', `/v1/pair/${pn.j.pid}/apub`, { h: { 'x-kg-pair-code': pn.j.code } });
      polls += 2;
      if (a.s === 429 || b.s === 429) s429++;
    }
  };
  await call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: tok, body: { apub: K.b64u(ea.pub) } });
  await step(4);
  await call('POST', `/v1/pair/${pn.j.pid}/reveal`, { h: { 'x-kg-pair-code': pn.j.code }, body: { bpub: K.b64u(eb.pub), nB: K.b64u(nB) } });
  const g = await K.wrap(await K.sharedKey(ea.priv, eb.pub), S, pn.j.pid);
  let gs = 0; // the parent compares the numbers for `waitS` seconds; B keeps polling the GRANT every 2 s
  for (let i = 0; i < waitS / 2; i++) {
    clock.t += 2;
    const r = await call('GET', `/v1/pair/${pn.j.pid}/grant`, { h: { 'x-kg-pair-code': pn.j.code } });
    polls++;
    if (r.s === 429) s429++;
    if (r.s === 404) gs = 404;
    if (r.s === 200) gs = 200;
  }
  await call('POST', `/v1/pair/${pn.j.pid}/grant`, { auth: tok, body: { grant: g } });
  clock.t += 2;
  const got = await call('GET', `/v1/pair/${pn.j.pid}/grant`, { h: { 'x-kg-pair-code': pn.j.code } });
  if (waitS < 120) chk(`parent takes ${waitS} s after the reveal: ${polls} polls by A and B, no 429, grant delivered`, got.s === 200 && s429 === 0 && gs !== 404, `status ${got.s}; 429s ${s429}; elapsed ${clock.t - t0} s`);
  else chk(`parent takes ${waitS} s (> 120 s after the reveal): the pairing expires, no 429 on the way, nothing is delivered`, got.s === 404 && s429 === 0, `status ${got.s}`);
}
{ // a pairing nobody finishes expires (180 s) and the code stops working
  const pn = await call('POST', '/v1/pair', { auth: tok, body: {} });
  clock.t += 181;
  const r = await call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit: 'A'.repeat(43), label: 'iPhone' } });
  chk('an unclaimed code expires after 180 s', r.s === 404);
}
{ // a claimed pairing nobody continues also expires: A cannot post apub any more
  const pn = await call('POST', '/v1/pair', { auth: tok, body: {} });
  await call('POST', '/v1/pair/claim', { body: { code: pn.j.code, commit: 'B'.repeat(43), label: 'iPad' } });
  clock.t += 181;
  const r = await call('POST', `/v1/pair/${pn.j.pid}/apub`, { auth: tok, body: { apub: K.b64u((await K.ecKey()).pub) } });
  chk('a claimed but unfinished pairing expires after 180 s too (A gets 404)', r.s === 404, String(r.s));
}
{ // brute-forcing the 6-digit code: claim bucket 8/min per source, ban after 10 failures
  await call('POST', '/v1/pair', { auth: tok, body: {} });
  let ok = 0, n429 = 0;
  for (let i = 0; i < 60; i++) {
    const r = await call('POST', '/v1/pair/claim', { body: { code: String(100000 + i).padStart(6, '0'), commit: 'A'.repeat(43), label: 'x' } });
    if (r.s === 429) n429++;
    if (r.s === 200) ok++;
  }
  chk('guessing codes: 60 guesses from one source -> the claim bucket (8/min) refuses nearly all', n429 >= 50, `${n429} x 429, ${ok} lucky`);
  clock.t += 61; // the per-minute window passes, but the 15-minute failure counter keeps the guesser out
  const r = await call('POST', '/v1/pair/claim', { body: { code: '123456', commit: 'A'.repeat(43), label: 'x' } });
  chk('after the minute window the failure counter (10 per 15 min) still refuses the guesser', r.s === 429, String(r.s));
}
v.close();
done();
