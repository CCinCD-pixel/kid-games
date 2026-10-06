/**
 * Synthesised game sounds (spec §7.1): built live with Web Audio on the kit's 'sfx' bus (one
 * AudioContext — the kit's). ≤6 oscillators/noise sources each; noise buffers prebuilt after the
 * start gate. No audio files. Under Playwright the kit's automute silences the bus.
 */
import { getAudioContext, getBus, isAudioUnlocked } from '@kit/audio';

export type SynthName = 'mc.rail' | 'mc.boom' | 'mc.mine' | 'mc.shovel' | 'mc.whistle' | 'mc.reveal' | 'mc.sting' | 'mc.flag' | 'mc.handoff' | 'mc.tally';

let white: AudioBuffer | null = null;
let pink: AudioBuffer | null = null;
let brown: AudioBuffer | null = null;
/** played-sound log (tests read it through the debug hooks; never used for anything audible) */
export const synthLog: string[] = [];

const db = (d: number): number => Math.pow(10, d / 20);
const PENT = [0, 2, 4, 7, 9];
const pent = (k: number): number => Math.floor(k / 5) * 12 + PENT[((k % 5) + 5) % 5];

export function prepareSynth(): void {
  const ctx = getAudioContext();
  if (!ctx || white) return;
  const len = Math.floor(ctx.sampleRate * 1.0);
  white = ctx.createBuffer(1, len, ctx.sampleRate);
  pink = ctx.createBuffer(1, len, ctx.sampleRate);
  brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  // deterministic LCG noise (seeded, reproducible)
  let seed = 0x9e3779b9;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 * 2 - 1;
  };
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const x = rnd();
    w[i] = x;
    b0 = 0.99765 * b0 + x * 0.099046;
    b1 = 0.963 * b1 + x * 0.2965164;
    b2 = 0.57 * b2 + x * 1.0526913;
    p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.2;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
}

interface Kit {
  ctx: AudioContext;
  out: GainNode;
  t: number;
}
function kit(volume = 1): Kit | null {
  const ctx = getAudioContext();
  const bus = getBus('sfx');
  if (!ctx || !bus || !isAudioUnlocked()) return null;
  if (!white) prepareSynth();
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(bus);
  return { ctx, out, t: ctx.currentTime + 0.005 };
}

function env(_k: Kit, g: GainNode, t0: number, peak: number, attack: number, dur: number, release = 0.04): void {
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, t0 + dur);
}
function noise(k: Kit, buf: AudioBuffer | null, t0: number, dur: number): AudioBufferSourceNode {
  const s = k.ctx.createBufferSource();
  s.buffer = buf ?? white!;
  s.start(t0, (t0 * 0.37) % 0.5);
  s.stop(t0 + dur + 0.02);
  return s;
}
function osc(k: Kit, type: OscillatorType, freq: number, t0: number, dur: number): OscillatorNode {
  const o = k.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
  return o;
}
function cleanup(k: Kit, after: number): void {
  setTimeout(() => k.out.disconnect(), (after + 0.3) * 1000);
}

