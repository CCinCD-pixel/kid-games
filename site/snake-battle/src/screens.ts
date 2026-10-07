/**
 * Menu screens (spec §2.4–2.5, §6.9): S1 lobby (venue badges + trophy slots, showcase canvas, 2×2 mode
 * grid), S4 pause, S5 death card, S6 podium / match summary, endless result, S12 settings (stage-1 subset).
 * 星港 design system: paper night theme, .xg-btn / .xg-card, accent --xg-snake. Never auto-advance.
 */
import { skinPreview } from './screens2';
import { h, bindPress, segmented, confetti } from '@kit/ui';
import { mount as mountBot, type Companion } from '@kit/companion';
import { VENUES, VENUE_IDS, FLOORS, AI_NAMES, type VenueId } from './sim/venues';
import { hex2rgb, mix, paintSegment, paintHead, rgb2css, skinById, segVariant, variantsOf, ballOf, type Rgb } from './render/art';
import { paintDeco, paintHeadPortrait, DECO, DECO_K } from './render/skins';
import type { SaveCtl } from './save';
import type { MatchResult } from './match';
import type { Snake, KillTag } from './sim/core';

// ---------------------------------------------------------------- planet badges (code-drawn, §6.9)
export function planetBadge(id: VenueId, size: number, locked: boolean) {
  const c = h('canvas', { class: 'sb-planet', width: size * 2, height: size * 2 }) as HTMLCanvasElement;
  const x = c.getContext('2d')!; x.scale(2, 2);
  const R = size / 2 - 6, cx = size / 2, cy = size / 2;
  const fl = FLOORS[id].map(hex2rgb);
  const base = locked ? fl.map((q) => { const l = (q[0] + q[1] + q[2]) / 3; return [l, l, l] as Rgb; }) : fl;
  const g = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  g.addColorStop(0, rgb2css(mix(base[2], [255, 255, 255], 0.35))); g.addColorStop(0.55, rgb2css(base[2])); g.addColorStop(1, rgb2css(base[0]));
  x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.clip();
  if (id === 'moon') for (const [px, py, pr] of [[0.3, 0.35, 0.16], [0.62, 0.6, 0.12], [0.45, 0.72, 0.08], [0.7, 0.3, 0.07]]) { x.beginPath(); x.arc(px * size, py * size, pr * size, 0, Math.PI * 2); x.fillStyle = rgb2css(base[0], 0.55); x.fill(); }
  if (id === 'mars') for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(cx, cy - R + i * R * 0.55 + 8, R * 1.1, R * 0.12, -0.25, 0, Math.PI * 2); x.fillStyle = rgb2css(base[1], 0.6); x.fill(); }
  if (id === 'jupiter') { for (let i = 0; i < 6; i++) { x.fillStyle = rgb2css(i % 2 ? base[1] : mix(base[2], [255, 240, 220], 0.3), 0.75); x.fillRect(0, cy - R + i * (R / 3), size, R / 6); } x.beginPath(); x.ellipse(cx + R * 0.3, cy + R * 0.25, R * 0.22, R * 0.13, 0, 0, Math.PI * 2); x.fillStyle = locked ? '#888' : '#c8553d'; x.fill(); }
  x.restore();
  if (id === 'blackhole') {
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = '#07051a'; x.fill();
    x.lineWidth = 7; x.strokeStyle = locked ? '#777' : '#b89bff'; x.beginPath(); x.ellipse(cx, cy, R * 0.98, R * 0.36, -0.35, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 3; x.strokeStyle = locked ? '#aaa' : '#ffe7a8'; x.beginPath(); x.arc(cx, cy, R * 0.42, 0, Math.PI * 2); x.stroke();
  }
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.5)'; x.stroke();
  x.beginPath(); x.ellipse(cx - R * 0.35, cy - R * 0.45, R * 0.3, R * 0.14, -0.6, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,0.28)'; x.fill();
  return c;
}

const LOCK = '<svg viewBox="0 0 24 24" class="sb-lock"><rect x="5" y="10.5" width="14" height="10" rx="2.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke-width="2.6"/></svg>';
const TROPHY_ICON: Record<string, string> = {
  podium: '<svg viewBox="0 0 24 24"><path d="M3 20h18v-6h-5V9H8v8H3z"/></svg>',
  cut: '<svg viewBox="0 0 24 24"><path d="M3 15c6 0 8-9 18-9l-3 4 3 4c-8 0-9 5-18 5z"/></svg>',
  length: '<svg viewBox="0 0 24 24"><path d="M3 15c3-6 6 2 9-4s6 2 9-4v5c-3 6-6-2-9 4s-6-2-9 4z"/></svg>',
};

