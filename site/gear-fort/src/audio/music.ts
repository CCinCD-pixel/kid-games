// Theme player (spec §7.2): written notes (themes.ts) played by small WebAudio voices — 琴 (plucked string), 埙 (breathy
// vessel flute), 编钟 — on the kit's ONE AudioContext through the 'music' bus. A 25 ms setTimeout scheduler queues the
// notes inside the next 0.2 s (never on rAF). Music gain 0.35, ×0.3 under narration. Menus/story only; battles get
// stingers. Silent under automation like all page audio (kit/automute.ts).
import { getAudioContext, getBus } from '@kit/audio';
import { MAP_THEME, STORY_THEME, STINGERS, arrangement, degUp, type Note, type Theme } from './themes';

const GAIN = 0.35;
let out: GainNode | null = null; let duckG: GainNode | null = null;
let timer = 0; let playing: { theme: Theme; t0: number; mi: number; mt: number; bar: number; seed: number } | null = null;
let noise: AudioBuffer | null = null;

const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
function ac(): AudioContext | null { const a = getAudioContext(); return a && a.state === 'running' ? a : null; }
function chain(a: AudioContext): GainNode | null {
  const bus = getBus('music'); if (!bus) return null;
  if (!out || out.context !== a) { duckG = a.createGain(); out = a.createGain(); out.gain.value = GAIN; out.connect(duckG).connect(bus); }
  return out;
}
function noiseBuf(a: AudioContext): AudioBuffer {
  if (noise) return noise; const b = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = b.getChannelData(0);
  let s = 99991; for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = s / 2147483648 - 1; }
  return (noise = b);
}

