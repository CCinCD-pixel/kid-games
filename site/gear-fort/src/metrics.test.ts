// 宋城修复 state, 墨家旗 thresholds, jinnang mastery detectors (spec §4.9, §5.7, §5.9) — run on the 22 design solutions.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSim, step } from './lane/sim';
import { masterySignals } from './lane/mastery';
import { songState, ANCHOR, FLAG_STARS } from './render/songcity';
import { parentMetrics, noteGame } from './metrics';
import { defaults } from './save';
import { CAMPAIGN, ORDER } from './content';
import type { Action, Level, SimState } from './lane/types';

const C = path.resolve(__dirname, '../../../content/gear-fort');
const read = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(C, p), 'utf8')) as T;
function play(id: string): SimState {
  const ds = read<{ loadout: string[]; actions: [number, Action[]][] }>(`dscripts/${id}.json`);
  const S = createSim({ ...read<Level>(`levels/${id}.json`), loadout: ds.loadout as Level['loadout'] }, 0, { events: true }); let i = 0;
  while (!S.result && S.tick < 20 * 60 * 12) { const a = i < ds.actions.length && ds.actions[i][0] === S.tick ? ds.actions[i++][1] : null; step(S, a); }
  return S;
}

describe('宋城修复 + 墨家旗', () => {
  it('every repair part has an anchor; 22 parts, one per level', () => {
    expect(Object.keys(CAMPAIGN.repairArt)).toHaveLength(22);
    for (const art of Object.values(CAMPAIGN.repairArt)) expect(ANCHOR[art], art).toBeDefined();
  });
  it('state follows wins: day → night (volume 2) → dawn after 2-10; flags at FLAG_STARS', () => {
    const s = defaults(); expect(songState(s)).toMatchObject({ phase: 'day', flags: [false, false] }); expect(songState(s).done.size).toBe(0);
    for (const id of ORDER.slice(0, 11)) s.levels[id] = { best: 3, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' };
    expect(songState(s).phase).toBe('night'); expect(songState(s).flags).toEqual([33 >= FLAG_STARS[0], false]);
    expect(songState(s, '1-11').phase).toBe('day'); expect(songState(s, '1-11').done.has('field-3-plough')).toBe(false);
    for (const id of ORDER.slice(11)) s.levels[id] = { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' };
    const st = songState(s); expect(st.phase).toBe('dawn'); expect(st.done.size).toBe(22); expect(st.flags).toEqual([true, 22 >= FLAG_STARS[1]]);
  });
});

describe('jinnang mastery signals on the design solutions', () => {
  const got: Record<string, string[]> = {};
  for (const id of ORDER) it(id, () => { const S = play(id); expect(S.result).toBe('win'); got[id] = masterySignals(S); });
  it('the level\'s own lesson shows up in most designed games; parent metrics fold in', () => {
    const hit = ORDER.filter((id) => CAMPAIGN.levelJinnang[id] && got[id]?.includes(CAMPAIGN.levelJinnang[id]!));
    const want = ORDER.filter((id) => CAMPAIGN.levelJinnang[id]);
    console.log('mastery: own lesson shown in', hit.length, '/', want.length, JSON.stringify(got));
    expect(hit.length).toBeGreaterThanOrEqual(Math.ceil(want.length / 2));
    const all = new Set(Object.values(got).flat()); expect(all.size).toBeGreaterThanOrEqual(10);
    const s = defaults(); noteGame(s, '1-2', play('1-2'), { assist: 0, asked: 0, hints: [] });
    const m = parentMetrics(s); expect(m.jn).toBeGreaterThan(0); expect(m.ft).toHaveLength(2);
    const t = defaults(); noteGame(t, '1-2', play('1-2'), { assist: 1, asked: 0, hints: [] }); expect(parentMetrics(t).jn).toBe(0); // assisted games never count
  });
});
