/**
 * Modal moments on the design system's result card (kit `showResult` + our own content):
 *  - S7 跳级考试 invitation (spec §3.8): the companion, "已经会推箱子了？", 考一考 / 从第 1 章学;
 *  - chapter complete (spec §5.5, §6.6): the chapter emblem flies in, the new item clicks onto 小推,
 *    the new 知识卡 is shown and read; once per chapter;
 *  - a milestone item outside a chapter (经典仓库 all passed, 10 random orders);
 *  - S10 收尾卡 (spec §5.5): today's launches per route + one "讲给爸爸听" question; 再玩一关 / 回大厅
 *    (a natural stop, never a lock).
 * Every line is voiced (subtitles appear in the card itself) and the companion never looks sad.
 */
import { mount } from '@kit/companion';
import { icon, showResult } from '@kit/ui';
import { playMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import { sayChain } from '../audio/voice';
import { chapterEmblem } from '../art/emblems';
import { cardArt } from '../art/cards';
import { cosmeticsOf, robotCanvas } from '../art/robotArt';
import type { AppCtx } from '../app/context';
import { CARDS, CHAPTERS, COSMETICS, chapterOf, type Dest } from '../data';

const DEST: { id: Dest; name: string; svg: string }[] = [
  { id: 'tiangong', name: '天宫', svg: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="13" width="8" height="6" rx="1" fill="#8594D6"/><rect x="21" y="13" width="8" height="6" rx="1" fill="#8594D6"/><rect x="11" y="11" width="10" height="10" rx="4" fill="#E2E7FB"/><rect x="14.5" y="6" width="3" height="6" rx="1.4" fill="#E2E7FB"/><circle cx="16" cy="16" r="1.6" fill="#F6B934"/></svg>' },
  { id: 'moon', name: '月宫', svg: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="#E2E7FB"/><circle cx="12" cy="13" r="2.6" fill="#B7C1EC"/><circle cx="19" cy="19" r="3.4" fill="#B7C1EC"/><circle cx="20" cy="11" r="1.6" fill="#B7C1EC"/></svg>' },
  { id: 'mars', name: '火星', svg: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="#EB6A3C"/><path d="M7 14q5-3 9 0t9-1" stroke="#C25A3A" stroke-width="2.4" fill="none"/><path d="M8 20q5 2 9-1t8 1" stroke="#C25A3A" stroke-width="2" fill="none"/></svg>' },
];

/** S7 (spec §3.8): resolves 'go' (考一考) or 'learn' (从第 1 章学). */
export async function showCertOffer(ctx: AppCtx): Promise<'go' | 'learn'> {
  ctx.save.update((s) => {
    s.cert.offered = true;
  });
  const veteran = !!ctx.save.data.veteran;
  let bot: ReturnType<typeof mount> | null = null;
  let open = true;
  const lines = () => sayChain(ctx.voice, ['sok.cert.ask', veteran && 'sok.cert.veteran', 'sok.cert.go', 'sok.cert.rule'], () => open);
  const choice = await showResult({
    ribbon: '跳级考试',
    title: ctx.voice.text('sok.cert.ask'),
    text: `${veteran ? `${ctx.voice.text('sok.cert.veteran')}<br>` : ''}${ctx.voice.text('sok.cert.go')}<br>${ctx.voice.text('sok.cert.rule')}`,
    actions: [
      { id: 'go', label: '考一考', kind: 'primary', icon: 'flag' },
      { id: 'learn', label: '从第 1 章学', kind: 'secondary', icon: 'book' },
    ],
    accentGame: 'porter',
    onOpen: (panel) => {
      panel.classList.add('sok-offer');
      panel.dataset.testid = 'cert-offer';
      const host = document.createElement('div');
      host.className = 'sok-offer__bot';
      panel.prepend(host);
      // phones: a smaller companion so the question stays under him (Dad's feedback 2026-10-08)
      const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
      bot = mount(host, { size: phone ? 76 : 120, mood: 'happy', variant: 'full', sfx: (n) => playSfx(n, { volume: 0.5 }), name: '领航员' });
      bot.react('hop');
      void lines();
    },
  });
  open = false;
  (bot as ReturnType<typeof mount> | null)?.destroy();
  ctx.voice.stop();
  return choice === 'go' ? 'go' : 'learn';
}

/** Chapter complete: emblem, the new item on 小推, the new knowledge card (spec §5.5). */
export async function showChapterDone(ctx: AppCtx, ch: number, items: string[], cards: string[]): Promise<void> {
  const c = chapterOf(ch);
  const item = COSMETICS.find((x) => items.includes(x.id) && x.unlock.type === 'chapter' && x.unlock.ch === ch);
  const card = CARDS.find((x) => cards.includes(x.id) && x.ch === ch);
  playSfx('chapter-complete');
  let open = true;
  const say = () => sayChain(ctx.voice, ['sok.ch.done', item?.line, card?.line], () => open);
  await showResult({
    ribbon: `第 ${ch} 章完成`,
    title: c?.name ?? '',
    actions: [{ id: 'ok', label: '好', kind: 'primary', icon: 'check' }],
    accentGame: 'porter',
    onOpen: (panel) => {
      panel.classList.add('sok-done');
      panel.dataset.testid = 'chapter-done';
      const row = document.createElement('div');
      row.className = 'sok-done__row';
      const emblem = document.createElement('figure');
      emblem.className = 'sok-done__emblem';
      emblem.innerHTML = `${chapterEmblem(`ch${ch}`, 120)}<figcaption><b>章节徽章</b><span>${c?.name ?? `第 ${ch} 章`}</span></figcaption>`;
      row.append(emblem);
      if (item) {
        const fig = document.createElement('figure');
        fig.className = 'sok-done__item';
        const before = { ...ctx.save.data, cosmetics: { ...ctx.save.data.cosmetics, equipped: { ...ctx.save.data.cosmetics.equipped, [item.slot]: undefined } } };
        const robot = robotCanvas(150, 170, 112, { eyes: 'happy', cosmetics: cosmeticsOf(before) }, 158);
        fig.append(robot);
        const cap = document.createElement('figcaption');
        cap.innerHTML = `<b>新装备</b><span>${item.name}</span>`;
        fig.append(cap);
        row.append(fig);
        // "咔": the item appears on him a beat later
        setTimeout(() => {
          const now = robotCanvas(150, 170, 112, { eyes: 'happy', cheer: 0.6, cosmetics: cosmeticsOf(ctx.save.data) }, 158);
          robot.replaceWith(now);
          now.classList.add('is-click');
          playSfx('unlock');
          playSfx('powerup', { volume: 0.7 });
        }, ctx.test ? 0 : 900);
      }
      if (card) {
        const fig = document.createElement('figure');
        fig.className = 'sok-done__card';
        fig.innerHTML = `${cardArt(card.id)}<figcaption><b>新知识卡</b><span>${card.title}</span></figcaption>`;
        row.append(fig);
      }
      panel.querySelector('.xg-modal__title')?.after(row);
      void say();
    },
  });
  open = false;
  ctx.voice.stop();
}

/** A milestone item outside the chapters (retro paint, the random-orders badge). */
export async function showNewItem(ctx: AppCtx, id: string): Promise<void> {
  const item = COSMETICS.find((x) => x.id === id);
  if (!item) return;
  playSfx('unlock');
  let open = true;
  await showResult({
    ribbon: '新装备',
    title: item.name,
    actions: [{ id: 'ok', label: '好', kind: 'primary', icon: 'check' }],
    accentGame: 'porter',
    onOpen: (panel) => {
      panel.classList.add('sok-done');
      panel.dataset.testid = 'new-item';
      const fig = document.createElement('figure');
      fig.className = 'sok-done__item sok-done__item--solo';
      fig.append(robotCanvas(170, 190, 126, { eyes: 'happy', cheer: 0.6, cosmetics: cosmeticsOf(ctx.save.data) }, 178));
      panel.querySelector('.xg-modal__title')?.after(fig);
      void sayChain(ctx.voice, ['sok.hangar.new', item.line], () => open);
    },
  });
  open = false;
  ctx.voice.stop();
}

/** S10 收尾卡: resolves 'more' (再玩一关) or 'hub' (回大厅). */
export async function showWrapUp(ctx: AppCtx, chapter: number): Promise<'more' | 'hub'> {
  const v = ctx.visit;
  const total = v.launches.tiangong + v.launches.moon + v.launches.mars;
  const talk = CHAPTERS.find((c) => c.ch === chapter)?.talk ?? [12, 2, 10];
  const n = talk[(ctx.save.data.launched.total + v.levels) % talk.length];
  const talkId = `sok.talk.${n}`;
  ctx.marks.add('unit-end', { levels: v.levels, ms: Math.round(v.activeMs) });
  ctx.marks.flush();
  playMusic();
  playSfx('level-complete', { volume: 0.7 });
  let open = true;
  const choice = await showResult({
    ribbon: '今天的发射报告',
    title: total > 0 ? `发射了 ${total} 枚火箭` : '今天推了好多箱子',
    actions: [
      { id: 'more', label: '再玩一关', kind: 'primary', icon: 'play' },
      { id: 'hub', label: '回大厅', kind: 'secondary', icon: 'home' },
    ],
    accentGame: 'porter',
    onOpen: (panel) => {
      panel.classList.add('sok-wrap');
      panel.dataset.testid = 'wrapup';
      const dests = document.createElement('div');
      dests.className = 'sok-wrap__dests';
      dests.innerHTML = DEST.map((d) => `<div class="sok-wrap__dest">${d.svg}<span>${d.name}</span><b>${v.launches[d.id]}</b></div>`).join('');
      const q = document.createElement('div');
      q.className = 'sok-wrap__talk';
      q.innerHTML = `<span class="sok-wrap__talkhead">${icon('parent')}讲给爸爸听</span><p>${ctx.voice.text(talkId)}</p>`;
      const rep = document.createElement('button');
      rep.type = 'button';
      rep.className = 'xg-iconbtn xg-iconbtn--sm sok-wrap__replay';
      rep.setAttribute('aria-label', '再听一遍');
      rep.innerHTML = icon('replay');
      rep.addEventListener('click', () => void ctx.voice.say(talkId, { interrupt: true }));
      q.append(rep);
      panel.querySelector('.xg-modal__title')?.after(dests, q);
      void sayChain(ctx.voice, ['sok.wrap.title', talkId], () => open);
    },
  });
  open = false;
  ctx.voice.stop();
  v.shown = true;
  ctx.save.update((s) => {
    s.wrapShownAt = Date.now();
  });
  return choice === 'hub' ? 'hub' : 'more';
}
