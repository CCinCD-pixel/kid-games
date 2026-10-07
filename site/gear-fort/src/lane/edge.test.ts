// @ts-nocheck — V2 (spec §9.1): §3.21 boundary cases, one minimal scenario each (kernel-level ones here; the three
// presentation-level cases — pause snapshot vs checkpoint order, speed choice during the auto 1× fallback, slow-mo vs
// pause — are tested in src/screens/timing.test.ts against the same helpers battle.ts uses).
import { describe, it, expect } from 'vitest';
import { createSim, step, act, addUnit, spawnEnemy, canPlace, occupant, snapshot, resume, restore, hash, gust, runToEnd } from './sim';
import { T, FACE, ASSIST } from './rules';
import { UNITS, ENEMIES } from './tables';
import { LEVELS, ORDER } from '../content';

const lv = (o = {}) => ({ id: 't', lanes: [1, 1, 1, 1, 1], start: 5000, loadout: Object.keys(UNITS), sky: false, spawns: [], noEnd: true, ...o });
const run = (S, n, acts = null) => { for (let i = 0; i < n; i++) step(S, i === 0 ? acts : null); return S; };
const P = (card, lane, col) => ({ t: 'place', card, lane, col });

describe('V2 §3.21 boundary cases', () => {
  it('1 two placements on one cell in one tick: first wins, second is occupied', () => {
    const S = createSim(lv(), 1); S.cdReady = {};
    expect(act(S, P('shooter', 2, 1))).toBe(true);
    expect(canPlace(S, 'wall', 2, 1)).toBe('occupied');
    expect(act(S, P('wall', 2, 1))).toBe(false);
    expect(occupant(S, 2, 1).k).toBe('shooter');
  });
  it('2 placed and bitten in the same tick: the unit is on the cell before machines act', () => {
    const mk = (place) => { const S = createSim(lv(), 1); S.cdReady = {}; const e = spawnEnemy(S, 'walker', 2, 3 * T + FACE + 1); step(S, place ? [P('wall', 2, 3)] : null); return { S, e }; };
    const a = mk(true), b = mk(false);
    expect(a.e.x).toBe(3 * T + FACE);           // blocked at the face this very tick
    expect(b.e.x).toBeLessThan(3 * T + FACE);    // control: without the wall it walks on
  });
  it('3 one bolt hits only the first machine; the 机关令 bolt pierces but never hits one machine twice', () => {
    const S = createSim(lv(), 1); const a = spawnEnemy(S, 'walker', 2, 40000); const b = spawnEnemy(S, 'walker', 2, 40000); addUnit(S, 'shooter', 2, 0);
    let n = 0; while (a.hp === a.max && b.hp === b.max && n++ < 200) step(S);
    expect((a.hp < a.max ? 1 : 0) + (b.hp < b.max ? 1 : 0)).toBe(1);
    const S2 = createSim(lv(), 1); const c = spawnEnemy(S2, 'walker', 2, 40000); const d = spawnEnemy(S2, 'walker', 2, 40000); addUnit(S2, 'shooter', 2, 0);
    S2.tokens = 1; expect(act(S2, { t: 'token', lane: 2, col: 0 })).toBe(true);
    n = 0; while ((c.hp === c.max || d.hp === d.max) && n++ < 200) step(S2);
    expect(c.max - c.hp).toBe(UNITS.shooter.dmg); expect(d.max - d.hp).toBe(UNITS.shooter.dmg);
  });
  it('4 a stone whose target died lands as a waste (counted), hurting nobody', () => {
    const S = createSim(lv(), 1); const e = spawnEnemy(S, 'walker', 2, 50000); addUnit(S, 'lobber', 2, 0);
    let n = 0; while (!S.lobs.length && n++ < 200) step(S);
    expect(S.lobs.length).toBe(1);
    e.hp = 0; const w0 = S.stats.wasted; const other = spawnEnemy(S, 'walker', 4, 50000);
    run(S, 80);
    expect(S.stats.wasted).toBe(w0 + 1); expect(other.hp).toBe(other.max);
  });
  it('5 a fire pot splash on a Boss: body damage only, the Boss never burns', () => {
    const L = { ...LEVELS['1-11'], spawns: LEVELS['1-11'].spawns.filter((x) => String(x[2]).startsWith('boss:')), noEnd: true, start: 5000 };
    const S = createSim(L, 1); let n = 0; while (!S.enemies.some((e) => e.boss) && n++ < 4000) step(S);
    const boss = S.enemies.find((e) => e.boss); expect(boss).toBeTruthy();
    const w = spawnEnemy(S, 'walker', boss.lane, boss.x); addUnit(S, 'burner', boss.lane, 0);
    let hit = false; n = 0; while (!hit && n++ < 400) { step(S); hit = w.burnUntil > 0 || w.hp < w.max; }
    expect(hit).toBe(true); expect(boss.burnUntil || 0).toBe(0);
  });
  it('6 a 木鹊 whose 禾田 is shovelled looks for a new target', () => {
    const S = createSim(lv(), 1); addUnit(S, 'farm', 2, 4); addUnit(S, 'farm', 1, 2); const f = spawnEnemy(S, 'flyer', 2, 60000);
    let n = 0; while (!f.perchId && n++ < 1500) step(S);
    expect(f.perchId).toBeTruthy();
    step(S, [{ t: 'shovel', lane: 2, col: 4 }]);
    expect(f.perchId).toBe(0);
    const x0 = f.x; const l0 = f.lane; run(S, 40);
    expect(f.x !== x0 || f.lane !== l0 || f.perchId).toBeTruthy();
  });
  it('7 a 云梯车 whose blocker is removed while raising stops raising and walks on', () => {
    const S = createSim(lv(), 1); addUnit(S, 'wall', 2, 3); const e = spawnEnemy(S, 'ladder', 2, 3 * T + FACE + 200);
    let n = 0; while (e.lad !== 1 && n++ < 100) step(S);
    expect(e.lad).toBe(1);
    step(S, [{ t: 'shovel', lane: 2, col: 3 }]); const x0 = e.x; run(S, 60);
    expect(e.lad).not.toBe(2); expect(e.x).toBeLessThan(x0);
  });
  it('8 铁蒺藜 worn out during its 机关令 stays; the next wear after it ends breaks it', () => {
    const S = createSim(lv(), 1); const h = addUnit(S, 'spikes', 2, 3);
    h.wear = UNITS.spikes.wear - 1; S.tokens = 1; expect(act(S, { t: 'token', lane: 2, col: 3 })).toBe(true);
    spawnEnemy(S, 'brute', 2, 4 * T + 2000); run(S, 200);
    expect(h.wear).toBeGreaterThanOrEqual(UNITS.spikes.wear); expect(h.dead).toBeFalsy();
    S.enemies.forEach((e) => (e.hp = 0)); while (S.tick < h.ultUntil) step(S);
    spawnEnemy(S, 'brute', 2, 4 * T + 2000); run(S, 400);
    expect(h.dead).toBeTruthy();
  });
  it('9 a breach rolls the lane log (crushing the lane), a second breach in that lane loses', () => {
    const S = createSim(lv({ noEnd: false, spawns: [[2000, 0, 'walker', 0]] }), 1, { events: true });
    const a = spawnEnemy(S, 'walker', 2, 300); const b = spawnEnemy(S, 'walker', 2, 6000); const c = spawnEnemy(S, 'walker', 3, 300);
    run(S, 30);
    expect(S.logs[2]).toBe(1); expect(S.logs[3]).toBe(1); expect(b.hp).toBe(0); expect(S.result).toBeFalsy();
    spawnEnemy(S, 'walker', 2, 300); run(S, 30);
    expect(S.result).toBe('lose'); expect(S.stats.lostLane).toBe(2); void a; void c;
  });
  it('10 敲鼓 fails without side effects when a machine is within columns 0–4', () => {
    const S = createSim(lv({ drumOk: true, flags: [2000], spawns: [[1990, 1, 'walker', 0]] }), 1); spawnEnemy(S, 'walker', 2, 2 * T);
    const h0 = hash(S); expect(act(S, { t: 'drum' })).toBe(false); expect(hash(S)).toBe(h0);
  });
  it('11 a 机关令 on a unit pinned by a 云梯 is allowed', () => {
    const S = createSim(lv(), 1); const u = addUnit(S, 'shooter', 2, 1); const e = spawnEnemy(S, 'ladder', 2, 50000);
    u.pin = e.id; e.pins = [u.id]; e.pinId = u.id; S.tokens = 1;
    expect(act(S, { t: 'token', lane: 2, col: 1 })).toBe(true); expect(u.ultUntil).toBeGreaterThan(S.tick);
  });
  it('12 the last machine dies and the level is decided in the same tick', () => {
    const S = createSim(lv({ noEnd: false, spawns: [[0, 2, 'walker', 0]] }), 1); addUnit(S, 'shooter', 2, 0); addUnit(S, 'shooter', 2, 1);
    let n = 0; while (!S.result && n++ < 3000) { step(S); const e = S.enemies[0]; if (e && e.hp <= 0) { expect(S.result).toBe('win'); break; } }
    expect(S.result).toBe('win');
  });
  it('13 bolts and stones in flight are in the snapshot and carry on after resume', () => {
    const S = createSim(lv({ noEnd: false, spawns: [[0, 2, 'walker', 0], [0, 3, 'shielder', 0]] }), 7); addUnit(S, 'shooter', 2, 0); addUnit(S, 'lobber', 3, 0);
    let n = 0; while (!(S.bolts.length && S.lobs.length) && n++ < 400) step(S);
    expect(S.bolts.length && S.lobs.length).toBeTruthy();
    const R = resume(snapshot(S), S.L); expect(R.bolts.length).toBe(S.bolts.length); expect(R.lobs.length).toBe(S.lobs.length);
    run(S, 300); run(R, 300); expect(hash(R)).toBe(hash(S));
  });
  it('14 assist chosen at a checkpoint adds only the first tier grain; Boss toughness does not change mid-battle', () => {
    const L = { ...LEVELS['1-11'], spawns: LEVELS['1-11'].spawns.filter((x) => String(x[2]).startsWith('boss:')) }; const S = createSim(L, 1); let n = 0; while (!S.enemies.some((e) => e.boss) && n++ < 4000) step(S);
    const snap = snapshot(S); const R = restore(snap, L, { assist: 2 });
    expect(R.grain).toBe(snap.grain + ASSIST.startGrain);
    const b0 = S.enemies.find((e) => e.boss), b1 = R.enemies.find((e) => e.boss); expect(b1.max).toBe(b0.max); expect(b1.hp).toBe(b0.hp);
  });
  it('15 shovel refund: same tick place+shovel refunds all; after acting nothing comes back', () => {
    const S = createSim(lv({ start: 500 }), 1); step(S, [P('shooter', 2, 1), { t: 'shovel', lane: 2, col: 1 }]); expect(S.grain).toBe(500);
    const S2 = createSim(lv({ start: 500 }), 1); spawnEnemy(S2, 'walker', 2, 50000); step(S2, [P('shooter', 2, 1)]);
    let n = 0; while (!S2.bolts.length && n++ < 59) step(S2); expect(S2.bolts.length).toBeGreaterThan(0);
    step(S2, [{ t: 'shovel', lane: 2, col: 1 }]); expect(S2.grain).toBe(500 - UNITS.shooter.cost);
  });
  it('17 a snapshot whose hash does not match is refused', () => {
    const S = createSim(lv(), 1); run(S, 50); const snap = snapshot(S); expect(resume(snap, S.L)).toBeTruthy();
    expect(resume({ ...snap, grain: snap.grain + 1 }, S.L)).toBeNull();
  });
  it('18 钩拒 hooks a 云梯车 before a closer 木甲兵', () => {
    const S = createSim(lv(), 1); const u = addUnit(S, 'hook', 2, 1);
    const w = spawnEnemy(S, 'walker', 2, 2 * T + 2000); const l = spawnEnemy(S, 'ladder', 2, 2 * T + 6000); l.lad = 1; l.ladT = 1e9;
    let n = 0; while (!u.acted && n++ < 200) step(S);
    expect(u.acted).toBeTruthy(); expect(S.stats.laddersHooked).toBe(1); expect(l.lad).toBe(3); expect(w.x).toBeLessThanOrEqual(2 * T + 2000);
  });
  it('19 风箱 grounds every 木鹊 in its lane: perched ones and ones flying in front, 6 s', () => {
    const S = createSim(lv(), 1); const g = addUnit(S, 'gust', 2, 1); addUnit(S, 'farm', 2, 0);
    const a = spawnEnemy(S, 'flyer', 2, 600); a.perchId = 999; const b = spawnEnemy(S, 'flyer', 2, 50000); const c = spawnEnemy(S, 'flyer', 3, 50000);
    gust(S, g, false);
    expect(a.downUntil).toBe(S.tick + UNITS.gust.down); expect(b.downUntil).toBe(S.tick + UNITS.gust.down); expect(a.perchId).toBe(0);
    expect(c.downUntil).toBe(0); expect(UNITS.gust.down).toBe(120);
  });
  it('15b two 鼓车 following each other never deadlock', () => {
    const S = createSim(lv(), 1); const a = spawnEnemy(S, 'drummer', 2, 60000); const b = spawnEnemy(S, 'drummer', 2, 60000 + ENEMIES.drummer.follow);
    const a0 = a.x, b0 = b.x; run(S, 300); expect(a.x).toBeLessThan(a0); expect(b.x).toBeLessThan(b0);
  });
  it('18b termination: every v1 level ends within 12 minutes of game time with no defence at all', () => {
    for (const id of ORDER.filter((x) => x.startsWith('1-'))) { const S = runToEnd(createSim(LEVELS[id], 1), null, 12 * 60 * 20); expect(S.result, id).toBeTruthy(); }
  });
});
