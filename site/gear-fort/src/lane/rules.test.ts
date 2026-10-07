// @ts-nocheck — V1 (spec §9.1): the prototype's 80 mechanic assertions (proto/tests/mechanics*.mjs), ported verbatim
// against the TS kernel. Bodies are copied unchanged; only the imports and the ok() sink differ. Regenerate with the
// snippet in site/gear-fort/tools/README.md if the prototype tests change.
import { describe, it, expect } from 'vitest';
import { createSim, step, addUnit, spawnEnemy, hash, snapshot, restore, resume, canPlace, isNight } from './sim';
import { T, SPAWN_X, FACE } from './rules';
import { UNITS, ENEMIES } from './tables';
import { CFG } from './boss';
void [hash, snapshot, restore, resume, canPlace, isNight, T, SPAWN_X, FACE, UNITS, ENEMIES, CFG];

function mechanics() {
// Table-driven mechanic tests (port to site/gear-fort/src/lane/__tests__/rules.test.ts).

let pass = 0, fail = 0; const FAILS = []; const ok = (c, n, i = '') => { if (c) pass++; else { fail++; FAILS.push(`${n} ${i}`); } };

const lv = (o = {}) => ({ id: 't', lanes: [1, 1, 1, 1, 1], start: 5000, loadout: Object.keys(UNITS), sky: false, spawns: [], noEnd: true, ...o });
const run = (S, n, acts) => { for (let i = 0; i < n; i++) step(S, i === 0 ? acts : null); return S; };

// 1 armor subtracts from every pierce hit (min 1); light ignores it; metal ignores fire
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'brute', 2, 50000); addUnit(S, 'shooter', 2, 0); run(S, 40);
  ok(e.max - e.hp === 8, 'armor: bolt 18 - 10 = 8', e.max - e.hp); }
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'brute', 2, 30000); addUnit(S, 'burner', 2, 0); run(S, 60);
  ok(e.hp === e.max && e.dings > 0, 'metal immune to fire'); }
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'walker', 2, 30000); addUnit(S, 'burner', 2, 0); run(S, 50);
  ok(e.max - e.hp >= 36, 'wood x1.5 fire + burn', e.max - e.hp); }
// 2 shield takes bolts first, lobs go over it, fire burns a wooden shield x2
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'shielder', 2, 60000); addUnit(S, 'shooter', 2, 0); run(S, 80);
  ok(e.hp === e.max && e.sh < 360, 'shield absorbs bolts'); }
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'shielder', 2, 60000); addUnit(S, 'lobber', 2, 0); run(S, 40);
  ok(e.hp === e.max - 50 && e.sh === 360, 'lob bypasses shield', `${e.hp} ${e.sh}`); }
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'shielder', 2, 40000); addUnit(S, 'burner', 2, 0); run(S, 40);
  ok(e.sh === 360 - 48, 'fire x2 on wooden shield', e.sh); }
// 3 ram: full run-up impact, then recoil; spikes in front cancel the run-up
{ const S = createSim(lv(), 1, { events: true }); spawnEnemy(S, 'ram', 2, 60000); const w = addUnit(S, 'wall', 2, 1); run(S, 600);
  const imp = S.ev.filter((x) => x.type === 'impact'); ok(imp.length >= 2 && imp[0].dmg === 900 && imp[1].dmg < 900, 'ram first impact 900 then weaker', imp.map((x) => x.dmg).join(',')); }
{ const S = createSim(lv(), 1, { events: true }); spawnEnemy(S, 'ram', 2, 60000); addUnit(S, 'wall', 2, 1); addUnit(S, 'spikes', 2, 2); run(S, 900);
  const imp = S.ev.filter((x) => x.type === 'impact'); ok(imp.length >= 1 && imp.every((x) => x.dmg <= 160), 'spikes in front: impact stays <= 160', imp.map((x) => x.dmg).join(',')); }
