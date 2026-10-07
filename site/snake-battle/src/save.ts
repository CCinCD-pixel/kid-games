/**
 * Save v1 (spec §8.9; key kg:v1:snake-battle). Incremental commit (review B9): a match writes
 * `inProgress` at its start; going to the background adds (counters − committed) to `life` and moves
 * `committed` forward; the match end / leaving commits the rest and drops `inProgress`. A leftover
 * `inProgress` at boot (the app was killed in the background) is closed as "left" — its increments are
 * already in. The old game had no save key, so there is nothing to migrate (spec §8.1).
 */
import { createStore, type Store } from '@kit/progress';
import { nextHeat, TROPHIES, VENUE_IDS, UNLOCK, type VenueId } from './sim/venues';
import { zeroCounters, type MatchCounters, type MatchResult, type Mode } from './match';
import { MISSIONS, MISSION_BY_ID } from './sim/mission';
import { evalUnlocks } from './collection';
import collectionJson from '../../../content/snake-battle/collection.json';

const SKIN_IDS = new Set((collectionJson as unknown as { skins: { id: string }[] }).skins.map((x) => x.id));
const TRAIL_IDS = new Set((collectionJson as unknown as { trails: { id: string }[] }).trails.map((x) => x.id));

export type Counters = MatchCounters;
export interface VenueRec {
  played: number; podiums: number; wins: number; bestRank: number | null; bestPeak: number; bestKills: number;
  recentRanks: number[]; heat: number; endless: { runs: number; bestPeak: number; bestLife: number };
}
export interface SbSettings { control: 'follow' | 'stick'; boostSide: 'auto' | 'right' | 'left'; doubleTapBoost: boolean; showNames: boolean; matchMusic: boolean; crown: boolean }
export interface SbSaveV1 {
  firstRunDone: boolean;
  settings: SbSettings;
  equipped: { skin: string; trail: string };
  owned: string[];
  cardQueue: string[];
  seenTips: string[];
  voiceSeen: Record<string, number>;
  tipDay: { day: string; byCause: Record<string, number> };
  venueIntroDay: Partial<Record<VenueId, string>>;
  missions: Record<string, { stars: number; attempts: number; failStreak: number; clears: number; bestT: number | null; hintMax: number; skipped: boolean; why: Record<string, number> }>;
  venues: Record<VenueId, VenueRec>;
  life: Counters & { timedPlayed: number; podiums: number; wins: number };
  inProgress?: { matchId: string; mode: Mode | 'mission'; venue?: VenueId; missionId?: string; startedAt: number; committed: Counters; countable?: boolean };
  /** twin progression per level (spec §5.1: each further twin miss loosens one more step) */
  twinLevel?: Record<string, number>;
  /** the last S9 praise line id, so the next clear never repeats it (QA r4) */
  lastPraise?: string;
  attemptSeq: number;
  session: { day: string; matchesInRow: number; lastEndAt: number };
}

const missionRec = (): SbSaveV1['missions'][string] => ({ stars: 0, attempts: 0, failStreak: 0, clears: 0, bestT: null, hintMax: 0, skipped: false, why: {} });
const venueRec = (): VenueRec => ({ played: 0, podiums: 0, wins: 0, bestRank: null, bestPeak: 0, bestKills: 0, recentRanks: [], heat: 0, endless: { runs: 0, bestPeak: 0, bestLife: 0 } });
export const defaults = (): SbSaveV1 => ({
  firstRunDone: false,
  settings: { control: 'follow', boostSide: 'auto', doubleTapBoost: false, showNames: true, matchMusic: true, crown: true },
  equipped: { skin: 'venus', trail: 'stardust' },
  owned: ['skin:venus', 'trail:stardust'],
  cardQueue: [], seenTips: [], voiceSeen: {}, tipDay: { day: '', byCause: {} }, venueIntroDay: {}, missions: {},
  venues: Object.fromEntries(VENUE_IDS.map((v) => [v, venueRec()])) as Record<VenueId, VenueRec>,
  life: { ...zeroCounters(), timedPlayed: 0, podiums: 0, wins: 0 },
  attemptSeq: 0,
  session: { day: '', matchesInRow: 0, lastEndAt: 0 },
});

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SUM_KEYS: (keyof Counters)[] = ['kills', 'cut', 'enc', 'headon', 'meteors', 'speedPu', 'shieldSaves', 'near', 'boostSec', 'eaten', 'playSec', 'peakGrown'];
const MAX_KEYS: (keyof Counters)[] = ['multiMax', 'streakMax'];

