// 锦囊谜题 list (spec §3.18, §4.10): three drill groups — 精打细算 P1-01…05 (after 1-6), 对症下药 P2-01…05 (after
// 1-10), 举一反三 P2-09/P2-10 (after 2-10). Each drill shows its stars (by spend) and how many lanes it has.
import { icon, bindPress } from '@kit/ui';
import PZ from '../../../../content/gear-fort/puzzles.json';
import type { Puzzle } from '../lane/puzzle';
import { rigIcon } from '../art/icons';
import { atlasFor, type AppCtx } from '../ctx';

export const PUZZLES = (PZ as unknown as { puzzles: Puzzle[] }).puzzles;
const GROUP_TEXT: Record<number, { seal: string; sub: string }> = {
  1: { seal: '省', sub: '粮正好够用，一粒都不多' },
  2: { seal: '对', sub: '看清来的是什么，再选牒' },
  4: { seal: '推', sub: '没见过的机关，看它身上的标签' },
};
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
export const puzzleOpen = (app: AppCtx, p: Puzzle): boolean => (app.save.levels[p.unlock]?.wins ?? 0) > 0;
export const nextPuzzle = (app: AppCtx, id: string): Puzzle | null => { const i = PUZZLES.findIndex((p) => p.id === id); const n = PUZZLES[i + 1]; return n && puzzleOpen(app, n) ? n : null; };

export function mountPuzzles(root: HTMLElement, app: AppCtx, onPick: (p: Puzzle) => void, onBack: () => void): { destroy(): void } {
  const el = h('div', 'gf-menu gf-pzlist xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const atlas = atlasFor(140, app.dpr);
  el.innerHTML = `<header class="gf-pzlist__head"><div><div class="gf-title">锦囊谜题</div><div class="gf-sub">先摆好全部的牒，再按开始推演 · 越省越好</div></div>
    <button class="xg-btn xg-btn--secondary gf-pzlist__back">${icon('map')}回地图</button></header><div class="gf-pzlist__groups"></div>`;
  const groups = el.querySelector('.gf-pzlist__groups') as HTMLElement;
  for (const g of [1, 2, 4]) {
    const ps = PUZZLES.filter((p) => p.group === g); if (!ps.length) continue;
    const open = puzzleOpen(app, ps[0]); const T = GROUP_TEXT[g];
    const sec = h('section', 'gf-pzg' + (open ? '' : ' is-locked'));
    sec.innerHTML = `<div class="gf-pzg__head"><span class="gf-pzg__seal">${T.seal}</span><div><b>${ps[0].groupName}</b><small>${open ? T.sub : `守住 ${ps[0].unlock} 后开放`}</small></div>
      <div class="gf-pzg__deck"></div></div><div class="gf-pzg__row"></div>`;
    const deck = sec.querySelector('.gf-pzg__deck') as HTMLElement;
    for (const c of ps[0].deck) { const i = h('i', 'gf-pzg__card'); i.append(rigIcon(atlas, c, 34, app.dpr)); deck.appendChild(i); }
    const row = sec.querySelector('.gf-pzg__row') as HTMLElement;
    ps.forEach((p, i) => {
      const rec = app.save.puzzles[p.id]; const stars = rec?.stars ?? 0;
      const b = h('button', 'gf-pz' + (open ? '' : ' is-locked') + (stars ? ' is-done' : ''));
      b.innerHTML = `<span class="gf-pz__no">${i + 1}</span><span class="gf-pz__lanes">${p.lanes.map(() => '<i></i>').join('')}</span>
        <span class="gf-pz__stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}">${icon('star')}</i>`).join('')}</span>
        <span class="gf-pz__grain">${open ? (rec?.bestSpent != null ? `最好 ${rec.bestSpent} 粮` : `${p.budget} 粮`) : icon('lock')}</span>`;
      b.addEventListener('click', () => { if (!open) { app.ui('ui-locked', 0.5); return; } app.ui('ui-confirm', 0.5); onPick(p); });
      row.appendChild(b);
    });
    groups.appendChild(sec);
  }
  el.querySelector('.gf-pzlist__back')!.addEventListener('click', () => { app.ui('ui-tap', 0.4); onBack(); });
  setTimeout(() => void app.voice.say('fort.pz.intro'), 400);
  bindPress(el);
  return { destroy: () => { app.voice.stop(); el.remove(); } };
}
