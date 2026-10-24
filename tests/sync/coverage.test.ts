// Coverage / drift guards:
//  (1) leaf coverage over the REAL defaults() of every store whose code can be imported (no game is run), and over FULL fixtures (maps populated: defaults() has empty maps and hides record fields);
//  (2) interface drift: every member of the save TYPE (read from source) has a rule and every rule has a member — "add a field without a rule" fails here (and, in the games, at compile time via RuleOf<T>);
//  (3) caps in the rules == the caps the games trim to; (4) every createStore id in the tree is registered; (5) step pointers rank over the real lesson catalogs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coverage, merge, emptyState } from '@kit/sync/merge';
import type { Rule } from '@kit/sync/rules';
import { REAL_DEFAULTS } from './support/real';
import { DEFAULTS, GAME_CAPS, LESSON_STEPS, MIRRORED, NOT_SYNCED, SAMPLES, SCHEMAS, STEP_ORDER, STORE_IDS } from './support/schemas';
import { interfaceTree, readSrc, resolveType, type FieldTree } from './support/iface';
import { R } from '@kit/sync/rules';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

describe('leaf coverage', () => {
  for (const name of Object.keys(REAL_DEFAULTS)) {
    it(`${name}: every leaf of the REAL defaults() has a rule other than any`, () => {
      const c = coverage(SCHEMAS[name]!, REAL_DEFAULTS[name]!());
      expect(c.any, `uncovered leaves in ${name}`).toEqual([]);
      expect(c.total).toBeGreaterThan(0);
    });
    it(`${name}: every top-level key of the REAL defaults() is declared in the rule tree`, () => {
      const rule = SCHEMAS[name] as Extract<Rule, { k: 'obj' }>;
      const missing = Object.keys(REAL_DEFAULTS[name]!()).filter((k) => !(k in rule.fields));
      expect(missing).toEqual([]);
    });
  }
  it('mirrored stores (code not importable yet): chess, economy, hub-seen, metrics', () => { expect(MIRRORED.sort()).toEqual(['chess', 'economy', 'hub-seen', 'metrics']); });
  it('full-field fixtures: every leaf is covered by a rule or declared device-local; no `any`', () => {
    let total = 0, covered = 0, local = 0;
    for (const name of Object.keys(SAMPLES)) {
      const c = coverage(SCHEMAS[name]!, SAMPLES[name]);
      expect(c.any, `${name} fixture leaves covered only by any`).toEqual([]);
      const d = coverage(SCHEMAS[name]!, DEFAULTS[name]);
      expect(d.any, `${name} defaults leaves covered only by any`).toEqual([]);
      total += c.total; covered += c.covered; local += c.local;
    }
    expect(covered + local).toBe(total);
    expect(total).toBeGreaterThanOrEqual(364);
  });
  it('a new field added to a record inside a map WITHOUT a rule is caught by the fixture but invisible on defaults()', () => {
    const fx = JSON.parse(JSON.stringify(SAMPLES.sokoban));
    fx.levels.C1.bestTimeMs = 5;
    expect(coverage(SCHEMAS.sokoban!, fx).any.some((p) => p.endsWith('bestTimeMs'))).toBe(true);
    expect(coverage(SCHEMAS.sokoban!, REAL_DEFAULTS.sokoban!()).any).toEqual([]);          // the real defaults() has no level records at all
  });
});

