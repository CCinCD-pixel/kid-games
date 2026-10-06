// 机关守城 · lane core — the bosses. Port of lane-defense-tools/proto/boss.mjs (rev d).
// Bosses are enemies with e.boss; sim.ts routes their tick / damage / gust / hook / log here.
// v1: 铜犀冲车 (rhino, 1-11) and 夜枭木鸢 (owl, 2-11). The v2 branches (楼船 ship, 九攻·万机城 fortress) are ported
// unchanged and stay off until v2 levels use them (spec §0A.3).
import { T, COLS, LANES, SPAWN_X, BOARD_X, FACE } from './rules';
import { UNITS, BOSS_CFG, MOVES } from './tables';
import type { Action, BossCtl, Enemy, SimApi, SimState, Src, Unit } from './types';

export const ASSIST_BOSS_PCT = 75;
export const ASSIST2_BOSS_PCT = 50;
export const CFG = BOSS_CFG;
export { MOVES };

/** fortress timeline helpers (also used by the level generator) */
export function fortressSchedule(): { moves: { i: number; preview: number; start: number; end: number }[]; finale: number; end: number } {
  const F = CFG.fortress; const out: { i: number; preview: number; start: number; end: number }[] = []; let t = F.setup;
  for (let i = 0; i < MOVES.length; i++) { out.push({ i, preview: t, start: t + F.preview, end: t + F.preview + F.moveLen }); t += F.preview + F.moveLen; }
  return { moves: out, finale: t, end: t + F.finale };
}

export function init(S: SimState, cfg: { type: string }): void {
  S.boss = { type: cfg.type, cfg, done: false, spawned: false };
  if (cfg.type === 'fortress') {
    const sch = fortressSchedule();
    Object.assign(S.boss, { sch, move: -1, swapOpen: false, swapUsed: false, core: 0, phase: 'setup' });
  }
}

export function spawnBoss(S: SimState, type: string, _lane: number, API: SimApi): void {
  const B = S.boss as BossCtl; B.spawned = true;
  const hp = (v: number): number => (S.assist ? Math.round((v * (S.assist === 2 ? ASSIST2_BOSS_PCT : ASSIST_BOSS_PCT)) / 100) : v);
  if (type === 'rhino') {
    const C = CFG.rhino;
    const e = API.spawnEnemy(S, 'walker', C.lane, SPAWN_X, { k: 'rhino', hp: hp(C.hp), max: hp(C.hp), mat: 'metal', armor: C.armor, wt: 'heavy', body: C.body, parts: 10, spd: C.speed[1], p2At: hp(C.p2At), crackMax: hp(C.crackMax) });
    e.boss = { type, phase: 1, crack: 0, hornNext: 0, chargeNext: 0, tele: 0, dash: 0, hatchNext: 0, hatchI: 0 };
    B.id = e.id; API.ev(S, 'bossIn', { k: type });
  } else if (type === 'owl') {
    const C = CFG.owl;
    const e = API.spawnEnemy(S, 'walker', 2, C.hoverX + 20000, { k: 'owl', hp: hp(C.hp), max: hp(C.hp), mat: 'wood', wt: 'heavy', layer: 'air', body: C.body, parts: 10, highOnly: true });
    e.boss = { type, state: 'high', laneNext: S.tick + C.laneEvery, shadowLane: -1, shadowUntil: 0, swoopNext: S.tick + C.firstSwoop, until: 0,
      bombNext: S.tick + C.firstBomb, birdsNext: S.tick + C.firstBirds, rs: 7 };
    B.id = e.id; API.ev(S, 'bossIn', { k: type });
  } else if (type === 'ship') {
    const C = CFG.ship; B.x = SPAWN_X;
    const mk = (k: string, lane: number, hp0: number, extra?: Partial<Enemy>): Enemy => { const e = API.spawnEnemy(S, 'walker', lane, SPAWN_X, { k, hp: hp0, max: hp0, mat: 'wood', wt: 'heavy', layer: 'water', body: 10000, parts: 10, ...extra }); e.boss = { type, part: k }; return e; };
    const arm = mk('shiparm', 2, C.partHp), dock = mk('shipdock', 3, C.partHp), drum = mk('shipdrum', 3, C.partHp);
    const hull = mk('shiphull', 2, C.hullHp, { untargetable: true }); const proxy = mk('shipproxy', 3, 1, { untargetable: true, proxy: 0 });
    proxy.proxy = hull.id; proxy.hp = 1e9; proxy.max = 1e9;
    Object.assign(B, { arm: arm.id, dock: dock.id, drum: drum.id, hull: hull.id, proxyId: proxy.id, armNext: S.tick + C.armEvery, dockNext: S.tick + C.dockEvery, dockI: 0, partsDown: 0 });
    API.ev(S, 'bossIn', { k: type });
  }
}

