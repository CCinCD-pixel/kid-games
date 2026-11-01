/** Shared types of the 火星基地 core (pure; no DOM). Spec: docs/specs/mars-base.md §3, §8.2, §8.5. */
import type { Rng } from '@kit/rng';

export type ZoneId = 'orbit' | 'cert' | 'vault' | 'factory' | 'balance' | 'puzzle';
export type CardId = 'C1' | 'C2' | 'C3';
/** Item-machine mode: `normal` = hint ladder + retries; the other three = one attempt, deferred feedback, no hints/demos. */
export type Mode = 'normal' | 'cert' | 'probe' | 'calib';
export type SlotKind = 'main' | 'warm' | 'cert' | 'probe' | 'twin' | 'check';
/** C = concrete (must build), P = pictorial, A = abstract (symbols). */
export type Rep = 'C' | 'P' | 'A';

export type Answer = number | string | readonly number[] | Readonly<Record<string, number | string | boolean | readonly (number | readonly number[])[]>>;
export type Response = Answer | null | undefined;

export const DIAG_CLASSES = [
  'noCarry', 'countOnInclusive', 'smallerFromLarger', 'digitReversal', 'pvConcat', 'zeroOmit', 'canonicalOnly', 'unitAsOne',
  'mulAsAdd', 'equalAsOperator', 'keywordOp', 'extraZero', 'offByOne', 'offByTen', 'offByStep', 'opReversed',
  'partialDistribute', 'cmpWrongDigit', 'logCompress', 'other',
] as const;
export type DiagClass = (typeof DIAG_CLASSES)[number];

export type StageKind =
  | 'numberline' | 'tray2' | 'tray3' | 'hundred' | 'counter' | 'dictation' | 'orderBelt' | 'pods' | 'array' | 'column' | 'bar'
  | 'balance' | 'pyramid' | 'share' | 'money' | 'clock' | 'timeline';
export type AnswerKind =
  | 'int' | 'int2' | 'compare2' | 'place' | 'read' | 'build' | 'multi' | 'order' | 'open' | 'choose' | 'steps' | 'findError' | 'clockSet';

/** Per-family static record (content/mars-base/families.json). */
export interface FamilyMeta {
  id: string; tag: string | null; bands: number; answer: AnswerKind; stage: StageKind; choice?: boolean; factSpace?: boolean;
  diag: DiagClass[]; retryMode?: 'normal' | 'none'; buildable?: boolean; hint1?: string; typedMax?: number; answerModes?: string[];
  l6?: string; guessP?: number; note?: string;
}

/** Node-item knobs from nodes.json (only the ones a generator reads). */
export interface Knobs {
  L?: number; anchors?: string; near?: { min: number; max: number }; variant?: string; exclude?: string[]; tol?: number;
  n?: number[]; mode?: string; total?: number; rule?: string; panel?: string; rep?: string;
}
export interface GenCtx { band: number; level: number; rep: Rep; ask?: string; knobs: Knobs; l6?: boolean; force?: { target?: number; planet?: string } }

export interface Features { size: number; carry: boolean; cross: boolean; zero: boolean; loose?: number }
export interface Verdict {
  ok: boolean; grade: 'exact' | 'close' | 'far' | 'wrong' | 'empty'; diag: DiagClass | null; confidence: 'high' | 'low'; empty: boolean;
}
export interface Prompt { big: string; small?: string }

/** A demo script step (data; each stage executes it). `shown` lists every number the frame displays (V3 checks the last frame). */
export type DemoStep = { op: string; args?: Record<string, unknown>; shown?: number[]; ms?: number } | { say: string } | { wait: number };

export interface FamilyImpl<P = any> {
  gen(rng: Rng, c: GenCtx): { params: P; answer: Answer };
  features(p: P, ask?: string): Features;
  bug?(p: P, cls: DiagClass, ask?: string): Answer | null;
  prompt(p: P, ask?: string): Prompt;
  /** open.* only: does this response satisfy the free-order rule? */
  open?(p: P, r: Response): boolean;
  /** families with several valid ask phrasings (distinct phrasings of the same fact are NOT distinct facts) */
  asks?: string[];
}
export type FamilyDef<P = any> = FamilyMeta & FamilyImpl<P> & { oracle(p: P, ask?: string): Answer };

export interface Item {
  key: string; fam: string; tag: string | null; band: number; level: number; rep: Rep; mode: Mode; ask?: string;
  params: unknown; seed: number; slot?: SlotKind; node?: string; typed?: boolean; buildFirst?: boolean; checkRole?: 'O' | 'F' | 'R' | 'X' | 'C';
  /** cert items: the card + which of the 4/6 */ card?: CardId; certIdx?: number; probeIdx?: number;
}
export interface ItemResult {
  keyHash: string; fam: string; tag: string | null; level: number; firstTry: boolean; misses: number; hint: number;
  diag?: DiagClass; assisted?: boolean; slot: SlotKind; at: number; node: string; ok?: boolean; ops?: number; ms?: number;
}

export interface NodeItemDef extends Knobs { fam: string; count: number; band?: number; ask?: string }
export interface NodeDef {
  id: string; zone: string; chapter: string; kind: 'normal' | 'boss' | 'breather' | 'calib'; title: string; teaches: string;
  newElement?: string; items: NodeItemDef[]; di: number; expectedFirstTry?: number; buildingPart?: { id: string; name: string };
  blank?: boolean; strat100_300?: boolean; orderStrip?: boolean; parts?: string[]; fixedMapping?: string[]; explain?: number[];
  interleave?: unknown; chapterV1?: string; bandCap?: number;
}
