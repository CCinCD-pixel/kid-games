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
  if (this.word.frame) {
    result.replaceChildren(
      ...this.word.frame.flatMap((part, i) => [
        h('span', null, part),
        ...(i < this.word.frame!.length - 1
          ? [pinyin(this.sentence[i] ? displayPinyin(this.sentence[i]) : '＿', 'cloze-slot')]
          : []),
      ]),
    );
    result.classList.add('cloze-frame');
  }
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
          // Echo first, always: the card lands in the sentence before anything is judged.
          const finished = this.sentence.length === chunks.length;
          const right = this.sentence.every((x, j) => x === chunks[j]);
          this.stage.replaceChildren();
          this.ordering();
          if (finished) {
            this.locked = true;
            this.later(right ? 750 : 1200, () => {
              this.locked = false;
              this.answer(right);
            });
          }
        },
      },
      s.split(' ').map(displayPinyin).join(' '),
    );
    // The next card the sentence is waiting for (shown by the first-use guide and by the second hint).
    if (!this.used.has(i) && s === chunks[this.sentence.length]) {
      key.dataset.answer = '1';
      this.guide(key);
    }
    row.append(key);
  });
  // The sentence being built is also written in characters (sentences only; the gap-fill shows its own frame).
  const target = this.word.frame ? null : h('p', { class: 'sentence-target' }, this.word.hanzi);
  this.stage.classList.toggle('has-target', !!target);
  this.stage.append(
    h('div', { class: 'sentence-picture' }, this.ctx.picture(this.word)),
    h('div', { class: 'sentence-line' }, ...(target ? [target] : []), result),
    row,
  );
  this.actions.replaceChildren(
    ...(this.word.frame ? [] : [button('听整句', () => void this.stimulus(), 'secondary', 'listen')]),
    button(
      '重新接一接',
      () => {
        if (this.locked) return;
        this.sentence = [];
        this.used.clear();
        this.draw();
      },
      'quiet',
      'undo',
    ),
  );
}
