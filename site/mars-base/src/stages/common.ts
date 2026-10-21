/** Shared stage contracts + DOM helpers (spec §8.1/§8.2). A stage never judges: it collects a response and can show a hint patch / the answer. */
import type { Answer, DemoStep, FamilyDef, Item, Response } from '../app/types';
import type { LayoutKind } from '../app/layout';

export interface StageCtx {
  item: Item; fam: FamilyDef; params: any; host: HTMLElement; w: number; h: number; /** stage height the keypad layout gives on this viewport (a stage that needs the keypad decides on THIS, not on `h`, so that its choice is the same in both layouts) */ hk?: number; onOp(): void; onAnswer(r: Response): void;
  /** speak a sentence (stage-specific audio, e.g. the dictation number) */ say?(text: string): void;
  /** tiny audio feedback hooks */ sfx?(name: string): void;
}
export interface StageHandle {
  /** `keypad` stages read the shared keypad; `self` stages collect themselves (and may deliver on tap) */
  input: 'keypad' | 'self'; layout: LayoutKind; cells?: string[];
  /** keypad stages with a stage-side part of the answer (e.g. which board is bigger): the response is [...pre(), ...typed]; null = not chosen yet */
  pre?(): number[] | null;
  collect(): Response; hasAnswer(): boolean; lock(on: boolean): void; hint(level: 1 | 2 | 3, answer: Answer): void;
  /** a line id when the stage is not ready to be delivered (staging tray not empty, a machine entry waiting …): not an attempt */ blocked?(): string | null;
  /** after delivery: show the tolerance band / the order next to the answer (numbers allowed only here) */ feedback?(r: Response, correct: Answer): void;
  /** stage-specific demo executor for DemoStep scripts (returns true when it handled the script) */ demo?(steps: DemoStep[]): Promise<boolean>;
  resize(w: number, h: number): void; destroy(): void;
}
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
export const btn = (cls: string, html: string, label?: string): HTMLButtonElement => { const b = el('button', cls, html); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; };
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The base unit of the stage drawings (px): tracks the smaller of width/height so everything scales together. */
export const unitOf = (w: number, h: number, divW = 11, divH = 15): number => Math.max(13, Math.min(46, Math.floor(Math.min(w / divW, h / divH))));
export const setSel = (root: Element, sel: string, on: boolean, cls = 'is-glow'): void => root.querySelectorAll(sel).forEach((e) => e.classList.toggle(cls, on));
/** Playwright runs fast (demos, build scenes); a test can set `window.__marsFast = false` to see them in real time. */
export const isAutomated = (): boolean => typeof navigator !== 'undefined' && !!navigator.webdriver && (globalThis as any).__marsFast !== false;
/** Run `fn` for each item with a pause (a H3 auto-demo); `ghost` taps the first few targets with the kit's ghost hand. */
export async function playPlan<T>(steps: T[], run: (s: T, i: number) => void | Promise<void>, pauseMs: number, alive: () => boolean): Promise<void> {
  const gap = reducedMotion() ? pauseMs * 0.5 : pauseMs;
  for (let i = 0; i < steps.length && alive(); i++) { await run(steps[i], i); await sleep(isAutomated() ? 20 : gap); }
}
