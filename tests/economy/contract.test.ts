// Cross-spec contract: docs/specs/star-pets.md (the id generators it defines) vs the ONE ID_RE / event contract in kit/sync (sync.md §8.4).
// The star-pets table is parsed out of the markdown, every placeholder is filled with realistic values from the real content, and the result must pass the server-side validator.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEV_RE, ID_RE, NATURAL_RE, MAX_AMOUNT, validEv, natEvent, validNatural } from '@kit/sync/ledger';

const read = (rel: string): string => fs.readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const pets = read('docs/specs/star-pets.md');
const nodes: { id: string }[] = JSON.parse(read('content/mars-base/nodes.json')).nodes ?? JSON.parse(read('content/mars-base/nodes.json'));
const nodeIds: string[] = (Array.isArray(nodes) ? nodes : Object.values(nodes as object)).map((n: any) => n.id).filter((x: unknown): x is string => typeof x === 'string');
const longestNode = [...nodeIds].sort((a, b) => b.length - a.length)[0] ?? 'orbit.O1.0';

describe('ID_RE is the one charset', () => {
  it('star-pets.md quotes the same regular expression', () => {
    const m = /ID_RE=(\^\[[^\]]+\]\{\d+,\d+\}\$)/.exec(pets);
    expect(m, 'star-pets.md must quote ID_RE').not.toBeNull();
    expect(m![1]).toBe(ID_RE.source);
  });
  it('star-pets.md keeps the 3-96 length range and the device-id pattern of sync.md §8.4', () => {
    expect(pets).toContain('3–96');
    expect(pets).toContain('^[A-Za-z0-9]{1,16}$');
    expect(DEV_RE.source).toBe('^[A-Za-z0-9]{1,16}$');
    expect(MAX_AMOUNT).toBe(100000);
  });
});

// id templates from star-pets.md §3.2: `mn:<节点>:<第几遍>:<d>` `ck:<d>.<序号36>` `b:<物品>` `egg:<线>` `u:<规则>` `g:<物品>` `retro:node:<节点>` + the random id `<d>.<lc36>`
const TEMPLATES: [string, string][] = [
  ['mn:<节点>:<第几遍>:<d>', 'mn:{node}:{n}:{d}'],
  ['ck:<d>.<序号36>', 'ck:{d}.{seq}'],
  ['b:<物品>', 'b:{item}'],
  ['egg:<线>', 'egg:{line}'],
  ['u:<规则>', 'u:{rule}'],
  ['g:<物品>', 'g:{item}'],
  ['retro:node:<节点>', 'retro:node:{node}'],
];
const ITEMS = ['back.dusk', 'ground.steel', 'floor.crate', 'wall.poster', 'ceil.lamp', 'wall.starmap', 'feature.telescope', 'ceil.stalactite', 'feature.crystalL', 'ceil.gearmobile', 'ground.belt', 'item:ceil.lamp'];
const RULES = ['zone:orbit:1', 'prog:orbit:33', 'prog:orbit:100', 'level:4', 'zone:vault:1', 'prog:factory:66', 'runs:5'];
const fill = (t: string, node: string, item: string, rule: string): string => t.replace('{node}', node).replace('{n}', '12').replace('{d}', 'a1b2c3d4').replace('{seq}', 'kz1').replace('{item}', item).replace('{line}', 'dragon').replace('{rule}', rule);

describe('every star-pets id generator passes the validator', () => {
  it.each(TEMPLATES)('%s is documented in star-pets.md', (doc) => { expect(pets.includes(doc), doc).toBe(true); });
  it('the real mars-base node ids exist and the longest one fits all node-based templates', () => {
    expect(nodeIds.length).toBeGreaterThan(20);
    for (const [, t] of TEMPLATES) if (t.includes('{node}')) expect(fill(t, longestNode, '', '').length, `${t} with ${longestNode}`).toBeLessThanOrEqual(96);
  });
  it('all templates x all node ids / items / rules produce valid ids', () => {
    let n = 0;
    for (const [, t] of TEMPLATES) {
      const nodesFor = t.includes('{node}') ? nodeIds : ['x'];
      const itemsFor = t.includes('{item}') ? ITEMS : ['x'];
      const rulesFor = t.includes('{rule}') ? RULES : ['x'];
      for (const node of nodesFor) for (const item of itemsFor) for (const rule of rulesFor) { const id = fill(t, node, item, rule); n++; expect(ID_RE.test(id), id).toBe(true); expect(validEv({ id, d: 'a1b2c3d4', lc: 7, ts: 0, kind: 'earn', amount: 1, src: 's', ref: 'r' }), id).toBe(true); }
    }
    expect(n).toBeGreaterThan(100);
  });
  it('random local ids <d>.<lc36> and the sync.md form <d>.<ts36>.<seq36> are valid (device id up to 16 chars, lc up to 2^40)', () => {
    const d = 'abcdefgh12345678'; expect(DEV_RE.test(d)).toBe(true);
    for (const lc of [0, 1, 35, 1295, 2 ** 33, 2 ** 40]) { const id = `${d}.${lc.toString(36)}`; expect(ID_RE.test(id), id).toBe(true); }
    expect(ID_RE.test(`${d}.${(1790000000000).toString(36)}.${(35).toString(36)}`)).toBe(true);
  });
  it('legacy id classes of sync.md §8.4 (first: m: d1: rf:) still validate, and natural classes are recognised by NATURAL_RE', () => {
    for (const id of ['first:mars-base:orbit.O1.0', 'm:node:orbit.O1.0', 'd1:2026-10-20', 'rf:a1b2c3d4.kz1', 'egg:rover', 'u:level:4', 'g:ceil.lamp', 'retro:node:orbit.O1.0']) { expect(ID_RE.test(id), id).toBe(true); expect(NATURAL_RE.test(id), id).toBe(true); }
    for (const id of ['mn:orbit.O1.0:1:a1b2c3d4', 'ck:a1b2c3d4.kz1', 'b:ceil.lamp', 'a1b2c3d4.kz1']) expect(NATURAL_RE.test(id), id).toBe(false);   // deterministic / random classes are NOT canonical-natural
  });
  it('natural classes of star-pets produce canonical (byte-identical) events', () => {
    const t = { kind: 'grant' as const, amount: 0, src: 'egg', ref: 'dragon' };
    const a = natEvent('egg:dragon', t), b = natEvent('egg:dragon', t);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(validNatural(a, { 'egg:dragon': t })).toBe(true);
  });
});
