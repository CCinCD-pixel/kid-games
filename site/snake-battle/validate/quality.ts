/**
 * Full-tier validators ported from the prototype (spec §9.2) onto the real sim + content (GAME_AUTHORING §8):
 *   V2-offscreen  run-offscreen.mjs   share of his deaths whose lethal thing was off his portrait screen 0.8 s before
 *   V2h + V17     run-heat.mjs + heat-chain.mjs (the closed loop uses the production `nextHeat`)
 *   V5 + V7       spawn-perf.mjs      spawn fairness in warm arenas; on-screen render load in 黑洞场
 *   V6            run-endless.mjs, but on the production 无尽 setup (`setupEndless`) with a player-model brain
 *   V8 + V9       ai-quality.mjs      AIs do not single him out; AI deaths are fights, not blind crashes
 *   V3-baseline   run-missions.mjs --nohook (report only: what the per-level `hook` contributes)
 * The production sim is bit-identical to the prototype (V1b), so the prototype's numbers are the expectation;
 * seeds differ where noted. Each function returns gate rows `[ok, text]` + raw numbers for the report.
 */
import { World } from '../src/sim/world';
import { Brain } from '../src/sim/brain';
import { createRng, viewScaleOf, type Snake } from '../src/sim/core';
import { VENUES, venueWorldCfg, setupTimed, setupEndless, runVenueMatch, nextHeat, MATCH_SEC, type VenueId } from '../src/sim/venues';
import { wilson, P } from './bots';

export type Gate = [boolean, string];
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---- V2-offscreen (review B3): was the lethal point inside his PORTRAIT viewport 0.8 s (48 steps) before? -------
export function offscreenMatch(v: VenueId, tier: string, persona: string, seed: number) {
  const { world: w, me } = setupTimed(VENUES[v], seed, { playerTier: tier, playerPersona: persona, playerBrain: true });
  const HIST = 48, ticks = Math.round(MATCH_SEC * 60);
  const viewQ: ([number, number, number, number] | null)[] = [], headQ: ([number, number] | null)[][] = [];
  let off = 0, seen = 0;
  for (let i = 0; i < ticks; i++) {
    const vs = viewScaleOf(me.mass), z = 1.25 / vs;
    viewQ.push(me.alive ? [me.x + Math.cos(me.angle) * 60 * vs, me.y + Math.sin(me.angle) * 60 * vs, 405 / z, 540 / z] : null);
    headQ.push(w.snakes.map((s) => (s.alive ? [s.x, s.y] as [number, number] : null)));
    if (viewQ.length > HIST + 1) { viewQ.shift(); headQ.shift(); }
    const was = me.alive;
    w.step();
    if (was && !me.alive && me.cause && viewQ.length > HIST && viewQ[0]) {
      // a body segment laid ≥0.8 s ago is judged where it lies; a head-on, or a segment laid in the last 0.8 s,
      // by where the killer's HEAD was 0.8 s ago
      const v0 = viewQ[0], c = me.cause; let px = c.x, py = c.y;
      if (c.tag === 'headon' || (c.s ?? 1e9) < 0.8 * 170 * 1.9) { const k = w.byId.get(c.killer); const ki = k ? w.snakes.indexOf(k) : -1; const hp = ki >= 0 ? headQ[0][ki] : null; if (hp) [px, py] = hp; }
      seen++;
      if (Math.abs(px - v0[0]) > v0[2] || Math.abs(py - v0[1]) > v0[3]) off++;
    }
  }
  return { off, seen };
}
export function v2offscreen(venues: VenueId[], N: number) {
  const gates: Gate[] = []; const raw: Record<string, { off: number; deaths: number }> = {};
  for (const v of venues) {
    for (const [b, persona] of [['NOVICE', 'novice'], ['KID', 'kid']]) {
      let off = 0, seen = 0;
      for (let k = 0; k < N; k++) { const r = offscreenMatch(v, b, persona, 23000 + k); off += r.off; seen += r.seen; }
      raw[`${v}/${b}`] = { off: off / Math.max(1, seen), deaths: seen };
    }
    const K = raw[`${v}/KID`], No = raw[`${v}/NOVICE`];
    gates.push([K.off <= 0.10, `V2 ${v} deaths whose lethal thing was off his portrait screen 0.8 s before: KID ${P(K.off)} of ${K.deaths} ≤ 10% (NOVICE ${P(No.off)} of ${No.deaths})`]);
  }
  return { gates, raw };
}

