/**
 * S2 军棋学堂 map (spec §2.5, §4.1): the design-system nodeMap with the 9 lessons (L1 L2 F L3 … L8;
 * F carries the flip emblem). A lesson opens when the previous one has ≥ (items − 1) items with ≥ 1★.
 * Tapping a lesson slides out its item strip (5–9 blocks with stars); tapping a block starts the item.
 */
import { icon, starRating, type MapNode } from '@kit/ui';
import { lessonMap } from '../view/rowmap';
import type { App } from '../app';
import { LESSONS, type Lesson, type LessonItem } from '../content';
import { lessonComplete, lessonUnlocked, nextItem, starsOf } from '../core/progress';
import { mcIcon, type McIcon } from '../view/icons';
import { BaseScreen, abs, button, div } from './base';

const LESSON_ICON: Record<string, McIcon> = { rank: 'star', bomb: 'bomb', flip: 'flipcard', road: 'mountain', rail: 'train', shovel: 'shovel', flag: 'flag', deploy: 'dice', eye: 'eye' };
const TYPE_ICON: Record<LessonItem['type'], McIcon> = { board: 'flag', scene: 'flipcard', order: 'star', compare: 'swords', infer: 'eye', deploy: 'dice', 'deploy-full': 'dice' };

/** board items show their goal (capture / reach / flag / survive / no moves); other items their type */
function itemIcon(it: LessonItem): McIcon {
  if (it.type !== 'board') return TYPE_ICON[it.type];
  const g = it.goal.kind;
  return g === 'capture' ? 'swords' : g === 'reach' ? 'star' : g === 'survive' ? 'shield' : g === 'nomoves' ? 'feet' : 'flag';
}

export class AcademyScreen extends BaseScreen {
  readonly name = 'academy';
  private open: string | null;

  constructor(app: App, lesson?: string) {
    super(app);
    const next = nextItem(app.save);
    this.open = lesson ?? next?.lesson.id ?? null;
    this.bag.timeout(() => void this.say(this.open ? `mc.l${this.open === 'F' ? 'F' : this.open.slice(1)}.intro` : 'mc.home.academy'), 350);
  }

  back(): boolean {
    this.app.go({ name: 'home' });
    return true;
  }

  protected render(): void {
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-academy');
    const save = this.app.save;
    const title = div('mc-h1 mc-center', '军棋学堂');
    abs(title, portrait ? { x: 100, y: st + 10, w: 610, h: 56 } : { x: 100, y: st + 8, w: 500, h: 56 });
    this.el.appendChild(title);

    const mapBox = div('mc-map');
    mapBox.dataset.testid = 'academy-map';
    const mapRect = portrait ? { x: 20, y: st + 70, w: 770, h: this.open ? 560 : 800 } : { x: 20, y: st + 64, w: this.open ? 600 : 1040, h: 600 };
    abs(mapBox, mapRect);
    this.el.appendChild(mapBox);
    const next = nextItem(save);
    const nodes: MapNode[] = LESSONS.map((l, i) => {
      const unlocked = lessonUnlocked(save, i);
      const done = lessonComplete(save, l);
      const stars = done ? Math.min(3, Math.floor(l.items.reduce((a, it) => a + starsOf(save, it.id), 0) / l.items.length)) : undefined;
      const state: MapNode['state'] = !unlocked ? 'locked' : next?.lesson.id === l.id ? 'current' : done ? 'done' : 'open';
      return { id: l.id, label: l.id === 'F' ? '翻' : l.id.slice(1), state, stars };
    });
    // nodeMap measures the box: lay it out once it is attached
    const els = lessonMap(mapBox, nodes, { onPick: (n) => this.pickLesson(n.id), pad: portrait ? 64 : 78 });
    els.forEach((b, i) => {
      b.dataset.testid = `lesson-${LESSONS[i].id}`;
      const ico = LESSON_ICON[LESSONS[i].icon] ?? 'star';
      b.insertAdjacentHTML('beforeend', `<span class="mc-node-ico">${mcIcon(ico)}</span><span class="mc-node-name">${LESSONS[i].title}</span>`);
      if (LESSONS[i].id === this.open) b.classList.add('is-open');
    });

    if (this.open) this.renderStrip(LESSONS.find((l) => l.id === this.open)!, portrait);

    const gh = div('');
    if (portrait) {
      abs(gh, { x: 810 - 24 - 96, y: 1080 - 16 - 116, w: 96, h: 116 });
      abs(this.caption.el, { x: 24, y: 1080 - 16 - 96, w: 650, h: 84 });
    } else {
      abs(gh, { x: 24, y: 810 - 16 - 104, w: 90, h: 104 });
      abs(this.caption.el, { x: 124, y: 810 - 16 - 80, w: 480, h: 72 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, portrait ? 96 : 90, { mood: 'happy' });
  }

  private renderStrip(l: Lesson, portrait: boolean): void {
    const save = this.app.save;
    const idx = LESSONS.indexOf(l);
    const strip = div(`mc-strip${portrait ? '' : ' is-narrow'}`);
    strip.dataset.testid = 'item-strip';
    const rect = portrait ? { x: 20, y: this.safeTop + 640, w: 770, h: 300 } : { x: 636, y: this.safeTop + 64, w: 424, h: 620 };
    abs(strip, rect);
    const head = div('mc-strip__head', `<span class="mc-strip__ico">${mcIcon(LESSON_ICON[l.icon] ?? 'star')}</span><b>${l.title}</b><span class="mc-strip__teach">${l.teaches}</span>`);
    strip.appendChild(head);
    const grid = div(`mc-strip__grid${portrait ? '' : ' is-col'}`);
    const next = nextItem(save);
    l.items.forEach((it, k) => {
      const stars = starsOf(save, it.id);
      const prevDone = k === 0 || starsOf(save, l.items[k - 1].id) > 0 || save.settings.unlockAll;
      const locked = !lessonUnlocked(save, idx) || !prevDone;
      const isNext = next?.item.id === it.id;
      const b = button(`mc-block${locked ? ' is-locked' : ''}${stars ? ' is-done' : ''}${isNext ? ' is-next' : ''}`, `
        <span class="mc-block__n">${k + 1}</span>
        <span class="mc-block__ico">${locked ? icon('lock') : mcIcon(itemIcon(it))}</span>
        <span class="mc-block__stars">${starRating(stars, 3)}</span>`, () => this.pickItem(it, locked), `item-${it.id}`);
      grid.appendChild(b);
    });
    strip.appendChild(grid);
    this.el.appendChild(strip);
    strip.animate(portrait ? [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }] : [{ transform: 'translateX(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  private pickLesson(id: string): void {
    const idx = LESSONS.findIndex((l) => l.id === id);
    if (!lessonUnlocked(this.app.save, idx)) {
      this.app.play('ui-locked');
      void this.say('mc.lad.lockedmode', 'thinking');
      return;
    }
    this.app.play('ui-open');
    this.open = id;
    void this.say(`mc.l${id === 'F' ? 'F' : id.slice(1)}.intro`);
    this.render();
  }

  private pickItem(it: LessonItem, locked: boolean): void {
    if (locked) {
      this.app.play('ui-locked');
      void this.say('mc.lad.locked', 'thinking');
      return;
    }
    this.app.play('ui-confirm');
    const resume = this.app.save.puzzleResume?.id === it.id;
    this.app.go({ name: 'item', id: it.id, twin: resume ? this.app.save.puzzleResume!.twin : false, resume });
  }
}
