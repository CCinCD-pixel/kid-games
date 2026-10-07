// V6 (spec §4.6, §9.1): re-expanding every v1 plan (volumes 1 and 2) with its frozen p reproduces
// content/gear-fort/levels/<id>.json exactly, and the shipped levels satisfy G1–G11 (G7 = C's on-screen peak, judged by V8;
// G12 applies to newly generated levels only).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildLevel, SHARE, sec, CARD_UNLOCK, ENEMY_INTRO, FLOORS } from './levelgen';
import { DEFS_V1, DEFS_V2 } from '../../tools/plans-v1';
import { FEARS } from './tags';
import { KIND_THREAT, ENEMIES } from './tables';
import { TPS, T } from './rules';
import type { Level } from './types';

const C = path.resolve(__dirname, '../../../../content/gear-fort/levels');
const shipped = (id: string): Level & Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(C, `${id}.json`), 'utf8'));
const norm = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
const LV = DEFS_V1.map((d) => shipped(d.id));
type Sp = [number, number, string, number];
const sp = (l: Level): Sp[] => l.spawns as unknown as Sp[];

describe('V6 level generator (volume 1)', () => {
  it('re-expansion with the frozen p = the shipped JSON, byte for byte', () => {
    expect(DEFS_V1.map((d) => d.id)).toEqual(Array.from({ length: 11 }, (_, i) => `1-${i + 1}`));
    // the content exporter adds child-facing fields after generation (voice ids, 宋城修复 art, 驿站, the bot's jinnang key)
    const EXPORT = ['botJinnang', 'inn', 'repair', 'voice'];
    for (const d of DEFS_V1) {
      const s = shipped(d.id); const g = norm(buildLevel(d, s.p as number)) as Record<string, unknown>; const want = { ...s } as Record<string, unknown>;
      expect(g.jinnang, d.id).toBe(s.botJinnang ?? s.jinnang); for (const k of [...EXPORT, 'jinnang']) { delete want[k]; delete g[k]; }
      expect(g, d.id).toEqual(want);
    }
  });
  it('the generator is deterministic and p only scales (same kind prefix for every p)', () => {
    const d = DEFS_V1.find((x) => x.id === '1-4')!;
    expect(norm(buildLevel(d, 0.7))).toEqual(norm(buildLevel(d, 0.7)));
    const kinds = (p: number): string[] => sp(buildLevel(d, p)).filter((s) => s[0] < sec(95)).map((s) => s[2]);
    const a = kinds(0.6), b = kinds(0.9); expect(a.slice(0, 4)).toEqual(b.slice(0, 4));
  });
  it('G1 one new card + one new machine at most; together they are a pair (the new card counters the new machine)', () => {
    for (const l of LV) {
      const cards = Object.entries(CARD_UNLOCK).filter(([, at]) => at === l.id).map(([c]) => c); const kinds = Object.entries(ENEMY_INTRO).filter(([, at]) => at === l.id).map(([k]) => k);
      expect(cards.length, l.id).toBeLessThanOrEqual(1); expect(kinds.length, l.id).toBeLessThanOrEqual(1);
      if (cards.length && kinds.length && kinds[0] !== 'walker') expect(FEARS[kinds[0]], l.id).toContain(cards[0]);
    }
  });
  it('G2 a first appearance is fixed and alone (no other spawn within ±10 s)', () => {
    for (const l of LV) { if (l.boss) continue; for (const it of sp(l).filter((s) => s[3])) expect(sp(l).filter((s) => !s[3] && Math.abs(s[0] - it[0]) <= 10 * TPS), l.id).toEqual([]); }
  });
  it('G3 大波 floor: threat in the 15 s after the first / last flag ≥ 50 / 80 (not tutorial, boss, 急报)', () => {
    for (const l of LV) {
      if (['tutorial', 'boss', 'conveyor'].includes(l.type as string)) continue;
      const th = (t: number): number => sp(l).filter((s) => s[0] >= t && s[0] < t + 15 * TPS).reduce((a, s) => a + KIND_THREAT(s[2]), 0);
      const f = l.flags || []; expect(th(f[0]), l.id).toBeGreaterThanOrEqual(FLOORS[1][0]); expect(th(f[f.length - 1]), l.id).toBeGreaterThanOrEqual(FLOORS[1][1]);
    }
  });
  it('G4 quiet opening: the first machine comes at ≥ 15 s (tutorial 1-1) / ≥ 18 s, never before the child can act', () => {
    for (const l of LV) expect(Math.min(...sp(l).map((s) => s[0])) / TPS, l.id).toBeGreaterThanOrEqual(l.id === '1-1' ? 15 : 18);
  });
  it('G5 concept share: after its intro the new machine carries ≥ its share of the threat in a teach level', () => {
    for (const l of LV) {
      const ne = l.newEnemy as string | undefined; if (l.type !== 'teach' || !ne || ne === 'flyer') continue;
      const k = ne === 'ant' ? 'swarm' : ne; const t0 = (sp(l).find((s) => s[3])?.[0] ?? 0) + 200; const after = sp(l).filter((s) => s[0] > t0 && !s[3]);
      const tot = after.reduce((a, s) => a + KIND_THREAT(s[2]), 0), mine = after.filter((s) => s[2] === k).reduce((a, s) => a + KIND_THREAT(s[2]), 0);
      expect(mine / tot, l.id).toBeGreaterThanOrEqual((SHARE[ne] ?? SHARE.default) - 1e-9);
    }
  });
  it('G6 no silence > 16 s between spawns except across a first appearance (its cleared ±10 s + 16 = 26 s); idle P90 is V8', () => {
    for (const l of LV) {
      const s = sp(l); const intros = s.filter((x) => x[3]).map((x) => x[0]);
      for (let i = 1; i < s.length; i++) { const gap = (s[i][0] - s[i - 1][0]) / TPS; const nearIntro = intros.some((t) => t >= s[i - 1][0] && t <= s[i][0]); expect(gap, `${l.id} @${s[i][0] / TPS}s`).toBeLessThanOrEqual(nearIntro ? 26 : 16); }
    }
  });
  it('G8 reaction window ≥ 6 s for the fastest machine (W is also re-judged by V8)', () => {
    for (const l of LV) {
      const kinds = new Set(sp(l).map((s) => (s[2] === 'swarm' ? 'ant' : s[2])).filter((k) => ENEMIES[k]));
      for (const k of kinds) { const D = ENEMIES[k] as unknown as { speed: number; speedMax?: number }; const v = ((k === 'ram' ? D.speedMax! : D.speed) * TPS) / T; expect((8 - 3) / v, `${l.id} ${k}`).toBeGreaterThanOrEqual(6); }
    }
  });
  it('G10 (volume-1 part) a machine that fears ONE card only (冲车 ↔ 铁蒺藜) appears only where that card can be fielded', () => {
    for (const l of LV) {
      if (!sp(l).some((s) => s[2] === 'ram')) continue;
      const deck = [...((l.loadout as string[]) || []), ...((l.pool as string[]) || []), ...(((l.belt as { seq?: string[] }) || {}).seq || [])];
      expect(deck, l.id).toContain('spikes');
    }
  });
  it('G11 rhythm: neighbours never share flag count + times; no flag time in > 40 % of levels; a short, a 3-flag and a special level', () => {
    const times: Record<number, number> = {};
    LV.forEach((l, i) => { for (const f of l.flags || []) times[f] = (times[f] || 0) + 1; if (i) expect(JSON.stringify(l.flags), l.id).not.toBe(JSON.stringify(LV[i - 1].flags)); });
    expect(Math.max(...Object.values(times)) / LV.length).toBeLessThanOrEqual(0.4);
    expect(LV.filter((l) => (l.flags || []).length === 1 && l.type !== 'tutorial' && l.type !== 'boss').map((l) => l.id)).toContain('1-5');
    expect(LV.filter((l) => (l.flags || []).length === 3).map((l) => l.id)).toContain('1-8');
    expect(LV.filter((l) => l.type === 'conveyor').map((l) => l.id)).toEqual(['1-6']);
  });
});

