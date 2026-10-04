/**
 * Narration runtime: plays pre-generated voice clips listed in an audio manifest, with a queue,
 * interrupts, subtitles, word timing, "再听一遍" (replay) and prefetch.
 *
 * The TTS engine is NOT part of the runtime. Clips are generated offline from
 * content/narration/<game>.yaml by whatever engine the voice pipeline uses (a free local model
 * today, something else later) into public/audio/<game>/ plus an audio-manifest.json:
 *
 *   {
 *     "mars.intro.1": { "src": "/audio/mars-base/mars.intro.1.3f9a2c.m4a", "text": "欢迎来到火星基地！",
 *                       "durationMs": 1830, "words": [{ "ch": "欢", "t0": 0, "t1": 180 }, …] }
 *   }
 *
 * Swapping engines only changes the files, never game code. At runtime a list of backends is
 * tried in order: the clip backend (Web Audio, voice bus) and — only when a clip is missing or
 * fails — the speechSynthesis zh-CN backend. Text is always shown, so the game works muted.
 *
 *   const narrator = new Narrator({ manifestUrl: '/audio/mars-base/audio-manifest.json',
 *                                   onCue: (cue) => subtitle.show(cue) });
 *   await narrator.ready();
 *   narrator.say('mars.intro.1');                 // queued
 *   narrator.say('mars.hint.2', { interrupt: true }); // cuts the current line
 *   narrator.replay();                            // 再听一遍
 */

import { decodeClip, getBus, music, playBuffer, whenAudioUnlocked, type Voice } from './audio';

export interface WordTiming {
  /** the character (or word) shown */
  ch: string;
  /** start/end in ms from clip start */
  t0: number;
  t1: number;
}

export interface NarrationClip {
  src: string;
  text: string;
  durationMs: number;
  words?: WordTiming[];
  /** optional voice role from the yaml (narrator, companion, dad…) */
  role?: string;
}

export type NarrationManifest = Record<string, NarrationClip>;

export interface Cue {
  /** manifest id, or null for ad-hoc text */
  id: string | null;
  text: string;
  words?: WordTiming[];
  durationMs?: number;
  /** what actually produced the sound */
  source: 'clip' | 'speech' | 'text';
}

export type SayResult = 'done' | 'interrupted' | 'skipped';

/** A way of voicing a cue. Return false from canPlay to let the next backend try. */
export interface NarrationBackend {
  readonly name: string;
  canPlay(cue: Cue, clip: NarrationClip | undefined): boolean | Promise<boolean>;
  /** Resolve when finished; must stop promptly when `signal` aborts. */
  play(cue: Cue, clip: NarrationClip | undefined, signal: AbortSignal, onWord: (index: number) => void): Promise<void>;
  /** Optional warm-up (decode) for prefetch. */
  prefetch?(clip: NarrationClip): Promise<void>;
}

export interface NarratorOptions {
  /** URL of an audio-manifest.json; or pass `manifest` directly. Several can be merged with addManifest(). */
  manifestUrl?: string;
  manifest?: NarrationManifest;
  lang?: string;
  /** Use speechSynthesis when a clip is missing/broken (default true). */
  speechFallback?: boolean;
  /** Called when a line starts (cue) and when the queue drains (null). Drive subtitles from this. */
  onCue?: (cue: Cue | null) => void;
  /** Index into cue.words (or character index for speech) as the voice progresses. */
  onWord?: (index: number, cue: Cue) => void;
  /** Lower music while speaking (default true). */
  duckMusic?: boolean;
  /** Custom backend chain (default: [clip, speech?]). */
  backends?: NarrationBackend[];
  /** Wait for the start-gate tap before speaking (default true). Tests pass a resolved promise. */
  unlocked?: () => Promise<void>;
}

interface QueueItem {
  cue: Cue;
  clip: NarrationClip | undefined;
  resolve: (r: SayResult) => void;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]*$/i;

/** Plays clips through the kit audio engine on the "voice" bus. */
export class ClipBackend implements NarrationBackend {
  readonly name = 'clip';
  async canPlay(_cue: Cue, clip: NarrationClip | undefined): Promise<boolean> {
    if (!clip?.src || !getBus('voice')) return false;
    return (await decodeClip(clip.src)) !== null;
  }
  async prefetch(clip: NarrationClip): Promise<void> {
    await decodeClip(clip.src);
  }
  async play(cue: Cue, clip: NarrationClip | undefined, signal: AbortSignal, onWord: (i: number) => void): Promise<void> {
    if (!clip) return;
    const buffer = await decodeClip(clip.src);
    if (!buffer || signal.aborted) return;
    const voice: Voice | null = playBuffer(buffer, { bus: 'voice' });
    if (!voice) throw new Error('voice playback unavailable');
    const timers: ReturnType<typeof setTimeout>[] = [];
    (cue.words ?? []).forEach((w, i) => timers.push(setTimeout(() => onWord(i), w.t0)));
    const onAbort = () => voice.stop(0.05);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await voice.ended;
    } finally {
      timers.forEach(clearTimeout);
      signal.removeEventListener('abort', onAbort);
    }
  }
}

/** speechSynthesis fallback (zh-CN). Low quality on iPad; only for missing clips. */
export class SpeechBackend implements NarrationBackend {
  readonly name = 'speech';
  constructor(private readonly lang = 'zh-CN') {}
  canPlay(cue: Cue): boolean {
    return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' && cue.text.trim().length > 0;
  }
  play(cue: Cue, _clip: NarrationClip | undefined, signal: AbortSignal, onWord: (i: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(cue.text);
      u.lang = this.lang;
      u.rate = 0.95;
      const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith(this.lang));
      if (voice) u.voice = voice;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      u.onboundary = (e) => onWord(e.charIndex);
      // iOS sometimes never fires onend for long lines; cap at ~350 ms per character + 2 s.
      const guard = setTimeout(done, cue.text.length * 350 + 2000);
      signal.addEventListener('abort', () => {
        speechSynthesis.cancel();
        done();
      }, { once: true });
      speechSynthesis.speak(u);
    });
  }
}

