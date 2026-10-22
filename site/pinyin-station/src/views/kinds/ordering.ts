import { h } from '@kit/ui';
import { displayPinyin } from '../../domain/pinyin';
import { button, pinyin } from '../common';
import type { PracticeView } from './types';

export function ordering(this: PracticeView) {
  const chunks = this.word.chunks ?? [],
    result = h(
      'div',
      { class: 'sentence-track', 'aria-label': '已经接通的词卡' },
      ...this.sentence.map((s) => pinyin(s.split(' ').map(displayPinyin).join(' '), 'sentence-chunk')),
    );
  const row = h('div', { class: 'sentence-choices' });
  this.q.choices.forEach((s, i) => {
    const key = h(
      'button',
      {
        type: 'button',
        class: 'pinyin-key pinyin',
        disabled: this.used.has(i),
        onclick: () => {
          if (this.locked) return;
          this.used.add(i);
          this.sentence.push(s);
          if (this.sentence.length === chunks.length)
            this.answer(this.sentence.every((x, j) => x === chunks[j]));
          else {
            this.stage.replaceChildren();
            this.ordering();
          }
        },
      },
      s.split(' ').map(displayPinyin).join(' '),
    );
    row.append(key);
  });
  this.stage.append(h('div', { class: 'sentence-picture' }, this.ctx.picture(this.word)), result, row);
  this.actions.replaceChildren(
    button(
      '重新接一接',
      () => {
        this.sentence = [];
        this.used.clear();
        this.draw();
      },
      'quiet',
      'undo',
    ),
  );
}
