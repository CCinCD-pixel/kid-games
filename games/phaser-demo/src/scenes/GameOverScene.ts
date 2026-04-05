import Phaser from 'phaser';

interface GameOverData {
  score: number;
  level: number;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: GameOverData) {
    this.registry.set('lastScore', data.score);
    this.registry.set('lastLevel', data.level);
  }

  create() {
    const { width, height } = this.cameras.main;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2e, 0x0a0a2e, 0x2a0a2e, 0x1a0a2e, 1);
    bg.fillRect(0, 0, width, height);

    // Stars
    const g = this.add.graphics();
    for (let i = 0; i < 100; i++) {
      g.fillStyle(0xffffff, Math.random() * 0.5 + 0.2);
      g.fillCircle(Math.random() * width, Math.random() * height, Math.random() * 1.5);
    }

    // Game Over title
    this.add.text(width / 2, height * 0.2, '游戏结束', {
      fontSize: `${Math.min(width * 0.12, 60)}px`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontStyle: 'bold',
      color: '#ff6666',
      stroke: '#880000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Score card
    const card = this.add.graphics();
    card.fillStyle(0xffffff, 0.08);
    card.fillRoundedRect(width / 2 - 140, height * 0.33, 280, 160, 20);

    const score = this.registry.get('lastScore') as number;
    const level = this.registry.get('lastLevel') as number;

    this.add.text(width / 2, height * 0.38, '🏆 最终得分', {
      fontSize: '18px',
      fontFamily: 'system-ui, sans-serif',
      color: '#aaaaff',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.48, `${score}`, {
      fontSize: `${Math.min(width * 0.14, 72)}px`,
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.56, `到达第 ${level} 关`, {
      fontSize: '18px',
      fontFamily: 'system-ui, sans-serif',
      color: '#aaaaff',
    }).setOrigin(0.5);

    // Buttons
    const btnY = height * 0.68;
    const btnW = Math.min(200, width * 0.55);
    const btnH = 56;

    // Replay button
    const replayBg = this.add.graphics();
    replayBg.fillStyle(0x5b8dee);
    replayBg.fillRoundedRect(width / 2 - btnW / 2, btnY, btnW, btnH, 16);

    this.add.text(width / 2, btnY + btnH / 2, '🔄 再玩一次', {
      fontSize: '22px',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(1);

    const replayZone = this.add.zone(width / 2, btnY + btnH / 2, btnW, btnH).setDepth(2);
    replayZone.setInteractive({ useHandCursor: true });
    replayZone.on('pointerdown', () => this.scene.start('PlayScene'));
    replayZone.on('pointerover', () => replayBg.clear(), this);
    replayZone.on('pointerover', () => {
      replayBg.clear();
      replayBg.fillStyle(0x7ba4f7);
      replayBg.fillRoundedRect(width / 2 - btnW / 2, btnY, btnW, btnH, 16);
    });
    replayZone.on('pointerout', () => {
      replayBg.clear();
      replayBg.fillStyle(0x5b8dee);
      replayBg.fillRoundedRect(width / 2 - btnW / 2, btnY, btnW, btnH, 16);
    });

    // Back button
    const backY = btnY + btnH + 16;
    this.add.text(width / 2, backY, '← 返回主页', {
      fontSize: '16px',
      fontFamily: 'system-ui, sans-serif',
      color: '#aaaaff',
    }).setOrigin(0.5);

    const backZone = this.add.zone(width / 2, backY, 150, 36).setDepth(2);
    backZone.setInteractive({ useHandCursor: true });
    backZone.on('pointerdown', () => this.scene.start('MenuScene'));
  }
}
