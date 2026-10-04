import type { Food, Snake } from '../types';
import { spawnFood } from './food';
import { getSnakeRadius, growSnake } from './snake';

export function checkCollisions(
  snakes: Snake[],
  foods: Food[],
  killSnake: (snake: Snake) => void,
): void {
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    const head = snake.segments[0];
    const headR = getSnakeRadius(snake);

    const pickupBonus = 8;
    for (let i = foods.length - 1; i >= 0; i -= 1) {
      const food = foods[i];
      const dx = food.x - head.x;
      const dy = food.y - head.y;
      const pickupR = headR + food.radius + pickupBonus;
      if (dx * dx + dy * dy < pickupR * pickupR) {
        foods.splice(i, 1);
        growSnake(snake, 1);
        foods.push(spawnFood());
      }
    }

    for (const other of snakes) {
      if (other === snake || !other.alive) {
        continue;
      }
      const otherR = getSnakeRadius(other);
      for (let i = 5; i < other.segments.length; i += 1) {
        const seg = other.segments[i];
        const dx = seg.x - head.x;
        const dy = seg.y - head.y;
        const hitR = headR + otherR - 3;
        if (dx * dx + dy * dy < hitR * hitR) {
          killSnake(snake);
          break;
        }
      }
      if (!snake.alive) {
        break;
      }
    }
  }
}
