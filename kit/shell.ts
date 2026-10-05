/**
 * The page shell every game uses. One call sets up the platform rules from the plan (§3.0, §4.3):
 *
 *  - Start gate: a big 「开始」 button. Its tap unlocks audio (iOS needs a gesture per page); until
 *    then narration waits. `shell.ready` resolves after the tap.
 *  - 🏠 back-to-hub button (≥56 px, safe-area aware) that awaits your autosave before leaving.
 *  - Touch guards: no pinch/double-tap zoom, no long-press callout, no text selection, no
 *    rubber-band overscroll; optional full-screen scroll lock.
 *  - Pause on visibilitychange (and audio suspend/resume via the audio module).
 *  - Layout hook on resize/orientation change with safe-area values; sets CSS vars
 *    --kit-vw/--kit-vh (px) on <html>.
 *  - Session log (kit/log) and service-worker registration.
 *
 *   import { initShell } from '@kit/shell';
 *   const shell = initShell({
 *     game: 'mars-base',
 *     startGate: { title: '火星基地', subtitle: '今天去建发射塔' },
 *     onBeforeLeave: () => store.save(state),
 *     onPause: () => game.pause(),
 *     onLayout: (l) => game.resize(l.width, l.height),
 *   });
 *   await shell.ready;   // audio unlocked, start your intro narration
 */

import { installAudioAutoUnlock, unlockAudio } from './audio';
import { startSession, type Session } from './log';
import { requestPersistence } from './progress';
import { registerServiceWorker } from './sw-register';
import './ui/tokens.css';
import './ui/fonts.css';
import './ui/base.css';
import './ui/kit.css';
import './ui/skin.css';

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInfo {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  safe: SafeArea;
  dpr: number;
}

export interface StartGateOptions {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
}

export interface BackOptions {
  href?: string;
  label?: string;
  /** icon-only 56×56 button */
  compact?: boolean;
  /**
   * Legacy pages: CSS selector of an existing back link to adopt (kept in place, enlarged to ≥56 px,
   * wired to autosave) instead of inserting the standard button.
   */
  adopt?: string;
}

export interface ShellOptions {
  /** registry id (folder name under site/) — used for logging */
  game: string;
  /** default: shown. Pass false for pages that unlock audio themselves (hub, legacy games). */
  startGate?: StartGateOptions | false;
  /** default: standard button to "/". */
  back?: BackOptions | false;
  /** Autosave hook; awaited up to 400 ms before leaving for the hub. */
  onBeforeLeave?: () => void | Promise<void>;
  onPause?: () => void;
  onResume?: () => void;
  onLayout?: (layout: LayoutInfo) => void;
  /** zoom/callout/selection/overscroll guards (default true) */
  guards?: boolean;
  /** lock the page to the viewport (no document scrolling; default true). Legacy scrolling pages pass false. */
  lockScroll?: boolean;
  /** play-session log (default true) */
  log?: boolean;
  /** register /sw.js (default true); `activateWaiting` only on the hub */
  serviceWorker?: boolean | { activateWaiting: boolean };
  /**
   * Use the kit audio engine: unlock on the gate/first tap, suspend while hidden (default true).
   * Legacy pages that own an AudioContext pass false so the page keeps a single context.
   */
  audio?: boolean;
}

export type ShellEvent = 'pause' | 'resume' | 'layout' | 'beforeleave';

export interface Shell {
  /** Resolves once the start gate was tapped (immediately when there is no gate). */
  readonly ready: Promise<void>;
  readonly started: boolean;
  readonly session: Session | null;
  layout(): LayoutInfo;
  on(event: 'layout', cb: (l: LayoutInfo) => void): () => void;
  on(event: Exclude<ShellEvent, 'layout'>, cb: () => void): () => void;
  /** Save (onBeforeLeave) and navigate (default: the hub). */
  leave(href?: string): Promise<void>;
  /** Remove the shell's listeners and UI and end the session (tests / single-page teardown). */
  dispose(): void;
}

