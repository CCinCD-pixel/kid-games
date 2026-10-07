/**
 * A match (spec §8.3 createMatch, §8.8 MATCH state machine): wraps the deterministic World with the
 * fixed-step accumulator (≤3 steps per frame, the rest is dropped — slow-mo, never a spiral), the
 * player's input, the timed/endless rules (§3.12–3.13), juice triggers (§3.15) and the per-match stats
 * that feed the save (§3.22). Presentation listens through `onEvent`; the sim never knows about it.
 */
import { TICK, viewScaleOf, type Snake, type KillTag } from './sim/core';
import type { World, SimEvent } from './sim/world';
import { VENUES, MATCH_SEC, setupTimed, setupEndless, rosterColors, AI_NAMES, type VenueId } from './sim/venues';
import { MissionRun, CHAPTER_FLOOR, aiCountOf, type Mission, type MissionResult } from './sim/mission';

export type Mode = 'timed' | 'endless' | 'mission';
export type MatchState = 'countdown' | 'playing' | 'dying' | 'dead' | 'ending' | 'over' | 'paused';

export type MatchEvent =
  | { kind: 'sim'; e: SimEvent }
  | { kind: 'milestone'; n: number }
  | { kind: 'rank1' }
  | { kind: 'last10' }
  | { kind: 'wall' }
  | { kind: 'boost'; on: boolean }
  | { kind: 'boostReady' }
  | { kind: 'countdown'; n: number }
  | { kind: 'go' }
  | { kind: 'died'; cause: { tag: KillTag; killer: Snake | null } }
  | { kind: 'card' }
  | { kind: 'respawned' }
  | { kind: 'ending' }
  | { kind: 'over' }
  | { kind: 'endlessNudge' }
  | { kind: 'mission'; n: Parameters<MissionRun['onNote']>[0] }
  | { kind: 'missionDone'; ok: boolean };

export interface MatchCounters {
  kills: number; cut: number; enc: number; headon: number; meteors: number; speedPu: number; shieldSaves: number; near: number; boostSec: number;
  multiMax: number; streakMax: number; peakGrown: number; eaten: number; playSec: number;
}
export const zeroCounters = (): MatchCounters => ({ kills: 0, cut: 0, enc: 0, headon: 0, meteors: 0, speedPu: 0, shieldSaves: 0, near: 0, boostSec: 0, multiMax: 0, streakMax: 0, peakGrown: 0, eaten: 0, playSec: 0 });

export interface MatchResult { mission?: MissionResult; mode: Mode; venue: VenueId; rank: number; of: number; peak: number; mass: number; kills: number; cut: number; enc: number; multiMax: number; eaten: number; lifeSec: number; counters: MatchCounters; banked: boolean; podium: { s: Snake; score: number }[] }

const MILESTONES = [100, 200, 300, 500, 800, 1000, 1500, 2000];

export class Match {
  world: World; me: Snake; mode: Mode; venue: VenueId; seed: number;
  /** 挑战关 attempt (mode 'mission'); the floor look and arena radius for the renderer */
  run: MissionRun | null = null; floor: string; arenaR: number;
  /** the bot drives him (H3 领航员示范 / H2 看一招) */
  demo = false;
  /** first run (c1m1): the sim waits for his first touch (spec §2.6) */
  waitTouch = false;
  state: MatchState = 'countdown';
  /** state to return to after a pause */
  private resumeTo: MatchState = 'playing';
  input = { target: null as number | null, boost: false };
  alpha = 1;
  prevX: Float32Array; prevY: Float32Array; prevA: Float32Array;
  private acc = 0;
  private cdT = 0; private cdN = 3; private stateT = 0;
  timeScale = 1;
  onEvent: (e: MatchEvent) => void = () => {};
  private rankCache: { s: Snake; score: number }[] = [];
  private rankTick = -99;
  private milestoneHit = new Set<number>();
  private rank1Done = false; private last10Done = false; private wallSaid = false; private boostReadySaid = false; private nudgeDone = false;
  private wasBoost = false;
  lastDeath: { tag: KillTag; killer: Snake | null; x: number; y: number; t: number } | null = null;
  respawnAt = 0;
  banked = false;
  /** world seconds when he was last alive-spawned (endless: life length) */
  lifeStart = 0;
  realT = 0;

