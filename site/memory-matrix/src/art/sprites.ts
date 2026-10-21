// Pre-rendered canvas sprites: every glow, nebula and cloud is painted ONCE into an offscreen canvas and then only blitted (A13 iPad: no per-frame gradients).
import { createRng } from '@kit/rng';

export type Hue = 'gold' | 'ice' | 'amber' | 'jade';
const HUES: Record<Hue, { glow: string; edge: string; body: string; core: string }> = {
  gold: { glow: '255,214,99', edge: '#f2a321', body: '#ffd863', core: '#fff8dc' },
  ice: { glow: '140,200,255', edge: '#3d86d6', body: '#a9d8ff', core: '#f2faff' },
  amber: { glow: '255,170,70', edge: '#d9822b', body: '#ffbe5c', core: '#fff1d6' },
  jade: { glow: '60,220,190', edge: '#0f8f7d', body: '#5eead4', core: '#effffb' },
};
const cache = new Map<string, HTMLCanvasElement>();
const mk = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
};

/** four-point sparkle path centred on (0,0), outer radius R (plump: the waist is pulled out so it reads at 20 px) */
export function sparklePath(ctx: CanvasRenderingContext2D, R: number, waist = 0.2): void {
  const w = R * waist;
  ctx.beginPath(); ctx.moveTo(0, -R);
  ctx.quadraticCurveTo(w, -w, R, 0); ctx.quadraticCurveTo(w, w, 0, R); ctx.quadraticCurveTo(-w, w, -R, 0); ctx.quadraticCurveTo(-w, -w, 0, -R);
  ctx.closePath();
}

/** glowing star: glow reaches 2.5 R; the returned canvas is (5 R x dpr) square, drawn centred */
export function starSprite(R: number, dpr: number, hue: Hue = 'gold'): HTMLCanvasElement {
  const key = `star:${Math.round(R)}:${dpr}:${hue}`, hit = cache.get(key); if (hit) return hit;
  const H = HUES[hue], D = Math.ceil(R * 5 * dpr), [c, x] = mk(D, D), r = R * dpr;
  x.translate(D / 2, D / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
  g.addColorStop(0, `rgba(${H.glow},.62)`); g.addColorStop(0.35, `rgba(${H.glow},.26)`); g.addColorStop(1, `rgba(${H.glow},0)`);
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 2.5, 0, Math.PI * 2); x.fill();
  x.shadowColor = `rgba(${H.glow},.9)`; x.shadowBlur = r * 0.5;
  const body = x.createLinearGradient(0, -r, 0, r); body.addColorStop(0, H.core); body.addColorStop(0.45, H.body); body.addColorStop(1, H.edge);
  x.fillStyle = body; sparklePath(x, r * 1.02, 0.24); x.fill();
  x.shadowBlur = 0; x.rotate(Math.PI / 4); x.globalAlpha = 0.5; x.fillStyle = H.core; sparklePath(x, r * 0.55, 0.2); x.fill(); x.globalAlpha = 1;
  x.rotate(-Math.PI / 4); x.fillStyle = '#fff'; x.globalAlpha = 0.95; x.beginPath(); x.arc(0, 0, r * 0.16, 0, Math.PI * 2); x.fill();
  cache.set(key, c); return c;
}

