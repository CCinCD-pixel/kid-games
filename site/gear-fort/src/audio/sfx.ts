// 编钟 · 木头 · 鼓 — the game's own synthesized sound effects (spec §7.1), on the kit's ONE AudioContext and its
// 'sfx' bus (never a second context, never the destination directly). Kit UI sounds (ui-tap …) go through
// installKitSfx. All of it is silent under automation (kit/automute.ts).
import { getAudioContext, getBus } from '@kit/audio';

const BELL = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51]; // pentatonic (编钟 ladder)
let noiseBuf: AudioBuffer | null = null;
let lastAt: Record<string, number> = {};

function ctx(): { ac: AudioContext; out: AudioNode } | null {
  const ac = getAudioContext(); const out = getBus('sfx'); if (!ac || !out || ac.state !== 'running') return null; return { ac, out };
}
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = b.getChannelData(0);
  let s = 12345; for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = (s / 2147483648 - 1); }
  return (noiseBuf = b);
}
function env(_ac: AudioContext, g: GainNode, t: number, a: number, peak: number, d: number): void { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function throttle(name: string, ms: number): boolean { const now = performance.now(); if (now - (lastAt[name] || 0) < ms) return false; lastAt[name] = now; return true; }

/** a bronze bell: inharmonic partials, long decay */
export function bell(step = 0, gain = 0.35, delay = 0): void {
  const c = ctx(); if (!c) return; const { ac, out } = c; const t = ac.currentTime + delay;
  const f = BELL[((step % 8) + 8) % 8] * (step >= 8 ? 2 : 1);
  for (const [mul, gm, dec] of [[1, 1, 1.4], [2.76, 0.4, 0.6], [5.4, 0.18, 0.3], [0.5, 0.25, 1.1]] as number[][]) {
    const o = ac.createOscillator(); const g = ac.createGain(); o.type = 'sine'; o.frequency.value = f * mul;
    env(ac, g, t, 0.004, gain * gm, dec); o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.05);
  }
}
/** wooden knock (filtered noise burst + a short body tone) */
export function wood(pitch = 1, gain = 0.4): void {
  const c = ctx(); if (!c) return; const { ac, out } = c; const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noise(ac); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 * pitch; bp.Q.value = 3;
  const g = ac.createGain(); env(ac, g, t, 0.002, gain, 0.09); s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t + 0.12);
  const o = ac.createOscillator(); const g2 = ac.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220 * pitch, t); o.frequency.exponentialRampToValueAtTime(120 * pitch, t + 0.08);
  env(ac, g2, t, 0.002, gain * 0.6, 0.1); o.connect(g2).connect(out); o.start(t); o.stop(t + 0.14);
}
/** a drum hit (大波) */
export function drum(gain = 0.6): void {
  const c = ctx(); if (!c) return; const { ac, out } = c; const t = ac.currentTime;
  const o = ac.createOscillator(); const g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
  env(ac, g, t, 0.003, gain, 0.35); o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
  const s = ac.createBufferSource(); s.buffer = noise(ac); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; const g2 = ac.createGain(); env(ac, g2, t, 0.002, gain * 0.5, 0.12); s.connect(lp).connect(g2).connect(out); s.start(t); s.stop(t + 0.15);
}
/** metal "叮" (no effect) */
export function ding(): void { if (!throttle('ding', 120)) return; const c = ctx(); if (!c) return; const { ac, out } = c; const t = ac.currentTime; for (const f of [1760, 2637]) { const o = ac.createOscillator(); const g = ac.createGain(); o.type = 'triangle'; o.frequency.value = f; env(ac, g, t, 0.002, 0.12, 0.25); o.connect(g).connect(out); o.start(t); o.stop(t + 0.3); } }
/** bow twang */
export function twang(): void { if (!throttle('twang', 70)) return; const c = ctx(); if (!c) return; const { ac, out } = c; const t = ac.currentTime; const o = ac.createOscillator(); const g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.09); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; env(ac, g, t, 0.002, 0.07, 0.1); o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 0.14); }
/** whoosh (throw) */
export function whoosh(gain = 0.18): void { if (!throttle('whoosh', 90)) return; const c = ctx(); if (!c) return; const { ac, out } = c; const t = ac.currentTime; const s = ac.createBufferSource(); s.buffer = noise(ac); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1600, t + 0.25); const g = ac.createGain(); env(ac, g, t, 0.05, gain, 0.2); s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t + 0.3); }
/** heavy thud (礌石, 冲车, 檑木) */
export function thud(gain = 0.7): void { const c = ctx(); if (!c) return; const { ac, out } = c; const t = ac.currentTime; const o = ac.createOscillator(); const g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3); env(ac, g, t, 0.004, gain, 0.4); o.connect(g).connect(out); o.start(t); o.stop(t + 0.45); wood(0.5, gain * 0.5); }
/** 鲁班's wooden babble (no voice yet): a few clicks */
export function babble(n = 4): void { for (let i = 0; i < n; i++) setTimeout(() => wood(1.6 + Math.random() * 0.8, 0.12), i * 85); }
/** rising pentatonic arpeggio */
export function arp(from = 0, n = 4, gap = 0.08): void { for (let i = 0; i < n; i++) bell(from + i, 0.22, i * gap); }
export function resetSfx(): void { lastAt = {}; }
