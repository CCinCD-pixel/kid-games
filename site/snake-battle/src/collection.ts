/**
 * 收藏 (spec §4.6, §4.8, §5.4): 18 skins + crown + 6 trails + 14 badges, each with ONE deterministic
 * milestone (no currency, no randomness). `evalUnlocks` runs right after every save commit; anything newly
 * reached is added to `owned` and queued as an unlock card. `progressOf` feeds the locked cards' bars.
 */
import collection from '../../../content/snake-battle/collection.json';
import { VENUE_IDS, type VenueId } from './sim/venues';
import { MISSIONS } from './sim/mission';
import type { SbSaveV1 } from './save';

export interface Cond { kind: string; n?: number; sec?: number; ch?: number; id?: string; venue?: string; kind2?: string }
export interface Item { id: string; name: string; family?: string; base?: string; accent?: string; pattern?: string; head?: string; eyes?: string; fact?: string; unlock?: Cond; cond?: Cond }
export const C = collection as unknown as { skins: Item[]; crown: Item; trails: Item[]; badges: Item[] };
export type Kind = 'skin' | 'trail' | 'badge' | 'crown';
export const allItems = (): { key: string; kind: Kind; item: Item; cond: Cond }[] => [
  ...C.skins.map((it) => ({ key: `skin:${it.id}`, kind: 'skin' as const, item: it, cond: it.unlock! })),
  { key: 'crown', kind: 'crown' as const, item: C.crown, cond: C.crown.unlock! },
  ...C.trails.map((it) => ({ key: `trail:${it.id}`, kind: 'trail' as const, item: it, cond: it.unlock! })),
  ...C.badges.map((it) => ({ key: `badge:${it.id}`, kind: 'badge' as const, item: it, cond: it.cond! })),
];

export const starsTotal = (d: SbSaveV1) => Object.values(d.missions).reduce((a, m) => a + (m.stars ?? 0), 0);
export const missionsDone = (d: SbSaveV1) => Object.values(d.missions).filter((m) => m.clears > 0).length;
const chapterDone = (d: SbSaveV1, ch: number) => (d.missions[`c${ch}m7`]?.clears ?? 0) > 0;
/** longest length grown in 限时赛 / 无尽 (missions never count, §3.22) */
export const bestLength = (d: SbSaveV1) => Math.max(0, ...VENUE_IDS.map((v) => Math.max(d.venues[v].bestPeak, d.venues[v].endless.bestPeak)));

/** progress toward a condition: { cur, n } (n = 1 for yes/no conditions) */
export function progressOf(c: Cond, d: SbSaveV1, venueOpen: (v: VenueId) => boolean): { cur: number; n: number } {
  const L = d.life;
  switch (c.kind) {
    case 'default': return { cur: 1, n: 1 };
    case 'timedPlayed': return { cur: L.timedPlayed, n: c.n! };
    case 'meteors': return { cur: L.meteors, n: c.n! };
    case 'kills': return { cur: L.kills, n: c.n! };
    case 'cutKills': return { cur: L.cut, n: c.n! };
    case 'encircleKills': return { cur: L.enc, n: c.n! };
    case 'podiums': return { cur: L.podiums, n: c.n! };
    case 'wins': return { cur: L.wins, n: c.n! };
    case 'multi': return { cur: L.multiMax, n: c.n! };
    case 'streak': return { cur: L.streakMax, n: c.n! };
    case 'shieldSaves': return { cur: L.shieldSaves, n: c.n! };
    case 'nearMiss': return { cur: L.near, n: c.n! };
    case 'boostSec': return { cur: L.boostSec, n: c.sec! };
    case 'pu': return { cur: c.kind2 === 'speed' ? L.speedPu : 0, n: c.n! };
    case 'length': return { cur: bestLength(d), n: c.n! };
    case 'endlessLength': return { cur: Math.max(0, ...VENUE_IDS.map((v) => d.venues[v].endless.bestPeak)), n: c.n! };
    case 'endlessLife': return { cur: Math.max(0, ...VENUE_IDS.map((v) => d.venues[v].endless.bestLife)), n: c.sec! };
    case 'stars': return { cur: starsTotal(d), n: c.n! };
    case 'missionsDone': return { cur: missionsDone(d), n: c.n! };
    case 'chapter': return { cur: chapterDone(d, c.ch!) ? 1 : 0, n: 1 };
    case 'mission': return { cur: (d.missions[c.id!]?.clears ?? 0) > 0 ? 1 : 0, n: 1 };
    case 'podium': return { cur: d.venues[c.venue as VenueId]?.podiums ?? 0, n: c.n! };
    case 'venueUnlocked': return { cur: venueOpen(c.venue as VenueId) ? 1 : 0, n: 1 };
    default: return { cur: 0, n: 1 };
  }
}

/** one line for a locked card / unlock card (≤15 chars where possible) */
export function condText(c: Cond): string {
  const ch = ['', '第一章', '第二章', '第三章', '第四章', '第五章'];
  const vn: Record<string, string> = { moon: '月球场', mars: '火星场', jupiter: '木星场', blackhole: '黑洞场' };
  switch (c.kind) {
    case 'default': return '一开始就有';
    case 'timedPlayed': return `玩 ${c.n} 局限时赛`;
    case 'meteors': return `吃到 ${c.n} 颗流星糖`;
    case 'kills': return `一共击败 ${c.n} 条蛇`;
    case 'cutKills': return `截住 ${c.n} 次`;
    case 'encircleKills': return `围住 ${c.n} 次`;
    case 'podiums': return `限时赛进前三 ${c.n} 次`;
    case 'wins': return `限时赛拿第一 ${c.n} 次`;
    case 'multi': return `一局里 ${c.n} 连击`;
    case 'streak': return `一条命击败 ${c.n} 条`;
    case 'shieldSaves': return `护盾救你 ${c.n} 次`;
    case 'nearMiss': return `好险 ${c.n} 次`;
    case 'boostSec': return `一共加速 ${c.sec} 秒`;
    case 'pu': return `吃到 ${c.n} 个闪电`;
    case 'length': return `比赛里长到 ${c.n}`;
    case 'endlessLength': return `无尽里长到 ${c.n}`;
    case 'endlessLife': return `无尽里坚持 ${Math.round(c.sec! / 60)} 分钟`;
    case 'stars': return `挑战关拿到 ${c.n} 颗星`;
    case 'missionsDone': return `通过 ${c.n} 个挑战关`;
    case 'chapter': return `通过${ch[c.ch!]}`;
    case 'mission': { const m = MISSIONS.find((x) => x.id === c.id); return m ? `通过「${m.title}」` : '通过挑战关'; }
    case 'podium': return `${vn[c.venue!] ?? ''}进前三`;
    case 'venueUnlocked': return `打开${vn[c.venue!] ?? ''}`;
    default: return '';
  }
}

/** add every newly reached item to `owned` + the card queue; returns the new keys */
export function evalUnlocks(d: SbSaveV1, venueOpen: (v: VenueId) => boolean): string[] {
  const out: string[] = [];
  for (const it of allItems()) {
    if (d.owned.includes(it.key)) continue;
    const p = progressOf(it.cond, d, venueOpen);
    if (p.cur >= p.n) { d.owned.push(it.key); d.cardQueue.push(it.key); out.push(it.key); }
  }
  return out;
}