// 4 pit captures medium, traps heavy for 5 s
{ const S = createSim(lv(), 1); addUnit(S, 'pit', 2, 3); const e = spawnEnemy(S, 'walker', 2, 50000); run(S, 400);
  ok(S.stats.captured === 1 && !S.enemies.includes(e), 'pit captures walker'); }
{ const S = createSim(lv(), 1, { events: true }); addUnit(S, 'pit', 2, 3); spawnEnemy(S, 'brute', 2, 45000); run(S, 400);
  ok(S.ev.some((x) => x.type === 'stuck') && S.stats.captured === 0, 'pit traps heavy'); }
// 5 ladder pins the unit behind the first blocker; hook drops the ladder
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'ladder', 2, 40000); const w = addUnit(S, 'wall', 2, 2); const s = addUnit(S, 'shooter', 2, 1); run(S, 300);
  ok(s.pin === e.id && e.lad === 2, 'ladder pins shooter behind wall'); }
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'ladder', 2, 40000); addUnit(S, 'wall', 2, 2); const s = addUnit(S, 'shooter', 2, 1); run(S, 200); addUnit(S, 'hook', 2, 0);
  // hook at col 0 cannot reach (reach 1.6 tiles from its centre) -> put a hook right behind the wall instead
  const S2 = createSim(lv(), 1); const e2 = spawnEnemy(S2, 'ladder', 2, 40000); addUnit(S2, 'wall', 2, 2); const s2 = addUnit(S2, 'shooter', 2, 0); const hk = addUnit(S2, 'hook', 2, 1); run(S2, 400);
  ok(e2.lad === 3 && !s2.pin, 'hook drops ladder', `lad ${e2.lad}`); }
// 6 tunneler: unheard it digs at the wall and breaches; a listener makes it surface at its column
{ const S = createSim(lv(), 1, { events: true }); spawnEnemy(S, 'tunneler', 2, 50000); addUnit(S, 'wall', 2, 3); run(S, 700);
  ok(S.logs[2] === 1, 'tunneler passes under walls and breaches'); }
{ const S = createSim(lv(), 1, { events: true }); const e = spawnEnemy(S, 'tunneler', 2, 70000); addUnit(S, 'listener', 2, 5); run(S, 200);
  ok(e.layer === 'ground' && e.x <= 5 * T + FACE, 'listener forces surface'); }
// 7 flyer perches on the front-most econ unit and stops its production; gust knocks it down
{ const S = createSim(lv(), 1); const f = addUnit(S, 'farm', 2, 0); const f2 = addUnit(S, 'farm', 2, 3); const e = spawnEnemy(S, 'flyer', 2, 60000); run(S, 200);
  ok(e.perchId === f2.id, 'flyer perches on front-most farm'); }
{ const S = createSim(lv(), 1); addUnit(S, 'farm', 2, 0); addUnit(S, 'gust', 2, 1); const e = spawnEnemy(S, 'flyer', 2, 60000); run(S, 60);
  ok(e.downUntil > 0, 'gust grounds flyer'); }
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'flyer', 2, 60000); addUnit(S, 'shooter', 2, 0); run(S, 100);
  ok(e.hp === e.max, 'bolts do not hit flyers'); }
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'flyer', 2, 40000); addUnit(S, 'radial', 2, 2); run(S, 40);
  ok(e.hp < e.max, 'radial hits flyers'); }
// 8 smoke: shooter in a cloud cannot fire; gust clears the lane
{ const S = createSim(lv(), 1); const sh = addUnit(S, 'shooter', 2, 1); S.smoke[2][1] = 1000; const e = spawnEnemy(S, 'walker', 2, 50000); run(S, 100);
  ok(e.hp === e.max, 'shooter in smoke is blind'); }
{ const S = createSim(lv(), 1); addUnit(S, 'gust', 2, 0); S.smoke[2][3] = 1000; run(S, 50); ok(S.smoke[2][3] === 0, 'gust clears smoke'); }
// 9 drummer aura x1.4 speed
{ const S = createSim(lv(), 1); const a = spawnEnemy(S, 'walker', 2, 60000); const d = spawnEnemy(S, 'drummer', 2, 70000); const b = spawnEnemy(S, 'walker', 4, 60000); run(S, 20);
  ok(60000 - a.x === Math.floor(20 * 100 * 160 / 100), 'drummer aura x1.6', 60000 - a.x); ok(60000 - b.x === 2000, 'no aura 2 lanes away'); }
