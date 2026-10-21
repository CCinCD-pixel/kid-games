// site/xiangqi/src/app/ctx.ts — 应用上下文：各屏共用的单例（壳 / 存档 / 旁白 / 伙伴 / 音效 / 主题 / 导航）与屏幕接口。
import type { Shell } from '@kit/shell';
import type { Store } from '@kit/progress';
import type { Narrator } from '@kit/narration';
import type { Companion, CompanionOptions, Mood } from '@kit/companion';
import type { Theme } from '@engines/board/core/types';
import type { XqRules } from '../rules/rules';
import type { XqSave } from '../progress/save';
import type { Vp } from './layout';

export type Nav =
  | { to: 'hall'; intro?: boolean } | { to: 'perf' } | { to: 'arena'; quick?: boolean } | { to: 'f2f-setup' } | { to: 'academy' } | { to: 'starmap' } | { to: 'box' }
  | { to: 'game'; params: import('./game').GameParams } | { to: 'resume' } | { to: 'lesson'; lessonId?: string; placement?: boolean };
export interface Screen { destroy(): void; resize(vp: Vp): void; /** 🏠 被点：返回 true = 本屏自己处理（回上一层），false = 回星港大厅 */ onBack?(): boolean | Promise<boolean> }
export interface AppCtx {
  root: HTMLElement; shell: Shell; store: Store<XqSave>; save: XqSave; persist(): void;
  narrator: Narrator; lineText(id: string): string;
  mountBot(host: HTMLElement, o?: CompanionOptions): Companion;
  speak(bot: Companion | null, id: string, o?: { mood?: Mood; vars?: Record<string, string | number> }): Promise<void>;
  sfx(name: string, o?: { volume?: number; rate?: number; pan?: number }): void;
  theme: Theme; rules: XqRules; go(n: Nav): void; vp(): Vp; metrics: { refresh(): void };
  /** 设置变了（声音 / 字幕…）：重新应用到整个应用 */ applyPrefs(): void;
}
/** 把矩形写进元素的 left/top/width/height（绝对定位） */
export function place(el: HTMLElement, r: { x: number; y: number; w: number; h: number } | null | undefined): void {
  if (!r) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = `${r.x}px`; el.style.top = `${r.y}px`; el.style.width = `${r.w}px`; el.style.height = `${r.h}px`;
}
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** 把 kit 的 🏠 按钮摆到布局算好的位置（视口坐标；kit 用 --kit-back-x/y 做 left/top） */
export function setBack(r: { x: number; y: number }): void { const st = document.documentElement.style; st.setProperty('--kit-back-x', `${r.x}px`); st.setProperty('--kit-back-y', `${r.y}px`); st.setProperty('--xg-skip-top', `${r.y}px`); }
export const setBubbleW = (w: number): void => document.documentElement.style.setProperty('--xq-bubble-w', `${Math.max(120, Math.round(w))}px`);
