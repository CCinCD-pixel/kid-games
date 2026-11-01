// Self-test: legacy migration (元老卡), save schema, controller invariants (gates, park, soft rounds, support ladder), classify, recommend, generateSafe,
// determinism, display floors, card / constellation / wall data, golden fixtures. Expected values in fixtures/ were written by hand.
import fs from 'node:fs';
import { createRng } from './rng.mjs';
import { makeHistory } from './grid.mjs';
import { generate, generateSafe } from './gen.mjs';
import { computeVeteran } from './veteran.mjs';
import { defaults, applyVeteran, classify as classifySave, sizeBytes } from './save.mjs';
import { CFG, newSector, startNight, nextRound, report, gateStep, classify, nightValid, recommend, gateEligible, nightDone, welcomeBack, primerGhost, reportPrimer } from './controller.mjs';
import { TABLE, SECTOR_IDS, PREVIEW_MIN_MS, NDIFF, tagsOf } from './params.mjs';
import * as cards from './cards.mjs';
import * as cons from './constellations.mjs';
import { genGolden, traceGolden } from './golden.mjs';
import { GOLDEN, FIXTURES } from './paths.mjs';
let bad = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) bad += 1; };
const quiet = process.argv.includes('--quiet');
if (quiet) { const log = console.log; console.log = (s) => { if (String(s).startsWith('FAIL') || String(s).startsWith('selftest')) log(s); }; }

// ---- V: veteran card
const vc = JSON.parse(fs.readFileSync(`${FIXTURES}/veteran-cases.json`, 'utf8'));
for (const c of vc) { const r = computeVeteran(c.live, c.snapshot, c.prev ?? undefined, 1_800_000_000_000); ok(JSON.stringify({ stars: r.legacy.memoryMatrixStars, cleared: r.legacy.memoryMatrixCleared, awardNow: r.awardNow, source: r.legacy.source }) === JSON.stringify(c.expect), `V ${c.name}`); }
const live = JSON.stringify({ ladders: { sprout: { unlocked: 9, solved: { 1: { stars: 3 }, 2: { stars: 2 }, 3: { stars: 3 } } }, galaxy: { unlocked: 2, solved: { 1: { stars: 1 } } } } });
const s0 = defaults(), a = applyVeteran(s0, live, null, 1_800_000_000_000), b = applyVeteran(a.save, live, null, 1_900_000_000_000);
ok(a.awardNow && !b.awardNow, 'V award exactly once'); ok(a.save.cards.join() === 'c.vet' && b.save.cards.join() === 'c.vet', 'V card id c.vet, no duplicate');
ok(a.save.veteran.stars === 9 && a.save.veteran.cleared === 4, `V stars/cleared tallied (${a.save.veteran.stars}/${a.save.veteran.cleared})`);
ok(JSON.stringify(a.save.sectors) === JSON.stringify(s0.sectors) && JSON.stringify(a.save.tutorial) === JSON.stringify(s0.tutorial), 'V levels, sectors and tutorial flags untouched (card only)');
ok(applyVeteran(defaults(), null, null).save.cards.length === 0, 'V no old save -> no card');
for (const raw of [undefined, '', 'null', '[]', '{"ladders":null}']) { let t = false; try { applyVeteran(defaults(), raw, raw); } catch { t = true; } ok(!t, `V no-throw on ${JSON.stringify(raw)}`); }
ok(classifySave('{"v":2}') === 'newer' && classifySave('{"v":1}') === 'ok' && classifySave('oops') === 'fresh', 'S newer-version saves are read-only, junk is fresh');
const heavy = defaults(); for (const s of Object.values(heavy.sectors)) { for (let D = 1; D <= NDIFF; D += 1) s.byLevel[D] = { att: 3, stars: 2, rw: 1 }; s.tracks.forEach((t) => { t.cp = { LR: 99, UD: 99, F: 99, B: 99, near: 99, far: 99 }; }); }
for (const r of Object.values(heavy.recent)) { r.exact = Array(64).fill(4294967295); r.shape = Array(6).fill(4294967295); } heavy.cards = cards.CARDS.map((c) => c.id);
ok(sizeBytes(heavy) < 16000, `S worst-case save ${sizeBytes(heavy)} bytes < 16000`);
const rt = JSON.parse(JSON.stringify(newSector('s4', true))); ok(JSON.stringify(rt) === JSON.stringify(newSector('s4', true)), 'S controller state survives a JSON round trip');

