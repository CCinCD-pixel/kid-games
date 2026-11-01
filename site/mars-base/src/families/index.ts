/** Family registry barrel (spec §8.1): static metadata from content/mars-base/families.json + implementations + independent oracles. */
import famJson from '../../../../content/mars-base/families.json';
import type { Answer, FamilyDef, FamilyImpl, FamilyMeta } from '../app/types';
import { ORACLES } from './oracles';
import { PV2 } from './pv2';
import { ADDSUB } from './addsub';
import { PV3 } from './pv3';
import { MUL } from './mul';
import { NL } from './nl';
import { OPEN } from './open';

export const META: Record<string, FamilyMeta> = Object.fromEntries((famJson.families as unknown as FamilyMeta[]).map((f) => [f.id, f]));
export const TAG_PREREQ = famJson.tagPrereq as Record<string, string[]>;
const IMPL: Record<string, FamilyImpl> = { ...PV2, ...ADDSUB, ...PV3, ...MUL, ...NL, ...OPEN };

export const FAMILIES: Record<string, FamilyDef> = {};
for (const [id, impl] of Object.entries(IMPL)) {
  const meta = META[id];
  if (!meta) throw new Error(`family ${id} has an implementation but no row in families.json`);
  const oracle = ORACLES[id];
  if (!oracle) throw new Error(`family ${id} has no oracle`);
  FAMILIES[id] = { ...meta, ...impl, oracle: oracle as (p: unknown, ask?: string) => Answer };
}
/** Families of the table that this build does not implement yet (balance, puzzle, division, money, clock …). */
export const NOT_BUILT: string[] = Object.keys(META).filter((id) => !FAMILIES[id]);
export const isBuilt = (id: string): boolean => id in FAMILIES;
export function family(id: string): FamilyDef {
  const f = FAMILIES[id];
  if (!f) throw new Error(`family ${id} is not built`);
  return f;
}
export { ORACLES } from './oracles';
