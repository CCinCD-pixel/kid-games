/**
 * Board renderer (spec §6.6, §8.5): ONE canvas the size of the panel. Order: cached panel + tiles →
 * dust → (clipped to the board cells) crates, goo, sprites, ice → selection / hint rings → star gates.
 * Everything that may leave the panel (particles, rockets, drones, flights) lives on the Fx canvas.
 */
import type { Atlas } from './atlas';
import { BOARD, EP_RIM } from './art/palette';
import { outlineLoops, roundedPath } from './outline';
import type { PlayLayout } from './layout';
import type { Scene, Sprite } from './scene';
import { BOMB, ORB, PIECE, POD, PROP, RH, RV } from '../core/types';

export class BoardCanvas {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private clip: Path2D | null = null;
  dpr = 1;
  cell = 80;
  rim = 10;
  ep = 1;
  /** idle tick counter (80 ms beat, spec §6.4) */
  beat = 0;
  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'em-board';
    parent.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  setup(l: PlayLayout, scene: Scene, dpr: number, ep: number): void {
    this.dpr = Math.min(2, dpr); this.cell = l.cell; this.rim = l.rim; this.ep = ep;
    const { w, h } = l.panel;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.buildBg(scene, w, h);
  }

  /**
   * Release every backing store now (spec §8.5, review B24): iOS Safari caps the page's TOTAL canvas
   * memory, and a level leaves ≈ 30 MB of canvases (board + tile cache + fx) that GC frees late — after
   * a dozen levels in one session a new board could otherwise come up blank.
   */
  dispose(): void {
    if (this.bg) { this.bg.width = 0; this.bg.height = 0; this.bg = null; }
    this.canvas.width = 0; this.canvas.height = 0;
    this.canvas.remove();
  }

  /** cell centre in panel px */
  cx(x: number): number { return this.rim + (x + 0.5) * this.cell; }
  cy(y: number): number { return this.rim + (y + 0.5) * this.cell; }