const alive = (S: SimState, id: number | undefined): Enemy | undefined => S.enemies.find((e) => e.id === id && e.hp > 0 && !e.gone);

/** controller tick (once per tick, before units act) */
export function tick(S: SimState, API: SimApi): void {
  const B = S.boss; if (!B || B.done) return;
  if (B.type === 'ship' && B.spawned) shipTick(S, B, API);
  if (B.type === 'fortress') fortressTick(S, B, API);
}

export function tickPart(S: SimState, e: Enemy, API: SimApi): void {
  if (e.boss!.type === 'rhino') { rhinoTick(S, e, API); return; }
  if (e.boss!.type === 'owl') { owlTick(S, e, API); return; }
}

// ───────── 铜犀冲车 ─────────
function rhinoTick(S: SimState, e: Enemy, API: SimApi): void {
  const C = CFG.rhino; const B = e.boss!;
  if (e.stunUntil > S.tick) return;
  const b = API.blockerFor(S, e); const face = b ? b.col * T + FACE : -1e9;
  if (B.phase === 3) {
    if (!B.hatchNext) { B.hatchNext = S.tick + C.hatchEvery; B.chargeNext = S.tick + C.firstCharge; }
    if (S.tick >= B.hatchNext) {
      const ln = C.hatchLanes[B.hatchI!++ % 2];
      if (S.L.lanes[ln]) for (let i = 0; i < C.hatchN; i++) API.spawnEnemy(S, 'ant', ln, Math.min(SPAWN_X, e.x + 5000 + i * 2500));
      B.hatchNext = S.tick + C.hatchEvery; API.ev(S, 'hatch', { lane: ln });
    }
    if (B.tele! > 0) {
      B.tele!--;
      if (B.tele === 0) {
        // spikes anywhere under its body (front tile … tail tile) cancel the charge: 扎住了
        let spiked = false; for (let c = API.tileOf(e.x); c <= Math.min(COLS - 1, API.tileOf(e.x + C.body)); c++) { const o = API.occupant(S, e.lane, c); if (o && o.k === 'spikes' && !o.dead) spiked = true; }
        if (spiked) { e.stunUntil = S.tick + C.spikeStun; API.ev(S, 'dashStopped', { by: 'spikes' }); } else B.dash = C.dashDist;
      }
      return;
    }
    if (B.dash! > 0) {
      const mv = Math.min(C.dashSpeed, B.dash!); const nx = e.x - mv; B.dash! -= mv;
      for (let c = API.tileOf(e.x); c >= 0 && c * T + FACE >= nx; c--) {
        const o = API.occupant(S, e.lane, c); if (!o || o.dead) continue;
        if (o.k === 'spikes') { e.x = Math.max(nx, c * T + FACE); B.dash = 0; e.stunUntil = S.tick + C.spikeStun; API.ev(S, 'dashStopped', { by: 'spikes' }); return; }
        if (UNITS[o.k].flat) continue;
        if (c * T + FACE > e.x) continue;
        if (o.k === 'wall') { o.hp -= C.dashWallDmg; if (o.hp > 0) { e.x = c * T + FACE; B.dash = 0; API.ev(S, 'dashStopped', { by: 'wall' }); return; } API.removeUnit(S, o, 'crushed'); continue; }
        API.removeUnit(S, o, 'crushed');
      }
      e.x = nx; if (e.x < 0) API.breach(S, e); return;
    }
    if (S.tick >= B.chargeNext! && e.x < BOARD_X) { B.tele = C.tele; B.chargeNext = S.tick + C.chargeEvery; API.ev(S, 'chargeTele', {}); return; }
  }
  if (b && e.x <= face) {
    if (S.tick >= B.hornNext!) {
      // 铜犀等急了 — after 90 s in the shell its horn grows +50 % every 20 s
      let dmg = C.hornDmg[B.phase!];
      if (B.phase === 2 && B.shellAt != null && S.tick - B.shellAt > C.shellPatience) dmg = Math.floor((dmg * (2 + Math.floor((S.tick - B.shellAt - C.shellPatience) / C.shellRampEvery))) / 2);
      API.biteUnit(S, e, b, dmg); B.hornNext = S.tick + C.hornEvery[B.phase!];
    }
    return;
  }
  const v = C.speed[B.phase!];
  e.x = b ? Math.max(face, e.x - v) : e.x - v;
  if (b && e.x === face) B.hornNext = S.tick + 10;
  if (e.x < 0) API.breach(S, e);
}

