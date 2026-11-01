import { h } from '@kit/ui';
import { button, pinyin } from '../common';
import type { PracticeView } from './types';

export function reading(this: PracticeView) {
  this.stage.append(
    h('div', { class: 'reading-picture' }, this.ctx.picture(this.word)),
    pinyin(this.word.display, 'question-pinyin'),
    ...[this.lamps()].filter((x): x is HTMLElement => !!x),
  );
  this.actions.append(
    button('先听台长读', () => void this.stimulus(), 'secondary', 'listen'),
    button('读给台长听', () => void this.record(), 'primary', 'mic'),
    button('不开麦，跟着读', () => this.follow(), 'quiet', 'next'),
  );
}
