/**
 * Sound names (spec §7.1). The 62 kit sounds come from the design system (`installKitSfx`). The six
 * game sounds (sok-land, sok-lockchime, sok-unlatch, sok-rewind, sok-ignite, sok-conveyor) are
 * synthesised locally (tools/sokoban/audio/build_sfx.py → site/sokoban/assets/sfx/, Vite assets with
 * hashed names) and decoded with the kit sounds; while one is still decoding (or failed) a tuned kit
 * stand-in plays, so every cue always has a sound.
 */
import { sfx, type PlayOptions } from '@kit/audio';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import land from '../../assets/sfx/sok-land.m4a?url';
import lockchime from '../../assets/sfx/sok-lockchime.m4a?url';
import unlatch from '../../assets/sfx/sok-unlatch.m4a?url';
import rewind from '../../assets/sfx/sok-rewind.m4a?url';
import ignite from '../../assets/sfx/sok-ignite.m4a?url';
import conveyor from '../../assets/sfx/sok-conveyor.m4a?url';

/** the six game sounds (spec §7.1, built locally) */
export const GAME_SOUNDS: Record<string, string> = {
  'sok-land': land,
  'sok-lockchime': lockchime,
  'sok-unlatch': unlatch,
  'sok-rewind': rewind,
  'sok-ignite': ignite,
  'sok-conveyor': conveyor,
};

export const KIT_SOUNDS = [
  'step', 'push-crate', 'push-metal', 'lock-in', 'bump', 'try-again', 'ui-slide', 'ui-tick', 'hint', 'jingle-magic',
  'ui-select', 'ui-tap', 'ui-press', 'ui-locked', 'ui-toggle-on', 'ui-toggle-off', 'jump', 'chime', 'whoosh-down', 'whoosh-up',
  'launch', 'level-complete', 'star-1', 'star-2', 'star-3', 'chapter-complete', 'unlock', 'powerup', 'place-piece', 'ui-pop',
  'correct', 'ui-open', 'ui-close', 'ui-notify', 'ui-back', 'blip-happy', 'blip-think', 'blip-question', 'blip-surprised',
  'blip-talk', 'blip-sleepy', 'hit-soft', 'ui-pop-big',
] as const;

/** game sound → kit stand-in (name, volume ×, rate ×) until the stage-2 files land */
const STAND_IN: Record<string, [string, number, number]> = {
  'sok-land': ['hit-soft', 0.9, 0.85],
  'sok-lockchime': ['chime', 0.8, 2],
  'sok-unlatch': ['ui-tick', 1.2, 0.75],
  'sok-rewind': ['whoosh-down', 0.8, 1.35],
  'sok-ignite': ['launch', 1, 0.8],
  'sok-conveyor': ['ui-slide', 0.8, 0.7],
};

let installed: Promise<string[]> | null = null;

/** Decode the kit sounds and the game's own (before the start-gate tap is fine: decoding needs no unlock). */
export function loadSounds(): Promise<string[]> {
  installed ??= Promise.all([
    installKitSfx({ only: [...KIT_SOUNDS] }).catch(() => [] as string[]),
    sfx.loadAll(GAME_SOUNDS, 4).catch(() => Object.keys(GAME_SOUNDS)),
  ]).then(([a, b]) => [...a, ...b]);
  return installed;
}

export function playSfx(name: string, o: PlayOptions = {}): void {
  const alt = STAND_IN[name];
  if (alt && !sfx.has(name)) {
    sfx.play(alt[0], { ...o, volume: (o.volume ?? 1) * alt[1], rate: (o.rate ?? 1) * alt[2] });
    return;
  }
  sfx.play(name, o);
}
