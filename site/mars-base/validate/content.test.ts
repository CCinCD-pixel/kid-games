/** V8 content lint on the REAL data files (spec §9 V8): structure, DI rules, typed-integer share, probes, banned words, narration counts. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain .mjs tool, no type declarations
import { lintTone } from '../../../tools/check-content.mjs';
import { META, TAG_PREREQ } from '../src/families';
import { NODES, NODE_BY_ID, PROBES, CERT_MAP } from '../src/app/content';
import { REMEDIAL_CHAPTERS, MAIN_CHAPTERS } from '../src/app/tuning';

const root = new URL('../../../', import.meta.url);
const J = (f: string) => JSON.parse(readFileSync(new URL(`content/mars-base/${f}`, root), 'utf8'));
const { chapters } = J('nodes.json') as { chapters: Record<string, string> };
const { lines } = J('lines.json') as { lines: { id: string; role: string; text: string; scope?: string; fragment?: boolean; devOnly?: boolean }[] };
const { cards, talk } = J('cards.json') as { cards: { id: string; title: string; body: string }[]; talk: { id: string; text: string }[] };
const vis = (t: string) => t.replace(/\{\w+\}/g, 'xxx').replace(/[\s，。！？、：；“”‘’（）《》…—·,.!?:;()"'/+\-×÷=□<>]/g, '').length;
const SIZE: Record<string, number> = { normal: 6, boss: 8, breather: 4, calib: 12 };
const BAN = /认证|考试|没通过|失败|两站|五块|五张|自己来|位值|交换律|四分之一|直达/;
const main = NODES.filter((n) => (MAIN_CHAPTERS as readonly string[]).includes(n.chapter) || n.id === 'balance.B2.1');
const rem = NODES.filter((n) => (REMEDIAL_CHAPTERS as readonly string[]).includes(n.chapter));
const scored = (ns: typeof NODES) => ns.filter((n) => n.kind !== 'calib' && n.kind !== 'breather');
const typed = (ns: typeof NODES) => scored(ns).reduce((s, n) => s + n.items.reduce((a, i) => a + i.count * (META[i.fam]?.typedMax ?? 1), 0), 0);
const count = (ns: typeof NODES) => scored(ns).reduce((s, n) => s + n.items.reduce((a, i) => a + i.count, 0), 0);

describe('V8 nodes', () => {
  it('ids unique, sizes 6/8/4/12, bands in range, open.* only in breathers, bosses mix ≥3 families', () => {
    const ids = new Set<string>();
    for (const n of NODES) {
      expect(ids.has(n.id), n.id).toBe(false); ids.add(n.id);
      expect(n.items.reduce((s, i) => s + i.count, 0), n.id).toBe(SIZE[n.kind]);
      for (const it of n.items) {
        const f = META[it.fam]; expect(f, `${n.id} ${it.fam}`).toBeDefined();
        if (it.band) expect(it.band, `${n.id} ${it.fam}`).toBeLessThanOrEqual(f.bands);
        expect(n.kind === 'breather', `${n.id} ${it.fam}`).toBe(it.fam.startsWith('open.'));
      }
      if (n.kind === 'boss') expect(new Set(n.items.map((x) => x.fam)).size, n.id).toBeGreaterThanOrEqual(3);
      if (n.kind === 'boss' || n.kind === 'breather') expect(n.newElement, n.id).toBeFalsy();
    }
  });
  it('titles ≤ 8 characters, teaches ≤ 40, tone rules, no banned words, explain indices valid', () => {
    for (const n of NODES) {
      expect(n.teaches?.trim().length, n.id).toBeGreaterThan(0);
      expect(vis(n.title), n.id).toBeLessThanOrEqual(8); expect(vis(n.teaches), n.id).toBeLessThanOrEqual(40);
      for (const s of [n.title, n.teaches, n.newElement ?? '']) { expect(lintTone(s), `${n.id} ${s}`).toEqual([]); expect(BAN.test(s), `${n.id} ${s}`).toBe(false); }
      for (const k of n.explain ?? []) { expect(k).toBeGreaterThanOrEqual(1); expect(k).toBeLessThanOrEqual(n.items.reduce((s, i) => s + i.count, 0)); }
    }
  });
  it('difficulty index: Boss = chapter max, breather 2.0–2.4, adjacent steps ≤ +30 %, breather right after a main Boss, expectedFirstTry in 75–88 %', () => {
    const byCh: Record<string, typeof NODES> = {};
    for (const n of NODES) (byCh[n.chapter] ??= []).push(n);
    for (const [ch, list] of Object.entries(byCh)) {
      expect(chapters[ch], ch).toBeTruthy();
      const sc = list.filter((n) => n.kind !== 'breather');
      for (let k = 1; k < sc.length; k++) expect(sc[k].di, `${sc[k].id}`).toBeLessThanOrEqual(sc[k - 1].di * 1.3 + 1e-9);
      const boss = list.find((n) => n.kind === 'boss');
      if (boss) { expect(boss.di, boss.id).toBeGreaterThanOrEqual(Math.max(...sc.map((n) => n.di))); if (!ch.startsWith('C')) expect(list[list.indexOf(boss) + 1]?.kind, ch).toBe('breather'); }
    }
    for (const n of NODES) {
      if (n.kind === 'breather') { expect(n.di).toBeGreaterThanOrEqual(2.0); expect(n.di).toBeLessThanOrEqual(2.4); }
      if ((n.kind === 'normal' || n.kind === 'boss') && !n.items.some((x) => x.fam.startsWith('bal.open'))) { expect(n.expectedFirstTry, n.id).toBeGreaterThanOrEqual(0.75); expect(n.expectedFirstTry, n.id).toBeLessThanOrEqual(0.88); }
    }
  });
  it('typed-integer share: main ≤ 30 %, each zone ≤ 35 %, node ≤ 4 of 6 (Boss ≤ 5 of 8), remedial ≤ 70 %', () => {
    expect(typed(main) / count(main)).toBeLessThanOrEqual(0.3);
    for (const z of ['orbit', 'vault', 'factory', 'balance']) { const ns = main.filter((n) => n.zone === z); expect(typed(ns) / count(ns), z).toBeLessThanOrEqual(0.35); }
    for (const n of scored(main)) { const t = n.items.reduce((a, i) => a + Math.ceil(i.count * (META[i.fam].typedMax ?? 1)), 0); if (n.zone !== 'orbit') expect(t, n.id).toBeLessThanOrEqual(n.kind === 'boss' ? 5 : 4); }
    expect(typed(rem) / count(rem)).toBeLessThanOrEqual(0.7);
    for (const f of Object.values(META).filter((x) => x.typedMax !== undefined)) { expect(f.hint1, f.id).toBeTruthy(); expect(f.answerModes?.length, f.id).toBeGreaterThan(0); expect(f.l6, f.id).toBeDefined(); expect(f.guessP, f.id).toBeDefined(); }
  });
  it('probes: 3 items, known families, skips never touch a Boss or breather; certMap points at real nodes; tags have prerequisites', () => {
    for (const [z, pr] of Object.entries(PROBES)) {
      expect(pr.items.length, z).toBe(3);
      for (const it of pr.items) expect(META[it.fam], `${z} ${it.fam}`).toBeDefined();
      for (const ids of Object.values(pr.skip)) for (const id of ids) { const nd = NODE_BY_ID[id] ?? JSON.parse(readFileSync(new URL('content/mars-base/nodes.json', root), 'utf8')).nodes.find((x: { id: string }) => x.id === id); expect(nd, id).toBeDefined(); expect(['boss', 'breather']).not.toContain(nd.kind); }
    }
    for (const m of Object.values(CERT_MAP)) for (const id of Object.values(m)) expect(NODE_BY_ID[id], id).toBeDefined();
    for (const f of Object.values(META)) if (f.tag) expect(f.tag in TAG_PREREQ, f.tag).toBe(true);
  });
});

describe('V8 lines and cards', () => {
  const v1 = lines.filter((l) => l.scope === 'v1');
  it('ids unique and well-formed, roles known, tone rules, length limits (≤15 subtitles; titles ≤8; cards ≤40)', () => {
    const seen = new Set<string>();
    for (const l of lines) {
      expect(seen.has(l.id), l.id).toBe(false); seen.add(l.id);
      expect(l.id, l.id).toMatch(/^mars\.[a-z0-9][a-z0-9_.:-]*$/i);
      expect(['narrator', 'companion', 'word', 'dad'], l.id).toContain(l.role);
      expect(lintTone(l.text), `${l.id} ${l.text}`).toEqual([]);
      const limit = l.id.startsWith('mars.card.') && !l.id.endsWith('.title') ? 40 : l.id.startsWith('mars.talk.') ? 20 : l.id.startsWith('mars.node.') ? 8 : /^mars\.(teach\.tipDad)$/.test(l.id) ? 30 : 15;
      expect(vis(l.text), `${l.id} "${l.text}"`).toBeLessThanOrEqual(limit);
    }
    for (const n of NODES) expect(seen.has(`mars.node.${n.id.replace(/^\w+\./, '')}`), `title line for ${n.id}`).toBe(true);
    for (const c of cards) { expect(lintTone(c.title)).toEqual([]); expect(lintTone(c.body)).toEqual([]); }
    for (const t of talk) expect(lintTone(t.text), t.id).toEqual([]);
  });
  it('child-visible v1 text has none of the exam / jargon words', () => {
    for (const l of v1.filter((x) => !x.id.startsWith('mars.num.'))) expect(BAN.test(l.text), `${l.id} "${l.text}"`).toBe(false);
  });
  it('every hint1 line and the four number-line hint lines exist', () => {
    const ids = new Set(lines.map((l) => l.id));
    for (const f of Object.values(META).filter((x) => x.hint1 && x.hint1 !== 'mars.h1.nl.*')) expect(ids.has(f.hint1!), f.hint1).toBe(true);
    for (const k of ['ten', 'hund', 'half', 'end']) expect(ids.has(`mars.h1.nl.${k}`), k).toBe(true);
  });
  it('narration budget (scope v1): sentences ≤ 400, total ≤ 1450', () => {
    const sentences = v1.filter((l) => !l.fragment && !l.devOnly && !l.id.startsWith('mars.num.'));
    const nums = v1.filter((l) => l.id.startsWith('mars.num.'));
    expect(sentences.length).toBeLessThanOrEqual(400); expect(v1.length).toBeLessThanOrEqual(1450);
    expect(nums.length).toBe(1001);
  });
});
