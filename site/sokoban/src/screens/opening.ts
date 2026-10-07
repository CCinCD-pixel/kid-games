/**
 * S1 开场 (spec §2.1, ≤ 6 s, tap anywhere to skip): the design-system night scene with the launch
 * tower, a conveyor bringing supply crates, 小推 driving in and waving, the companion's line
 * "小步步调度员，火箭等着装货！". Then straight into 0-1.
 */
import type { LayoutInfo } from '@kit/shell';
import { playMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import type { AppCtx, Screen } from '../app/context';
import { drawCrate } from '../render/crate';
import { drawRobot, restPose, type RobotPose } from '../render/robot';
import sceneLandscape from '../../../../kit/textures/scene-landscape.webp';
import scenePortrait from '../../../../kit/textures/scene-portrait.webp';
import { CompanionStrip } from './companion';

export class OpeningScreen implements Screen {
  readonly el: HTMLDivElement;
  private readonly bg: HTMLDivElement;
  private readonly belt: HTMLDivElement;
  private readonly bot: HTMLCanvasElement;
  private readonly strip: CompanionStrip;
  private readonly hint: HTMLDivElement;
  private raf = 0;
  private t0 = performance.now();
  private done = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly ctx: AppCtx, private readonly next: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'sok-opening';
    this.bg = document.createElement('div');
    this.bg.className = 'sok-opening__bg';
    this.belt = document.createElement('div');
    this.belt.className = 'sok-belt';
    this.belt.innerHTML = `<div class="sok-belt__band"></div><div class="sok-belt__rollers">${'<i></i>'.repeat(16)}</div><div class="sok-belt__crates"></div>`;
    this.bot = document.createElement('canvas');
    this.bot.className = 'sok-opening__bot';
    this.hint = document.createElement('div');
    this.hint.className = 'sok-opening__skip';
    this.hint.textContent = '点一下，开始装货';
    this.el.append(this.bg, this.belt, this.bot, this.hint);
    ctx.app.append(this.el);
    this.strip = new CompanionStrip(this.el, ctx.voice);
    this.strip.el.classList.add('sok-comp--opening');
    this.el.addEventListener('pointerup', () => this.finish());
    this.layout(ctx.layout());
    this.crates();
    playSfx('sok-conveyor', { volume: 0.4 });
    playMusic();
    this.timers.push(setTimeout(() => void this.strip.say('sok.open.1', { mood: 'happy', hold: 6000 }), 900));
    this.timers.push(setTimeout(() => this.finish(), ctx.test ? 50 : 6000));
    const tick = () => {
      this.drawBot();
      if (!this.done) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private crates(): void {
    const host = this.belt.querySelector('.sok-belt__crates')!;
    for (let i = 0; i < 4; i += 1) {
      const c = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = 84 * dpr;
      c.height = 96 * dpr;
      c.style.width = '84px';
      c.style.height = '96px';
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      drawCrate(g, 2, 14, 80, { color: 0, lock: 0 });
      c.style.animationDelay = `${-i * 1.6}s`;
      host.append(c);
    }
  }

  layout(l: LayoutInfo): void {
    const portrait = l.height > l.width;
    this.bg.style.backgroundImage = `url(${portrait ? scenePortrait : sceneLandscape})`;
    this.el.dataset.orient = portrait ? 'portrait' : 'landscape';
    const dpr = Math.min(2, l.dpr || 1);
    const size = portrait ? 220 : 190;
    this.bot.width = size * dpr;
    this.bot.height = size * 1.25 * dpr;
    this.bot.style.width = `${size}px`;
    this.bot.style.height = `${size * 1.25}px`;
    // landscape: lower-right quadrant above the conveyor, clear of the moon (QA r3: the bubble covered it)
    this.strip.layout(portrait ? { x: 16, y: l.height - 190, w: l.width - 32, h: 72 } : { x: l.width - 260, y: Math.round(l.height * 0.4), w: 224, h: 260 }, portrait ? 'portrait' : 'landscape');
  }

  private drawBot(): void {
    const t = (performance.now() - this.t0) / 1000;
    const g = this.bot.getContext('2d')!;
    const w = this.bot.width;
    const h = this.bot.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const k = w / 220;
    g.scale(k, k);
    const drive = Math.min(1, t / 1.6);
    const waving = t > 1.7;
    const pose: RobotPose = {
      ...restPose(waving ? 1 : 2),
      bob: 1.5 * Math.sin(t * 9),
      tread: t * 3,
      eyes: waving ? 'happy' : 'normal',
      cheer: waving ? 0.6 + 0.4 * Math.sin(t * 8) : 0,
      lean: waving ? 0 : 0.08,
    };
    this.bot.style.transform = `translateX(${(1 - easeOut(drive)) * 120}%)`;
    drawRobot(g, 110, 262, 150, pose);
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearTimeout(t);
    this.el.classList.add('is-leaving');
    setTimeout(() => this.next(), this.ctx.test ? 0 : 320);
  }

  destroy(): void {
    this.done = true;
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearTimeout(t);
    this.strip.destroy();
    this.el.remove();
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
