import type { Snake } from '../types';

export class Hud {
  constructor(
    private readonly lenEl: HTMLElement,
    private readonly rankEl: HTMLElement,
    private readonly leaderboardEl: HTMLElement,
    private readonly deathScoreEl: HTMLElement,
    private readonly startScreenEl: HTMLElement,
    private readonly deathOverlayEl: HTMLElement,
  ) {}

  update(player: Snake | null, snakes: Snake[]): void {
    if (!player) {
      return;
    }

    this.lenEl.textContent = String(player.length);
    const alive = snakes.filter((snake) => snake.alive).sort((a, b) => b.length - a.length);
    const rank = alive.indexOf(player) + 1;
    this.rankEl.textContent = rank > 0 ? `#${rank}` : '-';

    const entries = alive.slice(0, 5).map((snake, index) => {
      const className = snake.isPlayer ? 'lb-entry me' : 'lb-entry';
      return `<div class="${className}"><span>${index + 1}. ${snake.name}</span><span>${snake.length}</span></div>`;
    });
    this.leaderboardEl.innerHTML = `<h3>🏆 排行榜</h3>${entries.join('')}`;
  }

  hideStart(): void {
    this.startScreenEl.style.display = 'none';
  }

  showDeath(player: Snake | null): void {
    this.deathScoreEl.textContent = `你的长度: ${player?.length ?? 0}`;
    this.deathOverlayEl.style.display = 'flex';
  }

  hideDeath(): void {
    this.deathOverlayEl.style.display = 'none';
  }
}
