import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    this.createPlayerTexture();
    this.createStarTexture();
    this.createBombTexture();
    this.createCloudTexture();
    this.createHeartTexture();
  }

  private createPlayerTexture() {
    const g = this.add.graphics();

    // Body
    g.fillStyle(0x5b8dee);
    g.fillRoundedRect(4, 16, 56, 48, 12);
    g.fillStyle(0x7ba4f7);
    g.fillRoundedRect(8, 20, 24, 16, 6);

    // Eyes
    g.fillStyle(0xffffff);
    g.fillCircle(22, 34, 8);
    g.fillCircle(42, 34, 8);
    g.fillStyle(0x1a1a2e);
    g.fillCircle(24, 35, 4);
    g.fillCircle(44, 35, 4);
    g.fillStyle(0xffffff);
    g.fillCircle(26, 33, 2);
    g.fillCircle(46, 33, 2);

    // Smile
    g.lineStyle(2, 0xffffff);
    g.beginPath();
    g.arc(32, 42, 8, 0.2, Math.PI - 0.2);
    g.strokePath();

    // Basket
    g.fillStyle(0xd4a843);
    g.fillRoundedRect(8, 58, 48, 12, 4);
    g.fillStyle(0xf0c060);
    g.fillRect(10, 60, 44, 4);

    g.generateTexture('player', 64, 72);
    g.destroy();
  }

  private createStarTexture() {
    const g = this.add.graphics();
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI * 2) / 10 - Math.PI / 2;
      const r = i % 2 === 0 ? 18 : 8;
      pts.push(new Phaser.Math.Vector2(20 + Math.cos(angle) * r, 20 + Math.sin(angle) * r));
    }
    g.fillStyle(0xffd700);
    g.fillPoints(pts, true);
    g.fillStyle(0xfff0a0, 0.6);
    g.fillCircle(17, 17, 4);
    g.generateTexture('star', 40, 40);
    g.destroy();
  }

  private createBombTexture() {
    const g = this.add.graphics();
    g.fillStyle(0xff4444, 0.3);
    g.fillCircle(20, 22, 17);
    g.fillStyle(0x333333);
    g.fillCircle(20, 22, 13);
    g.fillStyle(0x666666);
    g.fillCircle(15, 17, 5);
    g.lineStyle(2, 0xd4a843);
    g.beginPath();
    g.moveTo(20, 9);
    g.lineTo(24, 4);
    g.strokePath();
    g.fillStyle(0xff8800);
    g.fillCircle(24, 3, 3);
    g.fillStyle(0xffff00);
    g.fillCircle(24, 3, 1.5);
    g.generateTexture('bomb', 40, 40);
    g.destroy();
  }

  private createCloudTexture() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.15);
    g.fillEllipse(32, 24, 64, 24);
    g.fillEllipse(20, 20, 32, 18);
    g.fillEllipse(44, 18, 28, 16);
    g.generateTexture('cloud', 64, 40);
    g.destroy();
  }

  private createHeartTexture() {
    const g = this.add.graphics();
    const heartPts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      const x = 16 + 13 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      heartPts.push(new Phaser.Math.Vector2(x, 16 - y * 0.6));
    }
    g.fillStyle(0xff4466);
    g.fillPoints(heartPts, true);
    g.fillStyle(0xff8899, 0.5);
    g.fillCircle(12, 12, 4);
    g.generateTexture('heart', 32, 32);
    g.destroy();
  }

  create() {
    this.scene.start('MenuScene');
  }
}
