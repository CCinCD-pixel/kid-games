import type { Contour, ShapeDescriptor } from './contour';
import type { SpeakerProfile } from './speaker';

export type Tone = 1 | 2 | 3 | 4 | 5;
export interface ScoreTarget {
  /** Syllable id such as "ma3" (neutral tone = 5 or 0). */
  syllable: string;
  initial: string;
  final: string;
  tone: Tone;
}
/** Competing readings the child is likely to produce instead, from the curriculum's confusion data. */
export interface ScoreConfusions {
  initials?: string[];
  finals?: string[];
  tones?: Tone[];
}
export interface ScoreInput {
  pcm: Float32Array;
  sampleRate: number;
  target: ScoreTarget;
  confusions: ScoreConfusions;
  /** The child's own pitch statistics (last ~20 recordings). Without a ready profile tone is always 'unsure'. */
  speaker?: SpeakerProfile;
}
export type Verdict = 'match' | 'unsure' | 'differs';
export type PartName = 'tone' | 'initial' | 'final';
export interface PartResult {
  verdict: Verdict;
  confidence: number;
  /** What the scorer thinks it heard for this part (e.g. a tone shape or tone number). */
  heard?: string;
  expected?: string;
  /** Why the part is unsure, if it is. */
  reason?: UnsureReason;
}
export type UnsureReason =
  | 'too_short'
  | 'too_quiet'
  | 'too_noisy'
  | 'clipped'
  | 'no_voicing'
  | 'low_confidence'
  | 'not_applicable'
  | 'scorer_error'
  /** Not enough of this child's recordings yet to know his pitch range. */
  | 'warming_up';
export interface ClipQuality {
  seconds: number;
  voicedSeconds: number;
  peak: number;
  speechDb: number;
  noiseDb: number;
  snrDb: number;
  clippedRatio: number;
  tooShort: boolean;
  tooQuiet: boolean;
  clipped: boolean;
  noisy: boolean;
  /** Any flag that makes a "differs" verdict unsafe. */
  unreliable: boolean;
}
export interface ScoreEvidence {
  quality: ClipQuality;
  contour?: Pick<Contour, 'points' | 'curve' | 'medianHz' | 'rangeSt' | 'continuity' | 'voicedSeconds'>;
  shape?: ShapeDescriptor;
  /** Free-form numeric features contributed by individual scorers, keyed by scorer id. */
  features: Record<string, Record<string, number | string>>;
}
export interface ScoreResult {
  verdict: Verdict;
  parts: Partial<Record<PartName, PartResult>>;
  /** 0..1. For 'match' and 'differs' how sure the scorers are; for 'unsure' how much evidence there was at all. */
  confidence: number;
  reason?: UnsureReason;
  evidence: ScoreEvidence;
  scorers: string[];
  /** Wall-clock milliseconds spent scoring (measured where scoring ran). */
  elapsedMs: number;
}
export interface Scorer {
  readonly id: string;
  score(input: ScoreInput): Promise<ScoreResult>;
}
