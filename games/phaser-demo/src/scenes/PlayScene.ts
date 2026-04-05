import Phaser from 'phaser';

interface LevelConfig {
  starRate: number;
  starSpeedMin: number;
  starSpeedMax: number;
  bombRate: number;
  bombSpeedMin: number;
  bombSpeedMax: number;
}

const LEVELS: LevelConfig[] = [
  { starRate: 1400, starSpeedMin: 80, starSpeedMax: 140, bombRate: 3000, bombSpeedMin: 60, bombSpeedMax: 100 },
  { starRate: 1200, starSpeedMin: 100, starSpeedMax: 170, bombRate: 2500, bombSpeedMin: 80, bombSpeedMax: 130 },
  { starRate: 1000, starSpeedMin: 120, starSpeedMax: 200, bombRate: 2000, bombSpeedMin: 100, bombSpeedMax: 160 },
  { starRate: 800,  starSpeedMin: 150, starSpeedMax: 240, bombRate: 1600, bombSpeedMin: 120, bombSpeedMax: 200 },
  { starRate: 650,  starSpeedMin: 180, starSpeedMax: 280, bombRate: 1200, bombSpeedMin: 140, bombSpeedMax: 240 },
];

export class PlayScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private stars!: Phaser.Physics.Arcade.Group;
  private bombs!: Phaser.Physics.Arcade.Group;
  private clouds!: Phaser.GameObjects.Image[];

  private score = 0;
  private level = 0;
  private lives = 3;
  private isGameOver = false;

  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private levelUpText?: Phaser.GameObjects.Text;

  private spawnTimer!: Phaser.Time.TimerEvent;
  private bombTimer!: Phaser.Time.TimerEvent;

  private moveSpeed = 380;

  constructor() {
    super({ key: 'PlayScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.score = 0;
    this.level = 0;
    this.lives = 3;
    this.isGameOver = false;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2e, 0x0a0a2e, 0x1a1a5e, 0x1a0a3e, 1);
    bg.fillRect(0, 0, width, height);

    // Background stars
    this.createBgStars(width, height);

    // Clouds
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const cloud = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(40, height * 0.5),
        'cloud'
      ).setAlpha(0.3).setScale(1.2 + Math.random());
      this.clouds.push(cloud);
    }

    // Physics groups
    this.stars = this.physics.add.group();
    this.bombs = this.physics.add.group();

    // Player
    this.player = this.physics.add.image(width / 2, height - 90, 'player').setCollideWorldBounds(true);
    this.player.body?.setSize(56, 60);
    this.player.setDepth(10);

    // Ground zone indicator
    const groundLine = this.add.graphics().setDepth(1);
    groundLine.lineStyle(2, 0xffffff, 0.15);
    groundLine.lineBetween(0, height - 30, width, height - 30);

    // UI — top bar background
    const topBar = this.add.graphics().setDepth(5);
    topBar.fillStyle(0x000022, 0.6);
    topBar.fillRect(0, 0, width, 70);

    // Score
    this.scoreText = this.add.text(20, 20, '分数: 0', {
      fontSize: '22px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontStyle: 'bold',
      color: '#ffd700',
    }).setDepth(6);

    // Level
    this.levelText = this.add.text(20, 48, '第 1 关', {
      fontSize: '16px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#aaaaff',
    }).setDepth(6);

    // Hearts (lives)
    this.hearts = [];
    this.updateHearts(width);

    // Physics collisions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.physics.add.overlap(this.player, this.stars, ((p: any, s: any) => this.collectStar(p, s)) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.physics.add.overlap(this.player, this.bombs, ((p: any, b: any) => this.hitBomb(p, b)) as any);

    // Controls
    this.setupControls(width);

    // Start spawning
    this.startSpawning();

    // Clouds float up
    this.time.addEvent({
      delay: 4000,
      callback: () => {
        if (this.isGameOver) return;
        const cloud = this.clouds[Phaser.Math.Between(0, this.clouds.length - 1)];
        if (cloud) {
          cloud.setY(cloud.y - 10);
          if (cloud.y < -20) cloud.setY(height + 20);
        }
      },
      loop: true,
    });
  }

  private createBgStars(w: number, h: number) {
    const g = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.Between(0, w);
      const y = Phaser.Math.Between(0, h);
      const r = Phaser.Math.FloatBetween(0.5, 1.5);
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.2, 0.6));
      g.fillCircle(x, y, r);
    }
  }

  private updateHearts(width: number) {
    this.hearts.forEach(h => h.destroy());
    this.hearts = [];
    for (let i = 0; i < 3; i++) {
      const heart = this.add.image(
        width - 30 - i * 38,
        36,
        'heart'
      ).setScale(1.2).setAlpha(i < this.lives ? 1 : 0.2).setDepth(6);
      this.hearts.push(heart);
    }
  }

  private setupControls(width: number) {
    // Keyboard
    const cursors = this.input.keyboard?.createCursorKeys();
    const keyA = this.input.keyboard?.addKey('A');
    const keyD = this.input.keyboard?.addKey('D');

    // Touch/click — drag to move
    let dragStartX = 0;
    let playerStartX = 0;

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      dragStartX = ptr.x;
      playerStartX = this.player.x;
    });

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.isGameOver) {
        const delta = ptr.x - dragStartX;
        this.player.x = Phaser.Math.Clamp(playerStartX + delta, 40, width - 40);
      }
    });

    // Keyboard update
    this.time.addEvent({
      delay: 16,
      callback: () => {
        if (this.isGameOver) return;
        let dir = 0;
        if (cursors?.left.isDown || keyA?.isDown) dir = -1;
        if (cursors?.right.isDown || keyD?.isDown) dir = 1;
        if (dir !== 0) {
          this.player.x = Phaser.Math.Clamp(this.player.x + dir * this.moveSpeed * 0.06, 40, width - 40);
        }
      },
      loop: true,
    });

    // Pause on pointer up (stop momentum)
    this.input.on('pointerup', () => {
    });
  }

  private startSpawning() {
    const cfg = LEVELS[this.level];
    this.spawnTimer = this.time.addEvent({
      delay: cfg.starRate,
      callback: () => this.spawnStar(),
      loop: true,
    });
    this.bombTimer = this.time.addEvent({
      delay: cfg.bombRate,
      callback: () => this.spawnBomb(),
      loop: true,
    });
  }

  private updateSpawning() {
    const cfg = LEVELS[Phaser.Math.Clamp(this.level, 0, LEVELS.length - 1)];
    this.spawnTimer.reset({ delay: cfg.starRate, callback: () => this.spawnStar(), loop: true });
    this.bombTimer.reset({ delay: cfg.bombRate, callback: () => this.spawnBomb(), loop: true });
  }

  private spawnStar() {
    const { width } = this.cameras.main;
    const cfg = LEVELS[Phaser.Math.Clamp(this.level, 0, LEVELS.length - 1)];
    const x = Phaser.Math.Between(40, width - 40);
    const speed = Phaser.Math.Between(cfg.starSpeedMin, cfg.starSpeedMax);
    const star = this.stars.create(x, -20, 'star').setScale(1.1);
    (star.body as Phaser.Physics.Arcade.Body).setVelocityY(speed);
    star.rotation = Phaser.Math.FloatBetween(-0.5, 0.5);

    // Remove if off screen
    this.time.delayedCall(8000, () => { if (star.active) star.destroy(); });
  }

  private spawnBomb() {
    const { width } = this.cameras.main;
    const cfg = LEVELS[Phaser.Math.Clamp(this.level, 0, LEVELS.length - 1)];
    const x = Phaser.Math.Between(40, width - 40);
    const speed = Phaser.Math.Between(cfg.bombSpeedMin, cfg.bombSpeedMax);
    const bomb = this.bombs.create(x, -20, 'bomb').setScale(1.0);
    (bomb.body as Phaser.Physics.Arcade.Body).setVelocityY(speed);
    bomb.rotation = Phaser.Math.FloatBetween(-0.3, 0.3);

    this.time.delayedCall(8000, () => { if (bomb.active) bomb.destroy(); });
  }

  private collectStar(_player: Phaser.GameObjects.Image, star: Phaser.GameObjects.Image) {
    star.destroy();

    // Particle burst
    this.createStarBurst(star.x, star.y);

    // Score
    this.score += 10;
    this.scoreText.setText(`分数: ${this.score}`);

    // Score pop animation
    const pop = this.add.text(star.x, star.y - 10, '+10', {
      fontSize: '22px',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: pop,
      y: pop.y - 50,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => pop.destroy(),
    });

    // Level up check
    const newLevel = Math.min(Math.floor(this.score / 100), LEVELS.length - 1);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.showLevelUp();
      this.updateSpawning();
    }
  }

  private createStarBurst(x: number, y: number) {
    const particles = this.add.graphics();
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dist = Phaser.Math.Between(20, 40);
      const color = Phaser.Math.RND.pick([0xffd700, 0xffee88, 0xffff00]);
      particles.fillStyle(color, 1);
      const px = x + Math.cos(angle) * dist * 0.3;
      const py = y + Math.sin(angle) * dist * 0.3;
      particles.fillCircle(px, py, Phaser.Math.Between(2, 5));
    }
    this.tweens.add({
      targets: particles,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 400,
      onComplete: () => particles.destroy(),
    });
  }

  private showLevelUp() {
    const { width, height } = this.cameras.main;
    this.levelText.setText(`第 ${this.level + 1} 关`);

    if (this.levelUpText) this.levelUpText.destroy();
    this.levelUpText = this.add.text(width / 2, height / 2, `🎉 第 ${this.level + 1} 关!`, {
      fontSize: `${Math.min(width * 0.1, 52)}px`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#aa6600',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(30).setAlpha(0);

    this.tweens.add({
      targets: this.levelUpText,
      alpha: 1,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 300,
      yoyo: true,
      hold: 800,
      onComplete: () => this.levelUpText?.destroy(),
    });
  }

  private hitBomb(player: Phaser.GameObjects.Image, bomb: Phaser.GameObjects.Image) {
    bomb.destroy();
    this.lives--;
    this.updateHearts(this.cameras.main.width);

    // Screen shake
    this.cameras.main.shake(300, 0.015);

    // Flash red
    const flash = this.add.graphics().setDepth(25);
    flash.fillStyle(0xff0000, 0.4);
    flash.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });

    // Brief invincibility flash on player
    this.tweens.add({
      targets: player,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 5,
    });

    if (this.lives <= 0) {
      this.isGameOver = true;
      this.physics.pause();
      this.time.delayedCall(800, () => {
        this.scene.start('GameOverScene', { score: this.score, level: this.level + 1 });
      });
    }
  }

  update() {
    // Cleanup off-screen objects
    const { height } = this.cameras.main;
    this.stars.getChildren().forEach((s: Phaser.GameObjects.GameObject) => {
      if ((s as Phaser.Physics.Arcade.Image).y > height + 50) s.destroy();
    });
    this.bombs.getChildren().forEach((b: Phaser.GameObjects.GameObject) => {
      if ((b as Phaser.Physics.Arcade.Image).y > height + 50) b.destroy();
    });
  }
}
