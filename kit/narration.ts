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
 *
 * Big voice sets (a game with hundreds of lines): split the manifest into zones. The constructor's manifest is the
 * only thing `ready()` waits for, so the first line is never held back by sibling manifests; `addManifest(url)` loads
 * a shard in the background (deduplicated; a failed one can be retried) and a `say()` for an id that lives in a shard
 * that is still loading waits for it (max 4 s), in order, so lines never play out of sequence.
 *
 *   const narrator = new Narrator({ manifestUrl: '/audio/mars-base/core.json' });
 *   void narrator.addManifest('/audio/mars-base/numbers.json');       // no await
 *   narrator.say('mars.intro.1');                                       // plays as soon as core.json is in
 *   narrator.say('mars.num.17');                                        // waits for numbers.json only if needed
 *   await narrator.prefetch(ids, { decode: false });                    // warm the SW cache, hold no PCM in memory
 *   narrator.releaseLines(ids);                                         // drop decoded PCM of lines no longer needed
 */

import { decodeClip, getBus, music, playBuffer, prefetchClip, prefetchUrls, releaseClips, whenAudioUnlocked, type PrefetchOptions, type PrefetchResult, type Voice } from './audio';
import { narrationEnabled } from './settings';
import { AUTOMATION_MUTE } from './automute';

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
  /** Optional warm-up for prefetch. `decode: false` = fetch into the SW / HTTP cache only (hold no decoded audio). false = it failed. */
  prefetch?(clip: NarrationClip, opts?: { decode?: boolean }): Promise<void | boolean>;
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
  /**
   * Whether lines are voiced (default: the parent page's 旁白 setting, kit/settings). When false,
   * lines are shown as subtitles at reading pace; an explicit replay() still speaks.
   */
  voiced?: () => boolean;
}

interface QueueItem {
  cue: Cue;
  clip: NarrationClip | undefined;
  resolve: (r: SayResult) => void;
  /** speak even when narration is switched off (再听一遍) */
  force?: boolean;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]*$/i;
/** how long a say() for a not-yet-loaded shard line waits for the shard */
const SHARD_WAIT_MS = 4000;

