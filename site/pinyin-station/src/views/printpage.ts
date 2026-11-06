import { h } from '@kit/ui';
import type { PrintGroup, QuizItem, Worksheet } from '../domain/worksheet';
import { button } from './common';

/**
 * The A4 practice paper (B8) and the weekly review paper (B9). Black and white, no pictures, no book text: the child reads and writes by hand.
 * On screen it is a preview; the print style (styles.css, `@page`) leaves only the sheet.
 */
const py = (text: string, cls = '') => h('span', { class: `pinyin ${cls}` }, text);
const blank = () => h('span', { class: 'ps-blank', 'aria-hidden': 'true' });
const tick = () => h('span', { class: 'ps-box', 'aria-hidden': 'true' });

function groupView(g: PrintGroup): HTMLElement {
  return h(
    'section',
    { class: 'ps-group', 'data-station': String(g.station) },
    h('h2', { class: 'ps-page' }, g.label),
    g.cells.length ? h('div', { class: 'ps-grid', 'aria-label': '读一读' }, ...g.cells.map((c) => h('div', { class: 'ps-cell pinyin' }, c))) : null,
    g.blends.length
      ? h('div', { class: 'ps-blends', 'aria-label': '拼一拼' }, ...g.blends.map((x) => h('div', { class: 'ps-blend' }, py(x.initial), ' + ', py(x.final), ' → ', blank())))
      : null,
    g.words.length ? h('div', { class: 'ps-words', 'aria-label': '词语' }, ...g.words.map((w) => h('div', { class: 'ps-word' }, py(w.display, 'ps-word-py'), h('span', { class: 'ps-hanzi' }, w.hanzi)))) : null,
    g.tone ? h('div', { class: 'ps-tone', 'aria-label': '四声' }, ...g.tone.map((c) => h('div', { class: 'ps-cell pinyin' }, c))) : null,
  );
}
function quizView(q: QuizItem): HTMLElement {
  const body: (HTMLElement | string)[] =
    q.type === 'read'
      ? ['读一读　', py(q.text, 'ps-big')]
      : q.type === 'letter'
        ? ['读一读　', py(q.text, 'ps-big')]
        : q.type === 'blend'
          ? ['拼一拼　', py(q.initial), ' + ', py(q.final), ' → ', blank()]
          : q.type === 'word'
            ? ['读一读　', h('span', { class: 'ps-word ps-inline' }, py(q.display, 'ps-word-py'), h('span', { class: 'ps-hanzi' }, q.hanzi))]
            : q.type === 'tone'
              ? ['四声　', ...q.cells.map((c) => py(c, 'ps-tone-cell'))]
              : ['读一读　', py(q.a, 'ps-big'), '　', py(q.b, 'ps-big')];
  return h('li', { class: `ps-q ps-q-${q.type}`, value: q.n }, h('span', { class: 'ps-body' }, ...body), tick());
}
export function printView(sheet: Worksheet, leave: () => void): HTMLElement {
  const date = new Date();
  const paper = h(
    'article',
    { class: 'print-sheet', 'aria-label': sheet.title },
    h('header', { class: 'ps-head' }, h('h1', null, `拼音电台 · ${sheet.title}`), h('p', null, sheet.note), h('span', { class: 'ps-date' }, `${date.getMonth() + 1} 月 ${date.getDate()} 日　姓名：＿＿＿＿＿＿`)),
    ...sheet.groups.map(groupView),
    sheet.quiz.length ? h('ol', { class: 'ps-quiz' }, ...sheet.quiz.map(quizView)) : null,
    sheet.groups.length || sheet.quiz.length ? null : h('p', { class: 'ps-empty' }, '还没有可以练的内容，先去玩几次今天的节目吧。'),
    h('footer', { class: 'ps-foot' }, '我已朗读（　　）遍　　家长签字：＿＿＿＿＿＿＿＿＿＿'),
  );
  const scroll = h('div', { class: 'print-scroll' }, paper);
  // On a small screen the preview shrinks to fit (the paper itself stays 186 mm; the print style resets the zoom).
  const fit = () => {
    const style = paper.style as CSSStyleDeclaration & { zoom: string };
    style.zoom = String(Math.min(1, Math.max(0.3, (scroll.clientWidth - 20) / (186 * 3.7795))));
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(scroll);
  return h(
    'main',
    { class: 'album-page print-page' },
    h('div', { class: 'print-toolbar' }, h('div', null, h('small', null, 'A4 竖版 · 黑白'), h('h2', null, sheet.title)), h('div', { class: 'print-actions' }, button('打印', () => window.print(), 'primary', 'play'), button('回家长页', leave, 'secondary', 'back'))),
    h('p', { class: 'print-help' }, '点“打印”，在 iPad 上选择 AirPrint 打印机。下面是预览，纸上留有手写的空白。'),
    scroll,
  );
}
