/**
 * AI brain (spec §3.16, §8.5) — line-by-line port of the prototype `brain.mjs` (V1b parity).
 * Utility AI over 14 + 1 candidate headings × {cruise, boost}, short-horizon forward simulation
 * against other snakes' body samples and other heads' predicted paths.
 *
 * FAIRNESS PROMISE (spec §3.16): the brain reads only public world state — positions, headings,
 * lengths, boost/shield state of snakes inside its perception; it never reads the player's finger,
 * joystick or boost button (those live on the match's input object, which the brain never sees),
 * and every snake moves under the identical physics.
 */
import ai from '../../../../content/snake-battle/ai.json';
import { TICK, PHYS, angDiff, turnRateOf, viewScaleOf, createRng, type Rng, type Snake } from './core';
import type { World, PowerUp } from './world';

export interface Tier { dec: number; P: number; H: number; alert: number; noise: number; aggr: number; boost: number; lapse: number; lazy: number; screen?: boolean }
export interface Persona { hunt: number; coil: number; scav: number; fleeAt: number; safety: number; boostBias: number; pu: number; careful?: boolean }

export const TIERS: Record<string, Tier> = { ...ai.tiers, ...ai.playerModels.tiers };
export const TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4', 'T4plus'];
export const PERSONAS: Record<string, Persona> = { ...ai.personas, ...ai.playerModels.personas };

/** 赛场热度 (spec §3.17): lerp every tier parameter except `lapse` toward the next tier — down 50 %·|h|, up 25 %·h. */
export function heatTier(tierId: string, h: number): Tier {
  if (!h) return TIERS[tierId];
  const i = TIER_ORDER.indexOf(tierId), j = Math.max(0, Math.min(TIER_ORDER.length - 1, i + Math.sign(h)));
  const A = TIERS[tierId] as unknown as Record<string, number>, B = TIERS[TIER_ORDER[j]] as unknown as Record<string, number>;
  const f = h < 0 ? 0.5 * -h : 0.25 * h, o: Record<string, number> = { ...A };
  for (const k of Object.keys(A)) if (k !== 'lapse' && typeof A[k] === 'number' && typeof B[k] === 'number') o[k] = A[k] + (B[k] - A[k]) * f;
  return o as unknown as Tier;
}
/** screen-limited player models perceive only the PORTRAIT viewport (spec §9.1) */
export const VIEW = { w: 810, h: 1080 };

const OFFSETS = [0, 0.22, -0.22, 0.5, -0.5, 0.85, -0.85, 1.25, -1.25, 1.75, -1.75, 2.35, -2.35, Math.PI];
const DT = 0.08;

interface View { cx: number; cy: number; hw: number; hh: number }
export interface GoalHook { mode?: string; G?: number[]; boost?: number; aggr?: number; filter?: (o: Snake) => boolean; orbitOk?: boolean }
interface Pred { o: Snake; v: number; pts: number[][]; r: number; unc: number }

export class Brain {
  tier: Tier; tierId: string; p: Persona; personaId: string; rng: Rng;
  goalHook: ((s: Snake, w: World, b: Brain) => GoalHook | null) | null;
  route: number[][] | null; routeI = 0;
  cool: number; lapse = 0; mode = 'forage'; goal: number[] | null = null; goalT = 0; victim: Snake | null = null; victimT = 0;
  coilSign = 1; coilT = 0; checkI: number;
  trace: { decisions: number; modes: Record<string, number> } = { decisions: 0, modes: {} };
  orbitT = 0; unstickUntil = -1; unstickA = 0; unsticks?: number;
  vw: View | null = null; wanderT?: number; wander?: number[]; spin?: number[][];
  lastBest = 0; lastDecideT = 0; hist?: string[];
  chargeState?: 'wind' | 'run' | null; chargeT = 0; chargeA = 0; chargeCD?: number;
  safetyOverride?: number;

  constructor(o: { tier: string; tierObj?: Tier; persona: string; rng?: Rng; goalHook?: Brain['goalHook']; route?: number[][] }) {
    this.tier = o.tierObj ?? TIERS[o.tier]; this.tierId = o.tier;
    this.p = PERSONAS[o.persona]; this.personaId = o.persona;
    this.rng = o.rng ?? createRng(1);
    this.goalHook = o.goalHook ?? null;
    this.route = o.route ?? null;
    this.cool = this.rng.range(0, this.tier.dec);
    this.checkI = this.rng.int(0, 2);
  }

