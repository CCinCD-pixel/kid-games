import { FOOD_COLORS, FOOD_COUNT, FOOD_RADIUS, WORLD_SIZE } from '../config';
import type { Food } from '../types';

export function spawnFood(x?: number, y?: number): Food {
  return {
    x: x ?? Math.random() * WORLD_SIZE,
    y: y ?? Math.random() * WORLD_SIZE,
    color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
    radius: FOOD_RADIUS + Math.random() * 3,
    pulse: Math.random() * Math.PI * 2,
  };
}

export function initFoods(): Food[] {
  const foods: Food[] = [];
  for (let i = 0; i < FOOD_COUNT; i += 1) {
    foods.push(spawnFood());
  }
  return foods;
}
