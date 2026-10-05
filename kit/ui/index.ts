/**
 * UI kit = the 星港 design system (tokens.css, fonts.css, kit.css, skin.css, xg.ts) plus the small
 * base components below. Two layers, one import:
 *
 *  - Base components (stable since the platform stub): h, showModal, toast, starRow,
 *    createSubtitleBar. Their `.kit-*` markup is re-skinned by skin.css with the 星港 look.
 *  - 星港 components (xg.ts, `.xg-*` classes): tactile buttons (bindPress), result panel with
 *    landing stars (showResult), level map (nodeMap), 76 px keypad, segmented control, progress,
 *    drag ghost + tap-to-select, ghost-hand demos, confetti, 43 UI icons, 13 game emblems.
 *    Full catalogue with live examples: /dev/kit/ and assets-src/design-system/README.md.
 *
 *   import { h, showModal, toast, starRow, createSubtitleBar, showResult, icon, bindPress } from '@kit/ui';
 *   bindPress(document);                                 // press/squash + sounds on every .xg-btn/.xg-card…
 *   const choice = await showResult({ ribbon: '过关啦', stars: 2, actions: [{ id: 'next', label: '下一关', kind: 'primary' }] });
 *
 * Sounds: call `installKitSfx()` from '@kit/ui/sfx-bridge' after the start-gate tap so the kit's
 * semantic sounds (ui-tap, star-1 …) play through kit/audio's single AudioContext.
 * Per-game colour: <body data-xg-game="mars|moon|rabbit|story|lab|porter|chess|army|snake|match|defense">;
 * night theme: data-xg-theme="night".
 */

import './tokens.css';
import './fonts.css';
import './base.css';
import './kit.css';
import './skin.css';
import type { Cue, Narrator } from '../narration';
import { icon } from './xg';

export {
  bindPress, showResult, mountKeypad, segmented, progress, setProgress, nodeMap, startDrag, ghostTap, ghostDrag,
  confetti, icon, emblem, starSvg, starRating, replayButton, setPlaying, setHintReady, setSfx, sound,
  toast as xgToast, UI_ICONS, GAME_EMBLEMS,
} from './xg';
export type { UiIconName, GameEmblemId, MapNode, ResultOptions, ResultAction, KeypadOptions, NodeMapOptions, DragHandle } from './xg';

type Child = Node | string | number | null | undefined | false;

/** Tiny DOM builder: h('button', { class: 'kit-btn', onclick: fn }, '开始'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'class') el.className = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset' && typeof value === 'object') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const STAR_PATH = 'M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.4l1.3-6.5L2.5 9.3l6.6-.8z';

/** Row of `max` stars with `n` lit (decorative; pair with text for meaning). */
export function starRow(n: number, max = 3): HTMLElement {
  const row = h('span', { class: 'kit-stars', role: 'img', 'aria-label': `${n} 颗星` });
  for (let i = 0; i < max; i += 1) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'kit-star');
    if (i < n) svg.setAttribute('data-on', '');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', STAR_PATH);
    svg.append(path);
    row.append(svg);
  }
  return row;
}

export interface ModalAction {
  id: string;
  label: string;
  primary?: boolean;
}

export interface ModalOptions {
  title: string;
  body?: Child | Child[];
  actions: ModalAction[];
  /** id returned when dismissed by tapping outside (default: not dismissible). */
  dismissId?: string;
}

/** Centred modal; resolves with the chosen action id. Visible in both orientations, no scrolling. */
export function showModal(opts: ModalOptions): Promise<string> {
  return new Promise((resolve) => {
    const close = (id: string) => {
      backdrop.remove();
      resolve(id);
    };
    const card = h(
      'div',
      { class: 'kit-panel kit-modal__card', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
      h('h2', { class: 'kit-modal__title' }, opts.title),
      opts.body !== undefined ? h('div', { class: 'kit-modal__body' }, ...(Array.isArray(opts.body) ? opts.body : [opts.body])) : null,
      h(
        'div',
        { class: 'kit-modal__actions' },
        opts.actions.map((a) => h('button', { class: `kit-btn${a.primary ? ' kit-btn--primary' : ''}`, type: 'button', 'data-action': a.id, onclick: () => close(a.id) }, a.label)),
      ),
    );
    const backdrop = h('div', { class: 'kit-modal' }, card);
    if (opts.dismissId) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close(opts.dismissId!);
      });
    }
    document.body.append(backdrop);
    (card.querySelector('.kit-btn--primary') as HTMLElement | null)?.focus({ preventScroll: true });
  });
}

export interface ToastOptions {
  /** semantic tone; the design system colours it (placeholder ignores it) */
  tone?: 'ok' | 'try' | 'info' | 'accent';
  ms?: number;
}

/** Short non-blocking message at the bottom. Same signature as the design system's toast(). */
export function toast(text: string, opts: ToastOptions | number = {}): void {
  const o = typeof opts === 'number' ? { ms: opts } : opts;
  const el = h('div', { class: 'kit-toast', role: 'status', 'data-tone': o.tone }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), o.ms ?? 2200);
}

/**
 * Subtitle bar with a 「再听一遍」 button, driven by a Narrator's cues. Highlights words when the
 * clip has word timings. Returns the element and handlers to pass as Narrator onCue/onWord.
 *
 *   const sub = createSubtitleBar();
 *   const narrator = new Narrator({ manifestUrl, onCue: sub.onCue, onWord: sub.onWord });
 *   sub.attach(narrator);
 */
export function createSubtitleBar(parent: HTMLElement = document.body) {
  const text = h('span', { class: 'kit-subtitle__text', 'aria-live': 'polite' });
  const replay = h('button', { class: 'kit-btn kit-subtitle__replay', type: 'button', 'aria-label': '再听一遍' });
  replay.innerHTML = `${icon('listen')}<span>再听一遍</span>`;
  const bar = h('div', { class: 'kit-subtitle', hidden: true }, text, replay);
  parent.append(bar);
  let narrator: Narrator | null = null;
  let spans: HTMLSpanElement[] = [];
  replay.addEventListener('click', () => void narrator?.replay());
  return {
    el: bar,
    attach(n: Narrator) {
      narrator = n;
    },
    onCue(cue: Cue | null) {
      if (!cue) {
        // keep the last line visible for re-reading; the replay button stays available
        return;
      }
      bar.hidden = false;
      text.textContent = '';
      spans = [];
      if (cue.words?.length) {
        for (const w of cue.words) {
          const s = h('span', null, w.ch);
          spans.push(s);
          text.append(s);
        }
      } else {
        text.textContent = cue.text;
      }
    },
    onWord(index: number) {
      spans.forEach((s, i) => s.classList.toggle('kit-word--on', i <= index));
    },
    hide() {
      bar.hidden = true;
    },
  };
}
