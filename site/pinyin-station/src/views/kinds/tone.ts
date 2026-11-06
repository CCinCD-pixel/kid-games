import { h } from '@kit/ui';
import { displayPinyin } from '../../domain/pinyin';
import { button } from '../common';
import type { PracticeView } from './types';

/**
 * 四声排排队: the child hears one tone of a vowel (or of a whole-recognition syllable) and picks it among the four written
 * in tone order (āi ái ǎi ài). The sound is a real recording and is not printed (a subtitle would give the answer away).
 */
export function toneRow(this: PracticeView) {
  this.stage.append(button('听来信', () => void this.stimulus(), 'listen', 'listen'));
  const row = h('div', { class: 'syllable-choices tone-row' });
  this.q.choices.forEach((choice) => {
    const right = choice === this.q.target;
    const key = h(
      'button',
      {
        type: 'button',
        class: 'pinyin-key pinyin',
        'data-choice': choice,
        'data-tone': choice.at(-1),
        onclick: () => {
          if (this.locked) return;
          key.classList.add(right ? 'ok' : 'miss');
          if (!right) this.markTried(key);
          this.answer(right, choice);
        },
      },
      displayPinyin(choice),
    );
    if (right) {
      key.dataset.answer = '1';
      this.guide(key);
    }
    row.append(key);
  });
  this.stage.append(row);
}
