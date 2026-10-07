/**
 * V1 rule scenarios G1–G38 (spec §9.2): one constructed, deterministic World scenario per rule, run against
 * the production sim (src/sim). Fast tier (no statistics). rules.test.ts keeps the heat / edge-case / save
 * checks; this file is the per-rule port the spec lists under V1.
 */
import { describe, expect, it } from 'vitest';
import { World, MASS_CAP, PU_DURATION, type WorldCfg } from '../src/sim/world';
import { PHYS, TICK, radiusOf, bodyLenOf, turnRateOf, angDiff, enclosedBy, createRng, sampleSpacingOf, type Snake } from '../src/sim/core';
import { Brain, TIERS, heatTier } from '../src/sim/brain';
import { MissionRun, MISSION_BY_ID } from '../src/sim/mission';
import { VENUES, RESPAWN, nextHeat, displayName, venueWorldCfg } from '../src/sim/venues';

/* eslint-disable @typescript-eslint/no-explicit-any */
const W = (o: Partial<WorldCfg> = {}) => new World({ R: 2000, foodCount: 0, pu: null, meteors: null, ...o }, 'g');
const add = (w: World, x: number, y: number, a: number, mass: number, opts: Record<string, unknown> = {}) => {
  const s = w.addSnake({ persona: 'forager', ...opts } as any, mass, [x, y, a]); s.protect = 0; return s;
};
const steps = (w: World, n: number) => { for (let i = 0; i < n; i++) w.step(); };
const evs = (w: World, type: string) => w.events.filter((e) => e.type === type) as any[];
const settle = (w: World) => { w.rebuildHash(); w.collide(); };
const circle = (cx: number, cy: number, R: number, from: number, to: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });

