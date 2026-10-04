/**
 * The site's ONE audio engine (iPadOS Safari rules baked in).
 *
 *  - Exactly one AudioContext per page (`getAudioContext()`); create/resume happens inside a user
 *    gesture via `unlockAudio()` (the kit shell's start gate calls it; `installAudioAutoUnlock()`
 *    also resumes on any later tap). Before that, sounds are dropped and narration waits.
 *  - `navigator.audioSession.type = 'playback'` so sound plays with the hardware mute switch on.
 *  - Interruption recovery: suspended when the page is hidden; resumed on return (or on the next
 *    tap when iOS leaves the context "interrupted").
 *  - Buses: master → { sfx, voice, music }. Narration plays on `voice`; music is ducked under it.
 *  - SFX: short AAC (.m4a) files decoded once to AudioBuffers, played with per-sound voice pooling.
 *  - Music: streamed with an <audio> element routed through a GainNode (iOS: element.volume is
 *    read-only), with fades and ducking. Never decode long music.
 *  - Synth tones (`playTone`, `playNotes`) for feedback until real SFX exist.
 *
 *   import { unlockAudio, sfx, playNotes, PENTATONIC, music } from '@kit/audio';
 *   await sfx.loadAll({ tap: '/audio/ui/tap.m4a' });
 *   sfx.play('tap', { volume: 0.8 });
 */

type Ctor = new (opts?: AudioContextOptions) => AudioContext;
export type BusName = 'master' | 'sfx' | 'voice' | 'music';

interface AudioSessionLike {
  type: string;
}

const MUTE_KEY = 'kg:settings:audio-muted';

let ctx: AudioContext | null = null;
let buses: Record<BusName, GainNode> | null = null;
let unlocked = false;
let autoUnlockInstalled = false;
let muted = readMuted();
const unlockWaiters = new Set<() => void>();
const clipCache = new Map<string, Promise<AudioBuffer | null>>();

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function audioCtor(): Ctor | null {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor; __kgOriginalAudioContext?: Ctor };
  return w.__kgOriginalAudioContext ?? w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** The page's single AudioContext (created lazily, starts "suspended" until unlocked). null if unsupported. */
export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  const C = audioCtor();
  if (!C) return null;
  ctx = new C({ latencyHint: 'interactive' });
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  const make = (v: number) => {
    const g = ctx!.createGain();
    g.gain.value = v;
    g.connect(master);
    return g;
  };
  buses = { master, sfx: make(0.9), voice: make(1), music: make(0.5) };
  ctx.addEventListener('statechange', () => {
    if (ctx?.state === 'running') {
      if (!unlocked) markUnlocked();
    }
    // iOS reports "interrupted" (phone call, Siri, another app took audio). The OS may resume it
    // by itself; otherwise the next tap does (installAudioAutoUnlock).
  });
  return ctx;
}

/** A bus GainNode (creates the context if needed). Connect your own nodes here, not to destination. */
export function getBus(name: BusName): GainNode | null {
  getAudioContext();
  return buses ? buses[name] : null;
}

function markUnlocked(): void {
  unlocked = true;
  for (const w of [...unlockWaiters]) w();
  unlockWaiters.clear();
}

function setPlaybackSession(): void {
  const nav = globalThis.navigator as Navigator & { audioSession?: AudioSessionLike };
  try {
    if (nav?.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
  } catch {
    /* not supported */
  }
}

/**
 * Call synchronously inside a user-gesture handler (pointerup/touchend/click/keydown).
 * Creates/resumes the context, plays one silent frame (the iOS unlock idiom) and selects the
 * "playback" audio session. Safe to call repeatedly.
 */
export function unlockAudio(): void {
  setPlaybackSession();
  const c = getAudioContext();
  if (!c) {
    markUnlocked(); // no Web Audio: let narration fall back to speech/text
    return;
  }
  if (c.state !== 'running') {
    void c.resume().then(
      () => markUnlocked(),
      () => {},
    );
  } else if (!unlocked) {
    markUnlocked();
  }
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
    src.onended = () => src.disconnect();
  } catch {
    /* ignore */
  }
  music.resumeIfWanted();
}

