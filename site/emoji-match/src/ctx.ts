/** Shared app context handed to every screen. */
import type { LayoutInfo, Shell } from '@kit/shell';
import type { SaveHandle } from './save';
import type { Voice } from './voice';

export type ScreenReq =
  | { s: 'route' }
  | { s: 'map'; ep: number }
  | { s: 'card'; id: string; back?: 'map' | 'route' }
  | { s: 'play'; id: string; resume?: boolean; first?: boolean }
  | { s: 'puzzle'; id: string }
  | { s: 'free' }
  | { s: 'hangar'; tab?: 'cards' | 'sky' | 'badges' | 'tools' }
  | { s: 'arrival'; ep: number }
  | { s: 'style' };

export interface SubBar { el: HTMLElement; onCue: (c: never) => void; hide(): void }

export interface AppCtx {
  root: HTMLElement;
  save: SaveHandle;
  voice: Voice;
  sub: { el: HTMLElement; hide(): void };
  shell: Shell | null;
  layout(): LayoutInfo;
  go(req: ScreenReq): void;
  mark(name: string, data?: Record<string, unknown>): void;
  test: boolean;
  /** animation speed multiplier (test hook) */
  timeScale: number;
  /** seed override for the next attempt (test hook) */
  forceSeed: number | null;
  forceAssist: number | null;
  lessFx(): boolean;
  /** subtitle lane: move the kit subtitle bar into `lane` (null = default dock) */
  dockSub(lane: HTMLElement | null): void;
  /** current play screen (test hook) */
  play: unknown;
  /** episodes open in this build (v1: 4) */
  playableEpisodes: number;
  /** active main-line play time this session (ms; spec §5.7 15-minute stop bubble) */
  playMs: number;
  /** the 15-minute bubble has been shown this session */
  breakShown: boolean;
  /** last process-praise line (never the same twice in a row, spec §7.4) */
  lastPraise: string | null;
  /** route music on/off follows save.settings.music (menus only, spec §7.3) */
  music(on: boolean): void;
  /** measured width of the kit's 🏠 返回 pill (px; undefined before the shell mounts it) */
  homeW?: number;
}
