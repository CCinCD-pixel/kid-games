/**
 * Companion robot (working name 领航员; the child picks the real name). STUB art: a parametric SVG
 * robot with an LED face. The 星港 design system ships the real robot with THIS API (same names,
 * same options), so swapping it in is a file replacement, not a game change:
 *
 *   import { mount, sayLine } from '@kit/companion';
 *   const bot = mount(document.querySelector('#bot')!, { size: 140, bubble: 'right' });
 *   bot.setMood('thinking');
 *   await bot.say('先数一数有几个晶体。', { mood: 'encouraging' });   // bubble only
 *   await sayLine(bot, narrator, 'mars.hint.1');                       // bubble + narrated clip
 *
 * House rule (plan §3.0 / §4.4, enforced by tests/unit/companion.test.ts and tools/lint-tone.mjs):
 * the companion never looks or sounds sad, never guilt-trips when the child stops or leaves.
 * There is deliberately no sad / crying / disappointed mood.
 */

import './companion.css';
import type { Narrator, SayResult } from '../narration';

export type Mood = 'idle' | 'happy' | 'thinking' | 'surprised' | 'encouraging' | 'celebrating' | 'sleepy';
export const MOODS: readonly Mood[] = ['idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy'];

export interface CompanionOptions {
  /** rendered width in CSS px (default 120) */
  size?: number;
  /** 'full' robot or 'head' only (HUD avatar) — the stub draws the same head for both */
  variant?: 'full' | 'head';
  /** accent colour (customisation hook for chapter unlocks) */
  accent?: string;
  /** LED colour */
  led?: string;
  /** shell colour */
  shell?: string;
  antenna?: 'star' | 'orb';
  /** where the speech bubble appears (default right) */
  bubble?: 'right' | 'left' | 'top' | 'auto';
  mood?: Mood;
  /** sound hook — receives sfx names (blip-happy, …) */
  sfx?: (name: string) => void;
  /** accessible name (default 领航员) */
  name?: string;
}

export interface SayOptions {
  /** mood while speaking (reverts afterwards unless `stay`) */
  mood?: Mood;
  stay?: boolean;
  /** Start the actual voice; resolve when it finished. Swappable engine hook (see sayLine). */
  speak?: (text: string) => Promise<unknown> | void;
  /** ms to keep the bubble after the voice ended (default 1800; 0 = keep) */
  hold?: number;
  /** characters per second for the typewriter reveal (default 16; 0 = instant) */
  cps?: number;
  /** extra element appended in the bubble (e.g. a 「再听一遍」 button) */
  accessory?: HTMLElement;
}

export interface Companion {
  el: HTMLElement;
  svg: SVGSVGElement;
  readonly mood: Mood;
  setMood(m: Mood, opts?: { silent?: boolean }): void;
  say(text: string, opts?: SayOptions): Promise<void>;
  /** stop talking and hide the bubble */
  hush(): void;
  /** brief reaction without changing the base mood */
  react(kind: 'hop' | 'nod' | 'wiggle' | 'jolt'): void;
  /** turn the eyes toward a viewport point */
  lookAt(x: number, y: number): void;
  destroy(): void;
}

