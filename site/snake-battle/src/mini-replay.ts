/**
 * H2 看一招 inside the hint card (spec §5.1: "提示卡右侧小画布循环播放幽灵回放"): the recorded 示范 — the same seed
 * and EXPERT player model as H3 (content/snake-battle/demos.json) — from 4 s before this level's key moment to
 * 2 s after, played in a loop, semi-transparent, the key moment at 0.5× with a gold pulse on his head.
 * The clip is recorded once from the real mission sim (30 fps snapshots) and then replayed from memory.
 * Canvas 2D on purpose: the match keeps the only WebGL context (iPad 9 memory budget, §8.11); the headless
 * skip-ahead runs in ~6 ms slices so the card never stalls.
 */
import { MissionRun, MISSION_BY_ID } from './sim/mission';
import { FLOORS, AI_NAMES } from './sim/venues';
import demosJson from '../../../content/snake-battle/demos.json';

interface SnakeF { pts: number[]; r: number; col: string; me: boolean; a: number; x: number; y: number; sleep: boolean; shield: boolean }
interface Frame { cx: number; cy: number; s: SnakeF[]; food: number[]; ring: number[] | null; marks: number[]; pus: [number, number, string][]; mets: number[] }
const PU_COL: Record<string, string> = { shield: '#5fd4ff', magnet: '#ff7aa8', speed: '#ffd84a' };
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))); return `rgb(${c[0]},${c[1]},${c[2]})`; };
type DemoRec = { seed: number; keyT: number | null };
const DEMOS = (demosJson as unknown as { demos: Record<string, DemoRec> }).demos;
const FLOOR_OF = ['moon', 'mars', 'jupiter', 'saturn', 'blackhole'];
const VIEW_WU = 620;   // world units across the canvas

export const hasClip = (id: string) => DEMOS[id]?.keyT != null;

