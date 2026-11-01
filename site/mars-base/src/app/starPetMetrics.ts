import type { ItemResult } from './types';

export const STAR_METRICS_KEY = 'kg:metrics:v1:star-pets';
export interface StarSetMetric {
  id: string;
  at: number;
  src: 'mission' | 'check';
  setMs: number;
  medianMs: number;
  ft: number;
  flagged: boolean;
}
export interface StarMetrics { v: 1; groups: StarSetMetric[] }

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length ? Math.round((sorted[mid]! + sorted[(sorted.length - 1) >> 1]!) / 2) : 0;
};

export function readStarMetrics(storage?: Storage): StarMetrics {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(STAR_METRICS_KEY) ?? 'null') as StarMetrics | null;
    if (raw?.v === 1 && Array.isArray(raw.groups)) return { v: 1, groups: raw.groups.filter((g) =>
      typeof g?.id === 'string' && Number.isSafeInteger(g.at) && (g.src === 'mission' || g.src === 'check')
      && Number.isFinite(g.setMs) && Number.isFinite(g.medianMs) && Number.isFinite(g.ft) && typeof g.flagged === 'boolean',
    ).slice(-20) };
  } catch { /* metrics never interrupt play */ }
  return { v: 1, groups: [] };
}

export function summarizeStarSet(
  id: string, at: number, src: StarSetMetric['src'], results: readonly ItemResult[], prior: readonly StarSetMetric[], newElement = false,
): StarSetMetric {
  const all = results.filter((r) => r.slot === 'main' || r.slot === 'check');
  const eligible = (newElement ? all.slice(2) : all).filter((r) => !r.assisted && Number.isFinite(r.ms));
  const ft = eligible.length ? eligible.filter((r) => r.firstTry).length / eligible.length : 0;
  const medianMs = median(eligible.map((r) => Math.max(0, r.ms ?? 0)));
  const accurate = prior.filter((g) => !g.flagged && g.ft >= 0.7).slice(-10);
  const baseline = median(accurate.map((g) => g.medianMs)) || 30_000;
  return {
    id, at, src, setMs: all.reduce((sum, r) => sum + Math.max(0, r.ms ?? 0), 0), medianMs, ft: Math.round(ft * 100) / 100,
    flagged: eligible.length >= 6 && ft < 0.55 && medianMs < Math.max(20_000, baseline * 0.6),
  };
}

export function recordStarSet(storage: Storage, id: string, at: number, src: StarSetMetric['src'], results: readonly ItemResult[], newElement = false): void {
  try {
    const prior = readStarMetrics(storage).groups;
    if (prior.some((g) => g.id === id)) return;
    const next = summarizeStarSet(id, at, src, results, prior, newElement);
    storage.setItem(STAR_METRICS_KEY, JSON.stringify({ v: 1, groups: [...prior, next].slice(-20) } satisfies StarMetrics));
  } catch { /* observational data must not block saving progress or rewards */ }
}
