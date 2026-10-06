/**
 * Narration (spec §7.3): the bundled text manifest (lines.json) is the source of every line, so the
 * game speaks — with subtitles and the system zh-CN voice — before the voice step has produced any
 * clips. When content/sokoban/voice.json says `clips: true`, the generated audio manifest is merged
 * (same ids, real clips). Before that no /audio/sokoban/ request is ever made (a 404 would fail the
 * smoke test). Lines with the child's name have a `.plain` twin used when the parent page set
 * another display name.
 */
import { Narrator, type Cue, type NarrationManifest, type SayResult } from '@kit/narration';
import { DEFAULT_NAME, getSettings } from '@kit/settings';
import { LINES, VOICE, type Line } from '../data';

export function textManifest(lines: Line[]): NarrationManifest {
  const m: NarrationManifest = {};
  for (const l of lines) m[l.id] = { src: '', text: l.text, durationMs: 0, role: l.role };
  return m;
}

const ids = new Set(LINES.map((l) => l.id));

export interface Voice {
  narrator: Narrator;
  /** resolve `.plain` (display name ≠ 小步步) */
  resolve(id: string): string;
  text(id: string): string;
  say(id: string, o?: { interrupt?: boolean }): Promise<SayResult>;
  replay(): Promise<SayResult>;
  stop(): void;
  /** every line spoken (tests: the narration log) */
  readonly log: string[];
}

export function createVoice(o: { onCue?: (cue: Cue | null) => void; onWord?: (i: number, cue: Cue) => void; test?: boolean; clips?: boolean } = {}): Voice {
  const narrator = new Narrator({
    manifest: textManifest(LINES),
    onCue: o.onCue,
    onWord: o.onWord,
    ...(o.test ? { unlocked: () => Promise.resolve(), voiced: () => false, speechFallback: false } : {}),
  });
  // `clips` overrides content/sokoban/voice.json (unit tests cover both branches)
  if (o.clips ?? VOICE.clips) void narrator.addManifest('/audio/sokoban/audio-manifest.json');
  const log: string[] = [];
  const resolve = (id: string) => {
    const name = getSettings().displayName;
    return name !== DEFAULT_NAME && ids.has(`${id}.plain`) ? `${id}.plain` : id;
  };
  return {
    narrator,
    resolve,
    text: (id) => narrator.text(resolve(id)) ?? '',
    say(id, so = {}) {
      const rid = resolve(id);
      log.push(rid);
      return narrator.say(rid, { interrupt: so.interrupt });
    },
    replay: () => narrator.replay(),
    stop: () => narrator.stop(),
    log,
  };
}

/**
 * Say lines in order (the first one cuts whatever is playing). The chain ends as soon as a line
 * is cut ('interrupted': a modal closed → voice.stop(), or another line took over) or `alive()`
 * turns false — so a card's leftover lines can never be queued under the next card (QA r2).
 */
export async function sayChain(voice: Pick<Voice, 'say'>, ids: (string | null | undefined | false)[], alive: () => boolean = () => true): Promise<void> {
  let first = true;
  for (const id of ids) {
    if (!id) continue;
    if (!alive()) return;
    const r = await voice.say(id, { interrupt: first });
    first = false;
    if (r === 'interrupted') return;
  }
}
