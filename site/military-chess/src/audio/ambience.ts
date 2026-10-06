/**
 * 营地环境曲 (spec §7.2): a hand-written 16-bar "light military" tune, 96 BPM, 4/4, C major pentatonic,
 * synthesised live (no audio file): piccolo = triangle + 5 Hz vibrato (−26 dB, 8 ms attack, 80 %
 * of the value), plucked bass = sine + 2nd harmonic on beat 1 (−28 dB; from the second time round
 * also the fifth on beat 3), brushed snare = 30 ms noise high-passed at 3 kHz on every off-beat
 * (−32 dB). Camp, academy map, ladder, endgames and results only — never on a board. Routed to the
 * kit's 'music' bus; ducks to 35 % while the guide speaks; fades out in 800 ms when it stops.
 * A light look-ahead scheduler (one setTimeout every 0.5 s), no rAF.
 */
import { getAudioContext, getBus, isAudioUnlocked } from '@kit/audio';

const BPM = 96;
const BEAT = 60 / BPM;
const NOTE: Record<string, number> = { G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0 };
const ROOT: Record<string, number> = { C: 130.81, G: 98.0, A: 110.0 };
const FIFTH: Record<string, number> = { C: 196.0, G: 146.83, A: 164.81 };

/** melody per bar: "pitch:beats" (the spec's table, bars 1–16) */
const MELODY: string[][] = [
  ['G4:1', 'C5:1', 'E5:1', 'G5:1'], ['E5:2', 'C5:2'], ['D5:1', 'E5:1', 'D5:1', 'C5:1'], ['A4:2', 'G4:2'],
  ['G4:1', 'C5:1', 'E5:1', 'G5:1'], ['A5:2', 'G5:2'], ['E5:1', 'D5:1', 'C5:1', 'D5:1'], ['E5:4'],
  ['C5:1', 'E5:1', 'G5:1', 'E5:1'], ['D5:2', 'G4:2'], ['A4:1', 'C5:1', 'D5:1', 'E5:1'], ['D5:4'],
  ['G4:1', 'C5:1', 'E5:1', 'G5:1'], ['A5:1', 'G5:1', 'E5:1', 'D5:1'], ['C5:1', 'D5:1', 'E5:1', 'D5:1'], ['C5:4'],
];
const BASS = ['C', 'C', 'G', 'G', 'C', 'A', 'G', 'C', 'C', 'G', 'A', 'G', 'C', 'A', 'G', 'C'];
const db = (d: number): number => Math.pow(10, d / 20);

let out: GainNode | null = null;
let duck: GainNode | null = null;
let timer = 0;
let nextBar = 0;
let nextTime = 0;
let round = 0;
let noise: AudioBuffer | null = null;
let playing = false;
const live = new Set<AudioScheduledSourceNode>();

function noiseBuf(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = Math.floor(ctx.sampleRate * 0.1);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return noise;
}

function track(n: AudioScheduledSourceNode): void {
  live.add(n);
  n.onended = () => live.delete(n);
}

function piccolo(ctx: AudioContext, freq: number, t: number, beats: number): void {
  const dur = beats * BEAT * 0.8;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, t);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5;
  const vibAmt = ctx.createGain();
  vibAmt.gain.value = freq * 0.006;
  vib.connect(vibAmt).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(db(-26), t + 0.008);
  g.gain.setValueAtTime(db(-26), t + Math.max(0.01, dur - 0.05));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(duck!);
  o.start(t);
  vib.start(t);
  o.stop(t + dur + 0.02);
  vib.stop(t + dur + 0.02);
  track(o);
  track(vib);
}

function pluck(ctx: AudioContext, freq: number, t: number): void {
  for (const [mult, lvl] of [[1, -28], [2, -36]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mult, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(db(lvl), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 0.9);
    o.connect(g).connect(duck!);
    o.start(t);
    o.stop(t + BEAT);
    track(o);
  }
}

function brush(ctx: AudioContext, t: number): void {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(db(-32), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  s.connect(hp).connect(g).connect(duck!);
  s.start(t);
  s.stop(t + 0.04);
  track(s);
}

function scheduleBar(ctx: AudioContext, bar: number, t0: number): void {
  let t = t0;
  for (const n of MELODY[bar]) {
    const [p, b] = n.split(':');
    const beats = Number(b);
    piccolo(ctx, NOTE[p], t, beats);
    t += beats * BEAT;
  }
  pluck(ctx, ROOT[BASS[bar]], t0);
  if (round > 0) pluck(ctx, FIFTH[BASS[bar]], t0 + 2 * BEAT);
  for (let k = 0; k < 4; k++) brush(ctx, t0 + (k + 0.5) * BEAT);
}

function tick(): void {
  const ctx = getAudioContext();
  if (!ctx || !playing) return;
  while (nextTime < ctx.currentTime + 1.2) {
    scheduleBar(ctx, nextBar, nextTime);
    nextTime += 4 * BEAT;
    nextBar++;
    if (nextBar === MELODY.length) {
      nextBar = 0;
      round++;
    }
  }
  timer = window.setTimeout(tick, 500);
}

/** start the tune (no-op when already playing, audio locked, or switched off) */
export function startAmbience(enabled: boolean): void {
  if (!enabled) return stopAmbience();
  const ctx = getAudioContext();
  const bus = getBus('music');
  if (!ctx || !bus || !isAudioUnlocked() || playing) return;
  playing = true;
  out = ctx.createGain();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
  duck = ctx.createGain();
  duck.connect(out).connect(bus);
  nextBar = 0;
  round = 0;
  nextTime = ctx.currentTime + 0.15;
  tick();
}

/** fade out in 800 ms and stop every node */
export function stopAmbience(): void {
  if (!playing) return;
  playing = false;
  clearTimeout(timer);
  const ctx = getAudioContext();
  const o = out;
  out = null;
  duck = null;
  if (!ctx || !o) return;
  o.gain.cancelScheduledValues(ctx.currentTime);
  o.gain.setValueAtTime(o.gain.value, ctx.currentTime);
  o.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
  const nodes = [...live];
  live.clear();
  window.setTimeout(() => {
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    o.disconnect();
  }, 850);
}

/** the guide speaks: down to 35 % in 300 ms; back up in 600 ms */
export function duckAmbience(on: boolean): void {
  const ctx = getAudioContext();
  if (!ctx || !duck) return;
  const g = duck.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(on ? 0.35 : 1, ctx.currentTime + (on ? 0.3 : 0.6));
}

export const ambienceOn = (): boolean => playing;