// ---------------------------------------------------------------- showcase (his snake on a figure-8)
/** stardust in the showcase (760×300 design box): along and around the figure-8 */
const DUST: [number, number, string?][] = [[120, 120], [205, 230, 'big'], [300, 115], [380, 172], [455, 228], [560, 110, 'big'], [640, 170], [90, 215], [700, 240], [250, 60], [520, 60], [420, 270], [330, 250], [610, 60]];
const DUST_COL = ['rgba(255,226,120,1)', 'rgba(140,220,255,1)', 'rgba(255,150,210,1)', 'rgba(170,255,170,1)'];
export class Showcase {
  private ctx: CanvasRenderingContext2D; private raf = 0; private t = 0; private last = 0; private idle = 0;
  private cache = new Map<string, HTMLCanvasElement>(); private asleep = false; private eaten: number[] = [];
  constructor(private canvas: HTMLCanvasElement, private skin: string, private venue: VenueId, private name: string) {
    this.ctx = canvas.getContext('2d')!;
    const sk = skinById(skin), base = hex2rgb(sk.base), acc = hex2rgb(sk.accent);
    const mk = (key: string, f: (c: CanvasRenderingContext2D, R: number) => void) => { const cv = document.createElement('canvas'); cv.width = cv.height = 96; const c = cv.getContext('2d')!; c.translate(48, 48); f(c, 42); this.cache.set(key, cv); };
    for (const v of variantsOf(sk.pattern)) { mk(ballOf(v), (c, R) => paintSegment(c, R, base, acc, ballOf(v))); if (DECO.has(v)) mk(`d:${v}`, (c) => paintDeco(c, 40, v, base, acc)); }
    for (const closed of [false, true]) { const cv = document.createElement('canvas'); cv.width = cv.height = 160; const c = cv.getContext('2d')!; c.translate(80, 80); paintHeadPortrait(c, 30, sk, base, acc, closed); this.cache.set(closed ? 'headZ' : 'head', cv); }
  }
  fit() { const r = this.canvas.getBoundingClientRect(); if (r.width > 0) { const W = Math.round(r.width * 2), H = Math.round(r.height * 2); if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; } } }
  start() { this.fit(); this.last = performance.now(); const loop = (now: number) => { this.raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - this.last) / 1000); if (dt < 1 / 32) return; this.last = now; this.tick(dt); }; this.raf = requestAnimationFrame(loop); }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  poke() { this.idle = 0; if (this.asleep) { this.asleep = false; this.start(); } }
  setVenue(v: VenueId) { this.venue = v; this.poke(); }
  private tick(dt: number) {
    this.t += dt; this.idle += dt;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height, k = Math.min(W / 760, H / 300);
    c.save(); c.translate((W - 760 * k) / 2, (H - 300 * k) / 2);
    const fl = FLOORS[this.venue].map(hex2rgb);
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, rgb2css(fl[1])); g.addColorStop(1, rgb2css(fl[0]));
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
    // floor detail (QA r4: the hero panel read as a flat grey box): a faint hex grid, craters with a lit rim
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 2;
    const hs = 46 * k * 2 / 2;
    for (let y = 0, row = 0; y < H + hs; y += hs * 1.5, row++) for (let x = (row % 2) * hs * 0.866; x < W + hs; x += hs * 1.732) { c.beginPath(); for (let j = 0; j < 6; j++) { const an = Math.PI / 6 + j * Math.PI / 3; c.lineTo(x + Math.cos(an) * hs, y + Math.sin(an) * hs); } c.closePath(); c.stroke(); }
    c.restore();
    for (let i = 0; i < 9; i++) {
      const cx = ((i * 173 + 40) % 760) * k, cy = ((i * 97 + 30) % 300) * k, rx = (18 + (i * 7) % 16) * k, ry = rx * 0.7;
      c.fillStyle = rgb2css(fl[2], 0.22); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 2 * k; c.beginPath(); c.ellipse(cx, cy + ry * 0.12, rx, ry, 0, Math.PI * 0.05, Math.PI * 0.95); c.stroke();
    }
    const sleeping = this.idle > 20;
    const sk = skinById(this.skin);
    const N = 22, sp = 0.42;
    // the swim stays inside the panel with room for the name tag above the head (QA r4: the tag was clipped)
    const pos = (u: number): [number, number] => sleeping ? [380 * k + Math.cos(u) * 70 * k, 170 * k + Math.sin(u) * 46 * k] : [380 * k + Math.sin(u) * 280 * k, 172 * k + Math.sin(2 * u) * 72 * k];
    // stardust he eats on his way round: a pellet under the head pops and grows back 3 s later
    const [hx0, hy0] = pos(sleeping ? 0 : this.t * 0.55);
    for (let i = 0; i < DUST.length; i++) {
      const [dx, dy, dc] = DUST[i], px = dx * k, py = dy * k;
      if (!sleeping && Math.hypot(px - hx0, py - hy0) < 30 * k && this.t - (this.eaten[i] ?? -9) > 3) this.eaten[i] = this.t;
      const since = this.t - (this.eaten[i] ?? -9); if (since < 3) { if (since < 0.25) { c.strokeStyle = `rgba(255,240,180,${1 - since * 4})`; c.lineWidth = 3 * k; c.beginPath(); c.arc(px, py, (8 + since * 60) * k, 0, Math.PI * 2); c.stroke(); } continue; }
      const tw = 0.75 + 0.25 * Math.sin(this.t * 3 + i * 1.7), rr = (dc === 'big' ? 9 : 5.5) * k * tw;
      const gg = c.createRadialGradient(px, py, 0, px, py, rr * 2.6); gg.addColorStop(0, DUST_COL[i % DUST_COL.length]); gg.addColorStop(0.35, DUST_COL[i % DUST_COL.length]); gg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(px, py, rr * 2.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(px - rr * 0.25, py - rr * 0.25, rr * 0.35, 0, Math.PI * 2); c.fill();
    }
    const u0 = sleeping ? 0 : this.t * 0.55;
    const R = 26 * k;
    for (let i = N - 1; i >= 0; i--) {
      const [x, y] = pos(u0 - i * sp * (sleeping ? 0.95 : 0.2));
      const v = segVariant(sk.pattern, i, N), img = this.cache.get(ballOf(v)) ?? this.cache.get('plain')!;
      const rr = R * (i > N * 0.85 ? 1 - 0.4 * (i - N * 0.85) / (N * 0.15) : 1) * (v === 'coupler' ? 0.7 : 1);
      c.drawImage(img, x - rr * 1.14, y - rr * 1.14, rr * 2.28, rr * 2.28);
      const dimg = DECO.has(v) ? this.cache.get(`d:${v}`) : undefined;
      if (dimg) { const [px, py] = pos(u0 - (i - 1) * sp * (sleeping ? 0.95 : 0.2)), dk = (DECO_K[v] ?? 1) * rr * 1.14; c.save(); c.translate(x, y); c.rotate(v === 'swirl' ? i * 0.8 - this.t * 1.8 : Math.atan2(py - y, px - x)); c.drawImage(dimg, -dk, -dk, dk * 2, dk * 2); c.restore(); }
    }
    const [hx, hy] = pos(u0), [nx, ny] = pos(u0 + 0.01); const a = Math.atan2(ny - hy, nx - hx);
    const shut = sleeping || (this.t % 4) < 0.12, hsz = R * 1.086 * 80 / 30;
    c.save(); c.translate(hx, hy); c.rotate(a); c.drawImage(this.cache.get(shut ? 'headZ' : 'head')!, -hsz, -hsz, hsz * 2, hsz * 2);
    c.restore();
    // name tag
    c.font = `600 ${20 * k}px -apple-system, 'PingFang SC', system-ui`; const tw = c.measureText(this.name).width;
    c.fillStyle = 'rgba(20,22,40,.72)'; c.strokeStyle = '#ffd23f'; c.lineWidth = 2 * k;
    c.beginPath(); c.roundRect(hx - tw / 2 - 12 * k, hy - R * 2.6 - 15 * k, tw + 24 * k, 30 * k, 15 * k); c.fill(); c.stroke();
    c.fillStyle = '#fff6e3'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(this.name, hx, hy - R * 2.6);
    if (sleeping) { c.font = `700 ${28 * k}px -apple-system, system-ui`; c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillText('Z', hx + 40 * k, hy - 60 * k); this.asleep = true; this.stop(); }
    c.restore();
    // vignette + a soft top rim light
    const vg = c.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,6,20,0.55)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
    const rim = c.createLinearGradient(0, 0, 0, H * 0.25); rim.addColorStop(0, 'rgba(255,240,200,0.12)'); rim.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = rim; c.fillRect(0, 0, W, H * 0.25);
  }
}

