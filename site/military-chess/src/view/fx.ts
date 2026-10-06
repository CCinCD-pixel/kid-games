/**
 * Effects (spec §6.8) as short-lived DOM nodes animated with WAAPI in the board's fx layer (board
 * coordinates). No canvas, no rAF loop; every node removes itself. All counts are small (≤24).
 */
import { createRng } from '@kit/rng';
import { EASE, MS, d, motionReduced } from './anim';
import { mcIcon, type McIcon } from './icons';
import type { Pt } from './layout';

const rng = createRng('mc:fx');

function node(layer: HTMLElement, cls: string, at: Pt, html = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.className = cls;
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  if (html) el.innerHTML = html;
  layer.appendChild(el);
  return el;
}

async function life(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
  const a = el.animate(frames, { fill: 'forwards', ...opts });
  await a.finished.catch(() => undefined);
  el.remove();
}

/** "7 > 5" comparison plate between two numbers (明棋 / face-up collisions) */
export async function plate(layer: HTMLElement, at: Pt, html: string, holdMs: number = MS.plateHold): Promise<void> {
  const el = node(layer, 'mc-plate', at, html);
  el.dataset.testid = 'compare-plate';
  await el.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: d(MS.plate * 0.6), easing: EASE.pop, fill: 'forwards' }).finished.catch(() => undefined);
  await new Promise((r) => setTimeout(r, d(holdMs)));
  await life(el, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-60%) scale(.9)' }], { duration: d(200), easing: 'ease-in' });
}

/** referee verdict badge (暗棋 / physical referee) */
export function verdictBadge(layer: HTMLElement, at: Pt, outcome: 'A' | 'D' | 'B' | 'F', text: string, ico: McIcon): HTMLDivElement {
  const el = node(layer, 'mc-verdict-badge', at, `${mcIcon(ico)}<span>${text}</span>`);
  el.dataset.o = outcome;
  el.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.12)', opacity: 1, offset: 0.65 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: d(motionReduced() ? 150 : 420), easing: EASE.pop, fill: 'forwards' });
  return el;
}
export async function dismiss(el: HTMLElement, ms = 220): Promise<void> {
  await life(el, [{ opacity: 1 }, { opacity: 0 }], { duration: d(ms) });
}

function burst(layer: HTMLElement, at: Pt, n: number, cls: string, spread: number, ms: number, style: (el: HTMLDivElement, k: number) => void, gravity = 0): Promise<void> {
  const all: Promise<void>[] = [];
  for (let k = 0; k < n; k++) {
    const el = node(layer, cls, at);
    style(el, k);
    const ang = (k / n) * Math.PI * 2 + rng.float(-0.3, 0.3);
    const dist = spread * rng.float(0.55, 1);
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
    all.push(life(el, [
      { transform: 'translate(0,0) scale(.6) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(1) rotate(${rng.int(-120, 120)}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy + gravity}px) scale(.8) rotate(${rng.int(-240, 240)}deg)`, opacity: 0 },
    ], { duration: d(ms * rng.float(0.8, 1.1)), easing: EASE.out }));
  }
  return Promise.all(all).then(() => undefined);
}

/** bomb: white flash 80 ms + shock ring 400 ms + 24 paper shards 700 ms */
export async function bomb(layer: HTMLElement, at: Pt): Promise<void> {
  if (motionReduced()) return smoke(layer, at);
  const flash = node(layer, 'mc-flash', { x: 0, y: 0 });
  flash.style.left = '0';
  flash.style.top = '0';
  void life(flash, [{ opacity: 0.85 }, { opacity: 0 }], { duration: d(MS.bombFlash + 120), easing: 'ease-out' });
  const ring = node(layer, 'mc-ring', at);
  ring.style.width = ring.style.height = '30px';
  void life(ring, [{ width: '30px', height: '30px', opacity: 1, borderWidth: '10px' }, { width: '230px', height: '230px', opacity: 0, borderWidth: '2px' }], { duration: d(MS.bombRing), easing: EASE.out });
  const cols = ['#f6b934', '#e4513d', '#fff6e3', '#eb6a3c', '#ffd56b'];
  await burst(layer, at, 24, 'mc-shard', 150, 700, (el, k) => {
    el.style.width = `${rng.int(6, 12)}px`;
    el.style.height = `${rng.int(4, 8)}px`;
    el.style.background = cols[k % cols.length];
    el.style.borderRadius = '2px';
  }, 40);
}

/** mine: 10 dust puffs */
export async function mineDust(layer: HTMLElement, at: Pt): Promise<void> {
  await burst(layer, at, 10, 'mc-puff', 46, MS.mineDust, (el) => {
    el.style.background = '#8a7a5c';
    const s = rng.int(16, 26);
    el.style.width = el.style.height = `${s}px`;
  });
}

/** generic "both down" smoke (also used when the viewer must not learn about a bomb/mine) */
export async function smoke(layer: HTMLElement, at: Pt): Promise<void> {
  await burst(layer, at, 6, 'mc-puff', 34, 520, (el) => {
    el.style.background = '#a3a8b2';
    const s = rng.int(18, 28);
    el.style.width = el.style.height = `${s}px`;
  });
}

/** both pieces split into two paper halves falling away */
export async function shards(layer: HTMLElement, at: Pt, colour: string): Promise<void> {
  const all: Promise<void>[] = [];
  for (const k of [-1, 1]) {
    const el = node(layer, 'mc-shard', at);
    Object.assign(el.style, { width: '40px', height: '44px', marginLeft: '-20px', marginTop: '-22px', background: colour, borderRadius: k < 0 ? '8px 2px 2px 8px' : '2px 8px 8px 2px', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.25)' });
    all.push(life(el, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${k * 26}px, 40px) rotate(${k * 35}deg)`, opacity: 0 }], { duration: d(MS.both), easing: EASE.in }));
  }
  await Promise.all(all);
}

/** gold sparks (engineer digs a mine, winner settles, first success) */
export async function sparks(layer: HTMLElement, at: Pt, n = 8): Promise<void> {
  await burst(layer, at, n, 'mc-spark', 40, 520, () => undefined);
}

/** gold ribbons for a captured flag (child wins only) */
export async function ribbons(layer: HTMLElement, at: Pt): Promise<void> {
  const cols = ['#f6b934', '#ffd56b', '#e4513d', '#1aa892', '#fff6e3'];
  await burst(layer, at, 22, 'mc-shard', 190, 1100, (el, k) => {
    el.style.width = '6px';
    el.style.height = `${rng.int(16, 26)}px`;
    el.style.background = cols[k % cols.length];
    el.style.borderRadius = '3px';
  }, 70);
}
