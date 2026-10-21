// The game engine: glues the oracle's controller / generators / cards to one save file. No DOM here, so vitest drives it exactly like the page does.
//   plan()   -> what the child sees next (controller.nextRound + generateSafe, seeded, deferred history)
//   finish() -> classify -> controller.report / gateStep / reportPrimer -> stars, stats, cards, sector opening, night end
// Time never enters the difficulty (spec §4): recallMs is only logged for the parent page.
import { createRng, hashString } from './rng';
import { makeHistory } from './grid';
import { NDIFF, TABLE, tagsOf, TRACKS } from './params';
import { generateSafe } from './gen';
import { CFG, classify, gateStep, nextRound, nightDone, nightValid, primerGhost, recommend, report, reportPrimer, startNight, welcomeBack, newSector, trackOpen } from './controller';
import { SAVE_VERSION, applyVeteran, defaults } from './save';
import { CARDS, unlocked, waiting } from './cards';
import levels from '../../../../content/memory-matrix/levels.json';

export const SECTOR_IDS = ['s1', 's2', 's3', 's4'] as const;
export type SectorId = (typeof SECTOR_IDS)[number];
export type PlanKind = 'round' | 'gate' | 'easy' | 'scaffold' | 'demo' | 'practice' | 'tutorial' | 'primer';
export const LEGACY_LIVE_KEY = 'kid_games_memory_matrix_v2';
export const LEGACY_SNAPSHOT_KEY = 'kg:v1:legacy-memory-matrix';
const DAY = 86_400_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Stim = any;
export interface Save { [k: string]: any; v: number; salt: string; sectors: Record<SectorId, any>; recent: Record<SectorId, { exact: number[]; shape: number[] }>; cards: string[]; nights: number; nightsAny: number; nightClock: number }
export interface Plan {
  sector: SectorId; kind: PlanKind; D: number; rel: number; soft: boolean; stim: Stim; seed: string; budget: number;
  gate: { G: number; i: number; passes: number; misses: number; total: number } | null;
  ghost: number | null; rwCarry: number; bridge: boolean; fromQueue: boolean; newRuleTag: string | null;
  /** keys generated for this plan; committed to the no-repeat history only when the round is finished */
  pendingKeys: { exact: number[]; shape: number[] };
}
export interface Outcome { slips: number; rwPre: number; rwMid: number; hint: number; showAnswer: boolean; recallMs?: number }
export interface NightSummary { sector: SectorId; rounds: { res: string; kind: string; showAnswer: boolean }[]; valid: boolean; bad: boolean; cards: string[]; gatesCleared: number; wallBefore: number; wallAfter: number; upgraded: number | null }
export interface Finish {
  res: 'pass' | 'neutral' | 'miss'; rw: number; events: string[]; stars: number; firstLit: boolean; fly: string | null; opened: SectorId | null;
  gate: { verdict: string; ev: string[]; next: { D: number; i: number } | null } | null; night: NightSummary | null; levelChange: 'up' | 'down' | null;
}

