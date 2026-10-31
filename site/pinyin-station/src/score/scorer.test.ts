import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearScorers, combineResults, registerScorer, registeredScorers, scoreWithRegistry, unsureResult } from './scorer';
import { ToneShapeScorer } from './tone-shape';
import { resampleTo16k } from './resample';
import type { PartResult, ScoreInput, ScoreResult, Scorer, Tone } from './types';
import { ffmpegAvailable, gaussian, libraryProfile, loadSyllable, rng, synthVoice, syllableIds } from './test-support';
import { addRecording, emptySpeaker, type SpeakerProfile } from './speaker';
import { buildContour, describeShape, scalePoints } from './contour';
import { trackPitch } from './pitch';
import { parseSyllable } from '../domain/pinyin';

const tone = new ToneShapeScorer();
const SHAPE_ST = {
  rising: (u: number) => -2 + 7 * u,
  falling: (u: number) => 3 - 11 * u,
  level: () => 0,
  dipping: (u: number) => (u < 0.4 ? 2 - 6 * (u / 0.4) : -4 + 12 * ((u - 0.4) / 0.6)),
};
const say = (shape: keyof typeof SHAPE_ST, base = 330, extra: Partial<Parameters<typeof synthVoice>[0]> = {}) => {
  const lead = 0.35,
    voiced = 0.55,
    tail = 0.7;
  const body = synthVoice({ seconds: voiced, f0: (t) => base * Math.pow(2, SHAPE_ST[shape](Math.max(0, Math.min(1, (t - 0.03) / (voiced - 0.06)))) / 12), ...extra });
  const out = new Float32Array(Math.round((lead + voiced + tail) * 16000));
  const random = rng(11);
  for (let i = 0; i < out.length; i++) out[i] = 0.0008 * gaussian(random);
  body.forEach((x, i) => (out[Math.round(lead * 16000) + i] += x));
  return out;
};
/** A child who has already read a dozen syllables: centre 330 Hz, usual range about 11.7 semitones. */
const knownChild = (n = 12): SpeakerProfile => Array.from({ length: n }).reduce<SpeakerProfile>((p) => addRecording(p, { hz: 330, range: 11.7 }), emptySpeaker());
const input = (pcm: Float32Array, toneNumber: Tone, sampleRate = 16000, speaker: SpeakerProfile | undefined = knownChild()): ScoreInput => ({
  speaker,
  pcm,
  sampleRate,
  target: { syllable: `ma${toneNumber}`, initial: 'm', final: 'a', tone: toneNumber },
  confusions: { tones: [1, 2, 3, 4].filter((t) => t !== toneNumber) as Tone[] },
});

describe('ToneShapeScorer on synthetic child-pitched syllables', () => {
  it.each([
    ['level', 1],
    ['rising', 2],
    ['dipping', 3],
    ['falling', 4],
  ] as const)('%s voice vs target tone %i is a match', async (shape, t) => {
    const r = await tone.score(input(say(shape), t));
    expect(r.verdict).toBe('match');
    expect(r.parts.tone?.heard).toBe(shape);
    expect(r.evidence.contour?.curve).toHaveLength(24);
    expect(r.scorers).toEqual(['tone-shape']);
  });
  it('reports "differs" for a clearly different shape (falling voice, target tone 2)', async () => {
    const r = await tone.score(input(say('falling'), 2));
    expect(r.verdict).toBe('differs');
    expect(r.parts.tone?.heard).toBe('falling');
    expect(r.confidence).toBeGreaterThan(0.6);
  });
  it('treats a low falling "half-third" reading of tone 3 as unsure, never as an error', async () => {
    const r = await tone.score(input(say('falling'), 3));
    expect(r.verdict).not.toBe('differs');
  });
  it('never judges the neutral tone by pitch shape', async () => {
    const r = await tone.score(input(say('falling'), 5));
    expect(r.verdict).toBe('unsure');
    expect(r.reason).toBe('not_applicable');
  });
  it('accepts 44.1 / 48 kHz input and resamples it correctly', async () => {
    for (const rate of [44100, 48000]) {
      const wide = synthVoice({ sampleRate: rate, seconds: 1.5, f0: (t) => (t < 0.35 ? 150 : 330 * Math.pow(2, SHAPE_ST.rising(Math.min(1, (t - 0.38) / 0.5)) / 12)), amp: (t) => (t < 0.35 || t > 1.0 ? 0.0005 : 1) });
      const r = await tone.score(input(wide, 2, rate));
      expect(r.evidence.quality.seconds).toBeGreaterThan(1.3);
      expect(['match', 'unsure']).toContain(r.verdict);
    }
    const back = resampleTo16k(synthVoice({ sampleRate: 48000, seconds: 0.5, f0: () => 300 }), 48000);
    expect(Math.abs(back.length - 8000)).toBeLessThanOrEqual(2);
  });
});

