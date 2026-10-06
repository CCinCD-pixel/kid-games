/**
 * Audio (spec §7): kit semantic sounds (installKitSfx subset), the game's own sounds synthesised in Web
 * Audio on the kit's sfx bus (snake-boost-start, -kill, -out, -shield-up/-break, -magnet-on, -meteor),
 * the eat pentatonic ladder (§7.2), a quiet beat-less match pad on the music bus (25 %, ducked by voice)
 * with a light percussion lift for the last 10 s / first place, and narration (bundled text manifest →
 * subtitles + system voice before the voice step makes clips; lifetime caps §7.5).
 * Everything routes through kit/audio (one AudioContext; auto-muted under automation).
 */
import { sfx, getAudioContext, getBus, isMuted } from '@kit/audio';
import { installKitSfx, chime } from '@kit/ui/sfx-bridge';
import { Narrator, type Cue, type NarrationManifest, type SayResult } from '@kit/narration';
import lines from '../../../content/snake-battle/lines.json';

const KIT = ['eat', 'chime', 'coin', 'powerup', 'whoosh-up', 'whoosh-down', 'level-up', 'jingle-magic', 'jingle-round-over', 'jingle-win', 'level-complete',
  'ui-tick', 'launch', 'hit-soft', 'ui-locked', 'ui-notify', 'ui-tap', 'ui-press', 'ui-open', 'ui-close', 'ui-back', 'ui-confirm', 'ui-select', 'ui-pop', 'unlock', 'star-1', 'star-2', 'star-3', 'blip-surprised', 'bump'];

export async function loadSfx() { try { await installKitSfx({ only: KIT, maxVoices: 6 }); } catch { /* offline first visit: silent */ } }
export const play = (name: string, o: { volume?: number; rate?: number } = {}) => sfx.play(name, o);

// ---- synthesised game sounds -------------------------------------------------
type Tone = { f: number; f1?: number; t: number; d: number; type?: OscillatorType; g?: number; q?: number };
function synth(parts: Tone[], noise?: { t: number; d: number; g: number; f: number }) {
  const ctx = getAudioContext(), bus = getBus('sfx'); if (!ctx || !bus || isMuted()) return;
  const t0 = ctx.currentTime + 0.005;
  for (const p of parts) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = p.type ?? 'sine'; o.frequency.setValueAtTime(p.f, t0 + p.t);
    if (p.f1) o.frequency.exponentialRampToValueAtTime(p.f1, t0 + p.t + p.d);
    g.gain.setValueAtTime(0.0001, t0 + p.t); g.gain.exponentialRampToValueAtTime(p.g ?? 0.25, t0 + p.t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.t + p.d);
    o.connect(g).connect(bus); o.start(t0 + p.t); o.stop(t0 + p.t + p.d + 0.05);
  }
  if (noise) {
    const len = Math.ceil(ctx.sampleRate * noise.d), buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
    let s = 12345; for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; ch[i] = (s / 0x3fffffff - 1) * (1 - i / len); }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = noise.f; f.Q.value = 0.8; g.gain.value = noise.g;
    src.connect(f).connect(g).connect(bus); src.start(t0 + noise.t);
  }
}
export const SND = {
  boostStart: () => synth([{ f: 220, f1: 520, t: 0, d: 0.22, type: 'triangle', g: 0.18 }], { t: 0, d: 0.25, g: 0.25, f: 1800 }),
  kill: () => synth([{ f: 523, t: 0, d: 0.12, type: 'triangle', g: 0.22 }, { f: 784, t: 0.07, d: 0.14, type: 'triangle', g: 0.2 }, { f: 1046, t: 0.14, d: 0.24, type: 'sine', g: 0.2 }], { t: 0, d: 0.16, g: 0.3, f: 900 }),
  out: () => synth([{ f: 330, f1: 140, t: 0, d: 0.35, type: 'sine', g: 0.22 }], { t: 0, d: 0.18, g: 0.25, f: 500 }),
  shieldUp: () => synth([{ f: 660, f1: 990, t: 0, d: 0.25, type: 'sine', g: 0.16 }, { f: 1320, t: 0.08, d: 0.3, type: 'sine', g: 0.08 }]),
  shieldBreak: () => synth([{ f: 1200, f1: 500, t: 0, d: 0.3, type: 'triangle', g: 0.15 }], { t: 0, d: 0.3, g: 0.35, f: 3500 }),
  magnet: () => synth([{ f: 300, f1: 600, t: 0, d: 0.3, type: 'square', g: 0.05 }, { f: 450, f1: 900, t: 0.05, d: 0.3, type: 'sine', g: 0.12 }]),
  ring: (i: number) => { const f = [523, 587, 659, 784, 880, 1046, 1175, 1318][Math.min(7, i)]; synth([{ f, t: 0, d: 0.16, type: 'sine', g: 0.2 }, { f: f * 1.5, t: 0.05, d: 0.22, type: 'triangle', g: 0.1 }]); },
  gem: () => synth([{ f: 1568, f1: 784, t: 0, d: 0.35, type: 'triangle', g: 0.2 }, { f: 2093, t: 0.04, d: 0.3, type: 'sine', g: 0.1 }], { t: 0, d: 0.25, g: 0.3, f: 4000 }),
  windup: () => synth([{ f: 90, f1: 160, t: 0, d: 0.8, type: 'sawtooth', g: 0.07 }, { f: 45, t: 0, d: 0.8, type: 'sine', g: 0.16 }]),
  wake: () => synth([{ f: 400, f1: 700, t: 0, d: 0.18, type: 'sine', g: 0.12 }]),
  core: () => synth([{ f: 659, t: 0, d: 0.12, g: 0.15 }, { f: 988, t: 0.08, d: 0.12, g: 0.15 }, { f: 1318, t: 0.16, d: 0.3, g: 0.15 }]),
  meteor: () => synth([{ f: 880, t: 0, d: 0.1, g: 0.15 }, { f: 1175, t: 0.06, d: 0.1, g: 0.15 }, { f: 1568, t: 0.12, d: 0.25, g: 0.15 }]),
};

