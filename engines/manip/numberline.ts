/**
 * 数轴 (number line) of 火星基地 — pure model + PURE VIEW + thin DOM binder (spec §3.8.1, §8.3).
 *
 * THE LEAK RULE (review F1): what the markup shows must not depend on the flag position, and must give no counting channel.
 *   • numerals (text, any attribute except the geometry allow-list, `content:`, <title>/<desc>) are ONLY the declared anchor labels
 *     (given by the order / H2 / the two ends); the flag's own value, the lens and the screen-reader text never carry a number;
 *   • the magnifier draws ticks only (no numerals), there is no <input type=range>, no aria-valuenow/min/max;
 *   • ◀▶ nudges: ±1 (L=100) / ±10 (L=1000), at most 3 per placement, no auto-repeat, no tick sound;
 *   • the blank calibration line has only its two end labels: no ticks, no lens, no nudges;
 *   • after submit, a `data-phase="feedback"` subtree may show numbers — and numbers may appear ONLY there.
 * `renderNumberLine(state)` is a pure function, so the leak gate (validate/numline-leak.test.ts) runs it in Node over every state and
 * every flag position; the DOM below only wires pointer / keyboard events to state changes.
 */
/** ◀▶ nudges: per placement and step by L (the app's tuning re-exports these). */
export const NUDGE_CAP = 3;
export const NUDGE_STEP = { 100: 1, 1000: 10 } as const;

export type NlKind = 'place' | 'read' | 'calib';
export interface NlFeedback { target: number; d: number; lo: number; hi: number; close?: boolean }
export interface NlViewState {
  /** stage size in CSS px (1 unit = 1 px in the SVG) */
  w: number; h: number; L: number; kind: NlKind;
  /** labelled anchors (the declared numerals); the calibration line ignores this and shows only 0 and L */
  labels: number[]; flag: number | null; dragging: boolean; placed: boolean; nudgesLeft: number; h1?: boolean; h2Anchors?: number[]; locked?: boolean;
  phase?: 'input' | 'feedback'; fb?: NlFeedback;
  /** drawing scale (≥ 1): on a big stage every drawn thing (flag, ticks, numerals, magnifier) is `k` times larger — the SVG viewBox is w/k × h/k, so all the constants below stay in "design px" */
  k?: number;
}
export const NL_PAD = 28;
/** half the width of the ◀▶ pair, and how far above the track its top edge sits (flag pole is 64 high) */
export const NUDGE_HALF = 66; export const NUDGE_RISE = 124;
/** Track y inside the stage (design px): 52 px above the lower edge on a short stage (the magnifier needs ≥190 px clear above the finger); on a tall stage the line sits at 70 % so the stage is not an empty page with a line at its foot. */
export const trackY = (h: number): number => (h >= 330 ? Math.round(h * 0.7) : h - 52);
/** drawing scale of a stage of w × h CSS px (1 on phones, up to 1.7 on an iPad) */
export const scaleOf = (w: number, h: number): number => Math.max(1, Math.min(1.7, Math.min(w / 520, h / 380)));
export const posToValue = (x: number, w: number, L: number): number => Math.min(L, Math.max(0, ((x - NL_PAD) / (w - 2 * NL_PAD)) * L));
export const valueToPos = (v: number, w: number, L: number): number => NL_PAD + (v / L) * (w - 2 * NL_PAD);
export const snap = (v: number): number => Math.round(v);
export const nudgeStep = (L: number): number => (L <= 100 ? NUDGE_STEP[100] : NUDGE_STEP[1000]);
export function nudge(s: Pick<NlViewState, 'flag' | 'L' | 'nudgesLeft' | 'kind' | 'locked'>, dir: -1 | 1): { flag: number; nudgesLeft: number } | null {
  if (s.flag === null || s.nudgesLeft <= 0 || s.kind !== 'place' || s.locked) return null;
  const v = Math.min(s.L, Math.max(0, snap(s.flag) + dir * nudgeStep(s.L)));
  return { flag: v, nudgesLeft: s.nudgesLeft - 1 };
}
export const freshNudges = (): number => NUDGE_CAP;