// ---------------------------------------------------------------- lobby
export interface LobbyHandlers { onPlay: (mode: 'timed' | 'endless', v: VenueId) => void; onVenue: (v: VenueId, locked: boolean) => void; onSettings: () => void; onSoon: (what: string) => void; onMissions: () => void; onCollection: () => void; onRecords: () => void }

export function renderLobby(root: HTMLElement, save: SaveCtl, venue: VenueId, name: string, hd: LobbyHandlers) {
  const d = save.data;
  const venues = h('div', { class: 'sb-venues' });
  const showcaseCanvas = h('canvas', { class: 'sb-showcase__cv', width: 1520, height: 600 }) as HTMLCanvasElement;
  const show = new Showcase(showcaseCanvas, d.equipped.skin, venue, name);
  const setSel = (v: VenueId) => { for (const b of Array.from(venues.children) as HTMLElement[]) b.classList.toggle('is-sel', b.dataset.v === v); };
  for (const id of VENUE_IDS) {
    const open = save.venueOpen(id);
    const slots = h('div', { class: 'sb-trophies' }, ...save.trophiesOf(id).map((t) => { const s = h('i', { class: 'sb-trophy' + (t.owned ? ' is-on' : ''), title: t.name }); s.innerHTML = TROPHY_ICON[t.icon] ?? ''; return s; }));
    const b = h('button', { class: 'sb-venue' + (open ? '' : ' is-locked'), type: 'button', 'data-v': id, 'data-sfx': 'ui-select' },
      h('div', { class: 'sb-venue__badge' }, planetBadge(id, 120, !open)), h('span', { class: 'sb-venue__name' }, VENUES[id].name), slots);
    if (!open) b.querySelector('.sb-venue__badge')!.insertAdjacentHTML('beforeend', LOCK);
    b.addEventListener('click', () => { show.poke(); if (open) { setSel(id); show.setVenue(id); } hd.onVenue(id, !open); });
    venues.append(b);
  }
  setSel(venue);
  const vr = () => d.venues[(venues.querySelector('.is-sel') as HTMLElement)?.dataset.v as VenueId ?? venue];
  const tile = (cls: string, iconSvg: string, label: string, chip: string, on: () => void, locked = false) => {
    const b = h('button', { class: `xg-btn xg-btn--lg sb-mode ${cls}` + (locked ? ' is-soon' : ''), type: 'button', 'data-sfx': locked ? 'ui-locked' : 'ui-confirm' });
    b.innerHTML = `<span class="sb-mode__icon">${iconSvg}</span><span class="sb-mode__label">${label}</span>${chip ? `<span class="sb-mode__chip">${chip}</span>` : ''}`;
    b.addEventListener('click', () => { show.poke(); on(); });
    return b;
  };
  const sel = () => ((venues.querySelector('.is-sel') as HTMLElement)?.dataset.v as VenueId) ?? venue;
  const missionChip = () => { const done = Object.values(d.missions).filter((m) => m.clears > 0).length; const st = Object.values(d.missions).reduce((a, m) => a + (m.stars ?? 0), 0); const ch = Math.min(5, 1 + [7, 15, 23, 31].filter((i) => done > i).length); return done ? `第${ch}章 ★${st}` : '学招'; };
  const timedChip = () => { const r = vr(); return r.bestRank ? `最好 第${r.bestRank}名` : ''; };
  const endChip = () => { const r = vr(); return r.endless.bestPeak ? `最长 ${r.endless.bestPeak}` : ''; };
  const modes = h('div', { class: 'sb-modes' },
    tile('sb-mode--timed xg-btn--primary', '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 9.5v4.5l3 2M9.5 3h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>', '限时赛', timedChip(), () => hd.onPlay('timed', sel())),
    tile('sb-mode--endless', '<svg viewBox="0 0 24 24"><path d="M7 8.5c-2 0-3.5 1.6-3.5 3.5S5 15.5 7 15.5c3.5 0 6.5-7 10-7 2 0 3.5 1.6 3.5 3.5S19 15.5 17 15.5c-3.5 0-6.5-7-10-7z" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>', '无尽', endChip(), () => hd.onPlay('endless', sel())),
    tile('sb-mode--mission', '<svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>', '挑战关', missionChip(), () => hd.onMissions()),
    tile('sb-mode--collection', '<svg viewBox="0 0 24 24"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3 9h18M12 9v11M12 9c-2-4-7-5-6-1M12 9c2-4 7-5 6-1" fill="none" stroke="currentColor" stroke-width="2"/></svg>', '收藏馆', `${d.owned.filter((k) => k.startsWith('skin:')).length}/18`, () => hd.onCollection()),
  );
  const records = h('button', { class: 'xg-btn sb-records', type: 'button', 'data-sfx': 'ui-open' });
  records.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0zM4 5h3v3a3 3 0 0 1-3-3zM20 5h-3v3a3 3 0 0 0 3-3zM10 14h4v3h-4zM8 18h8v2H8z"/></svg><span>纪录</span>';
  records.addEventListener('click', () => { show.poke(); hd.onRecords(); });
  const gear = h('button', { class: 'sb-gear', type: 'button', 'aria-label': '设置', 'data-sfx': 'ui-open' });
  gear.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5.1-1.7-.4a7 7 0 0 1-.7 1.7l1 1.5-1.7 1.7-1.5-1a7 7 0 0 1-1.7.7l-.4 1.7h-2.4l-.4-1.7a7 7 0 0 1-1.7-.7l-1.5 1L5 17.4l1-1.5a7 7 0 0 1-.7-1.7l-1.7-.4v-2.4l1.7-.4a7 7 0 0 1 .7-1.7l-1-1.5L6.6 6l1.5 1a7 7 0 0 1 1.7-.7l.4-1.7h2.4l.4 1.7a7 7 0 0 1 1.7.7l1.5-1 1.7 1.7-1 1.5a7 7 0 0 1 .7 1.7l1.7.4z"/></svg>';
  gear.addEventListener('click', () => hd.onSettings());
  const botHost = h('div', { class: 'sb-bot' });
  const lobby = h('section', { class: 'sb-lobby' },
    h('div', { class: 'sb-titlebar' }, h('h1', { class: 'sb-title' }, '贪吃蛇大作战'), gear),
    venues,
    h('div', { class: 'sb-showcase' }, showcaseCanvas),
    modes, records, botHost);
  root.append(lobby);
  bindPress(lobby);
  lobby.addEventListener('pointerdown', () => show.poke());
  show.start();
  const bot: Companion = mountBot(botHost, { size: 96, bubble: 'left' } as Parameters<typeof mountBot>[1]);
  return { el: lobby, bot, dispose() { show.stop(); lobby.remove(); } };
}

