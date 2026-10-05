/**
 * Companion robot (working name 领航员; the child picks the real name and colourway later).
 * The art is the 星港 design-system robot in ./art.ts: a parametric SVG body with a 15×9 LED
 * dot-matrix face generated in code (idle blinks, thinking glances, talking mouth frames, gentle
 * bob, antenna twinkle). This module is the stable kit entry point — games import from here:
 *
 *   import { mount, sayLine } from '@kit/companion';
 *   const bot = mount(document.querySelector('#bot')!, { size: 140, bubble: 'right', sfx: (n) => sfx.play(n) });
 *   bot.setMood('thinking');                                   // or the short aliases think / cheer / encourage
 *   await bot.say('先数一数有几个晶体。', { mood: 'encouraging' });   // bubble only (typewriter)
 *   await sayLine(bot, narrator, 'mars.hint.1');               // bubble + narrated clip, mouth moves while it plays
 *   bot.react('hop'); bot.lookAt(x, y); bot.hush(); bot.destroy();
 *
 * Options (all optional): size (px number or CSS length; height follows the art), variant 'full' |
 * 'head' (HUD / map marker), accent / led / shell colours and antenna 'star' | 'orb' (chapter-unlock
 * customisation hooks), bubble 'right' | 'left' | 'top' | 'auto', bubbleMax, mood, sfx(name) for the
 * robot's blips (names in public/audio/sfx/manifest.json: blip-happy, blip-think, blip-talk …), name.
 *
 * House rule (plan §3.0 / §4.4, enforced by tests/unit/companion.test.ts and the tone lint):
 * the companion never looks or sounds sad, never guilt-trips when the child stops or leaves.
 * There is deliberately no sad / crying / disappointed mood — unknown moods throw.
 */

import './companion.css';
import type { Narrator, SayResult } from '../narration';
import {
  mount as mountArt,
  normalizeMood,
  type Companion,
  type CompanionOptions,
  type Mood,
  type MoodAlias,
  type SayOptions,
} from './art';

export type { Companion, CompanionOptions, Mood, MoodAlias, SayOptions };
export { normalizeMood };

export const MOODS: readonly Mood[] = ['idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy'];

/** Mount the robot into `host`. Returns the controller (setMood / say / hush / react / lookAt / destroy). */
export function mount(host: HTMLElement, opts: CompanionOptions = {}): Companion {
  const bot = mountArt(host, opts);
  bot.el.classList.add('kit-companion');
  return bot;
}

/** @deprecated use `mount` (kept for early callers). */
export const mountCompanion = mount;

/**
 * Speak a narration line through the companion: the bubble shows the line's text, the narrator
 * plays the clip (or its fallback) while the LED mouth moves. Resolves with the narrator's result.
 */
export async function sayLine(
  companion: Companion,
  narrator: Narrator,
  id: string,
  opts: Omit<SayOptions, 'speak'> & { interrupt?: boolean; vars?: Record<string, string | number> } = {},
): Promise<SayResult> {
  let result: SayResult = 'skipped';
  let text = narrator.text(id) ?? id;
  if (opts.vars) text = text.replace(/\{(\w+)\}/g, (m, k: string) => (k in opts.vars! ? String(opts.vars![k]) : m));
  await companion.say(text, {
    ...opts,
    speak: async () => {
      result = await narrator.say(id, { interrupt: opts.interrupt, vars: opts.vars });
    },
  });
  return result;
}