// 10 boat hooks a raft stack away after 4 s; hook pushes boats 3 tiles
{ const S = createSim(lv({ water: [0, 0, 1, 0, 0] }), 1); addUnit(S, 'raft', 2, 3); addUnit(S, 'shooter', 2, 3); const b = spawnEnemy(S, 'boat', 2, 50000); run(S, 300);
  ok(S.grid[2][3] === 0 || S.units.every((u) => u.lane !== 2), 'boat drags the raft away'); }
// 11 carrier releases 3 walkers
{ const S = createSim(lv(), 1); const c = spawnEnemy(S, 'carrier', 2, 30000); c.hp = 1; addUnit(S, 'lobber', 2, 0); run(S, 40);
  ok(S.enemies.filter((e) => e.k === 'walker').length === 3, 'carrier releases 3 walkers'); }
// 12 tower summons a walker every 10 s while on the board
{ const S = createSim(lv(), 1); spawnEnemy(S, 'tower', 2, 70000); run(S, 430); ok(S.enemies.filter((e) => e.k === 'walker').length === 2, 'tower summons', S.enemies.length); }
// 13 strike 3x3 hits air and ground, not under
{ const S = createSim(lv(), 1); const a = spawnEnemy(S, 'walker', 1, 40000); const b = spawnEnemy(S, 'flyer', 3, 42000); const c = spawnEnemy(S, 'tunneler', 2, 41000); S.cdReady = {}; step(S, [{ t: 'place', card: 'strike', lane: 2, col: 4 }]); run(S, 14);
  ok(a.hp <= 0 || !S.enemies.includes(a), 'strike ground'); ok(!S.enemies.includes(b), 'strike air'); ok(S.enemies.includes(c) && c.hp === c.max, 'strike misses under'); }
// 14 log clears the lane once, second breach loses
{ const S = createSim(lv(), 1); spawnEnemy(S, 'walker', 2, 1000); spawnEnemy(S, 'walker', 2, 30000); run(S, 15); ok(S.logs[2] === 1 && S.enemies.length === 0, 'log sweeps lane');
  spawnEnemy(S, 'walker', 2, 500); run(S, 10); ok(S.result === 'lose', 'second breach loses'); }
// 15 beam ramps on the same target, off at night
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'brute', 2, 40000); addUnit(S, 'beam', 2, 0); run(S, 101); ok(e.max - e.hp === 5 + 5 + 10 + 10 + 15 + 15 + 20 + 20 + 25 + 25 + 25 - 0 || e.max - e.hp > 150, 'beam ramp ignores armor', e.max - e.hp); }
{ const S = createSim(lv({ env: { night: true } }), 1); const e = spawnEnemy(S, 'walker', 2, 40000); addUnit(S, 'beam', 2, 0); run(S, 60); ok(e.hp === e.max, 'beam off at night'); }
// 16 farm day 20 / night 10; bank builds then pays 50
{ const S = createSim(lv(), 1); addUnit(S, 'farm', 2, 0); run(S, 190); ok(S.drops.length === 1 && S.drops[0].v === 20, 'farm first drop at 9 s'); }
{ const S = createSim(lv({ env: { night: true } }), 1); addUnit(S, 'bank', 2, 0); run(S, 530); ok(S.drops.length === 1 && S.drops[0].v === 50, 'bank pays 50 after 10+16 s'); }
// 17 gust + burner = wider fire (火借风势)
{ const S = createSim(lv(), 1); const a = spawnEnemy(S, 'walker', 2, 50000); const b = spawnEnemy(S, 'walker', 2, 61000); addUnit(S, 'burner', 2, 0); run(S, 40);
  const S2 = createSim(lv(), 1); const a2 = spawnEnemy(S2, 'walker', 2, 50000); const b2 = spawnEnemy(S2, 'walker', 2, 61000); addUnit(S2, 'burner', 2, 0); addUnit(S2, 'gust', 2, 1); run(S2, 40);
  ok(b.hp === b.max && b2.hp < b2.max, 'wind widens fire', `${b.hp} ${b2.hp}`); }
