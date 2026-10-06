/**
 * Star designer (spec §4.9, §5.3; port of the prototype's star-designer.mjs). Samples each level with the
 * production sim (KID for the bands, NOVICE / EXPERT for context), then proposes ★★ / ★★★ condition pairs
 * from the level's candidate families so the KID rates land in the bands — non-boss 2★ 30–75 % (target
 * 55 %), 3★ 10–45 % (25 %); boss 2★ 15–60 % (35 %), 3★ 5–35 % (18 %). Rules: ≤1 time condition; none on
 * the first-run levels (c1m1–c1m3) or breathers. Stars never steer the bots, so sampling once is enough.
 *   SB_LEVELS=c3m1,c3m2 [SB_N=120] npx vitest run site/snake-battle/tools/star-designer.test.ts
 *   → ~/kid-games-work/snake-battle/star-designer.txt
 */
import fs from 'node:fs';
import os from 'node:os';
import { it } from 'vitest';
import { MISSIONS, runMission, type Mission, type MissionResult } from '../src/sim/mission';

type Cond = { type: string; sec?: number; n?: number; kind?: string; tag?: string };
type Run = { ok: boolean; t: number; mass: number; eaten: number; big: number; meteors: number; puKinds: Record<string, number>; kills: number; cut: number; enc: number; killRatio: number; rank: number; deaths: number; bumps: number; aiMeteors: number; multi: number; shieldSaves: number; near: number };
const FIRST = ['c1m1', 'c1m2', 'c1m3'];
const toRun = (r: MissionResult): Run => ({ ok: r.ok, t: r.t, mass: r.mass, eaten: r.eaten, big: r.big, meteors: r.meteors, puKinds: r.puKinds, kills: r.kills, cut: r.killTags.filter((k) => k === 'cut').length, enc: r.killTags.filter((k) => k === 'encircle').length, killRatio: r.killRatio, rank: r.rank, deaths: r.deaths, bumps: r.bumps, aiMeteors: r.aiMeteors, multi: r.bestMulti, shieldSaves: r.shieldSaves, near: r.near });
export function passStar(c: Cond, r: Run): boolean {
  switch (c.type) {
    case 'clear': return true;
    case 'timeLE': return r.t <= c.sec! + 1e-6;
    case 'massGE': return r.mass >= c.n!;
    case 'eatGE': return (c.kind === 'any' ? r.eaten : c.kind === 'big' ? r.big : c.kind === 'meteor' ? r.meteors : 0) >= c.n!;
    case 'puGE': return (r.puKinds[c.kind!] ?? 0) >= c.n!;
    case 'killsGE': return r.kills >= c.n!;
    case 'killTagGE': return (c.tag === 'cut' ? r.cut : c.tag === 'encircle' ? r.enc : 0) >= c.n!;
    case 'killRatioGE': return r.killRatio >= c.n!;
    case 'rankLE': return r.rank <= c.n!;
    case 'deathsLE': return r.deaths <= c.n!;
    case 'bumpsLE': return r.bumps <= c.n!;
    case 'aiMeteorsLE': return r.aiMeteors <= c.n!;
    case 'multiGE': return r.multi >= c.n!;
    case 'shieldSavesGE': return r.shieldSaves >= c.n!;
    case 'nearGE': return r.near >= c.n!;
    default: throw new Error(c.type);
  }
}
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const PS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const FAM: Record<string, (rs: Run[]) => Cond[]> = {
  time: (rs) => PS.map((p) => ({ type: 'timeLE', sec: Math.ceil(q(rs.filter((r) => r.ok).map((r) => r.t), p)) })),
  mass: (rs) => PS.map((p) => ({ type: 'massGE', n: Math.max(1, Math.floor(q(rs.filter((r) => r.ok).map((r) => r.mass), p) / 5) * 5) })),
  big: () => [1, 2, 3, 4, 5, 6, 8].map((n) => ({ type: 'eatGE', kind: 'big', n })),
  any: (rs) => [0.3, 0.5, 0.7].map((p) => ({ type: 'eatGE', kind: 'any', n: Math.max(1, Math.floor(q(rs.filter((r) => r.ok).map((r) => r.eaten), p) / 5) * 5) })),
  magnet: () => [1, 2, 3].map((n) => ({ type: 'puGE', kind: 'magnet', n })),
  shield: () => [1, 2].map((n) => ({ type: 'puGE', kind: 'shield', n })),
  speed: () => [1, 2].map((n) => ({ type: 'puGE', kind: 'speed', n })),
  deaths: () => [0, 1, 2, 3, 4, 5].map((n) => ({ type: 'deathsLE', n })),
  bumps: () => [0, 1].map((n) => ({ type: 'bumpsLE', n })),
  kills: () => [1, 2, 3, 4].map((n) => ({ type: 'killsGE', n })),
  cut: () => [1, 2, 3].map((n) => ({ type: 'killTagGE', tag: 'cut', n })),
  enc: () => [1, 2, 3].map((n) => ({ type: 'killTagGE', tag: 'encircle', n })),
  ratio: () => [2.5, 3, 3.5, 4, 5].map((n) => ({ type: 'killRatioGE', n })),
  rank: () => [1, 2, 3].map((n) => ({ type: 'rankLE', n })),
  multi: () => [2, 3].map((n) => ({ type: 'multiGE', n })),
  aimet: () => [0, 1, 2, 3, 4].map((n) => ({ type: 'aiMeteorsLE', n })),
};
/** candidate families per level (design intent: visible, teachable conditions); new chapters add a row */
export const FAMS: Record<string, string[]> = {
  c1m3: ['deaths', 'big', 'mass'], c1m4: ['bumps', 'time', 'mass'], c1m5: ['time', 'mass', 'bumps'], c1m6: ['magnet', 'time', 'mass', 'big'],
  c1m7: ['rank', 'deaths', 'mass', 'kills'], c1m8: ['magnet', 'big', 'mass'], c2m1: ['mass', 'big', 'kills'], c2m2: ['mass', 'time', 'big'],
  c2m3: ['mass', 'kills', 'big'], c2m4: ['time', 'mass', 'big'], c2m5: ['bumps', 'time', 'big'], c2m6: ['mass', 'time', 'speed', 'big'],
  c2m7: ['mass', 'big', 'kills'], c2m8: ['magnet', 'big', 'mass'], c3m1: ['cut', 'deaths', 'time'], c3m2: ['cut', 'time', 'deaths'],
  c3m3: ['cut', 'time', 'deaths'], c3m4: ['deaths', 'time', 'cut', 'multi'], c3m5: ['kills', 'time', 'deaths', 'mass'], c3m6: ['cut', 'deaths', 'time'],
  c3m7: ['cut', 'rank', 'kills'], c3m8: ['mass', 'bumps', 'big'], c4m1: ['time', 'any', 'big', 'bumps'], c4m2: ['deaths', 'time', 'mass'],
  c4m3: ['deaths', 'multi', 'time'], c4m4: ['deaths', 'time', 'mass'], c4m5: ['deaths', 'mass', 'time'], c4m6: ['mass', 'kills', 'big'],
  c4m7: ['enc', 'rank', 'kills'], c4m8: ['big', 'mass', 'bumps'], c5m1: ['ratio', 'deaths', 'time'], c5m2: ['rank', 'deaths', 'kills'],
  c5m3: ['multi', 'time', 'deaths', 'cut'], c5m4: ['time', 'aimet', 'mass'], c5m5: ['deaths', 'mass', 'kills'], c5m6: ['deaths', 'time', 'cut'],
  c5m7: ['deaths', 'time', 'mass'], c5m8: ['magnet', 'big', 'mass'],
};
export const label = (c: Cond) => c.type === 'timeLE' ? `t≤${c.sec}` : c.type === 'massGE' ? `m≥${c.n}` : c.type === 'eatGE' || c.type === 'puGE' ? `${c.kind}≥${c.n}` : c.type === 'deathsLE' ? `d≤${c.n}` : c.type === 'bumpsLE' ? `bump≤${c.n}` : c.type === 'killsGE' ? `k≥${c.n}` : c.type === 'killTagGE' ? `${c.tag}≥${c.n}` : c.type === 'killRatioGE' ? `ratio≥${c.n}` : c.type === 'rankLE' ? `rank≤${c.n}` : c.type === 'multiGE' ? `multi≥${c.n}` : c.type === 'aiMeteorsLE' ? `aiMet≤${c.n}` : c.type;
export function design(m: Mission, K: Run[], N: Run[], E: Run[], top = 6) {
  const boss = m.role === 'boss', noTime = FIRST.includes(m.id) || m.role === 'breather';
  const [t2, t3] = boss ? [0.35, 0.18] : [0.55, 0.25];
  const [b2, b3] = boss ? [[0.15, 0.6], [0.05, 0.35]] : [[0.3, 0.75], [0.1, 0.45]];
  const cands: { f: string; c: Cond }[] = [];
  for (const f of FAMS[m.id] ?? Object.keys(FAM)) if (!(noTime && f === 'time')) for (const c of FAM[f](K)) cands.push({ f, c });
  const uniq = [...new Map(cands.map((x) => [JSON.stringify(x.c), x])).values()];
  const rate = (rs: Run[], c1: Cond, c2?: Cond) => rs.filter((r) => r.ok && passStar(c1, r) && (!c2 || passStar(c2, r))).length / Math.max(1, rs.length);
  const opts: { a: Cond; b: Cond; s2: number; s3: number; n2: number; n3: number; e2: number; e3: number; score: number }[] = [];
  for (const a of uniq) for (const b of uniq) {
    if (a.f === b.f) continue;
    const s2 = rate(K, a.c), s3 = rate(K, a.c, b.c);
    if (s2 < b2[0] || s2 > b2[1] || s3 < b3[0] || s3 > b3[1]) continue;
    opts.push({ a: a.c, b: b.c, s2, s3, n2: rate(N, a.c), n3: rate(N, a.c, b.c), e2: rate(E, a.c), e3: rate(E, a.c, b.c), score: Math.abs(s2 - t2) + Math.abs(s3 - t3) + (a.f === 'time' ? 0.02 : 0) });
  }
  return opts.sort((x, y) => x.score - y.score).slice(0, top);
}

