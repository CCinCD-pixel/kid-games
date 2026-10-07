/**
 * Audio (spec §7): kit semantic sounds (installKitSfx subset) + the game's 18 rendered SFX files
 * (assets/sfx, tools/snake-battle/build_match_audio.py) incl. the seamless boost loop on its own gain node,
 * the eat pentatonic ladder (§7.2), the rendered match beds (pad-calm / pad-deep, 40 s loops) and the
 * percussion lift layer on the music bus (ducked under voice by the kit), and narration (recorded clips,
 * subtitles, lifetime caps §7.5). Everything routes through kit/audio (one AudioContext; auto-muted under automation).
 */
import { sfx, getAudioContext, getBus, decodeClip } from '@kit/audio';
import { installKitSfx, chime } from '@kit/ui/sfx-bridge';
import { Narrator, type Cue, type NarrationManifest, type SayResult } from '@kit/narration';
import lines from '../../../content/snake-battle/lines.json';
import padCalmUrl from '../assets/music/pad-calm.m4a?url';
import padDeepUrl from '../assets/music/pad-deep.m4a?url';
import liftUrl from '../assets/music/perc-lift.m4a?url';

const KIT = ['eat', 'chime', 'coin', 'powerup', 'whoosh-up', 'whoosh-down', 'level-up', 'jingle-magic', 'jingle-round-over', 'jingle-win', 'level-complete',
  'ui-tick', 'launch', 'hit-soft', 'ui-locked', 'ui-notify', 'ui-tap', 'ui-press', 'ui-open', 'ui-close', 'ui-back', 'ui-confirm', 'ui-select', 'ui-pop', 'unlock', 'star-1', 'star-2', 'star-3', 'blip-surprised', 'bump'];