// 18 determinism + snapshot/restore
{ const mk = () => { const S = createSim(lv({ spawns: [[10, 2, 'walker'], [50, 1, 'swarm'], [90, 3, 'brute']] }), 7); addUnit(S, 'shooter', 2, 0); addUnit(S, 'burner', 1, 0); addUnit(S, 'lobber', 3, 0); return S; };
  const A = mk(); run(A, 300); const snap = snapshot(A); const h1 = (run(A, 300), hash(A));
  const B = restore(snap, A.L); run(B, 300); ok(hash(B) === h1, 'snapshot/restore reproduces hash', `${hash(B)} ${h1}`);
  const C = mk(); run(C, 600); ok(hash(C) === h1, 'same seed same hash'); }
// 19 placement rules
{ const S = createSim(lv({ water: [0, 0, 1, 0, 0], rocks: [[1, 4]] }), 1);
  ok(canPlace(S, 'shooter', 2, 3) === 'needRaft', 'water needs raft'); ok(canPlace(S, 'raft', 1, 3) === 'notWater', 'raft only on water'); ok(canPlace(S, 'shooter', 1, 4) === 'rock', 'rock tile');
  step(S, [{ t: 'place', card: 'raft', lane: 2, col: 3 }]); ok(canPlace(S, 'shooter', 2, 3) === 'cd' || canPlace(S, 'shooter', 2, 3) === null, 'unit on raft ok'); ok(canPlace(S, 'farm', 2, 3) === 'noWater', 'no farm on raft'); }


  return { pass, fail, FAILS };
}
describe('V1 mechanics', () => { it('42 assertions pass', () => { const r = mechanics(); expect(r.FAILS).toEqual([]); expect(r.pass).toBe(42); }); });

function mechanics2() {
// v1 rev b mechanics (drum cart follows its escort, ladder pins 3, 墨匠 removed from v1 but its fortify rule stays tested for v2)
let pass = 0, fail = 0; const FAILS = []; const ok = (c, n, i = '') => { if (c) pass++; else { fail++; FAILS.push(`${n} ${i}`); } };
const lv = (o = {}) => ({ id: 't', lanes: [1, 1, 1, 1, 1], start: 5000, loadout: Object.keys(UNITS), sky: false, spawns: [], noEnd: true, ...o });
const run = (S, n) => { for (let i = 0; i < n; i++) step(S, null); return S; };
// drum cart keeps ≥ 1 tile behind the machine ahead in its lane
{ const S = createSim(lv(), 1); const w = spawnEnemy(S, 'walker', 2, 60000); const d = spawnEnemy(S, 'drummer', 2, 64000); run(S, 200); ok(d.x - w.x >= T, 'drum follows 1 tile behind', d.x - w.x); }
// with nobody ahead the drum cart walks at its own speed
{ const S = createSim(lv(), 1); const d = spawnEnemy(S, 'drummer', 2, 60000); run(S, 20); ok(60000 - d.x === 20 * 85, 'lone drum walks', 60000 - d.x); }
// a ladder pins up to three standing units behind the blocker
{ const S = createSim(lv(), 1); const e = spawnEnemy(S, 'ladder', 2, 52000); addUnit(S, 'wall', 2, 4); const a = addUnit(S, 'shooter', 2, 3), b = addUnit(S, 'shooter', 2, 2), c = addUnit(S, 'shooter', 2, 1), z = addUnit(S, 'shooter', 2, 0); run(S, 300);
  ok(a.pin === e.id && b.pin === e.id && c.pin === e.id && !z.pin, 'ladder pins 3 (cols 3,2,1), not col 0', [a.pin, b.pin, c.pin, z.pin].join(',')); }
// 墨匠 (v2): units in its 3×3 take 25 % less from bites
{ const S = createSim(lv(), 1); const w = addUnit(S, 'wall', 2, 3); addUnit(S, 'repair', 2, 2); const e = spawnEnemy(S, 'walker', 2, 3 * T + FACE); run(S, 41);
  const S2 = createSim(lv(), 1); const w2 = addUnit(S2, 'wall', 2, 3); spawnEnemy(S2, 'walker', 2, 3 * T + FACE); run(S2, 41);
  ok(w.max - w.hp < w2.max - w2.hp, 'fortify reduces bites', `${w.max - w.hp} vs ${w2.max - w2.hp}`); }

// shovel within 3 s refunds in full; later it refunds nothing
{ const S = createSim(lv({ start: 500 }), 1); step(S, [{ t: 'place', card: 'shooter', lane: 2, col: 1 }]); run(S, 20); step(S, [{ t: 'shovel', lane: 2, col: 1 }]);
  ok(S.grain === 500, 'shovel ≤3 s refunds', S.grain);
  step(S, [{ t: 'place', card: 'shooter', lane: 2, col: 1 }]); run(S, 80); step(S, [{ t: 'shovel', lane: 2, col: 1 }]); ok(S.grain === 420, 'shovel >3 s no refund', S.grain); }


  return { pass, fail, FAILS };
}
describe('V1 mechanics2', () => { it('6 assertions pass', () => { const r = mechanics2(); expect(r.FAILS).toEqual([]); expect(r.pass).toBe(6); }); });

