/**
 * Companion robot (working name 领航员; the child will name it). STUB with a parametric SVG face —
 * the design-system agent replaces the art, the API stays:
 *
 *   const pilot = mountCompanion(document.querySelector('#pilot')!, { narrator });
 *   pilot.setMood('think');
 *   await pilot.say('mars.hint.1');   // a narration id (voiced + bubble) or literal text (bubble + fallback voice)
 *
 * House rule (plan §3.0 / §4.4, enforced by tests/unit/companion.test.ts): the companion never
 * looks or sounds sad, never guilt-trips when the child stops or leaves. There is no "sad" mood.
 */

import './companion.css';
import type { Narrator, SayResult } from '../narration';

export const MOODS = ['idle', 'happy', 'think', 'cheer', 'surprised', 'encourage', 'sleepy'] as const;
export type Mood = (typeof MOODS)[number];

/** LED eye/mouth geometry per mood (viewBox 0 0 100 100, screen area 22..78 × 30..70). */
const FACES: Record<Mood, { eyeH: number; eyeW: number; eyeY: number; mouth: string }> = {
  idle: { eyeW: 8, eyeH: 10, eyeY: 44, mouth: 'M40 60 Q50 64 60 60' },
  happy: { eyeW: 10, eyeH: 5, eyeY: 45, mouth: 'M38 57 Q50 68 62 57' },
  think: { eyeW: 8, eyeH: 4, eyeY: 42, mouth: 'M42 61 L58 59' },
  cheer: { eyeW: 11, eyeH: 11, eyeY: 43, mouth: 'M37 56 Q50 72 63 56 Z' },
  surprised: { eyeW: 9, eyeH: 12, eyeY: 42, mouth: 'M46 60 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0' },
  encourage: { eyeW: 9, eyeH: 8, eyeY: 44, mouth: 'M39 58 Q50 66 61 58' },
  sleepy: { eyeW: 10, eyeH: 2, eyeY: 47, mouth: 'M44 61 Q50 63 56 61' },
};

export interface CompanionOptions {
  narrator?: Narrator;
  mood?: Mood;
  /** CSS size (default 120px) */
  size?: string;
  /** which side the speech bubble appears on (default right) */
  bubble?: 'right' | 'left';
  /** ms the bubble stays after speech ends (default 2500) */
  bubbleHoldMs?: number;
}

export interface Companion {
  readonly el: HTMLElement;
  readonly mood: Mood;
  setMood(mood: Mood): void;
  say(idOrText: string, opts?: { mood?: Mood; interrupt?: boolean }): Promise<SayResult>;
  hideBubble(): void;
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function mountCompanion(host: HTMLElement, opts: CompanionOptions = {}): Companion {
  const root = document.createElement('div');
  root.className = 'kit-companion';
  if (opts.size) root.style.setProperty('--size', opts.size);
  root.dataset.bubble = opts.bubble ?? 'right';
  const svg = svgEl('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': '领航员' });
  svg.append(
    svgEl('line', { x1: 50, y1: 14, x2: 50, y2: 4, class: 'kit-companion__antenna' }),
    svgEl('circle', { cx: 50, cy: 4, r: 4, class: 'kit-companion__bulb' }),
    svgEl('rect', { x: 12, y: 14, width: 76, height: 70, rx: 22, class: 'kit-companion__body' }),
    svgEl('rect', { x: 22, y: 28, width: 56, height: 44, rx: 14, class: 'kit-companion__screen' }),
  );
  const eyeL = svgEl('rect', { class: 'kit-companion__led', rx: 3 });
  const eyeR = svgEl('rect', { class: 'kit-companion__led', rx: 3 });
  const mouth = svgEl('path', { class: 'kit-companion__led', fill: 'none', stroke: 'currentColor' });
  mouth.style.fill = 'none';
  mouth.style.stroke = 'var(--xg-led, #8ff7ec)';
  mouth.style.strokeWidth = '3';
  mouth.style.strokeLinecap = 'round';
  svg.append(eyeL, eyeR, mouth);
  const bubble = document.createElement('div');
  bubble.className = 'kit-companion__bubble';
  bubble.setAttribute('aria-live', 'polite');
  root.append(svg, bubble);
  host.append(root);

  let mood: Mood = opts.mood ?? 'idle';
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    const f = FACES[mood];
    for (const [eye, cx] of [[eyeL, 38], [eyeR, 62]] as const) {
      eye.setAttribute('x', String(cx - f.eyeW / 2));
      eye.setAttribute('y', String(f.eyeY - f.eyeH / 2));
      eye.setAttribute('width', String(f.eyeW));
      eye.setAttribute('height', String(f.eyeH));
    }
    mouth.setAttribute('d', f.mouth);
    root.dataset.mood = mood;
  };
  render();

  const companion: Companion = {
    el: root,
    get mood() {
      return mood;
    },
    setMood(next) {
      if (!MOODS.includes(next)) throw new Error(`companion: unknown mood "${next}"`);
      mood = next;
      render();
    },
    async say(idOrText, sayOpts = {}) {
      if (sayOpts.mood) companion.setMood(sayOpts.mood);
      clearTimeout(hideTimer);
      bubble.textContent = opts.narrator?.text(idOrText) ?? idOrText;
      bubble.dataset.show = '';
      const result = opts.narrator ? await opts.narrator.say(idOrText, { interrupt: sayOpts.interrupt }) : 'done';
      hideTimer = setTimeout(() => companion.hideBubble(), opts.bubbleHoldMs ?? 2500);
      return result;
    },
    hideBubble() {
      delete bubble.dataset.show;
    },
    destroy() {
      clearTimeout(hideTimer);
      root.remove();
    },
  };
  return companion;
}
