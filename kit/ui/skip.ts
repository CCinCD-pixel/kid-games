/**
 * 跳过 — the one skip control for every intro, cutscene, onboarding and tutorial (Dad's feedback
 * 2026-10-08: long intros could not be skipped, and a private browser window forgets what was seen).
 *
 *   import { mountSkipButton, shouldAutoSkip } from '@kit/ui';
 *   if (shouldAutoSkip()) { markIntroSeen(); return startPlaying(); }   // parent: 跳过开场和教学
 *   const unmount = mountSkipButton(document.body, () => {              // tapped 跳过
 *     narrator.stop(); markIntroSeen(); startPlaying();
 *   });
 *   await playIntro();                                                  // …or it ended by itself:
 *   unmount();
 *
 *  - Top-right, safe-area aware, 56 px tall (≥48 px), a quiet paper pill that mirrors the 🏠 button
 *    (night pill on night pages / `theme: 'night'`). It drops below the 🏠 button if they would touch.
 *  - Appears after `delayMs` (default 1500) so a child tapping through the intro does not hit it by
 *    accident; until then it is invisible, inert and untappable.
 *  - One tap → `onSkip()` exactly once, then it leaves. Its pointer/click events do not reach the
 *    page underneath (a "tap anywhere to continue" scene does not also advance).
 *  - The returned disposer removes it (fades out if shown); safe to call more than once or after a skip.
 *  - It never auto-skips by itself: check `shouldAutoSkip()` before the intro starts.
 * Skipping marks the intro as seen (the game's own flag); tutorials stay replayable from the menu.
 */
import { skipIntros } from '../settings';
import { sound } from './xg';

export const SKIP_DELAY_MS = 1500;

/** The parent setting 跳过开场和教学: skip every intro / tutorial at once, as if 跳过 had been tapped. */
export const shouldAutoSkip = (store?: Storage): boolean => skipIntros(store);

export type SkipState = 'waiting' | 'shown' | 'done';

export interface SkipController {
  readonly state: SkipState;
  /** A tap: fires onSkip once when shown; ignored while waiting or after done. Returns whether it fired. */
  skip(): boolean;
  /** Cancel the pending reveal; later taps do nothing. Idempotent. */
  dispose(): void;
}

/**
 * The timing / once-only logic behind the button (DOM-free, unit-tested): `onShow` after `delayMs`,
 * then the first `skip()` calls `onSkip`. Exported for games that draw their own skip control.
 */
export function createSkipController(onSkip: () => void, opts: { delayMs?: number; onShow?: () => void } = {}): SkipController {
  let state: SkipState = 'waiting';
  const delay = Math.max(0, Number.isFinite(opts.delayMs) ? Number(opts.delayMs) : SKIP_DELAY_MS);
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    if (state !== 'waiting') return;
    state = 'shown';
    opts.onShow?.();
  }, delay);
  return {
    get state() {
      return state;
    },
    skip() {
      if (state !== 'shown') return false;
      state = 'done';
      onSkip();
      return true;
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      state = 'done';
    },
  };
}

export interface SkipButtonOptions {
  /** ms before the button appears (default 1500) */
  delayMs?: number;
  /** visible text (default 跳过) */
  label?: string;
  /** 'auto' (default) = night pill inside [data-xg-theme="night"], paper pill otherwise */
  theme?: 'auto' | 'paper' | 'night';
  /** extra class(es), e.g. to move it with --xg-skip-top / --xg-skip-right */
  className?: string;
}

const SKIP_ICON =
  '<span class="xg-icon xg-skip__icon" aria-hidden="true"><svg viewBox="0 0 32 32">' +
  '<path d="M4.5 9.2c0-1.7 1.9-2.7 3.3-1.7l8.4 5.9c1.2.9 1.2 2.7 0 3.5l-8.4 5.9c-1.4 1-3.3 0-3.3-1.7Z" fill="currentColor"/>' +
  '<path d="M15.5 9.2c0-1.7 1.9-2.7 3.3-1.7l8.4 5.9c1.2.9 1.2 2.7 0 3.5l-8.4 5.9c-1.4 1-3.3 0-3.3-1.7Z" fill="currentColor"/>' +
  '</svg></span>';
const LEAVE_MS = 220;
const STOPPED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick'] as const;

/** Show 跳过 at the top-right after `delayMs`; tap → `onSkip()` once. Returns a disposer. */
export function mountSkipButton(container: HTMLElement, onSkip: () => void, opts: SkipButtonOptions = {}): () => void {
  const label = opts.label ?? '跳过';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `xg-skip${opts.className ? ` ${opts.className}` : ''}`;
  btn.dataset.state = 'waiting';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-hidden', 'true');
  btn.setAttribute('inert', '');
  btn.tabIndex = -1;
  const text = document.createElement('span');
  text.className = 'xg-skip__label';
  text.textContent = label;
  btn.append(text);
  btn.insertAdjacentHTML('beforeend', SKIP_ICON);
  const theme = opts.theme ?? 'auto';
  if (theme === 'night' || (theme === 'auto' && container.closest('[data-xg-theme="night"]'))) btn.dataset.theme = 'night';

  let gone = false;
  let raf = 0;
  const ctl = createSkipController(
    () => {
      leave();
      onSkip();
    },
    { delayMs: opts.delayMs, onShow: show },
  );

  function show() {
    if (gone) return;
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('inert');
    btn.tabIndex = 0;
    btn.dataset.state = 'shown';
    avoidBack();
    window.addEventListener('resize', onResize);
  }
  /** Drop below the 🏠 button when both would touch (narrow phone, long label, big safe-area). */
  function avoidBack() {
    btn.style.removeProperty('--xg-skip-drop');
    const back = document.querySelector<HTMLElement>('.kit-back, .kit-back-adopted');
    if (!back || !btn.isConnected) return;
    const a = back.getBoundingClientRect();
    if (a.width === 0 || a.height === 0) return;
    const b = btn.getBoundingClientRect();
    const gap = 8;
    const touching = b.left < a.right + gap && a.left < b.right + gap && b.top < a.bottom + gap && a.top < b.bottom + gap;
    if (touching) btn.style.setProperty('--xg-skip-drop', `${Math.ceil(a.bottom - b.top + 10)}px`);
  }
  function onResize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(avoidBack);
  }
  function leave() {
    if (gone) return;
    gone = true;
    ctl.dispose();
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    btn.setAttribute('inert', '');
    btn.tabIndex = -1;
    if (btn.dataset.state === 'shown') {
      btn.dataset.state = 'leaving';
      setTimeout(() => btn.remove(), LEAVE_MS);
    } else {
      btn.remove();
    }
  }

  const stop = (e: Event) => e.stopPropagation();
  for (const t of STOPPED) btn.addEventListener(t, stop);
  btn.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || ctl.state !== 'shown') return;
    btn.classList.add('is-pressed');
    sound('ui-tap');
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) btn.addEventListener(t, () => btn.classList.remove('is-pressed'));
  btn.addEventListener('click', () => {
    ctl.skip();
  });

  container.append(btn);
  return leave;
}
