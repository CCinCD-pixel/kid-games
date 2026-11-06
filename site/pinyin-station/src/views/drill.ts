import { h } from '@kit/ui';
import { cellLabel, compareTime, type DrillTable } from '../domain/drill';
import { button, glyph, type Context } from './common';

/**
 * One 练读表: a 4-column grid, the child reads cell after cell (the real recording of the current cell can be played first),
 * taps 读好了, and when the table is done sees how long it took, softly. No ranking, no points, nothing is ever "wrong".
 */
export function drillView(ctx: Context, table: DrillTable, leave: () => void): HTMLElement {
  const cells = table.cells.map((id) => h('div', { class: 'drill-cell pinyin', 'data-cell': id }, cellLabel(id)));
  const grid = h('div', { class: 'drill-grid', 'aria-label': '练读表' }, ...cells);
  const status = h('p', { class: 'drill-status', 'aria-live': 'polite' }, '一格一格慢慢读，读好了就点“读好了”。');
  const actions = h('div', { class: 'practice-actions drill-actions' });
  let index = -1,
    startedAt = 0;
  const mark = () => cells.forEach((c, i) => {
    c.classList.toggle('done', i < index);
    c.classList.toggle('current', i === index);
  });
  const finish = () => {
    const seconds = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
    const best = (ctx.save.drillBest ??= {});
    const before = best[table.id];
    const message = compareTime(before?.last, seconds);
    best[table.id] = { best: Math.min(before?.best ?? seconds, seconds), last: seconds, at: Date.now() };
    ctx.persist();
    cells.forEach((c) => c.classList.add('done'));
    cells.forEach((c) => c.classList.remove('current'));
    status.replaceChildren(glyph('star'), h('span', null, `这一张读完啦，用了 ${seconds} 秒。`), ...(message ? [h('em', { class: 'drill-compare' }, message)] : []));
    status.classList.add('is-done');
    actions.replaceChildren(button('再读一张', () => leave(), 'primary', 'next'), button('回电台', () => ctx.home(), 'quiet', 'back'));
    void ctx.say('py.drill.done');
  };
  const show = () => {
    mark();
    cells[index]?.scrollIntoView({ block: 'nearest' });
    status.textContent = `第 ${index + 1} 格，共 ${cells.length} 格`;
    actions.replaceChildren(
      button('听示范', () => void ctx.syllable(table.cells[index]), 'secondary', 'listen'),
      button('读好了', () => (++index >= cells.length ? finish() : show()), 'primary', 'next'),
    );
  };
  actions.append(
    button(
      '开始读',
      () => {
        startedAt = performance.now();
        index = 0;
        show();
        void ctx.say('py.drill');
      },
      'primary',
      'play',
    ),
  );
  return h(
    'main',
    { class: 'album-page drill-page' },
    h('div', { class: 'album-title' }, h('div', null, h('small', null, table.note), h('h2', null, table.title)), button('回电台', () => ctx.home(), 'secondary', 'back')),
    h('div', { class: 'drill-scroll' }, grid),
    status,
    actions,
  );
}
