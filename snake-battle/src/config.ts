import type { SnakeColors } from './types';

export const WORLD_SIZE = 3000;
export const FOOD_COUNT = 200;
export const AI_COUNT = 7;
export const INITIAL_LENGTH = 10;
export const BASE_RADIUS = 8;
export const BASE_SPACING = 12;
export const SNAKE_SPEED = 2.5;
export const AI_SPEED = 2.3;
export const FOOD_RADIUS = 5;
export const DEATH_FOOD_COUNT = 8;

export const PLAYER_NAME = '小步步';
export const PLAYER_COLORS: SnakeColors = ['#f1c40f', '#f39c12'];

/** Spawn safety: the player appears inside the inner area, heading toward the centre. */
export const PLAYER_SPAWN_MARGIN = WORLD_SIZE * 0.25;
/** No AI segment may be closer than this to the player's spawn point. */
export const PLAYER_SPAWN_CLEARANCE = 250;
export const AI_SPAWN_MARGIN = 200;

/**
 * AI palette: every entry differs from PLAYER_COLORS, and the name follows the colour,
 * so two AI snakes alive at the same time never share a colour or a name.
 */
export const AI_PALETTE: ReadonlyArray<{ colors: SnakeColors; name: string }> = [
  { colors: ['#e74c3c', '#c0392b'], name: '小红蛇' },
  { colors: ['#2ecc71', '#27ae60'], name: '小绿蛇' },
  { colors: ['#3498db', '#2980b9'], name: '小蓝蛇' },
  { colors: ['#9b59b6', '#8e44ad'], name: '小紫蛇' },
  { colors: ['#1abc9c', '#16a085'], name: '小青蛇' },
  { colors: ['#e67e22', '#d35400'], name: '小橙蛇' },
  { colors: ['#fd79a8', '#e84393'], name: '小粉蛇' },
  { colors: ['#95a5a6', '#7f8c8d'], name: '小灰蛇' },
];

export const FOOD_COLORS = [
  '#ff6b6b',
  '#ffd93d',
  '#6bcb77',
  '#4d96ff',
  '#ff6bd6',
  '#a66cff',
  '#ff9f43',
  '#00d2d3',
];
