/**
 * 双人分屏对战 · 怎么玩 (house style: every instruction has a voice, a subtitle and 再听一遍, and every intro has the
 * kit 跳过). A night card with the six rules — one short line each (≤ 15 characters, the house subtitle limit), read aloud one after the other while the row being read
 * lights up. The rows ARE the subtitle (the kit bar is hidden under the card, like the 简报 / 章节卡 do).
 *
 *   shown once on the first entry into versus (save.seenTips 'versus:intro'), then from 设置 → 双人对战 · 看玩法 and
 *   from the pause card's 玩法说明; the parent's 跳过开场和教学 skips the automatic one.
 *
 * Every sentence is true to the sim (versus.ts / match.ts / venues.json): wall = slide (never lethal), another snake's body
 * = out, back in after RESPAWN.timed.delay (3 s), boost costs length, MATCH_SEC = 180, the longer snake wins.
 */
import { bindPress, h, icon, mountSkipButton } from '@kit/ui';
import { lineText } from './audio';

export const VERSUS_INTRO_IDS = ['snake.vs.intro.1', 'snake.vs.intro.2', 'snake.vs.intro.3', 'snake.vs.intro.4', 'snake.vs.intro.5', 'snake.vs.intro.6'] as const;

const ART = [
  // 手指拖着蛇走
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 38C14 38 14 24 25 24S33 15 37 14" fill="none" stroke="#ffd23f" stroke-width="8" stroke-linecap="round"/><circle cx="39" cy="12" r="7" fill="#fff" stroke="#8fb4ff" stroke-width="3"/></svg>',
  // 星尘
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5l5.4 12 13 1.4-9.7 8.8 2.7 12.9L24 33.2 12.6 40.1l2.7-12.9-9.7-8.8 13-1.4z" fill="#ffd23f"/></svg>',
  // 蛇头撞上别的蛇的身体
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 38H43" stroke="#ff7a7a" stroke-width="9" stroke-linecap="round"/><circle cx="24" cy="15" r="8" fill="#ffd23f"/><path d="M24 25v7" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 7"/></svg>',
  // 三秒后复活
  '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="#ffd23f" stroke-width="4.5"/><path d="M24 12v13l8 5" fill="none" stroke="#ffd23f" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // 闪电
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 4 11 27h11l-4 17 19-25H25z" fill="#ffd23f"/></svg>',
  // 奖杯
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0zM4 5h3v3a3 3 0 0 1-3-3zM20 5h-3v3a3 3 0 0 0 3-3zM10 14h4v3h-4zM8 18h8v2H8z" fill="#ffd23f"/></svg>',
];

export interface VersusIntroOpts {
  /** the voice (Voice.say): resolves when the line ended / was cut */
  say: (id: string, o?: { interrupt?: boolean }) => Promise<unknown>;
  /** stop the narrator and take its subtitle off the screen */
  hush: () => void;
  /** label of the closing button */
  doneLabel: string;
  /** closed by the button (done) or by the kit 跳过 (skip) */
  onClose: (how: 'done' | 'skip') => void;
}
export interface VersusIntro { el: HTMLElement; close(how?: 'done' | 'skip'): void; replay(): void; readonly closed: boolean }

export function versusIntro(root: HTMLElement, o: VersusIntroOpts): VersusIntro {
  const rows = VERSUS_INTRO_IDS.map((id, i) => {
    const art = h('span', { class: 'sb-vsintro__art', 'aria-hidden': 'true' }); art.innerHTML = ART[i];
    return h('li', { class: 'sb-vsintro__row', 'data-line': id }, art, h('span', { class: 'sb-vsintro__txt' }, lineText(id)));
  });
  const replay = h('button', { class: 'xg-btn xg-btn--secondary sb-vsintro__replay', type: 'button', 'aria-label': '再听一遍', 'data-sfx': 'ui-tap' });
  replay.innerHTML = `${icon('listen')}<span>再听一遍</span>`;
  const done = h('button', { class: 'xg-btn xg-btn--primary sb-vsintro__done', type: 'button', 'data-sfx': 'ui-confirm' }, o.doneLabel);
  const el = h('section', { class: 'sb-vsintro', role: 'dialog', 'aria-label': '双人对战怎么玩' },
    h('div', { class: 'sb-vsintro__card xg-root' },
      h('h2', { class: 'sb-vsintro__title' }, '双人对战怎么玩'),
      h('ol', { class: 'sb-vsintro__list' }, ...rows),
      h('div', { class: 'sb-vsintro__actions' }, replay, done)));
  root.append(el);
  const unbind = bindPress(el);

  let closed = false, token = 0;
  const light = (i: number) => rows.forEach((r, k) => r.classList.toggle('is-on', k === i));
  // read the six rules one after the other; a newer run (再听一遍), a close or an interrupted line ends this one
  async function run(): Promise<void> {
    const my = ++token;
    for (let i = 0; i < VERSUS_INTRO_IDS.length; i++) {
      if (closed || my !== token) return;
      light(i);
      const r = await o.say(VERSUS_INTRO_IDS[i], { interrupt: i === 0 });
      if (closed || my !== token || r === 'interrupted') return;
    }
    if (my === token && !closed) light(-1);
  }
  function close(how: 'done' | 'skip' = 'done') {
    if (closed) return;
    closed = true; token++;
    unskip(); unbind();
    o.hush();
    el.remove();
    o.onClose(how);
  }
  replay.addEventListener('click', () => { o.hush(); void run(); });
  done.addEventListener('click', () => close('done'));
  // the kit's 跳过 (top-right, after 1.5 s; its tap never reaches the card)
  const unskip = mountSkipButton(document.body, () => close('skip'), { theme: 'night', className: 'sb-vsskip' });
  void run();
  return { el, close, replay: () => { o.hush(); void run(); }, get closed() { return closed; } };
}
