export type Kind = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';
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
  /** Only a part of a word: it has no recording of its own (yet), so no listening / blending / tone question may use it. */
  wordOnly?: boolean;
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
/** Where a game station sits in the school exercise book (课本课次 / 页码). Station 2 also holds book lesson 9 (y w). */
export interface BookLesson {
  lesson: number;
  pages: number[];
  also?: number;
  /** The book pages for this station have not been photographed yet (station 13 = lesson 14). */
  pending?: boolean;
}
export interface ToneSeries {
  series: string;
  kind: 'final' | 'whole';
  lesson: number;
  ids: string[];
  /** Tones (1-4) that cannot be played honestly yet (no matching recording). */
  skip?: number[];
  /** Tones the school book itself does not have (zi 2, er 1 …); never filled in by a recording. */
  bookSkip?: number[];
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
  lessons: { id: number; title: string; unit: number; book?: BookLesson }[];
  /** 四声排排队: every vowel / whole-syllable series with the ids of its four tones (tone 1..4). */
  tone4?: ToneSeries[];
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
  /** 练读表 times per table (seconds), only ever shown back to the child; never a ranking. */
  drillBest?: Record<string, { best: number; last: number; at: number; box?: number; due?: number }>;
  /** 朗读册: how many times the child read a book page aloud and whether a parent stamped it (a mirror of the paper habit, device only). */
  book?: Record<string, { reads: number; signedAt?: number }>;
  /** 小规则 cards the child has seen or skipped (the first-time hint appears once). */
  rulesSeen?: Record<string, boolean>;
  /** When the last full programme was finished (for the “今天已完成” note on the home screen). */
  lastFinishAt?: number;
  settings: {
    /** The game station (1-13). */
    lesson: number;
    /** The book lesson the parent picked (several book lessons can share a station); see domain/book.ts. */
    book?: number;
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
