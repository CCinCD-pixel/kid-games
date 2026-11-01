// @ts-nocheck
// GENERATED from tools/memory-matrix/proto/controller.mjs by tools/memory-matrix/sync-core.mjs - do not edit; change the oracle and re-run the script.
// The adaptive controller (spec §4): a 4-up / 1-down transformed staircase (Levitt 1971; steady state 84.1 % first-try, Wilson et al. 2019 optimum ~85 %) with a placement ramp, star-gates (sequential test),
// one-off easy rounds, a scaffolded round after 3 misses, soft first rounds after a rule switch, and a gate park/back-off so no child can be
// stuck in an unwinnable loop. NO time input anywhere: only the first-attempt result of each round (pass | miss | neutral).
// SINGLE SOURCE OF TRUTH for: result classification (classify), gate eligibility + stop rule (nextRound/gateStep), wing choice (startNight).
//   pass    = cleared within the slip budget, at most ONE look-again before the first tap (the 2-look task), no hint
//   neutral = cleared, but a 2nd look / a look-again after the first tap / a hint was used (staircase neither climbs nor falls)
//   miss    = slip budget exceeded, or "看答案"
import { TRACKS, START_L, PLACEMENT, TABLE } from './params';

export const CFG = { up: 4, gateRounds: 5, gatePass: 4, gateMissMax: 2, atGMin: 2, tagMin: 3, ramp: 3, parkBase: 30, openAtL: 4, masteredEvery: 4, nightRounds: 6, nightSoftMisses: 2, nightSoftDrop: 1, easyAt: 2, scaffoldAt: 3, hardDrop: 2, nightMinAnswered: 4 };

const newTrack = (c, start) => ({ len: c.len, offset: c.offset, gates: c.gates, cleared: 0, L: start, s: 0, m: 0, rounds: 0, regular: 0, placement: true, ramp: 0, maxL: start, atG: 0, gateFails: 0, park: 0, parkCount: 0, cp: {} });
export function newSector(sector, open = false) {
  return { sector, open, rounds: 0, nights: 0, nr: 0, nightMiss: 0, cur: 0, swaps: 0, queue: [], pending: null, gate: null, softPending: false,
    tracks: TRACKS[sector].map((c, i) => newTrack(c, i === 0 ? START_L[sector] : 1)) };
}
export const trackOpen = (st, i) => i === 0 || st.tracks[0].cleared >= 1;           // wing 2 opens when wing 1's first gate (rel 5) is cleared
export const mastered = (t) => t.cleared >= t.gates.length && t.L >= t.len;
export const cap = (t) => (t.cleared < t.gates.length ? t.gates[t.cleared] : t.len);
export const absLevel = (t, rel) => t.offset + rel;
export const nightDone = (st) => st.nr >= CFG.nightRounds;
/** A night counts for the atlas only if >= 4 of its 6 rounds ended without 看答案 (no click-farming). */
export const nightValid = (rounds) => rounds.filter((r) => !r.showAnswer).length >= CFG.nightMinAnswered;

/** The ONE place that turns raw events into a controller result. */
export function classify({ slips = 0, budget = 1, rwPre = 0, rwMid = 0, hint = 0, showAnswer = false }) {
  if (showAnswer || slips > budget) return { res: 'miss', rw: rwPre > 0 ? 1 : 0 };
  if (hint > 0 || rwMid > 0 || rwPre > 1) return { res: 'neutral', rw: 1 };
  return { res: 'pass', rw: rwPre === 1 ? 1 : 0 };
}

/** Call once at the start of every night (6 rounds). Picks the wing (a wing is a RULE; it never changes inside a night). */
export function startNight(st) {
  st.nights += 1; st.nr = 0; st.nightMiss = 0;
  const prev = st.cur;
  if (st.tracks.length === 2 && trackOpen(st, 1)) {
    st.swaps += 1; const other = 1 - st.cur;
    if (!mastered(st.tracks[other]) || st.swaps % CFG.masteredEvery === 0) st.cur = other;     // a fully mastered wing only comes back every 4th switch
  }
  st.softPending = st.nights > 1 && st.cur !== prev;                                              // first round after a rule switch is soft
  return st;
}
/** Back after > 14 days: the first round is one easy round. */
export const welcomeBack = (st) => { st.queue.unshift('easy'); };

const gateTags = (st, t, G) => TABLE[st.sector][t.offset + G - 1].tags;
export function gateEligible(st, t = st.tracks[st.cur]) {
  const G = t.gates[t.cleared];
  if (G === undefined || t.L < G || t.atG < CFG.atGMin || t.park > 0) return false;
  return gateTags(st, t, G).every((g) => (t.cp[g] || 0) >= CFG.tagMin);
}

/** What the child sees next. kind: gate | round | easy | scaffold | demo. A gate is offered between two rounds as soon as the child is eligible
 *  (v1.2: not only at the start of a night, so a strong child meets his first gate in night 1) unless this night already went badly (2 misses = the
 *  night is in 'easy' mode); it is its own event (it does not use up the night's 6 rounds). */