export const isAudioUnlocked = (): boolean => unlocked;

/** Resolves once audio has been unlocked by a gesture (immediately if it already was). */
export function whenAudioUnlocked(): Promise<void> {
  if (unlocked) return Promise.resolve();
  return new Promise((resolve) => unlockWaiters.add(resolve));
}

/**
 * Resume audio on every user gesture (capture phase) — covers the first tap on pages without a
 * start gate and recovery after iOS "interrupted" states. Also suspends audio while hidden.
 * Idempotent; the kit shell calls it.
 */
export function installAudioAutoUnlock(): void {
  if (autoUnlockInstalled || typeof document === 'undefined') return;
  autoUnlockInstalled = true;
  const onGesture = () => {
    if (!unlocked || (ctx && ctx.state !== 'running')) unlockAudio();
  };
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  // Back-forward cache restore (swipe back into a game): the context comes back suspended.
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted && ctx && unlocked) void ctx.resume().then(() => music.resumeIfWanted(), () => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') {
      music.pauseForBackground();
      void ctx.suspend().catch(() => {});
    } else {
      // May fail while iOS keeps the context "interrupted"; the next tap resumes it.
      void ctx.resume().then(() => music.resumeIfWanted(), () => {});
    }
  });
}

// ---------------------------------------------------------------- mute / volume

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (ctx && buses) buses.master.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.02);
}

export function setBusVolume(bus: BusName, volume: number): void {
  const node = getBus(bus);
  if (node && ctx) node.gain.setTargetAtTime(Math.max(0, volume), ctx.currentTime, 0.02);
}

// ---------------------------------------------------------------- clips

/** Fetch + decode an audio file once (shared by sfx and narration). Resolves null on failure. */
export function decodeClip(url: string): Promise<AudioBuffer | null> {
  let p = clipCache.get(url);
  if (!p) {
    p = (async () => {
      const c = getAudioContext();
      if (!c) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.arrayBuffer();
        return await c.decodeAudioData(data);
      } catch {
        return null;
      }
    })();
    clipCache.set(url, p);
    void p.then((buf) => {
      if (!buf) clipCache.delete(url); // allow a retry later
    });
  }
  return p;
}

/** Drop decoded buffers (e.g. when leaving a big chapter). */
export function releaseClips(urls?: string[]): void {
  if (!urls) clipCache.clear();
  else for (const u of urls) clipCache.delete(u);
}

export interface PlayOptions {
  volume?: number;
  /** playbackRate (1 = normal; 1.06 ≈ one semitone up) */
  rate?: number;
  /** -1 (left) … 1 (right) */
  pan?: number;
  /** seconds from now */
  delay?: number;
  loop?: boolean;
  bus?: Exclude<BusName, 'master'>;
}

export interface Voice {
  stop(fadeSec?: number): void;
  readonly ended: Promise<void>;
}

/** Play a decoded buffer on a bus. Returns null before unlock or without Web Audio. */
export function playBuffer(buffer: AudioBuffer, opts: PlayOptions = {}): Voice | null {
  const c = getAudioContext();
  if (!c || !buses || c.state !== 'running') return null;
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = opts.rate ?? 1;
  src.loop = opts.loop ?? false;
  const gain = c.createGain();
  gain.gain.value = opts.volume ?? 1;
  let tail: AudioNode = gain;
  src.connect(gain);
  if (opts.pan && typeof c.createStereoPanner === 'function') {
    const panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
    gain.connect(panner);
    tail = panner;
  }
  tail.connect(buses[opts.bus ?? 'sfx']);
  let resolveEnded!: () => void;
  const ended = new Promise<void>((r) => (resolveEnded = r));
  src.onended = () => {
    src.disconnect();
    gain.disconnect();
    if (tail !== gain) tail.disconnect();
    resolveEnded();
  };
  src.start(c.currentTime + (opts.delay ?? 0));
  return {
    ended,
    stop(fadeSec = 0.04) {
      try {
        const t = c.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fadeSec);
        src.stop(t + fadeSec + 0.01);
      } catch {
        /* already stopped */
      }
    },
  };
}

