/**
 * Menu music "星港夜班" (spec §7.2): menus and celebrations only — S1 opening, S2 map, S8 order board,
 * S9 hangar, S10 wrap-up, S11 finale; stopped (400 ms) when a level or a quiz starts. The kit music
 * player loops it on the music bus (ducked under narration by the kit). The file is a Vite asset
 * (hashed name); tools/sokoban/audio/build_music.py makes it.
 */
import { music } from '@kit/audio';
import nightShift from '../../assets/music/night-shift.m4a?url';

export const MUSIC_URL = nightShift;

export function playMusic(): void {
  music.play(MUSIC_URL, { volume: 0.45, fadeMs: 800 });
}

export function stopMusic(): void {
  music.stop(400);
}
