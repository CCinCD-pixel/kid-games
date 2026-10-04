import {
  AI_PALETTE,
  AI_SPAWN_MARGIN,
  AI_SPEED,
  BASE_RADIUS,
  BASE_SPACING,
  INITIAL_LENGTH,
  PLAYER_COLORS,
  PLAYER_NAME,
  PLAYER_SPAWN_CLEARANCE,
  PLAYER_SPAWN_MARGIN,
  SNAKE_SPEED,
  WORLD_SIZE,
} from '../config';
import type { Point, Snake } from '../types';

function randomIn(margin: number): number {
  return margin + Math.random() * (WORLD_SIZE - margin * 2);
}

function nearestAISegment(p: Point, others: readonly Snake[]): number {
  let best = Infinity;
  for (const other of others) {
    if (!other.alive || other.isPlayer) continue;
    for (const seg of other.segments) {
      const d = Math.hypot(seg.x - p.x, seg.y - p.y);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Player spawn: inner area, heading toward the centre, no AI body within PLAYER_SPAWN_CLEARANCE. */
function pickPlayerSpawn(others: readonly Snake[]): { x: number; y: number; angle: number } {
  let fallback = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, angle: 0, clearance: -1 };
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const x = randomIn(PLAYER_SPAWN_MARGIN);
    const y = randomIn(PLAYER_SPAWN_MARGIN);
    const angle = Math.atan2(WORLD_SIZE / 2 - y, WORLD_SIZE / 2 - x);
    const clearance = nearestAISegment({ x, y }, others);
    if (clearance >= PLAYER_SPAWN_CLEARANCE) return { x, y, angle };
    if (clearance > fallback.clearance) fallback = { x, y, angle, clearance };
  }
  return fallback;
}

/** AI colours/names never equal the player's palette and are unique among living AI snakes. */
function pickAIStyle(others: readonly Snake[]): (typeof AI_PALETTE)[number] {
  const used = new Set(others.filter((s) => s.alive && !s.isPlayer).map((s) => s.name));
  const free = AI_PALETTE.filter((entry) => !used.has(entry.name));
  const pool = free.length > 0 ? free : AI_PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function createSnake(isPlayer: boolean, others: readonly Snake[] = []): Snake {
  let x: number;
  let y: number;
  let angle: number;
  if (isPlayer) {
    ({ x, y, angle } = pickPlayerSpawn(others));
  } else {
    x = randomIn(AI_SPAWN_MARGIN);
    y = randomIn(AI_SPAWN_MARGIN);
    angle = Math.random() * Math.PI * 2;
  }
  const style = isPlayer ? { colors: PLAYER_COLORS, name: PLAYER_NAME } : pickAIStyle(others);

  const segments = [];
  for (let i = 0; i < INITIAL_LENGTH; i += 1) {
    segments.push({
      x: x - Math.cos(angle) * i * BASE_SPACING,
      y: y - Math.sin(angle) * i * BASE_SPACING,
    });
  }

  return {
    segments,
    angle,
    targetAngle: angle,
    speed: isPlayer ? SNAKE_SPEED : AI_SPEED,
    colors: style.colors,
    isPlayer,
    alive: true,
    name: style.name,
    aiTimer: 0,
    aiTarget: null,
    length: INITIAL_LENGTH,
  };
}

export function getSnakeRadius(snake: Snake): number {
  return BASE_RADIUS + Math.min(12, snake.length * 0.15);
}

export function getSnakeSpacing(snake: Snake): number {
  return BASE_SPACING + Math.min(8, snake.length * 0.1);
}

export function growSnake(snake: Snake, amount: number): void {
  for (let i = 0; i < amount; i += 1) {
    const last = snake.segments[snake.segments.length - 1];
    snake.segments.push({ x: last.x, y: last.y });
  }
  snake.length = snake.segments.length;
}
