/**
 * Parent-page numbers from the local play log (kit/log). Pure functions, unit-tested
 * (tests/unit/parent-stats.test.ts). Only active (visible) time counts; the hub and platform pages
 * are browsing, not play. Days are local calendar days.
 */
import type { HubEntry } from 'virtual:kg-registry';
import type { LaunchSource, SessionRecord } from '@kit/log';

export type Place = HubEntry['place'];
export const PLACES: Place[] = ['base', 'playground', 'classic'];
export const PLACE_NAMES: Record<Place, string> = { base: '基地（学习）', playground: '游乐场（休息）', classic: '经典角（旧版）' };

const PLATFORM = new Set(['hub', 'parent', 'credits', 'dev-kit']);
const DAY = 86_400_000;

export const DOMAIN_NAMES: Record<string, string> = {
  number: '数学', literacy: '阅读识字', spatial: '空间', planning: '规划', coding: '编程', science: '科学',
  engineering: '工程', strategy: '策略', social: '社会情感', measurement: '测量', creativity: '创造',
  memory: '记忆', reflex: '反应', relax: '放松',
};

/** Local midnight of the day containing `t`. */
export function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const playSessions = (sessions: SessionRecord[]) => sessions.filter((s) => !PLATFORM.has(s.game) && s.activeMs > 0);

export interface DayBar {
  start: number;
  /** minutes per place */
  minutes: Record<Place, number>;
  total: number;
}

/** Last `days` calendar days (oldest first), minutes per place. Unknown games count as classic. */
export function dailyBars(sessions: SessionRecord[], placeOf: (game: string) => Place | undefined, days = 14, now = Date.now()): DayBar[] {
  const today = dayStart(now);
  const bars: DayBar[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const start = dayStart(today - i * DAY + DAY / 2); // DST-safe
    bars.push({ start, minutes: { base: 0, playground: 0, classic: 0 }, total: 0 });
  }
  const index = new Map(bars.map((b, i) => [b.start, i]));
  for (const s of playSessions(sessions)) {
    const i = index.get(dayStart(s.start));
    if (i === undefined) continue;
    const p = placeOf(s.game) ?? 'classic';
    const m = s.activeMs / 60_000;
    bars[i].minutes[p] += m;
    bars[i].total += m;
  }
  return bars;
}

export interface Totals {
  minutes: number;
  sessions: number;
  activeDays: number;
  /** minutes per place */
  byPlace: Record<Place, number>;
}

export function totals(sessions: SessionRecord[], placeOf: (game: string) => Place | undefined, days: number, now = Date.now()): Totals {
  const since = dayStart(now) - (days - 1) * DAY;
  const out: Totals = { minutes: 0, sessions: 0, activeDays: 0, byPlace: { base: 0, playground: 0, classic: 0 } };
  const dayset = new Set<number>();
  for (const s of playSessions(sessions)) {
    if (s.start < since) continue;
    const m = s.activeMs / 60_000;
    out.minutes += m;
    out.sessions += 1;
    out.byPlace[placeOf(s.game) ?? 'classic'] += m;
    dayset.add(dayStart(s.start));
  }
  out.activeDays = dayset.size;
  return out;
}

export interface GameStat {
  game: string;
  minutes: number;
  sessions: number;
  lastPlayed: number | null;
}

/** Per-game minutes/sessions in the window plus the all-time last play, sorted by minutes. */
export function perGame(sessions: SessionRecord[], days: number, now = Date.now()): GameStat[] {
  const since = dayStart(now) - (days - 1) * DAY;
  const map = new Map<string, GameStat>();
  for (const s of playSessions(sessions)) {
    const g = map.get(s.game) ?? { game: s.game, minutes: 0, sessions: 0, lastPlayed: null };
    g.lastPlayed = Math.max(g.lastPlayed ?? 0, s.lastBeat);
    if (s.start >= since) {
      g.minutes += s.activeMs / 60_000;
      g.sessions += 1;
    }
    map.set(s.game, g);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes || (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
}

/** How games were opened (engagement: his own choice vs the hub's suggestion), in the window. */
export function launchShares(sessions: SessionRecord[], days: number, now = Date.now()): Record<LaunchSource, number> & { total: number } {
  const since = dayStart(now) - (days - 1) * DAY;
  const out = { hub: 0, suggested: 0, resume: 0, direct: 0, total: 0 };
  for (const s of playSessions(sessions)) {
    if (s.start < since) continue;
    out[s.source] += 1;
    out.total += 1;
  }
  return out;
}

/** Minutes per ability domain (a game's minutes split evenly over its domains). Parent-facing only. */
export function domainMinutes(stats: GameStat[], domainsOf: (game: string) => string[] | undefined): [string, number][] {
  const out = new Map<string, number>();
  for (const g of stats) {
    const ds = domainsOf(g.game);
    if (!ds?.length || g.minutes <= 0) continue;
    for (const d of ds) out.set(d, (out.get(d) ?? 0) + g.minutes / ds.length);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

export function fmtMinutes(m: number): string {
  if (m < 1) return m > 0 ? '不到 1 分钟' : '0 分钟';
  if (m < 60) return `${Math.round(m)} 分钟`;
  const h = Math.floor(m / 60);
  const r = Math.round(m - h * 60);
  return r ? `${h} 小时 ${r} 分` : `${h} 小时`;
}

export function fmtAgo(t: number | null, now = Date.now()): string {
  if (!t) return '还没玩过';
  const days = Math.round((dayStart(now) - dayStart(t)) / DAY);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
