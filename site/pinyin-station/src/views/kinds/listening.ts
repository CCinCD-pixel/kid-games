import { h } from '@kit/ui';
import { displayPinyin } from '../../domain/pinyin';
import { button } from '../common';
import type { PracticeView } from './types';

export function listening(this: PracticeView) {
  const signal = button('听来信', () => void this.stimulus(), 'listen', 'listen');
  this.stage.append(signal);
  const row = h('div', { class: 'syllable-choices' });
  this.q.choices.forEach((choice) =>
    row.append(
      h(
        'button',
        {
          type: 'button',
          class: 'pinyin-key pinyin',
          'data-choice': choice,
          onclick: () => this.answer(choice === this.q.target, choice),
        },
        this.q.kind === 'A' ? choice.replace('v', 'ü') : displayPinyin(choice),
      ),
    ),
  );
  this.stage.append(row);
}
