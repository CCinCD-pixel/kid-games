import { h } from '@kit/ui';
import { createRng } from '@kit/rng';
import { displayPinyin, parseSyllable } from '../../domain/pinyin';
import { button } from '../common';
import type { PracticeView } from './types';

export function spelling(this: PracticeView) {
  const w = this.word,
    id = w.syllables[this.syllableIndex],
    s = parseSyllable(id)!;
  const preferred = this.ctx.save.settings.scaffold,
    box = this.ctx.save.atoms[this.q.skill]?.box ?? 0;
  const levels = ['initial', 'final', 'tone', 'full'] as const;
  const level = levels[Math.max(levels.indexOf(preferred), Math.min(3, box))];
  let component = level === 'full' ? levels[this.fullParts] : level;
  if (component === 'initial' && !s.initial) {
    component = 'final';
    if (level === 'full') this.fullParts = 1;
  }
  const correct = component === 'initial' ? s.initial : component === 'final' ? s.final : String(s.tone);
  const show =
    component === 'initial'
      ? `＿${displayPinyin(s.final + id.at(-1))}`
      : component === 'final'
        ? `${s.initial}＿`
        : `${(s.initial + s.final).replaceAll('v', 'ü')} ＿`;
  const picture = h(
    'div',
    { class: 'spelling-picture' },
    this.ctx.picture(w),
    button('听听图画', () => void this.stimulus(), 'quiet', 'listen'),
  );
  const sequence = h(
    'div',
    { class: 'word-slots' },
    w.syllables.map((sy, i) =>
      h(
        'span',
        { class: `grid-slot pinyin ${i === this.syllableIndex ? 'active' : ''}` },
        i < this.syllableIndex ? displayPinyin(sy) : i === this.syllableIndex ? show : '·',
      ),
    ),
  );
  const directions = h(
    'p',
    { class: 'part-direction' },
    component === 'initial'
      ? '先找开头的声音'
      : component === 'final'
        ? '找到后面的声音'
        : '给它戴上声调小帽子',
  );
  const alternatives =
    component === 'tone'
      ? ['0', '1', '2', '3', '4']
      : component === 'initial'
        ? [
            correct,
            ...(correct === 'b'
              ? ['p', 'd']
              : ['l', 'n', 'd', 't'].includes(correct)
                ? ({ l: ['n'], n: ['l'], d: ['t'], t: ['d'] }[correct] ?? [])
                : ['b', 'p', 'd', 't', 'n', 'l', 'm', 'f']
            )
              .filter((x) => x !== correct)
              .slice(0, level === 'full' ? 7 : 1),
          ]
        : [
            correct,
            ...(correct === 'v'
              ? ['u', 'a', 'o', 'e', 'i']
              : correct === 'u'
                ? ['v', 'a', 'o', 'e', 'i']
                : ['a', 'o', 'e', 'i', 'u', 'v']
            )
              .filter((x) => x !== correct)
              .slice(0, level === 'full' ? 5 : 1),
          ];
  const keys = h('div', { class: 'spelling-keys' }),
    rng = createRng(`${this.ctx.save.sessions}:${this.index}:${this.syllableIndex}:${component}`);
  for (const value of rng.shuffle(alternatives))
    keys.append(
      h(
        'button',
        {
          type: 'button',
          class: 'pinyin-key pinyin',
          'data-piece': value,
          onclick: () => {
            if (this.locked) return;
            if (value !== correct) {
              this.answer(false);
              return;
            }
            if (level === 'full' && this.fullParts < 2) {
              this.fullParts++;
              this.stage.replaceChildren();
              this.spelling();
              return;
            }
            this.fullParts = 0;
            this.syllableIndex++;
            if (this.syllableIndex === w.syllables.length) this.answer(true);
            else {
              this.stage.replaceChildren();
              this.spelling();
            }
          },
        },
        component === 'tone' ? ['轻声', '—', '／', '∨', '＼'][+value] : value.replaceAll('v', 'ü'),
      ),
    );
  this.stage.append(picture, h('div', { class: 'spelling-work' }, sequence, directions, keys));
  requestAnimationFrame(() => {
    const active = sequence.querySelector<HTMLElement>('.active');
    if (active)
      sequence.scrollLeft =
        active.offsetLeft - sequence.offsetLeft - sequence.clientWidth / 2 + active.clientWidth / 2;
  });
}