/** eat ladder (spec §7.2): consecutive eats within 0.6 s climb the pentatonic scale (cap 2 octaves) */
let eatStep = 0, eatT = 0;
export function eatSound(big: boolean) {
  const now = performance.now();
  eatStep = now - eatT < 600 ? Math.min(eatStep + 1, 10) : 0; eatT = now;
  chime(eatStep + (big ? 2 : 0), 'eat');
  if (big) sfx.play('chime', { volume: 0.6 });
}

// ---- match pad (beat-less drone + optional lift) --------------------------------
export class MatchPad {
  private nodes: AudioNode[] = []; private out: GainNode | null = null; private lift: GainNode | null = null; private timer = 0;
  start(venueIdx: number) {
    const ctx = getAudioContext(), bus = getBus('music'); if (!ctx || !bus) return;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(bus); this.out = out;
    const root = [110, 98, 103.8, 87.3][venueIdx] ?? 110;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
    for (const [mul, det, g] of [[1, -4, 0.09], [1.5, 3, 0.06], [2, 5, 0.05], [3, -2, 0.025]] as const) {
      const o = ctx.createOscillator(), gg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sine'; o.frequency.value = root * mul; o.detune.value = det; gg.gain.value = g;
      lfo.frequency.value = 0.07 + mul * 0.03; lg.gain.value = g * 0.5; lfo.connect(lg).connect(gg.gain);
      o.connect(gg).connect(lp); o.start(); lfo.start(); this.nodes.push(o, lfo);
    }
    out.gain.setTargetAtTime(0.25, ctx.currentTime, 1.2);
    // lift: soft ticks (only when raised)
    const lift = ctx.createGain(); lift.gain.value = 0; lift.connect(bus); this.lift = lift;
    let step = 0;
    this.timer = window.setInterval(() => {
      if (!this.lift || this.lift.gain.value < 0.01) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = step % 4 === 0 ? root * 2 : root * 4; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(lift); o.start(t); o.stop(t + 0.15); step++;
    }, 250);
  }
  raise(on: boolean) { const ctx = getAudioContext(); if (ctx && this.lift) this.lift.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.6); }
  stop() {
    const ctx = getAudioContext(); clearInterval(this.timer);
    if (ctx && this.out) this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    const nodes = this.nodes; this.nodes = [];
    setTimeout(() => { for (const n of nodes) try { (n as OscillatorNode).stop(); } catch { /* ignore */ } this.out?.disconnect(); this.lift?.disconnect(); }, 900);
  }
}

// ---- narration ----------------------------------------------------------------
interface Line { id: string; role: string; text: string }
const LINES = lines as Line[];
export function textManifest(): NarrationManifest {
  const m: NarrationManifest = {};
  for (const l of LINES) m[l.id] = { src: '', text: l.text, durationMs: 0, role: l.role } as NarrationManifest[string];
  return m;
}
export const lineText = (id: string) => LINES.find((l) => l.id === id)?.text ?? '';

/**
 * Voice scheduler (spec §7.5, wraps the kit Narrator). In matches: P0 (death cause, result, 出发, brief,
 * story, first-run intro) interrupts and clears the queue; P1 (kills, rank 1, last 10 s, length, king,
 * wake, hints) keeps at most one queued line — a newer P1 replaces it, and a kill call within 0.8 s of
 * another replaces the one playing ("两连击" instead of "击败"); P2 (power-ups, near misses, meteors,
 * one-off tips) is dropped while anything is speaking. Density: ≥0.3 s between lines and ≤2 lines in
 * any 10 s (P2 dropped, P1 waits ≤4 s). A length call within 1 s of a kill call is skipped. Out of
 * matches every line goes straight to the Narrator (menus, briefs, cards keep their own order).
 */
