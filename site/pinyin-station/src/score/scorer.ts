/**
 * The scoring seam. A Scorer takes a 16 kHz-or-any-rate clip plus the target syllable and returns a ScoreResult.
 * Scorers are registered by id; later plug-ins (spectral initial/final classifier, a local ASR model) register the
 * same way and their per-part verdicts are merged by combineResults(). Nothing in here touches the DOM, the network
 * or the Tencent client, so the same code runs in a Web Worker, on the main thread and in Node tests.
 */
import type { ClipQuality, PartName, PartResult, ScoreInput, ScoreResult, Scorer, UnsureReason, Verdict } from './types';

export type { Scorer, ScoreInput, ScoreResult } from './types';

const registry = new Map<string, Scorer>();
export function registerScorer(scorer: Scorer): void {
  registry.set(scorer.id, scorer);
}
export function unregisterScorer(id: string): void {
  registry.delete(id);
}
export function registeredScorers(): string[] {
  return [...registry.keys()];
}
export function clearScorers(): void {
  registry.clear();
}

const BLANK_QUALITY: ClipQuality = {
  seconds: 0,
  voicedSeconds: 0,
  peak: 0,
  speechDb: -120,
  noiseDb: -120,
  snrDb: 0,
  clippedRatio: 0,
  tooShort: true,
  tooQuiet: true,
  clipped: false,
  noisy: false,
  unreliable: true,
};
export function unsureResult(reason: UnsureReason, scorers: string[] = [], elapsedMs = 0): ScoreResult {
  return { verdict: 'unsure', parts: {}, confidence: 0, reason, evidence: { quality: BLANK_QUALITY, features: {} }, scorers, elapsedMs };
}

/** Merge per-scorer results. One decisive "differs" wins; "match" needs every judged part to match. */
export function combineResults(results: ScoreResult[], elapsedMs: number): ScoreResult {
  if (!results.length) return unsureResult('not_applicable', [], elapsedMs);
  const parts: Partial<Record<PartName, PartResult>> = {};
  for (const r of results)
    for (const [name, part] of Object.entries(r.parts) as [PartName, PartResult][]) {
      const old = parts[name];
      // Keep the more decisive of two scorers' opinions on the same part; a conflict collapses to unsure.
      if (!old) parts[name] = part;
      else if (old.verdict !== part.verdict && old.verdict !== 'unsure' && part.verdict !== 'unsure')
        parts[name] = { verdict: 'unsure', confidence: 0, reason: 'low_confidence', expected: old.expected };
      else if (old.verdict === 'unsure' && part.verdict !== 'unsure') parts[name] = part;
    }
  const list = Object.values(parts);
  const judged = list.filter((p) => p.verdict !== 'unsure');
  let verdict: Verdict = 'unsure';
  let confidence = 0;
  if (list.some((p) => p.verdict === 'differs')) {
    verdict = 'differs';
    confidence = Math.max(...list.filter((p) => p.verdict === 'differs').map((p) => p.confidence));
  } else if (list.length && judged.length && judged.every((p) => p.verdict === 'match')) {
    verdict = 'match';
    confidence = Math.min(...judged.map((p) => p.confidence));
  }
  const first = results[0];
  const evidence = {
    ...first.evidence,
    features: Object.assign({}, ...results.map((r) => r.evidence.features)),
    contour: results.map((r) => r.evidence.contour).find(Boolean),
    shape: results.map((r) => r.evidence.shape).find(Boolean),
  };
  return {
    verdict,
    parts,
    confidence,
    reason: verdict === 'unsure' ? (list.find((p) => p.reason)?.reason ?? results.find((r) => r.reason)?.reason) : undefined,
    evidence,
    scorers: results.flatMap((r) => r.scorers),
    elapsedMs,
  };
}

/** Run every registered scorer (or only the named ones). A scorer that throws counts as "unsure", never as a verdict. */
export async function scoreWithRegistry(input: ScoreInput, only?: string[]): Promise<ScoreResult> {
  const started = performance.now();
  const chosen = [...registry.values()].filter((s) => !only || only.includes(s.id));
  const results = await Promise.all(
    chosen.map((s) =>
      s.score(input).catch((): ScoreResult => unsureResult('scorer_error', [s.id])),
    ),
  );
  return combineResults(results, performance.now() - started);
}
