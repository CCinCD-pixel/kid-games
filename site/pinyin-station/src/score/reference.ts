/**
 * The model syllable's pitch contour, taken from the same licensed real-person recording the child hears when they
 * tap 再听示范. Decoded with the kit's cached decoder, analysed in the worker, cached per syllable for the session.
 */
import { decodeClip } from '@kit/audio';
import type { Contour } from './contour';
import type { LocalScorer } from './client';

let manifest: Promise<Record<string, { src: string }>> | null = null;
const cache = new Map<string, Promise<Contour | null>>();
/** True when the generated narration manifest already contains this line (new py.local.* clips arrive later). */
export async function hasNarration(id: string): Promise<boolean> {
  try {
    manifest ??= fetch('/audio/pinyin-station/audio-manifest.json').then((r) => r.json());
    return id in (await manifest);
  } catch {
    return false;
  }
}
export function modelContour(syllable: string, scorer: LocalScorer): Promise<Contour | null> {
  let hit = cache.get(syllable);
  if (!hit) {
    hit = (async () => {
      manifest ??= fetch('/audio/pinyin-station/audio-manifest.json').then((r) => r.json());
      const entry = (await manifest)[`py.syl.${syllable}`];
      if (!entry) return null;
      const buffer = await decodeClip(entry.src);
      if (!buffer) return null;
      return scorer.contour(buffer.getChannelData(0), buffer.sampleRate);
    })().catch(() => {
      cache.delete(syllable);
      return null;
    });
    cache.set(syllable, hit);
  }
  return hit;
}
