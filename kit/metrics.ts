/**
 * Per-game parent metrics: a game declares up to 3 numbers the parent page should show, and keeps a tiny summary in
 * localStorage (`kg:metrics:v1:<game>`, ≤ 4 KB) that the parent page — a different page load that never imports game
 * code — renders in 概览 → 各游戏指标. Metrics are for the PARENT only: never shown to the child, never fed back into
 * difficulty, stars or unlocks. No age norms, no scores-as-grades; say what the numbers mean in `detail` / `hint`.
 *
 *   // at boot (after the save is loaded) — the definitions are evaluated now, on pagehide and on every `refresh()`
 *   const metrics = registerMetrics('xiangqi', [
 *     { id: 'lessons',  label: '课程进度', value: () => ({ value: `${done} / 33`, frac: done / 33, detail: '学堂已通关的课' }) },
 *     { id: 'mate1',    label: '一步杀首次做对率', value: () => rate == null ? null : ({ value: `${Math.round(rate * 100)}%`, frac: rate, detail: '近 30 题', status: rate < 0.4 ? 'watch' : 'ok', hint: rate < 0.4 ? '这一块有点吃力，可以陪他玩一次' : undefined }) },
 *   ]);
 *   // after a round / lesson ends (cheap: one small JSON write)
 *   metrics.refresh();
 *
 *   // or, when the numbers come from a bigger save and you do not want to keep definitions around:
 *   writeMetricsSummary('mars-base', { metrics: [{ id: 'pae', label: '估算准确度', value: '良好', status: 'ok' }], data: { pae: [...] } });
 *
 * A reading returns `null` (or throws) when there is not enough data yet — that metric is simply omitted; with no
 * readings at all nothing is written (an older summary stays). `status: 'watch'` + `hint` is the 「这一块有点吃力」 nudge
 * (e.g. three bad nights in a row); `'ok'` is a quiet teal dot; `'note'` (default) is neutral. `data` is optional raw
 * material for the game's own tools (dropped first if the summary would exceed 4 KB; the parent page ignores it).
 */

export const METRICS_NAMESPACE = 'kg:metrics:v1:';
export const METRICS_VERSION = 1;
export const METRICS_MAX_ITEMS = 3;
export const METRICS_MAX_BYTES = 4096;

export type MetricStatus = 'ok' | 'watch' | 'note';

/** One rendered metric as the parent page shows it. */
export interface MetricItem {
  /** stable id within the game, [a-z0-9-] */
  id: string;
  /** what it is, ≤ 16 chars: 「一步杀首次做对率」 */
  label: string;
  /** the headline number / word, ≤ 16 chars: 「72%」「良好」「12 / 33」 */
  value: string;
  /** 0..1 → a thin bar under the value */
  frac?: number;
  /** one small line (what the window is / how to read it), ≤ 48 chars */
  detail?: string;
  status?: MetricStatus;
  /** shown as a gentle callout when status is 'watch', ≤ 48 chars */
  hint?: string;
}

export interface MetricSummary {
  v: typeof METRICS_VERSION;
  updatedAt: number;
  metrics: MetricItem[];
  /** optional raw data for the game's own use (≤ whatever fits in 4 KB) */
  data?: unknown;
}

/** What a definition's `value()` returns. */
export interface MetricReading {
  value: string | number;
  frac?: number;
  detail?: string;
  status?: MetricStatus;
  hint?: string;
}

export interface MetricDef {
  id: string;
  label: string;
  /** evaluated at registration, on pagehide and on `refresh()`; null / undefined / throw = no data yet */
  value: () => MetricReading | null | undefined;
}