// ---- V2h + V17 (spec §3.17): outcomes at every heat level, then the real heat rule replayed in a closed loop ----
const V17_BAND: Record<string, [number, number]> = { 'moon/KID': [0.35, 0.75], 'mars/KID': [0.35, 0.75], 'jupiter/KID': [0.35, 0.75], 'moon/NOVICE': [0.30, 0.75], 'mars/NOVICE': [0.30, 0.75] };
export function heatSuite(v: VenueId, N0: number, Nh: number, SEQ = 4000) {
  const gates: Gate[] = []; const summary: Record<string, unknown> = {};
  for (const [b, persona] of [['NOVICE', 'novice'], ['KID', 'kid']]) {
    const pool: Record<number, number[]> = {};
    for (const h of [-2, -1, 0, 1, 2]) {
      pool[h] = [];   // h = 0 replays V2's seeds (20000+); other levels the prototype's N = 60 on their own seeds
      for (let i = 0; i < (h === 0 ? N0 : Nh); i++) pool[h].push(runVenueMatch(VENUES[v], b, persona, (h === 0 ? 20000 : 22000 + 1000 * (h + 2)) + i, { heat: h }).rank);
    }
    const r = [-2, -1, 0, 1, 2].map((h) => { const k = pool[h].filter((x) => x <= 3).length; return { h, p: k / pool[h].length, ci: wilson(k, pool[h].length) }; });
    const rises = r.some((x, i) => r.slice(i + 1).some((y) => y.ci[0] > x.ci[1]));
    gates.push([!rises, `V2h ${v} ${b} top3 at h −2…+2: ${r.map((x) => P(x.p)).join(' / ')}${rises ? ' — rises with heat' : ''}`]);
    if (b === 'NOVICE' && (v === 'moon' || v === 'mars')) gates.push([r[0].ci[1] >= 0.30, `V2h ${v} NOVICE top3 at h = −2 ${P(r[0].p)} [${P(r[0].ci[0])}–${P(r[0].ci[1])}] ≥ 30% (the rescue works)`]);
    // V17: 30 consecutive timed matches × SEQ with the production rule (window 3; ≤2 ×3 → +1, >3 ×3 → −1)
    const rng = createRng(`heat:${v}:${b}`); const blocks = [0, 0, 0, 0, 0]; let late = 0, lateN = 0; const hEnd: Record<number, number> = { [-2]: 0, [-1]: 0, 0: 0, 1: 0, 2: 0 };
    for (let s = 0; s < SEQ; s++) {
      let st = { heat: 0, recent: [] as number[] };
      for (let k = 0; k < 30; k++) {
        const rank = rng.pick(pool[st.heat]); const top3 = rank <= 3 ? 1 : 0;
        blocks[Math.floor(k / 6)] += top3; if (k >= 9) { late += top3; lateN++; }
        st = nextHeat(st.heat, [...st.recent, rank]);
      }
      hEnd[st.heat]++;
    }
    const steady = late / lateN, band = V17_BAND[`${v}/${b}`];
    gates.push([band ? steady >= band[0] && steady <= band[1] : true, `V17 ${v} ${b} closed-loop steady top3 (matches 10–30) ${P(steady)}${band ? ` in ${P(band[0])}–${P(band[1])}` : ' (reported, no floor — §3.17)'} (matches 1–6 ${P(blocks[0] / (SEQ * 6))})`]);
    summary[b] = { atH: r.map((x) => x.p), steady, blocks: blocks.map((x) => x / (SEQ * 6)), hAt30: Object.fromEntries(Object.entries(hEnd).map(([h, n]) => [h, n / SEQ])) };
  }
  return { gates, summary };
}

