import { h } from '@kit/ui';
import { createRng } from '@kit/rng';
import { displayPinyin, parseSyllable } from '../../domain/pinyin';
import { button, pinyin } from '../common';
import type { PracticeView } from './types';

export function blending(this: PracticeView) {
  const s = parseSyllable(this.q.target)!;
  const merged = pinyin('·', 'blend-result');
  const initial = button(
    s.initial || '听',
    () => {
      void this.ctx.syllable(
        this.ctx.bank.letters.find((l) => l.id === s.initial)?.callSound ?? this.q.target,
      );
    },
    'secondary',
  );
  initial.classList.add('pinyin-key', 'pinyin');
  const finals = [
    ...new Set([
      s.final,
      ...this.q.choices.map((id) => parseSyllable(id)!.final),
      ...['a', 'o', 'e', 'i', 'u', 'v'],
    ]),
  ].slice(0, 2);
  const rng = createRng(`${this.ctx.save.sessions}:${this.index}:blend`);
  const choices = rng.shuffle(finals).map((final) => {
    const key = button(
      displayPinyin(final + s.tone),
      () => {
        if (this.locked) return;
        if (final !== s.final) {
          this.answer(false);
          return;
        }
        merged.textContent = displayPinyin(this.q.target);
        this.remember(true);
        this.locked = true;
        void this.stimulus();
        this.actions.replaceChildren(
          button(
            '读给台长听',
            () => {
              this.locked = false;
              void this.record();
            },
            'primary',
            'mic',
          ),
          button('先接下一条', () => this.advance(), 'quiet', 'next'),
        );
      },
      'secondary',
    );
    key.classList.add('pinyin-key', 'pinyin');
    key.dataset.final = final;
    return key;
  });
  this.stage.append(
    h('div', { class: 'blend-parts' }, initial, h('span', { class: 'blend-plus' }, '+'), ...choices),
    merged,
    this.lamps(),
  );
  this.instruction.textContent = '看开头，选后面的声音，再把它们接起来';
}
