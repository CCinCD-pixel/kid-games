import { medialSplit } from './pinyin';
import type { Syllable, ToneSeries } from './types';

/**
 * "Same sound" keys. Several syllable ids play ONE recording file (the library has yē for both ie and ye, yīn for in and yin, ...).
 * Two such ids must never be two options of one question: hearing the sound and tapping the "other" one would be marked wrong.
 * The table is checked against the audio manifest (same src = same key) by castle-r5.test.ts, so it cannot drift.
 */
const ALIAS: Record<string, string> = {};
for (let tone = 1; tone <= 4; tone++) {
  for (const [from, to] of [['ie', 'ye'], ['ve', 'yue'], ['in', 'yin'], ['vn', 'yun'], ['ui', 'wei'], ['iu', 'you'], ['un', 'wen'], ['i', 'yi'], ['u', 'wu'], ['v', 'yu'], ['ing', 'ying']]) ALIAS[`${from}${tone}`] = `${to}${tone}`;
}
ALIAS.er1 = 'er2'; // the card's call sound is the real ér
ALIAS.ong1 = 'weng1';
export const soundKey = (id: string): string => ALIAS[id] ?? id;
export const sameSound = (a: string, b: string): boolean => soundKey(a) === soundKey(b);

/** z c s zh ch sh r + i are taught (and asked) as one whole-recognition syllable; they are never spelled out as "zh + ī". */
const WHOLE_INITIALS = new Set(['z', 'c', 's', 'zh', 'ch', 'sh', 'r']);
export const readsAsOne = (x: { initial: string; final: string }): boolean => WHOLE_INITIALS.has(x.initial) && x.final === 'i';

const medialOf = (final: string) => medialSplit(final)?.medial ?? '';
/** Same first sound and tone, a different last sound, same glide, and never the same recording or a whole-recognition syllable. */
export function blendRivals(target: Syllable, syllables: Syllable[]): Syllable[] {
  return syllables.filter(
    (x) =>
      x.id !== target.id &&
      x.initial === target.initial &&
      x.tone === target.tone &&
      x.final !== target.final &&
      !readsAsOne(x) &&
      !sameSound(x.id, target.id) &&
      medialOf(x.final) === medialOf(target.final),
  );
}
/** Tone series that play the same recordings as another one (ye = ie, yue = ve, yin = in, yun = vn, i = yi, u = wu) are listed once: the one with more playable tones, then the final. */
export function distinctSeries(series: ToneSeries[]): ToneSeries[] {
  const seen = new Set<string>();
  const first = (t: ToneSeries) => t.ids.find((_, n) => !(t.skip ?? []).includes(n + 1)) ?? t.ids[0];
  const playable = (t: ToneSeries) => t.ids.length - (t.skip?.length ?? 0);
  return [...series]
    .sort((a, b) => playable(b) - playable(a) || Number(a.kind === 'whole') - Number(b.kind === 'whole'))
    .filter((t) => {
      const key = soundKey(first(t));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => series.indexOf(a) - series.indexOf(b));
}