  private buildBg(scene: Scene, w: number, h: number): void {
    if (this.bg) { this.bg.width = 0; this.bg.height = 0; }
    const bg = document.createElement('canvas');
    bg.width = this.canvas.width; bg.height = this.canvas.height;
    const c = bg.getContext('2d')!;
    c.scale(this.dpr, this.dpr);
    const cell = this.cell, rim = this.rim, rad = cell * 0.18;
    const clip = new Path2D();
    for (let i = 0; i < scene.N; i += 1) {
      if (!scene.mask[i]) continue;
      const x = rim + (i % scene.W) * cell, y = rim + Math.floor(i / scene.W) * cell;
      clip.rect(x - 0.5, y - 0.5, cell + 1, cell + 1);
    }
    this.clip = clip;
    const loops = outlineLoops(scene.mask, scene.W, scene.H);
    const panel = roundedPath(loops, cell, rim, rim, rad);
    const rimCol = EP_RIM[this.ep] ?? EP_RIM[1];
    // drop shadow + rim (a 2×rim stroke whose inner half the panel fill covers)
    c.save();
    c.lineJoin = 'round';
    c.shadowColor = 'rgba(3,5,22,.55)'; c.shadowBlur = 24; c.shadowOffsetY = 10;
    c.strokeStyle = rimCol; c.lineWidth = rim * 2; c.stroke(panel);
    c.restore();
    c.save(); c.lineJoin = 'round';
    const rg = c.createLinearGradient(0, 0, 0, h);
    rg.addColorStop(0, 'rgba(255,255,255,.3)'); rg.addColorStop(0.45, 'rgba(255,255,255,0)'); rg.addColorStop(1, 'rgba(0,0,0,.25)');
    c.strokeStyle = rg; c.lineWidth = rim * 2; c.stroke(panel);
    c.restore();
    c.fillStyle = '#141a3d'; c.fill(panel);
    c.fillStyle = BOARD.panel; c.fill(panel);
    // checker tiles
    for (let i = 0; i < scene.N; i += 1) {
      if (!scene.mask[i]) continue;
      const cx = i % scene.W, cy = Math.floor(i / scene.W);
      const x = rim + cx * cell + 1, y = rim + cy * cell + 1;
      c.fillStyle = (cx + cy) % 2 ? BOARD.tileB : BOARD.tileA;
      c.beginPath(); c.roundRect(x, y, cell - 2, cell - 2, cell * 0.1); c.fill();
      c.fillStyle = BOARD.tileHi; c.fillRect(x + cell * 0.1, y + 1, cell - 2 - cell * 0.2, 1);
    }
    // star gates (internal refill points under a void, review D20)
    for (let i = 0; i < scene.N; i += 1) {
      if (!scene.spawner[i] || i < scene.W) continue;
      const x = rim + (i % scene.W + 0.5) * cell, y = rim + Math.floor(i / scene.W) * cell;
      c.save();
      c.strokeStyle = rimCol; c.globalAlpha = 0.85; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.arc(x, y + 2, cell * 0.25, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      c.restore();
    }
    this.bg = bg;
    void w;
  }

  draw(scene: Scene, atlas: Atlas | null): void {
    const c = this.ctx, d = this.dpr, cell = this.cell;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.bg) c.drawImage(this.bg, 0, 0);
    c.setTransform(d, 0, 0, d, 0, 0);
    // dust (under everything)
    for (let i = 0; i < scene.N; i += 1) {
      const lv = scene.dust[i], fade = scene.dustFade[i];
      if (!lv && fade <= 0) continue;
      this.drawDust(c, i, lv, fade, scene.W);
    }
    // star-gate lights
    for (let i = 0; i < scene.N; i += 1) {
      if (!scene.spawner[i] || i < scene.W) continue;
      const x = this.rim + (i % scene.W + 0.5) * cell, y = this.rim + Math.floor(i / scene.W) * cell;
      for (let k = -1; k <= 1; k += 1) {
        const a = Math.PI * 1.5 + k * 0.6;
        const g = scene.gate[i];
        c.fillStyle = g > 0 ? `rgba(255,236,170,${0.5 + 0.5 * g})` : 'rgba(255,220,240,.55)';
        c.beginPath(); c.arc(x + Math.cos(a) * cell * 0.25, y + 2 + Math.sin(a) * cell * 0.25, 2.6 + g * 2.5, 0, Math.PI * 2); c.fill();
      }
    }
    if (!atlas) return;
    c.save();
    if (this.clip) c.clip(this.clip);
    // crates & goo (cell layers)
    for (let i = 0; i < scene.N; i += 1) {
      const x = this.cx(i % scene.W), y = this.cy(Math.floor(i / scene.W));
      if (scene.crate[i]) { const s = scene.crateScale[i]; atlas.draw(c, scene.crate[i] === 2 && scene.crateDent[i] ? 'crate2d' : `crate${scene.crate[i]}`, x, y, cell, s, s); }
      if (scene.goo[i]) atlas.draw(c, `goo${(this.beat >> 2) % 4}`, x, y, cell);
    }
    // sprites
    const list = [...scene.sprites.values()].sort((a, b) => a.z - b.z);
    for (const s of list) this.drawSprite(c, atlas, s, scene);
    // ice
    for (let i = 0; i < scene.N; i += 1) {
      if (!scene.ice[i]) continue;
      const sh = scene.iceShake[i];
      atlas.draw(c, `ice${Math.min(2, scene.ice[i])}`, this.cx(i % scene.W) + sh, this.cy(Math.floor(i / scene.W)), cell);
    }
    c.restore();
    // teaching / aiming mask
    if (scene.maskCells) {
      c.save();
      if (this.clip) c.clip(this.clip); // dim the cells only, never the rounded rim/corners
      const p = new Path2D();
      p.rect(0, 0, this.canvas.width / d, this.canvas.height / d);
      for (const i of scene.maskCells) p.roundRect(this.rim + (i % scene.W) * cell + 2, this.rim + Math.floor(i / scene.W) * cell + 2, cell - 4, cell - 4, cell * 0.12);
      c.fillStyle = `rgba(6,9,28,${scene.maskAlpha})`; c.fill(p, 'evenodd');
      c.restore();
    }
    // tool aim: 30 % veil over the whole board, every valid target framed by cyan corner brackets,
    // the cell under the finger gets the ring + a reticle (spec §2.5)
    if (scene.aimTargets.length) {
      c.save();
      if (this.clip) c.clip(this.clip);
      if (!scene.maskCells) { c.fillStyle = 'rgba(6,9,28,.22)'; c.fillRect(0, 0, this.canvas.width / d, this.canvas.height / d); }
      c.strokeStyle = 'rgba(140,240,255,.85)'; c.lineWidth = Math.max(2.5, cell * 0.04); c.lineCap = 'round';
      c.shadowColor = 'rgba(95,227,240,.8)'; c.shadowBlur = 6;
      const k = cell * 0.2, m = cell * 0.12;
      c.beginPath();
      for (const i of scene.aimTargets) {
        const x0 = this.rim + (i % scene.W) * cell + m, y0 = this.rim + Math.floor(i / scene.W) * cell + m, x1 = x0 + cell - 2 * m, y1 = y0 + cell - 2 * m;
        c.moveTo(x0, y0 + k); c.lineTo(x0, y0); c.lineTo(x0 + k, y0);
        c.moveTo(x1 - k, y0); c.lineTo(x1, y0); c.lineTo(x1, y0 + k);
        c.moveTo(x1, y1 - k); c.lineTo(x1, y1); c.lineTo(x1 - k, y1);
        c.moveTo(x0 + k, y1); c.lineTo(x0, y1); c.lineTo(x0, y1 - k);
      }
      c.stroke();
      c.restore();
    }
    for (const i of scene.aimCells) {
      this.ring(c, i, scene.W, 'rgba(120,236,255,.95)', 0.9);
      if (scene.aimCells.length === 1) {
        const x = this.rim + ((i % scene.W) + 0.5) * cell, y = this.rim + (Math.floor(i / scene.W) + 0.5) * cell, r = cell * 0.3;
        c.save(); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 3; c.shadowColor = 'rgba(95,227,240,.9)'; c.shadowBlur = 10;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
        c.moveTo(x - r * 1.45, y); c.lineTo(x - r * 0.6, y); c.moveTo(x + r * 0.6, y); c.lineTo(x + r * 1.45, y);
        c.moveTo(x, y - r * 1.45); c.lineTo(x, y - r * 0.6); c.moveTo(x, y + r * 0.6); c.lineTo(x, y + r * 1.45);
        c.stroke(); c.restore();
      }
    }
    // selection ring
    if (scene.selected >= 0) this.ring(c, scene.selected, scene.W, 'rgba(255,240,180,.95)', 1);
  }

