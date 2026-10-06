/**
 * Menu music (spec §7.3): menu.m4a (A–B–A′, 126.7 s, tools/snake-battle/build_music.py) on the lobby, the
 * 挑战地图, 收藏馆, 纪录 and settings; faded out (600 ms) when a match starts. The kit music player loops it
 * on the music bus and ducks it under narration. The seam is designed into the file (bar 1 rises from near
 * silence, the last bar is a held fading chord) instead of the spec's two-<audio> crossfade — kit request:
 * `music.play` with a crossfade loop (§8.15).
 */
import { music } from '@kit/audio';
import menuUrl from '../assets/music/menu.m4a?url';

let playing = false;
export function menuMusic(on: boolean): void {
  if (on === playing) return;
  playing = on;
  if (on) music.play(menuUrl, { volume: 0.5, fadeMs: 600 });
  else music.stop(600);
}
