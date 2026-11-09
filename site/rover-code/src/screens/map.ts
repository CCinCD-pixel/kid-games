import { unlockAll } from '@kit/settings';
import { h, nodeMap, type MapNode } from '@kit/ui';
import { CHAPTERS, LEVELS, chapterLevels } from '../model/levels';
import { doneCount, starsOf, type RoverSave } from '../save';

export interface MapHost { root: HTMLElement; save: RoverSave; pick(id: string): void; pickChapter(ch: number): void; mine(): void; patrol(): void }

const NAME: Record<number, string> = { 1: '用箭头卡开出去', 2: '采样、台阶和车库', 3: '车头的方向', 4: '帮忙修一修', 5: '重复：几个几', 6: '魔法卡：把一段收起来', 7: '规则卡：自动驾驶', 8: '救援：带小车回家' };

/** a level is open when the one before it is done (all open with the parent's 全部解锁) */
export const levelOpen = (save: RoverSave, id: string): boolean => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return unlockAll() || i <= 0 || starsOf(save, LEVELS[i - 1].id) > 0 || starsOf(save, id) > 0;
};
/** a chapter opens once six levels of the one before it are done */
export const chapterOpen = (save: RoverSave, ch: number): boolean =>
  unlockAll() || ch <= 1 || chapterLevels(ch - 1).filter((l) => starsOf(save, l.id) > 0).length >= 6;
/** the chapter the child is working on: the first one that still has an open level not yet done */
export const frontier = (save: RoverSave): number => {
  const next = LEVELS.find((l) => starsOf(save, l.id) === 0 && levelOpen(save, l.id));
  return next ? next.ch : CHAPTERS[CHAPTERS.length - 1].ch;
};

export function renderMap(host: MapHost): () => void {
  const { save } = host;
  const ch = save.chapter;
  const extra = [
    ...(doneCount(save) >= 8 || unlockAll() ? [h('button', { class: 'xg-btn rc-minebtn', type: 'button', onclick: () => host.patrol() }, '月面巡逻')] : []),
    ...(chapterOpen(save, 8) || (save.custom?.length ?? 0) > 0 ? [h('button', { class: 'xg-btn rc-minebtn', type: 'button', onclick: () => host.mine() }, '我的地图')] : [])
  ];
  const narrow = window.innerWidth < 560;
  const tabs = h('div', { class: 'rc-tabs', role: 'tablist' }, ...CHAPTERS.map((c) => {
    const open = chapterOpen(save, c.ch);
    return h('button', { class: 'xg-btn rc-tab', type: 'button', role: 'tab', 'aria-selected': String(c.ch === ch), disabled: !open, 'aria-label': `第 ${c.ch} 章`, onclick: () => host.pickChapter(c.ch) }, narrow ? String(c.ch) : `第 ${c.ch} 章`);
  }));
  const row = h('div', { class: 'rc-tabrow' }, tabs, ...extra);
  const done = doneCount(save);
  const head = h('header', { class: 'rc-maphead' },
    h('h1', {}, '玉兔编程'), h('p', {}, `第 ${ch} 章 · ${NAME[ch] ?? ''}`),
    h('span', { class: 'rc-progress' }, `已通过 ${done} / ${LEVELS.length}`));
  const map = h('div', { class: 'rc-map' });
  const screen = h('section', { class: 'rc-mapscreen' }, head, row, map);
  host.root.replaceChildren(screen);
  const draw = () => {
    const firstOpen = LEVELS.find((l) => starsOf(save, l.id) === 0 && levelOpen(save, l.id))?.id;
    const nodes: MapNode[] = chapterLevels(ch).map((l) => {
      const stars = starsOf(save, l.id);
      const state = stars > 0 ? 'done' : l.id === firstOpen ? 'current' : levelOpen(save, l.id) ? 'open' : 'locked';
      return { id: l.id, label: String(l.n), state, stars: stars || undefined, boss: l.role === '合' };
    });
    map.replaceChildren();
    nodeMap(map, nodes, { nodeSize: window.innerWidth < 560 ? Math.max(52, Math.min(72, Math.floor(map.clientHeight / 6.5))) : 88, onPick: (n) => { if (n.state !== 'locked') host.pick(n.id); } });
  };
  requestAnimationFrame(draw);
  return draw; // called again when the layout changes
}