const esc = (s: string | number): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** The pure view: markup of the whole control (SVG + nudge buttons). No state, no DOM. */
export function renderNumberLine(s: NlViewState): string {
  const k = s.k ?? 1; const w = s.w / k; const h = s.h / k; const { L, kind } = s; const blank = kind === 'calib'; const ty = trackY(h); const ppu = (w - 2 * NL_PAD) / L;
  const X = (v: number) => f1(valueToPos(v, w, L));
  const o: string[] = [];
  o.push(`<div class="nl" data-kind="${kind}"${s.locked ? ' data-locked' : ''}>`);
  o.push(`<svg class="nl-svg" viewBox="0 0 ${f1(w)} ${f1(h)}" width="${f1(s.w)}" height="${f1(s.h)}" role="img" aria-roledescription="数轴" aria-label="数轴，把旗插在轨道上">`);
  // rail
  o.push(`<rect class="nl-rail" x="${NL_PAD - 10}" y="${ty - 5}" width="${f1(w - 2 * NL_PAD + 20)}" height="10" rx="5"/>`);
  o.push(`<line class="nl-track" x1="${NL_PAD}" y1="${ty}" x2="${f1(w - NL_PAD)}" y2="${ty}"/>`);
  const labels = blank ? [0, L] : [...new Set([...s.labels, ...(s.h2Anchors ?? [])])].sort((a, b) => a - b);
  // static ticks: identical for every flag position. Major at the labelled anchors, minor at the midpoints between them (never a unit ruler).
  if (!blank) {
    const mids: number[] = [];
    for (let i = 0; i + 1 < s.labels.length; i++) mids.push((s.labels[i] + s.labels[i + 1]) / 2);
    for (const m of mids) o.push(`<line class="nl-tick-m" x1="${X(m)}" y1="${ty - 9}" x2="${X(m)}" y2="${ty + 9}"/>`);
  }
  for (const a of labels) o.push(`<line class="nl-tick-l" x1="${X(a)}" y1="${ty - 14}" x2="${X(a)}" y2="${ty + 14}"/><text class="nl-anchor" x="${X(a)}" y="${ty + 38}" text-anchor="middle">${a}</text>`);
  if (s.h1) o.push(`<g class="is-hinted"><rect class="nl-hint" x="${NL_PAD - 14}" y="${ty - 20}" width="${f1(w - 2 * NL_PAD + 28)}" height="40" rx="14" fill="none"/></g>`);
  // flag (or the spare flag on its rack)
  if (s.flag === null) {
    o.push(`<g class="nl-rack"><g class="nl-flag" transform="translate(${NL_PAD + 6},${ty - 30})"><line x1="0" y1="0" x2="0" y2="-54"/><path d="M0 -54 L34 -42 L0 -30Z"/></g></g>`);
  } else {
    const fx = valueToPos(s.flag, w, L);
    o.push(`<g class="nl-flag${s.dragging ? ' is-drag' : ''}" transform="translate(${f1(fx)},${ty})"><line x1="0" y1="0" x2="0" y2="-64"/><path d="M0 -64 L36 -52 L0 -40Z"/><circle class="nl-foot" cx="0" cy="0" r="6"/></g>`);
    if (!blank && s.dragging) {
      // magnifier ⌀120, ×4, centred 130 px above the track. Ticks only; their offsets are the fractional position (geometry, never a numeral).
      const frac = s.flag - Math.floor(s.flag); const unit = L <= 100 ? 1 : 10; const grain = L <= 100 ? 'fine' : 'coarse';
      const sp = ppu * unit * 4; const cx = Math.min(w - 64, Math.max(64, fx)); const cy = ty - 130;   // the glass (⌀120) never leaves the stage, even with the flag at 0 or L
      o.push(`<g class="nl-lens" transform="translate(${f1(cx)},${f1(cy)})"><circle class="nl-lens-glass" r="60"/>`);
      const base = L <= 100 ? frac : (s.flag % 10) / 10;
      for (let k = -8; k <= 8; k++) {
        const px = (k - base) * sp; if (Math.abs(px) > 52) continue;
        const idx = Math.floor(s.flag / unit) + k; const major = (L <= 100 ? idx % 5 === 0 : idx % 5 === 0) ; const major2 = L > 100 && idx % 10 === 0;
        o.push(`<line class="${major2 ? 'nl-lt-xl' : major ? 'nl-lt-l' : 'nl-lt-s'}" x1="${f1(px)}" y1="${major2 ? -26 : major ? -20 : -13}" x2="${f1(px)}" y2="${major2 ? 26 : major ? 20 : 13}" data-grain="${grain}"/>`);
      }
      o.push('<line class="nl-lens-mark" x1="0" y1="-40" x2="0" y2="40"/></g>');
    }
  }
  if (s.phase === 'feedback' && s.fb) {   // numerals are allowed ONLY here, after submit
    const b = s.fb;
    o.push(`<g data-phase="feedback"><rect class="nl-band" x="${X(b.lo)}" y="${ty - 18}" width="${f1(valueToPos(b.hi, w, L) - valueToPos(b.lo, w, L))}" height="36" rx="10"/>`
      + `<g class="nl-ghost" transform="translate(${X(b.target)},${ty})"><line x1="0" y1="0" x2="0" y2="-64"/><path d="M0 -64 L36 -52 L0 -40Z"/></g>`
      + `<text class="nl-fb" x="${f1(w / 2)}" y="${f1(ty - 112)}" text-anchor="middle">差 ${esc(b.d)}</text><text class="nl-target" x="${f1(Math.min(w - 30, Math.max(30, valueToPos(b.target, w, L))))}" y="${f1(ty - 72)}" text-anchor="middle">${esc(b.target)}</text></g>`);
  }
  o.push('</svg>');
  if (!blank && kind === 'place' && s.flag !== null && s.placed && s.phase !== 'feedback') {
    // QA fix-mars-r1 (T2 / M2): the ◀▶ pair sits ABOVE the flag (where the magnifier is while dragging — it only exists when the flag is placed), never over the numeral row under the track
    const off = s.nudgesLeft <= 0 || s.locked ? ' disabled' : '';
    const nx = Math.min(w - NUDGE_HALF, Math.max(NUDGE_HALF, valueToPos(s.flag, w, L)));
    o.push(`<div class="nl-nudges" style="left:${f1(nx * k)}px;top:${f1(Math.max(2, ty - NUDGE_RISE) * k)}px"><button class="nl-btn nl-btn-l" type="button" aria-label="往左挪"${off}>◀</button><button class="nl-btn nl-btn-r" type="button" aria-label="往右挪"${off}>▶</button></div>`);
  }
  o.push('</div>');
  return o.join('');
}