  constructor(o: { mode: Mode; venue: VenueId; seed: number; heat?: number; name: string; skin: string; avoidColors?: string[]; stress?: number; countdown?: boolean; mission?: Mission; twin?: boolean; demo?: { tier: string; persona: string }; waitTouch?: boolean }) {
    this.mode = o.mode; this.venue = o.venue; this.seed = o.seed;
    const v = VENUES[o.venue];
    this.floor = o.venue; this.arenaR = v.R;
    if (o.mode === 'mission' && o.mission) {
      const ms = o.mission;
      // presentation-only colours (separate rng stream): every AI a distinct colour + persona name
      const personas = ms.ai.flatMap((e) => Array.from({ length: e.n ?? 1 }, () => (e.persona === 'sleeper' ? 'skittish' : e.persona)));
      const cols = rosterColors([...personas, 'hunter', 'hunter', 'forager', 'forager', 'forager'], o.seed, o.avoidColors);
      const run = new MissionRun(ms, o.seed, { twin: o.twin, name: o.name, skin: o.skin, colors: cols, bot: o.demo });
      run.guardColors = cols.slice(personas.length, personas.length + 2); run.bigColors = cols.slice(personas.length + 2);
      const n = aiCountOf(ms);
      for (const s of run.w.snakes) if (!s.isPlayer) s.name = MissionNames.of(s, n);
      // snakes the script adds mid-level (蛇王 guards, c5m1 big swim-ins) get display names too (QA r2)
      run.onNote = (n) => { if (n.kind === 'phase2' || n.kind === 'bigSwimIn') this.nameLate(); this.onEvent({ kind: 'mission', n }); };
      this.run = run; this.world = run.w; this.me = run.me;
      this.floor = CHAPTER_FLOOR[ms.ch - 1]; this.arenaR = ms.arena.R;
      this.demo = !!o.demo; this.waitTouch = !!o.waitTouch;
    } else {
      const extra = o.stress && o.stress > 22 ? ['hunter', 'forager', 'daredevil'].slice(0, o.stress - 22) : [];
      const setup = o.mode === 'timed'
        ? setupTimed(v, o.seed, { heat: o.heat, name: o.name, skin: o.skin, avoidColors: o.avoidColors, extraAi: extra })
        : setupEndless(v, o.seed, { name: o.name, skin: o.skin, avoidColors: o.avoidColors });
      this.world = setup.world; this.me = setup.me;
    }
    this.world.keepEvents = false;
    const n = this.world.snakes.length + 4;
    this.prevX = new Float32Array(n); this.prevY = new Float32Array(n); this.prevA = new Float32Array(n);
    this.snapPrev();
    // a level that starts him long (5-x, twins) never celebrates a length he was given (QA r4 contact sheet)
    for (const n of MILESTONES) if (this.me.mass >= n) this.milestoneHit.add(n);
    if (o.countdown === false) this.state = 'playing';
    this.cdT = 0; this.cdN = 3;
  }

  /** any non-player snake still carrying an internal id ('guard0', 'big1') gets its display name */
  nameLate() {
    if (!this.run) return;
    const n = aiCountOf(this.run.m);
    for (const s of this.world.snakes) if (!s.isPlayer && /^[a-z]+\d*$/.test(s.name)) s.name = MissionNames.of(s, n);
  }

  get timeLeft() { return Math.max(0, (this.run ? this.run.m.capSec : MATCH_SEC) - this.world.t); }
  /** 挑战关 race levels show the timer pill + the objective bar under it (spec §2.3) */
  get isRace() { return this.run?.m.objective.type === 'race'; }

  ranking() {
    if (this.world.tick - this.rankTick >= 15) { this.rankCache = this.world.ranking(); this.rankTick = this.world.tick; }
    return this.rankCache;
  }
  rankOf(s: Snake) { return this.ranking().findIndex((r) => r.s === s) + 1; }

  private snapPrev() {
    const ss = this.world.snakes;
    for (let i = 0; i < ss.length; i++) { this.prevX[i] = ss[i].x; this.prevY[i] = ss[i].y; this.prevA[i] = ss[i].angle; }
  }

