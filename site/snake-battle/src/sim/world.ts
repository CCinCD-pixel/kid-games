/**
 * World step (spec §3, §8.3): decisions → movement → hash → simultaneous collisions → shields → crown →
 * resolve → eat/power-ups → items → respawn. Line-by-line port of the prototype `world.mjs` (V1b parity).
 * Presentation-only fields (food colour, death positions for juice) never feed back into the rules.
 */
import { TICK, PHYS, turnRateOf as turnRate, Snake, BodyHash, FoodGrid, createRng, angDiff, enclosedBy, type Rng, type Food, type FoodKind, type KillTag, type SnakeOpts, type Cause } from './core';

export const NATURAL_MIX: [number, number, FoodKind][] = [[1, 0.85, 'orb'], [2, 0.13, 'orb2'], [5, 0.02, 'big']];
export const PU_DURATION = { magnet: 8, shield: 8, speed: 5 };
export type PuKind = 'magnet' | 'shield' | 'speed';

export interface WorldCfg {
  R: number; obstacles?: { x: number; y: number; r: number }[]; foodCount: number;
  pu?: { max: number; delay: [number, number]; kinds?: PuKind[] } | null;
  meteors?: { max: number; delay: [number, number] } | null;
  team?: boolean;
}
export interface PowerUp { x: number; y: number; kind: PuKind; born?: number }
export interface Meteor { x: number; y: number; vx: number; vy: number; die: number }

export type SimEvent =
  | { type: 'eat'; t: number; id: number; kind: FoodKind; v: number }
  | { type: 'meteor'; t: number; id: number }
  | { type: 'pu'; t: number; id: number; kind: PuKind }
  | { type: 'kill'; t: number; killer: number; victim: number; tag: KillTag; victimMass: number; killerMass: number }
  | { type: 'spawn'; t: number; id: number }
  | { type: 'shieldsave'; t: number; id: number; by: number }
  | { type: 'nearmiss'; t: number; id: number }
  | { type: 'gem'; t: number; id: number; by: number; left: number }
  | { type: 'king-windup'; t: number; id: number }
  | { type: 'king-charge'; t: number; id: number }
  | { type: 'wake'; t: number; id: number };
type Emit = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, 't'> : never) : never;

interface DeathInfo { killer: Snake; tag: KillTag; x: number; y: number; s?: number }

export class World {
  cfg: WorldCfg; R: number; seed: number | string; rng: Rng;
  t = 0; tick = 0;
  snakes: Snake[] = []; byId = new Map<number, Snake>();
  food: FoodGrid; foodList = new Set<Food>(); foodQueue: number[] = [];
  pus: PowerUp[] = []; puQueue: number[] = [];
  meteors: Meteor[] = []; meteorQueue: number[] = [];
  respawnQueue: { s: Snake; t: number; mass: number; sleeper?: boolean }[] = [];
  events: SimEvent[] = [];
  hash: BodyHash; obstacles: { x: number; y: number; r: number }[];
  objects: unknown[] = [];
  decisionsThisStep = 0; decisionCap = 6;
  kingCharge: any = null;
  /** production: drop events after they are drained (validators keep them) */
  keepEvents = true;
  private drained = 0;

  constructor(cfg: WorldCfg, seed: number | string) {
    this.cfg = cfg; this.R = cfg.R; this.seed = seed;
    this.rng = createRng(`world:${seed}`);
    this.food = new FoodGrid(cfg.R);
    this.hash = new BodyHash(cfg.R);
    this.obstacles = cfg.obstacles ?? [];
    for (let i = 0; i < cfg.foodCount; i++) this.spawnNatural();
    const pu = cfg.pu; if (pu) for (let i = 0; i < pu.max; i++) this.puQueue.push(this.rng.range(1, 4));
    const mt = cfg.meteors; if (mt) for (let i = 0; i < mt.max; i++) this.meteorQueue.push(this.rng.range(2, 6));
  }