// ───────── 夜枭木鸢 ─────────
function owlRand(B: { rs?: number }, n: number): number { B.rs = (Math.imul(B.rs!, 1103515245) + 12345) >>> 0; return (B.rs >>> 16) % n; }
function owlTick(S: SimState, e: Enemy, API: SimApi): void {
  const C = CFG.owl; const B = e.boss!;
  // 天亮了: a night bird cannot stay up after dawn — it glides down for good
  if (S.tick >= C.dawnAt && B.state !== 'landed') { B.state = 'landed'; e.layer = 'ground'; e.highOnly = false; e.x = Math.min(e.x, 45000); S.dawnAt = S.tick; API.ev(S, 'owlLanded', {}); }
  if (B.state === 'landed') { // 30 s after dawn the grounded bird waddles to the gate; it must be dismantled
    if (S.tick < C.dawnAt + C.walkAfterDawn || e.stunUntil > S.tick) return;
    if (!B.walking) { B.walking = 1; API.ev(S, 'owlWalk', {}); }
    const b = API.blockerFor(S, e); const face = b ? b.col * T + FACE : -1e9;
    if (b && e.x <= face) { if (S.tick >= (B.biteNext || 0)) { API.biteUnit(S, e, b, C.landBite); B.biteNext = S.tick + 10; } return; }
    e.x = b ? Math.max(face, e.x - C.walkSpeed) : e.x - C.walkSpeed;
    if (e.x < 0) API.breach(S, e);
    return;
  }
  if (e.x > C.hoverX) { e.x = Math.max(C.hoverX, e.x - 300); return; }
  if (B.state === 'down') { if (S.tick >= B.until!) { B.state = 'high'; e.layer = 'air'; e.highOnly = true; e.x = C.hoverX; API.ev(S, 'owlUp', {}); } return; }
  if (B.state === 'swoopTele') {
    if (S.tick >= B.until!) {
      B.state = 'swoop'; B.until = S.tick + C.swoop; e.layer = 'ground'; e.highOnly = false; e.x = 30000;
      const u = frontUnit(S, e.lane, API); if (u) API.biteUnit(S, e, u, C.swoopHit); API.ev(S, 'swoop', { lane: e.lane });
    }
    return;
  }
  const rage = e.hp * 100 < e.max * C.rageAt; if (rage && !B.rage) { B.rage = 1; API.ev(S, 'owlRage', {}); }
  if (B.state === 'swoop') { if (S.tick >= B.until!) { B.state = 'high'; e.layer = 'air'; e.highOnly = true; e.x = C.hoverX; B.swoopNext = S.tick + (rage ? C.rageSwoop : C.swoopEvery); } return; }
  // high
  if (B.shadowLane! >= 0) { if (S.tick >= B.shadowUntil!) { e.lane = B.shadowLane!; B.shadowLane = -1; } }
  else if (S.tick >= B.laneNext!) {
    const act = [0, 1, 2, 3, 4].filter((l) => S.L.lanes[l] && l !== e.lane);
    B.shadowLane = act[owlRand(B, act.length)]; B.shadowUntil = S.tick + C.shadow; B.laneNext = S.tick + C.laneEvery; API.ev(S, 'owlShadow', { lane: B.shadowLane });
  }
  if (S.tick >= B.swoopNext! && B.shadowLane! < 0) { B.state = 'swoopTele'; B.until = S.tick + C.swoopTele; API.ev(S, 'swoopTele', { lane: e.lane }); return; }
  if (S.tick >= B.bombNext!) {
    B.bombNext = S.tick + C.bombEvery;
    for (const dl of [0, -1, 1]) {
      const ln = e.lane + dl; if (ln < 0 || ln >= LANES || !S.L.lanes[ln]) continue;
      let best: Unit | null = null; for (const u of S.units) if (!u.dead && u.lane === ln && (u.k === 'farm' || u.k === 'bank') && (!best || u.col > best.col)) best = u;
      if (best) { S.smoke[ln][best.col] = Math.max(S.smoke[ln][best.col], S.tick + C.bombDur); API.ev(S, 'bomb', { lane: ln, col: best.col }); break; }
    }
  }
  if (S.tick >= B.birdsNext!) {
    B.birdsNext = S.tick + C.birdsEvery; let n = 0; const nb = B.rage ? C.rageBirds : C.birds;
    for (const dl of (B.rage ? C.rageOffsets : C.birdOffsets)) {
      const ln = e.lane + dl; if (n >= nb || ln < 0 || ln >= LANES || !S.L.lanes[ln]) continue;
      API.spawnEnemy(S, 'flyer', ln, e.x, { chick: true, hp: CFG.owl.chickHp, max: CFG.owl.chickHp }); n++; // 小木鹊: only steals grain
    }
  }
}
function frontUnit(S: SimState, lane: number, API: SimApi): Unit | null {
  for (let c = COLS - 1; c >= 0; c--) { const u = API.topAt(S, lane, c); if (u && !u.dead && !UNITS[u.k].flat) return u; }
  return null;
}

