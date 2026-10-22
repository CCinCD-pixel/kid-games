import type { Recording } from './recordings';
import { normalize, type Dim } from './normalize';
type Profile = 'gentle' | 'balanced' | 'precise';
export function calibration(rows: Recording[], profile: Profile = 'gentle') {
  const labelled = rows.filter((r) => r.parent && r.verdict);
  let compared = 0,
    agreed = 0;
  for (const r of labelled) {
    const v = normalize(r.verdict!.raw, r.verdict!.latencyMs, profile, r.verdict!.assessment);
    if (r.parent === 'correct') {
      if (v.status !== 'judged') continue;
      compared++;
      if (v.level !== 1) agreed++;
    } else {
      const d = v.dims[r.parent!];
      if (!d) continue;
      compared++;
      if (!d.ok) agreed++;
    }
  }
  const dimensions = Object.fromEntries(
    (['initial', 'final', 'tone'] as Dim[]).map((dim) => {
      let positive = 0,
        negative = 0,
        rejected = 0,
        detected = 0,
        unsure = 0;
      for (const r of labelled) {
        if (r.parent !== 'correct' && r.parent !== dim) continue;
        const d = normalize(r.verdict!.raw, r.verdict!.latencyMs, profile, r.verdict!.assessment).dims[dim];
        if (!d) {
          unsure++;
          continue;
        }
        if (r.parent === 'correct') {
          positive++;
          if (!d.ok) rejected++;
        } else {
          negative++;
          if (!d.ok) detected++;
        }
      }
      return [
        dim,
        {
          positive,
          negative,
          unsure,
          falseRejectRate: positive ? rejected / positive : null,
          detectionRate: negative ? detected / negative : null,
        },
      ];
    }),
  );
  const verdicts = rows.flatMap((r) => (r.verdict ? [r.verdict] : [])),
    latencies = verdicts.map((v) => v.latencyMs).sort((a, b) => a - b);
  const percentile = (p: number) =>
    latencies.length ? latencies[Math.ceil(latencies.length * p) - 1] : null;
  const daily = rows.filter((r) => !r.lab).length;
  const ready =
    daily >= 100 &&
    labelled.length >= 30 &&
    Object.values(dimensions).every(
      (d) =>
        d.falseRejectRate !== null &&
        d.falseRejectRate <= 0.1 &&
        d.detectionRate !== null &&
        d.detectionRate >= 0.7,
    );
  return {
    profile,
    daily,
    labelled: labelled.length,
    agreement: { compared, unsure: labelled.length - compared, rate: compared ? agreed / compared : null },
    dimensions,
    toneValidRatio: verdicts.length ? verdicts.filter((v) => v.dims.tone).length / verdicts.length : null,
    latencyMs: { p50: percentile(0.5), p90: percentile(0.9) },
    gate: ready ? 'ready-for-parent-review' : 'keep-trial',
    masteryFromAI: false,
  };
}