  emit(e: Emit) { (e as SimEvent).t = this.t; this.events.push(e as SimEvent); }
  /** hand every event since the last drain to `sink` (production consumers: fx, sfx, voice, HUD, stats) */
  drainEvents(sink: (e: SimEvent) => void) {
    for (let i = this.drained; i < this.events.length; i++) sink(this.events[i]);
    if (this.keepEvents) this.drained = this.events.length;
    else { this.events.length = 0; this.drained = 0; }
  }

  randomPoint(margin = 60): [number, number] {
    const rr = (this.R - margin) * Math.sqrt(this.rng.next());
    const a = this.rng.range(0, Math.PI * 2);
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  }
  inObstacle(x: number, y: number, pad = 0) { return this.obstacles.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + pad); }

  addFood(x: number, y: number, v: number, kind: FoodKind, drop = false, life = Infinity): Food {
    const f: Food = { x, y, v, kind, drop, die: this.t + life, born: this.t, c: 0 };
    this.food.add(f); this.foodList.add(f); return f;
  }
  spawnNatural() {
    let x: number, y: number, k = 0;
    do { [x, y] = this.randomPoint(40); k++; } while (this.inObstacle(x, y, 20) && k < 20);
    let u = this.rng.next(), v = 1, kind: FoodKind = 'orb';
    for (const [val, p, kd] of NATURAL_MIX) { if (u < p) { v = val; kind = kd; break; } u -= p; }
    this.addFood(x, y, v, kind);
  }
  removeFood(f: Food) { this.food.remove(f); this.foodList.delete(f); }

  /** Spawn point with clearance (spec §3.12). forPlayer adds a free corridor check. */
  spawnPoint(clearHead = 300, clearBody = 120, forPlayer = false): [number, number, number] {
    let best: [number, number, number] | null = null, bestScore = -1;
    for (let attempt = 0; attempt < 80; attempt++) {
      const [x, y] = this.randomPoint(forPlayer ? this.R * 0.35 : 200);
      if (this.inObstacle(x, y, 80)) continue;
      const toC = Math.atan2(-y, -x) + this.rng.range(-0.5, 0.5);
      let minHead = Infinity, minBody = Infinity, incoming = false;
      for (const s of this.snakes) if (s.alive) {
        const d = Math.hypot(s.x - x, s.y - y); minHead = Math.min(minHead, d);
        if (forPlayer && d < 700 && (Math.cos(s.angle) * (x - s.x) + Math.sin(s.angle) * (y - s.y)) / (d || 1) > 0.7) incoming = true;
      }
      this.hash.query(x, y, 400, (i) => { minBody = Math.min(minBody, Math.hypot(this.hash.x[i] - x, this.hash.y[i] - y)); });
      let corridor = true;
      if (forPlayer) {
        for (let d = 50; d <= 600 && corridor; d += 50) {
          const cx = x + Math.cos(toC) * d, cy = y + Math.sin(toC) * d;
          if (Math.hypot(cx, cy) > this.R - 40 || this.inObstacle(cx, cy, 40)) corridor = false;
          this.hash.query(cx, cy, 60, (i) => { if (Math.hypot(this.hash.x[i] - cx, this.hash.y[i] - cy) < 50) corridor = false; return !corridor; });
        }
      }
      const score = Math.min(minHead / clearHead, minBody / clearBody) + (corridor ? 1 : 0);
      if (minHead >= clearHead && minBody >= clearBody && corridor && !incoming) return [x, y, toC];
      if (score > bestScore) { bestScore = score; best = [x, y, toC]; }
    }
    return best!;
  }

  addSnake(opts: SnakeOpts, mass = PHYS.startMass, at: [number, number, number] | null = null) {
    const s = new Snake(this.snakes.length, opts);
    this.snakes.push(s); this.byId.set(s.id, s);
    const [x, y, a] = at ?? this.spawnPoint(opts.isPlayer ? 450 : 300, opts.isPlayer ? 160 : 120, !!opts.isPlayer);
    s.spawn(x, y, a, mass, this.t);
    s.respawn = opts.respawn ?? null;
    return s;
  }

  step() {
    const dt = TICK;
    // 1. decisions — at most decisionCap full AI decisions per step (the player never counts); the start
    //    index rotates with the tick so no snake is favoured (spec §8.3)
    this.decisionsThisStep = 0;
    const nS = this.snakes.length, s0 = nS ? this.tick % nS : 0;
    for (let k = 0; k < nS; k++) { const s = this.snakes[(s0 + k) % nS]; if (s.alive && s.brain) s.brain.tick(s, this); }
    // 2. movement
    for (const s of this.snakes) if (s.alive) this.move(s, dt);
    // 3. hash
    this.rebuildHash();
    // 4. collisions
    this.collide();
    // 5. eat / power-ups
    for (const s of this.snakes) if (s.alive) this.eat(s, dt);
    this.updateItems(dt);
    // 6. respawn
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const q = this.respawnQueue[i];
      if (q.t <= this.t) {
        this.respawnQueue.splice(i, 1);
        const s = q.s;
        if (q.sleeper) { s.spawn(0, 0, 0, q.mass, this.t); s.layPath(s.sleeperPath!); s.sleep = true; s.protect = 0; s.brain = null; s.respawning = false; this.emit({ type: 'spawn', id: s.id }); continue; }
        const [x, y, a] = this.spawnPoint(s.isPlayer ? 450 : 300, s.isPlayer ? 160 : 120, s.isPlayer);
        s.spawn(x, y, a, q.mass, this.t); this.emit({ type: 'spawn', id: s.id });
      }
    }
    this.t += dt; this.tick++;
  }

  move(s: Snake, dt: number) {
    if (s.sleep) { s.protect = 0; return; }
    s.protect = Math.max(0, s.protect - dt); s.shield = Math.max(0, s.shield - dt);
    s.magnet = Math.max(0, s.magnet - dt); s.speedPu = Math.max(0, s.speedPu - dt);
    // boost state machine: after an automatic stop (mass < 15) the button must be released (spec §3.19-5)
    if (!s.wantBoost) { s.boost = false; s.boostLatch = false; }
    if (s.wantBoost && !s.boost && !s.boostLatch && s.mass >= PHYS.boostMinMass) s.boost = true;
    if (s.boost && s.mass < PHYS.boostStopMass) { s.boost = false; s.boostLatch = true; }
    if (s.boost) {
      const cost = Math.max(PHYS.boostCostMin, PHYS.boostCostRate * s.mass) * dt;
      s.mass -= cost; s.dropAcc += cost * PHYS.boostDropFrac; s.dropTimer += dt; s.stats.boostTime += dt;
      if (s.dropTimer >= PHYS.boostDropEvery && s.dropAcc >= 0.5) {
        const [tx, ty] = s.pt(Math.min(s.n - 1, Math.floor(s.L / PHYS.pathStep)));
        const f = this.addFood(tx + this.rng.range(-6, 6), ty + this.rng.range(-6, 6), s.dropAcc, 'trail', true, PHYS.dropLife);
        f.color = s.color;
        s.dropAcc = 0; s.dropTimer = 0;
      }
    }
    // turning
    const w = turnRate(s.mass) * (s.boost ? PHYS.boostTurnMul : 1);
    const d = angDiff(s.angle, s.target);
    s.angle += Math.sign(d) * Math.min(Math.abs(d), w * dt);
    const v = s.speed();
    let nx = s.x + Math.cos(s.angle) * v * dt, ny = s.y + Math.sin(s.angle) * v * dt;
    const r = s.r;
    const wasTouching = s.touching; s.touching = false;
    // wall slide (never lethal): project back, heading -> tangent nearest current heading
    const dist = Math.hypot(nx, ny);
    if (dist > this.R - r) {
      const k = (this.R - r) / dist; nx *= k; ny *= k;
      const tan1 = Math.atan2(ny, nx) + Math.PI / 2, tan2 = tan1 - Math.PI;
      s.angle = Math.abs(angDiff(s.angle, tan1)) < Math.abs(angDiff(s.angle, tan2)) ? tan1 : tan2;
      s.wallTouch = (s.wallTouch ?? 0) + dt; s.touching = true;
    }
    for (const o of this.obstacles) {
      const dx = nx - o.x, dy = ny - o.y, dd = Math.hypot(dx, dy);
      if (dd < o.r + r) {
        const k = (o.r + r) / (dd || 1); nx = o.x + dx * k; ny = o.y + dy * k;
        const tan1 = Math.atan2(dy, dx) + Math.PI / 2, tan2 = tan1 - Math.PI;
        s.angle = Math.abs(angDiff(s.angle, tan1)) < Math.abs(angDiff(s.angle, tan2)) ? tan1 : tan2;
        s.wallTouch = (s.wallTouch ?? 0) + dt; s.touching = true;
      }
    }
    if (s.touching && !wasTouching) s.bumps = (s.bumps ?? 0) + 1;
    // path points every pathStep
    const [lx, ly] = s.pt(0);
    let seg = Math.hypot(nx - lx, ny - ly);
    if (seg >= PHYS.pathStep) {
      let ax = lx, ay = ly;
      while (seg >= PHYS.pathStep) {
        const f = PHYS.pathStep / seg; ax += (nx - ax) * f; ay += (ny - ay) * f;
        s.pushPoint(ax, ay); seg = Math.hypot(nx - ax, ny - ay);
      }
    }
    s.x = nx; s.y = ny;
    s.stats.peak = Math.max(s.stats.peak, s.mass);
  }

  private hbuf: number[] = [];
  rebuildHash() {
    const h = this.hash; h.clear();
    const buf = this.hbuf;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      buf.length = 0; s.samples(buf);
      const r = s.r;
      for (let i = 0; i < buf.length; i += 3) h.add(buf[i], buf[i + 1], r, buf[i + 2], s.id);
    }
  }

  collide() {
    const h = this.hash; const deaths = new Map<Snake, DeathInfo>();
    const alive = this.snakes.filter((s) => s.alive);
    const headOnPairs = new Set<string>();
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      if (a.intangible || b.intangible) continue;
      if (this.cfg.team && a.team === b.team) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) {
        headOnPairs.add(`${a.id}:${b.id}`); headOnPairs.add(`${b.id}:${a.id}`);
        const big = Math.max(a.mass, b.mass);
        if (Math.abs(a.mass - b.mass) / big < PHYS.headOnTie) {
          deaths.set(a, { killer: b, tag: 'headon', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          deaths.set(b, { killer: a, tag: 'headon', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        } else {
          const [lo, hi] = a.mass < b.mass ? [a, b] : [b, a];
          deaths.set(lo, { killer: hi, tag: 'headon', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
    for (const a of alive) {
      if (a.intangible || deaths.has(a)) continue;
      const r = a.r; let hit: { killer: Snake; s: number; x: number; y: number } | null = null; let minClear = Infinity;
      h.query(a.x, a.y, r + 40, (i) => {
        const o = h.owner[i]; if (o === a.id) return false;
        const b = this.byId.get(o)!; if (b.intangible) return false;
        if (this.cfg.team && b.team === a.team) return false;
        if (headOnPairs.has(`${a.id}:${o}`)) return false;
        const d = Math.hypot(h.x[i] - a.x, h.y[i] - a.y);
        const clear = d - (r + h.r[i]);
        if (clear < minClear) minClear = clear;
        if (d < r + h.r[i] - PHYS.hitLenience) { hit = { killer: b, s: h.s[i], x: h.x[i], y: h.y[i] }; return true; }
        return false;
      });
      if (hit) { const hh = hit as { killer: Snake; s: number; x: number; y: number }; deaths.set(a, { killer: hh.killer, tag: 'body', s: hh.s, x: hh.x, y: hh.y }); }
      // near-miss bookkeeping (all snakes; the player uses it for juice)
      if (!hit) {
        if (minClear < 10) a.nearArm = true;
        else if (a.nearArm && minClear > 30) { a.nearArm = false; if (this.t - (a.lastNear ?? -9) > 1.5) { a.lastNear = this.t; a.stats.nearMiss++; this.emit({ type: 'nearmiss', id: a.id }); } }
        else if (minClear > 60) a.nearArm = false;
      }
    }
    // shields
    for (const [v, info] of [...deaths]) {
      if (v.shield > 0) {
        v.shield = 0; v.protect = PHYS.shieldGrace;
        const away = Math.atan2(v.y - info.y, v.x - info.x);
        v.angle = away; v.target = away;
        deaths.delete(v);
        v.stats.shieldSaves = (v.stats.shieldSaves ?? 0) + 1;
        this.emit({ type: 'shieldsave', id: v.id, by: info.killer.id });
      }
    }
    // crowned king (mission c5m7, spec §3.20)
    for (const [v, info] of [...deaths]) {
      if (!((v.crown ?? 0) > 0)) continue;
      const cutOnly = this.kingCharge?.gemTag === 'cut';
      const byPlayer = !!(info.killer && info.killer.isPlayer) && info.tag !== 'headon' && (!cutOnly || (info.s ?? 1e9) <= 6 * info.killer.r);
      if (byPlayer) v.crown!--;
      if (byPlayer && v.crown === 0) continue;
      v.protect = 1.0;
      const away = Math.atan2(v.y - info.y, v.x - info.x); v.angle = away; v.target = away;
      deaths.delete(v);
      if (byPlayer) this.emit({ type: 'gem', id: v.id, by: info.killer.id, left: v.crown! });
    }
    for (const [v, info] of deaths) this.kill(v, info);
  }

  kill(v: Snake, info: DeathInfo) {
    const k = info.killer;
    let tag = info.tag;
    if (tag === 'body') {
      if (enclosedBy(k, v.x, v.y)) tag = 'encircle';
      else if (info.s! <= 6 * k.r) tag = 'cut';
    }
    v.alive = false; v.deadAt = this.t; v.stats.deaths++;
    v.cause = { killer: k.id, tag, x: info.x, y: info.y, s: info.s } as Cause;
    const buf: number[] = []; v.samples(buf);
    const nS = buf.length / 3;
    const K = Math.max(PHYS.deathDropMinOrbs, Math.min(PHYS.deathDropMaxOrbs, Math.ceil(v.L / (1.6 * v.r))));
    const total = PHYS.deathDropFrac * v.mass;
    const each = total / K;
    for (let i = 0; i < K; i++) {
      const j = Math.min(nS - 1, Math.floor((i / K) * nS));
      const x = nS > 0 ? buf[j * 3] : v.x, y = nS > 0 ? buf[j * 3 + 1] : v.y;
      const jr = v.r * 0.5;
      const f = this.addFood(x + this.rng.range(-jr, jr), y + this.rng.range(-jr, jr), each, 'drop', true, PHYS.dropLife);
      f.color = v.color;
    }
    if (k && k !== v) {
      k.stats.kills++; k.stats.lifeKills++;
      k.stats.multi = this.t - k.stats.lastKillT <= 8 ? k.stats.multi + 1 : 1;
      k.stats.bestMulti = Math.max(k.stats.bestMulti, k.stats.multi);
      k.stats.bestStreak = Math.max(k.stats.bestStreak ?? 0, k.stats.lifeKills);
      k.stats.lastKillT = this.t;
      k.stats.killTags.push({ tag, victim: v.id, victimPersona: v.persona, victimMass: v.mass, killerMass: k.mass, t: this.t, victimLifeKills: v.stats.lifeKills });
    }
    this.emit({ type: 'kill', killer: k ? k.id : -1, victim: v.id, tag, victimMass: v.mass, killerMass: k ? k.mass : 0 });
    const rs = v.respawn;
    if (rs) this.respawnQueue.push({ s: v, t: this.t + rs.delay, mass: Math.max(rs.min ?? PHYS.startMass, (rs.keep ?? 0) * v.mass) });
  }

  /** another (non-sleeping) head that can also reach (x,y) this step and is closer wins (spec §3.19-1) */
  closerEater(s: Snake, x: number, y: number, extra: number, ds: number) {
    for (const t of this.snakes) {
      if (t === s || !t.alive || t.sleep) continue;
      const dt = Math.hypot(x - t.x, y - t.y);
      if (dt < t.r + PHYS.pickupBonus + extra && (dt < ds || (dt === ds && t.id < s.id))) return true;
    }
    return false;
  }

  private eaten: Food[] = [];
  eat(s: Snake, dt: number) {
    if (s.sleep) return;
    const r = s.r; const reach = r + PHYS.pickupBonus;
    const qr = s.magnet > 0 ? PHYS.magnetR : reach + 12;
    const eaten = this.eaten; eaten.length = 0;
    this.food.query(s.x, s.y, qr, (f) => {
      const d = Math.hypot(f.x - s.x, f.y - s.y);
      if (d < reach + Math.sqrt(f.v) * 2) { if (!this.closerEater(s, f.x, f.y, Math.sqrt(f.v) * 2, d)) eaten.push(f); }
      else if (s.magnet > 0 && d < PHYS.magnetR) {
        const step = Math.min(d, PHYS.magnetSpeed * dt);
        this.food.move(f, f.x + ((s.x - f.x) / d) * step, f.y + ((s.y - f.y) / d) * step);
      }
    });
    for (const f of eaten) {
      this.removeFood(f);
      s.mass += f.v; s.stats.eaten++; s.stats.eatenByKind[f.kind] = (s.stats.eatenByKind[f.kind] ?? 0) + 1;
      if (f.kind === 'drop') s.stats.dropValue = (s.stats.dropValue ?? 0) + f.v;
      if (!f.drop) this.foodQueue.push(this.t + this.rng.range(1, 3));
      if (s.isPlayer) this.emit({ type: 'eat', id: s.id, kind: f.kind, v: f.v });
      if (this.onEat) this.onEat(s, f);
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]; const dm = Math.hypot(m.x - s.x, m.y - s.y);
      if (dm < reach + 14 && !this.closerEater(s, m.x, m.y, 14, dm)) {
        this.meteors.splice(i, 1); s.mass += PHYS.meteorValue;
        s.stats.eatenByKind.meteor = (s.stats.eatenByKind.meteor ?? 0) + 1;
        this.emit({ type: 'meteor', id: s.id });
        if (this.cfg.meteors) this.meteorQueue.push(this.t + this.rng.range(...this.cfg.meteors.delay));
      }
    }
    for (let i = this.pus.length - 1; i >= 0; i--) {
      const p = this.pus[i]; const dp = Math.hypot(p.x - s.x, p.y - s.y);
      if (dp < reach + 18 && !this.closerEater(s, p.x, p.y, 18, dp)) {
        this.pus.splice(i, 1);
        if (p.kind === 'magnet') s.magnet = PU_DURATION.magnet;
        if (p.kind === 'shield') s.shield = PU_DURATION.shield;
        if (p.kind === 'speed') s.speedPu = PU_DURATION.speed;
        s.stats.pu = (s.stats.pu ?? 0) + 1;
        (s.stats.puKinds ??= {})[p.kind] = (s.stats.puKinds[p.kind] ?? 0) + 1;
        this.emit({ type: 'pu', id: s.id, kind: p.kind });
        if (this.cfg.pu) this.puQueue.push(this.t + this.rng.range(...this.cfg.pu.delay));
      }
    }
  }
  /** presentation hook: every eaten food (all snakes) → mouth-suction particles; never alters state */
  onEat: ((s: Snake, f: Food) => void) | null = null;

  updateItems(dt: number) {
    for (let i = this.foodQueue.length - 1; i >= 0; i--) if (this.foodQueue[i] <= this.t) { this.foodQueue.splice(i, 1); this.spawnNatural(); }
    if (this.tick % 30 === 0) for (const f of this.foodList) if (f.die <= this.t) this.removeFood(f);
    for (let i = this.puQueue.length - 1; i >= 0; i--) if (this.puQueue[i] <= this.t) {
      this.puQueue.splice(i, 1);
      let pt: [number, number] | null = null, fallback: [number, number] | null = null;
      for (let k = 0; k < 30 && !pt; k++) {
        const c = this.randomPoint(150);
        if (this.inObstacle(c[0], c[1], 60)) continue;
        if (this.hash.query(c[0], c[1], 80, (q) => Math.hypot(this.hash.x[q] - c[0], this.hash.y[q] - c[1]) < 80)) continue;
        if (!fallback) fallback = c;
        if (!this.snakes.some((s) => s.alive && Math.hypot(s.x - c[0], s.y - c[1]) < 300)) pt = c;
      }
      pt ??= fallback;
      if (!pt) { this.puQueue.push(this.t + 1); continue; }
      const kinds = this.cfg.pu!.kinds ?? (['magnet', 'shield', 'speed'] as PuKind[]);
      const counts = Object.fromEntries(kinds.map((k2) => [k2, this.pus.filter((p) => p.kind === k2).length])) as Record<string, number>;
      const min = Math.min(...Object.values(counts));
      const kind = this.rng.pick(kinds.filter((k2) => counts[k2] === min));
      this.pus.push({ x: pt[0], y: pt[1], kind, born: this.t });
    }
    for (let i = this.meteorQueue.length - 1; i >= 0; i--) if (this.meteorQueue[i] <= this.t) {
      this.meteorQueue.splice(i, 1);
      const [x, y] = this.randomPoint(300); const a = this.rng.range(0, Math.PI * 2);
      this.meteors.push({ x, y, vx: Math.cos(a) * PHYS.meteorSpeed, vy: Math.sin(a) * PHYS.meteorSpeed, die: this.t + 25 });
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.x += m.vx * dt; m.y += m.vy * dt;
      const d = Math.hypot(m.x, m.y);
      if (d > this.R - 20) { const nx = m.x / d, ny = m.y / d; const dot = m.vx * nx + m.vy * ny; m.vx -= 2 * dot * nx; m.vy -= 2 * dot * ny; m.x = nx * (this.R - 21); m.y = ny * (this.R - 21); }
      for (const o of this.obstacles) { const dx = m.x - o.x, dy = m.y - o.y, dd = Math.hypot(dx, dy); if (dd < o.r + 14) { const nx = dx / dd, ny = dy / dd; const dot = m.vx * nx + m.vy * ny; m.vx -= 2 * dot * nx; m.vy -= 2 * dot * ny; } }
      if (m.die <= this.t) { this.meteors.splice(i, 1); if (this.cfg.meteors) this.meteorQueue.push(this.t + this.rng.range(...this.cfg.meteors.delay)); }
    }
  }

  ranking() {
    const pend = new Map(this.respawnQueue.map((q) => [q.s, q.mass]));
    return this.snakes
      .map((s) => ({ s, score: s.alive ? s.mass : (pend.get(s) ?? 0) }))
      .sort((a, b) => b.score - a.score || b.s.stats.kills - a.s.stats.kills || b.s.stats.peak - a.s.stats.peak);
  }
}