describe('V1 rule scenarios G1–G38 (spec §9.2)', () => {
  it('G1 speed: 170; boost ×1.9; lightning ×1.6; both = ×1.9', () => {
    const w = W(), s = add(w, 0, 0, 0, 100);
    expect(s.speed()).toBe(170);
    s.speedPu = 3; expect(s.speed()).toBeCloseTo(170 * 1.6);
    s.boost = true; expect(s.speed()).toBeCloseTo(170 * 1.9);
    s.speedPu = 0; expect(s.speed()).toBeCloseTo(170 * 1.9);
  });

  it('G2 turn rate formula and boost ×0.8', () => {
    expect(turnRateOf(10)).toBeCloseTo(4.4); expect(turnRateOf(1000)).toBeCloseTo(2.8); expect(turnRateOf(100)).toBeCloseTo(3.6);
    for (const boost of [false, true]) {
      const w = W(), s = add(w, 0, 0, 0, 100); s.target = Math.PI / 2; s.wantBoost = boost;
      w.step();
      expect(s.angle).toBeCloseTo(turnRateOf(100) * (boost ? 0.8 : 1) * TICK, 4);   // boost cost is paid before the turn
    }
  });

  it('G3 radius / body length table (§3.3, ±0.1 r, ±0.6 L)', () => {
    for (const [m, r, L] of [[10, 11.8, 161], [20, 13.0, 247], [100, 18.0, 766], [300, 24.6, 1751], [500, 29.1, 2588], [1000, 32.0, 4416], [2000, 32.0, 7553]]) {
      expect(Math.abs(radiusOf(m) - r)).toBeLessThanOrEqual(0.1 + 1e-9); expect(Math.abs(bodyLenOf(m) - L)).toBeLessThanOrEqual(0.6);
    }
  });

  it('G4 wall slide: projected to R − r, heading → tangent, no length lost, one bump per contact', () => {
    const w = W(), s = add(w, 1950, 0, 0, 10);
    steps(w, 60);
    expect(s.alive).toBe(true); expect(s.mass).toBe(10);
    expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(2000 - s.r + 1e-6);
    const radial = Math.atan2(s.y, s.x);
    expect(Math.min(Math.abs(angDiff(s.angle, radial + Math.PI / 2)), Math.abs(angDiff(s.angle, radial - Math.PI / 2)))).toBeLessThan(0.08);
    expect(s.bumps).toBe(1);
  });

  it('G5 rock slide: never inside the rock, alive, no length lost', () => {
    const w = W({ obstacles: [{ x: 200, y: 5, r: 60 }] }), s = add(w, 0, 0, 0, 10);
    for (let i = 0; i < 120; i++) { w.step(); expect(Math.hypot(s.x - 200, s.y - 5)).toBeGreaterThanOrEqual(60 + s.r - 1e-6); }
    expect(s.alive).toBe(true); expect(s.mass).toBe(10); expect(s.bumps).toBeGreaterThanOrEqual(1);
  });

  it('G6 head-on: the shorter is out, tagged headon', () => {
    const w = W(), a = add(w, 0, 0, 0, 100), b = add(w, 25, 0, Math.PI, 50);
    w.step();
    expect(a.alive).toBe(true); expect(b.alive).toBe(false);
    expect(b.cause).toMatchObject({ killer: a.id, tag: 'headon' });
  });

  it('G7 equal length (< 5 % apart): both out, both credited', () => {
    const w = W(), a = add(w, 0, 0, 0, 100), b = add(w, 25, 0, Math.PI, 97);
    w.step();
    expect(a.alive || b.alive).toBe(false);
    expect(a.stats.kills).toBe(1); expect(b.stats.kills).toBe(1);
  });

  it('G8 body hit lenience 2 wu; the neck is solid from the first sample', () => {
    for (const [gap, dies] of [[-1, false], [-3.5, true]] as const) {
      const w = W(), b = add(w, 0, 0, 0, 50), a = add(w, -200, radiusOf(10) + radiusOf(50) + gap, 0, 10);
      w.step();
      expect(a.alive).toBe(!dies); expect(b.alive).toBe(true);
    }
    const w = W(), s = add(w, 0, 0, 0, 50), buf: number[] = []; s.samples(buf);
    expect(buf[2]).toBeCloseTo(sampleSpacingOf(s.r));
  });

  it('G9 simultaneity: A→B and B→C in the same step are both out; B still gets its kill', () => {
    const w = W();
    const c = add(w, 300, 0, 0, 50), b = add(w, 100, 0, Math.PI / 2, 50), a = add(w, 100, -200, Math.PI, 50);
    settle(w);
    expect(a.alive).toBe(false); expect(b.alive).toBe(false); expect(c.alive).toBe(true);
    expect(a.cause!.killer).toBe(b.id); expect(b.cause!.killer).toBe(c.id); expect(b.stats.kills).toBe(1);
  });

  it('G10 spawn protection: passes through both ways; protected head-on is not judged', () => {
    const w = W(), b = add(w, 0, 0, 0, 50), a = add(w, -100, 0, Math.PI / 2, 10); a.protect = 1;
    settle(w); expect(a.alive && b.alive).toBe(true);
    const w2 = W(), p = add(w2, 0, 0, 0, 100), q = add(w2, 20, 0, Math.PI, 50); q.protect = 1;
    settle(w2); expect(p.alive && q.alive).toBe(true);
  });

  it('G11 shield: breaks only when it saves, bounces, 0.5 s grace; head-on breaks only the losing side; equal = both', () => {
    const w = W(); add(w, 0, 0, 0, 50); const a = add(w, -100, 0, Math.PI / 2, 10); a.shield = 5;
    settle(w);
    expect(a.alive).toBe(true); expect(a.shield).toBe(0); expect(a.protect).toBe(PHYS.shieldGrace); expect(evs(w, 'shieldsave')).toHaveLength(1);
    const w2 = W(), big = add(w2, 0, 0, 0, 100), small = add(w2, 25, 0, Math.PI, 50); big.shield = 5; small.shield = 5;
    settle(w2); expect(big.alive && small.alive).toBe(true); expect(big.shield).toBe(5); expect(small.shield).toBe(0);
    const w3 = W(), e1 = add(w3, 0, 0, 0, 100), e2 = add(w3, 25, 0, Math.PI, 98); e1.shield = 5; e2.shield = 5;
    settle(w3); expect(e1.alive && e2.alive).toBe(true); expect(e1.shield + e2.shield).toBe(0);
  });

  it('G12 team mode (kept for v2): team mates pass through', () => {
    const w = W({ team: true }), b = add(w, 0, 0, 0, 50), a = add(w, -100, 0, Math.PI / 2, 10); a.team = 1; b.team = 1;
    settle(w); expect(a.alive).toBe(true);
  });

  it('G13 sleeper: solid, never moves or eats; wakes when he comes close (mission rule)', () => {
    const w = W(), sl = add(w, 0, 0, 0, 50); sl.sleep = true;
    const f = w.addFood(sl.x + 3, sl.y, 1, 'orb');
    steps(w, 30);
    expect([sl.x, sl.y]).toEqual([0, 0]); expect(w.foodList.has(f)).toBe(true);
    const a = add(w, -100, 0, Math.PI / 2, 10); settle(w); expect(a.alive).toBe(false);
    // c2 sleeper levels: wake radius → brain on + 'wake' event
    const run = Object.keys(MISSION_BY_ID).map((id) => new MissionRun(MISSION_BY_ID[id], 7, {})).find((r) => r.w.snakes.some((x) => x.sleep && (x.wakeR ?? 0) > 0))!;
    const s = run.w.snakes.find((x) => x.sleep && (x.wakeR ?? 0) > 0)!;
    run.me.x = s.x + (s.wakeR ?? 0) * 0.5; run.me.y = s.y; run.me.protect = 9;
    run.step();
    expect(s.sleep).toBe(false); expect(evs(run.w, 'wake').length).toBeGreaterThanOrEqual(1);
  });

  it('G14 a snake never hits itself', () => {
    const w = W(), s = add(w, 0, 0, 0, 100);
    s.layPath([[0, 0], [200, 0], [200, 200], [100, 200], [100, -1]]);
    settle(w); expect(s.alive).toBe(true);
  });

  // NOTE: spec G15 also says drops are clamped to R − 40. The prototype (and so the bit-identical port, V1b) does not
  // clamp: drops scatter ±r/2 around body samples that are already inside R − r, so they stay inside the rim and are
  // always reachable by a head sliding along it. Recorded as a spec/prototype drift for the spec owner.
  it('G15 death drop: count clamp(ceil(L/1.6r), 6, 80), total 55 %, 60 s life, reachable at the rim', () => {
    for (const m of [10, 100, 2000]) {
      const w = W(), v = add(w, 0, 0, 0, m), k = add(w, -500, 0, 0, 50), rr = 2000 - radiusOf(m);
      v.layPath(circle(0, 0, rr, 0, Math.min(6, bodyLenOf(m) / rr + 0.05), 200));   // a body sliding along the rim
      w.kill(v, { killer: k, tag: 'body', x: v.x, y: v.y, s: 999 } as any);
      const drops = [...w.foodList].filter((f) => f.kind === 'drop');
      expect(drops.length).toBe(Math.max(6, Math.min(80, Math.ceil(bodyLenOf(m) / (1.6 * radiusOf(m))))));
      expect(drops.reduce((a, f) => a + f.v, 0)).toBeCloseTo(0.55 * m, 6);
      for (const f of drops) { expect(f.die).toBe(w.t + 60); expect(Math.hypot(f.x, f.y)).toBeLessThanOrEqual(2000); }
    }
  });

  it('G16 boost: needs 20, stops below 15, costs max(2.5, 1.8 %·m)/s, drops a trail, release-to-rearm after auto stop', () => {
    const w = W(), s = add(w, 0, 0, 0, 19); s.wantBoost = true; w.step(); expect(s.boost).toBe(false);
    s.mass = 100; w.step(); expect(s.boost).toBe(true); expect(s.mass).toBeCloseTo(100 - 2.5 * TICK, 6);
    steps(w, 40); expect([...w.foodList].some((f) => f.kind === 'trail')).toBe(true);
    s.mass = 15.02; steps(w, 2); expect(s.boost).toBe(false); expect(s.boostLatch).toBe(true);
    s.mass = 40; w.step(); expect(s.boost).toBe(false);          // still held: no restart
    s.wantBoost = false; w.step(); s.wantBoost = true; w.step(); expect(s.boost).toBe(true);
    const big = add(w, 500, 500, 0, 1000); big.wantBoost = true; const m0 = big.mass; w.step(); expect(m0 - big.mass).toBeCloseTo(0.018 * m0 * TICK, 3);
  });

  it('G17 mouth radius r + 10 + 2√v; contention: the nearer head eats, ties → lower id', () => {
    const w = W(), s = add(w, 0, 0, 0, 10), reach = radiusOf(10) + 10 + 2;
    const inn = w.addFood(reach - 0.4, 0, 1, 'orb'), out = w.addFood(0, reach + 0.4, 1, 'orb');
    w.eat(s, TICK); expect(w.foodList.has(inn)).toBe(false); expect(w.foodList.has(out)).toBe(true);
    for (const [ax, bx, winner] of [[-20, 22, 'a'], [-20, 20, 'a']] as const) {
      const w2 = W(), a = add(w2, ax, 300, 0, 10), b = add(w2, bx, 300, Math.PI, 10), f = w2.addFood(0, 300, 1, 'orb');
      w2.eat(b, TICK); w2.eat(a, TICK);
      expect(w2.foodList.has(f)).toBe(false); expect((winner === 'a' ? a : b).stats.eaten).toBe(1); expect(b.stats.eaten).toBe(0);
    }
  });

  it('G18 magnet: pulls energy within 220 at 420 wu/s, never power-ups', () => {
    const w = W(), s = add(w, 0, 0, 0, 10); s.magnet = 5;
    const near = w.addFood(200, 0, 1, 'orb'), far = w.addFood(0, 235, 1, 'orb'); w.pus.push({ x: -150, y: 0, kind: 'shield' });
    w.eat(s, TICK);
    expect(near.x).toBeCloseTo(200 - 420 * TICK, 6); expect(far.y).toBe(235); expect(w.pus[0].x).toBe(-150);
  });

  it('G19 natural energy refills 1–3 s after eaten; drops never refill; venue counts ≤ 2600', () => {
    const w = W({ foodCount: 40 }), s = add(w, 0, 0, 0, 10);
    expect(w.foodList.size).toBe(40);
    const nat = w.addFood(5, 0, 1, 'orb'), drop = w.addFood(-5, 0, 1, 'drop', true, 60); void nat; void drop;
    w.eat(s, TICK);
    expect(w.foodQueue).toHaveLength(1); expect(w.foodQueue[0]).toBeGreaterThanOrEqual(1); expect(w.foodQueue[0]).toBeLessThanOrEqual(3);
    for (const v of Object.values(VENUES)) expect(venueWorldCfg(v).foodCount).toBeLessThanOrEqual(2600);
  });

  it('G20 power-ups: cap, spawn ≥ 80 from bodies, fewest-kind first, refresh delay, no stacking', () => {
    const w = W({ pu: { max: 3, delay: [2, 2] } }); add(w, 0, 0, 0, 300);
    steps(w, 60 * 6);
    expect(w.pus.length).toBe(3);
    expect(new Set(w.pus.map((p) => p.kind)).size).toBe(3);   // fewest-kind first → one of each
    const buf: number[] = []; for (const s of w.snakes) s.samples(buf);
    for (const p of w.pus) for (let i = 0; i < buf.length; i += 3) expect(Math.hypot(buf[i] - p.x, buf[i + 1] - p.y)).toBeGreaterThanOrEqual(80 - 1e-6);
    const s = w.snakes[0]; s.shield = 3; const p = w.pus.find((q) => q.kind === 'shield')!;
    s.x = p.x; s.y = p.y; w.eat(s, TICK);
    expect(s.shield).toBe(PU_DURATION.shield); expect(w.puQueue).toContain(w.t + 2);
  });

  it('G21 meteor candy: bounces off the rim, lives 25 s', () => {
    const w = W(); w.meteors.push({ x: 1979, y: 0, vx: 120, vy: 0, die: 25 });
    w.updateItems(TICK);
    expect(w.meteors[0].vx).toBeLessThan(0); expect(Math.hypot(w.meteors[0].x, w.meteors[0].y)).toBeLessThanOrEqual(2000 - 20);
    w.t = 25; w.updateItems(TICK); expect(w.meteors).toHaveLength(0);
  });

  it('G22 respawn: 3 s for him and AI alike, keeps the rule mass; his spawn point is clear', () => {
    expect(RESPAWN.timed.delay).toBe(3);
    const w = W({ foodCount: 200 }), k = add(w, 0, 0, 0, 300);
    const v = add(w, 600, 0, 0, 200, { respawn: RESPAWN.timed, isPlayer: true }); v.respawn = RESPAWN.timed;
    w.kill(v, { killer: k, tag: 'body', x: v.x, y: v.y, s: 999 } as any);
    expect(w.respawnQueue[0].t).toBeCloseTo(w.t + 3);
    steps(w, 3 * 60 + 2);
    expect(v.alive).toBe(true); expect(v.mass).toBe(w.respawnQueue.length ? -1 : Math.max(RESPAWN.timed.min ?? PHYS.startMass, (RESPAWN.timed.keep ?? 0) * 200));
    const buf: number[] = []; k.samples(buf);
    for (let i = 0; i < buf.length; i += 3) expect(Math.hypot(buf[i] - v.x, buf[i + 1] - v.y)).toBeGreaterThanOrEqual(160 - 3 * 170 * TICK);
  });

  it('G23 kill tags: headon > encircle > cut (≤ 6r from the head) > body; encircle constructs', () => {
    const w = W(), ring = add(w, 0, 0, 0, 300);
    ring.layPath(circle(0, 0, 220, 0, Math.PI * 2 + 0.3, 80));
    expect(enclosedBy(ring, 0, 0)).toBe(true);                // inside the closed ring
    expect(enclosedBy(ring, 600, 0)).toBe(false);             // outside
    const cshape = add(w, 900, 900, 0, 300); cshape.layPath(circle(900, 900, 220, 0, Math.PI * 1.2, 60));
    expect(enclosedBy(cshape, 900, 900)).toBe(false);         // C shape, open
    const tiny = add(w, -900, -900, 0, 10); tiny.layPath(circle(-900, -900, 6.4, 0, Math.PI * 2, 8));
    expect(enclosedBy(tiny, -900, -900)).toBe(false);         // < 10 samples
    const k = add(w, 1500, -1500, 0, 100);
    for (const [sAlong, tag] of [[5 * k.r, 'cut'], [7 * k.r, 'body']] as const) {
      const v = add(w, 1200, -1200, 0, 20); w.kill(v, { killer: k, tag: 'body', x: v.x, y: v.y, s: sAlong } as any); expect(v.cause!.tag).toBe(tag);
    }
    const inside = add(w, 0, 0, 0, 20); w.kill(inside, { killer: ring, tag: 'body', x: 0, y: 0, s: 1 } as any); expect(inside.cause!.tag).toBe('encircle');
    const ho = add(w, 0, 10, 0, 20); w.kill(ho, { killer: ring, tag: 'headon', x: 0, y: 0 } as any); expect(ho.cause!.tag).toBe('headon');
  });

  it('G24 combo window 8 s, kills per life, a new life resets the streak', () => {
    const w = W(), k = add(w, 0, 0, 0, 100);
    const kill = (t: number) => { w.t = t; const v = add(w, 500 + t * 10, 500, 0, 10); w.kill(v, { killer: k, tag: 'body', x: v.x, y: v.y, s: 999 } as any); };
    kill(10); expect(k.stats.multi).toBe(1); kill(15); expect(k.stats.multi).toBe(2); kill(23); expect(k.stats.multi).toBe(3); kill(31.5); expect(k.stats.multi).toBe(1);
    expect(k.stats.lifeKills).toBe(4); expect(k.stats.bestMulti).toBe(3);
    k.spawn(0, 0, 0, 10, w.t); expect(k.stats.lifeKills).toBe(0); expect(k.stats.multi).toBe(0);
  });

  it('G25 near miss: arms under 10 wu clearance, fires past 30, 1.5 s cooldown', () => {
    const w = W(), b = add(w, 0, 0, 0, 50), a = add(w, -200, 0, 0, 10), touch = radiusOf(10) + radiusOf(50);
    const at = (clear: number) => { a.y = touch + clear; settle(w); };
    at(8); expect(a.nearArm).toBe(true); at(40); expect(evs(w, 'nearmiss').filter((e) => e.id === a.id)).toHaveLength(1);
    w.t += 1; at(8); at(40); expect(evs(w, 'nearmiss').filter((e) => e.id === a.id)).toHaveLength(1);
    w.t += 1; at(8); at(40); expect(evs(w, 'nearmiss').filter((e) => e.id === a.id)).toHaveLength(2);
    expect(b.alive && a.alive).toBe(true);
  });

  it('G26 ranking: mass (pending respawn mass while out), then kills, then peak', () => {
    const w = W(), a = add(w, 0, 0, 0, 50), b = add(w, 500, 0, 0, 50), c = add(w, -500, 0, 0, 90);
    b.stats.kills = 2; c.alive = false; w.respawnQueue.push({ s: c, t: 99, mass: 70 });
    expect(w.ranking().map((r) => r.s)).toEqual([c, b, a]);
  });

  it('G27 the final step settles outs before ranking', () => {
    const w = W(), a = add(w, 0, 0, 0, 100), b = add(w, 25, 0, Math.PI, 99.9 * 0.9);
    w.step();
    const r = w.ranking(); expect(b.alive).toBe(false); expect(r[r.length - 1].s).toBe(b); expect(r[r.length - 1].score).toBe(0); expect(r[0].s).toBe(a);
  });

  it('G28 heat: window ±1, clears after a change, lerp (lapse never)', () => {
    expect(nextHeat(0, [2, 1, 2]).heat).toBe(1); expect(nextHeat(0, [4, 5, 6]).heat).toBe(-1); expect(nextHeat(0, [1, 4, 2])).toEqual({ heat: 0, recent: [1, 4, 2] });
    expect(heatTier('T3', 1).lapse).toBe(TIERS.T3.lapse);
  });

  it('G29 objectives and stars: rings in order; stars live (clear / pu / bumps by contact)', () => {
    const run = new MissionRun(MISSION_BY_ID.c1m1, 3, {}); const pts = MISSION_BY_ID.c1m1.objective.points!;
    run.me.protect = 99;
    for (const p of pts) { run.me.x = p[0]; run.me.y = p[1]; run.step(); }
    expect(run.outcome?.ok).toBe(true);
    const r2 = new MissionRun(MISSION_BY_ID.c1m4, 3, {}); const me = r2.me;
    me.stats.puKinds = { magnet: 1 };
    expect(r2.starLive({ type: 'puGE', kind: 'magnet', n: 1 })).toBe(true); expect(r2.starLive({ type: 'puGE', kind: 'shield', n: 1 })).toBe(false);
    me.bumps = 2; expect(r2.starLive({ type: 'bumpsLE', n: 2 })).toBe(true); expect(r2.starLive({ type: 'bumpsLE', n: 1 })).toBe(false);
  });

  it('G30 mass cap 9999, path buffer, name truncation', () => {
    const w = W(), s = add(w, 0, 0, 0, MASS_CAP - 1); w.addFood(3, 0, 5, 'big');
    w.eat(s, TICK); expect(s.mass).toBe(MASS_CAP);
    expect(8192 * PHYS.pathStep).toBeGreaterThan(bodyLenOf(MASS_CAP));
    expect(displayName('一二三四五六七')).toBe('一二三四五…');
  });

  it('G31 tags: a head-on win over a target does not count, the target comes back, headon note', () => {
    const run = new MissionRun(MISSION_BY_ID.c3m1, 5, {}); const w = run.w, me = run.me;
    const tgt = w.snakes.find((s) => s.target_)!; const notes: string[] = []; run.onNote = (n) => notes.push(n.kind);
    const orig = w.step.bind(w);
    w.step = () => { orig(); w.kill(tgt, { killer: me, tag: 'headon', x: tgt.x, y: tgt.y } as any); w.step = orig; };
    run.step();
    expect(notes).toContain('headonTarget'); expect(run.progress().cur).toBe(0);
    expect(w.respawnQueue.some((q) => q.s === tgt)).toBe(true);
  });

  it('G32 king crown: only his body breaks a gem; 1 s bounce; last gem = out', () => {
    const w = W(), me = add(w, 0, 0, 0, 100, { isPlayer: true }); add(w, 0, 600, 0, 100);
    const k = add(w, -200, 0, Math.PI / 2, 300); k.crown = 3; k.crownMax = 3; k.king = true;
    k.x = -200 + 0; k.y = 600; settle(w);                                       // his head on the AI body
    expect(k.alive).toBe(true); expect(k.crown).toBe(3); expect(k.protect).toBe(1);
    k.protect = 0; k.x = -100; k.y = 0; settle(w);                              // on HIS body
    expect(k.crown).toBe(2); expect(evs(w, 'gem').at(-1)).toMatchObject({ by: me.id, left: 2 });
    k.crown = 1; k.protect = 0; settle(w); expect(k.alive).toBe(false); expect(me.stats.kills).toBe(1);
  });

  it('G33 king charge: no boost during the 0.8 s wind-up, no turning for 1.6 s, aim = where he swims straight', () => {
    const w = W(); w.kingCharge = { first: 0, wind: 0.8, run: 1.6, cd: [10, 13], cd3: [6, 8], aim: 'straight' };
    const me = add(w, 300, 0, Math.PI / 2, 50, { isPlayer: true });
    const k = add(w, 0, -400, 0, 300); k.brain = new Brain({ tier: 'T2', persona: 'king', rng: createRng('k') });
    const lead = 0.8 * me.speed(), aim = Math.atan2(me.y + lead - k.y, me.x - k.x);
    w.step();
    expect(evs(w, 'king-windup')).toHaveLength(1);
    const A = k.target; expect(A).toBeCloseTo(aim, 6);
    for (let i = 0; i < 46; i++) { w.step(); expect(k.boost).toBe(false); }
    steps(w, 2); expect(evs(w, 'king-charge')).toHaveLength(1);
    for (let i = 0; i < 90; i++) { w.step(); expect(k.target).toBe(A); expect(k.boost).toBe(true); }
  });

  it('G34 c5m1: with no qualifying snake for 8 s a bigger one swims in (≤ 3, ≥ minRatio × his mass)', () => {
    const run = new MissionRun(MISSION_BY_ID.c5m1, 11, {}); const r = MISSION_BY_ID.c5m1.objective.minRatio!;
    const spawns: { t: number; mass: number; me: number }[] = [];
    run.onNote = (n) => { if (n.kind === 'bigSwimIn') { const s = run.w.byId.get(n.id!)!; spawns.push({ t: run.w.t, mass: s.mass, me: run.me.mass }); } };
    for (const s of run.w.snakes) if (!s.isPlayer && !s.king) { s.alive = false; s.respawn = null; }   // nobody qualifies
    run.me.protect = 1e9;
    for (let i = 0; i < 60 * 60 && !run.done; i++) run.step();
    expect(spawns.length).toBeGreaterThanOrEqual(1); expect(spawns.length).toBeLessThanOrEqual(3);
    expect(spawns[0].t).toBeGreaterThanOrEqual(7.5);   // 16 half-second checks without a qualifying snake
    for (const s of spawns) expect(s.mass).toBeGreaterThanOrEqual(Math.min(2000, r * s.me));
  });

  it('G35 AI reads isPlayer (persona "kid"/"player") as a hunter-like head', () => {
    const decideWith = (isPlayer: boolean) => {
      const w = W(), s = add(w, 0, 0, 0, 40); const b = new Brain({ tier: 'T3', persona: 'skittish', rng: createRng('s') }); s.brain = b;
      add(w, 160, 0, Math.PI, 80, { isPlayer, persona: isPlayer ? 'kid' : 'forager' });
      b.decide(s, w); return { mode: b.mode, target: s.target };
    };
    const a = decideWith(true), b = decideWith(false);
    expect(a.mode !== b.mode || Math.abs(angDiff(a.target, b.target)) > 1e-6).toBe(true);
  });

  it('G36 at most 6 full AI decisions per step, start index rotating (every AI decides)', () => {
    const w = W({ foodCount: 300 });
    const ai = Array.from({ length: 20 }, (_, i) => { const s = add(w, Math.cos(i) * 800, Math.sin(i) * 800, i, 30); s.brain = new Brain({ tier: 'T2', persona: 'forager', rng: createRng(`d${i}`) }); return s; });
    for (let i = 0; i < 300; i++) { w.step(); expect(w.decisionsThisStep).toBeLessThanOrEqual(6); }
    for (const s of ai) expect((s.brain as Brain).trace.decisions).toBeGreaterThan(0);
  });

  it('G37 anti-orbit: a goal inside the turning circle → straight on after 1 s (not on orbit-ok levels)', () => {
    for (const orbitOk of [false, true]) {
      const w = W(), s = add(w, 0, 0, 0, 10); const b = new Brain({ tier: 'T3', persona: 'forager', rng: createRng('o') }); s.brain = b;
      const G = [s.x, s.y + 25];
      b.goalHook = () => ({ mode: 'goal', G, orbitOk });
      steps(w, 60 * 4);
      expect((b.unsticks ?? 0) > 0).toBe(!orbitOk);
    }
  });

  it('G38 player models perceive only the portrait viewport rectangle', () => {
    const w = W(), s = add(w, 0, 0, 0, 10); const b = new Brain({ tier: 'KID', persona: 'kid', rng: createRng('v') });
    const v = b.view(s)!; expect(v).not.toBeNull();
    expect(Brain.inView(v, v.cx + v.hw - 1, v.cy)).toBe(true); expect(Brain.inView(v, v.cx + v.hw + 1, v.cy)).toBe(false);
    expect(Brain.inView(v, v.cx, v.cy + v.hh + 1)).toBe(false);
    expect(new Brain({ tier: 'T2', persona: 'forager', rng: createRng('a') }).view(s)).toBeNull();   // AI tiers see the circle
  });
});

// keep the Snake type import used for editors
export type _S = Snake;
