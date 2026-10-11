import { expect, test } from 'vitest';
import { Match } from '../src/match';

test('双人赛共用扩大的场地，任一玩家出局不打断另一人', () => {
  const m = new Match({ mode: 'timed', venue: 'moon', seed: 17, name: '一号', skin: 'venus', versus: true, countdown: false });
  const other = m.other!;
  expect(m.arenaR).toBeGreaterThan(3200);
  expect(Math.hypot(m.me.x - other.x, m.me.y - other.y)).toBeLessThan(900);
  m.input.target = m.me.angle + 0.5;
  m.otherInput.target = other.angle - 0.5;
  m.update(1 / 30);
  expect(m.me.target).toBe(m.input.target);
  expect(other.target).toBe(m.otherInput.target);
  const killer = m.world.snakes.find((s) => !s.isPlayer && s.alive)!;
  m.world.kill(m.me, { killer, tag: 'body', x: m.me.x, y: m.me.y, s: 200 });
  m.update(1 / 30);
  expect(m.state).toBe('playing');
  expect(other.alive).toBe(true);
  m.world.t += 4;
  m.update(1 / 30);
  expect(m.me.alive).toBe(true);
  m.world.kill(other, { killer, tag: 'body', x: other.x, y: other.y, s: 200 });
  m.update(1 / 30);
  expect(m.state).toBe('playing');
  expect(m.me.alive).toBe(true);
});
