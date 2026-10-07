// Theme player (spec §7.2): written notes (themes.ts) → a timed score (scoreOf) → sample voices — 琴 (Karplus–Strong
// pluck), 埙 (looped vessel flute), 编钟 (FM), 鼓 — synthesized by synth.ts, so the page and the offline WAV/LUFS
// renderer (V16) play the very same samples, rates and envelopes. Kit's ONE AudioContext, 'music' bus. A 25 ms
// setTimeout scheduler queues the notes inside the next 0.2 s (never on rAF). Music gain 0.35, ×0.3 under narration.
// Menus/story only; battles get stingers. Silent under automation like all page audio (kit/automute.ts).
import { getAudioContext, getBus } from '@kit/audio';
import { MAP_THEME, STORY_THEME, scoreOf, stingerScore, STINGERS, type Theme } from './themes';
import { renderInst, noteEnv, hz, INST_BASE, INST_LOOP, SR, type Inst, type NoteEv } from './synth';

export const MUSIC_GAIN = 0.35;
const GAIN = MUSIC_GAIN;
let out: GainNode | null = null; let duckG: GainNode | null = null;
let timer = 0; let playing: { theme: Theme; t0: number; i: number; evs: NoteEv[]; len: number; seed: number } | null = null;
const bufs = new Map<Inst, AudioBuffer>(); let bufCtx: AudioContext | null = null;

function ac(): AudioContext | null { const a = getAudioContext(); return a && a.state === 'running' ? a : null; }
function chain(a: AudioContext): GainNode | null {
  const bus = getBus('music'); if (!bus) return null;
  if (!out || out.context !== a) { duckG = a.createGain(); out = a.createGain(); out.gain.value = GAIN; out.connect(duckG).connect(bus); }
  return out;
}
function inst(a: AudioContext, k: Inst): AudioBuffer {
  if (bufCtx !== a) { bufs.clear(); bufCtx = a; }
  let b = bufs.get(k); if (!b) { const d = renderInst(k); b = a.createBuffer(1, d.length, SR); b.copyToChannel(d, 0); bufs.set(k, b); }
  return b;
}
/** one note: the sample at rate hz(m)/base, gain envelope from noteEnv (the offline renderer uses the same numbers) */
function note(a: AudioContext, o: AudioNode, e: NoteEv, t0: number): void {
  const t = t0 + e.t; const E = noteEnv(e); const src = a.createBufferSource(); src.buffer = inst(a, e.inst);
  src.playbackRate.value = e.inst === 'drum' ? 1 : hz(e.m) / INST_BASE[e.inst]; src.loop = INST_LOOP[e.inst];
  const g = a.createGain();
  if (E.atk) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(E.lvl, t + E.atk); } else g.gain.setValueAtTime(E.lvl, t);
  g.gain.setValueAtTime(E.lvl, t + E.hold); g.gain.exponentialRampToValueAtTime(0.0001, t + E.end);
  src.connect(g).connect(o); src.start(t); src.stop(t + E.end + 0.02); src.onended = () => { src.disconnect(); g.disconnect(); };
}
/** warm the instrument samples in idle time (≈15 ms on desktop) so the first theme starts clean */
export function warmMusic(): void { const go = (): void => { const a = ac(); if (!a) { setTimeout(go, 700); return; } for (const k of ['qin', 'qinHi', 'xun', 'bell', 'drum'] as Inst[]) inst(a, k); }; setTimeout(go, 200); }

function schedule(): void {
  const a = ac(); const p = playing; if (!a || !p) return; const o = chain(a); if (!o) return;
  const until = a.currentTime + 0.2;
  while (p.i < p.evs.length && p.t0 + p.evs[p.i].t <= until) { const e = p.evs[p.i++]; if (p.t0 + e.t >= a.currentTime - 0.05) note(a, o, e, p.t0); }
  if (p.i >= p.evs.length) {
    const endAt = p.t0 + p.len;
    if (p.theme.loop && a.currentTime > endAt - 0.25) { const sc = scoreOf(p.theme, p.seed + 1); playing = { ...p, t0: endAt + 60 / p.theme.bpm, i: 0, evs: sc.evs, len: sc.len, seed: p.seed + 1 }; }
    else if (!p.theme.loop && a.currentTime > endAt + 2) stopMusic(400);
  }
}

let enabled = true;
/** 设置 · 音乐 (spec §2.1): off = no theme music anywhere (sound effects stay) */
export function setMusicEnabled(on: boolean): void { enabled = on; if (!on) stopMusic(300); }
/** start a theme (no-op if it is already playing); seed only changes the arrangement */
export function playTheme(id: 'map' | 'story', seed = 1): void {
  if (!enabled) return;
  const theme = id === 'map' ? MAP_THEME : STORY_THEME; const a = ac();
  if (playing?.theme.id === id) return;
  stopMusic(300);
  const start = (): void => {
    const c = ac(); if (!c) return; const o = chain(c); if (!o) return;
    o.gain.cancelScheduledValues(c.currentTime); o.gain.setValueAtTime(0.0001, c.currentTime); o.gain.exponentialRampToValueAtTime(GAIN, c.currentTime + 1.2);
    const sc = scoreOf(theme, seed); playing = { theme, t0: c.currentTime + 0.15, i: 0, evs: sc.evs, len: sc.len, seed };
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
  const g = a.createGain(); g.gain.value = MUSIC_GAIN; g.connect(bus); const sc = stingerScore(id as string); const t0 = a.currentTime + 0.03;
  for (const e of sc.evs) note(a, g, e, t0);
  setTimeout(() => g.disconnect(), (sc.len + 2.6) * 1000);
}
