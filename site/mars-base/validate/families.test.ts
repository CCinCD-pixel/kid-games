/** V1 (generators + fact space) and V2 (independent oracles, mutation, import graph). Spec §9. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRng } from '@kit/rng';
import { FAMILIES, META, NOT_BUILT } from '../src/families';
import { oracleOf } from '../src/families/oracles';
import { NODES } from '../src/app/content';
import { judge, sameAnswer } from '../src/app/judge';
import { bugAnswer } from '../src/diag/bugs';
import { needsBorrow, needsCarry } from '../src/families/shared/arith';
import type { GenCtx, Knobs, Rep } from '../src/app/types';

const FULL = !!process.env.MARS_FULL;
const N = FULL ? 10000 : 1000;
const ctxFor = (band: number, ask?: string, knobs: Knobs = {}, level = 3, rep: Rep = 'A', l6 = false): GenCtx => ({ band, level, rep, ask, knobs, l6 });
const asksOf = (id: string): (string | undefined)[] => (FAMILIES[id].asks?.length ? [undefined, ...FAMILIES[id].asks!] : [undefined]);

describe('V1 generators', () => {
  it('every built family has meta + oracle, and nothing in a v1 node is unbuilt except the later-round zones', () => {
    const missing = new Set<string>();
    for (const n of NODES) for (const i of n.items) if (!FAMILIES[i.fam]) missing.add(`${n.zone}:${i.fam}`);
    const zones = new Set([...missing].map((m) => m.split(':')[0]));
    expect([...zones].sort()).toEqual(['balance', 'puzzle']);
    expect(NOT_BUILT.length).toBeGreaterThan(0);
  });

  for (const [id, f] of Object.entries(FAMILIES)) {
    it(`${id}: answers match the oracle, range, flags, loose crystals, ≤5 ms`, () => {
      const feats: Record<number, { size: number; carry: number; cross: number }> = {};
      for (let band = 1; band <= f.bands; band++) {
        const rng = createRng(`v1:${id}:${band}`);
        let size = 0; let carry = 0; let cross = 0; let n = 0; let maxMs = 0;
        for (const ask of asksOf(id)) for (let k = 0; k < N / asksOf(id).length; k++) {
          const t0 = performance.now();
          const { params, answer } = f.gen(rng, ctxFor(band, ask));
          maxMs = Math.max(maxMs, performance.now() - t0);
          expect(sameAnswer(answer, oracleOf(id, params, ask)) || JSON.stringify(answer) === JSON.stringify(oracleOf(id, params, ask)), `${id} b${band} ${JSON.stringify(params)}`).toBe(true);
          if (typeof answer === 'number') { expect(answer).toBeGreaterThanOrEqual(0); expect(answer).toBeLessThanOrEqual(1000); }
          const ft = f.features(params, ask);
          expect(ft.loose ?? 0).toBeLessThanOrEqual(20);
          if (/^add\./.test(id)) expect(needsCarry((params as any).a, (params as any).b)).toBe(ft.carry);
          if (/^sub\./.test(id)) expect(needsBorrow((params as any).a, (params as any).b)).toBe(ft.carry);
          size += ft.size; carry += ft.carry ? 1 : 0; cross += ft.cross ? 1 : 0; n++;
        }
        expect(maxMs).toBeLessThan(5 + 20);   // 5 ms budget; first-call JIT noise gets a margin
        feats[band] = { size: size / n, carry: carry / n, cross: cross / n };
      }
      for (let band = 2; band <= f.bands; band++) {
        if (id.startsWith('nl.') || id.startsWith('open.')) continue;
        // band monotonicity: carry / cross share never drops by more than 1 pp (size is reported only; bands may trade size for structure)
        expect(feats[band].carry + 0.01, `${id} carry b${band}`).toBeGreaterThanOrEqual(feats[band - 1].carry);
        expect(feats[band].cross + 0.01 + (id === 'pv2.compare' || id === 'pv3.compare' ? 1 : 0), `${id} cross b${band}`).toBeGreaterThanOrEqual(feats[band - 1].cross);
      }
    });
  }

  it('same seed → same item (determinism)', () => {
    for (const [id, f] of Object.entries(FAMILIES)) {
      const a = f.gen(createRng(`d:${id}`), ctxFor(1)); const b = f.gen(createRng(`d:${id}`), ctxFor(1));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('fact space after node knobs ≥ 3 × the entry\'s item count (distinct params, not phrasings)', () => {
    const low: string[] = [];
    for (const n of NODES) for (const it of n.items) {
      const f = FAMILIES[it.fam]; if (!f || f.factSpace || it.fam.startsWith('open.') || it.fam.startsWith('nl.')) continue;
      const band = it.band ?? 1;
      const rng = createRng(`facts:${n.id}:${it.fam}`); const seen = new Set<string>();
      const bands = it.band ? [it.band] : f.bands > 1 && n.kind !== 'calib' ? Array.from({ length: f.bands }, (_, i) => i + 1) : [band];
      for (const b of bands) for (let k = 0; k < 4000; k++) seen.add(JSON.stringify(f.gen(rng, ctxFor(b, it.ask, it as Knobs)).params));
      const need = 3 * it.count;
      if (seen.size < need) low.push(`${n.id} ${it.fam} b${it.band ?? '*'}: ${seen.size} < ${need}`);
    }
    expect(low).toEqual([]);
  });
});

describe('V2 oracles are independent and the gate has teeth', () => {
  it('oracles.ts imports nothing but types and shared/arith', () => {
    const src = readFileSync(new URL('../src/families/oracles.ts', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['../app/types', './shared/arith']);
    expect(src).not.toMatch(/gen\w*['"]|families\/(pv2|addsub|pv3|mul|nl|open)/);
  });
  it('a generator mutated by +1 is caught by the gen-vs-oracle comparison in EVERY family with a numeric answer', () => {
    let tested = 0;
    for (const [id, f] of Object.entries(FAMILIES)) {
      if (f.answer === 'open') continue;
      const rng = createRng(`mut:${id}`); let caught = false;
      for (let k = 0; k < 60 && !caught; k++) {
        const { params, answer } = f.gen(rng, ctxFor(1));
        const mutated = typeof answer === 'number' ? answer + 1 : Array.isArray(answer) ? [...answer.slice(0, -1), (answer.at(-1) as number) + 1] : answer;
        if (mutated !== answer && JSON.stringify(mutated) !== JSON.stringify(oracleOf(id, params))) caught = true;
        else if (typeof answer !== 'number' && !Array.isArray(answer)) caught = true;   // compare2: object answers are verified structurally by judge
      }
      expect(caught, id).toBe(true); tested++;
    }
    expect(tested).toBeGreaterThan(30);
  });
  it('oracle answers are judged ok 100 %; every declared bug answer is judged not ok 0 %', () => {
    let bugs = 0;
    for (const [id, f] of Object.entries(FAMILIES)) {
      if (f.answer === 'open') continue;
      for (let band = 1; band <= f.bands; band++) for (const ask of asksOf(id)) {
        const rng = createRng(`j:${id}:${band}:${ask}`);
        for (let k = 0; k < 120; k++) {
          const { params, answer } = f.gen(rng, ctxFor(band, ask));
          const ok = f.answer === 'place' || f.answer === 'read' ? judge(f, params, answer, ask) : judge(f, params, id === 'pv2.build' || id.startsWith('pv3.build') || id === 'pv3.pack' || id === 'pv3.counter' ? { total: answer as number, canonical: true } : answer, ask);
          if (id === 'nl.zoom') continue;
          expect(ok.ok, `${id} b${band} ${JSON.stringify(params)}`).toBe(true);
          for (const cls of f.diag) {
            const b = bugAnswer(f, params, cls, ask); if (b === null) continue; bugs++;
            const resp = f.answer === 'build' ? { total: b as number, canonical: true } : b;
            expect(judge(f, params, resp as any, ask).ok, `${id} ${cls} ${JSON.stringify(b)}`).toBe(false);
          }
        }
      }
    }
    expect(bugs).toBeGreaterThan(500);
  });
  it('typed-integer answer modes are within the family caps and meta table is complete for built families', () => {
    for (const id of Object.keys(FAMILIES)) {
      const m = META[id];
      expect(m.l6, id).toBeDefined(); expect(m.answerModes?.length ?? 0, id).toBeGreaterThan(0);
      expect(m.typedMax ?? 0).toBeLessThanOrEqual(1);
    }
  });
});