  private ring(c: CanvasRenderingContext2D, i: number, W: number, color: string, a: number): void {
    const x = this.rim + (i % W) * this.cell, y = this.rim + Math.floor(i / W) * this.cell;
    c.save(); c.globalAlpha = a; c.strokeStyle = color; c.lineWidth = 4; c.shadowColor = color; c.shadowBlur = 14;
    c.beginPath(); c.roundRect(x + 3, y + 3, this.cell - 6, this.cell - 6, this.cell * 0.16); c.stroke(); c.restore();
  }

  private drawSprite(c: CanvasRenderingContext2D, atlas: Atlas, s: Sprite, scene: Scene): void {
    if (s.alpha <= 0.01) return;
    let key = '';
    let bob = 0;
    const b = this.beat + s.phase;
    switch (s.kind) {
      case PIECE: key = `gem${s.color}`; break;
      case RH: case RV: { const ph = b % 38; key = `${s.kind === RH ? 'rh' : 'rv'}${ph < 5 ? ph : -1}`; break; }
      case PROP: key = `prop${b % 4}`; bob = Math.sin((b * 80) / 1600 * Math.PI * 2) * 2; break;
      case BOMB: key = `bomb${b % 3}`; break;
      case ORB: key = `orb${b % 8}`; break;
      case POD: key = 'pod'; break;
      default: return;
    }
    let x = this.cx(s.x), y = this.cy(s.y) + bob;
    // hint nudge (H1): the two cells push towards each other
    if (scene.hintCells.length === 2) {
      const k = scene.hintCells.indexOf(Math.round(s.y) * scene.W + Math.round(s.x));
      if (k >= 0 && Math.abs(s.x - Math.round(s.x)) < 0.01 && Math.abs(s.y - Math.round(s.y)) < 0.01) {
        const o = scene.hintCells[1 - k];
        const dx = (o % scene.W) - Math.round(s.x), dy = Math.floor(o / scene.W) - Math.round(s.y);
        const wob = Math.max(0, Math.sin(scene.hintPhase * Math.PI * 2 * 3)) * 6 * (scene.hintPhase < 1 ? 1 : 0);
        x += dx * wob; y += dy * wob;
      }
    } else if (scene.hintCells.length === 1 && scene.hintCells[0] === Math.round(s.y) * scene.W + Math.round(s.x)) {
      const k = 1 + 0.08 * Math.max(0, Math.sin(scene.hintPhase * Math.PI * 2 * 2));
      atlas.draw(c, key, x, y, this.cell, s.sx * k, s.sy * k, s.rot, s.alpha);
      return;
    }
    const sel = scene.selected >= 0 && scene.selected === Math.round(s.y) * scene.W + Math.round(s.x) && Math.abs(s.x - Math.round(s.x)) < 0.01;
    const k = sel ? 1.12 : 1;
    // squash pivots at the sprite's bottom edge so landings look grounded
    const yOff = (1 - s.sy) * this.cell * 0.43;
    atlas.draw(c, key, x, y + yOff, this.cell, s.sx * k, s.sy * k, s.rot, s.alpha);
    if (s.flash > 0.01) {
      c.save(); c.globalCompositeOperation = 'lighter';
      atlas.draw(c, key, x, y + yOff, this.cell, s.sx * k, s.sy * k, s.rot, s.alpha * s.flash);
      c.restore();
    }
  }

