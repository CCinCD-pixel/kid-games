import { h, icon, type UiIconName } from '@kit/ui';
import type { Bank, Save, Word } from '../domain/types';
import type { Recording } from '../speech/recordings';
/** How a clip ended. 'interrupted' = something newer started (the caller must not carry on with its own sequence). */
export type Played = 'done' | 'interrupted' | 'skipped';
export interface Context {
  save: Save;
  bank: Bank;
  persist: () => void;
  explain: (text: string) => Promise<Played>;
  storageOkay: () => boolean;
  /** One voice channel: a new line cuts the old one. `quiet` plays the sound without printing it as a subtitle. */
  say: (id: string, quiet?: boolean) => Promise<Played>;
  syllable: (id: string, quiet?: boolean) => Promise<Played>;
  /**
   * Play real recordings one after the other (never robot speech) while the subtitle bar shows one plain caption.
   * `onClip(i)` runs right before clip i starts, so the screen can highlight what is about to be heard.
   */
  listen: (ids: string[], caption: string, onClip?: (index: number) => void) => Promise<Played>;
  word: (word: Word, quiet?: boolean) => Promise<Played>;
  replay: (blob: Blob) => Promise<void>;
  picture: (word: Word) => HTMLElement;
  /** `saved` = how many recordings were really kept (the ending page only talks about those). */
  finish: (records: Recording[], saved: number) => void;
  home: () => void;
  stopAudio: () => void;
}
export function glyph(name: UiIconName): HTMLElement {
  const span = h('span', { class: 'glyph', 'aria-hidden': 'true' });
  span.innerHTML = icon(name);
  return span;
}
export function button(
  text: string,
  action: () => void,
  kind = 'secondary',
  symbol?: UiIconName,
): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `station-btn station-btn--${kind}`, onclick: action },
    symbol ? glyph(symbol) : null,
    h('span', null, text),
  );
}
/** A word shown as a 汉字卡 (picture: 'text:<characters>') instead of a drawing. */
export const isTextCard = (w: Word): boolean => w.picture.startsWith('text:');
export const pinyin = (text: string, cls = '') =>
  h('span', { class: `pinyin ${cls}`, lang: 'zh-Latn' }, text.replaceAll('v', 'ü'));
