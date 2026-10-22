export type Kind = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export interface Letter {
  id: string;
  kind: 'initial' | 'final' | 'whole';
  callSound: string;
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
}
export interface Confusion {
  pair: string[];
  type: string;
  minimalPairs: string[][];
  tip: string;
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
}
export type Judge = 'deterministic' | 'ai' | 'parent' | 'self';
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
  settings: {
    lesson: number;
    ai: boolean;
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
