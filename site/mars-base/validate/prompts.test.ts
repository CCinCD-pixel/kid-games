/**
 * V15 prompt semantics (QA fix-mars-r1 P3): every spoken / shown order line must agree with the operation and the numbers of the item it sits on.
 * Renders orderLine + the family prompt + the written hint of sampled items of EVERY built family / band / ask and checks the TEXT semantics:
 * no "再来…颗" over a minus sign, no "拿走" over a plus, the quantity named in the line is the one on the card, relation questions ask for what the card asks, no unresolved {vars}.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '@kit/rng';
import { FAMILIES } from '../src/families';
import { hintLine, lineText, orderLine, zhNumber, allLineIds } from '../src/voice/lines';
import type { GenCtx } from '../src/app/types';

const N = process.env.MARS_FULL ? 400 : 120;
const INC = /再来|一共|合起来|加上|添上|多一|多出/;      // words that mean "more"
const DEC = /拿走|还剩|剩|减|(?<!多)少/;                    // words that mean "less" ("多少" = how many is neutral)
const minusIn = (s: string) => /[−-]/.test(s);
const plusIn = (s: string) => /\+/.test(s);

interface Row { fam: string; band: number; ask?: string; p: any; big: string; line: string; id: string; hint: string }
function sample(): Row[] {
  const rows: Row[] = [];
  for (const [id, f] of Object.entries(FAMILIES)) {
    const asks: (string | undefined)[] = f.asks?.length ? [undefined, ...f.asks] : [undefined];
    for (let band = 1; band <= f.bands; band++) for (const ask of asks) {
      const rng = createRng(`v15:${id}:${band}:${ask ?? ''}`);
      for (let k = 0; k < N; k++) {
        const ctx: GenCtx = { band, level: 3, rep: 'A', ask, knobs: {} };
        const { params } = f.gen(rng, ctx);
        const ol = orderLine(f, params, ask);
        rows.push({ fam: id, band, ask, p: params, big: f.prompt(params, ask).big, id: ol.id, line: lineText(ol.id, ol.vars), hint: lineText(hintLine(f, params)) });
      }
    }
  }
  return rows;
}
const ROWS = sample();

describe('V15 prompt semantics', () => {
  it('samples every built family', () => { expect(new Set(ROWS.map((r) => r.fam)).size).toBe(Object.keys(FAMILIES).length); expect(ROWS.length).toBeGreaterThan(5000); });

  it('every order line resolves: known id, non-empty, no leftover {var}', () => {
    const ids = new Set(allLineIds());
    for (const r of ROWS) { expect(ids.has(r.id), `${r.fam} -> ${r.id}`).toBe(true); expect(r.line.length, `${r.fam} ${r.id}`).toBeGreaterThan(0); expect(r.line, `${r.fam} ${r.id}`).not.toMatch(/\{\w+\}/); }
  });

  it('the card and its spoken line never contradict (minus card ⇒ no "more" words; plus card ⇒ no "less" words)', () => {
    for (const r of ROWS) {
      if (minusIn(r.big) && !plusIn(r.big)) { expect(r.line, `${r.fam} "${r.big}" -> "${r.line}"`).not.toMatch(INC); expect(r.hint, `${r.fam} hint "${r.hint}"`).not.toMatch(INC); }
      if (plusIn(r.big) && !minusIn(r.big)) { expect(r.line, `${r.fam} "${r.big}" -> "${r.line}"`).not.toMatch(DEC); expect(r.hint, `${r.fam} hint "${r.hint}"`).not.toMatch(DEC); }
    }
  });

  it('operation families: the sign of the item decides the wording (sub.* / col.sub say less, add.* / col.add say more)', () => {
    for (const r of ROWS) {
      if (/^(sub\.|col\.sub)/.test(r.fam)) { expect(r.line, r.fam).not.toMatch(INC); expect(r.hint, r.fam).not.toMatch(INC); }
      if (/^(add\.|col\.add)/.test(r.fam)) { expect(r.line, r.fam).not.toMatch(DEC); expect(r.hint, r.fam).not.toMatch(DEC); }
    }
  });

  it('step families: wording follows the sign, the quantity named is the quantity on the card (one more / one less, ten more / ten less, a hundred …)', () => {
    let plus = 0; let minus = 0;
    for (const r of ROWS.filter((x) => x.fam === 'pv2.step' || x.fam === 'pv3.step')) {
      const neg = r.p.op === '-' || (r.p.d ?? 0) < 0; const mag = r.p.b ?? Math.abs(r.p.d);
      expect(minusIn(r.big), `${r.fam} ${r.big}`).toBe(neg);
      if (neg) { minus++; expect(r.line, `${r.big} -> ${r.line}`).toMatch(/拿走/); expect(r.line).not.toMatch(/再来/); }
      else { plus++; expect(r.line, `${r.big} -> ${r.line}`).toMatch(/再来/); expect(r.line).not.toMatch(/拿走/); }
      expect(r.line, `${r.big} -> ${r.line}`).toContain(zhNumber(mag));
    }
    expect(plus).toBeGreaterThan(50); expect(minus).toBeGreaterThan(50);
  });

  it('hundreds add / subtract: "还剩多少" for minus, "一共是多少" for plus', () => {
    for (const r of ROWS.filter((x) => x.fam === 'pv3.addHund')) expect(r.line, r.big).toBe(r.p.op === '-' ? '还剩多少？' : '一共是多少？');
  });

  it('relation questions ask for what the card asks (多多少 / 大的是几 / 小的是几)', () => {
    const seen = new Set<string>();
    for (const r of ROWS.filter((x) => x.fam === 'rel.compare')) {
      seen.add(r.p.form);
      if (r.p.form === 'diff') expect(r.line).toMatch(/多多少/); else if (r.p.form === 'findBig') { expect(r.line).toMatch(/大的是几/); expect(r.big).toMatch(/大的是几/); } else { expect(r.line).toMatch(/小的是几/); expect(r.big).toMatch(/小的是几/); }
    }
    expect(seen.size).toBe(3);
  });

  it('numbers named in a place / zoom / array line equal the numbers of the item', () => {
    for (const r of ROWS) {
      if (r.fam === 'nl.place' && !r.p.planet) expect(r.line, r.big).toContain(zhNumber(r.p.target));
      if (r.fam === 'nl.zoom') expect(r.line).toContain(zhNumber(r.p.target));
    }
  });
});