/** Plays clips through the kit audio engine on the "voice" bus. */
export class ClipBackend implements NarrationBackend {
  readonly name = 'clip';
  async canPlay(_cue: Cue, clip: NarrationClip | undefined): Promise<boolean> {
    if (!clip?.src || !getBus('voice')) return false;
    return (await decodeClip(clip.src)) !== null;
  }
  async prefetch(clip: NarrationClip, opts: { decode?: boolean } = {}): Promise<boolean> {
    return opts.decode === false ? prefetchClip(clip.src) : (await decodeClip(clip.src)) !== null;
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
      if (AUTOMATION_MUTE) {
        // Browser automation (QA on the family Mac): never speak through the speakers; keep timing.
        clearTimeout(guard);
        setTimeout(done, Math.min(cue.text.length * 120, 4000));
        return;
      }
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
  /** shards (addManifest) still loading, by URL — also the in-flight dedupe */
  private readonly pending = new Map<string, Promise<boolean>>();
  private readonly loaded = new Set<string>();
  /** while a say() waits for a shard, later say()s queue behind it (keeps order) */
  private gate: Promise<void> | null = null;
  /** bumped by stop(): says that were waiting for a shard are dropped */
  private epoch = 0;

  constructor(private readonly opts: NarratorOptions = {}) {
    this.backends = opts.backends ?? [new ClipBackend(), ...(opts.speechFallback === false ? [] : [new SpeechBackend(opts.lang)])];
    if (opts.manifest) this.manifest = { ...opts.manifest };
    this.loading = opts.manifestUrl ? this.addManifest(opts.manifestUrl) : Promise.resolve();
  }

  /** Resolves when the manifest(s) given to the constructor are loaded (never rejects). */
  ready(): Promise<void> {
    return this.loading;
  }

  /**
   * Merge another manifest (URL or object). Never rejects. A URL that is already loaded or loading is not fetched
   * twice; a failed one is forgotten so calling again retries (check `isManifestLoaded(url)` for the outcome). Missing
   * files only log a warning. Do not await it for the first line — see the header comment.
   */
  addManifest(source: string | NarrationManifest): Promise<void> {
    if (typeof source !== 'string') {
      Object.assign(this.manifest, source);
      return Promise.resolve();
    }
    if (this.loaded.has(source)) return Promise.resolve();
    const inflight = this.pending.get(source);
    if (inflight) return inflight.then(() => undefined);
    const p = (async () => {
      try {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        Object.assign(this.manifest, (await res.json()) as NarrationManifest);
        this.loaded.add(source);
        return true;
      } catch (err) {
        console.warn(`[narration] manifest ${source} unavailable: ${(err as Error).message}`);
        return false;
      } finally {
        this.pending.delete(source);
      }
    })();
    this.pending.set(source, p);
    return p.then(() => undefined);
  }

  /** True once the manifest at this URL was fetched and merged. */
  isManifestLoaded(url: string): boolean {
    return this.loaded.has(url);
  }

  /** True while any addManifest() shard is still loading. */
  get loadingShards(): boolean {
    return this.pending.size > 0;
  }

  /** Every line id currently known (all merged manifests). */
  ids(): string[] {
    return Object.keys(this.manifest);
  }

  /** The clip URLs of these line ids (unknown ids and text-only lines are skipped). */
  clipUrls(ids: readonly string[]): string[] {
    const out: string[] = [];
    for (const id of ids) {
      const src = this.manifest[id]?.src;
      if (src) out.push(src);
    }
    return out;
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
  say(idOrText: string, options: { interrupt?: boolean; vars?: Record<string, string | number>; force?: boolean } = {}): Promise<SayResult> {
    // A line id that is not known yet while a shard is loading: wait for the shards (≤ 4 s), then say it — and keep
    // every later say() behind it so the order never changes.
    if (!this.gate && this.pending.size > 0 && !this.has(idOrText) && ID_PATTERN.test(idOrText) && !/[㐀-鿿]/.test(idOrText)) {
      const g: Promise<void> = Promise.race([Promise.allSettled([...this.pending.values()]), new Promise((r) => setTimeout(r, SHARD_WAIT_MS))]).then(() => {
        if (this.gate === g) this.gate = null;
      });
      this.gate = g;
    }
    if (this.gate) {
      const epoch = this.epoch;
      return this.gate.then(() => (epoch === this.epoch ? this.sayNow(idOrText, options) : 'interrupted'));
    }
    return this.sayNow(idOrText, options);
  }

  private sayNow(idOrText: string, options: { interrupt?: boolean; vars?: Record<string, string | number>; force?: boolean }): Promise<SayResult> {
    const cue = this.resolveCue(idOrText, options.vars);
    if (!cue) return Promise.resolve('skipped');
    if (options.interrupt) this.dropAll();
    return new Promise<SayResult>((resolve) => {
      this.queue.push({ cue, clip: cue.id ? this.manifest[cue.id] : undefined, resolve, force: options.force });
      void this.pump();
    });
  }

  /** Stop the current line and drop everything queued. */
  stop(): void {
    this.epoch += 1; // also cancels says still waiting for a shard
    this.dropAll();
  }

  private dropAll(): void {
    for (const item of this.queue.splice(0)) item.resolve('interrupted');
    if (this.current) this.current.abort.abort();
  }

  /** 再听一遍: say the most recent line again, now. */
  replay(): Promise<SayResult> {
    const cue = this.last;
    if (!cue) return Promise.resolve('skipped');
    return this.say(cue.id ?? cue.text, { interrupt: true, force: true });
  }

  /**
   * Warm clips ahead of time (e.g. the next page's lines). Default: decode them (instant playback, costs memory).
   * `{ decode: false }` only fetches them into the service-worker / HTTP cache, bounded to `concurrency` (default 3)
   * parallel requests — for a whole chapter, an "offline pack", or lines that may never play. Never rejects.
   */
  async prefetch(ids: string[], opts: { decode?: boolean; concurrency?: number; onProgress?: PrefetchOptions['onProgress'] } = {}): Promise<PrefetchResult> {
    if (opts.decode === false) {
      return prefetchUrls(this.clipUrls(ids), { decode: false, concurrency: opts.concurrency, onProgress: opts.onProgress });
    }
    const result: PrefetchResult = { ok: 0, failed: [] };
    await Promise.all(
      ids.map(async (id) => {
        const clip = this.manifest[id];
        if (!clip) return;
        let good = true;
        for (const b of this.backends) {
          if (!b.prefetch) continue;
          try {
            if ((await b.prefetch(clip, { decode: true })) === false) good = false;
          } catch {
            good = false;
          }
        }
        if (good) result.ok += 1;
        else result.failed.push(clip.src);
      }),
    );
    return result;
  }

  /** Drop the decoded audio of these lines (keeps the SW cache): call when leaving a chapter / zone. */
  releaseLines(ids: readonly string[]): void {
    releaseClips(this.clipUrls(ids));
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
    const voiced = item.force || (this.opts.voiced ?? narrationEnabled)();
    for (const backend of voiced ? this.backends : []) {
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
