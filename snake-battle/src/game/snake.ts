import {
  AI_NAMES,
  AI_SPEED,
  BASE_RADIUS,
  BASE_SPACING,
  INITIAL_LENGTH,
  PLAYER_NAME,
  SNAKE_COLORS,
  SNAKE_SPEED,
  WORLD_SIZE,
} from '../config';
import type { Snake } from '../types';

export function createSnake(isPlayer: boolean): Snake {
  const x = 200 + Math.random() * (WORLD_SIZE - 400);
  const y = 200 + Math.random() * (WORLD_SIZE - 400);
  const angle = Math.random() * Math.PI * 2;
  const colorIdx = Math.floor(Math.random() * SNAKE_COLORS.length);

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
    colors: SNAKE_COLORS[colorIdx],
    isPlayer,
    alive: true,
    name: isPlayer ? PLAYER_NAME : AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)],
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
