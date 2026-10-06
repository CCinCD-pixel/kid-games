/** Worker message protocol (page ↔ puzzle.worker). */
import type { GeneratedFail, GeneratedLevel } from '@engines/puzzle/src/generator';

export type WorkerRequest =
  | { type: 'load'; key: string; rows: string[]; ref?: string; maxStates: number; maxMs: number }
  | { type: 'togo'; req: number; key: string; player: number; boxes: number[] }
  | { type: 'rewind'; req: number; key: string; states: { player: number; boxes: number[] }[] }
  | { type: 'hint'; req: number; key: string; player: number; boxes: number[] }
  /** the next `n` pushes of an optimal line (H3 ghost demo) */
  | { type: 'line'; req: number; key: string; player: number; boxes: number[]; n: number }
  /** newest history state that lies on the reference line (hint fallback without a graph) */
  | { type: 'refRewind'; req: number; key: string; states: { player: number; boxes: number[] }[] }
  | { type: 'solve'; req: number; key: string; player: number; boxes: number[]; nodes?: number; ms?: number }
  /** 随机新仓库: generate one warehouse (counted budgets; the page adds the wall-clock timeout) */
  | { type: 'generate'; req: number; tier: 1 | 2 | 3 | 4; seed: number; avoid: number[]; colors: boolean };

export type HintReply = { rewind: true } | { slotCell: number; dir: number; kind: 'normal' | 'unlock' | 'park'; togo: number } | null;

export type WorkerReply =
  | { type: 'loaded'; key: string; ok: boolean; states: number; ms: number }
  | { type: 'togo'; req: number; togo: number }
  | { type: 'rewind'; req: number; index: number }
  | { type: 'hint'; req: number; answer: HintReply }
  | { type: 'line'; req: number; pushes: { from: number; dir: number }[] | null }
  | { type: 'refRewind'; req: number; index: number }
  | { type: 'solve'; req: number; pushes: { from: number; dir: number }[] | null }
  | { type: 'generate'; req: number; result: GeneratedLevel | GeneratedFail; ms: number }
  | { type: 'error'; req: number; message: string };