/** LED eye/mouth geometry per mood (viewBox 0 0 100 100, screen area 22..78 × 28..72). */
const FACES: Record<Mood, { eyeW: number; eyeH: number; eyeY: number; mouth: string }> = {
  idle: { eyeW: 8, eyeH: 10, eyeY: 44, mouth: 'M40 60 Q50 64 60 60' },
  happy: { eyeW: 10, eyeH: 5, eyeY: 45, mouth: 'M38 57 Q50 68 62 57' },
  thinking: { eyeW: 8, eyeH: 4, eyeY: 42, mouth: 'M42 61 L58 59' },
  surprised: { eyeW: 9, eyeH: 12, eyeY: 42, mouth: 'M46 60 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0' },
  encouraging: { eyeW: 9, eyeH: 8, eyeY: 44, mouth: 'M39 58 Q50 66 61 58' },
  celebrating: { eyeW: 11, eyeH: 11, eyeY: 43, mouth: 'M37 56 Q50 72 63 56 Z' },
  sleepy: { eyeW: 10, eyeH: 2, eyeY: 47, mouth: 'M44 61 Q50 63 56 61' },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function mount(host: HTMLElement, opts: CompanionOptions = {}): Companion {
  const root = document.createElement('div');
  root.className = 'kit-companion';
  root.style.setProperty('--size', `${opts.size ?? 120}px`);
  if (opts.led) root.style.setProperty('--xg-led', opts.led);
  if (opts.accent) root.style.setProperty('--kit-companion-accent', opts.accent);
  if (opts.shell) root.style.setProperty('--kit-companion-shell', opts.shell);
  root.dataset.bubble = opts.bubble === 'left' || opts.bubble === 'top' ? opts.bubble : 'right';
  const svg = svgEl('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': opts.name ?? '领航员' });
  svg.append(
    svgEl('line', { x1: 50, y1: 14, x2: 50, y2: 4, class: 'kit-companion__antenna' }),
    svgEl('circle', { cx: 50, cy: 4, r: 4, class: 'kit-companion__bulb' }),
    svgEl('rect', { x: 12, y: 14, width: 76, height: 70, rx: 22, class: 'kit-companion__body' }),
    svgEl('rect', { x: 22, y: 28, width: 56, height: 44, rx: 14, class: 'kit-companion__screen' }),
  );
  const face = svgEl('g', { class: 'kit-companion__face' });
  const eyeL = svgEl('rect', { class: 'kit-companion__led', rx: 3 });
  const eyeR = svgEl('rect', { class: 'kit-companion__led', rx: 3 });
  const mouth = svgEl('path', { class: 'kit-companion__mouth' });
  face.append(eyeL, eyeR, mouth);
  svg.append(face);
  const bubble = document.createElement('div');
  bubble.className = 'kit-companion__bubble';
  bubble.setAttribute('aria-live', 'polite');
  root.append(svg, bubble);
  host.append(root);

  let mood: Mood = opts.mood ?? 'idle';
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let typeTimer: ReturnType<typeof setInterval> | undefined;
  let sayToken = 0;

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

  const stopTyping = () => {
    clearInterval(typeTimer);
    typeTimer = undefined;
  };

  const companion: Companion = {
    el: root,
    svg,
    get mood() {
      return mood;
    },
    setMood(next, o = {}) {
      if (!MOODS.includes(next)) throw new Error(`companion: unknown mood "${next}"`);
      if (next !== mood && !o.silent) opts.sfx?.(`blip-${next}`);
      mood = next;
      render();
    },
    async say(text, s = {}) {
      const token = ++sayToken;
      const before = mood;
      if (s.mood) companion.setMood(s.mood);
      clearTimeout(hideTimer);
      stopTyping();
      bubble.textContent = '';
      const textNode = document.createTextNode('');
      bubble.append(textNode);
      if (s.accessory) bubble.append(s.accessory);
      bubble.dataset.show = '';
      root.dataset.talking = '';
      const cps = s.cps ?? 16;
      const chars = [...text];
      if (cps <= 0) textNode.data = text;
      else {
        let i = 0;
        typeTimer = setInterval(() => {
          i += 1;
          textNode.data = chars.slice(0, i).join('');
          if (i >= chars.length) stopTyping();
        }, 1000 / cps);
      }
      const minRead = cps > 0 ? (chars.length / cps) * 1000 : 0;
      await Promise.all([
        Promise.resolve(s.speak?.(text)).catch(() => undefined),
        new Promise((r) => setTimeout(r, minRead)),
      ]);
      if (token !== sayToken) return; // superseded by a newer say()/hush()
      stopTyping();
      textNode.data = text;
      delete root.dataset.talking;
      if (s.mood && !s.stay) companion.setMood(before, { silent: true });
      const hold = s.hold ?? 1800;
      if (hold > 0) hideTimer = setTimeout(() => delete bubble.dataset.show, hold);
    },
    hush() {
      sayToken += 1;
      stopTyping();
      clearTimeout(hideTimer);
      delete root.dataset.talking;
      delete bubble.dataset.show;
    },
    react(kind) {
      root.dataset.react = kind;
      setTimeout(() => {
        if (root.dataset.react === kind) delete root.dataset.react;
      }, 700);
    },
    lookAt(x, y) {
      const r = svg.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / (r.width * 2)));
      const dy = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / (r.height * 2)));
      face.setAttribute('transform', `translate(${(dx * 4).toFixed(2)} ${(dy * 3).toFixed(2)})`);
    },
    destroy() {
      companion.hush();
      root.remove();
    },
  };
  return companion;
}

/** @deprecated use `mount` (kept for early callers). */
export const mountCompanion = mount;

/**
 * Speak a narration line through the companion: the bubble shows the line's text, the narrator
 * plays the clip (or its fallback). Resolves with the narrator's result.
 */
export async function sayLine(
  companion: Companion,
  narrator: Narrator,
  id: string,
  opts: Omit<SayOptions, 'speak'> & { interrupt?: boolean } = {},
): Promise<SayResult> {
  let result: SayResult = 'skipped';
  const text = narrator.text(id) ?? id;
  await companion.say(text, {
    ...opts,
    speak: async () => {
      result = await narrator.say(id, { interrupt: opts.interrupt });
    },
  });
  return result;
}
