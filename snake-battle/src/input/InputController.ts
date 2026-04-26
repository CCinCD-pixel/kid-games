import type { Snake } from '../types';

export class InputController {
  private touchPos: { x: number; y: number } | null = null;
  private touchActive = false;
  private player: Snake | null = null;
  private gameRunning = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.bind();
  }

  setPlayer(player: Snake | null): void {
    this.player = player;
  }

  setGameRunning(gameRunning: boolean): void {
    this.gameRunning = gameRunning;
  }

  updateTouchInput(): void {
    if (!this.touchActive || !this.touchPos || !this.player?.alive) {
      return;
    }
    const dx = this.touchPos.x - window.innerWidth / 2;
    const dy = this.touchPos.y - window.innerHeight / 2;
    if (dx * dx + dy * dy > 400) {
      this.player.targetAngle = Math.atan2(dy, dx);
    }
  }

  private bind(): void {
    this.canvas.addEventListener(
      'touchstart',
      (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        this.touchPos = { x: touch.clientX, y: touch.clientY };
        this.touchActive = true;
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      'touchmove',
      (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        this.touchPos = { x: touch.clientX, y: touch.clientY };
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      'touchend',
      (event) => {
        event.preventDefault();
        this.touchActive = false;
      },
      { passive: false },
    );

    this.canvas.addEventListener('mousemove', (event) => {
      if (!this.gameRunning || !this.player?.alive) {
        return;
      }
      this.player.targetAngle = Math.atan2(
        event.clientY - window.innerHeight / 2,
        event.clientX - window.innerWidth / 2,
      );
    });

    document.addEventListener('keydown', (event) => {
      if (!this.player?.alive) {
        return;
      }
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
          this.player.targetAngle = -Math.PI / 2;
          break;
        case 'ArrowDown':
        case 's':
          this.player.targetAngle = Math.PI / 2;
          break;
        case 'ArrowLeft':
        case 'a':
          this.player.targetAngle = Math.PI;
          break;
        case 'ArrowRight':
        case 'd':
          this.player.targetAngle = 0;
          break;
      }
    });
  }
}