export type Prio = 0 | 1 | 2;
export function prioOf(id: string): Prio {
  if (/^snake\.(death\.|match\.go|match\.end|intro\.|story\.|retry\.|praise|m\.c\dm\d\.brief)/.test(id)) return 0;
  if (/^snake\.(ann\.|match\.rank1|match\.last10|len\.|king\.|wake|m\.|hint\.|pu\.saved)/.test(id)) return 1;
  return 2;
}
type SayOpts = { interrupt?: boolean; vars?: Record<string, string | number>; prio?: Prio };

export class Voice {
  narrator: Narrator;
  log: string[] = [];
  /** set by the app while a match runs (density + priority rules apply) */
  inMatch = false;
  /** priority of the line being spoken (subtitles in matches only for P0/P1) */
  currentPrio: Prio = 0;
  private cur: { id: string; p: Prio; t: number } | null = null;
  private queued: { id: string; o: SayOpts; p: Prio; t: number; resolve: (r: SayResult) => void } | null = null;
  private recent: number[] = [];
  private lastEnd = -1e9; private lastAnn = -1e9;
  constructor(o: { onCue?: (c: Cue | null) => void; onWord?: (i: number, c: Cue) => void; test?: boolean }) {
    this.narrator = new Narrator({ manifest: textManifest(), onCue: o.onCue, onWord: o.onWord, ...(o.test ? { unlocked: () => Promise.resolve(), voiced: () => false, speechFallback: false } : {}) });
  }
  say(id: string, o: SayOpts = {}): Promise<SayResult> {
    if (!this.inMatch) { this.log.push(id); this.currentPrio = 0; return this.narrator.say(id, o); }
    const p = o.prio ?? prioOf(id), now = performance.now();
    const skip = () => Promise.resolve('skipped' as unknown as SayResult);
    this.recent = this.recent.filter((t) => now - t < 10000);
    if (id.startsWith('snake.len.') && now - this.lastAnn < 1000) return skip();
    if (p === 0) { this.dropQueued(); return this.start(id, { ...o, interrupt: true }, p); }
    const free = !this.cur && this.recent.length < 2 && now - this.lastEnd >= 300;
    if (p === 2) return !this.cur && !this.queued && free ? this.start(id, { ...o, interrupt: false }, p) : skip();
    if (free) return this.start(id, { ...o, interrupt: false }, p);
    const c = this.cur;
    if (c && (c.p === 2 || (c.p === 1 && id.startsWith('snake.ann.') && c.id.startsWith('snake.ann.') && now - c.t < 800))) return this.start(id, { ...o, interrupt: true }, p);
    this.dropQueued();
    return new Promise((resolve) => { this.queued = { id, o, p, t: now, resolve }; if (!this.cur) this.later(); });
  }
  private start(id: string, o: SayOpts, p: Prio): Promise<SayResult> {
    const t = performance.now();
    this.log.push(id); this.cur = { id, p, t }; this.currentPrio = p;
    if (this.inMatch) this.recent.push(t);
    if (id.startsWith('snake.ann.')) this.lastAnn = t;
    const pr = this.narrator.say(id, { interrupt: o.interrupt, vars: o.vars });
    const done = () => { if (this.cur && this.cur.t === t) { this.cur = null; this.lastEnd = performance.now(); this.later(); } };
    pr.then(done, done);
    return pr;
  }
  private dropQueued() { const q = this.queued; this.queued = null; q?.resolve('skipped' as unknown as SayResult); }
  private pumpT = 0;
  private later() { clearTimeout(this.pumpT); if (this.queued) this.pumpT = window.setTimeout(() => this.pump(), 320); }
  private pump() {
    const q = this.queued; if (!q || this.cur) return;
    const now = performance.now();
    if (now - q.t > 4000) { this.dropQueued(); return; }
    this.recent = this.recent.filter((t) => now - t < 10000);
    if (this.recent.length >= 2) { clearTimeout(this.pumpT); this.pumpT = window.setTimeout(() => this.pump(), Math.max(150, 10020 - (now - this.recent[0]))); return; }
    this.queued = null;
    this.start(q.id, { ...q.o, interrupt: false }, q.p).then(q.resolve, () => q.resolve('skipped' as unknown as SayResult));
  }
  stop() { this.dropQueued(); clearTimeout(this.pumpT); this.cur = null; this.narrator.stop(); }
}
