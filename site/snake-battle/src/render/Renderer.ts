import { WORLD_SIZE } from '../config';
import type { Camera, Food, Snake } from '../types';
import { getSnakeRadius } from '../game/snake';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is not available.');
    }
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.pixelRatio = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.pixelRatio;
    this.canvas.height = this.height * this.pixelRatio;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  render(foods: Food[], snakes: Snake[], player: Snake | null, camera: Camera): void {
    const vw = this.width;
    const vh = this.height;

    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, vw, vh);

    if (player?.alive) {
      camera.x = player.segments[0].x - vw / 2;
      camera.y = player.segments[0].y - vh / 2;
    }

    this.ctx.save();
    this.ctx.translate(-camera.x, -camera.y);

    this.drawGrid(camera, vw, vh);

    this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    const time = Date.now() / 1000;
    for (const food of foods) {
      if (
        food.x < camera.x - 20 ||
        food.x > camera.x + vw + 20 ||
        food.y < camera.y - 20 ||
        food.y > camera.y + vh + 20
      ) {
        continue;
      }

      const pulse = 1 + Math.sin(time * 3 + food.pulse) * 0.2;
      this.ctx.beginPath();
      this.ctx.arc(food.x, food.y, food.radius * pulse, 0, Math.PI * 2);
      this.ctx.fillStyle = food.color;
      this.ctx.fill();
    }

    for (const snake of snakes) {
      if (snake.alive) {
        this.drawSnake(snake);
      }
    }

    this.ctx.restore();
    this.drawMinimap(snakes, camera, vw, vh);
  }

  private drawGrid(camera: Camera, vw: number, vh: number): void {
    const gridSize = 50;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;

    this.ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let x = startX; x < camera.x + vw + gridSize; x += gridSize) {
      if (x < 0 || x > WORLD_SIZE) {
        continue;
      }
      this.ctx.moveTo(x, Math.max(0, camera.y));
      this.ctx.lineTo(x, Math.min(WORLD_SIZE, camera.y + vh));
    }
    for (let y = startY; y < camera.y + vh + gridSize; y += gridSize) {
      if (y < 0 || y > WORLD_SIZE) {
        continue;
      }
      this.ctx.moveTo(Math.max(0, camera.x), y);
      this.ctx.lineTo(Math.min(WORLD_SIZE, camera.x + vw), y);
    }
    this.ctx.stroke();
  }

  private drawSnake(snake: Snake): void {
    const segs = snake.segments;
    const [c1, c2] = snake.colors;
    const baseR = getSnakeRadius(snake);

    for (let i = segs.length - 1; i >= 0; i -= 1) {
      const seg = segs[i];
      const t = i / segs.length;
      const r = baseR * (0.4 + (1 - t) * 0.6);

      this.ctx.beginPath();
      this.ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      this.ctx.fill();
    }

    const head = segs[0];
    const eyeOffset = baseR * 0.45;
    const eyeR = baseR * 0.28;
    const perpAngle = snake.angle + Math.PI / 2;

    for (const side of [-1, 1]) {
      const ex =
        head.x +
        Math.cos(snake.angle) * eyeOffset * 0.5 +
        Math.cos(perpAngle) * eyeOffset * side;
      const ey =
        head.y +
        Math.sin(snake.angle) * eyeOffset * 0.5 +
        Math.sin(perpAngle) * eyeOffset * side;

      this.ctx.beginPath();
      this.ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      this.ctx.fillStyle = '#fff';
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(
        ex + Math.cos(snake.angle) * eyeR * 0.3,
        ey + Math.sin(snake.angle) * eyeR * 0.3,
        eyeR * 0.5,
        0,
        Math.PI * 2,
      );
      this.ctx.fillStyle = '#111';
      this.ctx.fill();
    }

    this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
    this.ctx.font = `bold ${Math.min(14, 10 + baseR * 0.2)}px system-ui`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${snake.name} (${snake.length})`, head.x, head.y - baseR - 8);
  }

  private drawMinimap(snakes: Snake[], camera: Camera, vw: number, vh: number): void {
    const size = 90;
    const margin = 10;
    const mx = margin;
    const my = vh - size - margin - 10;
    const scale = size / WORLD_SIZE;

    this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
    this.ctx.fillRect(mx, my, size, size);
    this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(mx, my, size, size);

    for (const snake of snakes) {
      if (!snake.alive) {
        continue;
      }
      const head = snake.segments[0];
      const px = mx + head.x * scale;
      const py = my + head.y * scale;
      this.ctx.beginPath();
      this.ctx.arc(px, py, snake.isPlayer ? 3 : 2, 0, Math.PI * 2);
      this.ctx.fillStyle = snake.isPlayer ? '#f1c40f' : snake.colors[0];
      this.ctx.fill();
    }

    this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    this.ctx.strokeRect(mx + camera.x * scale, my + camera.y * scale, vw * scale, vh * scale);
  }
}
