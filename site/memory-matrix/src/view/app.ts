// Shared context of the page: one engine, one voice, one robot, one subtitle bar, and the few helpers every screen needs.
import type { Companion } from '@kit/companion';
import type { Narrator } from '@kit/narration';
import type { Shell } from '@kit/shell';
import { icon, type createSubtitleBar } from '@kit/ui';
import type { Engine } from '../core/session';
import type { Voice } from '../core/voice';
import type { Safe } from '../core/layout';

export interface App {
  root: HTMLElement;
  engine: Engine;
  voice: Voice;
  narrator: Narrator;
  bot: Companion | null;
  sub: ReturnType<typeof createSubtitleBar>;
  shell: Shell;
  /** automation fast mode: no waiting for the voice, no idle timers (?test=1&fast=1 / Playwright specs) */
  fast: boolean;
  test: boolean;
  viewport(): { w: number; h: number; safe: Safe };
  sfx(name: string, o?: { volume?: number; rate?: number }): void;
  chime(step: number): void;
  persist(): void;
  mark(name: string, data?: Record<string, unknown>): void;
  refreshHub(): void;
  /** ms epoch of the last child action (for 「离开 > 2 分钟回来」 prompts) */
  lastActive: number;
  lastAxis: string | null;
  /** buildings already drawn on the station (so a new one grows in front of the child's eyes) */
  shownBuilt: number;
  onResize: Set<() => void>;
  /** true once a save was refused by the browser (storage disabled / private window): the station tells the parent */
  storageFailed: boolean;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
}
export function btn(cls: string, label: string, onClick: () => void, ico?: Parameters<typeof icon>[0]): HTMLButtonElement {
  const b = el('button', cls, `${ico ? icon(ico) : ''}<span class="mm-lbl">${label}</span>`); b.type = 'button'; b.addEventListener('click', onClick); return b;
}
export const place = (e: HTMLElement, r: { x: number; y: number; w: number; h: number }): void => { Object.assign(e.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }); };
export const wait = (app: App, ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, app.fast ? Math.min(ms, 30) : ms));