// ---- interface drift
const TYPES: Record<string, { file: string; type: string; also?: string[] }> = {
  xiangqi: { file: 'site/xiangqi/src/progress/save.ts', type: 'XqSave' },
  'mars-base': { file: 'site/mars-base/src/save/schema.ts', type: 'MarsSaveV5' },
  'gear-fort': { file: 'site/gear-fort/src/save.ts', type: 'SaveV1' },
  'snake-battle': { file: 'site/snake-battle/src/save.ts', type: 'SbSaveV1' },
  sokoban: { file: 'site/sokoban/src/app/save.ts', type: 'SaveV1' },
  'military-chess': { file: 'site/military-chess/src/ctrl/save.ts', type: 'SaveV1' },
  'emoji-match': { file: 'site/emoji-match/src/save.ts', type: 'EmSaveV1' },
  settings: { file: 'kit/settings.ts', type: 'Settings' },
};
/** rule fields that exist ON PURPOSE without a member in the type (added by the sync layer), by path */
const SYNC_ADDED: Record<string, string[]> = { 'mars-base': ['$.nodes.*.g'] };
function drift(name: string, root: Rule = SCHEMAS[name]!): string[] {
  const t = TYPES[name]!; const src = readSrc(t.file); const out: string[] = [];
  const lookup = (n: string): FieldTree | null => { try { return interfaceTree(src, n); } catch { return null; } };
  const walk = (rule: Rule, tree: FieldTree, p: string): void => {
    if (rule.k !== 'obj' && rule.k !== 'gv') return;
    const rk = Object.keys(rule.fields), ik = Object.keys(tree).filter((k) => k !== '*');
    for (const k of ik) if (!rk.includes(k)) out.push(`${p}.${k}: in the TYPE but has no merge rule`);
    for (const k of rk) if (!ik.includes(k) && !tree['*'] && !(SYNC_ADDED[name] ?? []).includes(`${p}.${k}`)) out.push(`${p}.${k}: rule for a field the TYPE does not have`);
    for (const k of rk) {
      if (!(k in tree)) continue; const r = rule.fields[k]!; const child = tree[k]!; const resolve = (x: string | FieldTree): FieldTree | null => (typeof x === 'string' ? resolveType(x, lookup) : x);
      if (r.k === 'obj' || r.k === 'gv') { const c = resolve(child); if (c) walk(r, c, `${p}.${k}`); }
      else if (r.k === 'map' && (r.of.k === 'obj' || r.of.k === 'gv')) { const c = typeof child === 'string' ? resolveType(child, lookup) : null; if (c) walk(r.of, c, `${p}.${k}.*`); }
    }
  };
  walk(root, interfaceTree(src, t.type), '$');
  return out;
}
describe('interface drift: save types vs merge rules', () => {
  for (const name of Object.keys(TYPES)) it(`${name}: rule tree and TS type list the same fields (records inside maps included)`, () => { expect(drift(name)).toEqual([]); });
  it('the drift check itself works: a missing rule and a stale rule inside a map record are both reported', () => {
    const sok = SCHEMAS.sokoban as Extract<Rule, { k: 'obj' }>; const lv = sok.fields.levels as Extract<Rule, { k: 'map' }>; const rec = lv.of as Extract<Rule, { k: 'obj' }>;
    const { twinStars: _dropped, ...rest } = rec.fields;
    const broken: Rule = { ...sok, fields: { ...sok.fields, levels: { k: 'map', of: { ...rec, fields: { ...rest, ghost: R.max } } } } };
    expect(drift('sokoban', broken)).toEqual(['$.levels.*.twinStars: in the TYPE but has no merge rule', '$.levels.*.ghost: rule for a field the TYPE does not have']);
  });
});

describe('caps', () => {
  const capRules = (r: Rule, p = '$', out: { p: string; cap: number; k: string }[] = []): typeof out => {
    if (r.k === 'ring' || r.k === 'fifo' || (r.k === 'set' && r.cap < 4000)) out.push({ p, cap: r.cap, k: r.k });
    if (r.k === 'obj' || r.k === 'gv') for (const [k, x] of Object.entries(r.fields)) capRules(x, p + '.' + k, out);
    if (r.k === 'map') capRules(r.of, p + '.*', out);
    return out;
  };
  it('every capped rule equals the cap the game trims to', () => {
    let n = 0;
    for (const name of Object.keys(SCHEMAS)) for (const c of capRules(SCHEMAS[name]!)) { n++; const key = name + c.p.slice(1); if (key in GAME_CAPS) expect(GAME_CAPS[key], key).toBe(c.cap); else if (name !== 'demo' && c.k !== 'set') throw new Error(`capped rule ${key} (${c.k} cap ${c.cap}) has no GAME_CAPS entry`); }
    expect(n).toBeGreaterThanOrEqual(13);
    expect(Object.keys(GAME_CAPS).length).toBeGreaterThanOrEqual(10);
  });
});