// ---------------------------------------------------------------- panels
export function panel(root: HTMLElement, cls: string, ...kids: (Node | string)[]) {
  const scrim = h('div', { class: `sb-scrim ${cls}` }, h('div', { class: 'sb-panel xg-root' }, ...kids));
  root.append(scrim); bindPress(scrim);
  return scrim;
}
export function btn(label: string, kind: string, on: () => void, sfx = 'ui-confirm') {
  const b = h('button', { class: `xg-btn ${kind}`, type: 'button', 'data-sfx': sfx }, label);
  b.addEventListener('click', on); return b;
}

export function pausePanel(root: HTMLElement, o: { endless: boolean; mission?: boolean; tired?: boolean; onResume: () => void; onRestart: () => void; onSettings: () => void; onLobby: () => void; onBank: () => void }) {
  const p = panel(root, 'sb-pausep',
    h('h2', { class: 'sb-panel__title' }, o.tired ? '小蛇有点累了' : '暂停'),
    ...(o.tired ? [h('p', { class: 'sb-panel__text' }, '休息一下再继续吧。')] : []),
    btn('继续', 'xg-btn--primary xg-btn--lg', o.onResume),
    ...(o.endless ? [btn('收工', 'xg-btn--gold sb-bank', o.onBank)] : []),
    btn('重新开始', '', o.onRestart), btn('设置', '', o.onSettings, 'ui-open'), btn(o.mission ? '回地图' : '回大厅', 'sb-quiet', () => {
      const c = panel(root, 'sb-confirm', h('h2', { class: 'sb-panel__title' }, o.mission ? '离开这关？' : '离开这局？'), h('p', { class: 'sb-panel__text' }, o.mission ? '星星会保存好。' : '最长纪录会保存好。'),
        btn('继续玩', 'xg-btn--primary xg-btn--lg', () => c.remove()), btn('离开', '', () => { c.remove(); o.onLobby(); }, 'ui-back'));
    }, 'ui-back'));
  return p;
}

