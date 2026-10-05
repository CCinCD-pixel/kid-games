/**
 * kit/ui/sfx-bridge.ts — route the UI kit's semantic sounds (ui-tap, star-1, try-again …) through
 * the repo's ONE audio engine (kit/audio.ts) instead of the design system's standalone ui/sfx.ts.
 * Files: public/audio/sfx/<name>.m4a + manifest.json (sources and licences recorded per sound).
 *
 *   import { installKitSfx, chime } from '@kit/ui/sfx-bridge';
 *   await installKitSfx();                       // all 62, or installKitSfx({ only: ['ui-tap','eat','chime'] })
 *   chime(combo);                                // pentatonic ladder: C D E G A C' … (snake eat, match chain)
 *
 * The m4a files are loudness-normalised per category (see sfx/manifest.json), so volume = 1 is
 * already balanced; sounds play on the 'sfx' bus (ducked under narration by kit/audio).
 */
import { sfx } from '../audio';
import { setSfx } from './xg';

interface Manifest { sounds: Record<string, { file: string; category: string; duration: number }> }

/** where the 62 kit sounds live (public/audio/sfx/, cached by the service worker's media cache) */
export const SFX_BASE = '/audio/sfx/';

let manifest: Manifest | null = null;

export async function installKitSfx(o: { base?: string; only?: string[]; maxVoices?: number } = {}): Promise<string[]> {
  const base = (o.base ?? SFX_BASE).replace(/\/?$/, '/');
  manifest ??= (await (await fetch(`${base}manifest.json`)).json()) as Manifest;
  const names = (o.only ?? Object.keys(manifest.sounds)).filter((n) => manifest!.sounds[n]);
  const map = Object.fromEntries(names.map((n) => [n, base + manifest!.sounds[n].file]));
  setSfx((name, p) => {
    sfx.play(name, { volume: p?.gain ?? 1, rate: Math.pow(2, (p?.semitones ?? 0) / 12) });
  });
  return sfx.loadAll(map, o.maxVoices ?? 4);
}

const PENT = [0, 2, 4, 7, 9];
/** n-th step of the major pentatonic scale in semitones (0 → 0, 5 → 12 …) */
export const pentatonic = (step: number) => Math.floor(step / 5) * 12 + PENT[((step % 5) + 5) % 5];
/** combo ladder with one sample: chime(0), chime(1) … climbs C D E G A C' (capped at 2 octaves) */
export function chime(step: number, name = 'chime'): void {
  sfx.play(name, { rate: Math.pow(2, pentatonic(Math.min(step, 10)) / 12) });
}
