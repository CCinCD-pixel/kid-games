// Narration (spec §7.3): content/gear-fort/lines.json is bundled, so every 墨子 / narrator line speaks (system zh-CN
// voice) with a subtitle before the voice step has produced clips; voice.json `clips: true` merges the generated
// manifest. 鲁班 has his OWN voice (role luban = Qwen3 Dylan, content/gear-fort/narration.luban.yaml, docs/VOICE.md):
// his lines are NOT in the text manifest, so they only ever speak from his generated clips — never through the
// system voice or another character's voice. Until the clip manifest has loaded (or if a clip is missing) his bubble
// types out with the wooden "babble" instead, and turning-point lines fall back to the narrator's 「鲁班说：……」.
import { Narrator, type Cue, type NarrationManifest, type SayResult } from '@kit/narration';
import { releaseClips } from '@kit/audio';
import { LINES, VOICE } from './content';
import { lineText } from './theme/mozi';
import { duckMusic } from './audio/music';
import { WORDS, wordId } from './pointread';

export function textManifest(): NarrationManifest {
  const m: NarrationManifest = {};
  for (const [id, l] of Object.entries(LINES)) if (l.role !== 'luban') m[id] = { src: '', text: l.text, durationMs: 0, role: l.role };
  for (const w of WORDS) m[wordId(w)] ??= { src: '', text: w, durationMs: 0, role: 'word' }; // 点读 (clips merge over these)
  return m;
}

export interface Voice {
  narrator: Narrator;
  say(id: string, o?: { interrupt?: boolean; vars?: Record<string, string | number> }): Promise<SayResult>;
  text(id: string, vars?: Record<string, string | number>): string;
  isLuban(id: string): boolean;
  /** a generated clip exists for this line (for 鲁班: he can speak it in his own voice) */
  hasClip(id: string): boolean;
  /** the clip's length in ms (0 when there is none) — paces 鲁班's typewriter to his voice */
  clipMs(id: string): number;
  stop(): void;
  readonly log: string[];
  /** decoded narration kept for repeats (count, total ms) — bounded by KEEP_MS */
  retained(): { n: number; ms: number };
}

/** Decoded narration kept in memory (spec §8.6: audio buffers ≤6 MB). Mono 48 kHz float32 ≈ 192 KB per second, so
 *  ~20 s of the most recent speech ≈ 3.8 MB stays decoded (再听一遍 / repeats stay instant); everything older is
 *  released from the kit's clip cache. Without this every played line stayed decoded for the page's lifetime. */
export const KEEP_MS = 20000;

/** LRU of decoded clip srcs bounded by total duration. touch() returns the srcs to release. Exported for tests. */
export function clipLru(keepMs = KEEP_MS) {
  const live = new Map<string, number>(); // src → durationMs, oldest first
  let total = 0;
  return {
    touch(src: string, ms: number): string[] {
      if (live.has(src)) { total -= live.get(src)!; live.delete(src); }
      live.set(src, ms || 3000); total += ms || 3000;
      const out: string[] = [];
      for (const [k, v] of live) { if (total <= keepMs || live.size <= 1) break; live.delete(k); total -= v; out.push(k); }
      return out;
    },
    has: (src: string) => live.has(src),
    get size() { return live.size; },
    get totalMs() { return total; },
  };
}

export function createVoice(o: { onCue?: (cue: Cue | null) => void } = {}): Voice {
  // kit request: Narrator has no public clip getter (only has/text); read its merged manifest for src / durationMs
  const clip = (id: string) => (narrator as unknown as { manifest: NarrationManifest }).manifest?.[id];
  const lru = clipLru();
  const onCue = (cue: Cue | null): void => {
    const c = cue?.id ? clip(cue.id) : undefined;
    if (c?.src) {
      lru.touch(c.src, c.durationMs);
      // release every other narration clip that is decoded but outside the window (also clips decoded by canPlay
      // for a line that was then interrupted before it started)
      const all = (narrator as unknown as { manifest: NarrationManifest }).manifest ?? {};
      const drop: string[] = [];
      for (const m of Object.values(all)) if (m.src && !lru.has(m.src)) drop.push(m.src);
      releaseClips(drop);
    }
    o.onCue?.(cue);
  };
  const narrator = new Narrator({ manifest: textManifest(), onCue });
  if (VOICE.clips) void narrator.addManifest('/audio/gear-fort/audio-manifest.json');
  const log: string[] = [];
  return {
    narrator,
    say(id, so = {}) { log.push(id); if (log.length > 200) log.shift(); duckMusic(true); const p = narrator.say(id, { interrupt: so.interrupt, vars: so.vars }); void p.finally(() => duckMusic(false)); return p; },
    text: (id, vars) => lineText(id, vars),
    isLuban: (id) => LINES[id]?.role === 'luban',
    hasClip: (id) => !!clip(id)?.src,
    clipMs: (id) => clip(id)?.durationMs || 0,
    stop: () => narrator.stop(),
    log,
    retained: () => ({ n: lru.size, ms: lru.totalMs }),
  };
}
