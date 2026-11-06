import { h } from '@kit/ui';
import { button, isTextCard, pinyin } from '../common';
import type { PracticeView } from './types';

export function readPicture(this: PracticeView) {
  this.stage.append(pinyin(this.word.display, 'question-pinyin'));
  const choices = h('div', { class: 'picture-choices' });
  for (const id of this.q.choices) {
    const w = [...this.ctx.bank.words, ...this.ctx.save.customWords].find((w) => w.id === id)!;
    const right = id === this.q.target;
    const choice = h(
      'button',
      {
        class: 'picture-choice',
        type: 'button',
        'aria-label': w.hanzi,
        onclick: () => {
          if (this.locked) return;
          // Echo first: the tapped picture shows its name and a tick or a gentle shake, right where the eyes are.
          if (!isTextCard(w)) choice.append(h('span', { class: 'picture-caption' }, w.hanzi)); // a text card already shows its characters
          choice.classList.add(right ? 'ok' : 'miss');
          if (!right) this.markTried(choice);
          this.answer(right);
        },
      },
      this.ctx.picture(w),
    );
    if (right) {
      choice.dataset.answer = '1';
      this.guide(choice);
    }
    choices.append(choice);
  }
  this.stage.append(choices);
  this.actions.append(
    button(
      '听听这个词',
      () => {
        // The sound gives the answer away, so it is a hint (not counted toward mastery).
        this.assisted = true;
        void this.stimulus();
      },
      'secondary',
      'listen',
    ),
  );
}
