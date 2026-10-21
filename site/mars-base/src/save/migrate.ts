/** Save migrations (spec §8.5). Table-driven: `migrateTo5(old, from)` is the ONLY function the kit store calls (once) and returns the v5 shape. */
import { defaultSave, nodeState, type MarsSaveV5 } from './schema';

/** The v4 shape written by the first rebuild's orbit/cert/addition/subtraction areas. */
export interface SaveV4 {
  onboardingDone: boolean; activeArea?: string; completed: string[]; skipped: string[]; active?: unknown;
  calibrations: { nodeId: string; at: number; score: { r2: number; slope: number; pae: number; pass: boolean } }[];
  cert: { completed: string[]; active?: unknown }; addition: { completed: string[]; active?: unknown }; subtraction: { completed: string[]; active?: unknown };
}
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);

/** v1–v3 → v4: best effort (no real device has them; kept behind the same table so nothing is lost). */
export function toV4(old: unknown, from: number): SaveV4 {
  if (!isObj(old)) throw new Error('Unsupported Mars save');
  let s: any = { ...old };
  if (from <= 1) s = { ...s, cert: { completed: [] }, addition: { completed: [] }, subtraction: { completed: [] } };
  else if (from === 2) s = { ...s, addition: { completed: [] }, subtraction: { completed: [] } };
  else if (from === 3) s = { ...s, subtraction: { completed: [] } };
  if (!Array.isArray(s.completed) || !Array.isArray(s.skipped) && s.skipped !== undefined) throw new Error('Unsupported Mars save');
  return { skipped: [], calibrations: [], onboardingDone: false, ...s } as SaveV4;
}
const CALIB_NODES = ['orbit.O1.0', 'orbit.O1.4', 'orbit.O2.6'];
const CALIB_SKIPPED = ['orbit.O1.1', 'orbit.O1.2', 'orbit.O1.3', 'orbit.O1.4'];

export function v4ToV5(v4: SaveV4, salt: number): MarsSaveV5 {
  const s = defaultSave(salt);
  const done = [...v4.completed, ...(v4.cert?.completed ?? []), ...(v4.addition?.completed ?? []), ...(v4.subtraction?.completed ?? [])];
  for (const id of new Set(done)) Object.assign(nodeState(s, id), { st: 'done', stars: 1, plays: 1 });
  for (const id of v4.skipped ?? []) Object.assign(nodeState(s, id), { st: 'skipped', stars: 0 });
  // every v4 calibration was a leaky number line: void it (spec D7) and re-open what it had skipped
  for (const id of CALIB_NODES) { const ns = s.nodes[id]; if (ns) { ns.st = 'open'; ns.stars = 0; ns.why = 'voided'; } }
  for (const id of CALIB_SKIPPED) { const ns = s.nodes[id]; if (ns && ns.st === 'skipped') { ns.st = 'open'; ns.why = 'voided'; } }
  s.orbit.tests = (v4.calibrations ?? []).map((c) => ({ node: c.nodeId, L: c.nodeId.endsWith('O2.6') ? 1000 : 100, at: c.at, targets: [], est: [], r2: c.score.r2, slope: c.score.slope, pae: c.score.pae, pass: c.score.pass, valid: false }));
  // active* cannot be restored: the mission re-opens on the same node; onboarding is replayed; the cert wall is gone
  s.onboarded = false; s.tutorials = {}; s.mission = null; s.buildings = {}; s.baseLevel = 1;
  return s;
}
export function migrateTo5(old: unknown, from: number, salt: number): MarsSaveV5 {
  if (from >= 5) return old as MarsSaveV5;
  return v4ToV5(toV4(old, from), salt);
}
