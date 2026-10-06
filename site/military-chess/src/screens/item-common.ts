/**
 * Shared chrome of a 学堂 item (S3 board, S4 cards, S5 deploy items): the goal bar (icon + the
 * instruction + the lesson's progress dots), the stars that fly from the work area to the dots, the
 * bookkeeping of a finished item (stars, cards, promotions, log) and the end-of-lesson milestone
 * (kit showResult + the lesson's wrap line, spec §2.4 / §5.6).
 */
import { icon, showResult } from '@kit/ui';
import type { App } from '../app';
import { CARDS, ENDGAMES, LESSONS, lessonOf, endgameById, type Lesson } from '../content';
import { awardCards, endgameTierUnlocked, promote, recordItem, starsOf, type Stars } from '../core/progress';
import { MS, d } from '../view/anim';
import { mcIcon, type McIcon } from '../view/icons';
import { promotionCeremony } from '../view/promo';
import { abs, div } from './base';

export function progressDots(app: App, cur: string): string {
  const eg = endgameById(cur);
  const items: Array<{ id: string }> = eg ? ENDGAMES.filter((e) => e.tier === eg.tier) : lessonOf(cur)?.items ?? [];
  return items
    .map((x) => {
      const s = starsOf(app.save, x.id);
      return `<i class="mc-pdot${x.id === cur ? ' is-cur' : ''}${s ? ' is-done' : ''}" data-id="${x.id}">${s ? mcIcon('star') : ''}</i>`;
    })
    .join('');
}

export function goalBarHtml(app: App, o: { cur: string; ico: McIcon; text: string; sub?: string; twin?: boolean }): string {
  return `<div class="mc-goal__row"><span class="mc-goal__ico">${mcIcon(o.ico)}</span><b class="mc-goal__text">${o.text}</b>${o.twin ? `<span class="mc-twin-tag">${mcIcon('swap')}</span>` : ''}</div><div class="mc-goal__row is-sub">${o.sub ?? ''}<span class="mc-pdots" data-testid="pdots">${progressDots(app, o.cur)}</span></div>`;
}

/** the next item of the same lesson (or endgame tier), or null after the last one */
export function nextItemId(id: string): string | null {
  const eg = endgameById(id);
  const list: Array<{ id: string }> = eg ? ENDGAMES.filter((e) => e.tier === eg.tier) : lessonOf(id)?.items ?? [];
  const k = list.findIndex((x) => x.id === id);
  return k >= 0 ? list[k + 1]?.id ?? null : null;
}

export interface DoneInfo {
  stars: Stars;
  promos: number[];
  cards: string[];
  lesson: Lesson | null;
  lastOfLesson: boolean;
}

/** book a finished item: stars (best kept), lesson cards, promotions, log, hub line */
export function bookItem(app: App, id: string, stars: Stars, o: { hintMax: 0 | 1 | 2 | 3; moves?: number; extra?: Record<string, unknown> }): DoneInfo {
  const save = app.save;
  recordItem(save, id, stars, { moves: o.moves, hintMax: o.hintMax });
  if (save.puzzleResume?.id === id) save.puzzleResume = null;
  const cards = awardCards(save);
  const promos = promote(save);
  app.persist();
  app.hub();
  app.mark(endgameById(id) ? 'endgame-complete' : 'item-complete', { id, stars, hintMax: o.hintMax, ...(o.moves !== undefined ? { moves: o.moves } : {}), ...(o.extra ?? {}) });
  for (const r of promos) app.mark('promotion', { rank: r });
  const lesson = lessonOf(id) ?? null;
  const lastOfLesson = !!lesson && lesson.items[lesson.items.length - 1].id === id;
  return { stars, promos, cards, lesson, lastOfLesson };
}

/** stars fly from the middle of `from` to the current progress dot (900 ms, star-1..3) */
export function flyStars(app: App, host: HTMLElement, from: Element, goal: Element, n: number, o: { portrait: boolean; onArrive?: () => void }): void {
  const br = from.getBoundingClientRect();
  const target = goal.querySelector('.mc-pdot.is-cur') ?? goal;
  const tr = target.getBoundingClientRect();
  const sr = host.getBoundingClientRect();
  const k = sr.width / (o.portrait ? 810 : 1080) || 1;
  const src = { x: (br.left + br.width / 2 - sr.left) / k, y: (br.top + br.height / 2 - sr.top) / k };
  const dst = { x: (tr.left + tr.width / 2 - sr.left) / k, y: (tr.top + tr.height / 2 - sr.top) / k };
  let arrived = false;
  for (let i = 0; i < 3; i++) {
    const st = div(`mc-flystar${i < n ? '' : ' is-slot'}`, mcIcon('star'));
    st.dataset.testid = 'flystar';
    abs(st, { x: src.x - 40 + (i - 1) * 90, y: src.y - 40, w: 80, h: 80 });
    host.appendChild(st);
    if (i >= n) {
      st.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 0.6, transform: 'scale(1)' }, { opacity: 0 }], { duration: d(900), fill: 'forwards' }).onfinish = () => st.remove();
      continue;
    }
    window.setTimeout(() => app.play(`star-${i + 1}`), d(150 + i * 220));
    const dx = dst.x - (src.x + (i - 1) * 90), dy = dst.y - src.y;
    st.animate(
      [
        { transform: 'translate(0,0) scale(.3)', opacity: 0 },
        { transform: 'translate(0,-30px) scale(1.25)', opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 1 },
      ],
      { duration: d(MS.flagCapture * 0.75), delay: d(i * 160), easing: 'cubic-bezier(.22,1.4,.36,1)', fill: 'forwards' },
    ).onfinish = () => {
      st.remove();
      if (!arrived) {
        arrived = true;
        o.onArrive?.();
      }
    };
  }
  if (n === 0) o.onArrive?.();
}

