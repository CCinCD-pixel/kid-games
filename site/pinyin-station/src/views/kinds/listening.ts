import { h } from '@kit/ui';
import { displayPinyin } from '../../domain/pinyin';
import { button } from '../common';
import type { PracticeView } from './types';

export function listening(this: PracticeView) {
  const signal = button('听来信', () => void this.stimulus(), 'listen', 'listen');
  this.stage.append(signal);
  const row = h('div', { class: 'syllable-choices' });
  this.q.choices.forEach((choice) => {
    const right = choice === this.q.target;
    const key = h(
      'button',
      {
        type: 'button',
        class: 'pinyin-key pinyin',
        'data-choice': choice,
        onclick: () => {
          if (this.locked) return;
          // Echo first: the tapped card lights up (right) or shakes and dims (not this one).
          key.classList.add(right ? 'ok' : 'miss');
          if (!right) this.markTried(key);
          this.answer(right, choice);
        },
      },
      this.q.kind === 'A' ? choice.replace('v', 'ü') : displayPinyin(choice),
    );
    if (right) {
      key.dataset.answer = '1';
      this.guide(key);
    }
    row.append(key);
  });
  this.stage.append(row);
}