  private drawDust(c: CanvasRenderingContext2D, i: number, lv: number, fade: number, W: number): void {
    const cell = this.cell, x = this.rim + (i % W) * cell + 3, y = this.rim + Math.floor(i / W) * cell + 3, s = cell - 6;
    const draw = (layer: number, a: number) => {
      c.save(); c.globalAlpha = a;
      // QA r2: thick dust (2 layers) is a deep slate tile with a double frame, so it reads as a different
      // tile from thin lilac dust even where only the cell margin shows around a gem (spec §4.2 深灰格)
      c.fillStyle = layer >= 2 ? 'rgba(70,62,104,.96)' : 'rgba(176,163,204,.80)';
      c.beginPath(); c.roundRect(x, y, s, s, cell * 0.12); c.fill();
      if (layer >= 2) {
        c.strokeStyle = 'rgba(28,22,52,.75)'; c.lineWidth = 3; c.beginPath(); c.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, cell * 0.11); c.stroke();
        c.strokeStyle = 'rgba(196,182,236,.55)'; c.lineWidth = 2; c.beginPath(); c.roundRect(x + 5, y + 5, s - 10, s - 10, cell * 0.09); c.stroke();
      }
      // frosted grain + fixed sparkles seeded by the cell index
      let sd = i * 7919 + layer * 104729;
      const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      const n = layer >= 2 ? 14 : 7;
      for (let k = 0; k < n; k += 1) {
        const px = x + 4 + rnd() * (s - 8), py = y + 4 + rnd() * (s - 8), r = 0.8 + rnd() * (layer >= 2 ? 1.8 : 1.4);
        c.fillStyle = rnd() < 0.3 ? 'rgba(255,255,255,.85)' : 'rgba(230,220,255,.5)';
        c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(x + 0.6, y + 0.6, s - 1.2, s - 1.2, cell * 0.12); c.stroke();
      c.restore();
    };
    if (lv > 0) draw(lv, 1);
    if (fade > 0) draw(lv + 1, fade);
  }
}
