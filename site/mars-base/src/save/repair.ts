/**
 * Structural repair of a v5 save (QA fix-mars-r1 T3). The kit store hands back whatever `data` the envelope holds when `v` matches, so a save
 * that says v:5 but has `{}`, `nodes: null` or wrong types used to crash boot into a permanent blank screen. `repairSave` lays the loaded data over
 * `defaultSave()` field by field: a field of the wrong type falls back to its default, a bad entry inside a record / list is dropped, unknown keys are kept
 * (a newer v5 build may have added them). It never throws. `changed` tells the caller to keep the raw string under a `:corrupt-<ts>` backup key.
 */
import { defaultSave, type MarsSaveV5 } from './schema';

type Sch = 'bool' | 'num' | 'str' | 'any' | { arr: Sch } | { rec: Sch } | { obj: Record<string, Sch> } | { opt: Sch } | { nul: Sch } | { in: readonly string[] };
const BAD = Symbol('bad');
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** returns the repaired value, or `BAD` when `v` is unusable and `dflt` is BAD too */
function fix(v: unknown, s: Sch, dflt: unknown): unknown {
  if (s === 'any') return v === undefined ? dflt : v;
  if (s === 'bool') return typeof v === 'boolean' ? v : dflt;
  if (s === 'num') return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  if (s === 'str') return typeof v === 'string' ? v : dflt;
  if ('in' in s) return typeof v === 'string' && s.in.includes(v) ? v : dflt;
  if ('opt' in s) { if (v === undefined) return undefined; const r = fix(v, s.opt, BAD); return r === BAD ? (dflt === BAD ? BAD : undefined) : r; }
  if ('nul' in s) { if (v === null) return null; const r = fix(v, s.nul, BAD); return r === BAD ? (dflt === BAD ? BAD : null) : r; }
  if ('arr' in s) return Array.isArray(v) ? v.filter((x) => fix(x, s.arr, BAD) !== BAD) : dflt;
  if ('rec' in s) {
    if (!isObj(v)) return dflt;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { const f = fix(x, s.rec, BAD); if (f !== BAD) out[k] = f; }
    return out;
  }
  if (!isObj(v)) return dflt;
  const out: Record<string, unknown> = { ...v };
  const d = isObj(dflt) ? dflt : {};
  for (const [k, sub] of Object.entries(s.obj)) {
    const f = fix(v[k], sub, dflt === BAD ? BAD : d[k]);
    if (f === BAD) return BAD;
    if (f === undefined) delete out[k]; else out[k] = f;
  }
  return out;
}

const NODE: Sch = { obj: { st: { in: ['open', 'done', 'skipped'] }, stars: 'num', plays: 'num', ft: { arr: 'num' } } };
const TAG: Sch = { obj: { level: 'num', streak: 'num', window: 'str', tailNoHint: 'num', mastered: 'bool', reviews: { arr: 'num' }, repDown: 'num', wrongRun: 'num' } };
const CERT: Sch = { obj: { state: { in: ['none', 'lit', 'half'] }, attempts: 'num' } };
const MISSION: Sch = { obj: { node: 'str', kind: { in: ['node', 'probe', 'wall', 'challenge'] }, idx: 'num', items: { arr: { obj: { key: 'str', fam: 'str', band: 'num', level: 'num', mode: 'str' } } }, results: { arr: { obj: { keyHash: 'str', fam: 'str' } } }, startedAt: 'num', activeMs: 'num', facts: { arr: 'str' }, seedBase: 'str', plan: { obj: { node: 'str', kind: 'str', slots: { arr: 'any' }, seedBase: 'str' } } } };
const SHAPE: Record<keyof MarsSaveV5, Sch> = {
  onboarded: 'bool', tutorials: { rec: 'bool' }, salt: 'num',
  session: { obj: { index: 'num', lastActiveAt: 'num', missions: 'num' } },
  nodes: { rec: NODE }, tags: { rec: TAG },
  cert: { obj: { C1: CERT, C2: CERT, C3: CERT } },
  probes: { obj: { factory: { obj: { done: 'bool' } }, balance: { obj: { done: 'bool' } }, vault: { obj: { done: 'bool' } } } },
  orbit: { obj: { tests: { arr: { obj: { node: 'str', L: 'num', at: 'num', targets: { arr: 'num' }, est: { arr: 'num' }, r2: 'num', slope: 'num', pae: 'num', pass: 'bool', valid: 'bool' } } } } },
  mission: { nul: MISSION },
  zoneHist: { rec: { arr: 'num' } }, lastPlayed: { rec: 'num' }, visited: { arr: 'str' }, buildings: { rec: 'num' }, baseLevel: 'num', cards: { arr: 'str' }, checker: 'num',
  race: { obj: { games: 'num', inProgress: 'any' } }, errors: { rec: { obj: { n: 'num', recent: { arr: { obj: { fam: 'str', at: 'num' } } } } } }, recent: { arr: 'str' },
  challenge: { opt: { obj: { plays: 'num', best: 'num' } } },
  settings: { obj: { music: 'bool', liveReadout: 'bool' } }, directOffer: { opt: { nul: { obj: { zone: 'str' } } } }, direct: { obj: { pending: { arr: { obj: { node: 'str', tags: { arr: 'str' } } } } } },
};

export interface Repaired { save: MarsSaveV5; changed: boolean }
/** Never throws. `changed` = something was missing / the wrong type / dropped (a clean current save comes back identical). */
export function repairSave(raw: unknown, salt: number): Repaired {
  const dflt = defaultSave(salt);
  if (!isObj(raw)) return { save: dflt, changed: true };
  const out: Record<string, unknown> = { ...raw };
  for (const k of Object.keys(SHAPE) as (keyof MarsSaveV5)[]) {
    const f = fix(raw[k], SHAPE[k], (dflt as unknown as Record<string, unknown>)[k]);
    if (f === undefined) delete out[k]; else out[k] = f === BAD ? (dflt as unknown as Record<string, unknown>)[k] : f;
  }
  let changed = false;
  try { changed = JSON.stringify(out) !== JSON.stringify(raw); } catch { changed = true; }
  return { save: out as unknown as MarsSaveV5, changed };
}
