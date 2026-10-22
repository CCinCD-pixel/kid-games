import { h, icon, type UiIconName } from '@kit/ui';
import type { Bank, Save, Word } from '../domain/types';
import type { Recording } from '../speech/recordings';
export interface Context {
  save: Save;
  bank: Bank;
  persist: () => void;
  say: (id: string) => Promise<unknown>;
  syllable: (id: string) => Promise<unknown>;
  word: (word: Word) => Promise<unknown>;
  replay: (blob: Blob) => Promise<void>;
  picture: (word: Word) => HTMLElement;
  finish: (records: Recording[]) => void;
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
export const pinyin = (text: string, cls = '') =>
  h('span', { class: `pinyin ${cls}`, lang: 'zh-Latn' }, text.replaceAll('v', 'ü'));
