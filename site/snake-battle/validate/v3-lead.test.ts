/**
 * QA r5 (spec §5.1 H0/H1, §4.4 3-1 "游到它前面，让它撞上你"): on interception levels the gold arrow / ghost hand lead
 * the target snake. A kid bot that only follows the arrow (finger ahead of his head toward Hud.hintTarget) must clear
 * 3-1 most of the time, and more often than when the arrow points at the snake's head (the r4 behaviour).
 * Full tier (SB_FULL=1): 3 levels × 16 seeds × 2 aims × ≤75 s.
 */
import { describe, expect, it } from 'vitest';
import { FULL, writeReport } from './bots';
import { Match } from '../src/match';
import { Hud } from '../src/hud';
import { MISSION_BY_ID } from '../src/sim/mission';
import type { Snake } from '../src/sim/core';

type Aim = 'lead' | 'head';
function play(id: string, seed: number, aim: Aim) {
  const m = new Match({ mode: 'mission', venue: 'moon', seed, name: '小步步', skin: 'venus', mission: MISSION_BY_ID[id], countdown: false });
  const P = Hud.prototype as unknown as Record<string, unknown>;
  const fake: Record<string, unknown> = { m, pts: [], ptSnakes: new Map<number, Snake>(), fb: null, leadPoint: P.leadPoint, openWater: P.openWater, fallbackTarget: P.fallbackTarget };
  const hint = P.hintTarget as (this: unknown) => [number, number] | null;
  let t = 0, outs = 0; const me = m.me;
  while (t < 75 && !m.run!.outcome) {
    const pts: [number, number, string][] = []; const ps = new Map<number, Snake>();
    for (const s of m.world.snakes) if (s.alive && !s.isPlayer && (s.target_ || m.run!.qualifies(s))) { ps.set(pts.length, s); pts.push([s.x, s.y, '']); }
    fake.pts = pts; fake.ptSnakes = ps;
    if (aim === 'head') { const o = m.run!.m.objective; fake.ptSnakes = new Map(); void o; }
    const tg = me.alive ? hint.call(fake) : null;
    if (tg) me.target = Math.atan2(tg[1] - me.y, tg[0] - me.x);
    const wasAlive = me.alive;
    m.update(1 / 60); t += 1 / 60;
    if (wasAlive && !me.alive) outs++;
  }
  return { ok: !!m.run!.outcome?.ok, t: Math.round(t), outs };
}

describe.skipIf(!FULL)('QA r5: arrow-following kid bot on interception levels', () => {
  it('3-1 / 3-2 / 3-3: leading the target clears 3-1 most of the time', () => {
    const rows: Record<string, unknown> = {};
    for (const id of ['c3m1', 'c3m2', 'c3m3']) for (const aim of ['lead', 'head'] as Aim[]) {
      const rs = Array.from({ length: 16 }, (_, i) => play(id, 9001 + i * 37, aim));
      rows[`${id}.${aim}`] = { clears: rs.filter((r) => r.ok).length, n: rs.length, outs: rs.reduce((a, r) => a + r.outs, 0) };
    }
    writeReport('v3-lead', rows);
    console.log(JSON.stringify(rows));
    const c = (k: string) => (rows[k] as { clears: number }).clears;
    expect(c('c3m1.lead')).toBeGreaterThanOrEqual(9);
    expect(c('c3m1.lead')).toBeGreaterThan(c('c3m1.head'));
  }, 600_000);
});
