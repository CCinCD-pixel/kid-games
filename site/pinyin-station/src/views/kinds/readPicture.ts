import { h } from '@kit/ui';
import { button, pinyin } from '../common';
import type { PracticeView } from './types';

export function readPicture(this: PracticeView) {
  this.stage.append(pinyin(this.word.display, 'question-pinyin'));
  const choices = h('div', { class: 'picture-choices' });
  for (const id of this.q.choices) {
    const w = [...this.ctx.bank.words, ...this.ctx.save.customWords].find((w) => w.id === id)!;
    const choice = h(
      'button',
      {
        class: 'picture-choice',
        type: 'button',
        'aria-label': w.hanzi,
        onclick: () => this.answer(id === this.q.target),
      },
      this.ctx.picture(w),
    );
    choices.append(choice);
  }
  this.stage.append(choices);
  this.actions.append(
    button(
      '听听这个词',
      () => {
        this.assisted = true;
        void this.stimulus();
      },
      'secondary',
      'listen',
    ),
  );
}
