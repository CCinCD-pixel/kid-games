import { h } from '@kit/ui';
import type { PracticeView } from './types';

/**
 * 字形对对碰: b d p q are mirror images of each other. The child SEES one letter on a card and picks the identical one among the
 * four; nothing is played (the point is the shape). Same echo / hint ladder as the other questions.
 */
export function glyphMatch(this: PracticeView) {
  this.stage.append(h('div', { class: 'glyph-target pinyin', 'aria-label': '要找的字母' }, this.q.target));
  const row = h('div', { class: 'syllable-choices glyph-row' });
  this.q.choices.forEach((choice) => {
    const right = choice === this.q.target;
    const key = h(
      'button',
      {
        type: 'button',
        class: 'pinyin-key pinyin glyph-key',
        'data-choice': choice,
        onclick: () => {
          if (this.locked) return;
          key.classList.add(right ? 'ok' : 'miss');
          if (!right) this.markTried(key);
          this.answer(right, choice);
        },
      },
      choice,
    );
    if (right) {
      key.dataset.answer = '1';
      this.guide(key);
    }
    row.append(key);
  });
  this.stage.append(row);
}
