// V5 (spec §9.1): content structure — type guards, level invariants, FEARS/MUST, campaign ids, and the almanac's
// number sentences recomputed from the kernel tables (errata E1: the numbers a child reasons with must be true).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { LEVELS, ORDER, CAMPAIGN, LINES } from './content';
import { UNITS, ENEMIES, CARD_UNLOCK, BOSS_CFG } from './lane/tables';
import { FEARS, MUST } from './lane/tags';
import { SPAWN_X, TPS } from './lane/rules';
import JINNANG from '../../../content/gear-fort/jinnang.json';
import ALMANAC from '../../../content/gear-fort/almanac.json';

const STARS_SRC = fs.readFileSync(path.resolve(__dirname, 'lane/stars.ts'), 'utf8');
const kindOf = (k: string): string => (k === 'swarm' ? 'ant' : k.startsWith('boss:') ? k.slice(5) : k);
const lv = (id: string): typeof LEVELS[string] => LEVELS[id];

describe('V5 content', () => {
  it('22 levels in campaign order, each passing the type guard', () => {
    expect(ORDER.length).toBe(22); expect(Object.keys(LEVELS).sort()).toEqual([...ORDER].sort());
    for (const id of ORDER) {
      const L = lv(id) as unknown as Record<string, unknown>;
      expect(typeof L.name, id).toBe('string'); expect(Array.isArray(L.lanes) && (L.lanes as unknown[]).length, id).toBeTruthy();
      expect(Array.isArray(L.spawns), id).toBe(true); expect(Array.isArray(L.flags), id).toBe(true); expect(typeof L.start, id).toBe('number');
      for (const s of L.spawns as [number, number, string, number][]) { expect(Number.isInteger(s[0]) && s[1] >= 0 && s[1] < 5, `${id} ${s}`).toBe(true); expect(ENEMIES[kindOf(s[2])] || BOSS_CFG[kindOf(s[2]) as 'rhino'] || kindOf(s[2]) === 'ant', `${id} ${s[2]}`).toBeTruthy(); }
    }
  });
  it('every level teaches something: non-empty concept; jinnang is one of the 15', () => {
    const J = (JINNANG as unknown as { id: string }[]).map((j) => j.id); expect(J.length).toBe(15);
    for (const id of ORDER) { expect((lv(id).concept || '').length, id).toBeGreaterThan(1); if (lv(id).jinnang) expect(J, id).toContain(lv(id).jinnang); }
  });
  it('every star3 condition key is implemented in stars.ts', () => {
    for (const id of ORDER) for (const k of Object.keys(lv(id).star3 || {})) expect(STARS_SRC.includes(`case '${k}'`), `${id}: ${k}`).toBe(true);
  });
  it('spawns are sorted by time; every spawn lane is open', () => {
    for (const id of ORDER) { const sp = lv(id).spawns as unknown as [number, number][]; for (let i = 1; i < sp.length; i++) expect(sp[i][0] >= sp[i - 1][0], id).toBe(true); for (const s of sp) expect(lv(id).lanes[s[1]] !== 0 || (lv(id).lanes.length === 2), `${id} lane ${s[1]}`).toBe(true); }
  });
  it('newEnemy really is new: absent from every earlier level, present here', () => {
    const seen = new Set<string>();
    for (const id of ORDER) {
      const kinds = new Set((lv(id).spawns as unknown as [number, number, string][]).map((s) => kindOf(s[2])));
      const ne = lv(id).newEnemy ? kindOf(lv(id).newEnemy!) : null;
      if (ne) { expect(seen.has(ne), `${id} ${ne} seen before`).toBe(false); expect(kinds.has(ne), `${id} ${ne} missing`).toBe(true); }
      kinds.forEach((k) => seen.add(k));
    }
  });
  it('fixed decks only use unlocked cards; `known` lists only machines met by then', () => {
    const met = new Set<string>();
    for (const id of ORDER) {
      for (const c of lv(id).loadout || []) expect(ORDER.indexOf(CARD_UNLOCK[c]) <= ORDER.indexOf(id), `${id} ${c} (unlock ${CARD_UNLOCK[c]})`).toBe(true);
      (lv(id).spawns as unknown as [number, number, string][]).forEach((s) => met.add(kindOf(s[2])));
      for (const k of lv(id).known || []) expect(met.has(k), `${id} known ${k}`).toBe(true);
    }
  });
  it('MUST[k] ⊆ FEARS[k]', () => {
    for (const [k, m] of Object.entries(MUST)) for (const c of m as string[]) { if (!FEARS[k]) expect(UNITS[c], `${k} ${c}`).toBeTruthy(); /* Boss / Boss parts: counters are cards */ else expect(FEARS[k], `${k} ${c}`).toContain(c); }
  });
  it('campaign: two volumes of 11, every story/dock id exists', () => {
    expect(CAMPAIGN.volumes.map((v) => v.levels.length)).toEqual([11, 11]);
    for (const v of CAMPAIGN.volumes as unknown as { open: string[]; end: string[] }[]) for (const l of [...v.open, ...v.end]) expect(LINES[l], l).toBeTruthy();
  });
  it('almanac: 25 pages; the number sentences match the kernel tables', () => {
    const A = Object.fromEntries((ALMANAC as unknown as { id: string; numbers: string }[]).map((p) => [p.id, p.numbers]));
    expect(Object.keys(A).length).toBe(25);
    const has = (id: string, ...n: (number | string)[]): void => { for (const x of n) expect(A[id], `${id} ↔ ${x}`).toContain(String(x)); };
    const s = (ticks: number): string => String(+(ticks / TPS).toFixed(1));
    const U = UNITS, E = ENEMIES;
    has('shooter', s(U.shooter.period!), U.shooter.dmg!, E.walker.hp, Math.ceil(E.walker.hp / U.shooter.dmg!));
    has('wall', U.wall.hp, E.walker.bite!, Math.round(U.wall.hp / (E.walker.bite! * 2)));
    has('lobber', U.lobber.dmg!, E.shielder.hp, Math.ceil(E.shielder.hp / U.lobber.dmg!));
    has('strike', U.strike.dmg!, Math.round(U.strike.cd / TPS));
    has('burner', U.burner.dmg!, (U.burner.dmg! * 3) / 2);
    has('bank', U.bank.cost);
    has('walker', E.walker.hp, +((E.walker.speed * TPS) / 10000).toFixed(2), Math.floor(SPAWN_X / E.walker.speed / TPS));
    has('shielder', (E.shielder as unknown as { shield: number }).shield, E.shielder.hp, ((E.shielder as unknown as { shield: number }).shield + E.shielder.hp) / U.shooter.dmg!);
    has('brute', E.brute.hp, E.brute.armor!, U.shooter.dmg! - E.brute.armor!, E.brute.hp / (U.shooter.dmg! - E.brute.armor!));
    has('ant', E.ant.hp);
    has('flyer', E.flyer.hp);
  });
});