/** 琴: triangle + soft octave, fast attack, long exponential decay, a tiny downward glide (按音) */
function qin(a: AudioContext, o: AudioNode, m: number, t: number, dur: number, vel: number): void {
  const f = hz(m); const g = a.createGain(); const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
  const dec = Math.min(2.2, 0.6 + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  for (const [mul, typ, lv] of [[1, 'triangle', 1], [2, 'sine', 0.22], [3, 'sine', 0.06]] as [number, OscillatorType, number][]) {
    const os = a.createOscillator(); const og = a.createGain(); os.type = typ; os.frequency.setValueAtTime(f * mul * 1.012, t); os.frequency.exponentialRampToValueAtTime(f * mul, t + 0.05);
    og.gain.value = lv; os.connect(og).connect(g); os.start(t); os.stop(t + dec + 0.05);
  }
  g.connect(lp).connect(o);
}
/** 埙: sine + 2nd partial, slow breath attack, gentle vibrato, band-passed breath noise */
function xun(a: AudioContext, o: AudioNode, m: number, t: number, dur: number, vel: number): void {
  const f = hz(m); const g = a.createGain(); const end = t + dur;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.18); g.gain.setValueAtTime(0.16 * vel, Math.max(t + 0.2, end - 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
  const os = a.createOscillator(); os.type = 'sine'; os.frequency.value = f; const os2 = a.createOscillator(); os2.type = 'sine'; os2.frequency.value = f * 2; const g2 = a.createGain(); g2.gain.value = 0.12;
  const lfo = a.createOscillator(); lfo.frequency.value = 5; const lg = a.createGain(); lg.gain.value = f * 0.004; lfo.connect(lg).connect(os.frequency);
  const nb = a.createBufferSource(); nb.buffer = noiseBuf(a); nb.loop = true; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3; const ng = a.createGain(); ng.gain.value = 0.05;
  os.connect(g); os2.connect(g2).connect(g); nb.connect(bp).connect(ng).connect(g); g.connect(o);
  for (const s of [os, os2, lfo, nb]) { s.start(t); s.stop(end + 0.1); }
}
/** 编钟: inharmonic partials, long decay */
function bell(a: AudioContext, o: AudioNode, m: number, t: number, vel: number): void {
  const f = hz(m);
  for (const [mul, gm, dec] of [[1, 1, 2.4], [2.76, 0.35, 0.9], [5.4, 0.14, 0.4], [0.5, 0.3, 1.8]] as number[][]) {
    const os = a.createOscillator(); const g = a.createGain(); os.type = 'sine'; os.frequency.value = f * mul;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * vel * gm, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    os.connect(g).connect(o); os.start(t); os.stop(t + dec + 0.05);
  }
}
function drum(a: AudioContext, o: AudioNode, t: number, vel: number): void {
  const os = a.createOscillator(); const g = a.createGain(); os.frequency.setValueAtTime(95, t); os.frequency.exponentialRampToValueAtTime(48, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  os.connect(g).connect(o); os.start(t); os.stop(t + 0.5);
}

function schedule(): void {
  const a = ac(); const p = playing; if (!a || !p) return; const o = chain(a); if (!o) return;
  const spb = 60 / p.theme.bpm; const until = a.currentTime + 0.2; const arr = arrangement(p.seed);
  while (p.mi < p.theme.melody.length) {
    const at = p.t0 + p.mt * spb; if (at > until) break;
    const [m, b, v, isBell] = p.theme.melody[p.mi] as Note;
    if (at >= a.currentTime - 0.05 && m) { if (isBell) { bell(a, o, m, at, v); qin(a, o, m, at, b * spb, v * 0.6); } else qin(a, o, m, at, b * spb, v); }
    p.mi++; p.mt += b;
  }
  // accompaniment: one bar at a time, a beat ahead of the melody pointer
  while (p.bar < p.theme.bars && p.t0 + p.bar * 4 * spb <= until) {
    const t = p.t0 + p.bar * 4 * spb; const root = p.theme.roots[p.bar];
    if (t >= a.currentTime - 0.05) {
      arr.pattern.forEach((d, i) => qin(a, o, degUp(root, d), t + i * spb, spb, 0.32));
      if ((p.bar + arr.xunOffset) % arr.xunEvery === 0) xun(a, o, degUp(root, 5), t + 0.02, 4 * spb * arr.xunEvery - 0.1, 0.8);
    }
    p.bar++;
  }
  if (p.mi >= p.theme.melody.length && p.bar >= p.theme.bars) {
    const endAt = p.t0 + p.mt * spb;
    if (p.theme.loop && a.currentTime > endAt - 0.25) playing = { ...p, t0: endAt + spb, mi: 0, mt: 0, bar: 0, seed: p.seed + 1 };
    else if (!p.theme.loop && a.currentTime > endAt + 2) stopMusic(400);
  }
}

/** start a theme (no-op if it is already playing); seed only changes the arrangement */
export function playTheme(id: 'map' | 'story', seed = 1): void {
  const theme = id === 'map' ? MAP_THEME : STORY_THEME; const a = ac();
  if (playing?.theme.id === id) return;
  stopMusic(300);
  const start = (): void => {
    const c = ac(); if (!c) return; const o = chain(c); if (!o) return;
    o.gain.cancelScheduledValues(c.currentTime); o.gain.setValueAtTime(0.0001, c.currentTime); o.gain.exponentialRampToValueAtTime(GAIN, c.currentTime + 1.2);
    playing = { theme, t0: c.currentTime + 0.15, mi: 0, mt: 0, bar: 0, seed };
    clearInterval(timer); timer = window.setInterval(schedule, 25); schedule();
  };
  if (a) start(); else { const once = (): void => { window.removeEventListener('pointerdown', once); if (!playing) setTimeout(start, 50); }; window.addEventListener('pointerdown', once); }
}
export function stopMusic(fadeMs = 400): void {
  clearInterval(timer); timer = 0; const was = playing; playing = null; const a = ac();
  if (was && a && out) { out.gain.cancelScheduledValues(a.currentTime); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), a.currentTime); out.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + fadeMs / 1000); const o = out; out = null; duckG = null; setTimeout(() => o.disconnect(), fadeMs + 600); }
}
export function duckMusic(on: boolean): void { const a = ac(); if (!a || !duckG) return; duckG.gain.setTargetAtTime(on ? 0.3 : 1, a.currentTime, 0.08); }
export const musicPlaying = (): string | null => playing?.theme.id ?? null;

/** event phrase on the music bus (works in battle where no theme plays) */
export function stinger(id: keyof typeof STINGERS): void {
  const a = ac(); if (!a) return; const bus = getBus('music'); if (!bus) return;
  const s = STINGERS[id]; const spb = 60 / s.bpm; const g = a.createGain(); g.gain.value = 0.5; g.connect(bus);
  let t = a.currentTime + 0.03;
  for (const [m, b, v, isBell] of s.notes) { if (m) { if (isBell) bell(a, g, m, t, v); qin(a, g, m, t, b * spb, v); } t += b * spb; }
  for (const d of s.drum || []) drum(a, g, a.currentTime + 0.03 + d * spb, 0.9);
  setTimeout(() => g.disconnect(), (t - a.currentTime + 2.5) * 1000);
}
