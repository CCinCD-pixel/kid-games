import { WORLD_SIZE } from '../config';
import type { Food, Snake } from '../types';
import { getSnakeRadius } from './snake';

export function updateAI(snake: Snake, dt: number, foods: Food[], snakes: Snake[]): void {
  snake.aiTimer -= dt;
  const head = snake.segments[0];
  const radius = getSnakeRadius(snake);

  if (snake.aiTimer <= 0) {
    snake.aiTimer = 0.3 + Math.random() * 0.8;

    const scored: Array<{ food: Food; dist: number }> = [];
    for (const food of foods) {
      const dx = food.x - head.x;
      const dy = food.y - head.y;
      const dist = dx * dx + dy * dy;
      if (dist < 500 * 500) {
        scored.push({ food, dist });
      }
    }
    scored.sort((a, b) => a.dist - b.dist);

    if (scored.length > 0) {
      const pick = Math.min(scored.length - 1, Math.floor(Math.random() * 3));
      snake.aiTarget = scored[pick].food;
    } else {
      snake.aiTarget = {
        x: WORLD_SIZE / 2 + (Math.random() - 0.5) * 1000,
        y: WORLD_SIZE / 2 + (Math.random() - 0.5) * 1000,
      };
    }
  }

  const wallMargin = 200;
  let wallUrgency = false;
  let avoidX = 0;
  let avoidY = 0;
  if (head.x < wallMargin) {
    avoidX = 1;
    wallUrgency = head.x < 80;
  }
  if (head.x > WORLD_SIZE - wallMargin) {
    avoidX = -1;
    wallUrgency = head.x > WORLD_SIZE - 80;
  }
  if (head.y < wallMargin) {
    avoidY = 1;
    wallUrgency = head.y < 80;
  }
  if (head.y > WORLD_SIZE - wallMargin) {
    avoidY = -1;
    wallUrgency = head.y > WORLD_SIZE - 80;
  }

  if (avoidX || avoidY) {
    snake.targetAngle = Math.atan2(avoidY || Math.random() - 0.5, avoidX || Math.random() - 0.5);
    if (wallUrgency) {
      snake.angle = snake.targetAngle;
    }
    return;
  }

  let avoiding = false;
  const avoidDist = radius * 4 + 30;
  for (const other of snakes) {
    if (other === snake || !other.alive) {
      continue;
    }
    for (let i = 0; i < Math.min(other.segments.length, 30); i += 1) {
      const seg = other.segments[i];
      const dx = seg.x - head.x;
      const dy = seg.y - head.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < avoidDist) {
        const awayAngle = Math.atan2(-dy, -dx);
        snake.targetAngle = awayAngle + (Math.random() > 0.5 ? 0.5 : -0.5);
        avoiding = true;
        break;
      }
    }
    if (avoiding) {
      break;
    }
  }

  if (!avoiding && snake.aiTarget) {
    const dx = snake.aiTarget.x - head.x;
    const dy = snake.aiTarget.y - head.y;
    snake.targetAngle = Math.atan2(dy, dx);
  }
}