// ---------------------------------------------------------------- sfx bank with voice pooling

interface SfxEntry {
  url: string;
  buffer: Promise<AudioBuffer | null>;
  /** set once decoding finished (null = failed) */
  decoded: AudioBuffer | null | undefined;
  maxVoices: number;
  active: Voice[];
}

const bank = new Map<string, SfxEntry>();

export const sfx = {
  /** Register + decode a sound (AAC .m4a recommended). maxVoices limits overlapping copies (oldest is cut). */
  load(id: string, url: string, maxVoices = 4): Promise<boolean> {
    const existing = bank.get(id);
    // Same sound already registered: reuse it unless its decode failed (then retry below).
    if (existing && existing.url === url && existing.decoded !== null) return existing.buffer.then(Boolean);
    const entry: SfxEntry = { url, buffer: decodeClip(url), decoded: undefined, maxVoices, active: [] };
    bank.set(id, entry);
    return entry.buffer.then((b) => {
      entry.decoded = b;
      return Boolean(b);
    });
  },
  /** Register many: { id: url }. Resolves to the ids that failed to load. */
  async loadAll(map: Record<string, string>, maxVoices = 4): Promise<string[]> {
    const ids = Object.keys(map);
    const ok = await Promise.all(ids.map((id) => sfx.load(id, map[id], maxVoices)));
    return ids.filter((_, i) => !ok[i]);
  },
  has(id: string): boolean {
    return bank.has(id);
  },
  /** Fire-and-forget. Silently does nothing if the sound is unknown, not decoded yet or audio is locked. */
  play(id: string, opts: PlayOptions = {}): Voice | null {
    const entry = bank.get(id);
    if (!entry) return null;
    const handle = pooledPlay(entry, opts);
    return handle;
  },
  stopAll(id?: string): void {
    for (const [key, entry] of bank) {
      if (id && key !== id) continue;
      for (const v of entry.active.splice(0)) v.stop();
    }
  },
};

/** Exposed for tests: the pooling rule (drop oldest when at capacity). */
export function enforceVoiceLimit<T extends { stop(): void }>(active: T[], maxVoices: number): T[] {
  const removed: T[] = [];
  while (active.length >= maxVoices && active.length > 0) {
    const oldest = active.shift()!;
    oldest.stop();
    removed.push(oldest);
  }
  return removed;
}

function pooledPlay(entry: SfxEntry, opts: PlayOptions): Voice | null {
  // A sound requested before its buffer is decoded is skipped rather than played late
  // (late feedback is worse than none). Preload with sfx.loadAll() during the start gate.
  if (!entry.decoded) return null;
  enforceVoiceLimit(entry.active, entry.maxVoices);
  const v = playBuffer(entry.decoded, opts);
  if (!v) return null;
  entry.active.push(v);
  void v.ended.then(() => {
    const i = entry.active.indexOf(v);
    if (i >= 0) entry.active.splice(i, 1);
  });
  return v;
}

// ---------------------------------------------------------------- synth feedback

/** C major pentatonic from C5 — "success" ladders climb this (plan §5.2). */
export const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  /** seconds from now */
  when?: number;
  attack?: number;
  bus?: Exclude<BusName, 'master'>;
}

/** A short enveloped oscillator note. No-op before unlock. */
export function playTone(freq: number, duration: number, opts: ToneOptions = {}): void {
  const c = getAudioContext();
  if (!c || !buses || c.state !== 'running') return;
  const t0 = c.currentTime + (opts.when ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = freq;
  const peak = opts.volume ?? 0.15;
  const attack = opts.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, duration));
  osc.connect(g);
  g.connect(buses[opts.bus ?? 'sfx']);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