const isStr = (x: unknown): x is string => typeof x === 'string';
/** integer in [lo, hi]; anything that is not a finite number becomes `d` */
const clampInt = (x: unknown, lo: number, hi: number, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
const RULES = ['s2:B', 's3:far', 's3:near', 's4:UD', 's4:peek'] as const;

/** A hand-edited / corrupted track can never point outside its table (spec §6: generation never throws): every number is clamped, the level never exceeds the next closed gate. */
function repairTrack(dt: any, rt: any): any {
  const t: any = { ...dt, ...(rt && typeof rt === 'object' ? rt : {}), cp: {} };
  t.len = dt.len; t.offset = dt.offset; t.gates = dt.gates;
  t.cleared = clampInt(rt?.cleared, 0, dt.gates.length, 0);
  const lim = t.cleared < dt.gates.length ? dt.gates[t.cleared] : dt.len;
  t.L = clampInt(rt?.L, 1, lim, dt.L);
  t.maxL = Math.min(dt.len, Math.max(t.L, clampInt(rt?.maxL, 1, dt.len, t.L)));
  for (const k of ['s', 'm', 'rounds', 'regular', 'atG', 'gateFails', 'park', 'parkCount']) t[k] = clampInt(rt?.[k], 0, 1_000_000, dt[k] ?? 0);
  t.ramp = clampInt(rt?.ramp, 0, 10, 0);
  t.placement = typeof rt?.placement === 'boolean' ? rt.placement : dt.placement;
  if (rt?.cp && typeof rt.cp === 'object') for (const [k, v] of Object.entries(rt.cp)) if (/^[A-Za-z0-9]{1,8}$/.test(k)) t.cp[k] = clampInt(v, 0, 1_000_000, 0);
  return t;
}

/** Fills every field a (possibly older / hand-edited) save may lack and never trusts shapes; unknown extra keys survive. */
export function normalizeSave(raw: unknown, mkSalt: () => string): Save {
  const d: any = defaults(), r: any = raw && typeof raw === 'object' ? raw : {};
  const out: any = { ...d, ...r, v: SAVE_VERSION };
  out.tutorial = { ...d.tutorial, ...(r.tutorial ?? {}) };
  out.flags = { ...d.flags, ...(r.flags ?? {}) };
  out.settings = { ...d.settings, ...(r.settings ?? {}) };
  out.cards = Array.isArray(r.cards) ? [...new Set<string>(r.cards.filter(isStr).map((c: string) => (c === 'c.vet' ? 'vet' : c)))] : [];   // the oracle's save.mjs writes 'c.vet', its cards table says 'vet': one id in the page
  out.nights = clampInt(r.nights, 0, 1e9, 0); out.nightsAny = clampInt(r.nightsAny, 0, 1e9, 0);
  out.nightClock = clampInt(r.nightClock, 0, 1e9, out.nightsAny);
  out.lastSeen = typeof r.lastSeen === 'number' && Number.isFinite(r.lastSeen) && r.lastSeen > 0 ? r.lastSeen : 0;
  out.seenRules = Array.isArray(r.seenRules) ? [...new Set<string>(r.seenRules.filter((x: unknown): x is string => (RULES as readonly string[]).includes(x as string)))] : [];
  out.practiceN = clampInt(r.practiceN, 0, 1e9, 0);
  out.salt = isStr(r.salt) && r.salt ? r.salt : mkSalt();
  out.voice = { once: Array.isArray(r.voice?.once) ? r.voice.once.filter(isStr) : [], week: { ...(r.voice?.week ?? {}) }, nightAt: { ...(r.voice?.nightAt ?? {}) } };
  out.sectors = {};
  out.recent = {};
  for (const s of SECTOR_IDS) {
    const ds = d.sectors[s], rs = r.sectors?.[s] ?? {};
    const sec: any = { ...ds, ...rs, primer: {}, byLevel: {}, span: { ...(rs.span && typeof rs.span === 'object' && !Array.isArray(rs.span) ? rs.span : {}) }, stats: { ...ds.stats } };
    sec.tracks = ds.tracks.map((dt: any, i: number) => repairTrack(dt, rs.tracks?.[i]));
    for (const k of [...Object.keys(ds.stats), 'rw2']) sec.stats[k] = clampInt(rs.stats?.[k], 0, 1e9, ds.stats[k] ?? 0);
    if (rs.primer && typeof rs.primer === 'object') for (const [k, v] of Object.entries(rs.primer)) if (k === 'LR' || k === 'UD') sec.primer[k] = clampInt(v, 0, 3, 0);
    if (rs.primerDirty && typeof rs.primerDirty === 'object') { sec.primerDirty = {}; for (const k of ['LR', 'UD']) if ((rs.primerDirty as any)[k]) sec.primerDirty[k] = true; }
    if (rs.byLevel && typeof rs.byLevel === 'object') for (let D = 1; D <= NDIFF; D += 1) { const b = rs.byLevel[D]; if (b && typeof b === 'object') sec.byLevel[D] = { att: clampInt(b.att, 0, 99, 0), stars: clampInt(b.stars, 0, 3, 0), rw: clampInt(b.rw, 0, 1, 0) }; }
    for (const k of ['rounds', 'nights', 'swaps']) sec[k] = clampInt(rs[k], 0, 1e9, ds[k] ?? 0);
    sec.nr = clampInt(rs.nr, 0, CFG.nightRounds, 0); sec.nightMiss = clampInt(rs.nightMiss, 0, CFG.nightRounds, 0);
    sec.cur = ds.tracks.length > 1 && clampInt(rs.cur, 0, 1, 0) === 1 && sec.tracks[0].cleared >= 1 ? 1 : 0;
    // a night left open (the child went home after >= 1 finished round) is resumed, never restarted (same wing, same counters)
    const nr = rs.nightRec, okRound = (r: any) => r && isStr(r.res) && isStr(r.kind);
    sec.nightRec = nr && Array.isArray(nr.rounds) && nr.rounds.length > 0 && nr.rounds.length <= 12 && nr.rounds.every(okRound) && sec.nr > 0 && sec.nr < CFG.nightRounds
      ? { rounds: nr.rounds.map((r: any) => ({ res: r.res, kind: r.kind, showAnswer: !!r.showAnswer })), cards: Array.isArray(nr.cards) ? nr.cards.filter(isStr).slice(0, 8) : [], wallBefore: clampInt(nr.wallBefore, 0, 40, 0), upgradedFrom: clampInt(nr.upgradedFrom, 0, 4, 0) } : null;
    sec.queue = Array.isArray(rs.queue) ? rs.queue.filter((q: unknown) => q === 'easy' || q === 'scaffold' || q === 'demo') : [];
    sec.gate = null; sec.pending = null;                                          // a gate in progress is never restored (spec §10.2)
    sec.open = s === 's1' ? true : !!rs.open;
    sec.last = clampInt(rs.last, -1, 1e9, -1);
    sec.badStreak = clampInt(rs.badStreak, 0, 1e6, 0);
    sec.last20 = isStr(rs.last20) ? rs.last20.slice(-20) : '';
    sec.carryRw = clampInt(rs.carryRw, 0, 3, 0);
    out.sectors[s] = sec;
    const rc = r.recent?.[s];
    out.recent[s] = { exact: Array.isArray(rc?.exact) ? rc.exact.filter(Number.isFinite).slice(-64) : [], shape: Array.isArray(rc?.shape) ? rc.shape.filter(Number.isFinite).slice(-6) : [] };
  }
  return out as Save;
}

export interface EngineOptions { now?: () => number; mkSalt?: () => string; legacyLive?: string | null; legacySnapshot?: string | null }

export class Engine {
  save: Save;
  night: { sector: SectorId; rounds: { res: string; kind: string; showAnswer: boolean }[]; cards: string[]; wallBefore: number; upgradedFrom: number; touched?: boolean } | null = null;
  /** the sector as it was BEFORE startNight(): leaving a night in which nothing was finished puts this back (no counters, same wing, same puzzle) */
  private nightSnap: { id: SectorId; sec: any; lastSeen: number } | null = null;
  current: Plan | null = null;
  phase = 'idle';
  /** true exactly once, on the load that discovered an old save with a cleared level (the 元老 card was just awarded) */
  veteranNew = false;
  private readonly now: () => number;

  constructor(raw: unknown, opts: EngineOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.save = normalizeSave(raw, opts.mkSalt ?? (() => `s${Math.floor(Math.random() * 2 ** 32).toString(36)}`));
    if (opts.legacyLive !== undefined || opts.legacySnapshot !== undefined) {
      const v = applyVeteran(this.save, opts.legacyLive ?? null, opts.legacySnapshot ?? null, this.now());
      this.save = normalizeSave(v.save, () => this.save.salt);
      this.veteranNew = v.awardNow;
    }
    this.refreshCards();
    const t = this.now(); if (this.save.lastSeen > t) this.save.lastSeen = t;      // a clock that was once set into the future must not break the welcome-back rule
  }

  /* ------------------------------------------------------------------ queries */
  /** ms since the child was last here; never negative, 0 when unknown (clock changes, first visit) */
  awayMs(): number { const l = this.save.lastSeen; return l > 0 ? Math.max(0, this.now() - l) : 0; }
  sec(id: SectorId): any { return this.save.sectors[id]; }
  isOpen(id: SectorId): boolean { return !!this.sec(id).open; }
  /** the 星墙: cards earned, 元老 not counted (it has its own ribbon) */
  cardCount(): number { return this.save.cards.filter((c) => c !== 'vet').length; }
  gatesCleared(id?: SectorId): number { return (id ? [id] : [...SECTOR_IDS]).reduce((a, s) => a + this.sec(s).tracks.reduce((b: number, t: any) => b + t.cleared, 0), 0); }
  /** Station buildings: one grows at 7 / 14 / 21 / 28 cards. */
  buildings(): number { return Math.min(4, Math.floor(this.cardCount() / 7)); }
  recommended(): SectorId {
    const secs = SECTOR_IDS.map((s) => ({ id: s, open: this.isOpen(s), last: this.sec(s).last, badStreak: this.sec(s).badStreak }));
    return recommend(secs, this.save.nightClock) as SectorId;
  }
  /** Per-level state for the sector page (S2). D = absolute 1..15. */
  levelView(id: SectorId): { D: number; gate: boolean; state: 'locked' | 'lit' | 'bridge' | 'now' | 'open'; stars: number; rel: number; wing: number }[] {
    const sec = this.sec(id), rows: ReturnType<Engine['levelView']> = [];
    for (let D = 1; D <= NDIFF; D += 1) {
      const wing = D > TRACKS[id][0].len && TRACKS[id].length > 1 ? 1 : 0, t = sec.tracks[wing], rel = D - t.offset, bl = sec.byLevel[D];
      const reach = (wing === 0 || trackOpen(sec, 1)) && rel <= t.maxL;
      let state: 'locked' | 'lit' | 'bridge' | 'now' | 'open' = 'locked';
      if (bl && bl.stars > 0) state = 'lit'; else if (reach) state = 'bridge';
      if (reach && rel === t.L && sec.cur === wing && sec.open) state = bl && bl.stars > 0 ? 'lit' : 'now';
      rows.push({ D, gate: TABLE[id][D - 1].gate, state, stars: bl?.stars ?? 0, rel, wing });
    }
    return rows;
  }
  cardState(): { earned: string[]; waiting: string[]; nights: number } {
    const st = this.cardCtx();
    return { earned: this.save.cards.slice(), waiting: waiting(st).map((c: any) => c.id).filter((c: string) => !this.save.cards.includes(c)), nights: this.save.nights };
  }
  private cardCtx() {
    const ms = (s: SectorId, kind: string, n: number): boolean => {
      const sec = this.sec(s);
      if (kind === 'first') return sec.stats.pass + sec.stats.neutral > 0;
      if (kind === 'level') return sec.tracks.some((t: any) => t.maxL >= n);
      return sec.tracks.some((t: any) => t.gates.includes(n) && t.cleared > t.gates.indexOf(n));
    };
    return { milestone: ms, nights: this.save.nights, veteran: !!this.save.veteran };
  }
  private refreshCards(): string[] {
    const fresh: string[] = [];
    for (const c of unlocked(this.cardCtx())) if (!this.save.cards.includes(c.id)) { this.save.cards.push(c.id); fresh.push(c.id); }
    return fresh;
  }
  /** Which sector a plain click on 「开始夜航」 / a node should enter, plus whether its tutorial is due. */
  tutorialDue(id: SectorId): boolean { return !this.save.tutorial[id]; }

  /* ------------------------------------------------------------------ night / rounds */
  startNight(id: SectorId): void {
    const st = this.sec(id), away = this.awayMs();
    if (!st.open) st.open = true;
    this.nightSnap = { id, sec: JSON.parse(JSON.stringify(st)), lastSeen: this.save.lastSeen };
    const rec = st.nightRec;
    if (rec && st.nr > 0 && st.nr < CFG.nightRounds) {                              // the night the child left half-way: carry on (same wing, same counters)
      this.night = { sector: id, rounds: rec.rounds.map((r: any) => ({ ...r })), cards: rec.cards.slice(), wallBefore: rec.wallBefore, upgradedFrom: rec.upgradedFrom, touched: true };
    } else {
      st.nightRec = null;
      startNight(st);
      if (away > 14 * DAY) welcomeBack(st);
      this.night = { sector: id, rounds: [], cards: [], wallBefore: this.cardCount(), upgradedFrom: this.buildings() };
    }
    this.save.lastSeen = this.now();
  }

  private hist(sector: SectorId, D: number) {
    const r = this.save.recent[sector], W = (levels.window as Record<string, number>)[`${sector}:${D}`] ?? 64;
    const ex = new Set(r.exact.slice(-W)), sh = new Set(r.shape), pending = { exact: [] as number[], shape: [] as number[] };
    const h: any = { has: (k: string) => ex.has(hashString(k)), hasShape: (k: string) => sh.has(hashString(k)), push(k: string, shape?: string) { pending.exact.push(hashString(k)); if (shape !== undefined) pending.shape.push(hashString(shape)); } };
    return { h, pending };
  }
  private commit(plan: Plan): void {
    const r = this.save.recent[plan.sector];
    r.exact = [...r.exact, ...plan.pendingKeys.exact].slice(-64);
    r.shape = [...r.shape, ...plan.pendingKeys.shape].slice(-6);
  }
  private gen(sector: SectorId, D0: number, seed: string) {
    const D = clampInt(D0, 1, NDIFF, 1);
    const { h, pending } = this.hist(sector, D);
    const stim = generateSafe(sector, D, createRng(seed), h, { safe: levels.safe });
    return { stim, pending };
  }
  private bridged(sector: SectorId, D: number): boolean {
    const v = this.levelView(sector)[D - 1];
    return v.state === 'bridge';
  }

  /** The next round of the night (or a gate). Safe to call again only after finish(). */
  plan(): Plan {
    if (!this.night) throw new Error('plan(): no night started');
    const sector = this.night.sector, st = this.sec(sector), qBefore = st.queue.length;
    const nr: any = nextRound(st), t = st.tracks[st.cur];
    const gate = nr.kind === 'gate' && st.gate ? { G: st.gate.G, i: st.gate.i, passes: st.gate.passes, misses: st.gate.misses, total: 5 } : null;
    const seed = gate ? `${this.save.salt}:${sector}:${nr.D}:g${st.gate.G}.${st.gate.i}:${st.rounds}:${t.gateFails}.${t.parkCount}.${t.cleared}` : `${this.save.salt}:${sector}:${nr.D}:${st.rounds}`;
    const { stim, pending } = this.gen(sector, nr.D, seed);
    let kind: PlanKind = nr.kind, ghost: number | null = null;
    if (sector === 's4' && kind === 'round') { ghost = primerGhost(st, stim.axis); if (ghost !== null) kind = 'primer'; }
    const carry = st.carryRw || 0; st.carryRw = 0;
    const plan: Plan = { sector, kind, D: nr.D, rel: nr.rel ?? nr.D - t.offset, soft: !!nr.soft, stim, seed, budget: stim.budget, gate, ghost, rwCarry: carry, bridge: false, fromQueue: st.queue.length < qBefore, newRuleTag: kind === 'round' ? this.newRule(sector, stim) : null, pendingKeys: pending };
    this.current = plan; this.phase = 'ready';
    return plan;
  }
  /** the first not-yet-seen RULE (spec §7 H3: a new rule is introduced by an automatic demonstration) that this stimulus contains */
  private newRule(sector: SectorId, stim: Stim): string | null {
    const seen: string[] = this.save.seenRules, tags: string[] = [];
    if (sector === 's2' && stim.dir === 'B') tags.push('s2:B');
    if (sector === 's3') { if (stim.near > 0) tags.push('s3:near'); if (stim.far > 0) tags.push('s3:far'); }
    if (sector === 's4') { if (stim.axis === 'UD') tags.push('s4:UD'); if (stim.mode === 'peek') tags.push('s4:peek'); }
    return tags.find((x) => !seen.includes(x)) ?? null;
  }
  markRuleSeen(tag: string | null): void { if (tag && !this.save.seenRules.includes(tag)) this.save.seenRules.push(tag); }
  /** Practice round on a lit / bridged level (does not move the staircase or the statistics). */
  practicePlan(sector: SectorId, D: number, seedOverride?: string): Plan {
    const n = (this.save.practiceN += 1), seed = seedOverride ?? `${this.save.salt}:p:${sector}:${D}:${n}`, { stim, pending } = this.gen(sector, D, seed);
    const plan: Plan = { sector, kind: 'practice', D, rel: D - this.sec(sector).tracks[D > TRACKS[sector][0].len && TRACKS[sector].length > 1 ? 1 : 0].offset, soft: false, stim, seed, budget: stim.budget, gate: null, ghost: null, rwCarry: 0, bridge: this.bridged(sector, D), fromQueue: false, newRuleTag: null, pendingKeys: pending };
    this.current = plan; this.phase = 'ready'; this.night = null;
    return plan;
  }
  /** The scripted first round of a sector: fixed stimulus, ghost hand, not recorded. */
  tutorialPlan(sector: SectorId): Plan {
    const D = sector === 's1' ? 1 : sector === 's3' ? 1 : sector === 's4' ? 1 : 2, seed = `tutorial:${sector}`;
    const { h, pending } = { h: makeHistory(64, 6), pending: { exact: [], shape: [] } };
    const stim: any = sector === 's1'
      ? { sector: 's1', g: 4, n: 3, cells: [5, 9, 10], k: 1, delayMs: 0, previewMs: 3000, budget: 1, tags: [], key: 'tutorial' }
      : generateSafe(sector, D, createRng(seed), h);
    const plan: Plan = { sector, kind: 'tutorial', D, rel: D, soft: false, stim, seed, budget: stim.budget ?? 1, gate: null, ghost: sector === 's4' ? 1 : null, rwCarry: 0, bridge: false, fromQueue: false, newRuleTag: null, pendingKeys: pending };
    this.current = plan; this.phase = 'ready'; this.night = null;
    return plan;
  }
  /** Fresh stimulus for the same rung after a demonstration (H3: the child tries on a new seed). */
  reseed(plan: Plan, tag: string): Plan {
    const { stim, pending } = this.gen(plan.sector, plan.D, `${plan.seed}:${tag}`);
    const next = { ...plan, stim, pendingKeys: pending };
    this.current = next;
    return next;
  }

  finish(plan: Plan, o: Outcome): Finish {
    const save = this.save, st = this.sec(plan.sector), cls = classify({ slips: o.slips, budget: plan.budget, rwPre: o.rwPre, rwMid: o.rwMid, hint: o.hint, showAnswer: o.showAnswer }) as { res: 'pass' | 'neutral' | 'miss'; rw: number };
    const fin: Finish = { res: cls.res, rw: cls.rw, events: [], stars: 0, firstLit: false, fly: null, opened: null, gate: null, night: null, levelChange: null };
    this.current = null; this.phase = 'idle';
    if (plan.kind === 'tutorial') { save.tutorial[plan.sector] = true; return fin; }
    this.commit(plan);
    if (plan.kind === 'practice') {
      const bl = st.byLevel[plan.D];
      // spec §7: a skipped (bridged) level is lit with 3 stars by its first PASS; a round with help (neutral) or a miss only practises
      if (plan.bridge && cls.res === 'pass' && !(bl && bl.stars > 0)) { st.byLevel[plan.D] = { att: 1, stars: 3, rw: 0 }; fin.stars = 3; fin.firstLit = true; }
      return fin;
    }
    const night = this.night;
    if (night && plan.kind !== 'gate') night.touched = true;                         // something real was finished: leaving can no longer be undone to 'before the night'
    const mark = (res: string) => { if (night) night.rounds.push({ res, kind: plan.kind, showAnswer: o.showAnswer }); };
    if (plan.kind === 'gate') {
      const v: any = gateStep(st, cls.res === 'pass' ? 'pass' : 'miss');
      fin.gate = { verdict: v.verdict, ev: v.ev, next: v.next ? { D: v.next.D, i: v.next.i } : null };
      fin.events = v.ev.slice();
      if (night && v.verdict !== 'continue') night.touched = true;
      if (v.verdict === 'passed') { const c = this.refreshCards(); if (c.length) { fin.fly = c[0]; night?.cards.push(...c); } }
      save.lastSeen = this.now();
      return fin;
    }
    if (plan.kind === 'primer') { fin.events = reportPrimer(st, plan.stim.axis, o.slips === 0 && o.hint === 0 && o.rwPre + o.rwMid === 0 && !o.showAnswer); mark('neutral'); fin.res = 'neutral'; }
    else if (plan.kind === 'demo') { fin.events = report(st, 'neutral', { tags: [] }); mark('neutral'); fin.res = 'neutral'; }
    else {
      const tags = tagsOf(plan.sector, plan.stim), Lbefore = st.tracks[st.cur].L;
      fin.events = report(st, cls.res, { tags });
      mark(cls.res);
      if (fin.events.includes('levelUp')) fin.levelChange = 'up'; else if (fin.events.includes('levelDown')) fin.levelChange = 'down';
      void Lbefore;
      const s = st.stats;
      s.rounds += 1; s[cls.res] += 1; s.slips += o.slips; s.rewatch += o.rwPre >= 1 ? 1 : 0; s.rw2 = (s.rw2 ?? 0) + (o.rwPre >= 2 || o.rwMid > 0 ? 1 : 0); s.hintMax = Math.max(s.hintMax, o.hint); s.activeMs += Math.round(o.recallMs ?? 0);
      if (plan.kind === 'round' || plan.kind === 'easy') st.last20 = (st.last20 + (cls.res === 'pass' ? 'p' : cls.res === 'neutral' ? 'n' : 'm')).slice(-20);
      const bl = (st.byLevel[plan.D] ??= { att: 0, stars: 0, rw: 0 });
      if (!bl.stars) {
        bl.att += 1;
        if (cls.res !== 'miss') {
          const base = bl.att === 1 ? 3 : bl.att === 2 ? 2 : 1, minus = (o.rwPre >= 1 ? 1 : 0) + (o.rwPre >= 2 || o.rwMid > 0 || o.hint > 0 ? 1 : 0);
          bl.stars = Math.max(1, base - minus); bl.rw = o.rwPre >= 1 ? 1 : 0; fin.stars = bl.stars; fin.firstLit = true;
        }
      }
      if (cls.res === 'pass' && plan.kind === 'round') this.updateSpan(plan.sector, plan.stim);
      this.noteAxis(plan, cls.res);
      const next = SECTOR_IDS[SECTOR_IDS.indexOf(plan.sector) + 1] as SectorId | undefined;
      if (next && !this.isOpen(next) && st.tracks[0].maxL >= CFG.openAtL) { this.sec(next).open = true; fin.opened = next; }
    }
    const fresh = this.refreshCards();
    if (fresh.length) { fin.fly = fresh[0]; night?.cards.push(...fresh); }
    save.lastSeen = this.now();
    if (night && nightDone(st)) fin.night = this.endNight();
    return fin;
  }

  private updateSpan(sector: SectorId, stim: Stim): void {
    const sp = this.sec(sector).span, mx = (k: string, v: number) => { sp[k] = Math.max(sp[k] ?? 0, v); };
    if (sector === 's1') mx(stim.k <= 2 ? 'cl' : 'sc', stim.n);
    else if (sector === 's2') mx(stim.dir === 'B' ? 'bwd' : 'fwd', stim.L);
    else if (sector === 's3') mx(stim.near || stim.far ? 'nv' : 'n', stim.n);
  }

  /** First-attempt bookkeeping for the mirror axes (att/pass) needs the result of EVERY first attempt, not just passes. */
  noteAxis(plan: Plan, res: string): void {
    if (plan.sector !== 's4' || (plan.kind !== 'round' && plan.kind !== 'easy')) return;
    const sp = this.sec('s4').span, k = plan.stim.axis as string, cur = sp[k] ?? [0, 0];
    sp[k] = [cur[0] + 1, cur[1] + (res === 'pass' ? 1 : 0)];
    if (res === 'pass') sp[plan.stim.mode === 'peek' ? 'peekD' : 'seeD'] = Math.max(sp[plan.stim.mode === 'peek' ? 'peekD' : 'seeD'] ?? 0, plan.D);
  }

  endNight(): NightSummary {
    const n = this.night!, st = this.sec(n.sector), valid = nightValid(n.rounds);
    // a night cut short by 换个星区 after 2 misses is a bad night too (else leaving every hard sector would reset its streak and recommend() would walk him back in)
    const bad = st.nightMiss >= 3 || (!valid && st.nightMiss >= 2);
    this.save.nightsAny += 1; if (valid) this.save.nights += 1;
    if (valid || bad) { st.badStreak = bad ? st.badStreak + 1 : 0; st.last = this.save.nightClock; this.save.nightClock += 1; }
    st.nightRec = null;
    const fresh = this.refreshCards(); n.cards.push(...fresh);
    const sum: NightSummary = { sector: n.sector, rounds: n.rounds.slice(), valid, bad, cards: n.cards.slice(), gatesCleared: this.gatesCleared(), wallBefore: n.wallBefore, wallAfter: this.cardCount(), upgraded: this.buildings() > n.upgradedFrom ? this.buildings() : null };
    this.night = null;
    return sum;
  }
  /** a night ended early (the child chose 回星图站): counts like any night, validity decided by the same 4-of-6 rule */
  closeNight(): NightSummary | null { return this.night && this.night.rounds.length ? this.endNight() : ((this.night = null), null); }

  /** the child left the round (回星图站 / 🏠): put everything back so the same rung is offered again, with the same seed. `leftAt` = the phase the round was in
   *  when he left (the in-round button changes the phase before it gets here). */
  abandon(leftAt?: string): void {
    if (leftAt) this.phase = leftAt;
    const voice = this.save.voice;
    this.save = normalizeSave(this.serialize(), () => this.save.salt); this.save.voice = voice;
    this.current = null; this.night = null; this.nightSnap = null; this.phase = 'idle';
  }

  /** A copy that is safe to write (spec §3.6 离开与回来): no half-played gate; a night in which nothing was finished is written as if it had never started (no
   *  counters, the same wing, the same puzzle); a night with finished rounds is written as 'resume here'; a consumed-but-unplayed round goes back to its queue;
   *  leaving in fog / recall is ONE look-again that adds up (never a free second look). */
  serialize(): Save {
    const copy: Save = JSON.parse(JSON.stringify(this.save));
    const p = this.current && this.current.kind !== 'practice' && this.current.kind !== 'tutorial' ? this.current : null, n = this.night;
    if (n) {
      const id = n.sector, snap = this.nightSnap;
      if (!n.touched && snap && snap.id === id) {                                    // nothing finished: undo startNight()
        copy.sectors[id] = JSON.parse(JSON.stringify(snap.sec)); copy.lastSeen = snap.lastSeen;
        if (p && p.sector === id) { const st = copy.sectors[id]; st.carryRw = p.rwCarry + (this.phase === 'fog' || this.phase === 'recall' ? 1 : 0); }
      } else {
        const st = copy.sectors[id];
        st.nightRec = st.nr > 0 && st.nr < CFG.nightRounds && n.rounds.length ? { rounds: n.rounds.map((r) => ({ ...r })), cards: n.cards.slice(), wallBefore: n.wallBefore, upgradedFrom: n.upgradedFrom } : null;
        if (p && p.sector === id) this.putBack(copy, p);
      }
    } else if (p) this.putBack(copy, p);
    for (const s of SECTOR_IDS) { copy.sectors[s].gate = null; copy.sectors[s].pending = null; }
    return copy;
  }
  private putBack(copy: Save, p: Plan): void {
    const st = copy.sectors[p.sector];
    if (p.fromQueue && (p.kind === 'easy' || p.kind === 'scaffold' || p.kind === 'demo')) st.queue.unshift(p.kind);
    if (p.soft) st.softPending = true;
    st.carryRw = p.rwCarry + (this.phase === 'fog' || this.phase === 'recall' ? 1 : 0);
  }
}

export { CARDS, TABLE, NDIFF, newSector };
