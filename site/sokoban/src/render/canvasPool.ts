/**
 * Off-screen canvas pool (spec §6.3, review B16d): reuse canvases by size; released canvases are
 * shrunk to 0×0 so iOS Safari frees their backing store promptly.
 */
const free: HTMLCanvasElement[] = [];

export function takeCanvas(w: number, h: number): HTMLCanvasElement {
  const pw = Math.max(1, Math.ceil(w));
  const ph = Math.max(1, Math.ceil(h));
  const i = free.findIndex((c) => c.width === pw && c.height === ph);
  const c = i >= 0 ? free.splice(i, 1)[0] : free.pop() ?? document.createElement('canvas');
  if (c.width !== pw) c.width = pw;
  if (c.height !== ph) c.height = ph;
  return c;
}

export function releaseCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
  if (free.length < 24) free.push(c);
}

export function poolSize(): number {
  return free.length;
}