/** an s2 sky star (a target to tap): pale blue-white four-point star + soft halo; R = the board's star radius, the sprite is (5 R x dpr) square */
export function skyStarSprite(R: number, dpr: number): HTMLCanvasElement {
  const key = `skystar:${Math.round(R)}:${dpr}`, hit = cache.get(key); if (hit) return hit;
  const D = Math.ceil(R * 4 * dpr), [c, x] = mk(D, D), r = R * dpr * 0.82;
  x.translate(D / 2, D / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r * 1.9); g.addColorStop(0, 'rgba(170,196,255,.5)'); g.addColorStop(0.45, 'rgba(120,150,235,.2)'); g.addColorStop(1, 'rgba(120,150,235,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 1.9, 0, Math.PI * 2); x.fill();
  const body = x.createLinearGradient(0, -r, 0, r); body.addColorStop(0, '#f3f7ff'); body.addColorStop(0.5, '#bccdff'); body.addColorStop(1, '#8aa2ee');
  x.shadowColor = 'rgba(170,196,255,.9)'; x.shadowBlur = r * 0.45; x.fillStyle = body; sparklePath(x, r, 0.26); x.fill();
  x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.9; x.beginPath(); x.arc(0, 0, r * 0.13, 0, Math.PI * 2); x.fill();
  cache.set(key, c); return c;
}

/** the amber 「点偏」 haze: soft, never red, no hard edge */
export function hazeSprite(R: number, dpr: number): HTMLCanvasElement {
  const key = `haze:${Math.round(R)}:${dpr}`, hit = cache.get(key); if (hit) return hit;
  const D = Math.ceil(R * 2 * dpr), [c, x] = mk(D, D), r = D / 2;
  const g = x.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, 'rgba(255,184,86,.75)'); g.addColorStop(0.5, 'rgba(240,150,60,.35)'); g.addColorStop(1, 'rgba(240,150,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, D, D);
  cache.set(key, c); return c;
}

/* The two big board sprites (glass 1280^2, fog 1792^2 px on an iPad) used to be painted in ONE 130-390 ms task at the first board of a session (QA r1: jank at 4x CPU).
 * They are written as generators that yield between steps: a direct call drains them at once (same result as before), prewarmSprites() drains them in idle slices
 * from the station so the first round finds them in the cache. */
function* glassGen(S: number, dpr: number, seed: string): Generator<void, HTMLCanvasElement> {
  const key = `glass:${Math.round(S)}:${dpr}:${seed}`, hit = cache.get(key); if (hit) return hit;
  const [c, x] = mk(S * dpr, S * dpr); x.scale(dpr, dpr);
  const rng = createRng(`mm:${seed}`);
  const bg = x.createLinearGradient(0, 0, S * 0.3, S); bg.addColorStop(0, '#111a48'); bg.addColorStop(1, '#090e28'); x.fillStyle = bg; x.fillRect(0, 0, S, S);
  yield;
  for (const [cx, cy, rad, col] of [[0.2, 0.25, 0.55, '47,180,214'], [0.85, 0.8, 0.6, '138,115,238'], [0.7, 0.15, 0.35, '231,107,208']] as const) {
    const g = x.createRadialGradient(cx * S, cy * S, 0, cx * S, cy * S, rad * S); g.addColorStop(0, `rgba(${col},.2)`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(0, 0, S, S);
    yield;
  }
  for (let i = 0; i < 70; i += 1) { x.globalAlpha = rng.float(0.15, 0.6); x.fillStyle = '#dfe8ff'; const r = rng.float(0.5, 1.2); x.beginPath(); x.arc(rng.float(0, S), rng.float(0, S), r, 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1;
  cache.set(key, c); return c;
}
/** the observatory glass: deep gradient, two nebulae, a few hundred tiny fixed specks (only ~12 ever twinkle, via CSS elsewhere) */
export function glassSprite(S: number, dpr: number, seed = 'glass'): HTMLCanvasElement { return drain(glassGen(S, dpr, seed)); }

function* fogGen(S: number, dpr: number): Generator<void, HTMLCanvasElement> {
  const key = `fog:${Math.round(S)}:${dpr}`, hit = cache.get(key); if (hit) return hit;
  const [c, x] = mk(S * dpr * 1.4, S * dpr * 1.4); x.scale(dpr, dpr);
  const W = S * 1.4, rng = createRng('mm:fog');
  const base = x.createLinearGradient(0, 0, W, W); base.addColorStop(0, 'rgba(62,80,150,.95)'); base.addColorStop(1, 'rgba(42,56,112,.97)'); x.fillStyle = base; x.fillRect(0, 0, W, W);
  yield;
  for (let i = 0; i < 26; i += 1) {
    const px = rng.float(0, W), py = rng.float(0, W), r = rng.float(S * 0.1, S * 0.3), light = i % 3 === 0;
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, light ? 'rgba(150,172,236,.42)' : 'rgba(26,36,86,.55)'); g.addColorStop(1, 'rgba(62,80,150,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    if (i % 4 === 3) yield;
  }
  cache.set(key, c); return c;
}
/** the drifting cloud layer that covers a board (「云雾」): painted once, scrolled by the board while it animates */
export function fogSprite(S: number, dpr: number): HTMLCanvasElement { return drain(fogGen(S, dpr)); }

function drain<T>(g: Generator<void, T>): T { for (;;) { const r = g.next(); if (r.done) return r.value; } }

/** Paint the board sprites for board side S in small idle slices (a slice is a few ms), then resolve. Safe to call repeatedly; a cancelled run just stops. */
export function prewarmSprites(S: number, dpr: number, isCancelled: () => boolean = () => false): Promise<void> {
  return new Promise((resolve) => {
    const jobs = [glassGen(S, dpr, 'glass'), fogGen(S, dpr)];
    const idle = (f: () => void): void => { const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 400 }); else window.setTimeout(f, 30); };
    const step = (): void => {
      if (isCancelled() || !jobs.length) { resolve(); return; }
      const r = jobs[0].next(); if (r.done) jobs.shift();
      idle(step);
    };
    idle(step);
  });
}

/** full-screen night backdrop used behind every screen */
export function skyBackdrop(w: number, h: number, dpr: number): HTMLCanvasElement {
  const key = `sky:${Math.round(w)}x${Math.round(h)}:${dpr}`, hit = cache.get(key); if (hit) return hit;
  const [c, x] = mk(w * dpr, h * dpr); x.scale(dpr, dpr);
  const rng = createRng('mm:sky');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#070b22'); g.addColorStop(0.55, '#0c1230'); g.addColorStop(1, '#17214f'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (const [cx, cy, rad, col] of [[0.15, 0.2, 0.6, '47,180,214'], [0.9, 0.55, 0.55, '138,115,238'], [0.4, 0.95, 0.5, '47,180,214']] as const) {
    const gr = x.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, rad * Math.max(w, h)); gr.addColorStop(0, `rgba(${col},.16)`); gr.addColorStop(1, `rgba(${col},0)`); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 120; i += 1) { x.globalAlpha = rng.float(0.12, 0.65); x.fillStyle = '#e6edff'; x.beginPath(); x.arc(rng.float(0, w), rng.float(0, h), rng.float(0.4, 1.3), 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1;
  cache.set(key, c); return c;
}
export function clearSprites(): void { cache.clear(); }
