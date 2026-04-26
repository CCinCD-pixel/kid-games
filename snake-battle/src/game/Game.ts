import { AI_COUNT, DEATH_FOOD_COUNT, PLAYER_COLORS } from '../config';
import { InputController } from '../input/InputController';
import { Renderer } from '../render/Renderer';
import { Hud } from '../ui/Hud';
import type { Camera, Food, Snake } from '../types';
import { updateAI } from './ai';
import { checkCollisions } from './collision';
import { initFoods, spawnFood } from './food';
import { moveSnake } from './movement';
import { createSnake } from './snake';

export class Game {
  private foods: Food[] = [];
  private snakes: Snake[] = [];
  private player: Snake | null = null;
  private readonly camera: Camera = { x: 0, y: 0 };
  private gameRunning = false;
  private lastTime = 0;
  private hudTimer = 0;
  private animationFrameId: number | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: InputController,
    private readonly hud: Hud,
  ) {}

  start(): void {
    this.hud.hideStart();
    this.hud.hideDeath();

    this.foods = initFoods();
    this.snakes = [];

    for (let i = 0; i < AI_COUNT; i += 1) {
      this.snakes.push(createSnake(false));
    }

    this.player = createSnake(true);
    this.player.colors = PLAYER_COLORS;
    this.snakes.push(this.player);
    this.input.setPlayer(this.player);

    this.gameRunning = true;
    this.input.setGameRunning(true);
    this.lastTime = performance.now();

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  respawn(): void {
    this.hud.hideDeath();

    if (this.player) {
      const idx = this.snakes.indexOf(this.player);
      if (idx >= 0) {
        this.snakes.splice(idx, 1);
      }
    }

    this.player = createSnake(true);
    this.player.colors = PLAYER_COLORS;
    this.snakes.push(this.player);
    this.input.setPlayer(this.player);
  }

  private loop(timestamp: number): void {
    if (!this.gameRunning) {
      return;
    }

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    this.input.updateTouchInput();

    for (const snake of this.snakes) {
      if (!snake.isPlayer && snake.alive) {
        updateAI(snake, dt, this.foods, this.snakes);
      }
    }

    for (const snake of this.snakes) {
      moveSnake(snake, dt, (deadSnake) => this.killSnake(deadSnake));
    }

    checkCollisions(this.snakes, this.foods, (deadSnake) => this.killSnake(deadSnake));
    this.renderer.render(this.foods, this.snakes, this.player, this.camera);

    this.hudTimer += dt;
    if (this.hudTimer > 0.3) {
      this.hudTimer = 0;
      this.hud.update(this.player, this.snakes);
    }

    this.animationFrameId = requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }

  private killSnake(snake: Snake): void {
    if (!snake.alive) {
      return;
    }

    snake.alive = false;

    const step = Math.max(1, Math.floor(snake.segments.length / DEATH_FOOD_COUNT));
    for (let i = 0; i < snake.segments.length; i += step) {
      const seg = snake.segments[i];
      this.foods.push(spawnFood(seg.x + (Math.random() - 0.5) * 20, seg.y + (Math.random() - 0.5) * 20));
    }

    if (snake.isPlayer) {
      this.hud.showDeath(this.player);
      return;
    }

    window.setTimeout(() => {
      const idx = this.snakes.indexOf(snake);
      if (idx >= 0) {
        this.snakes[idx] = createSnake(false);
      }
    }, 2000);
  }
}