export class Narrator {
  private manifest: NarrationManifest = {};
  private readonly loading: Promise<void>;
  private readonly backends: NarrationBackend[];
  private readonly queue: QueueItem[] = [];
  private current: { item: QueueItem; abort: AbortController } | null = null;
  private last: Cue | null = null;
  private pumping = false;

  constructor(private readonly opts: NarratorOptions = {}) {
    this.backends = opts.backends ?? [new ClipBackend(), ...(opts.speechFallback === false ? [] : [new SpeechBackend(opts.lang)])];
    if (opts.manifest) this.manifest = { ...opts.manifest };
    this.loading = opts.manifestUrl ? this.addManifest(opts.manifestUrl) : Promise.resolve();
  }

  /** Resolves when the manifest(s) given to the constructor are loaded (never rejects). */
  ready(): Promise<void> {
    return this.loading;
  }

  /** Merge another manifest (URL or object). Missing files only log a warning. */
  async addManifest(source: string | NarrationManifest): Promise<void> {
    if (typeof source !== 'string') {
      Object.assign(this.manifest, source);
      return;
    }
    try {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Object.assign(this.manifest, (await res.json()) as NarrationManifest);
    } catch (err) {
      console.warn(`[narration] manifest ${source} unavailable: ${(err as Error).message}`);
    }
  }

  has(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest, id);
  }

  /** The text of a line (for subtitles/buttons), or undefined. */
  text(id: string): string | undefined {
    return this.manifest[id]?.text;
  }

  get speaking(): boolean {
    return this.current !== null;
  }

  get lastCue(): Cue | null {
    return this.last;
  }

  /**
   * Queue a line. `idOrText` is a manifest id; anything that is not a known id is treated as
   * literal text (spoken by the fallback backend, always shown as subtitle).
   * `vars` fills {placeholders} in the subtitle text of templated lines.
   */
  say(idOrText: string, options: { interrupt?: boolean; vars?: Record<string, string | number> } = {}): Promise<SayResult> {
    const cue = this.resolveCue(idOrText, options.vars);
    if (!cue) return Promise.resolve('skipped');
    if (options.interrupt) this.stop();
    return new Promise<SayResult>((resolve) => {
      this.queue.push({ cue, clip: cue.id ? this.manifest[cue.id] : undefined, resolve });
      void this.pump();
    });
  }

  /** Stop the current line and drop everything queued. */
  stop(): void {
    for (const item of this.queue.splice(0)) item.resolve('interrupted');
    if (this.current) this.current.abort.abort();
  }

  /** 再听一遍: say the most recent line again, now. */
  replay(): Promise<SayResult> {
    const cue = this.last;
    if (!cue) return Promise.resolve('skipped');
    return this.say(cue.id ?? cue.text, { interrupt: true });
  }

  /** Decode clips ahead of time (e.g. the next page's lines). */
  async prefetch(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        const clip = this.manifest[id];
        if (!clip) return;
        for (const b of this.backends) if (b.prefetch) await b.prefetch(clip).catch(() => {});
      }),
    );
  }

  private resolveCue(idOrText: string, vars?: Record<string, string | number>): Cue | null {
    const fill = (t: string) => (vars ? t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : t);
    const clip = this.manifest[idOrText];
    if (clip) return { id: idOrText, text: fill(clip.text), words: clip.words, durationMs: clip.durationMs, source: 'clip' };
    if (ID_PATTERN.test(idOrText) && !/[㐀-鿿]/.test(idOrText)) {
      console.warn(`[narration] unknown line id "${idOrText}"`);
      return null;
    }
    return { id: null, text: fill(idOrText), source: 'text' };
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      await this.loading;
      await (this.opts.unlocked ?? whenAudioUnlocked)();
      while (this.queue.length) {
        const item = this.queue.shift()!;
        const abort = new AbortController();
        this.current = { item, abort };
        this.last = item.cue;
        const result = await this.playItem(item, abort.signal);
        this.current = null;
        item.resolve(result);
      }
    } finally {
      this.pumping = false;
      if (this.opts.duckMusic !== false) music.duck(false);
      this.opts.onCue?.(null);
    }
  }

  private async playItem(item: QueueItem, signal: AbortSignal): Promise<SayResult> {
    const { cue, clip } = item;
    for (const backend of this.backends) {
      if (signal.aborted) return 'interrupted';
      let ok = false;
      try {
        ok = await backend.canPlay(cue, clip);
      } catch {
        ok = false;
      }
      if (!ok) continue;
      const shown: Cue = { ...cue, source: backend.name === 'clip' ? 'clip' : 'speech' };
      this.opts.onCue?.(shown);
      if (this.opts.duckMusic !== false) music.duck(true);
      try {
        await backend.play(shown, clip, signal, (i) => this.opts.onWord?.(i, shown));
        return signal.aborted ? 'interrupted' : 'done';
      } catch {
        if (signal.aborted) return 'interrupted';
        // try the next backend
      }
    }
    // Nothing could voice it: show the text for a reading-speed moment so pacing stays sane.
    this.opts.onCue?.({ ...cue, source: 'text' });
    const ms = Math.min(6000, 600 + cue.text.length * 220);
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
    return signal.aborted ? 'interrupted' : 'done';
  }
}
