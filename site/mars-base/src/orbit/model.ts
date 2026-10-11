import nodesData from '../../../../content/mars-base/nodes.json';

export const CALIBRATION_TARGETS = {
  100: [3, 7, 12, 18, 25, 33, 42, 51, 64, 71, 86, 93],
  1000: [6, 18, 34, 78, 122, 163, 246, 366, 486, 606, 754, 938],
} as const;

export interface OrbitItem {
  family: 'nl.calib' | 'nl.place' | 'nl.read' | 'nl.zoom';
  target: number;
  length: 100 | 1000;
  anchors: number[];
  tolerance: number;
  zoom?: [number, number];
}

export interface OrbitNode {
  id: string;
  chapter: string;
  kind: string;
  title: string;
  teaches: string;
  items: { fam: string; count: number; L?: number; anchors?: string; tol?: number }[];
  buildingPart?: { id: string; name: string };
}

export const ORBIT_NODES = (nodesData.nodes as OrbitNode[]).filter((node) => node.id.startsWith('orbit.'));

export interface CalibrationScore {
  r2: number;
  slope: number;
  pae: number;
  pass: boolean;
}

export function scoreCalibration(length: 100 | 1000, targets: number[], estimates: number[]): CalibrationScore {
  if (targets.length !== 12 || estimates.length !== targets.length || estimates.some((v) => !Number.isFinite(v) || v < 0 || v > length)) {
    throw new Error('A calibration needs twelve valid flags');
  }
  const mx = targets.reduce((a, b) => a + b, 0) / targets.length;
  const my = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (let i = 0; i < targets.length; i++) {
    const dx = targets[i] - mx;
    const dy = estimates[i] - my;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const slope = xy / xx;
  const r2 = yy === 0 ? 0 : (xy * xy) / (xx * yy);
  const pae = targets.reduce((sum, target, i) => sum + Math.abs(target - estimates[i]), 0) / targets.length / length;
  return { r2, slope, pae, pass: r2 >= 0.9 && slope >= 0.9 && slope <= 1.1 && pae <= (length === 100 ? 0.1 : 0.15) };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function anchorsFor(kind: string | undefined, length: number): number[] {
  if (kind === 'every10') return Array.from({ length: 11 }, (_, i) => i * 10);
  if (kind === 'every100') return Array.from({ length: 11 }, (_, i) => i * 100);
  if (kind === 'half') return [0, length / 2, length];
  return [0, length];
}

export function makeOrbitItems(node: OrbitNode, seed: number): OrbitItem[] {
  const random = rng(seed);
  const used = new Set<number>();
  const result: OrbitItem[] = [];
  for (const block of node.items) {
    const length = block.L === 1000 || block.fam === 'nl.zoom' ? 1000 : 100;
    const family = block.fam as OrbitItem['family'];
    const candidates = shuffled(Array.from({ length: length - 1 }, (_, i) => i + 1), random);
    const fixed = family === 'nl.calib' ? shuffled(CALIBRATION_TARGETS[length], random) : [];
    for (let i = 0; i < block.count; i++) {
      let target = fixed[i] ?? candidates.find((n) => !used.has(n));
      if (target === undefined) throw new Error(`Not enough orbit targets for ${node.id}`);
      used.add(target);
      result.push({ family, target, length, anchors: family === 'nl.calib' ? [0, length] : anchorsFor(block.anchors, length), tolerance: family === 'nl.zoom' ? 0 : block.tol ?? (length === 100 ? 5 : 50) });
    }
  }
  return result;
}

export function evaluateOrbitItem(item: OrbitItem, answer: number): 'exact' | 'close' | 'retry' {
  const distance = Math.abs(item.target - answer);
  if (item.family === 'nl.calib') return 'exact';
  if (distance <= item.tolerance) return 'exact';
  return distance <= item.tolerance * 2 ? 'close' : 'retry';
}
