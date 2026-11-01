import type { Context, Played } from '../common';
import type { Question, Word } from '../../domain/types';
import type { Line } from '../lines';
export type SpellLevel = 'initial' | 'final' | 'tone' | 'full';
export interface PracticeView {
  readonly ctx: Context;
  readonly q: Question;
  readonly word: Word;
  index: number;
  locked: boolean;
  assisted: boolean;
  syllableIndex: number;
  fullParts: number;
  /** The scaffold level of the current F question; fixed for the whole question (a wrong tap must not change it). */
  spellLevel?: SpellLevel;
  /** Marks the very first F step of a question: the word is named once, before the first instruction. */
  wordNamed: boolean;
  sentence: string[];
  used: Set<number>;
  instruction: HTMLElement;
  stage: HTMLElement;
  actions: HTMLElement;
  stimulus(): Promise<Played>;
  remember(correct: boolean, confusion?: string, judge?: 'deterministic' | 'self'): void;
  answer(correct: boolean, choice?: string): void;
  lamps(): HTMLElement | null;
  record(): Promise<void>;
  follow(): void;
  draw(): void;
  advance(): void;
  spelling(): void;
  ordering(): void;
  /** F: remember the step line and (unless the question is still opening) name the picture and say it. */
  speakStep(line: Line): void;
  /** Show the instruction on screen and say it (screen text = voice = subtitle). */
  setInstruction(line: Line): void;
  /** Run audio steps one after the other; a newer sound (or another question) cancels the rest. */
  play(...steps: Array<() => Promise<unknown>>): void;
  /** Run `fn` after `ms` unless the child has moved on in the meantime. */
  later(ms: number, fn: () => void): void;
  /** First-use guide: point a hand at the right answer (no-op when the guide is off). */
  guide(target: Element | null | undefined): void;
  /** Flag a wrong tap: the key stays dimmed, so the ladder narrows down the choices. */
  markTried(el: HTMLElement): void;
  /** Set once the final step of an F question is visibly complete; used by the demonstration. */
  fillAll?: () => void;
  /** Leave the wrong try on screen for a moment, then show the real state again. */
  reveal(): void;
}
