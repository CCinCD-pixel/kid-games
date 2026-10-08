// Narrative scenes (spec §6.3b, §4.13, §5.8): 序幕 · 墨子号码头 · 卷一尾 · 卷二开 · 卷二尾 and the 8 驿站 by the campfire.
// Lacquered peg dolls + the battle rigs on paper-cut parallax layers (far layers move slower); the camera only pans and
// pushes. Every scene ≤ 6 shots / ≤ 30 s, a tap jumps to the next shot, the kit's 跳过 (top-right, after 1.5 s) ends it
// and the parent's 跳过开场和教学 skips it outright (Dad, 2026-10-08; a skipped scene counts as seen). Lines speak through
// the game's voice (subtitles before audio exists); 鲁班 speaks in his own voice (role luban clips; before they load he types out with his wooden babble).
import { cost } from '../render/perf';
import { mount as mountCompanion, type Companion } from '@kit/companion';
import { icon, bindPress, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import { Atlas, drawRig } from '../render/atlas';
import { poseOf, type Pose, type PoseState } from '../art/rigs';
import { portrait } from '../art/icons';
import { LINES, CAMPAIGN } from '../content';
import * as sfx from '../audio/sfx';
import { playTheme } from '../audio/music';
import { doll, lantern, campfire, tent, sandbox, table, plough, kite, siegeLadder, palace, cityWall, hills, stars, sun, moon, satellite, glow, paper, type C2, type Who, type DollSt } from '../art/dolls';
import { drawSong, songState, SONG_W, SONG_H } from '../render/songcity';
import { PAL } from '../theme/mozi';
import type { AppCtx } from '../ctx';

const DW = 1200, DH = 800; // design stage (contain-fit; every layer bleeds past it for other aspect ratios)
const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: string, b: string, t: number): string => { const p = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16); return '#' + [0, 1, 2].map((i) => Math.round(lerp(p(a, i), p(b, i), t)).toString(16).padStart(2, '0')).join(''); };

export interface Env {
  c: C2; u: number; /** shot progress 0..1 */ t: number; /** seconds into the shot */ s: number; /** seconds since the scene began */ T: number;
  /** offset that makes a layer move at `k` of the camera speed (k < 1 = far away) */ par(k: number): [number, number];
  rig(kind: string, st: Partial<PoseState>, x: number, y: number, k: number, o?: { alpha?: number; white?: number }): void;
  talking: Who | null; save: AppCtx['save'];
}
/** a shot's safe frame (design units): x = the cast's left/right edge, y = top of the heads / the lowest feet. The
 *  camera never crops it: ≥ 8 % side margin, heads ≥ 6 % below the top, feet ≥ 24 px above the caption (QA r4). */
interface Keep { x: [number, number]; y: [number, number] }
interface Shot { keep?: Keep; dur: number; line?: string; cam?: [number, number, number, number, number, number]; sfx?: [number, string][]; enter?(st: Stage): void; draw(e: Env): void }

// ───────────── backgrounds ─────────────
const SKY = { day: ['#8FCBEA', '#F4E8CC'], night: ['#121A3A', '#3A4680'], dusk: ['#3A4680', '#E8986A'], dawn: ['#6E7FB8', '#FFD59A'], room: ['#6B4A34', '#8A6446'] } as const;
function sky(c: C2, top: string, bot: string, y0 = -900, y1 = 640): void { const g = c.createLinearGradient(0, y0 < 0 ? 0 : y0, 0, y1); g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(-1600, y0, DW + 3200, y1 - y0 + 2); }
/** portrait story framing (QA r5): the cast stands bigger, and an outdoor shot gets a foreground band of grass and
 *  flowers so the lower third is not a flat field. castK is set per frame by the story Stage (the 驿站 keeps 1). */