// ───────── 楼船 (v2) ─────────
function shipTick(S: SimState, B: BossCtl, API: SimApi): void {
  const C = CFG.ship;
  const hull = alive(S, B.hull); if (!hull) return;
  const drumUp = !!alive(S, B.drum);
  let face = -1e9;
  for (const ln of C.lanes) for (let c = COLS - 1; c >= 0; c--) { const o = API.occupant(S, ln, c); if (o && o.k === 'raft' && !o.dead && c * T + FACE <= B.x! + 1) { face = Math.max(face, c * T + FACE); break; } }
  const v = Math.floor((C.speed * (drumUp ? C.drumPct : 100)) / 100);
  if (B.x! > C.anchorX) B.x = Math.max(C.anchorX, Math.max(face, B.x! - v));
  for (const [id, off] of [[B.arm, 0], [B.dock, 0], [B.drum, C.drumBehind], [B.hull, C.hullOffset], [B.proxyId, C.hullOffset]] as [number, number][]) { const p = S.enemies.find((x) => x.id === id); if (p) p.x = B.x! + off; }
  if (alive(S, B.arm) && S.tick >= B.armNext!) {
    B.armNext = S.tick + C.armEvery; let best: Unit | null = null;
    for (const ln of C.lanes) for (let c = COLS - 1; c >= 0; c--) { const o = API.occupant(S, ln, c); if (!o || o.dead || o.k !== 'raft') continue; const f = c * T + FACE; if (f > B.x! + 1 || f < B.x! - C.armReach) continue; if (!best || c > best.col) best = o; break; }
    if (best) { API.removeUnit(S, best, 'hooked'); API.ev(S, 'armHook', { lane: best.lane, col: best.col }); }
  }
  if (alive(S, B.dock) && S.tick >= B.dockNext!) { B.dockNext = S.tick + C.dockEvery; const ln = C.lanes[B.dockI!++ % 2]; API.spawnEnemy(S, 'boat', ln, Math.max(0, B.x! - 5000)); }
  const down = [B.arm, B.dock, B.drum].filter((id) => !alive(S, id)).length;
  if (down >= 2 && hull.untargetable) { hull.untargetable = false; const px = S.enemies.find((x) => x.id === B.proxyId); if (px) px.untargetable = false; API.ev(S, 'hullOpen', {}); }
}