function mechanics3() {
// v1 rev c mechanics: wind-boosted fire splash stat (2-9's 3★ = 火借风势) and the post-dawn owl walk (no endless 2-11).
let pass = 0, fail = 0; const FAILS = []; const ok = (c, n, i = '') => { if (c) pass++; else { fail++; FAILS.push(`${n} ${i}`); } };
const lv = (o = {}) => ({ id: 't', lanes: [1, 1, 1, 1, 1], start: 5000, loadout: Object.keys(UNITS), sky: false, spawns: [], noEnd: true, ...o });
const run = (S, n, acts) => { for (let i = 0; i < n; i++) step(S, i === 0 ? acts : null); return S; };
// a burner with a gust in the same lane: splash radius ×1.6 and the windBurn stat counts that splash
{ const S = createSim(lv(), 1); addUnit(S, 'burner', 2, 0); addUnit(S, 'gust', 2, 1); for (let i = 0; i < 8; i++) spawnEnemy(S, 'ant', 2, 40000 + i * 2500); run(S, 60);
  ok((S.stats.windBurn || 0) >= 5, 'wind-boosted splash ≥5 counted (windBurn)', S.stats.windBurn); }
{ const S = createSim(lv(), 1); addUnit(S, 'burner', 2, 0); for (let i = 0; i < 8; i++) spawnEnemy(S, 'ant', 2, 40000 + i * 2500); run(S, 60);
  ok(!(S.stats.windBurn > 0) && S.stats.bestBurn > 0, 'no gust → no windBurn', `${S.stats.windBurn} ${S.stats.bestBurn}`); }
// 夜枭木鸢 after dawn: lands for good, waits 30 s, then walks 25 ut/tick to the gate; the 檑木 cannot stop it → second breach loses
{ const L = lv({ noEnd: false, env: { night: true }, boss: { type: 'owl' }, spawns: [[0, 2, 'boss:owl', 1]] });
  const S = createSim(L, 1, { events: true }); const C = CFG.owl;
  while (!S.result && S.tick < C.dawnAt + C.walkAfterDawn + 40 * 20) step(S, null);
  const o = S.enemies.find((e) => e.k === 'owl');
  ok(S.ev.some((e) => e.type === 'owlLanded') && S.ev.some((e) => e.type === 'owlWalk'), 'owl lands at dawn and starts walking', o && o.x);
  while (!S.result && S.tick < 20 * 60 * 12) step(S, null);
  ok(S.result === 'lose' && S.stats.lostTo === 'owl', 'unanswered owl reaches the gate → lose (no endless level)', `${S.result} ${S.stats.lostTo} ${S.tick}`); }

// 铜犀等急了: after 90 s in the shell (phase 2) its horn grows +50 % every 20 s — a wall-only stall cannot last forever
{ const L = { id: 't', lanes: [1, 1, 1, 1, 1], start: 0, loadout: [], sky: false, noEnd: false, boss: { type: 'rhino' }, spawns: [[0, 2, 'boss:rhino', 1]] };
  const S = createSim(L, 1, { events: true }); let rh = null;
  while (!(rh = S.enemies.find((e) => e.k === 'rhino'))) step(S, null);
  rh.hp = rh.p2At + 1; for (const c of [6, 5, 4, 3]) addUnit(S, 'wall', 2, c); addUnit(S, 'shooter', 2, 0); // the crossbow pushes it into the shell, then only "叮"s
  const hits = [];
  while (!S.result && S.tick < 20 * 60 * 12) { const before = new Map(S.units.map((u) => [u.id, u.hp])); step(S, null);
    for (const [id, hp] of before) { const u = S.units.find((v) => v.id === id); const now = u ? u.hp : 0; if (now < hp && S.boss) hits.push([S.tick, hp - Math.max(0, now)]); } }
  const t0 = rh.boss.shellAt; const early = hits.filter(([t]) => t - t0 <= 90 * 20).map((h) => h[1]); const late = hits.filter(([t]) => t - t0 > 90 * 20).map((h) => h[1]);
  ok(S.result === 'lose' && early.every((d) => d <= 200) && late.some((d) => d > 200), 'shell impatience: horn ≤200 for 90 s, then ramps; the stall ends', `${S.result} early max ${Math.max(...early)} late max ${Math.max(0, ...late)}`); }


  return { pass, fail, FAILS };
}
describe('V1 mechanics3', () => { it('5 assertions pass', () => { const r = mechanics3(); expect(r.FAILS).toEqual([]); expect(r.pass).toBe(5); }); });