/** life += (now − committed); returns the new committed snapshot. Max-type counters merge by max. */
export function commitDelta(save: SbSaveV1, now: Counters, committed: Counters): Counters {
  for (const k of SUM_KEYS) save.life[k] += Math.max(0, now[k] - committed[k]);
  for (const k of MAX_KEYS) save.life[k] = Math.max(save.life[k], now[k]);
  return { ...now };
}

/** deep-merge a loaded save over the defaults (spec §8.9): every nested default (settings, life counters, tipDay,
 * session, venue records, …) is filled in, so a later build that adds a counter or setting never sees undefined/NaN.
 * Arrays and scalars from the save win; plain objects merge key by key. */
export function fillDefaults<T>(def: T, raw: unknown): T {
  if (raw === undefined || raw === null) return def;
  // arrays only accept arrays (QA r3: {owned:{}} crashed the boot), numbers only finite numbers
  if (Array.isArray(def)) return (Array.isArray(raw) ? raw : def) as T;
  if (typeof def === 'number') return (typeof raw === 'number' && Number.isFinite(raw) ? raw : def) as T;
  if (typeof def !== 'object' || def === null) return (typeof raw === typeof def || def === null ? raw : def) as T;
  if (typeof raw !== 'object' || Array.isArray(raw)) return def;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const [k, dv] of Object.entries(def as Record<string, unknown>)) out[k] = fillDefaults(dv, (raw as Record<string, unknown>)[k]);
  return out as T;
}
export const SAVE_VERSION = 1;
/** version migrations (spec §8.9). v1 is the first save of this game; a v2 build adds `if (from < 2) …` steps here and
 * bumps SAVE_VERSION; fillDefaults then completes any new fields. validate/save-migrate.test.ts covers the path. */
export function migrateSave(raw: unknown, from: number): SbSaveV1 {
  const d = (raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}) as Record<string, unknown>;
  void from;   // no structural changes yet (v1 → v1)
  return fillDefaults(defaults(), d);
}

export class SaveCtl {
  store: Store<SbSaveV1>;
  data: SbSaveV1;
  constructor(storage?: Storage) {
    this.store = createStore<SbSaveV1>('snake-battle', { version: SAVE_VERSION, defaults, storage, migrate: migrateSave });
    // a save written by a newer build (deploy rollback / stale cache): play on a best-effort read of it and never
    // write over it (QA r3; the kit store would load defaults and the first save would replace his progress)
    let newer: unknown = null;
    try { const env = JSON.parse((storage ?? localStorage).getItem(this.store.key) ?? 'null') as { v?: unknown; data?: unknown } | null; if (env && typeof env.v === 'number' && env.v > SAVE_VERSION) newer = env.data ?? {}; } catch { /* ignore */ }
    this.readOnly = newer !== null;
    try {
      this.data = fillDefaults(defaults(), newer ?? this.store.load());
      // record maps (QA r4: {missions:{c1m1:null}} crashed the boot): every entry an object, filled with defaults
      const ms: SbSaveV1['missions'] = {};
      for (const [id, rec] of Object.entries(this.data.missions ?? {})) if (rec && typeof rec === 'object' && !Array.isArray(rec)) ms[id] = fillDefaults(missionRec(), rec);
      this.data.missions = ms;
      if (this.data.twinLevel && (typeof this.data.twinLevel !== 'object' || Array.isArray(this.data.twinLevel))) delete this.data.twinLevel;
    } catch (e) {
      // last resort: keep a copy of the raw save next to it and start from defaults
      console.error('[snake-battle] save unreadable, starting fresh', e);
      try { const st = storage ?? localStorage, raw = st.getItem(this.store.key); if (raw) st.setItem(`${this.store.key}.bak`, raw); } catch { /* ignore */ }
      this.data = defaults();
    }
    if (!SKIN_IDS.has(this.data.equipped.skin)) this.data.equipped.skin = 'venus';
    if (!TRAIL_IDS.has(this.data.equipped.trail)) this.data.equipped.trail = 'stardust';
    for (const v of VENUE_IDS) this.data.venues[v] = fillDefaults(venueRec(), this.data.venues[v]);
    // leftover inProgress (killed in the background): close it as "left" — increments already committed
    if (this.data.inProgress) { delete this.data.inProgress; this.save(); }
  }
  /** true when the stored save comes from a newer build: it is never overwritten */
  readonly readOnly: boolean;
  save() { if (!this.readOnly) this.store.save(this.data); }