// DoD 13 (spec §9.11): the exported content is byte-identical to the prototype's frozen manifest — except the files this
// repo maintains by hand on purpose (listed, so a re-export that would overwrite them is a deliberate act): voice.json (the
// voice step's state), lines.json + narration.yaml (+53 narrator lines: 鲁班说 fallback, voiced 附加题 — fix r1) and
// almanac.json (point-read id fort.w.橐). Port those edits back to export-content.mjs before the next re-export.
describe('DoD 13: content provenance', () => {
  const HAND = new Set(['voice.json', 'lines.json', 'narration.yaml', 'almanac.json']);
  const C = path.resolve(__dirname, '../../../content/gear-fort');
  const man = JSON.parse(fs.readFileSync(path.join(C, 'manifest.json'), 'utf8')) as { sha1: Record<string, string> };
  it('every exported file matches its sha1, except the hand-maintained list', async () => {
    const { createHash } = await import('node:crypto');
    const bad = Object.entries(man.sha1).filter(([f, h]) => !HAND.has(f) && createHash('sha1').update(fs.readFileSync(path.join(C, f))).digest('hex').slice(0, h.length) !== h).map(([f]) => f);
    expect(bad).toEqual([]);
    for (const f of HAND) expect(fs.existsSync(path.join(C, f)), f).toBe(true);
  });
});
