import { h } from '@kit/ui';
import { stationColumns } from '../domain/progress';
import type { Bank } from '../domain/types';
import { button, glyph, type Context } from './common';
import { BOOK } from './lines';

/**
 * 朗读册: one row per book page. The child reads the page aloud and taps "我读了一遍" (+1): no target, no limit, nothing is
 * taken away, nobody is ranked. A parent can stamp a page "已签字" on the parent page. It mirrors the paper habit, it does not replace it.
 */
export interface BookPage {
  page: number;
  station: number;
  lesson: number;
  title: string;
}
export function bookPages(b: Bank): BookPage[] {
  return b.lessons
    .flatMap((l) => (l.book?.pages ?? []).map((page, i, all) => ({ page, station: l.id, lesson: l.book!.also !== undefined && all.length > 1 && i === all.length - 1 ? l.book!.also : l.book!.lesson, title: l.title })))
    .sort((x, y) => x.page - y.page);
}
export const readsText = (n: number): string => (n ? `已读 ${n} 遍` : '还没开始读');

export function readBookView(ctx: Context): HTMLElement {
  const rows = bookPages(ctx.bank).map((p) => {
    const key = String(p.page);
    const count = h('span', { class: 'readbook-count', 'aria-live': 'polite' });
    const seal = h('span', { class: 'seal', hidden: true }, '已签字');
    const paint = () => {
      const entry = ctx.save.book?.[key];
      count.textContent = readsText(entry?.reads ?? 0);
      seal.hidden = !entry?.signedAt;
    };
    paint();
    const cols = stationColumns(ctx.bank, p.station).map((c) => c.name).join(' · ');
    return h(
      'section',
      { class: 'readbook-row', 'data-page': key },
      h('div', { class: 'readbook-info' }, h('b', null, `第 ${p.page} 页`), h('small', null, `课本第 ${p.lesson} 课 · ${p.title}`), cols ? h('small', { class: 'readbook-cols' }, cols) : null),
      h('div', { class: 'readbook-side' }, count, seal),
      button(
        '我读了一遍',
        () => {
          const book = (ctx.save.book ??= {});
          const entry = (book[key] ??= { reads: 0 });
          entry.reads++;
          ctx.persist();
          paint();
          void ctx.say(BOOK.plus.id);
        },
        'secondary',
        'mic',
      ),
    );
  });
  return h(
    'main',
    { class: 'album-page readbook-page' },
    h('div', { class: 'album-title' }, h('div', null, h('small', null, '读一遍，记一遍'), h('h2', null, '朗读册')), button('回电台', () => ctx.home(), 'secondary', 'back')),
    h('p', { class: 'readbook-note' }, glyph('book'), h('span', null, '大声读一页，就点一下。读几遍都可以，家长会在家长页签字。')),
    h('div', { class: 'readbook-scroll' }, ...rows),
  );
}