export function settingsPanel(root: HTMLElement, save: SaveCtl, onClose: () => void) {
  const s = save.data.settings;
  const ctl = h('div'), side = h('div'), names = h('div'), music = h('div');
  segmented(ctl, { night: true, value: s.control, options: [{ id: 'follow', label: '跟手指' }, { id: 'stick', label: '摇杆' }], onChange: (id) => { s.control = id as 'follow' | 'stick'; save.save(); } });
  segmented(side, { night: true, value: save.boostSide(), options: [{ id: 'left', label: '左边' }, { id: 'right', label: '右边' }], onChange: (id) => { s.boostSide = id as 'left' | 'right'; save.save(); } });
  segmented(names, { night: true, value: s.showNames ? 'on' : 'off', options: [{ id: 'on', label: '显示' }, { id: 'off', label: '不显示' }], onChange: (id) => { s.showNames = id === 'on'; save.save(); } });
  segmented(music, { night: true, value: s.matchMusic ? 'on' : 'off', options: [{ id: 'on', label: '开' }, { id: 'off', label: '关' }], onChange: (id) => { s.matchMusic = id === 'on'; save.save(); } });
  const dbl = h('div'), crown = h('div');
  segmented(dbl, { night: true, value: s.doubleTapBoost ? 'on' : 'off', options: [{ id: 'on', label: '开' }, { id: 'off', label: '关' }], onChange: (id) => { s.doubleTapBoost = id === 'on'; save.save(); } });
  const hasCrown = save.data.owned.includes('crown');
  if (hasCrown) segmented(crown, { night: true, value: s.crown ? 'on' : 'off', options: [{ id: 'on', label: '戴上' }, { id: 'off', label: '不戴' }], onChange: (id) => { s.crown = id === 'on'; save.save(); } });
  // a 3 s looping picture of the chosen control (spec §2.5 S12): finger leads the snake / thumb on a stick
  const demo = h('div', { class: `sb-ctldemo is-${s.control}`, 'aria-hidden': 'true' });
  demo.innerHTML = '<svg viewBox="0 0 120 80"><g class="sb-ctldemo__follow"><path class="sb-ctldemo__body" d="M10 60 q20 -30 45 -20 t50 -18" fill="none" stroke="#ffd23f" stroke-width="10" stroke-linecap="round"/><circle class="sb-ctldemo__finger" cx="104" cy="22" r="9" fill="#fff" stroke="#2b3a8a" stroke-width="3"/></g><g class="sb-ctldemo__stick"><circle cx="40" cy="44" r="26" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.5)" stroke-width="3"/><circle class="sb-ctldemo__knob" cx="40" cy="44" r="12" fill="#fff" stroke="#2b3a8a" stroke-width="3"/><path d="M78 56 q12 -16 30 -14" fill="none" stroke="#ffd23f" stroke-width="9" stroke-linecap="round"/></g></svg>';
  const ctlWrap = h('div', { class: 'sb-set__ctl' }, ctl, demo);
  ctl.addEventListener('click', () => { demo.className = `sb-ctldemo is-${s.control}`; });
  const row = (label: string, el: HTMLElement) => h('div', { class: 'sb-set' }, h('span', { class: 'sb-set__label' }, label), el);
  const p = panel(root, 'sb-settings', h('h2', { class: 'sb-panel__title' }, '设置'),
    row('操控', ctlWrap), row('加速键', side), row('双击加速', dbl), row('名字', names), row('比赛音乐', music), ...(hasCrown ? [row('王冠', crown)] : []),
    btn('好了', 'xg-btn--primary xg-btn--lg', () => { p.remove(); onClose(); }, 'ui-close'));
  return p;
}