  pause() { if (this.state === 'paused' || this.state === 'over') return; this.resumeTo = this.state === 'countdown' ? 'playing' : this.state; this.state = 'paused'; }
  /** resume through a fresh 3-2-1 (spec §3.18) */
  resume(withCountdown = true) {
    if (this.state !== 'paused') return;
    if (withCountdown && this.resumeTo === 'playing') { this.state = 'countdown'; this.cdT = 0; this.cdN = 3; }
    else this.state = this.resumeTo;
  }
  bank() { this.banked = true; this.finish(); }

  /** advance by real seconds; returns the interpolation alpha */
  update(realDt: number) {
    realDt = Math.min(realDt, 0.1);
    this.realT += realDt;
    switch (this.state) {
      case 'paused': case 'over': return this.alpha;
      case 'countdown': {
        if (this.cdT === 0 && this.cdN === 3) this.onEvent({ kind: 'countdown', n: 3 });
        this.cdT += realDt;
        if (this.cdT >= 0.5) {
          this.cdT -= 0.5; this.cdN--;
          if (this.cdN > 0) this.onEvent({ kind: 'countdown', n: this.cdN });
          else { this.state = 'playing'; this.onEvent({ kind: 'go' }); }
        }
        return this.alpha;
      }
      case 'ending': {
        this.stateT += realDt;
        if (this.stateT >= 0.5) this.finish();
        return this.alpha;
      }
      case 'dying': {
        this.stateT += realDt;
        this.timeScale = 0.25;
        if (this.stateT >= 0.7) {
          this.timeScale = 1;
          if (this.mode === 'endless') { this.state = 'dead'; this.onEvent({ kind: 'card' }); this.finish(); return this.alpha; }
          if (this.run?.done) { this.state = 'dead'; this.finish(); return this.alpha; }
          this.state = 'dead'; this.onEvent({ kind: 'card' });
        }
        break;
      }
    }
    // playing / dying / dead: run the sim
    this.acc += realDt * this.timeScale;
    let steps = 0;
    while (this.acc >= TICK && steps < 3) {
      this.acc -= TICK; steps++;
      this.snapPrev();
      this.applyInput();
      if (this.waitTouch) { if (this.input.target === null) { this.acc = 0; break; } this.waitTouch = false; }
      if (this.run) this.run.step(); else this.world.step();
      this.afterStep();
      const st = this.state as MatchState; if (st === 'over' || st === 'ending' || st === 'paused') break;
    }
    if (steps === 3 && this.acc > TICK) this.acc = 0;   // drop time, never spiral
    this.alpha = Math.min(1, this.acc / TICK);
    return this.alpha;
  }

  private applyInput() {
    const me = this.me;
    if (!me.alive || this.demo) return;
    if (this.input.target !== null) me.target = this.input.target;
    me.wantBoost = this.input.boost;
  }

