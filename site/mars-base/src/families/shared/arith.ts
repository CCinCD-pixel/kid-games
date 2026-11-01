/**
 * The ONLY arithmetic that the generators and the independent oracles may share (spec §8.1 / V2).
 * Everything here is tiny, total, and unit-tested; a bug here would be caught by the golden tests.
 */
export const ones = (n: number): number => n % 10;
export const tens = (n: number): number => Math.floor(n / 10) % 10;
export const hund = (n: number): number => Math.floor(n / 100) % 10;
export const rev2 = (n: number): number => Number(String(n).split('').reverse().join(''));
export const dropZeros = (n: number): number => Number(String(n).replace(/0/g, '') || '0');

/** Column addition without carrying (the noCarry misconception). */
export function colAddNoCarry(a: number, b: number): number {
  let r = 0; let m = 1;
  while (a > 0 || b > 0) { r += (((a % 10) + (b % 10)) % 10) * m; a = Math.floor(a / 10); b = Math.floor(b / 10); m *= 10; }
  return r;
}
/** Column subtraction taking the absolute difference per column (smallerFromLarger). */
export function colSubAbs(a: number, b: number): number {
  let r = 0; let m = 1;
  while (a > 0 || b > 0) { r += Math.abs((a % 10) - (b % 10)) * m; a = Math.floor(a / 10); b = Math.floor(b / 10); m *= 10; }
  return r;
}
export function needsCarry(a: number, b: number): boolean {
  while (a > 0 || b > 0) { if ((a % 10) + (b % 10) >= 10) return true; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return false;
}
export function needsBorrow(a: number, b: number): boolean {
  while (b > 0) { if ((a % 10) < (b % 10)) return true; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return false;
}
export const sym = (a: number, b: number): '>' | '<' | '=' => (a > b ? '>' : a < b ? '<' : '=');
/** The leftmost place at which two numbers differ. */
export function decisivePlace(a: number, b: number): 'hundreds' | 'tens' | 'ones' | 'thousands' {
  if (Math.floor(a / 1000) !== Math.floor(b / 1000)) return 'thousands';
  if (hund(a) !== hund(b)) return 'hundreds';
  if (tens(a) !== tens(b)) return 'tens';
  return 'ones';
}
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const sorted = (xs: readonly number[]): number[] => [...xs].sort((p, q) => p - q);
/** Stable string key of a params object (distinct facts). */
export const factKey = (fam: string, p: unknown): string => fam + ':' + JSON.stringify(p);
