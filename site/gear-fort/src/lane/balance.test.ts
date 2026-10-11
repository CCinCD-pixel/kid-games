import { describe, expect, it } from 'vitest';
import { LEVELS } from '../content';
import { campaignBalance } from './balance';
import { act, createSim, inc, resume, snapshot, spawnEnemy } from './sim';
import { UNITS } from './tables';
import { recommend } from '../bots/loadout';

describe('campaign balance', () => {
  it('gives ordinary battles more grain and shorter card cooldowns', () => {
    const lv = LEVELS['1-2'];
    const S = createSim(lv, 1, campaignBalance(lv));
    expect(inc(S, 20)).toBe(22);
    expect(act(S, { t: 'place', card: 'farm', lane: 1, col: 0 })).toBe(true);
    expect(S.cdReady.farm).toBe(Math.round(UNITS.farm.cd * 0.9));
  });

  it('keeps the scripted tutorial and puzzles on their authored rules', () => {
    for (const lv of [LEVELS['1-1'], { ...LEVELS['1-2'], puzzle: true }]) {
      const S = createSim(lv, 1, campaignBalance(lv));
      expect(S.im).toBe(100);
      expect(S.cooldownPct).toBe(100);
    }
  });

  it('sends conveyor cards sooner without adding a grain economy', () => {
    const lv = LEVELS['2-7'];
    const S = createSim(lv, 1, campaignBalance(lv));
    expect(S.im).toBe(100);
    expect(S.beltPeriod).toBe(Math.round(lv.belt!.period * 0.85));
  });

  it('gives extra room to the first boss and the difficult wind lesson', () => {
    expect(campaignBalance(LEVELS['1-11'])).toMatchObject({ incomePct: 125, cooldownPct: 75, rhinoCfg: { hp: 1200, p2At: 700, crackMax: 50 } });
    expect(campaignBalance(LEVELS['2-3'])).toMatchObject({ incomePct: 115, cooldownPct: 85 });
  });

  it('preserves the faster cooldown through a saved battle', () => {
    const lv = LEVELS['1-2'];
    const S = createSim(lv, 1, campaignBalance(lv));
    const R = resume(snapshot(S), lv);
    expect(R?.cooldownPct).toBe(90);
    expect(R?.im).toBe(110);
    expect(R?.ramHpPct).toBe(88);
    expect(R?.ramImpactPct).toBe(87);
  });

  it('applies gentler ram health only to the live campaign', () => {
    const lv = LEVELS['1-5'];
    const live = createSim(lv, 1, campaignBalance(lv));
    const authored = createSim(lv, 1);
    expect(spawnEnemy(live, 'ram', 2).hp).toBe(458);
    expect(spawnEnemy(authored, 'ram', 2).hp).toBe(520);
    const boss = createSim(LEVELS['1-11'], 1, campaignBalance(LEVELS['1-11']));
    expect(resume(snapshot(boss), LEVELS['1-11'])?.rhinoCfg?.crackMax).toBe(50);
  });

  it('recommends a complete deck for both rhino phases', () => {
    const lv = LEVELS['1-11'];
    const deck = recommend(lv);
    expect(deck).toHaveLength(lv.slots!);
    expect(deck).toEqual(expect.arrayContaining(['farm', 'shooter', 'wall', 'lobber', 'beam', 'spikes']));
  });
});
