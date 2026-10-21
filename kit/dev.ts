/**
 * Dev / test-only switches (never active for the child on the live site).
 *
 *   isAutomated()      navigator.webdriver (Playwright / WebDriver)
 *   isDevServer()      the Vite dev server (`npm run dev`), as opposed to a production build or `vite preview`
 *   isTestEnv()        either of the above — the only environments where the overrides below are honoured
 *   safeAreaOverride() `?safe=top,right,bottom,left` (px, e.g. `?safe=47,0,34,0` = iPhone notch + home bar; `?safe=0,59,21,59`
 *                      = a landscape iPhone) → Playwright can emulate the real insets WebKit's `env()` cannot be told
 *                      about. The value is remembered for the tab (sessionStorage `kg:dev:safe`) so hub → game
 *                      navigation keeps it; `?safe=off` clears it. The shell applies it to readSafeArea() / onLayout
 *                      `safe`, and to the `--kit-safe-top/right/bottom/left` CSS tokens every kit component (and any
 *                      game CSS that uses `var(--kit-safe-top)` instead of `env(safe-area-inset-top)`) reads.
 *   For Playwright side helpers (`isDevServer(page)`) see tests/smoke/helpers.ts.
 */
import type { SafeArea } from './shell';

export const SAFE_KEY = 'kg:dev:safe';

export const isAutomated = (): boolean => typeof navigator !== 'undefined' && navigator.webdriver === true;

export function isDevServer(): boolean {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
}

export const isTestEnv = (): boolean => isAutomated() || isDevServer();

/** Pure parser: "47,0,34,0" | "47,0,34" (left defaults to right) | "47" (top only) → insets in px, clamped 0–120; else null. */
export function parseSafeParam(raw: string | null | undefined): SafeArea | null {
  if (!raw) return null;
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length < 1 || parts.length > 4 || parts.some((p) => !/^\d{1,3}(\.\d+)?$/.test(p))) return null;
  const n = parts.map((p) => Math.min(120, Number(p)));
  const [top, right = 0, bottom = 0, left = right] = n;
  return { top, right, bottom, left };
}

/** The active override, or null (always null outside a test environment). */
export function safeAreaOverride(search: string = typeof location === 'undefined' ? '' : location.search): SafeArea | null {
  if (!isTestEnv()) return null;
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get('safe');
    if (raw === 'off') {
      sessionStorage.removeItem(SAFE_KEY);
      return null;
    }
    if (raw) sessionStorage.setItem(SAFE_KEY, raw);
    else raw = sessionStorage.getItem(SAFE_KEY);
  } catch {
    /* storage blocked: the query string alone still works for this page */
  }
  return parseSafeParam(raw);
}

/** Write the override into the `--kit-safe-*` tokens on <html> (or remove them when `area` is null). */
export function applySafeTokens(area: SafeArea | null, root: HTMLElement = document.documentElement): void {
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    if (area) root.style.setProperty(`--kit-safe-${side}`, `${area[side]}px`);
    else root.style.removeProperty(`--kit-safe-${side}`);
  }
  if (area) root.dataset.safeOverride = `${area.top},${area.right},${area.bottom},${area.left}`;
  else delete root.dataset.safeOverride;
}
