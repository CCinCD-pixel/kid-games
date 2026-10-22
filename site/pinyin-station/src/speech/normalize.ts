import scoring from '../../../../content/pinyin-station/scoring.json';
import type { AssessmentPlan } from './reference';
export type Dim = 'initial' | 'final' | 'tone';
export interface Verdict {
  status: 'judged' | 'unsure';
  level?: 1 | 2 | 3;
  dims: Partial<Record<Dim, { ok: boolean; score?: number; heard?: string }>>;
  engine: 'tencent-soe-n';
  latencyMs: number;
  raw: unknown;
  assessment?: AssessmentPlan;
  reason?: 'no_speech' | 'incomplete' | 'tone_unconfirmed' | 'branch_unconfirmed';
  confusion?: string;
}
type Obj = Record<string, unknown>;
const object = (x: unknown): Obj => {
  if (typeof x === 'string') {
    try {
      return object(JSON.parse(x));
    } catch {
      return {};
    }
  }
  return x && typeof x === 'object' ? (x as Obj) : {};
};
export function normalize(
  raw: unknown,
  latencyMs: number,
  strictness: keyof typeof scoring.profiles = 'gentle',
  assessment?: AssessmentPlan,
): Verdict {
  const envelope = object(raw),
    result = object(envelope.result ?? raw),
    cfg = scoring.profiles[strictness];
  const verdict: Verdict = {
    status: 'unsure',
    dims: {},
    engine: 'tencent-soe-n',
    latencyMs,
    raw,
    assessment,
  };
  if (envelope.code && envelope.code !== 0) return verdict;
  const sentenceSets = Array.isArray(result.SentenceInfoSet) ? result.SentenceInfoSet : [];
  const words = Array.isArray(result.Words)
    ? result.Words
    : sentenceSets.flatMap((s) => (Array.isArray(object(s).Words) ? (object(s).Words as unknown[]) : []));
  if (!words.length) {
    verdict.reason = 'no_speech';
    return verdict;
  }
  if (words.some((w) => typeof object(w).MatchTag === 'number' && object(w).MatchTag !== 0)) return verdict;
  const dimensions: Record<'initial' | 'final', number[]> = { initial: [], final: [] };
  let complete = true,
    toneSeen = false,
    toneMismatch = false,
    toneUnknown = false;
  for (const [index, value] of words.entries()) {
    const w = object(value),
      phones = Array.isArray(w.PhoneInfos) ? w.PhoneInfos : [];
    if (!phones.length) complete = false;
    for (const phone of phones) {
      const p = object(phone),
        letter = String(p.Phone ?? '')
          .toLowerCase()
          .replace(/[0-4]$/, '')
          .replaceAll('ü', 'v');
      if (
        !/^[a-zv]+$/.test(letter) ||
        typeof p.PronAccuracy !== 'number' ||
        !Number.isFinite(p.PronAccuracy) ||
        p.PronAccuracy < 0 ||
        p.PronAccuracy > 100
      ) {
        complete = false;
        continue;
      }
      const dim = /^(zh|ch|sh|[bpmfdtnlgkhjqxzcsryw])$/.test(letter) ? 'initial' : 'final';
      // Phone names the reference phone. It is never evidence of what was actually spoken.
      dimensions[dim].push(p.PronAccuracy);
    }
    if (assessment?.mode === 8 || assessment?.mode === 6 || assessment?.pronunciation?.[index]?.endsWith('0'))
      continue;
    const tone = object(w.Tone),
      ref = tone.RefTone,
      hyp = tone.HypothesisTone;
    if (
      tone.Valid === true &&
      typeof ref === 'number' &&
      ref >= 1 &&
      ref <= 4 &&
      typeof hyp === 'number' &&
      hyp >= 1 &&
      hyp <= 4
    ) {
      toneSeen = true;
      if (ref !== hyp) toneMismatch = true;
    } else {
      // -1 has no documented promise of an identified wrong tone. Ask to listen again;
      // do not claim the child read a particular tone, or record this as an error.
      toneUnknown = true;
    }
  }
  for (const dim of ['initial', 'final'] as const)
    if (dimensions[dim].length) {
      const score = Math.min(...dimensions[dim]);
      verdict.dims[dim] = { ok: score >= cfg.basic, score };
    }
  if (toneSeen && !toneUnknown) verdict.dims.tone = { ok: !toneMismatch };
  if (assessment?.mode === 6) {
    const branches = assessment.branches,
      selected = result.RefTextId;
    const texts = assessment.ref.split('|');
    if (
      !branches ||
      !Number.isInteger(selected) ||
      Number(selected) < 0 ||
      Number(selected) >= texts.length ||
      words.map((w) => String(object(w).Word ?? '')).join('') !== texts[Number(selected)]
    ) {
      verdict.dims = {};
      verdict.reason = 'branch_unconfirmed';
      return verdict;
    }
    // The branch dictionary may choose a different pronunciation (泥 is polyphonic).
    // Mode 6 supplies consonant contrast evidence only, never final or tone accuracy.
    const initial = verdict.dims.initial;
    if (!initial || !initial.ok) {
      verdict.dims = {};
      verdict.reason = 'branch_unconfirmed';
      return verdict;
    }
    verdict.dims = { initial };
    if (Number(selected) !== branches.target) {
      verdict.dims.initial = { ok: false, heard: branches.syllables[Number(selected)] };
      verdict.confusion = branches.confusion;
    }
  }
  const mismatch = Object.values(verdict.dims).some((d) => !d.ok);
  if (mismatch) {
    verdict.status = 'judged';
    verdict.level = 1;
  } else if (
    complete &&
    Object.keys(verdict.dims).length &&
    (!toneUnknown || assessment?.mode === 8 || assessment?.mode === 6)
  ) {
    verdict.status = 'judged';
    verdict.level = Object.values(verdict.dims).every((d) => d.score === undefined || d.score >= cfg.clear)
      ? 3
      : 2;
  } else verdict.reason = toneUnknown ? 'tone_unconfirmed' : 'incomplete';
  return verdict;
}