const only = process.env.SB_LEVELS ? process.env.SB_LEVELS.split(',') : null;
it.skipIf(!only)('star designer (set SB_LEVELS)', () => {
  const n = Number(process.env.SB_N ?? 120), P = (x: number) => (100 * x).toFixed(0).padStart(3), out: string[] = [];
  const log = (l: string) => out.push(l);
  for (const m of MISSIONS) {
    if (!only!.includes(m.id)) continue;
    const sample = (tier: string, persona: string) => Array.from({ length: n }, (_, i) => toRun(runMission(m.id, tier, persona, 5300 + i) as MissionResult));
    const K = sample('KID', 'kid'), N = sample('NOVICE', 'novice'), E = sample('EXPERT', 'expert');
    const cur = (k: number) => K.filter((r) => r.ok && passStar(m.stars[0] as Cond, r) && (k < 3 || passStar(m.stars[1] as Cond, r))).length / n;
    log(`${m.id} ${m.role} ok ${P(K.filter((r) => r.ok).length / n)} · current ${label(m.stars[0] as Cond)} / ${label(m.stars[1] as Cond)} → KID 2★${P(cur(2))} 3★${P(cur(3))}`);
    for (const o of design(m, K, N, E)) log(`   ${label(o.a).padEnd(12)} ${label(o.b).padEnd(12)} KID 2★${P(o.s2)} 3★${P(o.s3)} | NOVICE ${P(o.n2)}/${P(o.n3)} | EXPERT ${P(o.e2)}/${P(o.e3)}`);
  }
  const file = `${os.homedir()}/kid-games-work/snake-battle/star-designer.txt`;
  fs.mkdirSync(`${os.homedir()}/kid-games-work/snake-battle`, { recursive: true }); fs.writeFileSync(file, out.join('\n') + '\n');
  process.stdout.write(`${out.join('\n')}\n→ ${file}\n`);
}, 3600_000);
