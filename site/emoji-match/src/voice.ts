/**
 * Narration (spec §7.4): content/emoji-match/lines.json is bundled, so every line speaks (system
 * zh-CN voice) with a subtitle before the voice step has produced clips. When voice.json says
 * `clips: true` (the shipped state since the voice step), the generated audio manifest is merged (same ids). With clips:false no
 * /audio/emoji-match/ request is made (a 404 would fail the smoke test).
 */
import { Narrator, type Cue, type NarrationManifest, type SayResult } from '@kit/narration';
import { LINES, VOICE } from './content';

export function textManifest(): NarrationManifest {
  const m: NarrationManifest = {};
  for (const l of LINES) m[l.id] = { src: '', text: l.text, durationMs: 0, role: l.role };
  return m;
}

export interface Voice {
  narrator: Narrator;
  say(id: string, o?: { interrupt?: boolean }): Promise<SayResult>;
  text(id: string): string;
  stop(): void;
  readonly log: string[];
}

export function createVoice(o: { onCue?: (cue: Cue | null) => void; onWord?: (i: number, cue: Cue) => void; test?: boolean } = {}): Voice {
  const narrator = new Narrator({
    manifest: textManifest(),
    onCue: o.onCue,
    onWord: o.onWord,
    ...(o.test ? { unlocked: () => Promise.resolve(), voiced: () => false, speechFallback: false } : {}),
  });
  if (VOICE.clips) void narrator.addManifest('/audio/emoji-match/audio-manifest.json');
  const log: string[] = [];
  return {
    narrator,
    say(id, so = {}) { log.push(id); return narrator.say(id, { interrupt: so.interrupt }); },
    text: (id) => narrator.text(id) ?? '',
    stop: () => narrator.stop(),
    log,
  };
}