  startMatch(mode: Mode, venue: VenueId) {
    this.data.inProgress = { matchId: `${Date.now().toString(36)}`, mode, venue, startedAt: Date.now(), committed: zeroCounters() };
    this.save();
  }
  /** 挑战关 attempt: counters count only until the level's first clear (spec §3.22, review B22) */
  startMission(id: string) {
    const rec = this.mission(id);
    this.data.inProgress = { matchId: `${Date.now().toString(36)}`, mode: 'mission', missionId: id, startedAt: Date.now(), committed: zeroCounters(), countable: rec.clears === 0 };
    this.save();
  }
  mission(id: string) {
    return (this.data.missions[id] ??= missionRec());
  }
  /** mission end → stars, unlocks; returns what is new */
  endMission(id: string, r: { ok: boolean; stars: number; t: number; why?: string }, counters: Counters, o: { twin?: boolean } = {}) {
    const d = this.data, ip = d.inProgress, rec = this.mission(id);
    if (ip?.countable) commitDelta(d, { ...counters, peakGrown: 0 }, ip.committed);
    delete d.inProgress;
    const firstClear = r.ok && rec.clears === 0;
    const before = VENUE_IDS.filter((v) => this.venueOpen(v));
    const starsBefore = rec.stars;
    rec.attempts++;
    if (r.ok) { rec.clears++; rec.failStreak = 0; rec.stars = Math.max(rec.stars, r.stars); rec.bestT = rec.bestT === null ? r.t : Math.min(rec.bestT, r.t); if (d.twinLevel) delete d.twinLevel[id]; }
    else { rec.failStreak++; rec.why[r.why ?? 'other'] = (rec.why[r.why ?? 'other'] ?? 0) + 1; if (o.twin) (d.twinLevel ??= {})[id] = (d.twinLevel[id] ?? 1) + 1; }
    const unlocked = VENUE_IDS.filter((v) => this.venueOpen(v) && !before.includes(v));
    for (const u of unlocked) d.cardQueue.push(`venue:${u}`);
    const items = evalUnlocks(d, (v) => this.venueOpen(v));
    this.save();
    return { firstClear, newStars: Math.max(0, rec.stars - starsBefore), unlocked, items };
  }
  /** 挑战关 unlock (spec §4.8): next level after ≥1★ (or skipped after 3 misses + H3); chapter k+1 after boss k */
  missionOpen(id: string): boolean {
    const i = MISSIONS.findIndex((m) => m.id === id); if (i < 0) return false;
    const m = MISSIONS[i];
    if (i === 0) return true;
    if (m.role === 'start') return (this.data.missions[`c${m.ch - 1}m7`]?.clears ?? 0) > 0;
    const prev = this.data.missions[MISSIONS[i - 1].id];
    return !!prev && (prev.clears > 0 || prev.skipped);
  }
  chapterOpen(ch: number) { return this.missionOpen(`c${ch}m1`); }
  /** the level the map points at: first open level without a clear */
  currentMission(): string { return MISSIONS.find((m) => this.missionOpen(m.id) && !(this.data.missions[m.id]?.clears > 0))?.id ?? 'c5m8'; }
  canSkip(id: string) { const m = MISSION_BY_ID[id]; const rec = this.data.missions[id]; return m.role !== 'boss' && !!rec && rec.clears === 0 && rec.failStreak >= 3; }   // spec §5.1: 3 misses in a row on a non-boss level (QA r4: not gated on the H3 card)
  skip(id: string) { this.mission(id).skipped = true; this.save(); }
  /** background / leave: commit the increment so far */
  commitProgress(now: Counters) {
    const ip = this.data.inProgress; if (!ip) return;
    if (ip.mode === 'mission') { if (ip.countable) ip.committed = commitDelta(this.data, { ...now, peakGrown: 0 }, ip.committed); this.save(); return; }
    ip.committed = commitDelta(this.data, now, ip.committed);
    this.save();
  }
  /** player left mid-match: commit the increments, no rank (spec §3.18) */
  leaveMatch(now: Counters) {
    const ip = this.data.inProgress; if (!ip) return;
    if (ip.mode === 'mission') { if (ip.countable) commitDelta(this.data, { ...now, peakGrown: 0 }, ip.committed); delete this.data.inProgress; evalUnlocks(this.data, (v) => this.venueOpen(v)); this.save(); return; }
    commitDelta(this.data, now, ip.committed);
    if (ip.venue && ip.mode === 'timed') { const v = this.data.venues[ip.venue]; v.bestPeak = Math.max(v.bestPeak, now.peakGrown); }
    delete this.data.inProgress; this.save();
  }

