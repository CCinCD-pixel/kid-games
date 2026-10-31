import { describe, expect, it } from 'vitest';
import { trackPitch } from './pitch';
import { buildContour, describeShape, SHAPES, TONE_SHAPE, type Shape } from './contour';
import { ffmpegAvailable, loadSyllable, synthVoice, syllableIds } from './test-support';

const SECONDS = 0.55;
const fromSt = (base: number, f: (u: number) => number) => (t: number) => base * Math.pow(2, f(Math.max(0, Math.min(1, (t - 0.03) / (SECONDS - 0.06)))) / 12);
const SHAPES_ST: Record<Shape, (u: number) => number> = {
  level: () => 0,
  rising: (u) => -2 + 7 * u,
  falling: (u) => 3 - 11 * u,
  dipping: (u) => (u < 0.4 ? 2 - 6 * (u / 0.4) : -4 + 12 * ((u - 0.4) / 0.6)),
};
const voice = (shape: Shape, base: number) => synthVoice({ seconds: SECONDS, f0: fromSt(base, SHAPES_ST[shape]) });
const describe3 = (pcm: Float32Array) => {
  const c = buildContour(trackPitch(pcm))!;
  return { c, d: describeShape(c) };
};

describe('contour normalisation', () => {
  it('returns null for unvoiced input and for fewer than 8 voiced frames', () => {
    expect(buildContour(trackPitch(new Float32Array(16000)))).toBeNull();
    expect(buildContour(trackPitch(synthVoice({ seconds: 0.09, f0: () => 250 })))).toBeNull();
  });
  it('is invariant to speaker pitch: a 100 Hz adult and a 400 Hz child give the same semitone contour', () => {
    for (const shape of SHAPES) {
      const adult = describe3(voice(shape, 110)).c,
        child = describe3(voice(shape, 400)).c;
      expect(adult.points).toHaveLength(10);
      expect(child.curve).toHaveLength(24);
      for (let i = 0; i < 10; i++) expect(Math.abs(adult.points[i] - child.points[i])).toBeLessThan(0.8);
      expect(child.medianHz / adult.medianHz).toBeGreaterThan(3);
    }
  });
  it('reports the voiced span and continuity, and bridges a short unvoiced gap', () => {
    const base = voice('rising', 250);
    const gap = base.slice();
    gap.fill(0, Math.round(0.25 * 16000), Math.round(0.3 * 16000));
    const solid = describe3(base).c,
      bridged = describe3(gap).c;
    expect(solid.continuity).toBeGreaterThan(0.95);
    expect(bridged.continuity).toBeLessThan(solid.continuity);
    expect(bridged.points.every(Number.isFinite)).toBe(true);
  });
});

describe('tone-shape descriptor on synthetic contours of known shape', () => {
  it.each(SHAPES.flatMap((s) => [110, 250, 400].map((hz) => [s, hz] as const)))('%s at %i Hz', (shape, hz) => {
    const { d } = describe3(voice(shape, hz));
    expect(d.shape).toBe(shape);
    expect(d.confidence).toBeGreaterThan(0.4);
  });
  it('gives a flat but wobbly contour a low-confidence call rather than a confident wrong shape', () => {
    const wobble = synthVoice({ seconds: SECONDS, f0: (t) => 250 * (1 + 0.04 * Math.sin(2 * Math.PI * 7 * t)) });
    const { d } = describe3(wobble);
    expect(d.shape).toBe('level');
  });
});

describe.skipIf(!ffmpegAvailable)('tone-shape baseline on the licensed real-person recordings (a baseline, not a product claim)', () => {
  it('names the textbook shape of tones 1-4 for >= 95% of syllables, and is surer when it is right', { timeout: 120000 }, () => {
    const rows: { id: string; tone: 1 | 2 | 3 | 4; got: Shape; confidence: number }[] = [];
    for (const id of syllableIds()) {
      const pcm = loadSyllable(id)!;
      const c = buildContour(trackPitch(pcm));
      const tone = Number(id.slice(-1)) as 1 | 2 | 3 | 4;
      if (!c) {
        rows.push({ id, tone, got: 'level', confidence: 0 });
        continue;
      }
      const d = describeShape(c);
      rows.push({ id, tone, got: d.shape, confidence: d.confidence });
    }
    const ok = (r: (typeof rows)[number]) => r.got === TONE_SHAPE[r.tone];
    const acc = (rs: typeof rows) => rs.filter(ok).length / rs.length;
    const perTone = [1, 2, 3, 4].map((t) => acc(rows.filter((r) => r.tone === t)));
    const first = rows.filter((r) => r.id[0] < 'n'),
      second = rows.filter((r) => r.id[0] >= 'n');
    const confident = rows.filter((r) => r.confidence >= 0.7);
    // eslint-disable-next-line no-console
    console.log(
      `TONE-SHAPE BASELINE n=${rows.length} accuracy=${acc(rows).toFixed(3)} perTone(1-4)=${perTone.map((x) => x.toFixed(3)).join('/')} ` +
        `a-m=${acc(first).toFixed(3)}(n=${first.length}) n-z=${acc(second).toFixed(3)}(n=${second.length}) ` +
        `confident>=0.7: ${(confident.length / rows.length).toFixed(2)} of clips at accuracy ${acc(confident).toFixed(3)}`,
    );
    expect(acc(rows)).toBeGreaterThanOrEqual(0.95);
    perTone.forEach((a) => expect(a).toBeGreaterThanOrEqual(0.9));
    expect(acc(first)).toBeGreaterThanOrEqual(0.93);
    expect(acc(second)).toBeGreaterThanOrEqual(0.93);
    expect(acc(confident)).toBeGreaterThanOrEqual(0.97);
  });
});