  view(s: Snake): View | null {
    if (!this.tier.screen) return null;
    const vs = viewScaleOf(s.mass), z = 1.25 / vs;
    return { cx: s.x + Math.cos(s.angle) * 60 * vs, cy: s.y + Math.sin(s.angle) * 60 * vs, hw: VIEW.w / 2 / z, hh: VIEW.h / 2 / z };
  }
  static inView(v: View | null, x: number, y: number) { return !v || (Math.abs(x - v.cx) <= v.hw && Math.abs(y - v.cy) <= v.hh); }

  perception(s: Snake) { return this.tier.screen ? this.tier.P * viewScaleOf(s.mass) : this.tier.P; }

  /** 蛇王冲锋 (mission c5m7, spec §3.20) */
  kingCharge(s: Snake, w: World) {
    const K = w.kingCharge; if (!K || this.personaId !== 'king') return false;
    if (this.chargeState === 'wind') {
      this.chargeT -= TICK; s.target = this.chargeA; s.wantBoost = false;
      if (this.chargeT <= 0) { this.chargeState = 'run'; this.chargeT = K.run; w.emit({ type: 'king-charge', id: s.id }); }
      return true;
    }
    if (this.chargeState === 'run') {
      this.chargeT -= TICK; s.target = this.chargeA; s.wantBoost = true;
      if (this.chargeT <= 0) { this.chargeState = null; s.wantBoost = false; this.chargeCD = this.rng.range(...((K.phase3 ? K.cd3 : K.cd) as [number, number])); this.cool = 0; }
      return true;
    }
    this.chargeCD = (this.chargeCD ?? K.first) - TICK;
    if (this.chargeCD! > 0 || s.intangible) return false;
    const pl = w.snakes.find((o) => o.isPlayer && o.alive && !o.intangible);
    if (!pl || Math.hypot(pl.x - s.x, pl.y - s.y) > 650) return false;
    const dist = Math.hypot(pl.x - s.x, pl.y - s.y);
    const lead = K.aim === 'intercept' ? (K.leadMul ?? 1) * pl.speed() * (K.wind + dist / (PHYS.baseSpeed * PHYS.boostMul)) : 0.8 * pl.speed();
    this.chargeA = Math.atan2(pl.y + Math.sin(pl.angle) * lead - s.y, pl.x + Math.cos(pl.angle) * lead - s.x);
    this.chargeState = 'wind'; this.chargeT = K.wind; s.target = this.chargeA; s.wantBoost = false;
    w.emit({ type: 'king-windup', id: s.id });
    return true;
  }

  tick(s: Snake, w: World) {
    if (this.kingCharge(s, w)) return;
    if (this.lapse > 0) this.lapse -= TICK;
    else if (this.tier.lapse > 0 && this.rng.chance(this.tier.lapse * TICK)) this.lapse = 0.6;
    this.cool -= TICK;
    let urgent = false;
    if (this.cool > 0 && this.lapse <= 0 && (++this.checkI % 2 === 0) && this.rng.chance(this.tier.alert)) urgent = this.imminent(s, w);
    if (this.cool <= 0 || urgent) {
      if (!s.isPlayer) { if ((w.decisionsThisStep ?? 0) >= (w.decisionCap ?? 6)) return; w.decisionsThisStep = (w.decisionsThisStep ?? 0) + 1; }
      this.decide(s, w);
      this.cool = this.tier.dec * this.rng.range(0.85, 1.15);
    }
  }

  imminent(s: Snake, w: World) {
    const v = s.speed(), r = s.r, h = w.hash, vw = this.view(s);
    for (let k = 1; k <= 4; k++) {
      const d = (v * 0.45 * k) / 4;
      const x = s.x + Math.cos(s.angle) * d, y = s.y + Math.sin(s.angle) * d;
      const hit = h.query(x, y, r + 34, (i) => {
        if (h.owner[i] === s.id) return false;
        const o = w.byId.get(h.owner[i])!; if (o.intangible || (w.cfg.team && o.team === s.team)) return false;
        if (vw && !Brain.inView(vw, h.x[i], h.y[i])) return false;
        return Math.hypot(h.x[i] - x, h.y[i] - y) < r + h.r[i] + 4;
      });
      if (hit) return true;
    }
    return false;
  }

