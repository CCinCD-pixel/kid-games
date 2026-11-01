import { h } from '@kit/ui';
import { createRng } from '@kit/rng';
import { displayPinyin, parseSyllable } from '../../domain/pinyin';
import { STEP } from '../lines';
import { button } from '../common';
import type { PracticeView, SpellLevel } from './types';

const LEVELS: SpellLevel[] = ['initial', 'final', 'tone', 'full'];

export function spelling(this: PracticeView) {
  const w = this.word,
    id = w.syllables[this.syllableIndex],
    s = parseSyllable(id)!;
  // The scaffold level is chosen once per question: a wrong tap resets the box, but the child must not feel the
  // task change half way through a word.
  if (!this.spellLevel) {
    const preferred = this.ctx.save.settings.scaffold,
      box = this.ctx.save.atoms[this.q.skill]?.box ?? 0;
    this.spellLevel = LEVELS[Math.max(LEVELS.indexOf(preferred), Math.min(3, box))];
  }
  const level = this.spellLevel;
  let component: Exclude<SpellLevel, 'full'> = level === 'full' ? (LEVELS[this.fullParts] as never) : level;
  if (component === 'initial' && !s.initial) {
    component = 'final';
    if (level === 'full') this.fullParts = 1;
  }
  const tone = String(s.tone);
  const correct = component === 'initial' ? s.initial : component === 'final' ? s.final : tone;
  // What the cell shows while this part is still open (the part already known stays in view as the scaffold).
  const open =
    component === 'initial'
      ? `＿${displayPinyin(s.final + id.at(-1))}`
      : component === 'final'
        ? `${s.initial}＿`
        : `${(s.initial + s.final).replaceAll('v', 'ü')} ＿`;
  // What the cell shows when the child has put `value` into the open part (right or wrong).
  const filled = (value: string) =>
    component === 'initial'
      ? `${value}${displayPinyin(s.final + id.at(-1))}`
      : component === 'final'
        ? `${s.initial}${value}`.replaceAll('v', 'ü')
        : displayPinyin(`${s.initial}${s.final}${value}`);
  const picture = h(
    'div',
    { class: 'spelling-picture' },
    this.ctx.picture(w),
    // Naming the picture is part of the question (a picture owns exactly one word), so it does not count as a hint.
    button('听听图画', () => void this.stimulus(), 'quiet', 'listen'),
  );
  const sequence = h('div', { class: 'word-slots' });
  const drawSlots = (mode: 'open' | 'try' | 'all', value = '') =>
    sequence.replaceChildren(
      ...w.syllables.map((sy, i) => {
        const active = i === this.syllableIndex && mode !== 'all';
        const text =
          mode === 'all' || i < this.syllableIndex
            ? displayPinyin(sy)
            : i === this.syllableIndex
              ? mode === 'try'
                ? filled(value)
                : open
              : '·';
        return h(
          'span',
          { class: `grid-slot pinyin ${active ? 'active' : ''} ${mode === 'try' && active ? 'try' : ''} ${mode === 'all' ? 'done' : ''}` },
          text,
        );
      }),
    );
  drawSlots('open');
  this.setInstruction(STEP[component]);
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
  for (const value of rng.shuffle(alternatives)) {
    const key = h(
      'button',
      {
        type: 'button',
        class: 'pinyin-key pinyin',
        'data-piece': value,
        onclick: () => {
          if (this.locked) return;
          if (value !== correct) {
            // Echo first: the tapped letter/tone appears in the cell, then the gentle retry follows.
            drawSlots('try', value);
            this.markTried(key);
            this.answer(false);
            this.later(1000, () => {
              if (!this.locked) drawSlots('open');
            });
            return;
          }
          key.classList.add('selected');
          if (level === 'full' && this.fullParts < 2) {
            this.fullParts++;
            this.stage.replaceChildren();
            this.spelling();
            return;
          }
          this.fullParts = 0;
          this.syllableIndex++;
          if (this.syllableIndex === w.syllables.length) {
            // The last cell is filled and shown BEFORE the question counts as done.
            this.syllableIndex = w.syllables.length - 1;
            this.locked = true;
            this.fillAll!();
            keys.querySelectorAll('button').forEach((b) => (b.disabled = true));
            this.later(750, () => {
              this.locked = false;
              this.answer(true);
            });
          } else {
            this.stage.replaceChildren();
            this.spelling();
          }
        },
      },
      component === 'tone' ? ['轻声', '—', '／', '∨', '＼'][+value] : value.replaceAll('v', 'ü'),
    );
    if (value === correct) {
      key.dataset.answer = '1';
      this.guide(key);
    }
    keys.append(key);
  }
  this.fillAll = () => {
    drawSlots('all');
    keys.querySelectorAll('button').forEach((b) => (b.disabled = true));
  };
  this.stage.append(picture, h('div', { class: 'spelling-work' }, sequence, keys));
  requestAnimationFrame(() => {
    const active = sequence.querySelector<HTMLElement>('.active');
    if (active)
      sequence.scrollLeft =
        active.offsetLeft - sequence.offsetLeft - sequence.clientWidth / 2 + active.clientWidth / 2;
  });
  this.speakStep(STEP[component]);
}