// ---- helpers for controller tests
const play = (st, res) => { const nr = nextRound(st); if (nr.kind === 'gate') { const v = gateStep(st, res === 'pass' ? 'pass' : 'miss'); return { nr, v }; } if (nr.kind === 'demo') { report(st, 'neutral', {}); return { nr }; } return { nr, ev: report(st, res, { tags: TABLE[st.sector][nr.D - 1].tags.slice(0, 1) }) }; };
const nightsOf = (st, n, fn) => { for (let i = 0; i < n; i += 1) { startNight(st); while (!nightDone(st)) fn(st); } };

// ---- C: controller
{
  const st = newSector('s1', true); startNight(st); for (let i = 0; i < 60; i += 1) { if (nightDone(st)) startNight(st); play(st, 'miss'); }
  ok(st.tracks[0].L === 1 && nextRound(st).D === 1, 'C 60 misses in a row end at D1 (floor), never below');
  const s2 = newSector('s1', true); let firstGate = null, rounds = 0; const atGs = [];
  nightsOf(s2, 8, (x) => { const r = play(x, 'pass'); if (r.nr.kind === 'gate' && r.nr.i === 0) { atGs.push(x.tracks[0].atG); firstGate ??= rounds; } if (r.nr.kind === 'gate') { /* keep passing */ } else rounds += 1; });
  ok(atGs.length >= 1 && atGs.every((g) => g >= CFG.atGMin), `C a gate is never offered with < ${CFG.atGMin} regular rounds at its level (atG at gate start: ${atGs.join(',')})`);
  ok(firstGate !== null && firstGate >= 3 && firstGate <= 4, `C an all-pass child meets the first gate after 3-4 regular rounds, in night 1 (met after ${firstGate})`);
  { // v1.2 (QA r1): an all-pass child never sees one level more than twice in a row before and right after the first gate, and keeps climbing after it
    const x = newSector('s1', true), seq = []; startNight(x);
    for (let i = 0; i < 40 && seq.length < 14; i += 1) { if (nightDone(x)) startNight(x); const r = play(x, 'pass'); if (r.nr.kind !== 'gate') seq.push(r.nr.D); }
    const run = (xs) => { let m = 1, c = 1; for (let i = 1; i < xs.length; i += 1) { c = xs[i] === xs[i - 1] ? c + 1 : 1; m = Math.max(m, c); } return m; };
    ok(run(seq.slice(0, 7)) <= 2, `C first 7 regular rounds of an all-pass child: no level more than twice in a row (${seq.slice(0, 7).join(',')})`);
    ok(new Set(seq.slice(0, 8)).size >= 5, `C ...and at least 5 different levels in the first 8 rounds (${seq.slice(0, 8).join(',')})`);
    ok(x.tracks[0].cleared >= 1 && seq.includes(6), `C ...a passed gate continues at G+1 (D6 seen: ${seq.join(',')})`);
  }
  // gate sequential test
  const g = (seq) => { const x = newSector('s1', true); x.tracks[0].L = 5; x.tracks[0].atG = 3; x.gate = { G: 5, i: 0, passes: 0, misses: 0, levels: [4, 5, 4, 5, 5] }; let last; const used = []; for (const r of seq) { last = gateStep(x, r); used.push(r); if (last.verdict !== 'continue') break; } return { v: last.verdict, n: used.length }; };
  ok(JSON.stringify(g(['pass', 'pass', 'pass', 'pass'])) === '{"v":"passed","n":4}', 'C gate: 4 passes in a row -> passed after 4 rounds');
  ok(JSON.stringify(g(['pass', 'miss', 'pass', 'pass', 'pass'])) === '{"v":"passed","n":5}', 'C gate: P M P P P -> passed on round 5');
  ok(JSON.stringify(g(['miss', 'miss'])) === '{"v":"failed","n":2}', 'C gate: 2 misses -> failed after 2 rounds (a child never misses more than 2 in a gate)');
  ok(JSON.stringify(g(['pass', 'miss', 'miss'])) === '{"v":"failed","n":3}' && JSON.stringify(g(['pass', 'pass', 'miss', 'miss'])) === '{"v":"failed","n":4}', 'C gate: stops at the 2nd miss wherever it falls');
  // a failed gate: L = G-1, atG reset, demo queued, re-offer only after 3 rounds at G again; two failures -> park 30, then 60
  const f = newSector('s1', true), t = f.tracks[0]; t.L = 5; t.atG = 3; t.cp = {}; startNight(f); const n1 = nextRound(f); ok(n1.kind === 'gate' && n1.D === 4, 'C gate starts at G-1');
  gateStep(f, 'miss'); const v1 = gateStep(f, 'miss'); ok(v1.verdict === 'failed' && t.L === 4 && t.atG === 0 && f.queue[0] === 'demo' && t.gateFails === 1, 'C failed gate: L=G-1, atG reset, remedial demo queued');
  ok(!gateEligible(f, t), 'C a failed gate is not re-offered at once');
  const gateRound = () => { let guard = 0; while (guard++ < 400) { if (nightDone(f)) startNight(f); const nr = nextRound(f); if (nr.kind === 'gate') return nr; if (nr.kind === 'demo') report(f, 'neutral', {}); else report(f, 'pass', { tags: [] }); } return null; };
  let r2 = gateRound(); ok(r2 && t.atG >= CFG.atGMin, `C re-offered only after >= ${CFG.atGMin} rounds back at G (atG ${t.atG})`);
  gateStep(f, 'miss'); const v2 = gateStep(f, 'miss'); ok(v2.verdict === 'failed' && t.park === 30 && t.parkCount === 1, `C 2nd failed gate parks the gate for 30 regular rounds (park ${t.park})`);
  let reg = 0, offered = null; for (let guard = 0; guard < 600 && !offered; guard += 1) { if (nightDone(f)) startNight(f); const nr = nextRound(f); if (nr.kind === 'gate') offered = nr; else { if (nr.kind !== 'demo') reg += 1; report(f, nr.kind === 'demo' ? 'neutral' : 'pass', { tags: [] }); } }
  ok(offered && reg >= 30, `C parked gate not offered before 30 regular rounds (offered after ${reg})`);
  const tf = newSector('s1', true), tt = tf.tracks[0]; tt.L = 5; tt.atG = 3; tf.gate = { G: 5, i: 0, passes: 0, misses: 0, levels: [4, 5, 4, 5, 5] }; tt.parkCount = 1; tt.gateFails = 1; gateStep(tf, 'miss'); gateStep(tf, 'miss'); ok(tt.park === 60, 'C parking backs off 30 -> 60 -> 120');
  // gate only at the start of a night; a gate does not use up the night's rounds
  const nn = newSector('s1', true); nn.tracks[0].L = 5; nn.tracks[0].atG = 3; startNight(nn); nextRound(nn); ok(nn.nr === 0, 'C a gate round does not count toward the night');
  const mid = newSector('s1', true); mid.tracks[0].L = 5; mid.tracks[0].atG = 3; startNight(mid); mid.queue = ['easy']; ok(nextRound(mid).kind === 'easy', 'C support rounds go before a gate'); report(mid, 'pass', {}); ok(nextRound(mid).kind === 'round' || nextRound(mid).kind === 'gate', 'C (support round consumed)');
  const m2 = newSector('s1', true); m2.tracks[0].L = 5; m2.tracks[0].atG = 3; startNight(m2); const rr = nextRound(m2); gateStep(m2, 'pass'); gateStep(m2, 'pass'); gateStep(m2, 'pass'); gateStep(m2, 'pass'); startNight(m2); play(m2, 'pass'); m2.nr = 1; ok(rr.kind === 'gate' && m2.tracks[0].cleared === 1 && !m2.gate, 'C passed gate: cleared 1, gate closed');
  const m3 = newSector('s1', true); m3.tracks[0].L = 5; m3.tracks[0].atG = 3; startNight(m3); m3.nr = 2; ok(nextRound(m3).kind === 'gate' && m3.nr === 2, 'C v1.2: a gate may be offered between two rounds of a night (and does not use one up)');
  const m4 = newSector('s1', true); m4.tracks[0].L = 5; m4.tracks[0].atG = 3; startNight(m4); m4.nr = 2; m4.nightMiss = 2; ok(nextRound(m4).kind !== 'gate', 'C ...but not in a night that already went badly (2 misses)');
  const m5 = newSector('s1', true); m5.tracks[0].L = 5; m5.tracks[0].atG = 2; startNight(m5); nextRound(m5); for (const r of ['pass', 'pass', 'pass', 'pass']) gateStep(m5, r); ok(m5.tracks[0].cleared === 1 && m5.tracks[0].L === 6 && m5.tracks[0].ramp === CFG.ramp, `C a passed gate lifts the child to G+1 and arms the ${CFG.ramp}-rung ramp`);
  { const e = report(m5, 'pass', { tags: [] }); const L1 = m5.tracks[0].L; report(m5, 'pass', { tags: [] }); const L2 = m5.tracks[0].L; report(m5, 'pass', { tags: [] }); const L3 = m5.tracks[0].L; ok(e.includes('levelUp') && L1 === 7 && L2 === 8 && L3 === 9 && m5.tracks[0].ramp === 0, `C ramp: the next ${CFG.ramp} passes climb a rung each (${L1}, ${L2}, ${L3})`); report(m5, 'miss', { tags: [] }); ok(m5.tracks[0].ramp === 0, 'C a miss clears any ramp'); }
  // tags: s4 gate needs >= 3 unaided passes of EACH axis in its row
  const s4 = newSector('s4', true), t4 = s4.tracks[0]; t4.L = 5; t4.atG = 3; ok(!gateEligible(s4, t4), 'C s4 gate not offered without concept passes'); t4.cp = { LR: 3 }; ok(!gateEligible(s4, t4), 'C ...nor with only one axis'); t4.cp = { LR: 3, UD: 3 }; ok(gateEligible(s4, t4), 'C ...but offered once LR and UD both have 3 passes');
  // park / atG start
  const ps = newSector('s1', true); ok(ps.tracks[0].L === 3 && ps.tracks[0].placement, 'C first-ever round of s1 starts at D3 (not D1), placement on');
  const pl = newSector('s1', true); startNight(pl); const L0 = []; for (let i = 0; i < 3; i += 1) { play(pl, 'pass'); L0.push(pl.tracks[0].L); } ok(L0[0] === 5 && L0.every((x) => x === 5), `C placement: a pass jumps to the cap (D3 -> D5), path ${L0}`);
  // soft round after a wing switch
  const w = newSector('s2', true); w.tracks[0].cleared = 1; w.tracks[0].L = 6; startNight(w); startNight(w); const sr = nextRound(w); ok(w.nights === 2 && sr.soft, 'C first round after a wing switch is soft');
  const wt = w.tracks[w.cur], Lbefore = wt.L, evs = report(w, 'miss', {}); ok(evs.includes('softMiss') && wt.L === Lbefore && wt.m === 1, 'C a soft miss is neutral: L unchanged (support ladder still counts it)');
  // support ladder: 2 misses -> easy; 3 -> demo + scaffold, drop 2; scaffold pass does not climb
  const e = newSector('s1', true), te = e.tracks[0]; te.L = 8; te.placement = false; startNight(e);
  play(e, 'miss'); ok(te.L === 7, 'C miss drops one level'); play(e, 'miss'); ok(te.L === 6 && e.queue[0] === 'easy', 'C 2nd miss in a row -> one easy round queued');
  const er = nextRound(e); ok(er.kind === 'easy' && er.rel === 5, 'C easy round is served one level below'); report(e, 'miss', {}); ok(te.L === 4 && e.queue.join() === 'demo,scaffold', `C 3rd miss in a row drops 2 (L ${te.L}) and queues demo + scaffold`);
  ok(nextRound(e).kind === 'demo', 'C demo first'); report(e, 'neutral', {}); const sc = nextRound(e); ok(sc.kind === 'scaffold', 'C then the scaffolded round'); report(e, 'neutral', {}); ok(te.L === 4 && te.s === 0, 'C a scaffolded clear never climbs');
  // night softening
  const ns = newSector('s1', true), tn = ns.tracks[0]; tn.L = 8; tn.placement = false; startNight(ns); play(ns, 'miss'); play(ns, 'pass'); play(ns, 'miss'); const nk = nextRound(ns); ok(ns.nightMiss === 2 && nk.kind === 'easy', 'C after 2 misses in a night the rest of the night is served one level easier');
  // 4-up
  const up = newSector('s1', true), tu = up.tracks[0]; tu.L = 2; tu.placement = false; startNight(up); for (let i = 0; i < 3; i += 1) { if (nightDone(up)) startNight(up); play(up, 'pass'); } ok(tu.L === 2, 'C 3 passes do not climb (4-up)'); if (nightDone(up)) startNight(up); play(up, 'pass'); ok(tu.L === 3, 'C the 4th pass climbs');
  const pr = newSector('s4', true); startNight(pr); const g3 = []; for (let i = 0; i < 4; i += 1) { g3.push(primerGhost(pr, 'LR')); nextRound(pr); reportPrimer(pr, 'LR'); } ok(JSON.stringify(g3) === '[1,0.5,0,null]' && primerGhost(pr, 'UD') === 1 && pr.tracks[0].L === 2 && pr.nr === 4, 'C mirror primer: ghost 100/50/0 % per axis, then none; never moves L; counts toward the night');
{ // v1.2: clean primers end early; a second axis needs one; the placement jump stops at the level that introduces an unprimed axis
  const q = newSector('s4', true); startNight(q); reportPrimer(q, 'LR', true); ok(primerGhost(q, 'LR') === 0.5, 'C primer: one clean primer is not enough for the first axis');
  reportPrimer(q, 'LR', true); ok(primerGhost(q, 'LR') === null && primerGhost(q, 'UD') === 1, 'C primer: the 2nd clean primer ends the first axis');
  reportPrimer(q, 'UD', true); ok(primerGhost(q, 'UD') === null, 'C primer: for a second axis one clean primer is enough');
  const w = newSector('s4', true); startNight(w); reportPrimer(w, 'LR', false); reportPrimer(w, 'LR', true); ok(primerGhost(w, 'LR') === 0, 'C primer: a struggling child keeps the guided path (an unclean first primer, then a clean 2nd, still has the 3rd)');
  const y = newSector('s4', true); startNight(y); y.primer = { LR: 3 }; y.tracks[0].L = 2; y.tracks[0].placement = true; nextRound(y); report(y, 'pass', { tags: ['LR'] }); ok(y.tracks[0].L === 3, `C placement does not jump over the level that introduces UD while its primers are open (L ${y.tracks[0].L})`);
  const z = newSector('s4', true); startNight(z); z.primer = { LR: 3, UD: 3 }; z.tracks[0].L = 2; nextRound(z); report(z, 'pass', { tags: ['LR'] }); ok(z.tracks[0].L === 5, `C ...once both axes are primed the jump goes on (L ${z.tracks[0].L})`);
}
  const wb = newSector('s1', true); welcomeBack(wb); ok(nextRound(wb).kind === 'easy', 'C welcome back (> 14 days): first round easy');
}
// ---- classify / rewatch / nights / recommend
ok(classify({ slips: 0, rwPre: 1 }).res === 'pass' && classify({ slips: 0, rwPre: 1 }).rw === 1, 'R one look-again before the first tap is part of the task: pass (flag rw)');
ok(classify({ slips: 0, rwPre: 2 }).res === 'neutral' && classify({ slips: 0, rwMid: 1 }).res === 'neutral' && classify({ slips: 0, hint: 1 }).res === 'neutral', 'R a 2nd look / a look after the first tap / a hint = neutral');
ok(classify({ slips: 2, budget: 1 }).res === 'miss' && classify({ slips: 1, budget: 1 }).res === 'pass' && classify({ slips: 1, budget: 0 }).res === 'miss' && classify({ showAnswer: true }).res === 'miss', 'R slip budget per row; 看答案 = miss');
ok(nightValid([{}, {}, {}, {}, { showAnswer: true }, { showAnswer: true }]) && !nightValid([{}, {}, {}, { showAnswer: true }, { showAnswer: true }, { showAnswer: true }]), 'N a night counts only with >= 4 rounds answered without 看答案');
{ const sec = (id, open, last, bs = 0) => ({ id, open, last, badStreak: bs });
  ok(recommend([sec('s1', true, 5), sec('s2', true, 3), sec('s3', false, -1), sec('s4', false, -1)], 6) === 's2', 'N recommend: least recently played open sector');
  ok(recommend([sec('s1', true, 5), sec('s2', true, 3, 1), sec('s3', true, 4), sec('s4', false, -1)], 6) === 's3', 'N recommend: skips a sector whose last night was bad until 3 other nights have passed');
  ok(recommend([sec('s1', true, 5), sec('s2', true, 1, 1), sec('s3', true, 4), sec('s4', false, -1)], 6) === 's2', 'N recommend: ...and offers it again after that');
  ok(recommend([sec('s1', true, 5), sec('s2', true, 1, 2), sec('s3', true, 4)], 6) === 's3' && recommend([sec('s1', true, 5), sec('s2', true, 1, 2), sec('s3', true, 4)], 8) === 's2', 'N recommend: a 2nd bad night in a row waits for 6 other nights');
  ok(recommend([sec('s1', true, 5, 1), sec('s2', true, 3, 1)], 6) === 's2', 'N recommend: everything bad -> least recently played'); }