describe('quality gates: a recording that cannot be trusted is never "differs"', () => {
  const wrongShape = () => say('falling'); // target tone 2 => would be "differs" if clean
  it('too short', async () => {
    const r = await tone.score(input(say('falling').slice(0, Math.round(0.35 * 16000 + 0.07 * 16000)), 2));
    expect(r.verdict).toBe('unsure');
    expect(r.reason).toBe('too_short');
  });
  it('too quiet', async () => {
    const quiet = wrongShape().map((x) => x * 0.02);
    const r = await tone.score(input(quiet, 2));
    expect(r.verdict).toBe('unsure');
    expect(['too_quiet', 'too_short']).toContain(r.reason);
  });
  it('too noisy', async () => {
    const random = rng(5);
    const noisy = wrongShape().map((x) => x + 0.05 * gaussian(random));
    const r = await tone.score(input(noisy, 2));
    expect(r.verdict).toBe('unsure');
    expect(r.evidence.quality.noisy).toBe(true);
  });
  it('clipped', async () => {
    const clipped = wrongShape().map((x) => Math.max(-1, Math.min(1, x * 9)));
    const r = await tone.score(input(clipped, 2));
    expect(r.verdict).toBe('unsure');
    expect(r.reason).toBe('clipped');
  });
  it('silence and noise only (no voicing)', async () => {
    expect((await tone.score(input(new Float32Array(16000), 1))).verdict).toBe('unsure');
    const random = rng(2);
    const hiss = Float32Array.from({ length: 24000 }, () => 0.02 * gaussian(random));
    expect((await tone.score(input(hiss, 1))).verdict).toBe('unsure');
  });
  it('a scorer that throws becomes unsure/scorer_error, never a verdict', async () => {
    clearScorers();
    registerScorer({ id: 'boom', score: async () => Promise.reject(new Error('nope')) });
    const r = await scoreWithRegistry(input(say('rising'), 2));
    expect(r.verdict).toBe('unsure');
    expect(r.reason).toBe('scorer_error');
  });
});

describe('scorer registry and combination', () => {
  beforeEach(() => clearScorers());
  afterEach(() => clearScorers());
  const stub = (id: string, part: 'initial' | 'final' | 'tone', result: PartResult): Scorer => ({
    id,
    async score() {
      const base = unsureResult('not_applicable', [id]);
      return { ...base, verdict: result.verdict, parts: { [part]: result }, confidence: result.confidence, scorers: [id] } as ScoreResult;
    },
  });
  it('plugs in later scorers by id and merges their parts', async () => {
    registerScorer(tone);
    registerScorer(stub('initial-stub', 'initial', { verdict: 'match', confidence: 0.9 }));
    expect(registeredScorers()).toEqual(['tone-shape', 'initial-stub']);
    const both = await scoreWithRegistry(input(say('rising'), 2));
    expect(both.verdict).toBe('match');
    expect(Object.keys(both.parts).sort()).toEqual(['initial', 'tone']);
    expect(both.scorers).toEqual(['tone-shape', 'initial-stub']);
    const onlyTone = await scoreWithRegistry(input(say('rising'), 2), ['tone-shape']);
    expect(Object.keys(onlyTone.parts)).toEqual(['tone']);
  });
  it('one decisive differs wins, unsure never becomes match, conflicts collapse to unsure', () => {
    const r = (v: PartResult['verdict'], part: 'initial' | 'tone' = 'tone'): ScoreResult => ({ ...unsureResult('low_confidence'), verdict: v, parts: { [part]: { verdict: v, confidence: 0.8 } } });
    expect(combineResults([r('match', 'tone'), r('differs', 'initial')], 1).verdict).toBe('differs');
    expect(combineResults([r('match', 'tone'), r('unsure', 'initial')], 1).verdict).toBe('match');
    expect(combineResults([r('unsure')], 1).verdict).toBe('unsure');
    expect(combineResults([r('match'), r('differs')], 1).parts.tone?.verdict).toBe('unsure');
    expect(combineResults([], 1).verdict).toBe('unsure');
  });
});

