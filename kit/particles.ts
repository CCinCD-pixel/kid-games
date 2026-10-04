/**
 * Lightweight particle overlay: one fixed full-viewport <canvas> (pointer-events: none) that only
 * runs its rAF loop while particles are alive. For bursts on success, confetti on a level win,
 * sparkles on a collected item. DPR capped at 2; hard cap on particle count for the A13.
 *
 *   const fx = createParticles();
 *   fx.burst(x, y, { colors: ['#f6b934', '#fff'], count: 24 });
 *   fx.confetti();               // from the top, whole screen
 *   fx.sparkle(x, y);            // small twinkle
 */

import { prefersReducedMotion } from './tween';

export type Shape = 'circle' | 'square' | 'star' | 'ribbon';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: Shape;
  rot: number;
  vrot: number;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  count?: number;
  colors?: string[];
  shapes?: Shape[];
  /** px/s initial speed range */
  speed?: [number, number];
  /** particle size range in px */
  size?: [number, number];
  /** seconds */
  life?: [number, number];
  /** px/s² */
  gravity?: number;
  /** emission cone (radians); default full circle */
  angle?: [number, number];
}

export interface Particles {
  burst(x: number, y: number, opts?: BurstOptions): void;
  confetti(opts?: BurstOptions): void;
  sparkle(x: number, y: number, opts?: BurstOptions): void;
  /** Burst at an element's centre. */
  burstAt(el: Element, opts?: BurstOptions): void;
  readonly count: number;
  clear(): void;
  destroy(): void;
}

const DEFAULT_COLORS = ['#f6b934', '#fdd877', '#1aa892', '#3f7be6', '#e2506a', '#ffffff'];

export function createParticles(options: { container?: HTMLElement; zIndex?: number; maxParticles?: number } = {}): Particles {
  const max = options.maxParticles ?? 400;
  const canvas = document.createElement('canvas');
  canvas.className = 'kit-particles';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(options.zIndex ?? 90),
  });
  (options.container ?? document.body).appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  let parts: Particle[] = [];
  let raf = 0;
  let last = 0;
  let w = 0;
  let h = 0;

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

  const drawStar = (r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    ctx.clearRect(0, 0, w, h);
    const alive: Particle[] = [];
    for (const p of parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vx *= 1 - p.drag * dt;
      p.vy = p.vy * (1 - p.drag * dt) + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.y > h + 40) continue;
      alive.push(p);
      const fade = Math.min(1, p.life / (p.maxLife * 0.35));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square':
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;
        case 'ribbon':
          ctx.scale(1, Math.cos(p.rot * 3));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        case 'star':
          drawStar(p.size / 2);
          break;
      }
      ctx.restore();
    }
    parts = alive;
    if (parts.length) raf = requestAnimationFrame(frame);
    else {
      raf = 0;
      ctx.clearRect(0, 0, w, h);
    }
  };

  const ensureRunning = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  const emit = (x: number, y: number, o: BurstOptions, defaults: Required<BurstOptions>) => {
    const reduced = prefersReducedMotion();
    const count = Math.min(o.count ?? defaults.count, Math.max(0, max - parts.length));
    const n = reduced ? Math.min(6, count) : count;
    for (let i = 0; i < n; i += 1) {
      const [a0, a1] = o.angle ?? defaults.angle;
      const angle = rand(a0, a1);
      const speed = rand(...(o.speed ?? defaults.speed));
      const life = rand(...(o.life ?? defaults.life));
      parts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: rand(...(o.size ?? defaults.size)),
        color: pick(o.colors ?? defaults.colors),
        shape: pick(o.shapes ?? defaults.shapes),
        rot: rand(0, Math.PI * 2),
        vrot: rand(-6, 6),
        gravity: o.gravity ?? defaults.gravity,
        drag: 1.2,
      });
    }
    if (n) ensureRunning();
  };

  const burstDefaults: Required<BurstOptions> = {
    count: 26, colors: DEFAULT_COLORS, shapes: ['circle', 'star', 'square'], speed: [160, 460], size: [6, 14], life: [0.6, 1.1], gravity: 520, angle: [0, Math.PI * 2],
  };

  return {
    burst(x, y, opts = {}) {
      emit(x, y, opts, burstDefaults);
    },
    burstAt(el, opts = {}) {
      const r = el.getBoundingClientRect();
      emit(r.left + r.width / 2, r.top + r.height / 2, opts, burstDefaults);
    },
    sparkle(x, y, opts = {}) {
      emit(x, y, opts, { ...burstDefaults, count: 10, shapes: ['star'], speed: [40, 140], size: [5, 10], life: [0.35, 0.7], gravity: 0, colors: ['#ffffff', '#fdd877', '#8ff7ec'] });
    },
    confetti(opts = {}) {
      const total = opts.count ?? 120;
      const per = Math.ceil(total / 8);
      for (let i = 0; i < 8; i += 1) {
        emit(rand(0, w), -10, { ...opts, count: per }, { ...burstDefaults, shapes: ['ribbon', 'square', 'circle'], speed: [60, 240], size: [8, 14], life: [2.2, 3.4], gravity: 260, angle: [Math.PI * 0.25, Math.PI * 0.75] });
      }
    },
    get count() {
      return parts.length;
    },
    clear() {
      parts = [];
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.remove();
      parts = [];
    },
  };
}