/** starts recording + looping into `canvas`; returns stop(). Stops by itself once the canvas leaves the DOM. */
export function miniReplay(canvas: HTMLCanvasElement, id: string, reduced = false): () => void {
  const rec = DEMOS[id], m = MISSION_BY_ID[id];
  const ctx = canvas.getContext('2d');
  if (!rec || rec.keyT == null || !m || !ctx) return () => {};
  const keyT = rec.keyT, t0 = Math.max(0, keyT - 4), t1 = keyT + 2;
  const floor = FLOORS[FLOOR_OF[m.ch - 1]] ?? FLOORS.moon;
  const run = new MissionRun(m, rec.seed, { bot: { tier: 'EXPERT', persona: 'expert' } });
  const frames: Frame[] = []; const skipN = Math.round(t0 * 60), recN = Math.round((t1 - t0) * 60);
  let step = 0, stopped = false, done = false;
  const pal = AI_NAMES.palette, buf: number[] = [];

  const snap = () => {
    const me = run.me, S: SnakeF[] = [];
    for (const s of run.w.snakes) {
      if (!s.alive) continue;
      buf.length = 0; s.samples(buf);
      const pts: number[] = []; for (let k = 0; k < buf.length; k += 6) pts.push(Math.round(buf[k]), Math.round(buf[k + 1]));
      const king = (s as { king?: boolean }).king;
      S.push({ pts, r: s.r, col: s.isPlayer ? '#ffd35c' : king ? '#f6c43a' : pal[s.color ?? ''] ?? '#8d97ad', me: s.isPlayer, a: s.angle, x: s.x, y: s.y, sleep: !!(s as { sleep?: boolean }).sleep, shield: s.shield > 0 });
    }
    S.sort((a, b) => Number(a.me) - Number(b.me));   // him on top
    const food: number[] = [];
    for (const f of run.w.foodList) if (Math.abs(f.x - me.x) < VIEW_WU && Math.abs(f.y - me.y) < VIEW_WU) food.push(Math.round(f.x), Math.round(f.y), f.kind === 'big' ? 1 : f.drop ? 2 : 0);
    const o = m.objective; let ring: number[] | null = null;
    if (o.type === 'rings' && me.m) { const p = o.points?.[me.m.ring]; if (p) ring = [p[0], p[1], o.radius ?? 60]; }
    const marks: number[] = []; for (const mk of run.w.markers) if (!mk.done) marks.push(mk.x, mk.y);
    const pus = run.w.pus.map((u) => [u.x, u.y, u.kind] as [number, number, string]);
    const mets: number[] = []; for (const mt of run.w.meteors) mets.push(mt.x, mt.y, mt.vx, mt.vy);
    frames.push({ cx: me.x, cy: me.y, s: S, food, ring, marks, pus, mets });
  };

  const work = () => {
    if (stopped || !canvas.isConnected) { stopped = true; return; }
    const until = performance.now() + 6;
    while (performance.now() < until && !done) {
      const end = run.step(); run.w.drainEvents(() => {}); step++;
      if (step > skipN && (step - skipN) % 2 === 0) snap();
      if (end || step >= skipN + recN) done = true;
    }
    if (done) { if (frames.length > 10) requestAnimationFrame(play); return; }
    setTimeout(work, 0);
  };

  let pt = 0, last = 0;
  const play = (now: number) => {
    if (stopped || !canvas.isConnected) { stopped = true; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    const tt = t0 + pt, slow = !reduced && tt > keyT - 0.4 && tt < keyT + 1.1;
    pt += dt * (slow ? 0.5 : 1);
    const span = frames.length / 30;
    if (pt > span + 0.5) pt = 0;
    draw(Math.min(frames.length - 1, Math.floor(pt * 30)), tt, Math.min(1, pt / 0.3, Math.max(0, (span + 0.5 - pt) / 0.4)));
    requestAnimationFrame(play);
  };

  const draw = (fi: number, tt: number, fade: number) => {
    const W = canvas.width, H = canvas.height, k = W / VIEW_WU, F = frames[fi];
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.45, W * 0.1, W * 0.5, H * 0.5, W * 0.75);
    bg.addColorStop(0, floor[1]); bg.addColorStop(1, floor[0]);
    ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.88 * fade;   // the ghost replay is a little see-through
    ctx.translate(W / 2 - F.cx * k, H / 2 - F.cy * k); ctx.scale(k, k);
    // fence
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, m.arena.R, 0, Math.PI * 2); ctx.stroke();
    // energy
    for (let i = 0; i < F.food.length; i += 3) {
      const big = F.food[i + 2] === 1; ctx.fillStyle = big ? '#ffd75e' : F.food[i + 2] === 2 ? '#ffe9b0' : 'rgba(205,232,255,.9)';
      ctx.beginPath(); ctx.arc(F.food[i], F.food[i + 1], big ? 12 : 6, 0, Math.PI * 2); ctx.fill();
    }
    // goal: the current ring (dashed, breathing) and loop markers
    if (F.ring) {
      ctx.setLineDash([18, 14]); ctx.lineWidth = 7; ctx.strokeStyle = '#ffd35c';
      ctx.beginPath(); ctx.arc(F.ring[0], F.ring[1], F.ring[2] * (1 + 0.05 * Math.sin(tt * 5)), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    for (let i = 0; i < F.marks.length; i += 2) { ctx.fillStyle = '#7fe6ff'; ctx.beginPath(); ctx.arc(F.marks[i], F.marks[i + 1], 16, 0, Math.PI * 2); ctx.fill(); }
    // power-ups (glass bubbles) and meteors
    for (const [x, y, kind] of F.pus) {
      const c = PU_COL[kind] ?? '#ffffff', R = 24 * (1 + 0.06 * Math.sin(tt * 6));
      ctx.fillStyle = c; ctx.globalAlpha = 0.3 * fade; ctx.beginPath(); ctx.arc(x, y, R * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.88 * fade; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x - R * 0.35, y - R * 0.35, R * 0.28, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < F.mets.length; i += 4) {
      const [x, y, vx, vy] = [F.mets[i], F.mets[i + 1], F.mets[i + 2], F.mets[i + 3]], sp = Math.hypot(vx, vy) || 1;
      const tail = ctx.createLinearGradient(x, y, x - (vx / sp) * 120, y - (vy / sp) * 120); tail.addColorStop(0, 'rgba(255,170,80,.85)'); tail.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.strokeStyle = tail; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (vx / sp) * 120, y - (vy / sp) * 120); ctx.stroke();
      ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    }
    // snakes: dark rim, body, soft highlight = a tube
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const s of F.s) {
      const path = () => { ctx.beginPath(); ctx.moveTo(s.x, s.y); for (let i = 0; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]); };
      path(); ctx.strokeStyle = s.me ? '#ffffff' : shade(s.col, 0.55); ctx.lineWidth = s.r * 2 + (s.me ? 10 : 5); ctx.stroke();
      path(); ctx.strokeStyle = s.col; ctx.lineWidth = s.r * 2; ctx.stroke();
      path(); ctx.strokeStyle = shade(s.col, 1.45); ctx.globalAlpha = 0.45 * fade; ctx.lineWidth = s.r * 0.7; ctx.stroke(); ctx.globalAlpha = 0.88 * fade;
      ctx.fillStyle = s.me ? '#ffffff' : shade(s.col, 0.55); ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.12 + (s.me ? 5 : 2.5), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.12, 0, Math.PI * 2); ctx.fill();
      if (s.shield) { ctx.strokeStyle = PU_COL.shield; ctx.lineWidth = 6; ctx.globalAlpha = (0.6 + 0.3 * Math.sin(tt * 8)) * fade; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2.1, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 0.88 * fade; }
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      for (const side of [-1, 1]) {
        const ex = s.x + ca * s.r * 0.35 - sa * s.r * 0.52 * side, ey = s.y + sa * s.r * 0.35 + ca * s.r * 0.52 * side;
        if (s.sleep) { ctx.strokeStyle = '#1b2240'; ctx.lineWidth = s.r * 0.14; ctx.beginPath(); ctx.moveTo(ex - sa * s.r * 0.2, ey + ca * s.r * 0.2); ctx.lineTo(ex + sa * s.r * 0.2, ey - ca * s.r * 0.2); ctx.stroke(); continue; }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, s.r * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#141a33'; ctx.beginPath(); ctx.arc(ex + ca * s.r * 0.12, ey + sa * s.r * 0.12, s.r * 0.18, 0, Math.PI * 2); ctx.fill();
      }
    }
    // the key moment: a gold pulse on his head
    const me = F.s.find((s) => s.me);
    if (me && tt >= keyT && tt < keyT + 0.9) { const u = (tt - keyT) / 0.9; ctx.globalAlpha = (1 - u) * fade; ctx.strokeStyle = '#ffd35c'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(me.x, me.y, me.r * 2 + u * 150, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    // soft vignette = the "replay" look
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.32, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(8,10,30,0)'); vg.addColorStop(1, 'rgba(8,10,30,.55)');
    ctx.globalAlpha = 1; ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  };

  setTimeout(work, 30);
  return () => { stopped = true; };
}