function mechanics4() {
// v1 rev d mechanics (review fixes): shovel refund only before the unit acts (B1); level-derived mutable state in S
// (flags / dawn / deck) so snapshot + hash cover it (B6); exact suspend/resume vs checkpoint restore (B13, D8);
// learn events for every 怕什么 pair (B4, D5); 1-1 sky waits for the first dismantle (D12/D30); assist log cap.
let pass = 0, fail = 0; const FAILS = []; const ok = (c, n, i = '') => { if (c) pass++; else { fail++; FAILS.push(`${n} ${i}`); } };
const lv = (o = {}) => ({ id: 't', lanes: [1, 1, 1, 1, 1], start: 1000, loadout: Object.keys(UNITS), sky: false, spawns: [], noEnd: true, ...o });
const run = (S, n, acts) => { for (let i = 0; i < n; i++) step(S, i === 0 ? acts : null); return S; };
const place = (card, lane, col) => [{ t: 'place', card, lane, col }];
const shovel = (lane, col) => [{ t: 'shovel', lane, col }];
// ── B1: place → act → shovel never refunds; an idle unit still does (防误触)
for (const [card, col, setup, wait, why] of [
  ['hook', 3, (S) => spawnEnemy(S, 'walker', 2, 40000), 10, 'hook pushes on its first tick'],
  ['gust', 1, (S) => spawnEnemy(S, 'walker', 2, 60000), 50, 'gust blows at 2 s'],
  ['shooter', 1, (S) => spawnEnemy(S, 'walker', 2, 60000), 20, 'shooter fires at 0.5 s'],
  ['lobber', 1, (S) => spawnEnemy(S, 'walker', 2, 60000), 30, 'lobber throws at 1 s'],
  ['burner', 1, (S) => spawnEnemy(S, 'walker', 2, 60000), 30, 'burner throws at 1 s'],
  ['beam', 1, (S) => spawnEnemy(S, 'walker', 2, 40000), 20, 'beam ticks'],
]) {
  const S = createSim(lv(), 1); setup(S); step(S, place(card, 2, col)); run(S, wait); const g0 = S.grain; step(S, shovel(2, col));
  ok(S.grain === g0 && (S.cdReady[card] ?? 0) > S.tick - 1, `B1 no refund after acting: ${why}`, `${g0}→${S.grain}`);
}
{ const S = createSim(lv(), 1); step(S, place('shooter', 2, 1)); run(S, 40); step(S, shovel(2, 1)); ok(S.grain === 1000, 'B1 idle shooter (nothing in sight) shovelled ≤3 s → full refund', S.grain); }
{ const S = createSim(lv(), 1); run(S, 170); step(S, place('wall', 2, 4)); const w = S.units[0]; w.hp -= 30; run(S, 5); step(S, shovel(2, 4)); ok(S.grain === 950, 'B1 bitten wall → no refund', S.grain); }
// shovel-spam exploit from the review (hook placed and shovelled 2–60 ticks later, repeated) no longer costs nothing
{ const S = createSim(lv({ start: 90 }), 1); const e = spawnEnemy(S, 'walker', 2, 39000); let pushes = 0; const x0 = e.x;
  for (let k = 0; k < 6; k++) { step(S, place('hook', 2, 3)); run(S, 3); step(S, shovel(2, 3)); run(S, 2); if (S.grain < 90) break; pushes++; }
  ok(pushes <= 1 && S.grain === 0, 'B1 hook spam: one push, then no grain', `${pushes} pushes, grain ${S.grain}`); }
// ── B6: drum moves the flag in S.flags; checkpoint at the moved flag restores exactly; one drum per flag
{ const L = lv({ noEnd: false, drumOk: true, flags: [600, 1200], spawns: [[100, 2, 'walker', 0], [600, 1, 'walker', 0], [620, 3, 'walker', 0], [1200, 0, 'walker', 0]], loadout: ['shooter', 'farm'] });
  const S = createSim(L, 0, { events: true }); addUnit(S, 'shooter', 2, 1); addUnit(S, 'shooter', 1, 1); addUnit(S, 'shooter', 3, 1); addUnit(S, 'shooter', 0, 1);
  while (S.tick < 300) step(S, null);
  const g0 = S.grain; step(S, [{ t: 'drum' }]);
  ok(S.flags[0] < 600 && S.stats.drums === 1 && S.grain > g0, 'B6 drum pulls flag 1 forward and pays', `${S.flags} ${S.grain - g0}`);
  const again = (step(S, [{ t: 'drum' }]), S.stats.drums); ok(again === 1 && S.flags[1] === 1200, 'B6 no second drum while the drummed flag is pending', again);
  while (S.tick < S.flags[0]) step(S, null);
  const snap = snapshot(S); run(S, 200); const h1 = hash(S);
  const R = restore(snap, L); ok(R && R.flags[0] === snap.flags[0] && R.drumUsed.length === 1, 'B6 restore keeps the moved flag and the drum record', R && R.flags);
  run(R, 200); ok(hash(R) === h1, 'B6 drum → checkpoint → restore → identical hash', `${hash(R)} ${h1}`);
  const n0 = R.stats.drums; step(R, [{ t: 'drum' }]); ok(R.stats.drums === n0 || R.flags[1] !== 1200, 'B6 after restore only the NEXT flag can be drummed', R.flags); }
{ const L = lv({ env: { night: true, dawnAt: 400 } }); const S = createSim(L, 0); run(S, 300); const snap = snapshot(S); const R = resume(snap, L); run(R, 200);
  ok(!isNight(R) && R.dawnAt === 400, 'B6 dawn lives in S and survives a snapshot', R.dawnAt); }
// ── B13 / D8: suspend = exact resume (logs as they were, no restored mark); restore = checkpoint (logs re-hung, restored+1)
{ const L = lv({ noEnd: false, spawns: [[20, 2, 'walker', 0], [400, 2, 'walker', 0], [500, 1, 'walker', 0]] });
  const S = createSim(L, 3, { events: true }); while (S.stats.logsUsed === 0) step(S, null);
  const snap = snapshot(S); run(S, 300); const h1 = hash(S);
  const R = resume(snap, L); ok(R && R.logs[2] === 1 && !R.restored, 'D8 resume keeps the used 檑木 and no restored mark', R && R.logs);
  run(R, 300); ok(hash(R) === h1, 'D8 suspend → resume reproduces the run exactly', `${hash(R)} ${h1}`);
  const C = restore(snap, L); ok(C && C.logs.every((l) => l === 0) && C.restored === 1, 'B13 checkpoint restore re-hangs logs after the hash check', C && C.logs);
  const bad = JSON.parse(JSON.stringify(snap)); bad.grain += 1; ok(resume(bad, L) === null && restore(bad, L) === null, 'B13 a corrupted snapshot is rejected (hash mismatch)'); }
// ── B4 / D5: a learn event for every 怕什么 pair
{ const S = createSim(lv(), 1, { events: true }); addUnit(S, 'wall', 2, 3); addUnit(S, 'spikes', 2, 4); spawnEnemy(S, 'ram', 2, 70000); run(S, 400);
  ok(S.ev.some((e) => e.type === 'counter' && e.k === 'ram' && e.card === 'spikes'), 'B4 ram on spikes → counter(ram, spikes)'); }
{ const S = createSim(lv(), 1, { events: true }); addUnit(S, 'wall', 2, 4); addUnit(S, 'hook', 2, 3); spawnEnemy(S, 'ladder', 2, 60000); run(S, 600);
  ok(S.ev.some((e) => e.type === 'counter' && e.k === 'ladder' && e.card === 'hook'), 'B4 hook pushes a ladder → counter(ladder, hook)'); }
{ const S = createSim(lv(), 1, { events: true }); addUnit(S, 'gust', 2, 1); spawnEnemy(S, 'flyer', 2, 50000); run(S, 200);
  ok(S.ev.some((e) => e.type === 'counter' && e.k === 'flyer' && e.card === 'gust'), 'B4 gust grounds a flyer → counter(flyer, gust)'); }
{ const S = createSim(lv(), 1, { events: true }); addUnit(S, 'gust', 2, 1); const sm = spawnEnemy(S, 'smoker', 2, 60000); run(S, 400);
  ok(S.ev.some((e) => e.type === 'counter' && e.k === 'smoker' && e.card === 'gust' && e.id === sm.id), 'B4 gust clears a smoke cart cloud → counter(smoker, gust)'); }
{ const S = createSim(lv(), 1, { events: true }); addUnit(S, 'pit', 2, 5); run(S, 200); spawnEnemy(S, 'walker', 2, 70000); run(S, 400);
  ok(S.ev.some((e) => e.type === 'counter' && e.k === 'walker' && e.card === 'pit'), 'B4 pit capture → counter(walker, pit)'); }
{ const S = createSim(lv(), 1, { events: true }); addUnit(S, 'lobber', 2, 1); spawnEnemy(S, 'shielder', 2, 60000); run(S, 900);
  ok(S.ev.some((e) => e.type === 'counter' && e.k === 'shielder' && e.card === 'lobber' && e.kill), 'B4 dismantle → counter(shielder, lobber, kill)'); }
// ── D12 / D30: 1-1 sky — the first drop comes 1 s after the first dismantle
{ const S = createSim(lv({ sky: true, skyAfterKill: true }), 0, { events: true }); addUnit(S, 'shooter', 2, 1); spawnEnemy(S, 'walker', 2, 60000);
  run(S, 1200); const kill = S.ev.find((e) => e.type === 'gone'); const drop = S.ev.find((e) => e.type === 'drop' && e.from === 'sky');
  ok(kill && drop && drop.tick === kill.tick + 20, 'D12 first sky drop 1 s after the first dismantle', `${kill?.tick} ${drop?.tick}`); }
// ── assist: two 檑木 per gate when logCap = 2
{ const S = createSim(lv({ noEnd: false, spawns: [[0, 2, 'walker', 0], [900, 2, 'walker', 0], [1800, 2, 'walker', 0]], endTick: 6000 }), 0, { logCap: 2 }); while (!S.result && S.tick < 4000) step(S, null);
  ok(S.stats.logsUsed === 2 && S.result === 'lose', 'assist: logCap 2 absorbs two breaches per lane', `${S.stats.logsUsed} ${S.result}`); }


  return { pass, fail, FAILS };
}
describe('V1 mechanics4', () => { it('27 assertions pass', () => { const r = mechanics4(); expect(r.FAILS).toEqual([]); expect(r.pass).toBe(27); }); });
