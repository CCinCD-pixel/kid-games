// 设置 (spec §2.1, §9.9 S32): 音乐 · 震屏 · 数字模式 as big rows with a ✓ / ✕ switch (a shape, not only a colour).
// The battle speed is remembered automatically; parent items (旁白, names, PIN) live on the kit parent page.
import { icon, bindPress } from '@kit/ui';
import { setMusicEnabled, playTheme } from '../audio/music';
import type { AppCtx } from '../ctx';
import type { StoryId } from './story';

type Key = 'music' | 'shake' | 'numbers';
const ROWS: [Key, string, string, string][] = [
  ['music', 'music', '音乐', '地图和故事里的编钟曲'],
  ['shake', 'zoom-in', '震屏', '礌石落地、冲车撞门时画面抖一下'],
  ['numbers', 'grid', '数字模式', '图谱里多看一句数字'],
];
/** 故事和教学 (Dad, 2026-10-08: everything skippable stays replayable): the 1-1 lesson + every scene already met */
const SCENES: [StoryId, string][] = [['prologue', '序幕'], ['dock', '码头'], ['v1end', '卷一尾声'], ['v2open', '卷二开篇'], ['v2end', '卷二尾声']];
export function openSettings(app: AppCtx, onClose?: () => void, o: { replay?(what: StoryId | 'tut'): void } = {}): void {
  const s = app.save.settings;
  const seen = SCENES.filter(([id]) => app.save.story.includes(id));
  const scrim = document.createElement('div'); scrim.className = 'xg-scrim xg-root gf-set'; scrim.dataset.xgTheme = 'night';
  scrim.innerHTML = `<div class="xg-modal gf-set__panel" role="dialog" aria-modal="true" aria-label="设置"><div class="xg-ribbon">设置</div>
    <button class="xg-iconbtn xg-iconbtn--sm xg-modal__close" data-a="close" aria-label="关闭">${icon('close')}</button>
    ${ROWS.map(([k, ic, name, sub]) => `<button class="gf-set__row" data-k="${k}" role="switch" aria-checked="${!!s[k]}"><span class="gf-set__ic">${icon(ic as never)}</span><span class="gf-set__t"><b>${name}</b><small>${sub}</small></span><span class="gf-sw"><i>${icon('check')}</i><i>${icon('close')}</i></span></button>`).join('')}
    ${o.replay ? `<div class="gf-set__replay" role="group" aria-label="故事和教学"><span class="gf-set__ic">${icon('replay')}</span><span class="gf-set__t"><b>故事和教学</b><small>再看一遍</small></span>
      <span class="gf-set__chips"><button class="xg-btn xg-btn--secondary" data-r="tut">新手教学</button>${seen.map(([id, name]) => `<button class="xg-btn xg-btn--secondary" data-r="${id}">${name}</button>`).join('')}</span></div>` : ''}
    <p class="gf-set__note">旁白、名字和家长项在大厅的家长页。</p></div>`;
  document.body.appendChild(scrim); const unbind = bindPress(scrim);
  for (const b of scrim.querySelectorAll<HTMLElement>('.gf-set__row')) b.addEventListener('click', () => {
    const k = b.dataset.k as Key; const v = !s[k]; (s as Record<Key, boolean>)[k] = v; app.persist();
    b.setAttribute('aria-checked', String(v)); app.ui(v ? 'ui-toggle-on' : 'ui-tap', 0.5);
    if (k === 'music') { setMusicEnabled(v); if (v) playTheme('map'); }
  });
  const close = (): void => { app.ui('ui-tap', 0.4); scrim.classList.add('is-leaving'); setTimeout(() => { unbind(); scrim.remove(); onClose?.(); }, 220); };
  scrim.querySelector('[data-a=close]')!.addEventListener('click', close);
  for (const b of scrim.querySelectorAll<HTMLElement>('[data-r]')) b.addEventListener('click', () => {
    app.ui('ui-confirm', 0.5); unbind(); scrim.remove(); onClose?.(); app.mark('gf-replay', { what: b.dataset.r }); o.replay?.(b.dataset.r as StoryId | 'tut');
  });
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  app.mark('gf-settings', {});
}