// ---- V5 spawn fairness (600 spawns in warm 木星 / 黑洞 arenas) + V7 on-screen render load in 黑洞场 -------------
export function v5spawn(mode: 'idle' | 'kid') {
  let d1 = 0, d3 = 0, n = 0, clearMin = Infinity;
  for (const vid of ['jupiter', 'blackhole'] as VenueId[]) for (let seed = 1; seed <= 10; seed++) {
    const v = VENUES[vid]; const w = new World(venueWorldCfg(v), 9000 + seed); const rng = createRng(`sp${seed}`);
    let i = 0;
    for (const [p, c] of Object.entries(v.ai)) for (let k = 0; k < c; k++) { const s = w.addSnake({ persona: p, tier: v.tier, respawn: { delay: 3, keep: 0.25, min: 10 } }, 20); s.brain = new Brain({ tier: v.tier, persona: p, rng: rng.fork('a' + i++) }); }
    for (let t = 0; t < 60 * 60; t++) w.step();   // warm the arena up for 60 s
    for (let trial = 0; trial < 30; trial++) {
      for (let t = 0; t < 120; t++) w.step();     // 2 s between trials
      const snap = w.snakes.length; w.rebuildHash();
      const me = w.addSnake({ persona: 'kid', tier: 'KID', isPlayer: true, respawn: null }, 20);
      let minB = Infinity; w.hash.query(me.x, me.y, 400, (h) => { minB = Math.min(minB, Math.hypot(w.hash.x[h] - me.x, w.hash.y[h] - me.y)); });
      clearMin = Math.min(clearMin, minB);
      if (mode === 'kid') me.brain = new Brain({ tier: 'KID', persona: 'kid', rng: rng.fork('me' + trial) });
      let deadAt: number | null = null;
      for (let t = 0; t < 180 && me.alive; t++) { if (mode === 'idle') me.target = me.angle; w.step(); if (!me.alive) deadAt = w.t - me.spawnT; }
      if (deadAt !== null) { if (deadAt < 1) d1++; if (deadAt < 3) d3++; }
      n++;
      me.alive = false; w.snakes.splice(snap); w.byId.delete(me.id); w.rebuildHash();
    }
  }
  const lim = mode === 'idle' ? 5 : 1, d3p = (100 * d3) / n;
  return [d1 === 0 && d3p <= lim && clearMin >= 150, `V5 ${mode}: ${n} spawns · died <1 s ${d1}, <3 s ${d3p.toFixed(1)}% ≤ ${lim}%, min body clearance ${clearMin.toFixed(0)} ≥ 150 wu`] as Gate;
}
export function v7load() {
  const loads: { circles: number; food: number }[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    runVenueMatch(VENUES.blackhole, 'KID', 'kid', 7000 + seed, { probe: (w, me) => {
      if (!me.alive) return;
      const scale = viewScaleOf(me.mass);
      for (const [vw, vh] of [[810, 1080], [1080, 810]]) {
        const hw = (vw * scale) / 2 + 40, hh = (vh * scale) / 2 + 40; let circles = 0, food = 0; const buf: number[] = [];
        for (const s of w.snakes) {
          if (!s.alive) continue; buf.length = 0; s.samples(buf); let on = 0;
          for (let i = 0; i < buf.length; i += 3) if (Math.abs(buf[i] - me.x) < hw && Math.abs(buf[i + 1] - me.y) < hh) on++;
          if (on) circles += Math.ceil(on * (0.6 / 0.45)) + 1;   // render spacing 0.45 r vs collision 0.6 r
        }
        w.food.query(me.x, me.y, Math.max(hw, hh), (f) => { if (Math.abs(f.x - me.x) < hw && Math.abs(f.y - me.y) < hh) food++; });
        loads.push({ circles, food });
      }
    } });
  }
  const c95 = q(loads.map((l) => l.circles), 0.95), f95 = q(loads.map((l) => l.food), 0.95);
  return [c95 <= 1500 && f95 <= 600, `V7 blackhole on-screen body circles p95 ${c95} ≤ 1500, food p95 ${f95} ≤ 600 (${loads.length} samples, LOD tier 0 budget)`] as Gate;
}

// ---- V6 无尽 on the production setup: life length, natural end, maglev (length 800) reachable ----------------
export function endlessRun(v: VenueId, tier: string, persona: string, seed: number, capMin = 12) {
  const { world: w, me } = setupEndless(VENUES[v], seed);
  me.brain = new Brain({ tier, persona, rng: createRng(`endless-bot:${seed}`) });
  const cap = capMin * 3600; let i = 0;
  for (; i < cap && me.alive; i++) w.step();
  return { life: i / 60, peak: me.stats.peak, alive: me.alive };
}
export function v6endless(N: number) {
  const gates: Gate[] = []; const res: Record<string, { p50: number; alive: number; peak90: number }> = {};
  for (const v of ['moon', 'mars', 'jupiter', 'blackhole'] as VenueId[]) for (const [b, persona] of [['NOVICE', 'novice'], ['KID', 'kid'], ['EXPERT', 'expert']]) {
    const rs = Array.from({ length: N }, (_, k) => endlessRun(v, b, persona, 300 + k));
    res[`${v}/${b}`] = { p50: Math.round(q(rs.map((r) => r.life), 0.5)), alive: rs.filter((r) => r.alive).length / N, peak90: Math.round(q(rs.map((r) => r.peak), 0.9)) };
  }
  gates.push([res['moon/NOVICE'].p50 >= 40, `V6 moon NOVICE endless life p50 ${res['moon/NOVICE'].p50} s ≥ 40 s`]);
  gates.push([res['mars/KID'].p50 >= 90, `V6 mars KID endless life p50 ${res['mars/KID'].p50} s ≥ 90 s`]);
  const maxAlive = Math.max(...Object.values(res).map((x) => x.alive));
  gates.push([maxAlive <= 0.5, `V6 endless always ends naturally: alive at 12 min ≤ 50% for every bot/venue (max ${P(maxAlive)})`]);
  const p90 = Math.max(res['moon/KID'].peak90, res['mars/KID'].peak90);
  gates.push([p90 >= 800, `V6 maglev skin (endless length 800) reachable: KID peak p90 on moon/mars ${p90} ≥ 800`]);
  return { gates, res };
}