let castK = 1; let groundSeen: number | null = null;
function foreground(c: C2, gy: number, x0: number, x1: number, yb: number, T: number): void {
  const top = Math.max(gy + 50, yb - 260); if (yb - top < 60) return;
  for (let r = 0; r < 3; r++) {
    const y = top + (yb - top) * (0.3 + r * 0.3), k = 0.8 + r * 0.45; const step = 64 + r * 26;
    for (let x = Math.floor(x0 / step) * step - step; x < x1 + step; x += step) {
      const h = Math.abs(Math.sin(x * 12.9898 + r * 78.233) * 43758.5453) % 1; const xx = x + h * step * 0.6, yy = y + (h - 0.5) * 22;
      const sway = Math.sin(T * 1.6 + x * 0.05) * 2 * k;
      c.fillStyle = r === 2 ? 'rgba(38,62,22,0.42)' : 'rgba(46,74,28,0.3)'; c.beginPath();
      for (const [dx, hh] of [[-7, 26], [0, 36], [7, 24]] as const) { c.moveTo(xx + dx * k - 3 * k, yy); c.quadraticCurveTo(xx + dx * k + sway * 0.5, yy - hh * k * 0.6, xx + dx * k * 1.5 + sway, yy - hh * k); c.quadraticCurveTo(xx + dx * k + 1 * k, yy - hh * k * 0.5, xx + dx * k + 3 * k, yy); }
      c.fill();
      if (h > 0.62) { c.fillStyle = h > 0.82 ? '#F2C94C' : '#EE8F7A'; for (let i = 0; i < 5; i++) { const a = i * 1.2566 + h; c.beginPath(); c.arc(xx + 14 * k + Math.cos(a) * 4 * k, yy - 30 * k + Math.sin(a) * 4 * k, 3.2 * k, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#FFF4D0'; c.beginPath(); c.arc(xx + 14 * k, yy - 30 * k, 2.4 * k, 0, Math.PI * 2); c.fill(); }
      else if (h < 0.12) { c.fillStyle = 'rgba(120,110,95,0.55)'; c.beginPath(); c.ellipse(xx - 18 * k, yy - 4 * k, 12 * k, 7 * k, 0, 0, Math.PI * 2); c.fill(); }
    }
  }
}
function ground(c: C2, col: string, y: number, edge?: string): void { groundSeen = groundSeen == null ? y : Math.min(groundSeen, y); paper(c, col, (p) => { p.moveTo(-1600, y + 6); for (let x = -1600; x <= DW + 1600; x += 80) p.quadraticCurveTo(x + 40, y - 6, x + 80, y + 4); p.lineTo(DW + 1600, y + 1600); p.lineTo(-1600, y + 1600); p.closePath(); }); if (edge) { c.strokeStyle = edge; c.lineWidth = 3; c.beginPath(); c.moveTo(-1600, y + 6); for (let x = -1600; x <= DW + 1600; x += 80) c.quadraticCurveTo(x + 40, y - 6, x + 80, y + 4); c.stroke(); } }
function cloud(c: C2, x: number, y: number, s: number, col = 'rgba(255,255,255,0.85)'): void { paper(c, col, (p) => { p.ellipse(x, y, 60 * s, 18 * s, 0, 0, Math.PI * 2); p.ellipse(x - 30 * s, y - 10 * s, 30 * s, 20 * s, 0, 0, Math.PI * 2); p.ellipse(x + 24 * s, y - 14 * s, 34 * s, 24 * s, 0, 0, Math.PI * 2); }); }
function layer(e: Env, k: number, f: () => void): void { const [dx, dy] = e.par(k); e.c.save(); e.c.translate(dx, dy); f(); e.c.restore(); }
function road(c: C2, y: number, col = '#E6CF9E'): void { paper(c, col, (p) => { p.moveTo(-1600, y); p.bezierCurveTo(200, y - 30, 700, y + 40, DW + 1600, y - 10); p.lineTo(DW + 1600, y + 40); p.bezierCurveTo(700, y + 90, 200, y + 20, -1600, y + 50); p.closePath(); }, 2); }
function room(e: Env): void { // a warm paper-screen room for the sand-table shots
  const { c } = e; sky(c, SKY.room[0], SKY.room[1], -900, 700);
  layer(e, 0.7, () => { for (let i = -6; i < 14; i++) { paper(c, 'rgba(255,236,200,0.16)', (p) => p.rect(i * 140 + 10, 120, 120, 380), 0); paper(c, 'rgba(60,35,20,0.35)', (p) => { p.rect(i * 140 + 68, 120, 4, 380); p.rect(i * 140 + 10, 300, 120, 4); }); } });
  paper(c, '#4A3122', (p) => p.rect(-1600, 640, DW + 3200, 1600));
}

// ───────────── the player ─────────────
class Stage {
  /** portrait: design units the camera looks lower (the 驿站 frames itself and sets 0) */
  portraitDrop = 120;
  /** portrait: the cast drawn this much bigger (story films only; QA r5) */
  castPortrait = 1;
  el: HTMLElement; cv: HTMLCanvasElement; c: C2; cap: HTMLElement; bot: Companion | null = null; botHost: HTMLElement;
  W = 0; H = 0; dpr: number; atlas: Atlas | null = null; pose: Pose = {}; talking: Who | null = null;
  cam = { x: DW / 2, y: DH / 2, z: 1 }; private typeT = 0; private dead = false;
  constructor(root: HTMLElement, readonly app: AppCtx, cls: string) {
    this.dpr = app.dpr;
    this.el = document.createElement('div'); this.el.className = `gf-story xg-root ${cls}`; this.el.dataset.xgTheme = 'night';
    this.el.innerHTML = `<canvas class="gf-story__cv"></canvas><div class="gf-story__bot"></div><div class="gf-cap"><span class="gf-cap__who"></span><p class="gf-cap__t"></p></div>`;
    root.appendChild(this.el);
    this.cv = this.el.querySelector('canvas')!; this.c = this.cv.getContext('2d')!; this.cap = this.el.querySelector('.gf-cap')!; this.botHost = this.el.querySelector('.gf-story__bot')!;
    this.fit(); window.addEventListener('resize', this.fit);
  }
  fit = (): void => { this.dpr = this.app.dpr; this.W = this.el.clientWidth || innerWidth; this.H = this.el.clientHeight || innerHeight; this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr); };
  /** apply the camera; returns u (CSS px per design unit) */
  keep: Keep | null = null; /** the effective view centre after the safe-frame clamp and the portrait drop */ vx = DW / 2; vy = DH / 2;
  apply(): number { const port = this.H > this.W * 1.1; const B = Math.min(this.W / DW, this.H / DH) * (port ? 1.38 : 1); /* portrait: crop the sides, keep the cast big */ let S = B * this.cam.z; let cy = this.cam.y + (port ? this.portraitDrop : 0);
    let cx = this.cam.x;
    if (this.keep) { // clamp zoom, then position, so the safe frame stays in view in both aspect ratios
      const [x0, x1] = this.keep.x, [y0, y1] = this.keep.y; const top = this.H * 0.06; const capTop = (this.cap.offsetHeight ? this.cap.offsetTop : this.H - (port ? 170 : 90)) - 24;
      S = Math.min(S, this.W / ((x1 - x0) * 1.19), (capTop - top) / Math.max(1, y1 - y0));
      const hw = this.W / 2 / S, m = this.W * 0.08 / S; cx = Math.min(Math.max(cx, x1 + m - hw), x0 - m + hw);
      cy = Math.max(cy, y1 - (capTop - this.H / 2) / S); cy = Math.min(cy, y0 + (this.H / 2 - top) / S);
    } /* portrait: raise the horizon so the cast stands mid-screen above the caption, not under 55 % empty sky (QA r3) */ this.c.setTransform(this.dpr * S, 0, 0, this.dpr * S, this.dpr * (this.W / 2 - cx * S), this.dpr * (this.H / 2 - cy * S)); this.vx = cx; this.vy = cy; return S; }
  env(t: number, s: number, T: number): Env {
    const u = this.apply(); castK = this.H > this.W * 1.1 ? this.castPortrait : 1;
    return {
      c: this.c, u, t, s, T, talking: this.talking, save: this.app.save,
      par: (k) => [(this.cam.x - DW / 2) * (1 - k), (this.cam.y - DH / 2) * (1 - k) * 0.6],
      rig: (kind, st, x, y, k, o) => {
        this.atlas ??= new Atlas(1.5 * this.dpr, 1.5);
        poseOf(kind, { t: T, walk: 0, atk: 0, hurt: 0, mode: 0, hp: 1, extra: 0, ...st }, this.pose);
        const S = u; drawRig(this.c, this.atlas, kind, this.pose, this.W / 2 + (x - this.vx) * S, this.H / 2 + (y - this.vy) * S, k * S, this.dpr, o);
        this.apply();
      },
    };
  }
  /** say a line with the caption (portrait + text); resolves when it has been said / typed */
  speak(id: string): Promise<void> {
    const L = LINES[id]; if (!L) return Promise.resolve();
    const who = this.cap.querySelector('.gf-cap__who') as HTMLElement; const tx = this.cap.querySelector('.gf-cap__t') as HTMLElement;
    who.textContent = ''; const role = L.role;
    if (role === 'dad' || role === 'luban') who.append(portrait(role === 'dad' ? 'mozi' : 'luban', 64, this.dpr, role === 'luban' ? 'laugh' : 'calm'));
    this.cap.dataset.role = role; this.cap.classList.add('is-on');
    this.talking = role === 'dad' ? 'mozi' : role === 'luban' ? 'luban' : null;
    const txt = this.app.voice.text(id);
    if (role === 'luban' && this.app.voice.hasClip(id)) { // his own voice: the caption types along with the clip
      tx.textContent = ''; let i = 0; clearInterval(this.typeT); const per = Math.max(55, Math.min(240, (this.app.voice.clipMs(id) - 300) / txt.length));
      this.typeT = window.setInterval(() => { tx.textContent = txt.slice(0, ++i); if (i >= txt.length) clearInterval(this.typeT); }, per);
      return this.app.voice.say(id, { interrupt: true }).then(() => { clearInterval(this.typeT); tx.textContent = txt; if (!this.dead) this.talking = null; }, () => undefined);
    }
    if (role === 'luban') { // no clip (yet): typewriter + wooden babble, never another character's voice
      tx.textContent = ''; sfx.babble(Math.min(6, Math.ceil(txt.length / 3))); let i = 0; clearInterval(this.typeT);
      return new Promise((res) => { this.typeT = window.setInterval(() => { tx.textContent = txt.slice(0, ++i); if (i >= txt.length) { clearInterval(this.typeT); setTimeout(() => { if (!this.dead) this.talking = null; res(); }, 900); } }, 60); });
    }
    tx.textContent = txt;
    if (role === 'companion') this.bot?.react('nod');
    return this.app.voice.say(id, { interrupt: true }).then(() => { if (!this.dead) this.talking = null; }, () => undefined);
  }
  companion(): Companion { if (!this.bot) { this.bot = mountCompanion(this.botHost, { size: 170, accent: PAL.teal, bubble: 'right' }); this.bot.setMood('happy'); } return this.bot; }
  destroy(): void { this.dead = true; clearInterval(this.typeT); window.removeEventListener('resize', this.fit); this.bot?.destroy(); this.app.voice.stop(); this.el.remove(); this.atlas = null; }
}

/** play a scene; resolves when it ends or 跳过 is pressed (recorded in save.story). `replay`: asked for from 设置 —
 *  plays even under the parent's 跳过开场和教学. */
export function playStory(root: HTMLElement, app: AppCtx, id: StoryId, o: { replay?: boolean } = {}): Promise<void> {
  if (!o.replay && shouldAutoSkip()) { // 跳过开场和教学: exactly as if 跳过 had been tapped at once
    if (!app.save.story.includes(id)) { app.save.story.push(id); app.persist(); }
    app.mark('gf-story', { id, skipped: true, shot: -1, auto: true }); return Promise.resolve();
  }
  const shots = SCENES[id](); const st = new Stage(root, app, 'gf-story--' + id); st.castPortrait = 1.45;
  // the prologue plays after 1-1 is won, and 鲁班's challenge (story.0.4) was already woven into that battle (§2.4):
  // here he concedes the round instead of repeating the challenge (QA r4: the child heard it twice in a minute)
  if (id === 'prologue' && (app.save.levels['1-1']?.wins ?? 0) > 0) for (const sh of shots) if (sh.line === 'fort.story.0.4') sh.line = 'fort.luban.win';
  bindPress(st.el);
  playTheme('story');
  return new Promise((resolve) => {
    let i = -1; let t0 = 0; let lineDone = true; let raf = 0; const T0 = performance.now(); const timers: number[] = []; let ended = false;
    const finish = (skipped: boolean): void => { if (ended) return; ended = true; unskip(); cancelAnimationFrame(raf); timers.forEach(clearTimeout); st.destroy(); if (!app.save.story.includes(id)) { app.save.story.push(id); app.persist(); } app.mark('gf-story', { id, skipped, shot: i }); resolve(); };
    const next = (): void => {
      i++; timers.forEach(clearTimeout); timers.length = 0; if (i >= shots.length) { finish(false); return; }
      const sh = shots[i]; t0 = performance.now(); lineDone = !sh.line; const me = i;
      if (sh.line) void st.speak(sh.line).then(() => { if (me === i) lineDone = true; });
      else st.cap.classList.remove('is-on');
      for (const [at, sid] of sh.sfx ?? []) timers.push(window.setTimeout(() => sfx.play(sid), at * 1000));
      sh.enter?.(st);
    };
    const frame = (now: number): void => {
      if (ended) return; raf = requestAnimationFrame(frame);
      const sh = shots[i]; const s = (now - t0) / 1000;
      if (s >= sh.dur && (lineDone || s >= sh.dur + 4)) { next(); if (ended) return; }
      const cur = shots[i]; const ss = (now - t0) / 1000; st.keep = cur.keep ?? null; const t = clamp01(ss / cur.dur); const k = ease(t);
      const cm = cur.cam ?? [DW / 2, DH / 2, 1, DW / 2, DH / 2, 1];
      st.cam.x = lerp(cm[0], cm[3], k); st.cam.y = lerp(cm[1], cm[4], k); st.cam.z = lerp(cm[2], cm[5], k);
      const c0 = performance.now(); st.c.setTransform(1, 0, 0, 1, 0, 0); st.c.clearRect(0, 0, st.cv.width, st.cv.height);
      groundSeen = null; const env = st.env(t, ss, (now - T0) / 1000); cur.draw(env); castK = 1;
      if (st.H > st.W * 1.1 && st.castPortrait > 1 && groundSeen != null) { const hw = st.W / 2 / env.u, hh = st.H / 2 / env.u; foreground(st.c, groundSeen, st.vx - hw, st.vx + hw, st.vy + hh, env.T); }
      cost('story', performance.now() - c0);
      if (ss < 0.32) { st.c.setTransform(1, 0, 0, 1, 0, 0); st.c.fillStyle = `rgba(10,12,28,${0.55 * (1 - ss / 0.32)})`; st.c.fillRect(0, 0, st.cv.width, st.cv.height); }
    };
    st.cv.addEventListener('click', () => { app.voice.stop(); lineDone = true; t0 = Math.min(t0, performance.now() - shots[i].dur * 1000); });
    // the kit's 跳过 (top-right, after 1.5 s so a child tapping through the shots does not hit it; its tap never reaches the canvas)
    const unskip = mountSkipButton(st.el, () => finish(true), { theme: 'night', className: 'gf-storyskip' });
    next(); raf = requestAnimationFrame(frame);
    if (app.test) (window as unknown as { __gfStory?: unknown }).__gfStory = { id, shot: () => i, jump: (n: number) => { i = n - 1; next(); }, seek: (n: number, sec: number) => { if (n !== i) { i = n - 1; next(); } t0 = performance.now() - sec * 1000; lineDone = false; }, dur: () => shots[i]?.dur ?? 0, n: shots.length, end: () => finish(true) };
  });
}

// ───────────── scenes ─────────────
export type StoryId = 'prologue' | 'dock' | 'v1end' | 'v2open' | 'v2end';
const D = (e: Env, who: Who, x: number, y: number, s: number, st: Partial<DollSt> = {}): void => doll(e.c, e.u, who, x, y, s * castK, { t: e.T + x * 0.01, talk: e.talking === who, ...st });
function dockShot(dur: number, line: string, cam: Shot['cam'], sat: number, hop = false): Shot {
  return {
    dur, line, cam, sfx: [[0.2, 'token.ready']], enter: (st) => { const b = st.companion(); b.setMood(hop ? 'celebrating' : 'happy'); if (hop) b.react('hop'); },
    draw: (e) => {
      const { c, u, T } = e; sky(c, SKY.night[0], SKY.night[1]); layer(e, 0.2, () => stars(c, -500, -500, 2200, 1000, 140, T));
      layer(e, 0.35, () => { const tw = 1 + 0.25 * Math.sin(T * 5); glow(c, 860, 210, 60 * tw, 'rgba(255,240,190,A)', 0.6 * (1 - sat)); c.fillStyle = '#FFF6D8'; c.globalAlpha = 1 - sat; c.beginPath(); c.arc(860, 210, 7 * tw, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; if (sat > 0) { c.save(); c.globalAlpha = sat; satellite(c, u, 860, 210, 1.6 * sat + 0.4, T); c.restore(); } });
      layer(e, 0.6, () => { hills(c, -600, 1800, 560, 50, '#1E2650', 3); paper(c, '#2C3A6E', (p) => p.rect(-1600, 590, DW + 3200, 1600)); for (let i = 0; i < 9; i++) { c.strokeStyle = 'rgba(255,240,200,0.18)'; c.lineWidth = 2; c.beginPath(); c.moveTo(i * 150 - 200 + Math.sin(T + i) * 20, 640 + i % 3 * 22); c.lineTo(i * 150 - 140 + Math.sin(T + i) * 20, 640 + i % 3 * 22); c.stroke(); } });
      // the wooden dock (星港码头)
      paper(c, '#6B4A34', (p) => { p.moveTo(-1600, 680); p.lineTo(720, 680); p.lineTo(760, 720); p.lineTo(-1600, 720); p.closePath(); }, 2, u);
      for (let x = -400; x < 720; x += 46) paper(c, '#8A6446', (p) => p.rect(x, 682, 40, 10), 1.5, u);
      for (const x of [80, 380, 680]) { paper(c, '#5A3A28', (p) => p.rect(x, 640, 12, 120), 1.5, u); lantern(c, u, x + 6, 628, 1.4, T, 1); }
    },
  };
}
function foldShot(kind: 'rhino' | 'owl', line: string, night: boolean): Shot {
  return {
    dur: 3.8, line, cam: [600, 470, 1.15, 600, 470, 1.25], sfx: [[0.5, 'boss.fold'], [1.2, 'parts.fly']],
    draw: (e) => {
      const { c, u, s, T } = e; night ? sky(c, SKY.night[0], SKY.night[1]) : sky(c, SKY.day[0], SKY.day[1]);
      if (night) layer(e, 0.3, () => stars(c, -400, -400, 2000, 900, 90, T)); else layer(e, 0.4, () => { cloud(c, 260, 160, 1.2); cloud(c, 900, 120, 0.9); });
      // the sand table board seen up close
      paper(c, '#5B3A22', (p) => p.rect(-1600, 560, DW + 3200, 1600)); paper(c, night ? '#7E7466' : PAL.sandHi, (p) => p.roundRect(140, 540, 920, 260, 18), 3, u);
      const f = clamp01((s - 0.4) / 1.4); // fold progress
      if (f < 1) { const sc = 1 - ease(f) * 0.85; e.rig(kind, kind === 'owl' ? { mode: 3 } : { mode: 0 }, 600, 690 - (kind === 'owl' ? 20 : 0), (kind === 'rhino' ? 2.2 : 2.4) * sc, { white: Math.min(1, f * 1.6) }); }
      if (f > 0.55 && f < 1) glow(c, 600, 640, 160, 'rgba(255,240,200,A)', (1 - Math.abs(f - 0.8) * 4) * 0.9);
      if (f >= 0.8) { const p = clamp01((f - 0.8) / 0.2 + (s - 1.8) * 0.8); const k = 1 + Math.sin(p * Math.PI) * 0.12; if (kind === 'rhino') plough(c, u, 590, 712, 4.6 * k); else kite(c, u, 600, 640, 4.8 * k, T); }
    },
  };
}
const SCENES: Record<StoryId, () => Shot[]> = {
  prologue: () => [
    { keep: { x: [330, 900], y: [560, 760] }, dur: 4.5, line: 'fort.story.0.1', cam: [600, 430, 1, 640, 470, 1.18], sfx: [[0.1, 'drum.beat'], [0.6, 'repair.knock'], [1.5, 'repair.knock'], [2.4, 'repair.knock'], [3.3, 'repair.knock']],
      draw: (e) => { const { c, u, s, T } = e; sky(c, SKY.dusk[0], SKY.dusk[1]); layer(e, 0.2, () => { sun(c, 260, 400, 50, T); }); layer(e, 0.45, () => { hills(c, -600, 1800, 470, 70, '#6A4F78', 1); palace(c, 640, 520, 1.25, '#5B2E2A', u); });
        ground(c, '#8E6A45', 620, '#6E4E30'); siegeLadder(c, u, 860, 720, 1.7, 1 + s * 1.1); D(e, 'luban', 400, 730, 2.7, { carry: 'square', arm: 0.25 + 0.25 * Math.abs(Math.sin(T * 4)), face: 'happy' });
        table(c, u, 580, 742, 1.5); for (let i = 0; i < 4; i++) { const ph = (T * 0.8 + i / 4) % 1; c.fillStyle = `rgba(240,210,150,${1 - ph})`; c.beginPath(); c.ellipse(550 + i * 16, 694 - ph * 50, 7, 3.5, ph * 4, 0, Math.PI * 2); c.fill(); } } },
    { dur: 4, line: 'fort.story.0.2', cam: [600, 620, 1, 600, 160, 1], sfx: [[0.2, 'gust.blow'], [1.6, 'ladder.raise']],
      draw: (e) => { const { c, u, T } = e; sky(c, SKY.dusk[0], SKY.day[1], -1400, 900); layer(e, 0.5, () => { cloud(c, 200 + T * 30, 120, 1.4); cloud(c, 900 - T * 20, -120, 1.1); cloud(c, 500, -420, 1.6); });
        ground(c, '#8E6A45', 760); siegeLadder(c, u, 600, 800, 3.3, 6); D(e, 'luban', 330, 800, 1.3, { arm: 1, face: 'happy' }); } },
    { dur: 5, line: 'fort.story.0.3', cam: [470, 470, 1.2, 700, 470, 1.2], sfx: [[0.3, 'flag.drum']],
      draw: (e) => { const { c, u, s, T } = e; sky(c, SKY.day[0], SKY.day[1]); layer(e, 0.15, () => { sun(c, 1000, 150, 46, T); cloud(c, 300, 140, 1); });
        layer(e, 0.4, () => { hills(c, -800, 2000, 480, 80, '#A8C48A', 2); cityWall(c, -60, 260, 520, 46, '#B98F5E', u); palace(c, 1180, 520, 0.6, '#7A3B30', u); });
        ground(c, '#C9D88B', 600, '#9DB46A'); road(c, 650);
        const x = 380 + ease(clamp01(s / 5)) * 300; D(e, 'mozi', x + 90, 700, 2.4, { walk: 1, carry: 'pack' }); D(e, 'bubu', x - 30, 708, 2.4, { walk: 1, carry: 'pack', face: 'happy' }); } },
    { keep: { x: [560, 1030], y: [600, 780] }, dur: 5, line: 'fort.story.0.4', cam: [760, 360, 1.1, 620, 560, 1.15], sfx: [[0.2, 'flyer.flap'], [1.1, 'flyer.flap'], [2.0, 'flyer.flap'], [3.6, 'seal.stamp']],
      draw: (e) => { const { c, u, s, T } = e; room(e); table(c, u, 600, 760, 3.6);
        const f = ease(clamp01(s / 3.6)); const bx = lerp(1020, 610, f), by = lerp(170, 640, f) - Math.sin(f * Math.PI) * 120;
        if (f < 1) { c.save(); c.translate(bx, by + 70); sandbox(c, u, 0, 0, 1.3, 0); c.restore(); e.rig('flyer', { mode: 0, t: T * 1.6 }, bx, by + 30, 2.2); }
        else { sandbox(c, u, 610, 646, 1.3, 0); e.rig('flyer', { mode: 1, t: T }, 760, 640, 2.2); }
        D(e, 'luban', 980, 760, 2.4, { arm: 0.7, face: 'happy' }); } },
    { keep: { x: [240, 960], y: [630, 815] }, dur: 4.5, line: 'fort.story.0.5', cam: [600, 560, 1.25, 600, 600, 1.4], sfx: [[0.4, 'seal.stamp'], [0.5, 'boss.gong']],
      draw: (e) => { const { c, u, s } = e; room(e); table(c, u, 600, 800, 4.4); sandbox(c, u, 600, 676, 2.6, ease(clamp01((s - 0.35) / 0.5)));
        D(e, 'mozi', 300, 800, 2.6, { arm: 0.75, face: 'calm' }); D(e, 'luban', 900, 800, 2.6, { arm: 0.75, look: -1, face: 'happy' }); D(e, 'bubu', 440, 812, 2.1, { face: 'happy' }); } },
  ],
  dock: () => [
    dockShot(2.9, 'fort.dock.1', [560, 420, 1, 600, 400, 1.05], 0), // ≤ 8 s in all (spec §6.3b)
    { ...dockShot(2.9, 'fort.dock.2', [640, 360, 1.05, 820, 260, 1.5], 0), draw: (e) => dockShot(0, '', undefined, clamp01(e.s / 1.2)).draw(e) },
    // QA r5: 「走，我们去见见墨子！」 contradicted the prologue the child just watched (he already set out with 墨子); the
    // closing hop stays silent until the narration step re-voices fort.dock.3 (new copy in game.json notes)
    { ...dockShot(1.6, '', [600, 400, 1, 600, 400, 1], 1, true) },
  ],
  v1end: () => [
    foldShot('rhino', 'fort.story.1.end.1', false),
    { dur: 5, line: 'fort.story.1.end.2', cam: [420, 470, 1.05, 700, 470, 1.05],
      draw: (e) => { const { c, u, s, T } = e; sky(c, SKY.day[0], SKY.day[1]); layer(e, 0.4, () => { hills(c, -800, 2000, 470, 60, '#A8C48A', 4); cityWall(c, 800, 1240, 520, 50, '#B98F5E', u); });
        ground(c, '#B9CB76', 580); const px = 240 + ease(clamp01(s / 5)) * 520; paper(c, '#8E6A45', (p) => p.rect(140, 610, px - 140, 120), 0);
        c.strokeStyle = 'rgba(70,45,25,0.55)'; c.lineWidth = 3; for (let r = 0; r < 4; r++) { c.beginPath(); c.moveTo(140, 625 + r * 28); c.lineTo(px - 20, 625 + r * 28); c.stroke(); }
        plough(c, u, px, 712, 3); D(e, 'farmer', px + 90, 712, 2.2, { walk: 1, arm: 0.5 }); D(e, 'farmer', px - 230, 736, 2, { walk: 0.5, arm: 0.4 + 0.4 * Math.abs(Math.sin(T * 3)) });
        D(e, 'luban', 170, 740, 2.3, { face: 'happy', arm: 0.6 }); } },
    { keep: { x: [130, 1070], y: [60, 740] }, dur: 4, line: 'fort.story.1.end.3', cam: [600, 400, 1, 600, 420, 1.08], // the whole repaired city, both aspect ratios sfx: [[1.2, 'repair.knock']],
      draw: (e) => { const { c, T } = e; sky(c, '#3A2A20', '#5B3A22'); const k = Math.min(DW / SONG_W, DH / SONG_H) * 0.9; c.save(); c.translate(600 - SONG_W * k / 2, 400 - SONG_H * k / 2); c.scale(k, k); drawSong(c, e.u * k, { ...songState(e.save), phase: 'day' }, T); c.restore(); } },
    dockShot(3.6, 'fort.dock.v1', [600, 400, 1, 760, 300, 1.25], 1),
  ],
  v2open: () => [
    { keep: { x: [400, 740], y: [560, 712] }, dur: 4, line: 'fort.story.2.open.1', cam: [600, 400, 1, 600, 380, 1.05],
      draw: (e) => { const { c, u, s, T } = e; const k = clamp01(s / 3); sky(c, mix(SKY.day[0], SKY.night[0], k), mix(SKY.day[1], SKY.dusk[1], k)); layer(e, 0.15, () => { c.globalAlpha = k; stars(c, -400, -400, 2000, 900, 100, T); c.globalAlpha = 1; sun(c, 900, 260 + k * 420, 46, T); moon(c, 300, 520 - k * 380, 32); });
        layer(e, 0.4, () => hills(c, -800, 2000, 500, 80, mix('#A8C48A', '#2B3567', k), 5)); ground(c, mix('#C9D88B', '#232B55', k), 600); road(c, 650, mix('#E6CF9E', '#4A4F7A', k));
        { const x = 470 + ease(clamp01(s / 4)) * 140; D(e, 'mozi', x + 80, 700, 1.9, { walk: 1, carry: 'pack' }); D(e, 'bubu', x - 20, 706, 1.9, { walk: 1, carry: 'pack', face: 'happy' }); } // 十天十夜 on the road
        // a map page turning over the scene
        const p = clamp01((s - 0.2) / 1.2); if (p < 1) { c.save(); c.globalAlpha = 1 - p; paper(c, '#F3E6C8', (q) => { q.moveTo(-1600, -900); q.lineTo(DW * (1 - p) + 200, -900); q.lineTo(DW * (1 - p) - 200, DH + 900); q.lineTo(-1600, DH + 900); q.closePath(); }, 3, u); c.restore(); } } },
    { keep: { x: [320, 820], y: [560, 725] }, dur: 5.5, line: 'fort.story.2.open.2', cam: [450, 450, 1.1, 720, 450, 1.1], sfx: [[0.3, 'boss.gong']],
      draw: (e) => { const { c, s, T } = e; sky(c, SKY.night[0], SKY.night[1]); layer(e, 0.15, () => { stars(c, -400, -400, 2000, 900, 120, T); moon(c, 1000, 130, 34); }); layer(e, 0.4, () => { hills(c, -800, 2000, 500, 80, '#2B3567', 6); hills(c, -800, 2000, 560, 50, '#232B55', 7); });
        ground(c, '#1E2448', 610); road(c, 660, '#3E4470');
        for (let i = 0; i < 9; i++) { const fx = (i * 173 + T * 18) % 1400 - 100, fy = 520 + Math.sin(T * 1.3 + i) * 50; glow(c, fx, fy, 12, 'rgba(230,255,150,A)', 0.55 + 0.4 * Math.sin(T * 4 + i)); }
        const x = 360 + ease(clamp01(s / 5.5)) * 330; D(e, 'mozi', x + 100, 712, 2.4, { walk: 1, carry: 'lantern' }); D(e, 'bubu', x - 20, 718, 2.4, { walk: 1, carry: 'lantern' }); } },
  ],
  v2end: () => [
    foldShot('owl', 'fort.story.2.end.1', true),
    { keep: { x: [250, 810], y: [600, 745] }, dur: 4.5, line: 'fort.story.2.end.2', cam: [600, 520, 1.05, 600, 430, 1], sfx: [[0.3, 'dawn']],
      draw: (e) => { const { c, u, s, T } = e; const k = clamp01(s / 3); sky(c, mix(SKY.night[0], SKY.dawn[0], k), mix(SKY.night[1], SKY.dawn[1], k), -1200); layer(e, 0.2, () => { sun(c, 900, 640 - k * 260, 52, T); c.globalAlpha = 1 - k; stars(c, -400, -700, 2000, 1000, 90, T); c.globalAlpha = 1; });
        layer(e, 0.45, () => hills(c, -800, 2000, 560, 70, mix('#2B3567', '#8C7FA8', k), 8)); ground(c, mix('#232B55', '#6B7A58', k), 640);
        const ky = 520 - ease(clamp01(s / 4.5)) * 380; c.strokeStyle = 'rgba(60,40,25,0.7)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(470, 660); c.quadraticCurveTo(560, ky + 160, 620, ky + 20); c.stroke(); kite(c, u, 620, ky, 3, T);
        D(e, 'bubu', 450, 730, 1.9, { arm: 0.8, face: 'happy' }); D(e, 'luban', 300, 730, 2, { face: 'happy', arm: 0.4 }); D(e, 'mozi', 760, 730, 2, { face: 'happy' }); } },
    { keep: { x: [190, 820], y: [660, 772] }, dur: 5, line: 'fort.story.2.end.3', cam: [600, 470, 1, 640, 450, 1.25],
      draw: (e) => { const { c, u, T } = e; sky(c, SKY.dawn[0], SKY.dawn[1]); layer(e, 0.15, () => { sun(c, 860, 300, 44, T); cloud(c, 300, 200, 1.3, 'rgba(255,236,210,0.8)'); });
        layer(e, 0.35, () => { hills(c, -800, 2000, 520, 40, '#9A88A8', 9); cityWall(c, 380, 1120, 540, 60, '#6E5E86', u); palace(c, 750, 440, 0.7, '#5E4E78', u); });
        ground(c, '#7A8A5E', 640); road(c, 690, '#D9C08E'); D(e, 'mozi', 300, 760, 1.6, { look: 1 }); D(e, 'bubu', 230, 766, 1.6, { face: 'happy', arm: 1 }); } },
    dockShot(3.6, 'fort.dock.v2', [600, 400, 1, 760, 300, 1.25], 1, true),
  ],
};

// ───────────── 驿站 (campfire stop; spec §5.8) ─────────────
export type InnAct = 'stop' | 'more';
function drawInn(e: Env, k: number): void {
  const { c, u, T } = e; const dawn = k === 8;
  dawn ? sky(c, SKY.dawn[0], SKY.dawn[1]) : sky(c, SKY.night[0], SKY.night[1]);
  layer(e, 0.15, () => { if (dawn) sun(c, 1020, 520, 44, T); else { stars(c, -400, -400, 2000, 950, 130, T, k === 2 ? 1 : 0.8); moon(c, 1000, 130, 32); } });
  layer(e, 0.4, () => { hills(c, -800, 2000, 520, 70, dawn ? '#8C7FA8' : '#2B3567', k); if (dawn) cityWall(c, 820, 1180, 560, 30, '#5E4E78', u); hills(c, -800, 2000, 590, 40, dawn ? '#6E6290' : '#232B55', k + 3); });
  ground(c, dawn ? '#5E5A44' : '#2A3326', 640);
  tent(c, u, 250, 672, 2.3);
  if (k === 4) { table(c, u, 980, 712, 0.9); sandbox(c, u, 980, 682, 0.8, 1); }
  campfire(c, u, 600, 700, k === 5 ? 2.15 : 1.8, T);
  if (k === 5) e.rig('gust', { atk: Math.max(0, Math.sin(T * 2.4)) }, 470, 712, 1.1);
  if (k === 3) e.rig('flyer', { mode: 1, t: T }, 950, 650, 1.3);
  if (k === 7) kite(c, u, 980, 600, 1.6, T);
  const mo: Partial<DollSt> = k === 1 ? { carry: 'cake', arm: 0.55 } : k === 7 ? { arm: 0.35, face: 'happy' } : k === 6 ? { face: 'happy' } : {};
  D(e, 'mozi', 420, 712, 2.4, { look: 1, face: 'calm', ...mo });
  D(e, 'bubu', 760, 718, 2.3, { look: -1, face: k === 7 ? 'sleepy' : 'happy', sit: k === 7, arm: k === 2 ? 1 : 0 });
  D(e, 'luban', 910, 712, 2.4, { look: -1, face: 'happy', carry: k === 6 ? 'hook' : k === 1 ? 'square' : null, arm: k === 3 ? 0.4 : 0 });
  if (!dawn) { c.fillStyle = 'rgba(255,150,70,0.10)'; c.fillRect(-1600, 560, DW + 3200, 400); }
}
export function mountInn(root: HTMLElement, app: AppCtx, levelId: string, onAct: (a: InnAct) => void): { destroy(): void } {
  const k = CAMPAIGN.inns[levelId] ?? 1; const st = new Stage(root, app, 'gf-inn'); st.portraitDrop = 0;
  const askId = CAMPAIGN.crossAsk[levelId] ?? (LINES['fort.ask.' + levelId] ? 'fort.ask.' + levelId : 'fort.ask.x.1');
  const ui = document.createElement('div'); ui.className = 'gf-inn__ui';
  ui.innerHTML = `<div class="gf-inn__title">驿站 · 第 ${k} 站</div>
    <button class="gf-ask" aria-label="讲给爸爸听"><span class="gf-ask__p"></span><span class="gf-ask__t"></span>${icon('listen')}</button>
    <div class="gf-inn__acts"><button class="xg-btn xg-btn--secondary xg-btn--lg" data-a="stop">${icon('home')}今天就到这里</button><button class="xg-btn xg-btn--primary xg-btn--lg" data-a="more">${icon('play')}再推演一局</button></div>`;
  st.el.appendChild(ui); bindPress(st.el);
  (ui.querySelector('.gf-ask__p') as HTMLElement).append(portrait('mozi', 72, app.dpr, 'happy'));
  (ui.querySelector('.gf-ask__t') as HTMLElement).textContent = app.voice.text(askId); (ui.querySelector('.gf-ask__t') as HTMLElement).dataset.line = askId;
  playTheme('story');
  // the inn is where he stops for the day, so it must not burn a 60 fps loop while nobody plays (GAME_AUTHORING §7,
  // spec §8.5): the campfire flickers at 15 fps only while lines play and ~10 s after; a tap or a rotation wakes it again
  let timer = 0; let dead = false; const T0 = performance.now(); let until = T0 + 12000;
  const frame = (now: number): void => { const c0 = performance.now(); st.c.setTransform(1, 0, 0, 1, 0, 0); st.c.clearRect(0, 0, st.cv.width, st.cv.height); st.cam.x = DW / 2; st.cam.y = (st.H > st.W ? 600 : 545); st.cam.z = st.H > st.W ? 1.0 : 1.08; drawInn(st.env(0, 0, (now - T0) / 1000), k); cost('inn', performance.now() - c0); };
  const loop = (): void => { timer = 0; if (dead) return; const now = performance.now(); frame(now); if (now < until) timer = window.setTimeout(loop, 66); };
  const wake = (ms = 10000): void => { if (dead) return; until = Math.max(until, performance.now() + ms); if (!timer) loop(); };
  const onResize = (): void => { requestAnimationFrame(() => wake(3000)); }; // st.fit cleared the canvas: redraw it
  window.addEventListener('resize', onResize);
  loop();
  let skipLine: (() => void) | null = null;
  const say = (id: string): Promise<void> => new Promise((res) => { wake(20000); skipLine = () => { app.voice.stop(); res(); }; void st.speak(id).then(() => { wake(10000); res(); }); });
  void (async () => {
    for (const id of [`fort.inn.${levelId}.1`, `fort.inn.${levelId}.2`]) { if (dead) return; if (LINES[id]) await say(id); await new Promise((r) => setTimeout(r, 250)); }
    if (dead) return; ui.classList.add('is-ask'); sfx.play('seal.stamp');
    wake(20000); await new Promise<void>((res) => { skipLine = () => { app.voice.stop(); res(); }; void app.voice.say(askId).then(() => res()); }); // shown once: in the 讲给爸爸听 card, not again in the caption
    if (dead) return; await new Promise((r) => setTimeout(r, 400)); if (!dead) { wake(20000); void st.speak('fort.inn.stop').then(() => wake(10000)); }
  })();
  setTimeout(() => !dead && ui.classList.add('is-acts'), 300);
  st.cv.addEventListener('click', () => { wake(); skipLine?.(); });
  ui.querySelector('.gf-ask')!.addEventListener('click', () => { wake(); void app.voice.say(askId, { interrupt: true }); });
  for (const b of ui.querySelectorAll<HTMLElement>('[data-a]')) b.addEventListener('click', () => { if (dead) return; app.ui('ui-confirm', 0.5); destroy(); onAct(b.dataset.a as InnAct); });
  if (!app.save.story.includes('inn.' + levelId)) { app.save.story.push('inn.' + levelId); app.persist(); }
  app.mark('gf-inn', { level: levelId });
  function destroy(): void { if (dead) return; dead = true; clearTimeout(timer); window.removeEventListener('resize', onResize); st.destroy(); }
  return { destroy };
}
