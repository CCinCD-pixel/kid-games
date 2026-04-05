import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  private clouds: Phaser.GameObjects.Image[] = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Sky gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2e, 0x0a0a2e, 0x1a1a5e, 0x1a0a3e, 1);
    bg.fillRect(0, 0, width, height);

    // Stars background
    this.createBgStars(width, height);

    // Floating clouds
    this.createClouds(width, height);

    // Title
    this.add.text(width / 2, height * 0.22, '⭐ 星星大作战 ⭐', {
      fontSize: `${Math.min(width * 0.09, 44)}px`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#aa7700',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(width / 2, height * 0.32, '接住星星，躲开炸弹！', {
      fontSize: `${Math.min(width * 0.045, 20)}px`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#aaaaff',
    }).setOrigin(0.5);

    // Character preview (bouncing)
    const preview = this.add.image(width / 2, height * 0.52, 'player').setScale(1.8);
    this.tweens.add({
      targets: preview,
      y: height * 0.52 - 20,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Touch to start hint
    const hint = this.add.text(width / 2, height * 0.72, '👆 点击任意处开始', {
      fontSize: `${Math.min(width * 0.045, 20)}px`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#ffffff88',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: hint,
      alpha: 0.2,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    // Decorative falling stars
    this.time.addEvent({
      delay: 600,
      callback: () => this.spawnMenuStar(width, height),
      loop: true,
    });

    // Start game
    this.input.once('pointerdown', () => {
      this.tweens.killAll();
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(400, () => this.scene.start('PlayScene'));
    });

    // Keyboard
    this.input.keyboard?.once('keydown-SPACE', () => {
      this.tweens.killAll();
      this.scene.start('PlayScene');
    });
  }

  private createBgStars(w: number, h: number) {
    const g = this.add.graphics();
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(0, w);
      const y = Phaser.Math.Between(0, h);
      const r = Phaser.Math.FloatBetween(0.5, 2);
      const alpha = Phaser.Math.FloatBetween(0.3, 1);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(x, y, r);
    }
  }

  private createClouds(w: number, h: number) {
    for (let i = 0; i < 5; i++) {
      const cloud = this.add.image(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(h * 0.05, h * 0.4),
        'cloud'
      ).setAlpha(0.4 + Math.random() * 0.3).setScale(1 + Math.random() * 1.5);

      this.clouds.push(cloud);
      this.tweens.add({
        targets: cloud,
        x: cloud.x + Phaser.Math.Between(-100, 100),
        duration: Phaser.Math.Between(8000, 15000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private spawnMenuStar(w: number, h: number) {
    const star = this.add.image(Phaser.Math.Between(20, w - 20), -20, 'star').setScale(0.8);
    const duration = Phaser.Math.Between(3000, 6000);
    this.tweens.add({
      targets: star,
      y: h + 40,
      x: star.x + Phaser.Math.Between(-60, 60),
      rotation: Phaser.Math.FloatBetween(-3, 3),
      duration,
      ease: 'Linear',
      onComplete: () => star.destroy(),
    });
  }
}