describe('store registry', () => {
  function walk(dir: string, out: string[]): void {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/^(tests?|tools|validate|fixtures)$/.test(e.name)) walk(f, out); } else if (/\.(ts|js|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(f);
    }
  }
  const files: string[] = []; for (const d of ['kit', 'site', 'engines']) walk(path.join(REPO, d), files);
  const found = new Set<string>();
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8'); if (!/create(?:Board)?Store/.test(s)) continue;
    const consts = Object.fromEntries([...s.matchAll(/const\s+([A-Z_]+)\s*=\s*'([a-z0-9:-]+)'/g)].map((m) => [m[1]!, m[2]!]));
    for (const m of s.matchAll(/create(?:Board)?Store(?:<[^>(]*>)?\(\s*(?:['"]([a-z0-9:-]+)['"]|([A-Z_]+))\s*,/g)) { const id = m[1] ?? consts[m[2]!]; if (id) found.add(id); }
  }
  it('every createStore / createBoardStore id found in kit/ site/ engines/ is a sync slot or explicitly not synced', () => {
    const known = new Set([...STORE_IDS, ...NOT_SYNCED.filter((key) => /^kg:v1:[a-z0-9-]+$/.test(key)).map((key) => key.slice('kg:v1:'.length))]);
    expect([...found].filter((i) => !known.has(i))).toEqual([]);
  });
  it('the stores with importable defaults are really created in the tree (the grep finds them)', () => {
    for (const id of Object.keys(REAL_DEFAULTS).filter((i) => i !== 'settings')) expect(found.has(id), id).toBe(true);
  });
  it('the registry lists the not-synced key families', () => { expect(NOT_SYNCED).toEqual(expect.arrayContaining(['kg:log:v1', 'kg:sync:*', 'kg:clock:v1', 'kg:v1:mars-base:corrupt-*'])); });
});

describe('step pointers rank over the REAL lesson catalogs', () => {
  const natCmp = (a: string, b: string): number => { const ta = a.match(/\d+|\D+/g) ?? [], tb = b.match(/\d+|\D+/g) ?? []; for (let i = 0; i < Math.min(ta.length, tb.length); i++) { const x = ta[i]!, y = tb[i]!; if (x === y) continue; if (/^\d/.test(x) && /^\d/.test(y)) { const d = Number(x) - Number(y); if (d) return d; } else return x < y ? -1 : 1; } return ta.length - tb.length; };
  for (const [g, order] of Object.entries(STEP_ORDER)) it(`${g}: rank-over-catalog picks the later step for every pair inside a lesson; plain string max and natural order do not`, () => {
    expect(order.length).toBeGreaterThan(50);       // the real catalog, not the 5-id stand-in
    const rule = R.obj<any>({ s: R.rank(order) }); let pairs = 0, wrong = 0, strWrong = 0, natWrong = 0;
    for (const lesson of LESSON_STEPS[g]!) for (let a = 0; a < lesson.length; a++) for (let b = a + 1; b < lesson.length; b++) {
      const i = order.indexOf(lesson[a]!), j = order.indexOf(lesson[b]!); pairs++;
      const m = merge(rule, { d: { s: order[i] }, st: {} }, { d: { s: order[j] }, st: {} }); const m2 = merge(rule, { d: { s: order[j] }, st: {} }, { d: { s: order[i] }, st: {} });
      if (m.d.s !== order[j] || m2.d.s !== order[j]) wrong++; if (!(order[i]! < order[j]!)) strWrong++; if (natCmp(order[i]!, order[j]!) >= 0) natWrong++;
    }
    expect(wrong).toBe(0);
    expect(pairs).toBeGreaterThan(100);
    expect(strWrong).toBeGreaterThan(0);              // the failure being prevented is real on this data (xiangqi 11, chess 16 pairs in the prototype run)
    if (g === 'xiangqi') expect(natWrong).toBeGreaterThan(0);
    expect(merge(rule, { d: { s: 'zz-new-token' }, st: {} }, emptyState()).d.s).toBe('zz-new-token');   // unknown token: carried as a passenger
  });
});