describe.skipIf(!ffmpegAvailable)('ToneShapeScorer on the licensed real recordings (baseline)', () => {
  it('scores correct readings as match (never differs), and wrong-tone readings mostly differs/unsure, almost never match', { timeout: 180000 }, async () => {
    const ids = syllableIds();
    let correct = { match: 0, unsure: 0, differs: 0 },
      wrong = { match: 0, unsure: 0, differs: 0 },
      n = 0,
      m = 0;
    let slowest = 0;
    const reasons: Record<string, number> = {};
    let gated = 0;
    for (const [i, id] of ids.entries()) {
      const pcm = loadSyllable(id)!;
      const s = parseSyllable(id)!;
      const speaker = await libraryProfile(id, 20, i);
      const target = (t: number): ScoreInput => ({ speaker, pcm, sampleRate: 16000, target: { syllable: id, initial: s.initial, final: s.final, tone: t as Tone }, confusions: { tones: [1, 2, 3, 4].filter((x) => x !== t) as Tone[] } });
      const r = await tone.score(target(s.tone));
      slowest = Math.max(slowest, r.elapsedMs);
      correct[r.verdict]++;
      if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      if (r.evidence.quality.unreliable) gated++;
      n++;
      if (i % 3 === 0)
        for (const t of [1, 2, 3, 4].filter((x) => x !== s.tone)) {
          wrong[(await tone.score(target(t))).verdict]++;
          m++;
        }
    }
    // eslint-disable-next-line no-console
    console.log(`SCORER BASELINE correct readings n=${n}: ${JSON.stringify(correct)}  wrong-tone targets n=${m}: ${JSON.stringify(wrong)}  slowest clip ${slowest.toFixed(0)} ms  unsure reasons ${JSON.stringify(reasons)}  quality-gated ${gated}`);
    expect(correct.differs / n).toBeLessThanOrEqual(0.02);
    // Of the clips that pass the quality gate (the library audio is tight-trimmed, noisy dictionary audio), nearly all match.
    expect(correct.match / (n - gated)).toBeGreaterThanOrEqual(0.7);
    expect(correct.match / n).toBeGreaterThanOrEqual(0.4);
    expect(wrong.match / m).toBeLessThanOrEqual(0.05);
    expect(wrong.differs / m).toBeGreaterThanOrEqual(0.25);
  });
});

describe('per-speaker normalisation and abstention (feasibility-study rules)', () => {
  it('says nothing about tone until the child has about eight usable recordings (warming_up)', async () => {
    for (const n of [0, 3, 7]) {
      const r = await tone.score(input(say('rising'), 2, 16000, knownChild(n)));
      expect(r.verdict).toBe('unsure');
      expect(r.reason).toBe('warming_up');
      expect(r.evidence.contour?.curve).toHaveLength(24); // his curve can still be drawn
    }
    expect((await tone.score(input(say('rising'), 2, 16000, knownChild(8)))).verdict).toBe('match');
  });
  it.skipIf(!ffmpegAvailable)('speaker range scaling rescues a narrow-range child (excursions 60 % of the adult library)', () => {
    const shape = { 1: 'level', 2: 'rising', 3: 'dipping', 4: 'falling' } as const;
    let plain = 0,
      scaled = 0,
      n = 0;
    for (const id of syllableIds().filter((id) => id !== 'o1')) {
      const c = buildContour(trackPitch(loadSyllable(id)!));
      if (!c) continue;
      const want = shape[Number(id.slice(-1)) as 1 | 2 | 3 | 4];
      const squeezed = scalePoints(c.points, 0.6);
      n++;
      if (describeShape({ points: squeezed }).shape === want) plain++;
      // His profile says his range is 0.6 x the reference, so scale = 1/0.6 brings it back.
      if (describeShape({ points: scalePoints(squeezed, 1 / 0.6) }).shape === want) scaled++;
    }
    // eslint-disable-next-line no-console
    console.log(`NARROW-RANGE CHILD (60% range) n=${n}: without speaker scaling ${(plain / n).toFixed(3)}, with ${(scaled / n).toFixed(3)}`);
    expect(scaled / n).toBeGreaterThan(plain / n);
    expect(scaled / n).toBeGreaterThanOrEqual(0.93);
  });
  it('noise never produces a WRONG "differs" (no reliable pitch -> unsure), and heavy noise is simply unsure', async () => {
    for (const level of [0.012, 0.025, 0.04, 0.06]) {
      const random = rng(17);
      const r = await tone.score(input(say('falling').map((x) => x + level * gaussian(random)), 2));
      if (r.verdict === 'differs') expect(r.parts.tone?.heard).toBe('falling'); // only ever the true shape
      if (level >= 0.06) expect(r.verdict).toBe('unsure');
    }
  });
  it("a pitch centre far from the child's own (octave slip) is not judged", async () => {
    const r = await tone.score(input(say('falling', 330 / 2.1), 2)); // 13 semitones below his usual centre
    expect(r.verdict).toBe('unsure');
  });
  it('only abstains in the middle: clear shapes still get a verdict at c = 0.9', async () => {
    expect((await tone.score(input(say('falling'), 4))).verdict).toBe('match');
    expect((await tone.score(input(say('level'), 1))).verdict).toBe('match');
    expect((await tone.score(input(say('level'), 4))).verdict).toBe('differs');
  });
});