// ───────────── volume 2 and the cross-volume rules (G9, G10, G11 over all 22 levels) ─────────────
const LV2 = DEFS_V2.map((d) => shipped(d.id));
const ALL = [...LV, ...LV2];
const OLD = new Set(['walker', 'shielder', 'ram', 'swarm', 'brute']); // volume-1 machines
const kindsOf = (l: Level): Set<string> => new Set(sp(l).map((s) => s[2]));
const deckOf = (l: Level): { fixed: string[]; pool: string[] } => {
  const L = l as Level & Record<string, unknown>;
  const seal = (Array.isArray(L.seal) ? L.seal : L.seal ? [L.seal] : []) as string[];
  return { fixed: [...((L.loadout as string[]) || []), ...((L.prefill as string[]) || []), ...(((L.belt as { seq?: string[] }) || {}).seq || []), ...seal], pool: (L.pool as string[]) || [] };
};
const idx = (id: string): number => { const [a, b] = id.split('-').map(Number); return a * 100 + b; };

describe('V6 level generator (volume 2 + cross-volume)', () => {
  it('re-expansion with the frozen p = the shipped JSON, byte for byte', () => {
    expect(DEFS_V2.map((d) => d.id)).toEqual(Array.from({ length: 11 }, (_, i) => `2-${i + 1}`));
    const EXPORT = ['botJinnang', 'inn', 'repair', 'voice'];
    for (const d of DEFS_V2) {
      const s = shipped(d.id); const g = norm(buildLevel(d, s.p as number)) as Record<string, unknown>; const want = { ...s } as Record<string, unknown>;
      expect(g.jinnang, d.id).toBe(s.botJinnang ?? s.jinnang); for (const k of [...EXPORT, 'jinnang']) { delete want[k]; delete g[k]; }
      expect(g, d.id).toEqual(want);
    }
  });
  it('G1 one new card + one new machine at most; a pair counters (2-2 转射机/木鹊, 2-6 钩拒/云梯车)', () => {
    const pairs: string[] = [];
    for (const l of LV2) {
      const cards = Object.entries(CARD_UNLOCK).filter(([, at]) => at === l.id).map(([c]) => c); const kinds = Object.entries(ENEMY_INTRO).filter(([, at]) => at === l.id).map(([k]) => k);
      expect(cards.length, l.id).toBeLessThanOrEqual(1); expect(kinds.length, l.id).toBeLessThanOrEqual(1);
      if (cards.length && kinds.length) { expect(FEARS[kinds[0]], l.id).toContain(cards[0]); pairs.push(`${l.id} ${cards[0]}/${kinds[0]}`); }
    }
    expect(pairs).toEqual(['2-2 radial/flyer', '2-6 hook/ladder']);
  });
  it('G2 a first appearance is fixed and alone (no other spawn within ±10 s)', () => {
    for (const l of LV2) { if (l.boss) continue; for (const it of sp(l).filter((s) => s[3])) expect(sp(l).filter((s) => !s[3] && Math.abs(s[0] - it[0]) <= 10 * TPS), l.id).toEqual([]); }
  });
  it('G3 大波 floor: threat in the 15 s after the first / last flag ≥ 70 / 100 (not boss, 急报)', () => {
    for (const l of LV2) {
      if (['tutorial', 'boss', 'conveyor'].includes(l.type as string)) continue;
      const th = (t: number): number => sp(l).filter((s) => s[0] >= t && s[0] < t + 15 * TPS).reduce((a, s) => a + KIND_THREAT(s[2]), 0);
      const f = l.flags || []; expect(th(f[0]), l.id).toBeGreaterThanOrEqual(FLOORS[2][0]); expect(th(f[f.length - 1]), l.id).toBeGreaterThanOrEqual(FLOORS[2][1]);
    }
  });
  it('G4 quiet opening: ≥ 20 s by day; night levels give time for a 粮仓 (≥ 35 s; the boss opens with 420 grain instead)', () => {
    for (const l of LV2) {
      const first = Math.min(...sp(l).map((s) => s[0])) / TPS; const night = !!(l.env as { night?: boolean } | undefined)?.night;
      expect(first, l.id).toBeGreaterThanOrEqual(night && !l.boss ? 35 : 20);
    }
  });
  it('G5 concept share after the intro in a teach level (云梯车 ≥ 35 %, 烟车 ≥ 30 %; 木鹊 only by its authored leads)', () => {
    for (const l of LV2) {
      const ne = l.newEnemy as string | undefined; if (l.type !== 'teach' || !ne || ne === 'flyer') continue;
      const t0 = (sp(l).find((s) => s[3])?.[0] ?? 0) + 200; const after = sp(l).filter((s) => s[0] > t0 && !s[3]);
      const tot = after.reduce((a, s) => a + KIND_THREAT(s[2]), 0), mine = after.filter((s) => s[2] === ne).reduce((a, s) => a + KIND_THREAT(s[2]), 0);
      expect(mine / tot, l.id).toBeGreaterThanOrEqual((SHARE[ne] ?? SHARE.default) - 1e-9);
    }
  });
  it('G6 no silence > 16 s between spawns except across a first appearance', () => {
    for (const l of LV2) {
      const s = sp(l); const intros = s.filter((x) => x[3]).map((x) => x[0]);
      for (let i = 1; i < s.length; i++) { const gap = (s[i][0] - s[i - 1][0]) / TPS; const nearIntro = intros.some((t) => t >= s[i - 1][0] && t <= s[i][0]); expect(gap, `${l.id} @${s[i][0] / TPS}s`).toBeLessThanOrEqual(nearIntro ? 26 : 16); }
    }
  });
  it('G8 reaction window ≥ 5 s for the fastest machine of volume 2', () => {
    for (const l of LV2) {
      const kinds = new Set(sp(l).map((s) => (s[2] === 'swarm' ? 'ant' : s[2])).filter((k) => ENEMIES[k]));
      for (const k of kinds) { const D = ENEMIES[k] as unknown as { speed: number; speedMax?: number }; const v = ((k === 'ram' ? D.speedMax! : D.speed) * TPS) / T; expect((8 - 3) / v, `${l.id} ${k}`).toBeGreaterThanOrEqual(5); }
    }
  });
  it('G9 interleave: every volume-2 level brings ≥ 1 volume-1 machine; ≥ 20 % bring ≥ 2 (measured: 11/11)', () => {
    const n = LV2.map((l) => [...kindsOf(l)].filter((k) => OLD.has(k)).length);
    for (const [i, l] of LV2.entries()) expect(n[i], l.id).toBeGreaterThanOrEqual(1);
    expect(n.filter((x) => x >= 2).length / LV2.length).toBeGreaterThanOrEqual(0.2);
    expect(n.filter((x) => x >= 2).length).toBe(11);
  });
  it('G10 card interleave: after its teach level every card is fixed/送来/预填/印 in ≥ 2 levels or choosable in ≥ 3', () => {
    for (const [card, at] of Object.entries(CARD_UNLOCK)) {
      if (idx(at) >= 300) continue; // volumes 3–4 = v2
      const later = ALL.filter((l) => idx(l.id) > idx(at)); if (!later.length) continue;
      const fixed = later.filter((l) => deckOf(l).fixed.includes(card)).length, pool = later.filter((l) => deckOf(l).pool.includes(card)).length;
      expect(fixed >= 2 || pool >= 3, `${card} (taught ${at}): fixed ${fixed}, pool ${pool}`).toBe(true);
    }
  });
  it('G10 a machine that fears ONE card only (冲车↔铁蒺藜, 云梯车↔钩拒, 蚁傅↔火油罐) appears only where that card can be fielded', () => {
    const single = Object.entries(FEARS).filter(([k, f]) => f.length === 1 && ENEMIES[k]).map(([k, f]) => [k === 'ant' ? 'swarm' : k, f[0]]);
    expect(single.map((x) => x[0])).toEqual(expect.arrayContaining(['ram', 'ladder']));
    for (const l of ALL) for (const [k, card] of single) {
      if (!kindsOf(l).has(k)) continue; const d = deckOf(l);
      expect([...d.fixed, ...d.pool], `${l.id} ${k} needs ${card}`).toContain(card);
    }
  });
  it('G11 rhythm over all 22: neighbours never share flags; no flag time in > 40 %; volume 2 has its short (2-3), 3-flag (2-9) and special (2-7)', () => {
    const times: Record<number, number> = {};
    ALL.forEach((l, i) => { for (const f of l.flags || []) times[f] = (times[f] || 0) + 1; if (i) expect(JSON.stringify(l.flags), l.id).not.toBe(JSON.stringify(ALL[i - 1].flags)); });
    expect(Math.max(...Object.values(times)) / ALL.length).toBeLessThanOrEqual(0.4);
    expect(LV2.filter((l) => (l.flags || []).length === 1 && l.type !== 'boss').map((l) => l.id)).toEqual(['2-3']);
    expect(LV2.filter((l) => (l.flags || []).length === 3).map((l) => l.id)).toEqual(['2-9']);
    expect(LV2.filter((l) => l.type === 'conveyor').map((l) => l.id)).toEqual(['2-7']);
  });
});