// ---- thin DOM binder ----------------------------------------------------------------------------------------------------------
export interface NumberLineOptions {
  L: number; kind: NlKind; labels: number[]; /** read: the flag the system has put down */ fixed?: number;
  onPlace?: (value: number) => void; onOp?: () => void; width?: number; height?: number;
}
export interface NumberLineControl {
  /** the integer under the flag, or null when no flag is on the line */ value(): number | null;
  setLabels(labels: number[]): void; showH1(on: boolean): void; showAnchors(points: number[] | undefined): void; lock(on: boolean): void;
  showFeedback(fb: NlFeedback): void; clearFeedback(): void; setFlag(v: number | null): void; reset(): void; resize(w: number, h: number): void;
  /** onboarding demo: after `delay` ms the flag is carried from the left end to `v` in `ms` ms WITH the magnifier (a drag), then rests there; never counts as a placement. Resolves when done or stopped. */
  demoPlace(v: number, o?: { delay?: number; ms?: number }): Promise<void>; stopDemo(): void;
  /** client x of a value on the track (tests drag the REAL flag with it) */ flagToClientX(v: number): number; trackClientY(): number;
  readonly state: NlViewState; destroy(): void;
}

export function mountNumberLine(host: HTMLElement, o: NumberLineOptions): NumberLineControl {
  const rect0 = host.getBoundingClientRect();
  let st: NlViewState = {
    w: o.width ?? Math.max(240, Math.round(rect0.width)), h: o.height ?? Math.max(200, Math.round(rect0.height)), L: o.L, kind: o.kind, labels: o.labels,
    flag: o.kind === 'read' ? (o.fixed ?? null) : null, dragging: false, placed: o.kind === 'read', nudgesLeft: NUDGE_CAP,
  };
  st.k = scaleOf(st.w, st.h);
  // drag hot path (V11, drag frame p95): pointermove only updates `st`; the SVG is rebuilt at most ONCE per frame (a 120 Hz pen / two moves per frame used to rebuild it twice), and the
  // track rect is read once per drag instead of after every rebuild (the old getBoundingClientRect forced a synchronous layout of the freshly built SVG on every move)
  let raf = 0; let dragRect: DOMRect | null = null;
  const paint = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } host.innerHTML = renderNumberLine(st); };
  const paintSoon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; host.innerHTML = renderNumberLine(st); }); };
  const svgEl = () => host.querySelector('svg') as SVGSVGElement | null;
  const toX = (clientX: number): number => { const r = dragRect ?? svgEl()!.getBoundingClientRect(); const k = st.k ?? 1; return posToValue((clientX - r.left) / k, r.width / k, st.L); };
  let demoTok = 0;
  let activeId: number | null = null; let before: Pick<NlViewState, 'flag' | 'placed' | 'nudgesLeft'> = { flag: null, placed: false, nudgesLeft: NUDGE_CAP };
  const down = (e: PointerEvent) => {
    if (st.locked || st.kind === 'read' || (e.target as Element).closest?.('.nl-nudges')) return;
    if (activeId !== null) return;
    before = { flag: st.flag, placed: st.placed, nudgesLeft: st.nudgesLeft }; demoTok++;
    activeId = e.pointerId; host.setPointerCapture?.(e.pointerId); dragRect = svgEl()?.getBoundingClientRect() ?? null;
    st = { ...st, flag: toX(e.clientX), dragging: true, placed: false, nudgesLeft: NUDGE_CAP }; paint(); o.onOp?.();
  };
  const move = (e: PointerEvent) => { if (e.pointerId !== activeId) return; st = { ...st, flag: toX(e.clientX) }; paintSoon(); };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return; activeId = null;
    st = { ...st, flag: snap(toX(e.clientX)), dragging: false, placed: true, nudgesLeft: NUDGE_CAP }; dragRect = null; paint(); o.onPlace?.(st.flag as number);
  };
  /** A system gesture / palm / lost capture is NOT a placement: iOS reports 0 or stale coordinates for a cancel, so nothing is recomputed from the event — the flag goes back to where it was before the touch. */
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return; activeId = null; dragRect = null;
    st = { ...st, flag: before.flag, dragging: false, placed: before.placed, nudgesLeft: before.nudgesLeft }; paint();
  };
  const click = (e: Event) => {
    const b = (e.target as Element).closest?.('.nl-btn') as HTMLButtonElement | null; if (!b || b.disabled) return;
    const r = nudge(st, b.classList.contains('nl-btn-l') ? -1 : 1); if (!r) return;
    st = { ...st, flag: r.flag, nudgesLeft: r.nudgesLeft }; paint(); o.onOp?.(); o.onPlace?.(r.flag);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const r = nudge(st, e.key === 'ArrowLeft' ? -1 : 1); if (!r) return; e.preventDefault();
    st = { ...st, flag: r.flag, nudgesLeft: r.nudgesLeft }; paint(); o.onPlace?.(r.flag);
  };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', cancel); host.addEventListener('lostpointercapture', cancel);
  host.addEventListener('click', click); host.addEventListener('keydown', key); host.style.touchAction = 'none';
  paint();
  const control: NumberLineControl = {
    value: () => (st.flag === null ? null : snap(st.flag)),
    setLabels(labels) { st = { ...st, labels }; paint(); },
    showH1(on) { st = { ...st, h1: on }; paint(); },
    showAnchors(points) { st = { ...st, h2Anchors: points }; paint(); },
    lock(on) { st = { ...st, locked: on }; paint(); },
    showFeedback(fb) { st = { ...st, phase: 'feedback', fb, locked: true }; paint(); },
    clearFeedback() { st = { ...st, phase: 'input', fb: undefined, locked: false }; paint(); },
    stopDemo() { demoTok++; },
    demoPlace(v, o = {}) {
      const tok = ++demoTok; const ms = o.ms ?? 1000;
      return new Promise<void>((res) => {
        window.setTimeout(() => {
          if (tok !== demoTok) return res();
          const t0 = performance.now();
          const step = (now: number) => {
            if (tok !== demoTok) return res();
            const p = Math.min(1, (now - t0) / ms); const e = p * p * (3 - 2 * p);
            st = { ...st, flag: v * e, dragging: p < 1, placed: false, nudgesLeft: NUDGE_CAP }; paint();   // placed stays false: a demo shows no ◀▶ and never enables ✓
            if (p < 1) requestAnimationFrame(step); else res();
          };
          requestAnimationFrame(step);
        }, o.delay ?? 0);
      });
    },
    setFlag(v) { st = { ...st, flag: v, placed: v !== null, dragging: false, nudgesLeft: NUDGE_CAP }; paint(); },
    reset() { st = { ...st, flag: st.kind === 'read' ? (o.fixed ?? null) : null, placed: st.kind === 'read', dragging: false, nudgesLeft: NUDGE_CAP, phase: 'input', fb: undefined, locked: false, h1: false, h2Anchors: undefined }; paint(); },
    resize(w, h) { st = { ...st, w, h, k: scaleOf(w, h) }; dragRect = null; paint(); },
    flagToClientX(v) { const r = svgEl()!.getBoundingClientRect(); const k = st.k ?? 1; return r.left + valueToPos(v, r.width / k, st.L) * k; },
    trackClientY() { const r = svgEl()!.getBoundingClientRect(); const k = st.k ?? 1; return r.top + trackY(r.height / k) * k; },
    get state() { return st; },
    destroy() { if (raf) { cancelAnimationFrame(raf); raf = 0; } demoTok++; if (typeof window !== 'undefined' && (window as unknown as { __nlCtl?: unknown }).__nlCtl === control) delete (window as unknown as { __nlCtl?: unknown }).__nlCtl; host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', cancel); host.removeEventListener('lostpointercapture', cancel); host.removeEventListener('click', click); host.removeEventListener('keydown', key); host.replaceChildren(); },
  };
  if (typeof location !== 'undefined' && /[?&]test=1/.test(location.search)) (window as unknown as { __nlCtl?: NumberLineControl }).__nlCtl = control;   // Playwright drags the REAL flag with it (geometry helpers)
  return control;
}