export function nextRound(st) {
  const t = st.tracks[st.cur];
  if (st.gate) { const g = st.gate; return { kind: 'gate', track: st.cur, G: g.G, i: g.i, D: g.levels[g.i] }; }
  if (st.queue.length === 0 && st.nightMiss < CFG.nightSoftMisses && gateEligible(st, t)) {
    const G = t.gates[t.cleared];
    st.gate = { G, i: 0, passes: 0, misses: 0, levels: [G - 1, G, G - 1, G, G].map((r) => absLevel(t, r)) };
    return { kind: 'gate', track: st.cur, G, i: 0, D: st.gate.levels[0] };
  }
  const q = st.queue.shift();
  let kind = 'round', rl = t.L;
  if (q === 'demo') { kind = 'demo'; rl = Math.max(1, t.L - 1); }
  else if (q === 'scaffold') kind = 'scaffold';
  else if (q === 'easy') { kind = 'easy'; rl = Math.max(1, t.L - 1); }
  else if (st.nightMiss >= CFG.nightSoftMisses) { kind = 'easy'; rl = Math.max(1, t.L - CFG.nightSoftDrop); }
  const soft = kind === 'round' && st.softPending; st.softPending = false;
  st.pending = { kind, track: st.cur, rel: rl, D: absLevel(t, rl), soft };
  return { ...st.pending };
}

/** Feed the FIRST-ATTEMPT result of a non-gate round. info.tags = concept tags of the stimulus. Returns events for the UI. */
export function report(st, res, info = {}) {
  const t = st.tracks[st.cur], p = st.pending || { kind: 'round', rel: t.L, soft: false }, ev = [];
  st.rounds += 1; t.rounds += 1; st.nr += 1; st.pending = null;
  if (p.kind === 'demo') return ['demoDone'];                                      // a demonstration is never a measurement
  t.regular += 1; if (t.park > 0) t.park -= 1;
  if (p.kind === 'round' && p.rel === cap(t) && t.cleared < t.gates.length && res === 'pass') t.atG += 1;      // v1.2: rounds PASSED at the gate level (a child who keeps missing there is not walked into a doomed gate)
  const softMiss = p.soft && res === 'miss';
  if (softMiss) { ev.push('softMiss'); res = 'neutral'; }                          // a rule slip right after a switch is not a memory miss: L and stars stay (it still feeds the support ladder)
  else if (res === 'pass' && p.kind === 'round') for (const g of info.tags || []) t.cp[g] = (t.cp[g] || 0) + 1;
  const support = p.kind === 'easy' || p.kind === 'scaffold';
  const missSupport = (hard) => {                                                    // shared by real misses and soft misses
    t.m += 1; st.nightMiss += 1;
    if (t.m === CFG.easyAt) st.queue.push('easy');
    if (p.kind === 'scaffold') t.m = CFG.scaffoldAt;                                 // even the scaffolded round was missed: drop again, demonstrate again
    if (t.m >= CFG.scaffoldAt) { st.queue = ['demo', 'scaffold']; ev.push('offerBreak'); t.m = 0; return true; }   // worked example, then a round with the first answer lit for free
    return false;
  };
  if (res === 'pass') {
    t.m = 0;
    if (support) return ev;                                                        // a supportive round never counts toward climbing
    t.s += 1;
    const idx = t.regular - 1, step = t.placement && idx < PLACEMENT.length ? PLACEMENT[idx] : 1;
    if (t.placement) { const to = Math.min(cap(t), primerStop(st, t, t.L + step)); if (to > t.L) ev.push('levelUp'); t.L = to; t.s = 0; if (t.regular >= PLACEMENT.length) t.placement = false; }
    else if (t.ramp > 0) { t.ramp -= 1; const to = Math.min(cap(t), t.L + 1); if (to > t.L) ev.push('levelUp'); t.L = to; t.s = 0; }   // the first passes after a gate climb one rung each (the gate already proved this level)
    else if (t.s >= CFG.up) { const to = Math.min(cap(t), t.L + 1); if (to > t.L) ev.push('levelUp'); t.L = to; t.s = 0; }
  } else if (res === 'miss') {
    t.placement = false; t.ramp = 0; t.s = 0;
    const hard = missSupport();
    const drop = hard ? CFG.hardDrop : 1;                                           // 3rd miss in a row: drop 2
    if (t.L > 1) { t.L = Math.max(1, t.L - drop); ev.push('levelDown'); }
  } else if (softMiss) { missSupport(); }                                            // neutral by rule, but counted for support
  else { t.m = 0; }                                                                // neutral: cleared with help; nothing moves
  t.maxL = Math.max(t.maxL, t.L);
  return ev;
}

/** One gate round done. Sequential test: stop as soon as 4 rounds are cleared first-try or the 2nd round is missed (so a gate can never hand a
 *  child more than 2 misses). A look-again before the first tap is allowed (same task as every round); hints / mid-recall looks are not offered. */
