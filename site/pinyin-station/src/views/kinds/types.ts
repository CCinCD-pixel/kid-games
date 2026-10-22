import type { Context } from '../common';
import type { Question, Word } from '../../domain/types';
export interface PracticeView {
  readonly ctx: Context;
  readonly q: Question;
  readonly word: Word;
  index: number;
  locked: boolean;
  assisted: boolean;
  syllableIndex: number;
  fullParts: number;
  sentence: string[];
  used: Set<number>;
  instruction: HTMLElement;
  stage: HTMLElement;
  actions: HTMLElement;
  stimulus(): Promise<void>;
  remember(correct: boolean, confusion?: string, judge?: 'deterministic' | 'self'): void;
  answer(correct: boolean, choice?: string): void;
  lamps(): HTMLElement;
  record(): Promise<void>;
  follow(): void;
  draw(): void;
  advance(): void;
  spelling(): void;
  ordering(): void;
}