/** [frequency, startOffsetSec, durationSec][] */
export function playNotes(notes: ReadonlyArray<readonly [number, number, number]>, opts: Omit<ToneOptions, 'when'> = {}): void {
  for (const [f, at, d] of notes) playTone(f, d, { ...opts, when: at });
}

/** The soft "not yet" thud (never a harsh buzzer). */
export function playSoftMiss(): void {
  playTone(196, 0.18, { type: 'triangle', volume: 0.12 });
}

/** Rising pentatonic arpeggio; `step` picks how far up the ladder to start (combo feedback). */
export function playSuccess(step = 0): void {
  const base = Math.max(0, Math.min(PENTATONIC.length - 3, step));
  playNotes([
    [PENTATONIC[base], 0, 0.12],
    [PENTATONIC[base + 1], 0.08, 0.12],
    [PENTATONIC[base + 2], 0.16, 0.2],
  ], { type: 'triangle', volume: 0.12 });
}

// ---------------------------------------------------------------- music (streamed)

interface MusicState {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  volume: GainNode | null;
  duck: GainNode | null;
  url: string;
  wanted: boolean;
}

let current: MusicState | null = null;

function rampGain(node: GainNode | null, to: number, ms: number): void {
  if (!node || !ctx) return;
  const t = ctx.currentTime;
  node.gain.cancelScheduledValues(t);
  node.gain.setValueAtTime(node.gain.value, t);
  node.gain.linearRampToValueAtTime(to, t + Math.max(0.01, ms / 1000));
}

export const music = {
  /** Start (or switch to) a looping track. Only for menus/celebrations (plan §3.0). */
  play(url: string, opts: { volume?: number; fadeMs?: number; loop?: boolean } = {}): void {
    if (typeof Audio === 'undefined') return;
    if (current && current.url === url) {
      current.wanted = true;
      void current.el.play().catch(() => {});
      rampGain(current.volume, opts.volume ?? 0.6, opts.fadeMs ?? 600);
      return;
    }
    music.stop(opts.fadeMs ?? 400);
    const el = new Audio(url);
    el.loop = opts.loop ?? true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    const c = getAudioContext();
    const state: MusicState = { el, source: null, volume: null, duck: null, url, wanted: true };
    if (c && buses) {
      try {
        state.source = c.createMediaElementSource(el);
        state.volume = c.createGain();
        state.duck = c.createGain();
        state.volume.gain.value = 0;
        state.source.connect(state.volume);
        state.volume.connect(state.duck);
        state.duck.connect(buses.music);
      } catch {
        /* fall back to the element's own output */
      }
    }
    current = state;
    void el.play().catch(() => {});
    rampGain(state.volume, opts.volume ?? 0.6, opts.fadeMs ?? 600);
  },
  stop(fadeMs = 400): void {
    const s = current;
    if (!s) return;
    current = null;
    s.wanted = false;
    rampGain(s.volume, 0, fadeMs);
    setTimeout(() => {
      s.el.pause();
      s.el.removeAttribute('src');
      s.el.load();
      s.source?.disconnect();
      s.volume?.disconnect();
      s.duck?.disconnect();
    }, fadeMs + 50);
  },
  /** Lower the music under narration (level = fraction of normal). */
  duck(on: boolean, level = 0.3, ms = 250): void {
    if (current) rampGain(current.duck, on ? level : 1, ms);
  },
  pauseForBackground(): void {
    current?.el.pause();
  },
  resumeIfWanted(): void {
    if (current?.wanted && current.el.paused) void current.el.play().catch(() => {});
  },
  get playing(): boolean {
    return !!current && !current.el.paused;
  },
};

/** Test hook: forget all state (vitest only). */
export function __resetAudioForTests(): void {
  ctx = null;
  buses = null;
  unlocked = false;
  autoUnlockInstalled = false;
  unlockWaiters.clear();
  clipCache.clear();
  bank.clear();
  current = null;
  muted = readMuted();
}
