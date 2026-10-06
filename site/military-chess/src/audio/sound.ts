/** One entry point for every sound: kit design-system sounds (by name) and the synthesised mc.* ones. */
import { sfx } from '@kit/audio';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { prepareSynth, synth, type SynthName } from './synth';

/** design-system sounds this game uses (spec §7.1) */
export const MC_SFX = [
  'ui-tap', 'ui-press', 'ui-select', 'ui-back', 'ui-open', 'ui-close', 'ui-locked', 'ui-pop', 'ui-pop-big', 'ui-slide', 'ui-pick', 'ui-snap',
  'ui-confirm', 'ui-toggle-on', 'ui-toggle-off', 'place-piece', 'capture', 'flip', 'bump', 'shuffle', 'correct', 'correct-big', 'try-again',
  'hint', 'star-1', 'star-2', 'star-3', 'level-complete', 'chapter-complete', 'unlock', 'level-up', 'bell', 'jingle-win', 'jingle-round-over',
  'chime', 'whoosh-up', 'whoosh-down', 'blip-happy', 'blip-question', 'blip-surprised', 'blip-talk', 'blip-think', 'lock-in',
];

/** names of every sound played (debug hooks / tests; nothing audible depends on it) */
export const soundLog: string[] = [];

export async function loadSounds(): Promise<void> {
  prepareSynth();
  await installKitSfx({ only: MC_SFX });
}

export function play(name: string, opts: { volume?: number; rate?: number; step?: number } = {}): void {
  soundLog.push(name);
  if (soundLog.length > 300) soundLog.shift();
  if (name.startsWith('mc.')) synth(name as SynthName, opts.step ?? 0);
  else sfx.play(name, { volume: opts.volume, rate: opts.rate });
}
