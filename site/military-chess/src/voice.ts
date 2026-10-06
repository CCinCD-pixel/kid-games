/**
 * Narration: kit Narrator fed with every line's text up front (so subtitles + the system-voice
 * fallback work before the voice pipeline has made any audio), then merged with the generated
 * manifest once the voice step has produced it (content/military-chess/voice.json). Subtitles never use the kit subtitle bar (spec §2.1): each screen
 * registers a caption target (the companion's caption strip / bubble).
 */
import { Narrator, type NarrationManifest, type SayResult } from '@kit/narration';
import { DEFAULT_NAME, getSettings } from '@kit/settings';
import { LINES, LINE_TEXT, VOICE } from './content';
import { duckAmbience } from './audio/ambience';

export interface CaptionTarget {
  show(text: string, id: string | null): void;
  word(index: number): void;
  /** the line finished (target decides how long to keep it) */
  done(): void;
}

export class Voice {
  readonly narrator: Narrator;
  private target: CaptionTarget | null = null;
  private override: string | null = null;
  /** ids said (debug hooks / tests) */
  readonly said: string[] = [];

  /** ?test=1&fast=1: lines resolve after a few ms (captions still show) so browser tests run quickly */
  private fast: boolean;

  constructor(o: { test?: boolean; fast?: boolean } = {}) {
    this.fast = !!(o.test && o.fast);
    const manifest: NarrationManifest = {};
    for (const l of LINES) manifest[l.id] = { src: '', text: l.text } as NarrationManifest[string];
    this.narrator = new Narrator({
      manifest,
      onCue: (cue) => {
        duckAmbience(!!cue);
        if (!this.target) return;
        if (cue) this.target.show(this.override ?? cue.text, cue.id);
        else this.target.done();
      },
      onWord: (i) => this.target?.word(i),
      ...(o.test ? { unlocked: () => Promise.resolve(), voiced: () => false, speechFallback: false } : {}),
    });
    // clips exist only after the voice step (content/military-chess/voice.json → clips: true);
    // before that no /audio/military-chess/ request is made (a 404 would fail the smoke test)
    if (VOICE.clips) void this.narrator.addManifest('/audio/military-chess/audio-manifest.json');
  }

  setTarget(t: CaptionTarget | null): void {
    this.target = t;
  }

  text(id: string): string {
    return LINE_TEXT[id] ?? id;
  }

  /** say a line; lines with the child's name use their `.plain` variant when the name was changed */
  say(id: string, opts: { interrupt?: boolean } = {}): Promise<SayResult> {
    this.said.push(id);
    if (this.said.length > 200) this.said.shift();
    const name = getSettings().displayName;
    let sayId = id;
    this.override = null;
    if (name !== DEFAULT_NAME && LINE_TEXT[id + '.plain'] && LINE_TEXT[id]?.includes(DEFAULT_NAME)) {
      sayId = id + '.plain';
      this.override = LINE_TEXT[id].split(DEFAULT_NAME).join(name);
    }
    if (this.fast) {
      this.target?.show(this.override ?? LINE_TEXT[sayId] ?? sayId, sayId);
      return new Promise((res) => setTimeout(() => {
        this.target?.done();
        res('done');
      }, 40));
    }
    return this.narrator.say(sayId, { interrupt: opts.interrupt ?? true });
  }

  replay(): void {
    void this.narrator.replay();
  }

  stop(): void {
    this.narrator.stop();
  }
}