/** play a synthesised sound; `step` = station index for mc.rail / piece index for mc.tally */
export function synth(name: SynthName, step = 0): void {
  synthLog.push(name);
  if (synthLog.length > 200) synthLog.shift();
  const k = kit();
  if (!k) return;
  const t = k.t;
  switch (name) {
    case 'mc.rail': {
      // two 6 ms white-noise clicks 45 ms apart through a 1.8 kHz band-pass (Q 6), −20 dB; pitch climbs by pentatonic steps
      const f = 1800 * Math.pow(2, pent(step) / 12);
      for (const dt of [0, 0.045]) {
        const n = noise(k, white, t + dt, 0.006);
        const bp = k.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 6;
        const g = k.ctx.createGain();
        env(k, g, t + dt, db(-20) * 4, 0.001, 0.006, 0.003);
        n.connect(bp).connect(g).connect(k.out);
      }
      cleanup(k, 0.1);
      break;
    }
    case 'mc.boom': {
      const o = osc(k, 'sine', 120, t, 0.52);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.52);
      const g = k.ctx.createGain();
      env(k, g, t, db(-8), 0.002, 0.52, 0.3);
      o.connect(g).connect(k.out);
      const n = noise(k, pink, t, 0.4);
      const lp = k.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2000, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
      const g2 = k.ctx.createGain();
      env(k, g2, t, db(-14) * 2, 0.002, 0.4, 0.3);
      n.connect(lp).connect(g2).connect(k.out);
      cleanup(k, 0.6);
      break;
    }
    case 'mc.mine': {
      const o = osc(k, 'sine', 72, t, 0.26);
      const g = k.ctx.createGain();
      env(k, g, t, db(-12), 0.004, 0.26, 0.18);
      o.connect(g).connect(k.out);
      const n = noise(k, brown, t, 0.3);
      const lp = k.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const g2 = k.ctx.createGain();
      env(k, g2, t, db(-12), 0.004, 0.3, 0.2);
      n.connect(lp).connect(g2).connect(k.out);
      cleanup(k, 0.4);
      break;
    }
    case 'mc.shovel': {
      const n = noise(k, white, t, 0.18);
      const bp = k.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3;
      bp.frequency.setValueAtTime(1200, t);
      bp.frequency.exponentialRampToValueAtTime(3000, t + 0.18);
      const g = k.ctx.createGain();
      env(k, g, t, db(-18) * 2, 0.01, 0.18, 0.06);
      n.connect(bp).connect(g).connect(k.out);
      const o = osc(k, 'sine', 2200, t + 0.16, 0.12);
      const g2 = k.ctx.createGain();
      env(k, g2, t + 0.16, db(-22), 0.003, 0.12, 0.1);
      o.connect(g2).connect(k.out);
      cleanup(k, 0.35);
      break;
    }
    case 'mc.whistle': {
      // two sines 2.75 / 2.95 kHz with a 40 Hz ±60 cent trill, 280 ms, 15 ms edges, −18 dB
      for (const f of [2750, 2950]) {
        const o = osc(k, 'sine', f, t, 0.28);
        const lfo = osc(k, 'sine', 40, t, 0.28);
        const depth = k.ctx.createGain();
        depth.gain.value = f * (Math.pow(2, 60 / 1200) - 1);
        lfo.connect(depth).connect(o.frequency);
        const g = k.ctx.createGain();
        env(k, g, t, db(-18), 0.015, 0.28, 0.015);
        o.connect(g).connect(k.out);
      }
      cleanup(k, 0.35);
      break;
    }
    case 'mc.reveal': {
      // 12 noise taps accelerating from 60 ms to 20 ms gaps, high-passed at 800 Hz
      let at = t;
      for (let i = 0; i < 12; i++) {
        const n = noise(k, white, at, 0.025);
        const hp = k.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 800;
        const g = k.ctx.createGain();
        env(k, g, at, db(-16) * (0.6 + i * 0.04), 0.002, 0.025, 0.015);
        n.connect(hp).connect(g).connect(k.out);
        at += 0.06 - (0.04 * i) / 11;
      }
      cleanup(k, 0.5);
      break;
    }
    case 'mc.sting': {
      for (const f of [659.25, 987.77]) {
        const o = osc(k, 'triangle', f, t, 0.09);
        const g = k.ctx.createGain();
        env(k, g, t, db(-20), 0.003, 0.09, 0.05);
        o.connect(g).connect(k.out);
      }
      cleanup(k, 0.15);
      break;
    }
    case 'mc.flag': {
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((f, i) => {
        const at = t + i * 0.14;
        const dur = i === notes.length - 1 ? 0.4 : 0.14;
        const o = osc(k, 'triangle', f, at, dur);
        if (i === notes.length - 1) {
          const lfo = osc(k, 'sine', 6, at, dur);
          const depth = k.ctx.createGain();
          depth.gain.value = 6;
          lfo.connect(depth).connect(o.frequency);
        }
        const g = k.ctx.createGain();
        env(k, g, at, db(-16), 0.008, dur, 0.06);
        o.connect(g).connect(k.out);
      });
      cleanup(k, 0.9);
      break;
    }
    case 'mc.handoff': {
      [659.25, 880].forEach((f, i) => {
        const at = t + i * 0.16;
        for (const [mul, lvl] of [[1, -18], [2, -28]] as const) {
          const o = osc(k, 'sine', f * mul, at, 0.16);
          const g = k.ctx.createGain();
          env(k, g, at, db(lvl), 0.01, 0.16, 0.08);
          o.connect(g).connect(k.out);
        }
      });
      cleanup(k, 0.4);
      break;
    }
    case 'mc.tally': {
      const f = 523.25 * Math.pow(2, pent(step) / 12);
      for (const [mul, lvl] of [[1, -22], [3, -32]] as const) {
        const o = osc(k, 'sine', f * mul, t, 0.06);
        const g = k.ctx.createGain();
        env(k, g, t, db(lvl), 0.003, 0.06, 0.04);
        o.connect(g).connect(k.out);
      }
      cleanup(k, 0.1);
      break;
    }
  }
}
