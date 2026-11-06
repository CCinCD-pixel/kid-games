import { h } from '@kit/ui';
import { pageProgress, pageText, weakItems, weekVolume } from '../domain/progress';
import { bookPages, readsText } from './readbook';
import { button, type Context } from './common';

/**
 * Parent page, part 2 (B7, A11 stamps, B8/B9 buttons). It shows counts per book page and column, the ten shakiest items with their
 * page, and the last 7 days of practice. It never shows the child's recordings and never ranks anything.
 */
export function pageReport(ctx: Context): HTMLElement[] {
  const s = ctx.save;
  const rows = pageProgress(s, ctx.bank);
  const byPage = h(
    'section',
    { class: 'parent-card', 'data-card': 'pages' },
    h('h3', null, '按课本页'),
    h('p', { class: 'parent-note' }, '每一栏已经“稳了”的数量 / 这一栏的总数。稳了，就是连着几次都答对，隔几次再复习也还记得。'),
    ...(rows.length
      ? rows.map((r) =>
          h(
            'div',
            { class: 'page-row', 'data-station': String(r.station) },
            h('b', null, `${pageText(r.pages)} · ${r.label.split(' · ')[0]}`),
            h('p', null, r.columns.map((c) => `${c.name} ${c.done}/${c.total}`).join('　')),
          ),
        )
      : [h('p', null, '老师还没有讲到有课本页的内容。')]),
  );
  const weak = weakItems(s, ctx.bank, 10);
  const weakCard = h(
    'section',
    { class: 'parent-card', 'data-card': 'weak' },
    h('h3', null, '薄弱项前 10'),
    ...(weak.length
      ? [h('ol', { class: 'weak-list' }, ...weak.map((w) => h('li', null, h('span', null, w.label), h('small', null, `${pageText(w.pages) || '—'}${w.misses ? ` · 答错 ${w.misses} 次` : ' · 等着复习'}`))))]
      : [h('p', null, '现在没有明显的薄弱项，继续保持。')]),
  );
  const vol = weekVolume(s);
  const volCard = h(
    'section',
    { class: 'parent-card', 'data-card': 'week' },
    h('h3', null, '最近 7 天'),
    h('p', null, vol.total ? `共练了 ${vol.total} 题，其中 ${vol.activeDays} 天有练习。` : '这 7 天还没有练习记录。'),
    ...vol.days.map((d) => h('div', { class: 'week-row' }, h('span', null, d.label), h('i', { style: `width:${Math.min(100, d.count * 3)}%` }), h('b', null, String(d.count)))),
  );
  // 朗读册: the stamps
  const stampList = h('div', { class: 'stamp-list' });
  const paintStamps = () => {
    const pages = bookPages(ctx.bank).filter((p) => ctx.save.book?.[String(p.page)]?.reads || ctx.save.book?.[String(p.page)]?.signedAt);
    stampList.replaceChildren(
      ...(pages.length
        ? pages.map((p) => {
            const entry = ctx.save.book![String(p.page)];
            return h(
              'div',
              { class: 'stamp-row', 'data-page': String(p.page) },
              h('span', null, `第 ${p.page} 页 · ${readsText(entry.reads)}`),
              button(
                entry.signedAt ? '撤销“已签字”' : '盖“已签字”章',
                () => {
                  if (entry.signedAt) delete entry.signedAt;
                  else entry.signedAt = Date.now();
                  ctx.persist();
                  paintStamps();
                },
                entry.signedAt ? 'quiet' : 'secondary',
              ),
            );
          })
        : [h('p', null, '孩子在“朗读册”里点过“我读了一遍”的页，会出现在这里。')]),
    );
  };
  paintStamps();
  const stamps = h('section', { class: 'parent-card', 'data-card': 'stamps' }, h('h3', null, '朗读册签字'), h('p', { class: 'parent-note' }, '这只是纸面习惯的镜像，不取代练习册上的签字。数据只在这台设备上。'), stampList);
  // B8 / B9
  const scope = h(
    'select',
    { 'aria-label': '练习页范围' },
    h('option', { value: 'weak' }, '薄弱项（按课本页）'),
    ...ctx.bank.lessons.filter((l) => (l.book?.pages.length ?? 0) > 0 && l.id <= s.settings.lesson).map((l) => h('option', { value: l.id }, pageText(l.book!.pages))),
  );
  const printCard = h(
    'section',
    { class: 'parent-card', 'data-card': 'print' },
    h('h3', null, '打印练习页'),
    h('p', { class: 'parent-note' }, 'A4 竖版、黑白，纸上留着手写的空白和签字栏。只用现有的练习内容，不含课本原文和图片。'),
    h('label', { class: 'parent-field' }, h('span', null, '范围'), scope),
    h('div', { class: 'print-buttons' }, button('生成练习页', () => ctx.print('weak', scope.value === 'weak' ? undefined : Number(scope.value)), 'secondary', 'book'), button('生成一周回顾卷', () => ctx.print('week'), 'secondary', 'book')),
  );
  return [byPage, weakCard, volCard, stamps, printCard];
}
