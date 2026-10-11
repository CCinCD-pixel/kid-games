import { describe, expect, it } from 'vitest';
import { Match } from '../src/match';
import { BATTLE_RADIUS_SCALE, VENUES, VENUE_IDS, setupTimed, venueWorldCfg } from '../src/sim/venues';
import { MISSION_BY_ID } from '../src/sim/mission';
import { Brain, heatTier } from '../src/sim/brain';

describe('expanded battle arenas', () => {
  it.each(VENUE_IDS)('%s doubles the playable radius in timed and endless modes', (id) => {
    const venue = VENUES[id];
    for (const mode of ['timed', 'endless'] as const) {
      const match = new Match({ mode, venue: id, seed: 17, name: '小步步', skin: 'venus', countdown: false });
      expect(match.world.R).toBe(venue.R * BATTLE_RADIUS_SCALE);
      expect(match.arenaR).toBe(match.world.R);
      expect(match.world.food.count).toBe(venueWorldCfg({ ...venue, R: match.world.R }).foodCount);
      expect(match.world.food.count / venueWorldCfg(venue).foodCount).toBeCloseTo(4, 2);
      expect(match.world.snakes.length).toBeGreaterThan(Object.values(venue.ai).reduce((sum, n) => sum + n, 1));
      expect(match.world.snakes.length).toBeLessThanOrEqual(25);
      for (const snake of match.world.snakes) expect(Math.hypot(snake.x, snake.y)).toBeLessThan(match.world.R);
    }
  });

  it('keeps authored challenge levels on their validated maps', () => {
    const mission = MISSION_BY_ID.c1m1;
    const match = new Match({ mode: 'mission', venue: 'moon', seed: 17, name: '小步步', skin: 'venus', mission, countdown: false });
    expect(match.world.R).toBe(mission.arena.R);
    expect(match.arenaR).toBe(mission.arena.R);
  });

  it('caps expanded AI skill at the next tier when the arena heats up', () => {
    const match = setupTimed(VENUES.mars, 17, { radiusScale: BATTLE_RADIUS_SCALE, heat: 2 });
    expect((match.world.snakes[0].brain as Brain).tier).toEqual(heatTier('T2', 4));
  });
});