// ---------------------------------------------------------------- S5 death card
const TIP_ART: Record<string, string> = {
  body: '<svg viewBox="0 0 120 70"><path d="M10 50 C40 50 50 20 110 20" stroke="#ff9a3c" stroke-width="12" fill="none" stroke-linecap="round"/><circle cx="30" cy="22" r="8" fill="#ffd23f"/><path d="M38 22 q20 -14 36 10" stroke="#fff" stroke-dasharray="4 5" stroke-width="3" fill="none"/></svg>',
  cut: '<svg viewBox="0 0 120 70"><path d="M8 52 H100" stroke="#ff5d5d" stroke-width="12" stroke-linecap="round"/><circle cx="104" cy="52" r="9" fill="#ff5d5d"/><circle cx="40" cy="20" r="8" fill="#ffd23f"/><path d="M48 20 q30 0 34 -6" stroke="#fff" stroke-dasharray="4 5" stroke-width="3" fill="none"/></svg>',
  headon: '<svg viewBox="0 0 120 70"><circle cx="38" cy="35" r="9" fill="#ffd23f"/><circle cx="86" cy="35" r="14" fill="#4f8cff"/><path d="M38 24 q0 -16 20 -18" stroke="#fff" stroke-dasharray="4 5" stroke-width="3" fill="none"/></svg>',
  encircle: '<svg viewBox="0 0 120 70"><path d="M60 8 a26 26 0 1 1 -24 10" stroke="#a46bff" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="60" cy="36" r="8" fill="#ffd23f"/><path d="M56 30 l-16 -18" stroke="#fff" stroke-dasharray="4 5" stroke-width="3" fill="none"/></svg>',
};
/** S5: who got him — a small persona chip under the killer's head (spec §5.2: "这条是猎手") */
const PERSONA_DANGER = new Set(['hunter', 'daredevil', 'king']);
/** 挑战关 roles keep their own name on the chip (QA r3: a sleeper runs a skittish brain but is '贪睡', not '胆小') */
const MISSION_CHIP: Record<string, string> = { sleeper: '贪睡', patrol: '巡逻', guard: '护卫', king: '蛇王' };
function personaChip(k: Snake | null): HTMLElement | string {
  const mp = k?.missionPersona && MISSION_CHIP[k.missionPersona] ? k.missionPersona : undefined;
  const p = mp ?? k?.persona; const name = mp ? MISSION_CHIP[mp] : p ? AI_NAMES.persona[p] : undefined; if (!name) return '';
  const danger = PERSONA_DANGER.has(p!) || p === 'guard';
  return h('span', { class: `sb-dc__persona${danger ? ' is-danger' : ''}` }, h('i', null, danger ? '!' : '·'), h('small', null, '这条是'), name);
}
function killerHead(col: Rgb) {
  const head = h('canvas', { class: 'sb-dc__head', width: 160, height: 160 }) as HTMLCanvasElement;
  const c = head.getContext('2d')!; c.translate(80, 80); paintHead(c, 56, col, false);
  for (const s of [-1, 1]) { c.beginPath(); c.arc(20, s * 26, 18, 0, Math.PI * 2); c.fillStyle = '#20223a'; c.fill(); c.beginPath(); c.arc(20, s * 26, 14, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(24, s * 26, 7, 0, Math.PI * 2); c.fillStyle = '#1a1830'; c.fill(); }
  return head;
}
/** S9 on an out-is-failure level (QA r4): the compact S5 — killer head + persona chip, the cause line and the 教一招
 * pictogram — so a fail in 躲闪高手 still says who and how (spec §5.2 '说清被谁、怎么') */
export function deathCause(o: { tag: KillTag; killer: Snake | null; killerColor: Rgb; line: string; tipText?: string }) {
  const tipArt = h('div', { class: 'sb-dc__tip' }); tipArt.innerHTML = TIP_ART[o.tag] ?? '';
  return h('div', { class: 'sb-cause' },
    h('div', { class: 'sb-cause__who' }, killerHead(o.killerColor), personaChip(o.killer)),
    h('div', { class: 'sb-cause__mid' }, h('p', { class: 'sb-cause__line' }, o.line),
      h('div', { class: 'sb-dc__tiprow' }, tipArt, o.tipText ? h('p', { class: 'sb-dc__tiptext' }, o.tipText) : '')));
}
export function deathCard(root: HTMLElement, o: { tipText?: string; tag: KillTag; killer: Snake | null; line: string; killerColor: Rgb; mode: 'timed' | 'endless'; respawnIn: number; stats?: { len: number; peak: number; record: boolean }; onOk: () => void; onAgain: () => void; onLobby: () => void; onReplay: () => void }) {
  const head = killerHead(o.killerColor);
  const replay = h('button', { class: 'sb-dc__replay', type: 'button', 'aria-label': '再听一遍' });
  replay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>';
  replay.addEventListener('click', o.onReplay);
  const tipArt = h('div', { class: 'sb-dc__tip' }); tipArt.innerHTML = TIP_ART[o.tag] ?? '';
  const tip = h('div', { class: 'sb-dc__tiprow' }, tipArt, o.tipText ? h('p', { class: 'sb-dc__tiptext' }, o.tipText) : '');
  const actions = h('div', { class: 'sb-dc__actions' });
  let ring: HTMLElement | null = null;
  if (o.mode === 'timed') {
    ring = h('div', { class: 'sb-dc__ring', style: `--d:${o.respawnIn}s` }, h('span', null, '复活'));
    actions.append(ring, btn('好的', 'xg-btn--primary', o.onOk, 'ui-close'));
  } else {
    actions.append(btn('再来一局', 'xg-btn--primary xg-btn--lg', o.onAgain), btn('回大厅', '', o.onLobby, 'ui-back'));
  }
  const stats = o.stats ? h('div', { class: 'sb-dc__stats' },
    h('span', { class: 'xg-chip' }, `长度 ${o.stats.len}`), h('span', { class: 'xg-chip' }, `最长 ${o.stats.peak}`), ...(o.stats.record ? [h('span', { class: 'xg-chip sb-chip--gold' }, '新纪录！')] : [])) : '';
  const card = h('div', { class: `sb-dc sb-dc--${o.mode} xg-root` },
    h('div', { class: 'sb-dc__who' }, head, personaChip(o.killer)),
    h('div', { class: 'sb-dc__mid' }, h('p', { class: 'sb-dc__line' }, o.line, replay), stats, tip),
    actions);
  root.append(card); bindPress(card);
  document.body.classList.add('sb-card');
  const rm = card.remove.bind(card); card.remove = () => { document.body.classList.remove('sb-card'); rm(); };
  requestAnimationFrame(() => card.classList.add('is-in'));
  return card;
}

// ---------------------------------------------------------------- S6 podium / summary
export function podium(root: HTMLElement, o: { r: MatchResult; meId: number; meName: string; colorOf: (s: Snake) => Rgb; skin: string; title: string; newRecord: boolean; trophies: { name: string }[]; unlocked: string[]; cause?: HTMLElement; onAgain: () => void; onLobby: () => void }) {
  const { r } = o;
  const onPodium = r.rank <= 3 && r.mode === 'timed';
  // endless (and no-podium) runs: a hero portrait of his snake + its peak length instead of empty steps (QA r2)
  const steps = h('div', { class: r.mode === 'timed' ? 'sb-steps' : 'sb-hero' });
  if (r.mode !== 'timed') {
    const pv = skinPreview(o.skin, 260, 130, { anim: true }); pv.classList.add('sb-hero__head');
    steps.append(pv, h('div', { class: 'sb-hero__len' }, h('b', null, String(r.peak)), h('span', null, '最长')));
  }
  if (r.mode === 'timed') {
    const order = [1, 0, 2];
    for (const i of order) {
      const e = r.podium[i]; if (!e) continue;
      const cv = h('canvas', { class: 'sb-step__head', width: 140, height: 140 }) as HTMLCanvasElement;
      const c = cv.getContext('2d')!; c.translate(70, 70); c.rotate(-Math.PI / 2);
      const col = e.s.isPlayer ? hex2rgb(skinById(o.skin).base) : o.colorOf(e.s);
      if (e.s.isPlayer) { const sk = skinById(o.skin); c.translate(-8, 0); paintHeadPortrait(c, 27, sk, col, hex2rgb(sk.accent)); }
      else paintHead(c, 50, col, false);
      if (!e.s.isPlayer) for (const s of [-1, 1]) { c.beginPath(); c.arc(18, s * 22, 15, 0, Math.PI * 2); c.fillStyle = '#20223a'; c.fill(); c.beginPath(); c.arc(18, s * 22, 11.5, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(22, s * 22, 6, 0, Math.PI * 2); c.fillStyle = '#1a1830'; c.fill(); }
      steps.append(h('div', { class: `sb-step sb-step--${i + 1}` + (e.s.isPlayer ? ' is-me' : ''), style: `--d:${(2 - i) * 150}ms` },
        cv, h('span', { class: 'sb-step__name' }, e.s.name), h('div', { class: 'sb-step__block' }, h('b', null, String(i + 1)))));
    }
  }
  const chips = h('div', { class: 'sb-chips' },
    // the endless hero already shows the peak in big type: no second '最长' chip (QA r3)
    ...(r.mode === 'timed' ? [h('span', { class: 'xg-chip' }, `最长 ${r.peak}`)] : []), h('span', { class: 'xg-chip' }, `击败 ${r.kills}`), h('span', { class: 'xg-chip' }, `截击 ${r.cut}`),
    ...(r.multiMax >= 2 ? [h('span', { class: 'xg-chip' }, `连击 ${r.multiMax}`)] : []), h('span', { class: 'xg-chip' }, `星尘 ${r.eaten}`),
    ...(r.mode === 'timed' && !onPodium ? [h('span', { class: 'xg-chip sb-chip--small' }, `第 ${r.rank} / ${r.of}`)] : []));
  const news = h('div', { class: 'sb-news' },
    ...(o.newRecord ? [h('div', { class: 'sb-new' }, '新纪录！')] : []),
    ...o.trophies.map((t) => h('div', { class: 'sb-new sb-new--trophy' }, `新奖杯：${t.name}`)),
    ...o.unlocked.map((u) => h('div', { class: 'sb-new sb-new--venue' }, `${u} 开放啦！`)));
  // the title already names the place (冠军！/第二名！), so no second big rank number (QA r2)
  const p = panel(root, 'sb-podium' + (r.mode === 'timed' ? '' : ' is-endless'),
    h('h2', { class: 'sb-panel__title sb-podium__title' }, o.title), steps, o.cause ?? '', chips, news,
    h('div', { class: 'sb-podium__actions' }, btn('再来一局', 'xg-btn--primary xg-btn--lg', o.onAgain), btn('回大厅', 'xg-btn--lg', o.onLobby, 'ui-back')));
  if (onPodium) setTimeout(() => { try { confetti(); } catch { /* ignore */ } }, 500);
  return p;
}
