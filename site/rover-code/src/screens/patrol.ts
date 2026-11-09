import { h } from '@kit/ui';
import { TIERS, dailySeed, type Tier } from '../model/patrol';
import type { RoverSave } from '../save';

export interface PatrolHost { root: HTMLElement; save: RoverSave; back(): void; start(tier: Tier, seed: string): void }

/** 月面巡逻: a fresh little level whenever you like; the daily one is the same for everybody that day */
export function renderPatrol(host: PatrolHost): void {
  const rec = host.save.patrol ?? { count: 0, best3: 0 };
  const today = dailySeed();
  const dailyDone = rec.daily === today;
  const tierBtn = (t: Tier) => h('button', { class: 'xg-btn xg-btn--lg rc-tier', type: 'button', 'data-tier': String(t), onclick: () => host.start(t, `${Date.now()}-${Math.floor(Math.random() * 1e6)}`) },
    h('b', {}, TIERS[t].label), h('small', {}, t === 1 ? '短短几步' : t === 2 ? '要采一份样本' : '路长，要采两份样本'));
  host.root.replaceChildren(h('section', { class: 'rc-mapscreen rc-patrol' },
    h('header', { class: 'rc-maphead' }, h('h1', {}, '月面巡逻'), h('p', {}, '每次都是新的地图，用的卡越少，星星越多'), h('span', { class: 'rc-progress' }, `已巡逻 ${rec.count} 次 · 三星 ${rec.best3} 次`)),
    h('div', { class: 'rc-patrol-body' },
      h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg rc-daily', type: 'button', onclick: () => host.start(2, today) }, dailyDone ? '今日巡逻 ✓ 再玩一次' : '今日巡逻', h('small', {}, today)),
      h('div', { class: 'rc-tiers' }, tierBtn(1), tierBtn(2), tierBtn(3))),
    h('button', { class: 'xg-btn', type: 'button', onclick: () => host.back() }, '回地图')));
}
