/** Shared app context handed to every screen. */
import type { LayoutInfo, Shell } from '@kit/shell';
import type { Voice } from '../audio/voice';
import type { LevelDef } from '../data';
import type { PuzzleClient } from '../hints/hintClient';
import type { MarkBuffer } from '../log';
import type { RandomSpec } from './random';
import type { SaveHandle } from './save';
import type { Visit } from './visit';

export type Route =
  | { name: 'map'; tab?: number | 'classic'; opened?: number; focus?: 'coming' | 'cert'; say?: string }
  | { name: 'play'; id: string; fresh?: boolean; newChapter?: number; def?: LevelDef }
  | { name: 'hangar'; back?: Route }
  | { name: 'opening' };

export interface Screen {
  readonly el: HTMLElement;
  layout(l: LayoutInfo): void;
  /** page hidden / shown */
  pause?(): void;
  resume?(): void;
  /** persist anything in progress (leaving the page) */
  persist?(): void;
  destroy(): void;
}

export interface AppCtx {
  app: HTMLElement;
  save: SaveHandle;
  voice: Voice;
  shell: Shell;
  marks: MarkBuffer;
  client: PuzzleClient;
  /** ?test=1: instant animations, no idle timers, test hooks */
  test: boolean;
  /** dev/test only (`?slowmo=N`): board animations N× slower for frame review; 1 otherwise */
  slowmo: number;
  /** board animations take no time (`?test=1`, unless `&anim=real` asks for real-time choreography) */
  instant: boolean;
  reduced: boolean;
  layout(): LayoutInfo;
  go(route: Route): void;
  /** refresh the hub card line */
  hub(): void;
  /** current screen (tests) */
  screen(): Screen | null;
  /** this visit (收尾卡, slow-down, random suggestions) */
  visit: Visit;
  /** a 跳级考试 run in progress: levels done in this go (cert-1, cert-2 back to back) */
  certRun: { levels: string[] } | null;
  /** 随机新仓库: warehouses that finished generating after the page timed out — the next order of that tier */
  randomSlot: Partial<Record<1 | 2 | 3, RandomSpec>>;
  /** tests: force the generation timeout (fallback pool) */
  forcePool?: boolean;
}