/**
 * The lesson is done: a milestone (kit showResult, confetti for 3★) + the wrap line; promotions
 * after it. Resolves with where to go next.
 */
export async function lessonMilestone(app: App, host: HTMLElement, l: Lesson, info: DoneInfo, io: { say(line: string): void; wait(ms: number): Promise<void> }): Promise<'next' | 'map'> {
  const save = app.save;
  const stars = Math.max(1, Math.min(3, Math.floor(l.items.reduce((a, it) => a + starsOf(save, it.id), 0) / l.items.length))) as 1 | 2 | 3;
  app.play('chapter-complete');
  app.mark('lesson-complete', { lesson: l.id, stars });
  io.say(`mc.wrap.${l.id}`);
  const unlocks: string[] = [];
  if (l.unlocks === 'ladder:fan') unlocks.push('翻翻棋对战开放了');
  if (l.unlocks === 'ladder:ming') unlocks.push('明棋对战开放了');
  if (l.unlocks === 'ladder:an') unlocks.push('暗棋对战开放了');
  if (l.id === 'L5' && endgameTierUnlocked(save, 1)) unlocks.push('残局开放了');
  const nextLesson = LESSONS[LESSONS.indexOf(l) + 1];
  const act = await showResult({
    ribbon: `${l.title} · 学完了`,
    stars,
    title: l.wrap,
    text: [...unlocks, ...info.cards.map((c) => `获得知识卡：${CARDS.find((x) => x.id === c)?.title ?? c}`)].join('　'),
    actions: [
      { id: 'map', label: '回学堂', kind: 'secondary', icon: 'map' },
      ...(nextLesson ? [{ id: 'next', label: '下一课', kind: 'primary' as const, icon: 'next' as const }] : []),
    ],
    accentGame: 'army',
  });
  if (info.promos.length) await promotionCeremony(host, info.promos, { play: (n) => app.play(n), say: (line) => io.say(line), wait: (ms) => io.wait(ms) });
  return act === 'next' && nextLesson ? 'next' : 'map';
}

/** after an item: either the lesson milestone or the [下一题] button (spec §2.4: no modal per item) */
export async function afterItem(app: App, host: HTMLElement, id: string, info: DoneInfo, o: {
  portrait: boolean;
  say(line: string): void;
  wait(ms: number): Promise<void>;
  /** where to put [下一题] */
  nextRect: { x: number; y: number; w: number; h: number };
  teaches?: string;
  caption?: { show(text: string): void };
  onShown?: (b: HTMLButtonElement) => void;
}): Promise<void> {
  if (info.lesson && info.lastOfLesson) {
    await o.wait(d(1200));
    const where = await lessonMilestone(app, host, info.lesson, info, o);
    const nextLesson = LESSONS[LESSONS.indexOf(info.lesson) + 1];
    app.go({ name: 'academy', lesson: where === 'next' && nextLesson ? nextLesson.id : info.lesson.id });
    return;
  }
  if (info.promos.length) {
    await o.wait(d(900));
    await promotionCeremony(host, info.promos, { play: (n) => app.play(n), say: (line) => o.say(line), wait: (ms) => o.wait(ms) });
  }
  const next = nextItemId(id);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'xg-btn xg-btn--primary xg-btn--lg mc-next';
  b.dataset.testid = 'next';
  b.innerHTML = `<span>${next ? '下一题' : '回去看看'}</span>${icon('next')}`;
  b.addEventListener('click', () => {
    app.play('ui-confirm');
    const eg = endgameById(id);
    if (next) app.go({ name: 'item', id: next });
    else app.go(eg ? { name: 'endgames' } : { name: 'academy', lesson: lessonOf(id)?.id });
  });
  abs(b, o.nextRect);
  host.appendChild(b);
  b.animate([{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(260), easing: 'cubic-bezier(.2,.8,.2,1)' });
  if (o.teaches && o.caption) o.caption.show(o.teaches);
  o.onShown?.(b);
}
