/**
 * V4 (spec §9.2): content structure — 40 missions in 5 chapters, objective types, star conditions, demo
 * recordings still match their mission data (contentHash), every collection item well-formed with a
 * valid eye × head combination (§6.4 table), a known body pattern, a trail recipe and a fact line.
 */
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/sim/mission';
import { hashString } from '../src/sim/core';
import { VENUE_IDS } from '../src/sim/venues';
import { variantsOf } from '../src/render/art';
import { TRAIL_EVERY } from '../src/render/skins';
import collection from '../../../content/snake-battle/collection.json';
import demos from '../../../content/snake-battle/demos.json';
import lines from '../../../content/snake-battle/lines.json';

const IDS = new Set((lines as { id: string }[]).map((l) => l.id));
const C = collection as unknown as { skins: { id: string; head: string; eyes: string; pattern: string; base: string; accent: string; fact: string }[]; trails: { id: string; fact: string }[]; badges: { id: string }[]; crown: { id: string } };
const EYES_OK: Record<string, string[]> = { round: ['cute', 'visor', 'dragon', 'glow'], comet: ['cute', 'visor', 'dragon', 'glow'], ringed: ['cute', 'visor', 'dragon', 'glow'], tower: ['cute', 'visor', 'dragon', 'glow'], loco: ['cute'], digger: ['cute'], rocket: ['visor'], maglev: ['visor'], station: ['visor'], mecha: ['visor'], dragon: ['dragon'], zhulong: ['dragon'] };

describe('V4 content', () => {
  it('40 missions, 5 chapters × 8, known objectives, star conditions, brief lines', () => {
    expect(MISSIONS.length).toBe(40);
    for (let ch = 1; ch <= 5; ch++) expect(MISSIONS.filter((m) => m.ch === ch).map((m) => m.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((k) => `c${ch}m${k}`));
    const types = new Set(MISSIONS.map((m) => m.objective.type));
    expect(types.size).toBeGreaterThanOrEqual(6);
    for (const m of MISSIONS) {
      expect(Array.isArray(m.stars) && m.stars.length >= 2, `${m.id} stars`).toBe(true);
      expect(IDS.has(m.lines.brief), `${m.id} brief line ${m.lines.brief}`).toBe(true);
    }
  });
  it('demo recordings match the current mission data (contentHash)', () => {
    const D = demos as unknown as { demos?: Record<string, { contentHash: string; keyT: number | null }> } & Record<string, unknown>;
    const table = (D.demos ?? D) as Record<string, { contentHash: string }>;
    for (const m of MISSIONS) {
      const rec = table[m.id];
      expect(rec, `demo for ${m.id}`).toBeTruthy();
      expect(rec.contentHash, `${m.id} demo is stale — rerun SB_DEMOS=1 record-demos`).toBe((hashString(JSON.stringify(m)) >>> 0).toString(16).padStart(8, '0'));
    }
  });
  it('collection: 18 skins + crown + 6 trails + 14 badges, valid looks, facts', () => {
    expect(C.skins.length).toBe(18); expect(C.trails.length).toBe(6); expect(C.badges.length).toBe(14); expect(C.crown).toBeTruthy();
    expect(new Set(C.skins.map((s) => s.id)).size).toBe(18);
    for (const s of C.skins) {
      expect(EYES_OK[s.head], `${s.id}: unknown head ${s.head}`).toBeTruthy();
      expect(EYES_OK[s.head].includes(s.eyes), `${s.id}: eyes ${s.eyes} not allowed on head ${s.head} (§6.4)`).toBe(true);
      expect(variantsOf(s.pattern).length, `${s.id}: unknown pattern ${s.pattern}`).toBeGreaterThan(1);
      expect(/^#[0-9a-f]{6}$/i.test(s.base) && /^#[0-9a-f]{6}$/i.test(s.accent)).toBe(true);
      expect(s.fact.length).toBeGreaterThan(4);
    }
    for (const t of C.trails) expect(TRAIL_EVERY[t.id], `trail recipe ${t.id}`).toBeGreaterThan(0);
  });
  it('4 venues', () => { expect(VENUE_IDS.length).toBe(4); });
});