const HOME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 2.6 11.3a1 1 0 0 0 1.3 1.5l.9-.8V20a1 1 0 0 0 1 1h4.2v-5.5h4V21h4.2a1 1 0 0 0 1-1v-8l.9.8a1 1 0 0 0 1.3-1.5z"/></svg>';

let activeShell: Shell | null = null;

/** Read env(safe-area-inset-*) as numbers via a probe element. */
export function readSafeArea(): SafeArea {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const area = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return area;
}

export function currentLayout(): LayoutInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { width, height, orientation: width >= height ? 'landscape' : 'portrait', safe: readSafeArea(), dpr: window.devicePixelRatio || 1 };
}

function installGuards(): void {
  document.documentElement.classList.add('kit-guarded');
  // Pinch zoom (Safari's proprietary gesture events) and double-tap zoom.
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  }
  // Double-tap zoom is handled by `touch-action: manipulation` (base.css) + user-scalable=no; we do
  // NOT cancel quick second taps, because games need rapid taps (D-pads, tapping tiles).
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target as Element | null)?.closest?.('input, textarea, .kit-selectable')) e.preventDefault();
  });
  // Multi-finger touches on the page itself never scroll/zoom.
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
}

function ensureViewportMeta(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  const want = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  if (!/viewport-fit=cover/.test(meta.content) || !/user-scalable=no/.test(meta.content)) meta.content = want;
}

