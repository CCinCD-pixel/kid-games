/** QA fix-mars-r1 T4: voice/compose.ts composes templated lines from fragment + number clips with a FAKE manifest; anything missing -> one speech utterance. No audio involved. */
import { describe, expect, it } from 'vitest';
import { composeLine, indexOf, numberClip, speakLine, type LineTable } from '../src/voice/compose';
import { lineTable, orderLine, zhNumber, lineText } from '../src/voice/lines';
import { FAMILIES } from '../src/families';
import { createRng } from '@kit/rng';

const T = lineTable() as LineTable;
const templated = Object.entries(T).filter(([, t]) => /\{\w+\}/.test(t)).map(([id]) => id);
/** a fake manifest that has: every non-templated line, every fragment, numbers 0..max */
const manifest = (opts: { numbersTo?: number; drop?: string[] } = {}): Set<string> => {
  const s = new Set<string>(); for (const [id, t] of Object.entries(T)) if (!/\{\w+\}/.test(t)) s.add(id);
  for (let n = 0; n <= (opts.numbersTo ?? 1000); n++) s.add(`mars.num.${n}`);
  for (const d of opts.drop ?? []) s.delete(d); return s;
};

describe('voice/compose', () => {
  it('number clips: 0–1000 only', () => { expect(numberClip(0)).toBe('mars.num.0'); expect(numberClip(1000)).toBe('mars.num.1000'); expect(numberClip(1001)).toBeNull(); expect(numberClip(-1)).toBeNull(); expect(numberClip(2.5)).toBeNull(); });
  it('the fragment index is built from the line table by text (every fragment line is found)', () => {
    const { frag } = indexOf(T); expect(frag.size).toBeGreaterThanOrEqual(24); expect(frag.get('再来')).toBe('mars.c.stepD.pre'); expect(frag.get('拿走')).toBe('mars.c.stepDm.pre'); expect(frag.get('颗是几')).toBe('mars.c.stepD.tail');
  });
  it('再来{d}颗是几？ = [再来][number][颗是几？] for a number and for its Chinese text', () => {
    const m = manifest();
    expect(composeLine(T, (x) => m.has(x), 'mars.ord.stepD', { d: 10 })).toMatchObject({ mode: 'clip', ids: ['mars.c.stepD.pre', 'mars.num.10', 'mars.c.stepD.tail'], text: '再来10颗是几？' });
    expect(composeLine(T, (x) => m.has(x), 'mars.ord.stepD', { d: zhNumber(100) })).toMatchObject({ mode: 'clip', ids: ['mars.c.stepD.pre', 'mars.num.100', 'mars.c.stepD.tail'] });
    expect(composeLine(T, (x) => m.has(x), 'mars.ord.stepDm', { d: '一' })).toMatchObject({ mode: 'clip', ids: ['mars.c.stepDm.pre', 'mars.num.1', 'mars.c.stepD.tail'] });
  });
  it('two numbers (摆{r}行{c}列。) and trailing punctuation', () => {
    const m = manifest(); const p = composeLine(T, (x) => m.has(x), 'mars.ord.arrayBuild', { r: 3, c: 4 });
    expect(p).toMatchObject({ mode: 'clip', ids: ['mars.c.arr.pre', 'mars.num.3', 'mars.c.arr.rows', 'mars.num.4', 'mars.c.arr.cols'] });
  });
  it('a name var resolves to the clip of the line with that text (planet)', () => {
    const m = manifest(); const name = T['mars.planet.mars']; expect(name).toBeTruthy();
    const p = composeLine(T, (x) => m.has(x), 'mars.race.botSay', { n: 228 }); expect(p.mode).toBe('clip');
    expect(composeLine(T, (x) => m.has(x), 'mars.orbit.planet', { planet: name }).mode).toBe('speech');   // no "把…放上轨道" fragment: one utterance, not a mix
  });
  it('speech fallback for anything missing: a missing number clip, a missing fragment, a number above 1000, an unknown var', () => {
    expect(composeLine(T, (x) => manifest({ numbersTo: 20 }).has(x), 'mars.ord.place', { n: zhNumber(300) })).toMatchObject({ mode: 'speech', text: '把旗插在三百。' });
    expect(composeLine(T, (x) => manifest({ drop: ['mars.c.place'] }).has(x), 'mars.ord.place', { n: 30 }).mode).toBe('speech');
    expect(composeLine(T, (x) => manifest().has(x), 'mars.ord.place', { n: 1001 }).mode).toBe('speech');
    expect(composeLine(T, (x) => manifest().has(x), 'mars.ord.place', {}).mode).toBe('speech');
    expect(composeLine(T, () => false, 'mars.ord.stepD', { d: 1 }).mode).toBe('speech');
  });
  it('a plain sentence: own clip else speech; an unknown id is skipped', () => {
    expect(composeLine(T, (x) => x === 'mars.ord.read', 'mars.ord.read')).toMatchObject({ mode: 'clip', ids: ['mars.ord.read'] });
    expect(composeLine(T, () => false, 'mars.ord.read')).toMatchObject({ mode: 'speech' });
    expect(composeLine(T, () => true, 'mars.nope')).toMatchObject({ mode: 'speech', text: '' });
  });
  it('EVERY templated v1 line composes into clips with a full manifest and the numbers the game uses; the spoken pieces read back as the sentence', () => {
    const m = manifest(); const has = (x: string) => m.has(x);
    for (const id of templated.filter((x) => !['mars.orbit.planet', 'mars.build.tier', 'mars.build.full'].includes(x))) {
      const vars: Record<string, string | number> = { n: 62, d: 5, r: 3, c: 4 }; const p = composeLine(T, has, id, vars);
      expect(p.mode, `${id}: ${p.mode === 'speech' ? p.missing.join() : ''}`).toBe('clip');
      if (p.mode === 'clip') { const said = p.ids.map((c) => (c.startsWith('mars.num.') ? '' : strip(T[c]))).join(''); const lit = strip(T[id].replace(/\{\w+\}/g, '')); expect(said, id).toBe(lit); }
    }
  });
  it('every order line the families produce for a sample of items composes (or falls back cleanly) — never an empty plan', () => {
    const m = manifest(); const rng = createRng('compose-orders'); let clips = 0; let n = 0;
    for (const [fid, f] of Object.entries(FAMILIES)) for (let band = 1; band <= f.bands; band++) for (let k = 0; k < 20; k++) {
      const { params } = f.gen(rng, { band, level: 3, rep: 'A', knobs: {} }); const ol = orderLine(f, params, undefined);
      const p = composeLine(T, (x) => m.has(x), ol.id, ol.vars); n++; expect(p.text.length, `${fid} ${ol.id}`).toBeGreaterThan(0); expect(p.text, ol.id).toBe(lineText(ol.id, ol.vars));
      if (p.mode === 'clip') clips++;
    }
    expect(clips / n).toBeGreaterThan(0.9);
  });
  it('speakLine queues clips in order (first one interrupts) or ONE utterance with the filled text', () => {
    const said: { id: string; interrupt?: boolean }[] = []; const have = manifest();
    const nar = { has: (x: string) => have.has(x), say: (id: string, o?: { interrupt?: boolean }) => { said.push({ id, interrupt: o?.interrupt }); return Promise.resolve('done'); } };
    speakLine(nar, T, 'mars.ord.stepD', { d: 10 }, { interrupt: true });
    expect(said).toEqual([{ id: 'mars.c.stepD.pre', interrupt: true }, { id: 'mars.num.10', interrupt: false }, { id: 'mars.c.stepD.tail', interrupt: false }]);
    said.length = 0; speakLine({ ...nar, has: () => false }, T, 'mars.ord.stepD', { d: 10 }, { interrupt: true });
    expect(said).toEqual([{ id: '再来10颗是几？', interrupt: true }]);
    said.length = 0; speakLine(nar, T, 'mars.ord.read'); expect(said.map((s) => s.id)).toEqual(['mars.ord.read']);
  });
});
const strip = (s: string): string => s.replace(/[\s，。！？、：；,.!?:;]/g, '');
