/** V6 (b)(c)(d): the leak gate on the REAL view markup, the three bots on the calibration control, and the frozen leaky mutant. Spec §3.8.1, §9. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRng } from '@kit/rng';
import { renderNumberLine, type NlViewState } from '@engines/manip/numberline';
import { renderLeakyNumberLine } from '@engines/manip/__fixtures__/numberline.leaky';
import { exposedNumerals, setKey } from './lib/exposure';
import { CALIBRATION_TARGETS, scoreCalibration } from '../src/families/nl';

const CSS = readFileSync(new URL('../../../engines/manip/numberline.css', import.meta.url), 'utf8');
const CFGS = [
  { name: 'L100 every10', L: 100, labels: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
  { name: 'L100 half', L: 100, labels: [0, 50, 100] },
  { name: 'L1000 every100', L: 1000, labels: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] },
  { name: 'L1000 ends', L: 1000, labels: [0, 1000] },
];
type Cfg = (typeof CFGS)[number];
const base = (c: Cfg): NlViewState => ({ w: 358, h: 276, L: c.L, kind: 'place', labels: c.labels, flag: null, dragging: false, placed: false, nudgesLeft: 3 });
const KINDS: Record<string, (c: Cfg, p: number | null) => NlViewState> = {
  idle: (c) => ({ ...base(c) }),
  dragging: (c, p) => ({ ...base(c), flag: p, dragging: true }),
  placed: (c, p) => ({ ...base(c), flag: p, placed: true }),
  nudgeCap: (c, p) => ({ ...base(c), flag: p, placed: true, nudgesLeft: 0 }),
  h1: (c, p) => ({ ...base(c), flag: p, placed: true, h1: true }),
  h2: (c, p) => ({ ...base(c), flag: p, placed: true, h2Anchors: [c.L / 4, c.L / 2, (3 * c.L) / 4] }),
  read: (c, p) => ({ ...base(c), kind: 'read', flag: p, placed: true }),
  calibDrag: (c, p) => ({ ...base(c), kind: 'calib', flag: p, dragging: true }),
  calibPlaced: (c, p) => ({ ...base(c), kind: 'calib', flag: p, placed: true }),
  feedback: (c, p) => ({ ...base(c), flag: p, placed: true, phase: 'feedback', fb: { target: Math.round(c.L * 0.45), d: Math.abs((p ?? 0) - Math.round(c.L * 0.45)), lo: 0, hi: Math.round(c.L * 0.05) } }),
};
const declared = (st: NlViewState) => new Set([...(st.kind === 'calib' ? [0, st.L] : st.labels), ...(st.h2Anchors ?? [])].map(String));

function gate(render: (s: NlViewState) => string) {
  let states = 0; const bad: string[] = [];
  for (const c of CFGS) for (const [kn, mk] of Object.entries(KINDS)) {
    const positions: (number | null)[] = kn === 'idle' ? [null] : Array.from({ length: c.L + 1 }, (_, p) => p);
    let baseKey: string | null = null;
    for (const p of positions) {
      const st = mk(c, p); states++;
      const ex = exposedNumerals(render(st), CSS); const key = setKey(ex.main);
      if (baseKey === null) baseKey = key; else if (key !== baseKey) { bad.push(`${c.name}/${kn}: exposed numerals vary with the flag (p=${p})`); break; }
      for (const n of ex.main) if (!declared(st).has(n)) { bad.push(`${c.name}/${kn}: numeral "${n}" is not a declared anchor (p=${p})`); break; }
      if (kn !== 'feedback' && ex.feedback.size) { bad.push(`${c.name}/${kn}: feedback numerals outside the feedback phase`); break; }
      if (kn === 'feedback' && p === 0 && ex.feedback.size === 0) bad.push(`${c.name}/feedback: feedback subtree shows nothing`);
    }
    if (kn.startsWith('calib')) {
      const m = render(mk(c, Math.round(c.L * 0.37)));
      if (/nl-lens|nl-btn|nl-tick-m/.test(m) || (m.match(/class="nl-tick-l"/g) ?? []).length !== 2) bad.push(`${c.name}/${kn}: calibration markup is not blank`);
    }
  }
  return { states, bad: [...new Set(bad)] };
}

// ---- bots: they may use ONLY what the markup exposes
const unitOfGrain = (m: string): number => ({ fine: 1, coarse: 10 } as Record<string, number>)[(/data-grain="(\w+)"/.exec(m) ?? [])[1]] ?? 0;
function botRate(kind: 'readout' | 'nudge' | 'tick', render: (s: NlViewState) => string, c: Cfg, stateKind: string, seed: string, runs = 1500): number {
  const r = createRng(seed); let pass = 0;
  const idx = new Map<string, number>();
  if (kind === 'readout') for (let p = 0; p <= c.L; p++) for (const n of exposedNumerals(render(KINDS[stateKind](c, p)), CSS).main) if (!idx.has(n)) idx.set(n, p);
  const hasBtn = /nl-btn/.test(render(KINDS[stateKind](c, 0)));
  const lensUnit = unitOfGrain(render(KINDS[stateKind](c, Math.round(c.L / 2))));
  const set = CALIBRATION_TARGETS[c.L as 100 | 1000][0];
  for (let k = 0; k < runs; k++) {
    const est = set.map((t) => {
      if (kind === 'readout') { const p = idx.get(String(t)); return p === undefined ? r.int(0, c.L) : p; }
      if (kind === 'nudge') { const step = c.L <= 100 ? 1 : 10; const nearest = c.labels.reduce((b, a) => (Math.abs(a - t) < Math.abs(b - t) ? a : b), 0); return !hasBtn ? r.int(0, c.L) : nearest + Math.sign(t - nearest) * Math.min(3, Math.round(Math.abs(t - nearest) / step)) * step; }
      return lensUnit ? Math.round(t / lensUnit) * lensUnit : r.int(0, c.L);
    });
    if (scoreCalibration(c.L, set, est).pass) pass++;
  }
  return pass / runs;
}

describe('V6 number-line leak gate', () => {
  it('(b) production view: exposed numerals ⊆ declared anchors, independent of the flag, feedback numerals only in the feedback subtree, calibration blank', () => {
    const g = gate(renderNumberLine);
    expect(g.bad).toEqual([]);
    expect(g.states).toBeGreaterThan(19000);
  });
  it('(d) the frozen F1 mutant is REJECTED by the same gate (teeth)', () => {
    const g = gate(renderLeakyNumberLine);
    expect(g.bad.length).toBeGreaterThan(10);
    expect(g.bad.join('|')).toMatch(/vary with the flag|not a declared anchor/);
  });
  it('(c) readout / nudge-counter / tick-counter bots pass the production CALIBRATION control ≤ 1 %', () => {
    for (const c of [CFGS[1], CFGS[3]]) for (const kind of ['readout', 'nudge', 'tick'] as const) expect(botRate(kind, renderNumberLine, c, 'calibDrag', `bot:${kind}:${c.name}`), `${kind} ${c.name}`).toBeLessThanOrEqual(0.01);
  });
  it('(d) the readout bot beats the calibration on the leaky mutant (≥ 99 %): the bots have teeth too', () => {
    for (const c of [CFGS[1], CFGS[3]]) expect(botRate('readout', renderLeakyNumberLine, c, 'dragging', `leaky:${c.name}`), c.name).toBeGreaterThanOrEqual(0.99);
  });
  it('regular items: the magnifier is ticks only; ◀▶ never appear on a read item; the nudge cap disables the buttons', () => {
    const c = CFGS[0];
    const drag = renderNumberLine(KINDS.dragging(c, 47));
    expect(drag).toMatch(/nl-lens/); expect(drag).not.toMatch(/<text[^>]*nl-lens/);
    expect(renderNumberLine(KINDS.read(c, 47))).not.toMatch(/nl-btn/);
    expect(renderNumberLine(KINDS.placed(c, 47))).toMatch(/aria-label="往左挪"/); expect(renderNumberLine(KINDS.nudgeCap(c, 47))).toMatch(/aria-label="往左挪" disabled/);
    expect(renderNumberLine(KINDS.placed(c, 47))).not.toMatch(/aria-value|<input/);
  });
  it('the number-line CSS has no content: / attr() (a pseudo-element could print the value)', () => {
    expect(CSS).not.toMatch(/content\s*:/); expect(CSS).not.toMatch(/attr\(/);
  });
});
