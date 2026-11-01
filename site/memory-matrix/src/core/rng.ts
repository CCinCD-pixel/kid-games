// The oracle's rng.mjs is a port of kit/rng.ts (FNV-1a + mulberry32), so the page uses the kit's generator (spec §10.1 "随机全走 kit/rng") and adds the
// one method only the simulated child needs (gauss). The golden fixtures prove the streams are identical.
import { createRng as kitCreateRng, hashString, type Rng } from '@kit/rng';

export type MmRng = Rng & { gauss(): number };
export { hashString };
export function createRng(seed: number | string): MmRng {
  const r = kitCreateRng(seed) as MmRng;
  r.gauss = () => { let u = 0; while (u === 0) u = r.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r.next()); };
  return r;
}