// ---- G: generation never throws, is deterministic
for (const [s, D] of [['s1', 7], ['s2', 12], ['s3', 15], ['s4', 13]]) { const x = generate(s, D, createRng('seed:1'), makeHistory(64, 6)), y = generate(s, D, createRng('seed:1'), makeHistory(64, 6)); ok(x.key === y.key, `D determinism ${s} D${D}`); }
{ let thrown = 0, fb = 0;
  for (const s of SECTOR_IDS) { const row = { ...TABLE[s][4] }; if (s === 's1') { row.n = 14; row.k = 1; } if (s === 's2') { row.c = 2; row.L = 3; } if (s === 's3') { row.n = 6; row.twins = 0; row.rows = 1; row.cols = 2; } if (s === 's4') { row.n = 12; }
    const hist = makeHistory(64, 6); generateSafe(s, 5, createRng(`inj:${s}:0`), hist); for (let i = 0; i < 20; i += 1) { try { const x = generateSafe(s, 5, createRng(`inj:${s}:${i}`), hist, { row }); if (x.fallback === 3) fb += 1; } catch { thrown += 1; } } }
  ok(thrown === 0 && fb > 0, `G generateSafe: an impossible row never throws (80 injected failures -> ${fb} safe-stimulus fallbacks, ${thrown} exceptions)`);
  let t2 = 0; for (const s of SECTOR_IDS) for (let D = 1; D <= NDIFF; D += 1) { try { const x = generateSafe(s, D, createRng(`all:${s}:${D}`), makeHistory(64, 6)); if (!x.key) t2 += 1; } catch { t2 += 1; } } ok(t2 === 0, 'G generateSafe works for all 60 (sector, D) rows'); }
