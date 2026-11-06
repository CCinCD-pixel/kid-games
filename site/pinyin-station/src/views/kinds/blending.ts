import { h } from '@kit/ui';
import { createRng } from '@kit/rng';
import { displayPinyin, medialSplit, parseSyllable } from '../../domain/pinyin';
import { INSTRUCTION } from '../lines';
import { button, pinyin } from '../common';
import type { PracticeView } from './types';

/**
 * 把声音接起来: the child HEARS a syllable (played on entry, 听一听 plays it again), sees the first sound waiting in the
 * equation and picks the missing last sound out of two. The tapped sound lands in the empty cell at once; a wrong
 * one is played back as the syllable it really makes, then the target again, so the two can be compared.
 */
export function blending(this: PracticeView) {
  const s = parseSyllable(this.q.target)!;
  // Three-part spellings (g-u-āi, x-i-ǎo, zh-u-àng …) show the glide as its own tile; ü is written without its dots after
  // j q x y (the id already says u) and keeps them after n / l (v), as in the book.
  const medial = medialSplit(s.final);
  const part = (id: string) => {
    const f = parseSyllable(id)!.final;
    return medialSplit(f)?.rest ?? f;
  };
  const slot = h('span', { class: 'blend-slot pinyin', 'aria-label': '缺的声音' }, '？');
  const result = pinyin('', 'blend-result');
  const tile = (text: string) => h('span', { class: 'blend-tile pinyin' }, text);
  const equation = h(
    'div',
    { class: 'blend-parts blend-equation' },
    tile(s.initial),
    ...(medial ? [h('span', { class: 'blend-plus' }, '+'), tile(medial.medial)] : []),
    h('span', { class: 'blend-plus' }, '+'),
    slot,
  );
  const rng = createRng(`${this.ctx.save.sessions}:${this.index}:blend`);
  const row = h('div', { class: 'syllable-choices blend-choices' });
  for (const id of rng.shuffle(this.q.choices)) {
    const right = id === this.q.target;
    const final = part(id);
    const key = h(
      'button',
      {
        type: 'button',
        class: 'pinyin-key pinyin',
        'data-final': final,
        'data-choice': id,
        onclick: () => {
          if (this.locked) return;
          slot.textContent = displayPinyin(final + s.tone);
          slot.classList.remove('ok', 'miss');
          slot.classList.add(right ? 'ok' : 'miss');
          key.classList.add(right ? 'ok' : 'miss');
          if (right) {
            result.textContent = displayPinyin(this.q.target);
            this.answer(true);
            this.actions.append(
              button(
                '读给台长听',
                () => {
                  this.locked = false;
                  void this.record();
                },
                'quiet',
                'mic',
              ),
            );
          } else {
            this.markTried(key);
            this.answer(false, id);
            this.later(1100, () => {
              slot.textContent = '？';
              slot.classList.remove('miss');
            });
          }
        },
      },
      displayPinyin(final + s.tone),
    );
    if (right) {
      key.dataset.answer = '1';
      this.guide(key);
    }
    row.append(key);
  }
  this.stage.append(
    button('听一听', () => void this.stimulus(), 'listen', 'listen'),
    equation,
    row,
    result,
    ...[this.lamps()].filter((x): x is HTMLElement => !!x),
  );
  this.setInstruction(INSTRUCTION.C);
}