  private afterStep() {
    const w = this.world, me = this.me;
    w.drainEvents((e) => {
      if (e.type === 'kill' && e.victim === me.id) {
        const killer = e.killer >= 0 ? w.byId.get(e.killer) ?? null : null;
        this.lastDeath = { tag: e.tag, killer, x: me.cause?.x ?? me.x, y: me.cause?.y ?? me.y, t: w.t };
        this.respawnAt = w.t + (me.respawn?.delay ?? 0);
        this.onEvent({ kind: 'sim', e });
        this.onEvent({ kind: 'died', cause: { tag: e.tag, killer } });
        this.state = 'dying'; this.stateT = 0;
        return;
      }
      if (e.type === 'spawn' && e.id === me.id) { this.lifeStart = w.t; if (this.state === 'dead' || this.state === 'dying') { this.state = 'playing'; this.timeScale = 1; } this.onEvent({ kind: 'sim', e }); this.onEvent({ kind: 'respawned' }); return; }
      this.onEvent({ kind: 'sim', e });
    });
    if (me.alive) {
      // milestones (once per match per step, spec §3.15)
      for (const n of MILESTONES) if (me.mass >= n && !this.milestoneHit.has(n)) { this.milestoneHit.add(n); this.onEvent({ kind: 'milestone', n }); }
      if (me.touching && !this.wallSaid) { this.wallSaid = true; this.onEvent({ kind: 'wall' }); }
      if (me.boost !== this.wasBoost) { this.wasBoost = me.boost; this.onEvent({ kind: 'boost', on: me.boost }); }
      if (!this.boostReadySaid && me.mass >= 30) { this.boostReadySaid = true; this.onEvent({ kind: 'boostReady' }); }
    }
    if (this.mode === 'timed') {
      if (!this.rank1Done && w.tick % 15 === 0 && me.alive && this.rankOf(me) === 1 && w.t > 5) { this.rank1Done = true; this.onEvent({ kind: 'rank1' }); }
      if (!this.last10Done && this.timeLeft <= 10) { this.last10Done = true; this.onEvent({ kind: 'last10' }); }
      if (w.t >= MATCH_SEC && this.state !== 'ending') { this.state = 'ending'; this.stateT = 0; this.rankTick = -99; this.onEvent({ kind: 'ending' }); }
    } else if (this.mode === 'endless') { if (!this.nudgeDone && w.t - this.lifeStart >= 600) { this.nudgeDone = true; this.onEvent({ kind: 'endlessNudge' }); } }
    if (this.run) {
      if (this.isRace && !this.last10Done && this.timeLeft <= 10) { this.last10Done = true; this.onEvent({ kind: 'last10' }); }
      if (this.run.done && this.state !== 'ending' && this.state !== 'over' && !this.missionDoneSaid) {
        this.missionDoneSaid = true;
        const ok = this.run.result().ok;
        this.onEvent({ kind: 'missionDone', ok });
        // out on an out-is-failure level: let the slow-mo play, then finish (update → dying branch)
        if (this.state !== 'dying') { this.state = 'ending'; this.stateT = 0; this.rankTick = -99; }
      }
    }
  }
  private missionDoneSaid = false;

  private finish() {
    if (this.state === 'over') return;
    this.state = 'over';
    this.onEvent({ kind: 'over' });
  }

  /** per-match counters so far (spec §3.22) — committed incrementally by the save */
  counters(): MatchCounters {
    const st = this.me.stats;
    const tags = st.killTags;
    return {
      kills: st.kills, cut: tags.filter((k) => k.tag === 'cut').length, enc: tags.filter((k) => k.tag === 'encircle').length, headon: tags.filter((k) => k.tag === 'headon').length,
      meteors: st.eatenByKind.meteor ?? 0, speedPu: st.puKinds?.speed ?? 0, shieldSaves: st.shieldSaves ?? 0, near: st.nearMiss, boostSec: Math.round(st.boostTime),
      multiMax: st.bestMulti, streakMax: st.bestStreak ?? 0, peakGrown: Math.floor(st.peak), eaten: st.eaten, playSec: Math.round(this.world.t),
    };
  }

  result(): MatchResult {
    const r = this.world.ranking();
    const c = this.counters();
    return {
      mission: this.run ? this.run.result() : undefined,
      mode: this.mode, venue: this.venue, rank: r.findIndex((x) => x.s === this.me) + 1, of: r.length,
      peak: Math.floor(this.me.stats.peak), mass: Math.floor(this.me.alive ? this.me.mass : 0), kills: c.kills, cut: c.cut, enc: c.enc, multiMax: c.multiMax, eaten: c.eaten,
      lifeSec: Math.round(this.world.t - this.lifeStart), counters: c, banked: this.banked, podium: r.slice(0, 3),
    };
  }

  /** camera target in world units (spec §3.14) */
  viewScale() { return viewScaleOf(this.me.mass); }
}

/** mission AI names (spec §4.2): colour + persona word, the king / sleepers / patrol by role */
export const MissionNames = {
  of(s: Snake, _n: number) {
    if (s.king) return '蛇王';
    const p = s.missionPersona ?? s.persona;
    if (p === 'sleeper') return (s.color ?? '') + '贪睡蛇';
    if (p === 'patrol') return (s.color ?? '') + '巡逻蛇';
    if (p === 'guard') return (s.color ?? '') + '护卫';
    return (s.color ?? '') + (AI_NAMES.persona[p] ?? '');
  },
};
