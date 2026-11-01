export type Kind = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export interface Letter {
  id: string;
  kind: 'initial' | 'final' | 'whole';
  callSound: string;
  /** How the call sound is written when it differs from the id of the clip (er: the real recording is ér, the clip id is er1). */
  callDisplay?: string;
  mnemonic: string;
  lesson: number;
  grid: string;
}
export interface Syllable {
  id: string;
  display: string;
  initial: string;
  final: string;
  tone: number;
  lesson: number;
  audio: string;
}
export interface Word {
  id: string;
  hanzi: string;
  syllables: string[];
  display: string;
  picture: string;
  kind: 'noun' | 'action' | 'phrase' | 'sentence' | 'cloze';
  lesson: number;
  beyond?: boolean;
  source: string;
  chunks?: string[];
  frame?: string[];
  custom?: boolean;
  semanticGroup?: string;
  /**
   * Hold-out: the picture is hard to read, so the word is not asked (nor used as a wrong choice) until it is redrawn.
   * The text says why; delete the field once the new picture is in. Kept in the bank for the parent review page.
   */
  hold?: string;
}
export interface Confusion {
  pair: string[];
  type: string;
  minimalPairs: string[][];
  tip: string;
  /** Which of the two letters the tip points at ("右边这个"): the screen highlights it while the tip is said. */
  focus?: 'left' | 'right' | 'both';
}
export interface Scene {
  id: string;
  title: string;
  prompt: string;
  lesson: number;
  targets: string[];
}
export interface Bank {
  scenes?: Scene[];
  letters: Letter[];
  syllables: Syllable[];
  words: Word[];
  confusions: Confusion[];
  lessons: { id: number; title: string; unit: number }[];
  praise: string[];
  /**
   * Pictures that more than one word shares (兔/大兔/兔子 …). The first listed word whose lesson is open is the
   * only one an exercise may use for that picture; every other word of the picture is an alias (kept for the
   * parent review and old progress, never asked).
   */
  pictureOwners?: Record<string, string[]>;
}
/** 'local' = the on-device scorer (score/). Like 'ai' it never counts toward mastery until calibrated. */
export type Judge = 'deterministic' | 'ai' | 'local' | 'parent' | 'self';
export interface Attempt {
  id: string;
  skill: string;
  kind: Kind;
  correct: boolean;
  judge: Judge;
  session: number;
  confusion?: string;
  at?: number;
  assisted?: boolean;
}
export interface Atom {
  box: number;
  due: number;
  successes: number[];
  kinds: Kind[];
  needsReview: boolean;
  byKind?: Partial<Record<Kind, number[]>>;
}
export interface Save {
  sessions: number;
  lastAttemptAt?: number;
  dates: number[];
  atoms: Record<string, Atom>;
  history: Attempt[];
  snapshot?: {
    through: number;
    atoms: Record<string, Atom>;
    confusions: Record<string, number>;
    seen: Record<string, number>;
  };
  confusions: Record<string, number>;
  customWords: Word[];
  /** Kinds whose first-time guide (a pointing hand on the right answer) has been played. */
  tutorial?: Partial<Record<Kind, boolean>>;
  /** The programme the child left half way (lock screen, 回电台, opened the album…) so it can be picked up again. */
  resume?: ResumeState;
  /** When the last full programme was finished (for the “今天已完成” note on the home screen). */
  lastFinishAt?: number;
  settings: {
    lesson: number;
    ai: boolean;
    /** On-device tone-contour feedback (trial). Absent = off. */
    localScore?: boolean;
    /** Keep each (heard) recording in the local library for parent review and calibration. Absent = on, as before. */
    keepRecordings?: boolean;
    strictness: 'gentle' | 'balanced' | 'precise';
    scaffold: 'initial' | 'final' | 'tone' | 'full';
  };
}
export interface Question {
  id: string;
  kind: Kind;
  target: string;
  skill: string;
  lesson: number;
  phase: 'warmup' | 'main';
  scene?: string;
  practiceOnly?: boolean;
  choices: string[];
}
export interface ResumeState {
  mode: string;
  queue: Question[];
  index: number;
  at: number;
}