// ───────── 九攻·万机城 (v2) ─────────
function fortressTick(S: SimState, B: BossCtl, API: SimApi): void {
  const F = CFG.fortress; const sch = B.sch!;
  for (const m of sch.moves) {
    if (S.tick === m.preview) { B.move = m.i; B.swapOpen = true; B.swapUsed = false; B.phase = 'preview'; API.ev(S, 'movePreview', { i: m.i, k: MOVES[m.i].id }); }
    if (S.tick === m.start) {
      B.swapOpen = false; B.phase = 'move';
      for (let l = 0; l < LANES; l++) if (S.logs[l]) { S.logs[l] = 0; S.stats.logsRestored = (S.stats.logsRestored || 0) + 1; }
      const mv = MOVES[m.i];
      if (mv.flood) for (const ln of F.floodLanes) S.flood[ln] = S.tick + F.floodDur;
      if (mv.smokeWall) { for (const ln of F.smokeLanes) { S.smokeHard[ln] = 1; for (const c of F.smokeCols) S.smoke[ln][c] = m.end; } }
    }
    if (S.tick === m.end && MOVES[m.i].smokeWall) { for (const ln of F.smokeLanes) { S.smokeHard[ln] = 0; for (const c of F.smokeCols) S.smoke[ln][c] = 0; } }
  }
  if (S.tick === sch.finale) {
    B.phase = 'finale'; S.tokens = 3;
    const e = API.spawnEnemy(S, 'walker', 2, 70000, { k: 'core', hp: F.coreHp, max: F.coreHp, mat: 'wood', wt: 'heavy', layer: 'ground', body: 10000, parts: 0 });
    e.boss = { type: 'fortress', part: 'core' }; B.core = e.id; API.ev(S, 'coreOpen', {});
  }
  if (S.tick >= sch.end && B.phase === 'finale') { B.done = true; B.phase = 'done'; for (const e of S.enemies) if (e.k === 'core') e.gone = true; API.ev(S, 'bridge', {}); }
}
/** 火借风势: a fire pot that lands in a lane with a working gust burns the (v2) smoke wall of that lane away */
export function onWindFire(S: SimState, lane: number, API: SimApi): void {
  if (!S.boss || S.boss.type !== 'fortress' || !S.smokeHard[lane]) return;
  S.smokeHard[lane] = 0; for (let c = 0; c < COLS; c++) S.smoke[lane][c] = 0; S.stats.windFire = (S.stats.windFire || 0) + 1;
  API.ev(S, 'smokeBurned', { lane });
}
export function swap(S: SimState, a: Extract<Action, { t: 'swap' }>, API: SimApi): boolean {
  const B = S.boss; if (!B || B.type !== 'fortress' || !B.swapOpen || B.swapUsed) return false;
  const lo = S.loadout; const i = lo.indexOf(a.out); if (i < 0 || lo.includes(a.in) || !UNITS[a.in]) return false;
  lo[i] = a.in; S.cdReady[a.in] = S.tick; B.swapUsed = true; S.stats.swaps = (S.stats.swaps || 0) + 1;
  API.ev(S, 'swap', { out: a.out, in: a.in }); return true;
}

