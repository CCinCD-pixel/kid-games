export interface Point {
  x: number;
  y: number;
}

export interface Food extends Point {
  color: string;
  radius: number;
  pulse: number;
}

export type SnakeColors = [string, string];

export interface Snake {
  segments: Point[];
  angle: number;
  targetAngle: number;
  speed: number;
  colors: SnakeColors;
  isPlayer: boolean;
  alive: boolean;
  name: string;
  aiTimer: number;
  aiTarget: Point | null;
  length: number;
}

export interface Camera extends Point {}

export interface GameSnapshot {
  foods: Food[];
  snakes: Snake[];
  player: Snake | null;
  camera: Camera;
}