// ---- P: display floors and table shape
ok(TABLE.s1.every((r) => r.previewMs >= 3000 && r.previewMs >= PREVIEW_MIN_MS), 'P s1 preview >= 3000 ms (floor 2000)');
ok(TABLE.s3.every((r) => r.showMs >= 4500), 'P s3 show >= 4500 ms');
ok(TABLE.s4.every((r) => (r.mode === 'vis' ? r.previewMs === 0 : r.previewMs >= 3000)), 'P s4 peek >= 3000 ms (vis keeps the source half on screen)');
ok(TABLE.s2.every((r) => r.litMs === 700 && r.gapMs === 300), 'P s2 meteor 700 ms + 300 ms per star');
ok(Object.values(TABLE).every((t) => t.length === NDIFF && t.filter((r) => r.gate).map((r) => r.D).join() === '5,10,15'), 'P 15 rows per sector, gates at D5/10/15');
ok(TABLE.s3.every((r) => (r.n === 3 ? r.budget === 0 : r.budget === 1)) && TABLE.s1.every((r) => r.budget === 1), 'P slip budget is row data (s3 n=3 -> 0)');
ok(SECTOR_IDS.every((s) => TABLE[s].every((r) => r.tags && r.budget !== undefined)), 'P every row carries tags and budget');
// ---- data: cards, constellations, wall
const cb = cards.validate(); ok(cb.length === 0, `D cards: 28 + 元老, order, art functions, wall stars (${cb.join('; ') || 'ok'})`);
const kb = cons.validate(); ok(kb.length === 0, `D constellation line art matches the sky within 10 % and the literature separations within 8 % (${kb.join('; ') || 'ok'})`);
{ const ms = (set) => (s, kind, n) => set.has(`${s}.${kind}.${n}`);
  const none = cards.unlocked({ milestone: () => false, nights: 99, veteran: false }); ok(none.length === 8, `D with no milestone only the 8 night cards can unlock (${none.length})`);
  const all = cards.unlocked({ milestone: () => true, nights: 0, veteran: false }); ok(all.length === 4, `D with every milestone but 0 nights only the 4 入门 cards (${all.length})`);
  const full = cards.unlocked({ milestone: () => true, nights: 81, veteran: false }); ok(full.length === 28, 'D 81 nights + every milestone -> all 28');
  const w = cards.waiting({ milestone: () => true, nights: 10, veteran: false }); ok(w.length > 0 && w.every((c) => c.need > 10), 'D cards whose milestone is met but nights are short are "waiting"'); void ms; }
// ---- golden fixtures (the TS port must reproduce these)
if (fs.existsSync(`${GOLDEN}/gen-50seeds.json`)) {
  const g0 = fs.readFileSync(`${GOLDEN}/gen-50seeds.json`, 'utf8'), t0 = fs.readFileSync(`${GOLDEN}/controller-traces.json`, 'utf8');
  ok(g0 === JSON.stringify(genGolden(JSON.parse(g0).window)), 'F golden generator fixtures (4 sectors x 15 D x 50 seeds + 50-round sequences) reproduce');
  ok(t0 === JSON.stringify(traceGolden()), 'F golden controller traces (16 traces x 120 steps) reproduce');
} else ok(false, 'F golden/ fixtures missing: run node golden.mjs --write');
console.log(`selftest failed: ${bad}`); process.exit(bad ? 1 : 0);