export function gateStep(st, res) {
  const g = st.gate, t = st.tracks[st.cur], ev = [];
  g.i += 1; if (res === 'pass') g.passes += 1; else g.misses += 1;
  let verdict = 'continue';
  if (g.passes >= CFG.gatePass) verdict = 'passed';
  else if (g.misses >= CFG.gateMissMax || g.i >= CFG.gateRounds) verdict = 'failed';
  if (verdict === 'continue') return { verdict, ev, next: { kind: 'gate', D: g.levels[g.i], i: g.i } };
  st.gate = null; t.placement = false; st.pending = null;
  if (verdict === 'passed') { t.cleared += 1; t.m = 0; t.s = 0; t.atG = 0; t.gateFails = 0; t.parkCount = 0; ev.push('gateCleared'); const up = Math.min(cap(t), g.G + 1); if (up > t.L) t.L = up; t.ramp = t.L < cap(t) ? CFG.ramp : 0; }   // v1.2: the gate proved levels up to G, so the child goes on at G+1 (no 4 more rounds at G)
  else {
    t.L = Math.max(1, g.G - 1); t.s = 0; t.ramp = 0; t.atG = 0; t.gateFails += 1; ev.push('gateRetry'); st.queue.push('demo');   // remedial demonstration first
    if (t.gateFails >= 2) { t.park = CFG.parkBase * 2 ** t.parkCount; t.parkCount += 1; t.gateFails = 0; ev.push('gatePark'); }   // back off: 30, 60, 120 ... regular rounds
  }
  t.maxL = Math.max(t.maxL, t.L);
  return { verdict, ev, next: null };
}
/** The big 开始夜航 button: the open sector played least recently. A sector whose last night was bad (>= 3 misses in 6) is skipped until 3 other nights have
 *  been played; after a 2nd bad night in a row until 6, after a 3rd until 12 (cap 24), so a child who cannot do one rule is not walked back into it every
 *  other night. badStreak >= 3 raises a note on the parent page. secs = [{ id, open, last (night clock of its last night, -1 = never), badStreak }],
 *  now = clock of the night about to start. The sector nodes stay tappable: the child can always choose. */
export function recommend(secs, now) {
  const open = secs.filter((s) => s.open), calm = open.filter((s) => !(s.badStreak > 0 && now - s.last <= Math.min(24, 3 * 2 ** (s.badStreak - 1))));
  return (calm.length ? calm : open).slice().sort((a, b) => a.last - b.last || secs.indexOf(a) - secs.indexOf(b))[0].id;
}
/** s4 only (spec 3.5): the first 3 rounds of each mirror axis are PRIMER rounds: the child traces a ghost shadow (100 %, 50 %, 0 %). They are not measurements:
 *  they never move L, never count as a pass for a gate tag, but they do count toward the night's 6 rounds. The page calls primerGhost() after generating the
 *  stimulus (the axis is only known then) and reportPrimer() instead of report(). */
export const PRIMER = [1, 0.5, 0];
export const primerGhost = (st, axis) => { const n = (st.primer && st.primer[axis]) || 0; return n < PRIMER.length ? PRIMER[n] : null; };
/** v1.2 (QA r1): a child who traces the shadow cleanly (0 slips, no look / hint) does not have to do all 3 primers: the 2nd clean one (ghost <= 50 %) ends the
 *  guidance for that axis, and for a SECOND axis the first clean one is enough (the idea is the same, only the glass turned). A struggling child keeps the full 3. */
export function reportPrimer(st, axis, clean = false) {
  st.primer = st.primer || {}; const k = (st.primer[axis] || 0) + 1;
  const otherDone = Object.entries(st.primer).some(([a, v]) => a !== axis && v >= PRIMER.length);
  if (!clean) (st.primerDirty = st.primerDirty || {})[axis] = true;                          // one slip / look / hint in this axis' primers: the full guided path stays
  st.primer[axis] = clean && !(st.primerDirty && st.primerDirty[axis]) && (k >= 2 || otherDone) ? PRIMER.length : k;
  st.rounds += 1; st.nr += 1; st.tracks[st.cur].rounds += 1; st.pending = null; return ['primerDone'];
}
/** The placement jump never skips over the level where a mirror axis is introduced while its primers are still open: the child lands ON that level, plays
 *  the guided rounds there, and only then goes further (so night 1 is not 5 guided rounds out of 6). */
export function primerStop(st, t, to) {
  if (st.sector !== 's4') return to;
  for (let rel = t.L + 1; rel <= to; rel += 1) {
    const row = TABLE.s4[absLevel(t, rel) - 1];
    if (row && row.axes.some((a) => ((st.primer && st.primer[a]) || 0) < PRIMER.length)) return rel;
  }
  return to;
}
export const rankOf = (st) => Math.max(...st.tracks.map((t) => t.offset + t.maxL));
export const clearedGates = (st) => st.tracks.reduce((a, t) => a + t.cleared, 0);