// ───────── damage / reactions ─────────
export function hurt(S: SimState, e: Enemy, dmg: number, dtype: string, src: Src | null | undefined, API: SimApi): number {
  const t = e.boss!.type;
  if (e.proxy) { const h = S.enemies.find((x) => x.id === e.proxy); return h && !h.untargetable ? API.hurtRaw(S, h, dmg, dtype, src) : 0; }
  if (e.untargetable) return 0;
  if (t === 'rhino') {
    const B = e.boss!; const C = CFG.rhino;
    if (B.phase === 2) {
      let c = 0;
      if (dtype === 'blunt') c = Math.ceil(dmg / C.crackBlunt);
      else if (dtype === 'light') c = Math.ceil(dmg / C.crackLight);
      else if (dtype === 'crush') c = src && src.k === 'log' ? C.crackLog : C.crackStrike;
      if (!c) { e.dings = (e.dings || 0) + 1; return 0; }
      B.crack = Math.min(e.crackMax!, B.crack! + c); S.stats.crack = B.crack;
      if (B.crack >= e.crackMax!) { B.phase = 3; e.mat = 'wood'; e.armor = 0; e.stunUntil = S.tick + C.shellStun; API.ev(S, 'shellOff', {}); }
      return 0;
    }
    const d = API.hurtRaw(S, e, dmg, dtype, src);
    if (B.phase === 1 && e.hp <= e.p2At!) { e.hp = e.p2At!; B.phase = 2; B.shellAt = S.tick; e.stunUntil = S.tick + C.shellClose; API.ev(S, 'shellOn', {}); }
    return d;
  }
  if (t === 'owl') {
    const B = e.boss!;
    if (B.state === 'down' || B.state === 'landed') dmg = Math.floor((dmg * CFG.owl.downMulPct) / 100);
    else if (B.state === 'high' || B.state === 'swoopTele') dmg = Math.max(1, Math.floor((dmg * CFG.owl.highMulPct) / 100));
    return API.hurtRaw(S, e, dmg, dtype, src);
  }
  return API.hurtRaw(S, e, dmg, dtype, src);
}
export function onGust(S: SimState, e: Enemy, u: Unit | null, API: SimApi): void {
  if (e.boss!.type === 'owl') {
    const B = e.boss!; const big = !u || u.ultUntil > S.tick;
    if (B.state === 'swoop' || B.state === 'swoopTele' || (big && B.state === 'high')) { B.state = 'down'; B.until = S.tick + CFG.owl.down; e.layer = 'ground'; e.highOnly = false; e.x = 35000; S.stats.owlDown = (S.stats.owlDown || 0) + 1; API.ev(S, 'owlDown', {}); }
  }
}
export function onHook(S: SimState, e: Enemy, _d: number, _src: Src | null | undefined, _API: SimApi): void {
  const t = e.boss!.type;
  if (t === 'rhino') { e.x = Math.min(SPAWN_X, e.x + 5000); if (e.boss!.tele! > 0) { e.boss!.tele = 0; e.boss!.chargeNext = S.tick + 60; } return; }
  if (t === 'ship' && e.k === 'shiparm') { const B = S.boss!; B.x = Math.min(SPAWN_X, B.x! + CFG.ship.hookPush); B.armNext = S.tick + CFG.ship.armEvery; S.stats.armReset = (S.stats.armReset || 0) + 1; return; }
}
export function onLog(S: SimState, e: Enemy, API: SimApi): void {
  if (e.boss!.type === 'rhino') { hurt(S, e, 1200, 'crush', { k: 'log' }, API); e.x = Math.min(SPAWN_X, e.x + 2 * T); e.boss!.dash = 0; e.boss!.tele = 0; return; }
  if (e.boss!.type === 'owl') return;
  if (e.k === 'core' || e.untargetable || e.proxy) return;
  API.hurtRaw(S, e, 1200, 'crush', { k: 'log' });
}
export function onBreach(S: SimState, e: Enemy, API: SimApi): void {
  const ln = e.lane;
  if (S.logs[ln] < (S.logCap || 1)) {
    S.logs[ln]++; S.stats.logsUsed++; S.stats.breachLanes.push(ln); if (S.stats.firstLeak < 0) S.stats.firstLeak = S.tick;
    API.ev(S, 'log', { lane: ln, by: e.k, ...API.breachFacts(S, e) });
    for (const o of S.enemies) if (o.lane === ln && !o.boss && o.hp > 0 && (o.layer === 'ground' || o.layer === 'water')) { o.hp = 0; o.byLog = true; }
    onLog(S, e, API); return;
  }
  S.result = 'lose'; S.stats.lostTo = e.k; S.stats.lostLane = ln; API.ev(S, 'lose', { lane: ln, by: e.k, ...API.breachFacts(S, e) });
}
/** return true when the entity may be removed */
export function onDeath(S: SimState, e: Enemy, API: SimApi): boolean {
  const B = S.boss!;
  if (e.k === 'rhino') { B.done = true; API.ev(S, 'bossDone', { k: 'rhino' }); return true; }
  if (e.k === 'owl') { B.done = true; API.ev(S, 'bossDone', { k: 'owl' }); return true; }
  if (e.k === 'shiphull') { B.done = true; for (const p of S.enemies) if (p.boss && p.boss.type === 'ship') p.gone = true; API.ev(S, 'bossDone', { k: 'ship' }); return true; }
  if (e.k === 'shipproxy') return false;
  return true;
}
