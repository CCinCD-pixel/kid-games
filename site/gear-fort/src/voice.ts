// Narration (spec §7.3): content/gear-fort/lines.json is bundled, so every 墨子 / narrator line speaks (system zh-CN
// voice) with a subtitle before the voice step has produced clips; voice.json `clips: true` merges the generated
// manifest. 鲁班 has no voice yet (kit request K1): his lines are shown in his own bubble with a wooden "babble".
import { Narrator, type Cue, type NarrationManifest, type SayResult } from '@kit/narration';
import { LINES, VOICE } from './content';
import { lineText } from './theme/mozi';
import { duckMusic } from './audio/music';

export function textManifest(): NarrationManifest {
  const m: NarrationManifest = {};
  for (const [id, l] of Object.entries(LINES)) if (l.role !== 'luban') m[id] = { src: '', text: l.text, durationMs: 0, role: l.role };
  return m;
}

export interface Voice {
  narrator: Narrator;
  say(id: string, o?: { interrupt?: boolean; vars?: Record<string, string | number> }): Promise<SayResult>;
  text(id: string, vars?: Record<string, string | number>): string;
  isLuban(id: string): boolean;
  stop(): void;
  readonly log: string[];
}

export function createVoice(o: { onCue?: (cue: Cue | null) => void } = {}): Voice {
  const narrator = new Narrator({ manifest: textManifest(), onCue: o.onCue });
  if (VOICE.clips) void narrator.addManifest('/audio/gear-fort/audio-manifest.json');
  const log: string[] = [];
  return {
    narrator,
    say(id, so = {}) { log.push(id); if (log.length > 200) log.shift(); duckMusic(true); const p = narrator.say(id, { interrupt: so.interrupt, vars: so.vars }); void p.finally(() => duckMusic(false)); return p; },
    text: (id, vars) => lineText(id, vars),
    isLuban: (id) => LINES[id]?.role === 'luban',
    stop: () => narrator.stop(),
    log,
  };
}