// ---- V8 (AIs do not single him out) + V9 (AI deaths are fights, not blind crashes) -----------------------------
export function v8v9(M = 6) {
  const gates: Gate[] = []; const lim: Record<string, number> = { T1: 20, T2: 15, T3: 10, T4: 10 };
  for (const v of ['moon', 'mars', 'jupiter', 'blackhole'] as VenueId[]) {
    const ven = VENUES[v]; let deaths = 0, blind = 0, hunts = 0, onPlayer = 0, elig = 0, eligP = 0;
    for (let seed = 1; seed <= M; seed++) {
      const w = new World(venueWorldCfg(ven), 4000 + seed); const rng = createRng(`aq${seed}`);
      const respawn = { delay: 3, keep: 0.25, min: 10 }; let i = 0;
      for (const [p, c] of Object.entries(ven.ai)) for (let k = 0; k < c; k++) { const s = w.addSnake({ persona: p, tier: ven.tier, respawn }, 20); s.brain = new Brain({ tier: ven.tier, persona: p, rng: rng.fork('a' + i++) }); }
      w.rebuildHash();
      const me = w.addSnake({ persona: 'kid', tier: 'KID', isPlayer: true, respawn }, 20); me.brain = new Brain({ tier: 'KID', persona: 'kid', rng: rng.fork('me') });
      for (const s of w.snakes) if (!s.isPlayer) {
        const b = s.brain as Brain; const orig = b.decide.bind(b);
        b.decide = (ss: Snake, ww: World) => {
          orig(ss, ww); (b as unknown as { lastBestT: number }).lastBestT = ww.t;
          if (b.mode === 'hunt' && b.victim) {
            hunts++; if (b.victim.isPlayer) onPlayer++;
            for (const o of ww.snakes) if (o !== ss && o.alive && Math.hypot(o.x - ss.x, o.y - ss.y) < 520) { elig++; if (o.isPlayer) eligP++; }
          }
        };
      }
      for (let t = 0; t < 180 * 60; t++) {
        const n0 = w.events.length; w.step();
        for (const e of w.events.slice(n0)) if (e.type === 'kill') {
          const ev = e as unknown as { victim: number; killer: number; tag: string };
          const vs = w.byId.get(ev.victim); if (!vs || vs.isPlayer) continue; deaths++;
          const k = w.byId.get(ev.killer); const kd = k ? Math.hypot(k.x - vs.x, k.y - vs.y) : 0;
          // blind = the last decision (≤0.35 s ago) believed the path safe AND the killer's head was not near
          const vb = vs.brain as (Brain & { lastBestT?: number }) | null;
          if (vb && vb.lastBest > -100 && w.t - (vb.lastBestT ?? -99) <= 0.35 && kd > 200 && ev.tag === 'body') blind++;
        }
      }
    }
    const bp = Math.round((100 * blind) / Math.max(1, deaths)), focus = hunts ? (onPlayer / hunts) / Math.max(1e-9, eligP / Math.max(1, elig)) : 0;
    gates.push([bp <= lim[ven.tier], `V9 ${v} (${ven.tier}) blind AI deaths ${bp}% of ${deaths} ≤ ${lim[ven.tier]}%`]);
    if (hunts > 0) gates.push([focus <= 1.3, `V8 ${v} player focus ratio ${focus.toFixed(2)} ≤ 1.30 (1.00 = no preference; ${hunts} hunt decisions)`]);
  }
  return gates;
}
