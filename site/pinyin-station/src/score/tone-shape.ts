/**
 * ToneShapeScorer: the first plug-in behind the Scorer seam. Looks at the child's pitch contour only.
 *
 * Contract (the part that protects a 6-year-old): it says 'differs' ONLY when the evidence is clear, and then only
 * for a shape the target tone cannot plausibly be realised as. Everything else is 'unsure'. A clip that is too
 * short, too quiet, too noisy, clipped or unvoiced is always 'unsure', whatever its pitch happens to look like.
 */
import { buildContour, describeShape, posterior, scalePoints, SHAPE_TONE, TONE_SHAPE, type Shape } from './contour';
import { trackPitch } from './pitch';
import { resampleTo16k } from './resample';
import type { PartResult, ScoreInput, ScoreResult, Scorer, UnsureReason } from './types';
import { speakerReady, summarize } from './speaker';
import { analyzeClip } from './vad';

/**
 * Abstention (feasibility study): P(target tone) >= C says "match"; P(target tone) <= 1 - C AND the heard shape is a
 * clear alternative says "differs"; everything between is "unsure". Pairs that are genuinely hard for a pitch contour
 * (2nd vs 3rd, anything vs a dip) need P(heard shape) >= SUBTLE_C before they may be called "differs".
 */
export const C = 0.9;
export const SUBTLE_C = 0.95;
/** Voiced frames must be this periodic on average, or there is "no reliable pitch" (noise / reverb / whisper). */
export const MAX_MEAN_APERIODICITY = 0.35;
/** More than this many semitones from the child's usual pitch centre is more likely an octave slip than a tone. */
export const MAX_CENTRE_DRIFT_ST = 9;
/** For each target shape: heard shapes that may be reported as "differs", and whether the call is subtle. */
const DIFFERS: Record<Shape, Partial<Record<Shape, 'clear' | 'subtle'>>> = {
  level: { rising: 'clear', falling: 'clear', dipping: 'subtle' },
  rising: { falling: 'clear', level: 'clear', dipping: 'subtle' },
  // A half-third (low, falling) tone is a normal way to say tone 3, so 'falling' is never a "differs" for tone 3.
  dipping: { level: 'clear', rising: 'subtle' },
  falling: { level: 'clear', rising: 'clear', dipping: 'subtle' },
};

const unsure = (reason: UnsureReason, expected?: string, confidence = 0): PartResult => ({
  verdict: 'unsure',
  confidence,
  expected,
  reason,
});

export class ToneShapeScorer implements Scorer {
  readonly id = 'tone-shape';
  async score(input: ScoreInput): Promise<ScoreResult> {
    return this.scoreSync(input);
  }
  scoreSync(input: ScoreInput): ScoreResult {
    const started = performance.now();
    const pcm16 = resampleTo16k(input.pcm, input.sampleRate);
    const clip = analyzeClip(pcm16);
    const q = clip.quality;
    const result = (tone: PartResult, extra: Partial<ScoreResult['evidence']> = {}, features: Record<string, number | string> = {}): ScoreResult => ({
      verdict: tone.verdict,
      parts: { tone },
      confidence: tone.confidence,
      reason: tone.reason,
      evidence: { quality: q, features: { 'tone-shape': features }, ...extra },
      scorers: [this.id],
      elapsedMs: performance.now() - started,
    });
    const target = input.target.tone;
    const expectedShape = target >= 1 && target <= 4 ? TONE_SHAPE[target as 1 | 2 | 3 | 4] : undefined;
    if (!expectedShape) return result(unsure('not_applicable'));
    // Quality gate first: nothing below can turn a bad recording into a verdict.
    const gate: UnsureReason | null = !clip.heard || q.tooShort ? 'too_short' : q.tooQuiet ? 'too_quiet' : q.clipped ? 'clipped' : q.noisy ? 'too_noisy' : null;
    const track = clip.pcm.length ? trackPitch(clip.pcm, 16000) : null;
    const contour = track ? buildContour(track) : null;
    if (gate) {
      return result(
        unsure(gate, expectedShape),
        contour ? { contour: pickContour(contour) } : {},
      );
    }
    if (!contour) return result(unsure('no_voicing', expectedShape));
    // Per-speaker normalisation: without a ready profile (first ~8 recordings) tone is never judged.
    const known = input.speaker?.recent.length ?? 0;
    if (!speakerReady(input.speaker)) return result(unsure('warming_up', expectedShape), { contour: pickContour(contour) }, { speakerN: known });
    const speaker = summarize(input.speaker);
    const voicedAperiodicity = track!.aperiodicity.filter((_, i) => track!.f0[i] > 0);
    const meanAperiodicity = voicedAperiodicity.reduce((a, b) => a + b, 0) / Math.max(1, voicedAperiodicity.length);
    const drift = Math.abs(12 * Math.log2(contour.medianHz / speaker.medianHz));
    const d = describeShape({ points: scalePoints(contour.points, speaker.scale) });
    const p = posterior(d.scores);
    // Pitch needs a long enough, clean voiced stretch to have a shape at all (a whispered/creaky/noisy syllable fails here).
    const reliable = contour.voicedSeconds >= 0.12 && contour.continuity >= 0.6 && meanAperiodicity <= MAX_MEAN_APERIODICITY && drift <= MAX_CENTRE_DRIFT_ST;
    const features = {
      expected: expectedShape,
      heard: d.shape,
      pTarget: round(p[expectedShape]),
      pHeard: round(p[d.shape]),
      shapeScore: round(d.confidence),
      runnerUp: d.runnerUp,
      delta: round(d.features.delta),
      rangeSt: round(d.features.rangeSt),
      fallIn: round(d.features.fallIn),
      riseOut: round(d.features.riseOut),
      continuity: round(contour.continuity),
      meanAperiodicity: round(meanAperiodicity),
      medianHz: Math.round(contour.medianHz),
      driftSt: round(drift),
      speakerN: speaker.n,
      speakerScale: round(speaker.scale),
      speakerMedianHz: Math.round(speaker.medianHz),
    };
    const evidence = { contour: pickContour(contour), shape: d };
    if (!reliable) return result(unsure('no_voicing', expectedShape), evidence, features);
    const heardTone = String(SHAPE_TONE[d.shape]);
    // A noisy-ish room trims the evidence a little rather than flipping a verdict (hard cases are gated above).
    const noise = q.snrDb >= 15 ? 1 : 0.97;
    const pTarget = p[expectedShape] * noise;
    if (d.shape === expectedShape && pTarget >= C) return result({ verdict: 'match', confidence: pTarget, heard: d.shape, expected: expectedShape }, evidence, features);
    const kind = DIFFERS[expectedShape][d.shape];
    const need = kind === 'subtle' ? SUBTLE_C : C;
    if (kind && d.shape !== expectedShape && p[expectedShape] <= 1 - C && p[d.shape] * noise >= need)
      return result({ verdict: 'differs', confidence: p[d.shape] * noise, heard: d.shape, expected: expectedShape }, evidence, { ...features, heardTone });
    return result(unsure('low_confidence', expectedShape, Math.max(pTarget, p[d.shape] * noise)), evidence, features);
  }
}
const round = (x: number) => Math.round(x * 100) / 100;
const pickContour = (c: NonNullable<ReturnType<typeof buildContour>>) => ({
  points: c.points,
  curve: c.curve,
  medianHz: c.medianHz,
  rangeSt: c.rangeSt,
  continuity: c.continuity,
  voicedSeconds: c.voicedSeconds,
});
export { pickContour };
