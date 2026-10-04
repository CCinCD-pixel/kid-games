import { WORLD_SIZE } from '../config';
import type { Snake } from '../types';
import { getSnakeRadius, getSnakeSpacing } from './snake';

export function moveSnake(snake: Snake, dt: number, killSnake: (snake: Snake) => void): void {
  if (!snake.alive) {
    return;
  }

  let diff = snake.targetAngle - snake.angle;
  while (diff > Math.PI) {
    diff -= Math.PI * 2;
  }
  while (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  const turnSpeed = 4;
  snake.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);

  const head = snake.segments[0];
  const radius = getSnakeRadius(snake);
  const nx = head.x + Math.cos(snake.angle) * snake.speed * dt * 60;
  const ny = head.y + Math.sin(snake.angle) * snake.speed * dt * 60;

  if (nx < radius || nx > WORLD_SIZE - radius || ny < radius || ny > WORLD_SIZE - radius) {
    killSnake(snake);
    return;
  }

  const spacing = getSnakeSpacing(snake);
  for (let i = snake.segments.length - 1; i > 0; i -= 1) {
    const prev = snake.segments[i - 1];
    const seg = snake.segments[i];
    const dx = prev.x - seg.x;
    const dy = prev.y - seg.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > spacing) {
      const ratio = spacing / dist;
      seg.x = prev.x - dx * ratio;
      seg.y = prev.y - dy * ratio;
    }
  }

  head.x = nx;
  head.y = ny;
}