// ---- the game's own sounds (spec §7.1): 18 rendered files, tools/snake-battle/build_match_audio.py -------------
const SFX_URLS = import.meta.glob('../assets/sfx/*.m4a', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sfxUrl = (id: string) => Object.entries(SFX_URLS).find(([k]) => k.endsWith(`/${id}.m4a`))?.[1] ?? '';
const GAME_SFX = ['snake-boost-start', 'snake-kill', 'snake-out', 'snake-shield-up', 'snake-shield-break', 'snake-magnet-on', 'snake-speed-on', 'snake-meteor', 'snake-king', 'snake-king-windup', 'snake-king-charge', 'snake-gem-break', 'snake-drop-burst', 'snake-sting-2', 'snake-sting-3', 'snake-sting-4', 'snake-sting-5'];
/** after the start gate: the kit subset + the game's files (≈150 KB), all decoded before the first match */
/** idempotent: the first-run path, the gate and every match start may all call it (QA r3: the first session was
 * silent because only the returning-player path loaded the bank) */
let sfxLoad: Promise<void> | null = null;
export function loadSfx(): Promise<void> {
  return (sfxLoad ??= (async () => {
    try { await installKitSfx({ only: KIT, maxVoices: 6 }); } catch { /* offline first visit: silent */ }
    try { await sfx.loadAll(Object.fromEntries(GAME_SFX.map((id) => [id, sfxUrl(id)])), 2); } catch { /* ignore */ }
  })());
}
export const play = (name: string, o: { volume?: number; rate?: number; pan?: number } = {}) => sfx.play(name, o);
/** spatial rule (spec §7.1): other snakes' events pan by screen x (×0.6); on screen 0.6, just off screen 0.3 */
export const playAt = (name: string, sx: number, vw: number, onScreen: boolean) => play(name, { volume: onScreen ? 0.6 : 0.3, pan: Math.max(-1, Math.min(1, (sx - vw / 2) / (vw / 2))) * 0.6 });
export const SND = {
  boostStart: () => play('snake-boost-start', { volume: 0.7 }),
  kill: () => play('snake-kill'),
  out: () => play('snake-out'),
  shieldUp: () => play('snake-shield-up', { volume: 0.8 }),
  shieldBreak: () => play('snake-shield-break', { volume: 0.8 }),
  magnet: () => play('snake-magnet-on', { volume: 0.8 }),
  speed: () => play('snake-speed-on', { volume: 0.8 }),
  ring: (i: number) => chime(Math.min(9, i + 2), 'chime'),
  gem: () => play('snake-gem-break', { volume: 0.63 }),
  windup: () => play('snake-king-windup'),
  charge: () => play('snake-king-charge', { volume: 0.8 }),
  king: () => play('snake-king'),
  wake: () => play('blip-surprised', { volume: 0.6 }),
  core: () => play('snake-sting-3', { volume: 0.6 }),
  meteor: () => play('snake-meteor', { volume: 0.8 }),
  sting: (n: number) => play(`snake-sting-${Math.max(2, Math.min(5, n))}`, { volume: 0.5 }),
};

/** a decoded buffer looped over its periodic window [0.25, 0.25 + period] (seamless whatever the AAC priming) */
function loopSource(ctx: AudioContext, buf: AudioBuffer, period: number, dest: AudioNode) {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  src.loopStart = 0.25; src.loopEnd = Math.min(buf.duration, 0.25 + period);
  src.connect(dest); src.start(ctx.currentTime, 0.25);
  return src;
}

/** boost loop (spec §7.1): own AudioBufferSourceNode (loop) → own GainNode → sfx bus; 0 → 0.35 in 50 ms */
export class BoostLoop {
  private src: AudioBufferSourceNode | null = null; private g: GainNode | null = null; private on = false; private buf: AudioBuffer | null = null;
  constructor() { void decodeClip(sfxUrl('snake-boost-loop')).then((b) => { this.buf = b; }); }
  set(on: boolean) {
    if (on === this.on) return; this.on = on;
    const ctx = getAudioContext(), bus = getBus('sfx'); if (!ctx || !bus || !this.buf) return;
    if (on && !this.src) { this.g = ctx.createGain(); this.g.gain.value = 0; this.g.connect(bus); this.src = loopSource(ctx, this.buf, 1.0, this.g); }
    this.g?.gain.setTargetAtTime(on ? 0.35 : 0, ctx.currentTime, 0.05 / 3);
    if (!on) { const src = this.src, g = this.g; this.src = null; this.g = null; setTimeout(() => { try { src?.stop(); } catch { /* ignore */ } g?.disconnect(); }, 250); }
  }
}

/** eat ladder (spec §7.2): consecutive eats within 0.6 s climb the pentatonic scale (cap 2 octaves) */
let eatStep = 0, eatT = 0;
export function eatSound(big: boolean) {
  const now = performance.now();
  eatStep = now - eatT < 600 ? Math.min(eatStep + 1, 10) : 0; eatT = now;
  chime(eatStep + (big ? 2 : 0), 'eat');
  if (big) sfx.play('chime', { volume: 0.6 });
}

// ---- match beds + lift layer (spec §7.3): rendered 40 s loops, own looping sources on the music bus ----------
export type Bed = 'calm' | 'deep';
export class MatchPad {
  private srcs: AudioBufferSourceNode[] = []; private out: GainNode | null = null; private lift: GainNode | null = null; private token = 0;
  /** moon / mars / saturn → calm, jupiter / black hole → deep. Lazily decoded on the first match (≈7 MB each). */
  start(bed: Bed) {
    const ctx = getAudioContext(), bus = getBus('music'); if (!ctx || !bus) return;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(bus); this.out = out;
    const lift = ctx.createGain(); lift.gain.value = 0; lift.connect(bus); this.lift = lift;
    const tok = ++this.token;
    void Promise.all([decodeClip(bed === 'deep' ? padDeepUrl : padCalmUrl), decodeClip(liftUrl)]).then(([pb, lb]) => {
      if (tok !== this.token || this.out !== out) return;   // the match ended while decoding
      if (pb) this.srcs.push(loopSource(ctx, pb, 40, out));
      if (lb) this.srcs.push(loopSource(ctx, lb, 40, lift));
      out.gain.setTargetAtTime(0.25, ctx.currentTime, 1.2 / 3);
    });
  }
  /** test probe: the live output nodes (null between matches) */
  get live() { return { out: this.out, lift: this.lift }; }
  /** lift layer: 0.2, 1 s fade in / 2 s fade out */
  raise(on: boolean) { const ctx = getAudioContext(); if (ctx && this.lift) this.lift.gain.setTargetAtTime(on ? 0.2 : 0, ctx.currentTime, on ? 1 / 3 : 2 / 3); }
  stop() {
    const ctx = getAudioContext(); this.token++;
    if (ctx && this.out) this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    if (ctx && this.lift) this.lift.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    const srcs = this.srcs; this.srcs = [];
    // capture this match's nodes: startMatch() calls stop() then start() in the same tick, so the deferred
    // disconnect must never touch the NEXT match's out/lift (QA r1: the pad went silent 0.9 s into every match)
    const out = this.out, lift = this.lift; this.out = null; this.lift = null;
    setTimeout(() => { for (const n of srcs) try { n.stop(); } catch { /* ignore */ } out?.disconnect(); lift?.disconnect(); }, 900);
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
export const CLIP_MANIFEST = '/audio/snake-battle/audio-manifest.json';
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
    // the voice step's recorded clips (docs/VOICE.md) override the text manifest line by line; the text manifest
    // stays underneath so an offline first visit still gets subtitles + the system voice (spec 0A.2-7)
    this.clips = this.narrator.addManifest(CLIP_MANIFEST);
  }
  /** resolves once the recorded-clip manifest is merged (never rejects) */
  clips: Promise<void>;
  /** the clip a line will play ('' = system voice / subtitle only) */
  clipOf(id: string): string { return (this.narrator as unknown as { manifest: NarrationManifest }).manifest[id]?.src ?? ''; }
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
