// Card / machine icons rendered from the same rigs and atlas as the sand table, and the two portraits
// (墨子 with the teal headband, 鲁班 with his red carpenter's cap) — code-drawn, lacquered-wood-toy style.
import { RIGS, poseOf, type Pose } from './rigs';
import { drawRig, type Atlas } from '../render/atlas';
import { shift } from './shade';
import { PAL } from '../theme/mozi';

const pose: Pose = {};
/** a canvas (CSS size × dpr) with the character standing in it */
export function rigIcon(atlas: Atlas, kind: string, size: number, dpr: number, o: { t?: number; walk?: number } = {}): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
  c.style.width = size + 'px'; c.style.height = size + 'px';
  const ctx = c.getContext('2d')!; const rig = RIGS[kind] ?? RIGS.walker;
  const big = kind === 'rhino' ? 1.25 : kind === 'ram' ? 1.15 : kind === 'farm' || kind === 'wall' ? 1.05 : kind === 'ant' ? 0.45 : 1;
  const k = (size * 0.78) / (Math.max(rig.height, 60) * big + 14) * (kind === 'ant' ? 2.2 : kind === 'spikes' || kind === 'pit' ? 1.35 : 1);
  poseOf(RIGS[kind] ? kind : 'walker', { t: o.t ?? 0.4, walk: o.walk ?? 0, atk: 0, hurt: 0, mode: kind === 'pit' ? 1 : 0, hp: 1, extra: kind === 'spikes' ? 5 : 1 }, pose);
  const ox = kind === 'rhino' ? size * 0.62 : kind === 'ram' ? size * 0.58 : size / 2;
  if (kind === 'ant') { for (const [dx, dy] of [[-0.2, -0.05], [0.12, 0.02], [0.3, -0.08]]) drawRig(ctx, atlas, 'ant', pose, ox + dx * size, size * (0.8 + dy), k, dpr); }
  else drawRig(ctx, atlas, RIGS[kind] ? kind : 'walker', pose, ox, size * (kind === 'spikes' || kind === 'pit' ? 0.58 : 0.9), k, dpr);
  return c;
}

/** portraits: 墨子 (calm, beard, teal headband) and 鲁班 (red cap, carpenter's square) */
export function portrait(who: 'mozi' | 'luban', size: number, dpr: number, mood: 'calm' | 'happy' | 'think' | 'laugh' | 'surprise' = 'calm'): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.round(size * dpr); c.height = Math.round(size * dpr); c.style.width = size + 'px'; c.style.height = size + 'px';
  const x = c.getContext('2d')!; x.scale((size * dpr) / 100, (size * dpr) / 100);
  const ol = 'rgba(42,27,18,0.75)';
  const fill = (path: () => void, color: string, y0 = 0, y1 = 100): void => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, shift(color, 0.14)); g.addColorStop(1, shift(color, -0.16)); x.beginPath(); path(); x.fillStyle = g; x.fill(); x.lineWidth = 2.6; x.strokeStyle = ol; x.stroke(); };
  // medallion
  fill(() => x.arc(50, 50, 48, 0, Math.PI * 2), who === 'mozi' ? '#2f6e63' : '#8e2a22');
  x.save(); x.beginPath(); x.arc(50, 50, 46, 0, Math.PI * 2); x.clip();
  // robe
  fill(() => { x.moveTo(14, 100); x.quadraticCurveTo(18, 70, 50, 68); x.quadraticCurveTo(82, 70, 86, 100); x.closePath(); }, who === 'mozi' ? '#d8c3a0' : '#3a2620', 68, 100);
  x.strokeStyle = who === 'mozi' ? PAL.teal : PAL.gold; x.lineWidth = 3; x.beginPath(); x.moveTo(38, 72); x.lineTo(50, 90); x.lineTo(62, 72); x.stroke();
  // head (wooden doll)
  fill(() => x.ellipse(50, 46, 22, 24, 0, 0, Math.PI * 2), '#f0cf9f', 22, 70);
  if (who === 'mozi') {
    fill(() => { x.moveTo(27, 40); x.quadraticCurveTo(28, 18, 50, 18); x.quadraticCurveTo(72, 18, 73, 40); x.quadraticCurveTo(50, 30, 27, 40); x.closePath(); }, '#2b2622', 16, 42);
    fill(() => x.arc(50, 14, 8, 0, Math.PI * 2), '#2b2622', 6, 22);
    fill(() => { x.roundRect(26, 32, 48, 7, 3); }, PAL.teal, 32, 39);
    fill(() => { x.moveTo(36, 58); x.quadraticCurveTo(50, 84, 64, 58); x.quadraticCurveTo(50, 64, 36, 58); x.closePath(); }, '#3b3330', 56, 80);
  } else {
    fill(() => { x.moveTo(24, 38); x.quadraticCurveTo(26, 12, 50, 12); x.quadraticCurveTo(74, 12, 76, 38); x.closePath(); }, PAL.lacRed, 12, 38);
    fill(() => { x.roundRect(22, 34, 56, 7, 3); }, PAL.gold, 34, 41);
    fill(() => { x.moveTo(40, 60); x.quadraticCurveTo(50, 70, 60, 60); x.quadraticCurveTo(50, 63, 40, 60); x.closePath(); }, '#3b2a22', 58, 68);
  }
  // eyes / brows / mouth by mood
  x.fillStyle = '#2b2622'; x.strokeStyle = '#2b2622'; x.lineCap = 'round'; x.lineWidth = 2.4;
  const eye = (cx: number): void => { if (mood === 'laugh' || mood === 'happy') { x.beginPath(); x.arc(cx, 49, 3.2, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); } else { x.beginPath(); x.arc(cx, 48, mood === 'surprise' ? 3 : 2.3, 0, Math.PI * 2); x.fill(); } };
  eye(41); eye(59);
  x.beginPath(); x.moveTo(35, mood === 'think' ? 40 : 42); x.lineTo(45, 41); x.moveTo(55, 41); x.lineTo(65, mood === 'think' ? 39 : 42); x.stroke();
  x.beginPath();
  if (mood === 'laugh') { x.arc(50, 55, 6, 0, Math.PI); x.fillStyle = '#7a2a20'; x.fill(); }
  else if (mood === 'surprise') { x.arc(50, 57, 3, 0, Math.PI * 2); x.stroke(); }
  else { x.moveTo(45, 56); x.quadraticCurveTo(50, mood === 'think' ? 56 : 60, 55, 56); x.stroke(); }
  x.fillStyle = 'rgba(232,120,100,0.35)'; x.beginPath(); x.arc(36, 54, 4, 0, Math.PI * 2); x.arc(64, 54, 4, 0, Math.PI * 2); x.fill();
  x.restore();
  x.lineWidth = 3; x.strokeStyle = who === 'mozi' ? '#c9a23a' : '#e8c35a'; x.beginPath(); x.arc(50, 50, 47, 0, Math.PI * 2); x.stroke();
  return c;
}
