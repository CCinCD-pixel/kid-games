/**
 * The referee companion (spec §6.6): the design-system robot with a black-and-white armband and a
 * silver whistle drawn by this game as an absolutely positioned SVG overlay (kit has no accessory
 * mount point yet — kit request #4). Plus the caption strip that shows narration word by word with a
 * 再听一遍 button (spec §2.1: no kit subtitle bar).
 */
import { mount, type Companion, type Mood } from '@kit/companion';
import { icon } from '@kit/ui';
import { play } from '../audio/sound';
import type { CaptionTarget, Voice } from '../voice';

export interface Guide {
  host: HTMLElement;
  bot: Companion;
  mood(m: Mood): void;
  react(k: 'hop' | 'nod' | 'wiggle' | 'jolt'): void;
  destroy(): void;
}

/** in the robot art's own units (full variant: 240 × 260) */
const ARMBAND = `<svg viewBox="0 0 240 260" aria-hidden="true">
  <g transform="translate(170 158) rotate(-28)">
    <rect x="-15" y="-9" width="30" height="18" rx="4" fill="#1d1d24"/>
    <rect x="-9" y="-9" width="6" height="18" fill="#f6f2e8"/>
    <rect x="3" y="-9" width="6" height="18" fill="#f6f2e8"/>
    <rect x="-15" y="-9" width="30" height="18" rx="4" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/>
  </g>
  <path d="M104 136 Q100 152 96 160" fill="none" stroke="#c9ced8" stroke-width="2.4" stroke-linecap="round"/>
  <g transform="translate(94 168) rotate(-18)">
    <path d="M-9 -3h13l7-3.5v6.5l-4 2a7.5 7.5 0 1 1-16-.7z" fill="#e3e8ef" stroke="#8b93a3" stroke-width="1.4"/>
    <circle cx="-2" cy="2.6" r="2.2" fill="#8b93a3"/>
  </g>
</svg>`;

export function mountGuide(host: HTMLElement, o: { size: number; variant?: 'full' | 'head'; bubble?: 'right' | 'left' | 'top' | 'auto'; referee?: boolean; mood?: Mood }): Guide {
  host.classList.add('mc-bot');
  const bot = mount(host, {
    size: o.size,
    variant: o.variant ?? 'full',
    bubble: o.bubble ?? 'right',
    mood: o.mood ?? 'happy',
    name: '领航员',
    sfx: (n) => play(n, { volume: 0.6 }),
  });
  let band: HTMLDivElement | null = null;
  if (o.referee !== false && (o.variant ?? 'full') === 'full') {
    band = document.createElement('div');
    band.className = 'mc-armband';
    band.innerHTML = ARMBAND;
    Object.assign(band.style, { left: '0px', top: '0px', width: `${o.size}px`, height: `${(o.size * 260) / 240}px` });
    host.appendChild(band);
  }
  return {
    host,
    bot,
    mood: (m) => bot.setMood(m),
    react: (k) => bot.react(k),
    destroy: () => {
      bot.destroy();
      band?.remove();
    },
  };
}

/** caption strip: text with per-character progress + 再听一遍 */
export class Caption implements CaptionTarget {
  readonly el: HTMLDivElement;
  private textEl: HTMLDivElement;
  private spans: HTMLSpanElement[] = [];
  private hideTimer = 0;

  constructor(voice: Voice, o: { onShow?: () => void; onHide?: () => void } = {}) {
    this.el = document.createElement('div');
    this.el.className = 'mc-caption';
    this.el.dataset.testid = 'caption';
    this.textEl = document.createElement('div');
    this.textEl.className = 'mc-caption__text';
    const replay = document.createElement('button');
    replay.className = 'xg-iconbtn xg-iconbtn--sm';
    replay.setAttribute('aria-label', '再听一遍');
    replay.innerHTML = icon('replay');
    replay.addEventListener('click', (e) => {
      e.stopPropagation();
      voice.replay();
    });
    this.el.append(this.textEl, replay);
    this.onShow = o.onShow;
    this.onHide = o.onHide;
  }
  private onShow?: () => void;
  private onHide?: () => void;

  show(text: string): void {
    clearTimeout(this.hideTimer);
    this.textEl.replaceChildren();
    this.spans = [...text].map((ch) => {
      const s = document.createElement('span');
      s.textContent = ch;
      this.textEl.appendChild(s);
      return s;
    });
    this.el.classList.add('is-on');
    this.el.dataset.text = text;
    this.onShow?.();
  }
  word(i: number): void {
    for (let k = 0; k < this.spans.length; k++) this.spans[k].classList.toggle('is-said', k <= i);
  }
  done(): void {
    for (const s of this.spans) s.classList.add('is-said');
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 1500);
  }
  hide(): void {
    this.el.classList.remove('is-on');
    this.onHide?.();
  }
  destroy(): void {
    clearTimeout(this.hideTimer);
    this.el.remove();
  }
}