  /** match end: commit, records, heat, trophies → list of new things (cards) */
  endMatch(r: MatchResult): { newRecord: boolean; lifeRecord: boolean; trophies: string[]; unlocked: VenueId[]; items: string[]; heat: { from: number; to: number } } {
    const d = this.data, ip = d.inProgress;
    commitDelta(d, r.counters, ip?.committed ?? zeroCounters());
    delete d.inProgress;
    const v = d.venues[r.venue];
    const before = VENUE_IDS.filter((id) => this.venueOpen(id));
    let newRecord = false, lifeRecord = false; const trophies: string[] = []; const heatFrom = v.heat;
    if (r.mode === 'timed') {
      newRecord = r.peak > v.bestPeak && v.played > 0;
      v.played++; d.life.timedPlayed++;
      if (r.rank <= 3) { v.podiums++; d.life.podiums++; }
      if (r.rank === 1) { v.wins++; d.life.wins++; }
      v.bestRank = v.bestRank === null ? r.rank : Math.min(v.bestRank, r.rank);
      v.bestPeak = Math.max(v.bestPeak, r.peak); v.bestKills = Math.max(v.bestKills, r.kills);
      const h = nextHeat(v.heat, [...v.recentRanks, r.rank]); v.heat = h.heat; v.recentRanks = h.recent;
      for (const t of TROPHIES[r.venue]) {
        const id = `trophy:${r.venue}.${t.id}`; if (d.owned.includes(id)) continue;
        const c = t.cond;
        const ok = (c.rankLE === undefined || r.rank <= c.rankLE) && (c.killsGE === undefined || r.kills >= c.killsGE) && (c.cutGE === undefined || r.cut >= c.cutGE) && (c.peakGE === undefined || r.peak >= c.peakGE);
        if (ok) { d.owned.push(id); trophies.push(id); d.cardQueue.push(id); }
      }
    } else {
      newRecord = r.peak > v.endless.bestPeak && v.endless.runs > 0;
      lifeRecord = r.lifeSec > v.endless.bestLife && v.endless.runs > 0 && r.lifeSec >= 60;
      v.endless.runs++; v.endless.bestPeak = Math.max(v.endless.bestPeak, r.peak); v.endless.bestLife = Math.max(v.endless.bestLife, r.lifeSec);
    }
    const day = today();
    if (d.session.day !== day || Date.now() - d.session.lastEndAt > 30 * 60e3) d.session = { day, matchesInRow: 0, lastEndAt: 0 };
    d.session.matchesInRow++; d.session.lastEndAt = Date.now();
    const unlocked = VENUE_IDS.filter((id) => this.venueOpen(id) && !before.includes(id));
    for (const u of unlocked) d.cardQueue.push(`venue:${u}`);
    const items = evalUnlocks(d, (id) => this.venueOpen(id));
    this.save();
    return { newRecord, lifeRecord, trophies, unlocked, items, heat: { from: heatFrom, to: v.heat } };
  }

  /** venue unlock (spec §4.8): chapter boss cleared, or 2 podiums in the previous venue */
  venueOpen(id: VenueId) {
    const u = UNLOCK[id]; if (!u) return true;
    if ((this.data.missions[u.mission]?.clears ?? 0) > 0) return true;
    return this.data.venues[u.orPodiums.venue].podiums >= u.orPodiums.n;
  }
  trophiesOf(id: VenueId) { return TROPHIES[id].map((t) => ({ ...t, owned: this.data.owned.includes(`trophy:${id}.${t.id}`) })); }

  /** voice lifetime caps (spec §7.5) */
  voiceCount(group: string) { return this.data.voiceSeen[group] ?? 0; }
  voiceBump(group: string) { this.data.voiceSeen[group] = (this.data.voiceSeen[group] ?? 0) + 1; }
  seen(tip: string) { return this.data.seenTips.includes(tip); }
  markSeen(tip: string) { if (!this.seen(tip)) { this.data.seenTips.push(tip); this.save(); } }
  /** tip lines per death cause: first 2 per cause per day (spec §5.2) */
  tipAllowed(cause: string) {
    const day = today(); if (this.data.tipDay.day !== day) this.data.tipDay = { day, byCause: {} };
    const n = this.data.tipDay.byCause[cause] ?? 0; if (n >= 2) return false;
    this.data.tipDay.byCause[cause] = n + 1; return true;
  }
  boostSide(): 'left' | 'right' {
    const s = this.data.settings; if (s.boostSide !== 'auto') return s.boostSide;
    return s.control === 'follow' ? 'left' : 'right';
  }
}