export interface MetricsOptions {
  /** injected for tests; defaults to localStorage */
  storage?: Storage;
  now?: () => number;
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const GAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function metricsKey(game: string): string {
  if (!GAME_RE.test(game)) throw new Error(`metrics: bad game id "${game}"`);
  return METRICS_NAMESPACE + game;
}

const clip = (s: unknown, max: number): string => [...String(s ?? '').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Validate / clamp one item; null when it is unusable (no id / label / value). */
export function normalizeItem(raw: unknown): MetricItem | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : '';
  const label = clip(raw.label, 16);
  const value = clip(raw.value, 16);
  if (!id || !label || !value) return null;
  const out: MetricItem = { id, label, value };
  if (typeof raw.frac === 'number' && Number.isFinite(raw.frac)) out.frac = Math.round(Math.max(0, Math.min(1, raw.frac)) * 1000) / 1000;
  const detail = clip(raw.detail, 48);
  if (detail) out.detail = detail;
  if (raw.status === 'ok' || raw.status === 'watch' || raw.status === 'note') out.status = raw.status;
  const hint = clip(raw.hint, 48);
  if (hint) out.hint = hint;
  return out;
}

/** Sanitise whatever was found under a metrics key (older build, hand-edited, hostile). */
export function normalizeSummary(raw: unknown): MetricSummary | null {
  if (!isObj(raw) || raw.v !== METRICS_VERSION || !Array.isArray(raw.metrics)) return null;
  const seen = new Set<string>();
  const metrics: MetricItem[] = [];
  for (const m of raw.metrics) {
    const it = normalizeItem(m);
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    metrics.push(it);
    if (metrics.length >= METRICS_MAX_ITEMS) break;
  }
  if (!metrics.length) return null;
  const out: MetricSummary = { v: METRICS_VERSION, updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0, metrics };
  if (raw.data !== undefined) out.data = raw.data;
  return out;
}

/** Evaluate definitions into items (throwing / empty readings are skipped). Pure apart from calling `value()`. */
export function evaluateMetrics(defs: readonly MetricDef[]): MetricItem[] {
  const items: MetricItem[] = [];
  for (const d of defs) {
    let reading: MetricReading | null | undefined;
    try {
      reading = d.value();
    } catch {
      continue;
    }
    if (!reading) continue;
    const it = normalizeItem({ id: d.id, label: d.label, ...reading });
    if (it) items.push(it);
  }
  return items;
}

function readRaw(key: string, st: Storage | undefined): unknown {
  try {
    return JSON.parse(st?.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * Persist a summary for the parent page. Returns false when nothing was written (no usable metrics, no storage,
 * quota, or a newer-format summary from a newer build is already there — never overwritten).
 */
export function writeMetricsSummary(game: string, input: { metrics: readonly unknown[]; data?: unknown }, opts: MetricsOptions = {}): boolean {
  const key = metricsKey(game);
  const st = opts.storage ?? defaultStorage();
  if (!st) return false;
  const existing = readRaw(key, st);
  if (isObj(existing) && typeof existing.v === 'number' && existing.v > METRICS_VERSION) return false;
  const norm = normalizeSummary({ v: METRICS_VERSION, updatedAt: (opts.now ?? Date.now)(), metrics: input.metrics, data: input.data });
  if (!norm) return false;
  let json = JSON.stringify(norm);
  if (json.length > METRICS_MAX_BYTES && norm.data !== undefined) {
    delete norm.data;
    json = JSON.stringify(norm);
  }
  if (json.length > METRICS_MAX_BYTES) return false; // 3 clamped items are ≈ 0.6 KB, so this only happens with absurd input
  try {
    st.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

export function readMetricsSummary(game: string, storage?: Storage): MetricSummary | null {
  return normalizeSummary(readRaw(metricsKey(game), storage ?? defaultStorage()));
}

/** Every game's summary (parent page). */
export function listMetricsSummaries(storage?: Storage): Record<string, MetricSummary> {
  const st = storage ?? defaultStorage();
  const out: Record<string, MetricSummary> = {};
  if (!st) return out;
  const keys: string[] = [];
  for (let i = 0; i < st.length; i += 1) {
    const k = st.key(i);
    if (k && k.startsWith(METRICS_NAMESPACE)) keys.push(k);
  }
  for (const k of keys) {
    const game = k.slice(METRICS_NAMESPACE.length);
    if (!GAME_RE.test(game)) continue;
    const s = normalizeSummary(readRaw(k, st));
    if (s) out[game] = s;
  }
  return out;
}

export function clearMetricsSummary(game: string, storage?: Storage): void {
  try {
    (storage ?? defaultStorage())?.removeItem(metricsKey(game));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ in-page registry

export interface MetricsHandle {
  /** evaluate the definitions and write the summary now; false = nothing written */
  refresh(): boolean;
  /** the currently evaluated items without writing (for dev overlays / tests) */
  peek(): MetricItem[];
  /** stop the pagehide / hidden auto-flush */
  dispose(): void;
}

const registered = new Map<string, readonly MetricDef[]>();

/** Games registered on this page (dev tools / lab). */
export const registeredMetrics = (): ReadonlyMap<string, readonly MetricDef[]> => registered;

/**
 * Declare ≤ 3 parent metrics for `game`. Evaluates once now, again whenever the page is hidden / closed
 * (iPad home-screen apps are often killed without a clean unload — call `refresh()` after each round as well).
 */
export function registerMetrics(game: string, defs: readonly MetricDef[], opts: MetricsOptions = {}): MetricsHandle {
  metricsKey(game); // validates the id
  if (defs.length === 0 || defs.length > METRICS_MAX_ITEMS) throw new Error(`metrics: ${game} must declare 1–${METRICS_MAX_ITEMS} metrics (got ${defs.length})`);
  const ids = new Set<string>();
  for (const d of defs) {
    if (!ID_RE.test(d.id) || ids.has(d.id)) throw new Error(`metrics: ${game} has a bad or duplicate metric id "${d.id}"`);
    ids.add(d.id);
  }
  registered.set(game, defs);
  const peek = () => evaluateMetrics(defs);
  const refresh = () => {
    const items = peek();
    return items.length ? writeMetricsSummary(game, { metrics: items }, opts) : false;
  };
  const onHide = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') refresh();
  };
  const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
  if (hasWindow) {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', refresh);
  }
  refresh();
  return {
    refresh,
    peek,
    dispose() {
      if (hasWindow) {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', refresh);
      }
      if (registered.get(game) === defs) registered.delete(game);
    },
  };
}