export function initShell(opts: ShellOptions): Shell {
  if (activeShell) {
    console.warn('[kit/shell] initShell called twice; returning the existing shell');
    return activeShell;
  }
  const listeners: { [K in ShellEvent]: Set<(arg?: unknown) => void> } = { pause: new Set(), resume: new Set(), layout: new Set(), beforeleave: new Set() };
  const emit = (event: ShellEvent, arg?: unknown) => listeners[event].forEach((cb) => cb(arg));
  if (opts.onPause) listeners.pause.add(opts.onPause);
  if (opts.onResume) listeners.resume.add(opts.onResume);
  if (opts.onLayout) listeners.layout.add(opts.onLayout as (arg?: unknown) => void);

  ensureViewportMeta();
  if (opts.guards !== false) installGuards();
  if (opts.lockScroll !== false) document.documentElement.classList.add('kit-lock-scroll');
  const useAudio = opts.audio !== false;
  if (useAudio) installAudioAutoUnlock();
  void requestPersistence();
  if (opts.serviceWorker !== false) registerServiceWorker(typeof opts.serviceWorker === 'object' ? opts.serviceWorker : {});
  const session = opts.log === false ? null : startSession(opts.game);

  // ---- layout
  let layoutRaf = 0;
  const applyLayout = () => {
    layoutRaf = 0;
    const l = currentLayout();
    const root = document.documentElement.style;
    root.setProperty('--kit-vw', `${l.width}px`);
    root.setProperty('--kit-vh', `${l.height}px`);
    document.documentElement.dataset.orientation = l.orientation;
    emit('layout', l);
  };
  const scheduleLayout = () => {
    if (!layoutRaf) layoutRaf = requestAnimationFrame(applyLayout);
  };
  // iOS fires resize before the rotation settles; re-measure once more shortly after.
  const onOrientation = () => setTimeout(scheduleLayout, 120);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', onOrientation);
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  const onDomReady = () => applyLayout();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
  else onDomReady();

  // ---- pause / resume
  const onVisibility = () => emit(document.visibilityState === 'hidden' ? 'pause' : 'resume');
  document.addEventListener('visibilitychange', onVisibility);

  // ---- leaving
  let leaving = false;
  const leave = async (href = (opts.back && opts.back.href) || '/') => {
    if (leaving) return;
    leaving = true;
    try {
      const saves: Promise<unknown>[] = [];
      if (opts.onBeforeLeave) saves.push(Promise.resolve().then(opts.onBeforeLeave));
      emit('beforeleave');
      await Promise.race([Promise.allSettled(saves), new Promise((r) => setTimeout(r, 400))]);
    } catch (err) {
      console.warn('[kit/shell] onBeforeLeave failed', err);
    }
    session?.end('leave');
    location.href = href;
  };

  // ---- back button
  let backEl: HTMLElement | null = null;
  let gateEl: HTMLElement | null = null;
  const mountBack = () => {
    if (opts.back === false) return;
    const back = opts.back ?? {};
    if (back.adopt) {
      const link = document.querySelector<HTMLAnchorElement>(back.adopt);
      if (link) {
        link.classList.add('kit-back-adopted');
        link.setAttribute('href', back.href ?? '/');
        link.setAttribute('aria-label', '返回游戏大厅');
        link.addEventListener('click', (e) => {
          e.preventDefault();
          void leave(back.href ?? '/');
        });
        return;
      }
    }
    const a = document.createElement('a');
    backEl = a;
    a.className = 'kit-back';
    a.href = back.href ?? '/';
    a.setAttribute('aria-label', '返回游戏大厅');
    if (back.compact) a.dataset.compact = '';
    a.innerHTML = `${HOME_ICON}<span class="kit-back__label">${back.label ?? '返回'}</span>`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      void leave(a.getAttribute('href') ?? '/');
    });
    document.body.appendChild(a);
  };

  // ---- start gate
  let started = opts.startGate === false;
  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  const mountGate = () => {
    if (opts.startGate === false) {
      resolveReady();
      return;
    }
    const g = opts.startGate ?? {};
    const gate = document.createElement('div');
    gateEl = gate;
    gate.className = 'kit-start';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-label', g.title ?? document.title);
    const card = document.createElement('div');
    card.className = 'kit-start__card';
    const title = document.createElement('h1');
    title.className = 'kit-start__title';
    title.textContent = g.title ?? document.title;
    card.appendChild(title);
    if (g.subtitle) {
      const sub = document.createElement('p');
      sub.className = 'kit-start__subtitle';
      sub.textContent = g.subtitle;
      card.appendChild(sub);
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'kit-start__go';
    go.textContent = g.buttonLabel ?? '开始';
    card.appendChild(go);
    gate.appendChild(card);
    const start = (e: Event) => {
      if (started) return;
      e.preventDefault();
      started = true;
      if (useAudio) unlockAudio(); // synchronous inside the gesture — required on iOS
      void requestPersistence();
      gate.dataset.leaving = '';
      setTimeout(() => gate.remove(), 450);
      session?.mark('start');
      resolveReady();
    };
    go.addEventListener('pointerup', start);
    go.addEventListener('click', start);
    go.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') start(e);
    });
    document.body.appendChild(gate);
    go.focus({ preventScroll: true });
  };

  const mountUi = () => {
    mountGate();
    mountBack();
  };
  if (document.body) mountUi();
  else document.addEventListener('DOMContentLoaded', mountUi, { once: true });

  const shell: Shell = {
    ready,
    get started() {
      return started;
    },
    session,
    layout: currentLayout,
    on(event: ShellEvent, cb: (arg: never) => void) {
      const fn = cb as (arg?: unknown) => void;
      listeners[event].add(fn);
      return () => {
        listeners[event].delete(fn);
      };
    },
    leave,
    dispose() {
      window.removeEventListener('resize', scheduleLayout);
      window.removeEventListener('orientationchange', onOrientation);
      window.visualViewport?.removeEventListener('resize', scheduleLayout);
      document.removeEventListener('visibilitychange', onVisibility);
      if (layoutRaf) cancelAnimationFrame(layoutRaf);
      backEl?.remove();
      gateEl?.remove();
      session?.end('leave');
      activeShell = null;
    },
  };
  activeShell = shell;
  return shell;
}