  decide(s: Snake, w: World) {
    this.trace.decisions++;
    const P = this.perception(s), T = this.tier, p = this.p, vw = this.view(s);
    this.vw = vw;
    const heads: Snake[] = [];
    let threat = 0; const hunters: Snake[] = [];
    for (const o of w.snakes) {
      if (o === s || !o.alive || o.intangible) continue;
      if (w.cfg.team && o.team === s.team) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (vw ? !Brain.inView(vw, o.x, o.y) : d > P + 150) continue;
      heads.push(o);
      const toMe = Math.atan2(s.y - o.y, s.x - o.x);
      const facing = Math.cos(angDiff(o.angle, toMe));
      if (!o.sleep && d < 320 && facing > 0.5 && o.mass > 0.5 * s.mass) threat += (1 - d / 320) * (o.boost ? 1.6 : 1) * Math.min(2, o.mass / Math.max(s.mass, 1));
      if (d < 380 && (o.persona === 'hunter' || o.persona === 'king' || o.isPlayer)) hunters.push(o);
    }
    let G: number[] | null = null, boostPref = 0, cutW = 0, mode = 'forage';
    const hook = this.goalHook ? this.goalHook(s, w, this) : null;
    const aggr = hook?.mode === 'race-lead' ? 0 : hook?.aggr !== undefined ? hook.aggr : p.hunt * (T.aggr || 0);
    if (this.route) {
      mode = 'patrol'; const wp = this.route[this.routeI % this.route.length];
      if (Math.hypot(wp[0] - s.x, wp[1] - s.y) < 80) this.routeI++;
      const wp2 = this.route[this.routeI % this.route.length]; G = wp2;
    } else if (hook && hook.mode === 'goal' && !(threat > p.fleeAt * 1.3 && this.lapse <= 0)) {
      mode = 'goal'; G = hook.G!; boostPref = hook.boost ?? 0;
    } else if (threat > p.fleeAt && this.lapse <= 0) {
      mode = 'flee'; G = this.freeDirection(s, w, heads); boostPref = (threat > p.fleeAt * 1.6 && s.mass > 30) ? T.boost * p.boostBias : 0;
    } else if ((hook && hook.mode === 'defend') || (s.mass >= 250 && hunters.length >= 2 && (p.coil > 0 || p.safety > 1))) {
      mode = 'defend';
      const ta = s.angle + this.coilSign * 1.35; G = [s.x + Math.cos(ta) * 200, s.y + Math.sin(ta) * 200];
    } else {
      const huntAggr = hook && hook.mode === 'hunt' ? 1 : aggr;
      const coilAggr = hook && hook.mode === 'coil' ? 1 : hook?.mode === 'race-lead' ? 0 : p.coil * (T.aggr || 0);
      const filter = hook && hook.filter ? hook.filter : () => true;
      let picked = false;
      if (coilAggr > 0 && (hook?.mode === 'coil' || this.rng.chance(Math.min(1, coilAggr * 1.5)))) {
        const v = this.pickCoilVictim(s, heads, filter, hook?.mode === 'coil');
        if (v) {
          if (this.victim !== v) { this.victim = v; this.coilT = 0; this.coilSign = Math.sign(angDiff(Math.atan2(s.y - v.y, s.x - v.x), s.angle)) || 1; }
          this.coilT += T.dec;
          const ang = Math.atan2(s.y - v.y, s.x - v.x);
          const vExt = v.sleep ? 70 : Math.min(160, v.L / (2 * Math.PI));
          const rMin = vExt + s.r + v.r + 12, rMax = Math.max(rMin, (s.L / (2 * Math.PI)) * 0.8);
          const rho = Math.max(rMin, Math.min(rMax, rMin + 120) * Math.max(0.6, 1 - 0.1 * this.coilT));
          const ga = ang + this.coilSign * 0.9;
          G = [v.x + Math.cos(ga) * rho, v.y + Math.sin(ga) * rho]; mode = 'coil'; picked = true;
        }
      }
      if (!picked && huntAggr > 0 && (hook?.mode === 'hunt' || this.victim && this.victimT > 0 || this.rng.chance(Math.min(1, huntAggr)))) {
        const v = this.pickVictim(s, heads, filter, hook?.mode === 'hunt');
        if (v) {
          if (this.victim !== v) { this.victim = v; this.victimT = 2.0; }
          this.victimT -= T.dec;
          const vv = v.speed();
          const dist = Math.hypot(v.x - s.x, v.y - s.y);
          const tau = Math.min(1.2, Math.max(0.3, dist / Math.max(60, s.speed() * 1.4 - vv * 0.5)));
          const lead = vv * tau + 2.5 * v.r;
          G = [v.x + Math.cos(v.angle) * lead, v.y + Math.sin(v.angle) * lead];
          const rel = [s.x - v.x, s.y - v.y];
          const along = rel[0] * Math.cos(v.angle) + rel[1] * Math.sin(v.angle);
          if (along < 2 * v.r && dist < 420 && s.mass >= 40) boostPref = T.boost * p.boostBias;
          cutW = hook?.mode === 'hunt' ? 1 : Math.max(0.3, huntAggr);
          mode = 'hunt'; picked = true;
        } else { this.victim = null; this.victimT = 0; }
      }
      if (!picked && (hook?.mode === 'hunt' || hook?.mode === 'coil') && hook.filter) {
        let best: Snake | null = null, bd = Infinity;
        for (const o of w.snakes) if (o !== s && o.alive && !o.intangible && hook.filter(o)) { const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < bd) { bd = d; best = o; } }
        if (best && !heads.includes(best)) { G = [best.x, best.y]; mode = 'seek'; picked = true; }
      }
      if (!picked) {
        const pu = p.pu > 0 ? this.nearPu(s, w, 380, vw) : null;
        if (pu && threat < 0.5) { G = [pu.x, pu.y]; mode = 'pu'; }
        else {
          const m = w.meteors.find((mt) => (vw ? Brain.inView(vw, mt.x, mt.y) : Math.hypot(mt.x - s.x, mt.y - s.y) < P * 0.8));
          if (m && p.scav > 0.5 && this.rng.chance(0.6)) { G = [m.x + m.vx * 0.6, m.y + m.vy * 0.6]; mode = 'meteor'; boostPref = s.mass > 30 ? T.boost * p.boostBias * 0.8 : 0; }
          else {
            if (T.lazy > 0 && (this.wanderT ?? 0) <= 0 && this.rng.chance(T.lazy)) { this.wanderT = 2.0; const a2 = this.rng.range(0, Math.PI * 2), d2 = this.rng.range(200, 500); this.wander = [s.x + Math.cos(a2) * d2, s.y + Math.sin(a2) * d2]; }
            if ((this.wanderT ?? 0) > 0) { this.wanderT! -= T.dec; G = this.wander!; mode = 'wander'; }
            else {
              const best = this.bestFood(s, w, P, heads, hook?.mode === 'forage-safe');
              G = best.G; mode = best.drop ? 'scav' : 'forage';
              if (best.drop && best.value > 12 && s.mass > 40 && best.contested) boostPref = T.boost * p.boostBias * 0.7;
            }
          }
        }
      }
      if (hook && hook.mode === 'race-lead') { boostPref = 0; }
    }
    // orbit-lock fix (spec §3.16-4)
    if (G && mode !== 'defend' && mode !== 'coil' && mode !== 'flee' && mode !== 'patrol' && !hook?.orbitOk) {
      const rho = PHYS.baseSpeed / turnRateOf(s.mass);
      const dG = Math.hypot(G[0] - s.x, G[1] - s.y), bear = Math.abs(angDiff(s.angle, Math.atan2(G[1] - s.y, G[0] - s.x)));
      if (dG < 2 * rho + s.r && bear > 1.0) this.orbitT += T.dec; else this.orbitT = 0;
      if (this.orbitT >= 1.0) { this.unstickUntil = w.t + 2; this.unstickA = s.angle; this.orbitT = 0; this.unsticks = (this.unsticks ?? 0) + 1; }
    }
    // spin detector (spec §3.16-5)
    (this.spin ??= []).push([w.t, s.x, s.y, s.angle]);
    while (this.spin.length > 1 && w.t - this.spin[0][0] > 3) this.spin.shift();
    if (mode !== 'defend' && mode !== 'coil' && mode !== 'flee' && mode !== 'patrol' && !hook?.orbitOk && w.t >= this.unstickUntil && this.spin.length > 4) {
      let turn = 0; for (let j = 1; j < this.spin.length; j++) turn += angDiff(this.spin[j - 1][3], this.spin[j][3]);
      const net = Math.hypot(s.x - this.spin[0][1], s.y - this.spin[0][2]);
      if (Math.abs(turn) >= 3 * Math.PI && net < 250) { this.unstickUntil = w.t + 2.5; this.unstickA = s.angle; this.spin.length = 0; this.unsticks = (this.unsticks ?? 0) + 1; }
    }
    if (w.t < this.unstickUntil && mode !== 'flee' && mode !== 'defend') { G = [s.x + Math.cos(this.unstickA) * 400, s.y + Math.sin(this.unstickA) * 400]; mode = 'unstick'; }
    this.mode = mode; this.trace.modes[mode] = (this.trace.modes[mode] ?? 0) + 1;
    const H = T.H;
    const steps = Math.max(2, Math.round(H / DT));
    const pred: Pred[] = heads.map((o) => {
      const v = o.speed(); const pts: number[][] = [];
      for (let j = 0; j <= steps; j++) pts.push([o.x + Math.cos(o.angle) * v * j * DT, o.y + Math.sin(o.angle) * v * j * DT]);
      const hunterLike = o.persona === 'hunter' || o.persona === 'king' || o.persona === 'daredevil' || o.isPlayer;
      return { o, v, pts, r: o.r, unc: (o.boost ? 0.32 : 0.18) * (hunterLike && Math.hypot(o.x - s.x, o.y - s.y) < 300 ? 1.6 : 1) };
    });
    const canBoost = s.mass >= PHYS.boostMinMass + 4 && boostPref > 0 && this.rng.chance(Math.min(1, boostPref));
    let best = -Infinity, bestA = s.angle, bestB = false;
    const goalA = G ? Math.atan2(G[1] - s.y, G[0] - s.x) : null;
    const cands = OFFSETS.map((o) => s.angle + o);
    if (goalA !== null) cands.push(goalA);
    for (const a of cands) {
      for (const b of canBoost ? [false, true] : [false]) {
        const sc = this.evaluate(s, w, a, b, G, pred, steps, cutW, mode);
        if (sc > best) { best = sc; bestA = a; bestB = b; }
      }
    }
    this.lastBest = best; this.lastDecideT = w.t;
    const noise = this.lapse > 0 ? T.noise * 1.5 : T.noise;
    s.target = bestA + this.rng.gauss() * noise;
    s.wantBoost = bestB;
  }

  evaluate(s: Snake, w: World, theta: number, boost: boolean, G: number[] | null, pred: Pred[], steps: number, cutW: number, mode: string) {
    const p = this.safetyOverride ? { ...this.p, safety: this.p.safety * this.safetyOverride } : this.p, h = w.hash;
    const v = boost ? PHYS.baseSpeed * PHYS.boostMul : s.speedPu > 0 ? PHYS.baseSpeed * PHYS.speedPuMul : PHYS.baseSpeed;
    const wt = turnRateOf(s.mass) * (boost ? PHYS.boostTurnMul : 1);
    const r = s.r;
    let x = s.x, y = s.y, a = s.angle;
    let hitT = -1, minClear = 200, food = 0, wall = 0, cut = 0, risky = 0;
    const ignoreDanger = this.lapse > 0;
    const seen = new Set<number>();
    const vw = this.vw;
    const bodyHit = (px: number, py: number, pad: number) => h.query(px, py, r + 40, (k) => {
      if (h.owner[k] === s.id) return false;
      const o = w.byId.get(h.owner[k])!; if (o.intangible || (w.cfg.team && o.team === s.team)) return false;
      if (vw && !Brain.inView(vw, h.x[k], h.y[k])) return false;
      const c = Math.hypot(h.x[k] - px, h.y[k] - py) - r - h.r[k];
      if (c < minClear) minClear = c;
      return c < pad;
    });
    for (let i = 1; i <= steps && hitT < 0; i++) {
      const da = angDiff(a, theta); a += Math.sign(da) * Math.min(Math.abs(da), wt * DT);
      x += Math.cos(a) * v * DT; y += Math.sin(a) * v * DT;
      const dc = Math.hypot(x, y);
      if (dc > w.R - r - 15) { wall += 1; const k = (w.R - r - 15) / dc; x *= k; y *= k; }
      for (const o of w.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + r + 10) wall += 1;
      if (!ignoreDanger) {
        if (bodyHit(x, y, 3)) { hitT = i * DT; break; }
        for (const pr of pred) {
          const rr = r + pr.r;
          for (let j = 0; j <= steps; j++) {
            const q = pr.pts[j]; const d = Math.hypot(q[0] - x, q[1] - y);
            const unc = j * DT * pr.v * pr.unc;
            if (j < i - 1 && d < rr + unc) { hitT = i * DT; break; }
            if (j >= i - 1 && j <= i + 1 && d < rr + unc + 14) {
              if (pr.o.mass >= s.mass * 0.95) { hitT = i * DT; break; } else risky += 1;
            }
            if (j >= i + 2 && d < rr + 6) cut += Math.sqrt(pr.o.mass) / (j - i);
          }
          if (hitT >= 0) break;
        }
      }
      const c = w.food.cellOf(x, y);
      if (!seen.has(c)) { seen.add(c); food += w.food.value[c] + w.food.dropValue[c] * (p.scav - 1 > 0 ? p.scav - 1 : 0); }
    }
    let score = 0;
    if (hitT >= 0) score -= 1000 + 2000 * (1 - hitT / (steps * DT));
    else if (!ignoreDanger) {
      let blocked = 0;
      for (const dd of [r + 20, r + 50, r + 90]) if (bodyHit(x + Math.cos(a) * dd, y + Math.sin(a) * dd, 0)) blocked++;
      score -= blocked * 160 * p.safety;
    }
    score -= Math.max(0, 60 - minClear) * 1.0 * p.safety;
    score -= risky * 25 * p.safety;
    if (G) {
      const d0 = Math.hypot(G[0] - s.x, G[1] - s.y), d1 = Math.hypot(G[0] - x, G[1] - y);
      const gw = mode === 'goal' ? 70 : mode === 'flee' ? 55 : mode === 'hunt' || mode === 'coil' ? 60 : 40;
      score += (gw * (d0 - d1)) / (PHYS.baseSpeed * steps * DT);
    }
    score += Math.min(food, 60) * (mode === 'forage' || mode === 'scav' ? 0.5 : 0.15);
    score -= wall * 6;
    score += Math.min(cut, 12) * cutW * 8;
    if (boost) score -= 6;
    score += 3 * Math.cos(angDiff(theta, s.target));
    return score;
  }

  freeDirection(s: Snake, w: World, heads: Snake[]) {
    let best = -Infinity, bestA = s.angle;
    for (let k = 0; k < 12; k++) {
      const a = s.angle + (k * Math.PI * 2) / 12;
      let free = 450;
      for (let d = 40; d <= 450; d += 40) {
        const x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
        if (Math.hypot(x, y) > w.R - 40) { free = d; break; }
        const blocked = w.hash.query(x, y, s.r + 30, (i) => w.hash.owner[i] !== s.id && Brain.inView(this.vw, w.hash.x[i], w.hash.y[i]) && Math.hypot(w.hash.x[i] - x, w.hash.y[i] - y) < s.r + w.hash.r[i] + 10);
        if (blocked) { free = d; break; }
      }
      let away = 0;
      for (const o of heads) away += Math.cos(angDiff(a, Math.atan2(s.y - o.y, s.x - o.x))) * (o.mass > s.mass * 0.5 ? 1 : 0.3);
      const center = Math.cos(angDiff(a, Math.atan2(-s.y, -s.x))) * (Math.hypot(s.x, s.y) / w.R);
      const turnCost = Math.abs(angDiff(s.angle, a)) * 20;
      const sc = free + away * 40 + center * 60 - turnCost;
      if (sc > best) { best = sc; bestA = a; }
    }
    return [s.x + Math.cos(bestA) * 400, s.y + Math.sin(bestA) * 400];
  }

  pickVictim(s: Snake, heads: Snake[], filter: (o: Snake) => boolean, forced: boolean) {
    let best: Snake | null = null, bestS = 0;
    const maxRatio = this.tierId === 'T4' || this.tierId === 'T3' || this.tierId === 'EXPERT' ? 6 : 3;
    for (const o of heads) {
      if (!filter(o)) continue;
      if (!forced && o.mass > s.mass * maxRatio) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y); if (d > (forced ? 900 : 520)) continue;
      const along = (s.x - o.x) * Math.cos(o.angle) + (s.y - o.y) * Math.sin(o.angle);
      if (!forced && along < -220) continue;
      if (!forced && this.p.careful) {
        if (o.mass > s.mass * 1.5) continue;
        const ix = o.x + Math.cos(o.angle) * 150, iy = o.y + Math.sin(o.angle) * 150;
        if (heads.some((q) => q !== o && q.mass > s.mass * 0.6 && Math.hypot(q.x - ix, q.y - iy) < 260)) continue;
      }
      const sc = (Math.sqrt(o.mass) / (d + 150)) * (along > 0 ? 1.5 : 1);
      if (sc > bestS) { bestS = sc; best = o; }
    }
    return best;
  }

  pickCoilVictim(s: Snake, heads: Snake[], filter: (o: Snake) => boolean, forced: boolean) {
    let best: Snake | null = null, bestD = Infinity;
    for (const o of heads) {
      if (!filter(o)) continue;
      if (o.mass * (forced ? 1.8 : 2.5) > s.mass) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y); if (d > (forced ? 900 : 450)) continue;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  nearPu(s: Snake, w: World, R: number, vw: View | null = null): PowerUp | null {
    let best: PowerUp | null = null, bd = R;
    for (const p of w.pus) { if (vw && !Brain.inView(vw, p.x, p.y)) continue; const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  bestFood(s: Snake, w: World, P: number, heads: Snake[], safe: boolean) {
    const f = w.food, c = f.cell, off = f.off;
    const x0 = Math.max(0, Math.floor((s.x - P + off) / c)), x1 = Math.min(f.dim - 1, Math.floor((s.x + P + off) / c));
    const y0 = Math.max(0, Math.floor((s.y - P + off) / c)), y1 = Math.min(f.dim - 1, Math.floor((s.y + P + off) / c));
    let best = -1, G: number[] | null = null, drop = false, value = 0, contested = false;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const i = cy * f.dim + cx; const val = f.value[i] + f.dropValue[i] * (this.p.scav - 1);
      if (val <= 0.5) continue;
      const gx = cx * c - off + c / 2, gy = cy * c - off + c / 2;
      const d = Math.hypot(gx - s.x, gy - s.y); if (this.vw ? !Brain.inView(this.vw, gx, gy) : d > P) continue;
      let risk = 0, rivals = 0;
      for (const o of heads) {
        const dd = Math.hypot(o.x - gx, o.y - gy);
        if (dd < 260) { rivals++; if (o.mass > s.mass * 0.7) risk += (1 - dd / 260) * (safe ? 2.5 : 1.2) * this.p.safety; }
      }
      const behind = Math.cos(angDiff(s.angle, Math.atan2(gy - s.y, gx - s.x))) < -0.3 ? 0.6 : 1;
      const sc = (val / (d + 120)) * Math.exp(-risk) * behind;
      if (sc > best) { best = sc; G = [gx, gy]; drop = f.dropValue[i] > 3; value = val; contested = rivals > 0; }
    }
    if (!G) G = [s.x * 0.5, s.y * 0.5];
    if (this.goal && this.goalT > 0 && this.mode !== 'flee') { this.goalT -= this.tier.dec; const pg = this.goal; const i = f.cellOf(pg[0], pg[1]); if (f.value[i] > 0.5) return { G: pg, drop, value, contested }; }
    this.goal = G; this.goalT = 0.8;
    return { G, drop, value, contested };
  }
}
