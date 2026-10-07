// 设置 (spec §2.1, §9.9 S32): 音乐 · 震屏 · 数字模式 as big rows with a ✓ / ✕ switch (a shape, not only a colour).
// The battle speed is remembered automatically; parent items (旁白, names, PIN) live on the kit parent page.
import { icon, bindPress } from '@kit/ui';
import { setMusicEnabled, playTheme } from '../audio/music';
import type { AppCtx } from '../ctx';

type Key = 'music' | 'shake' | 'numbers';
const ROWS: [Key, string, string, string][] = [
  ['music', 'music', '音乐', '地图和故事里的编钟曲'],
  ['shake', 'zoom-in', '震屏', '礌石落地、冲车撞门时画面抖一下'],
  ['numbers', 'grid', '数字模式', '图谱里多看一句数字'],
];
export function openSettings(app: AppCtx, onClose?: () => void): void {
  const s = app.save.settings;
  const scrim = document.createElement('div'); scrim.className = 'xg-scrim xg-root gf-set'; scrim.dataset.xgTheme = 'night';
  scrim.innerHTML = `<div class="xg-modal gf-set__panel" role="dialog" aria-modal="true" aria-label="设置"><div class="xg-ribbon">设置</div>
    <button class="xg-iconbtn xg-iconbtn--sm xg-modal__close" data-a="close" aria-label="关闭">${icon('close')}</button>
    ${ROWS.map(([k, ic, name, sub]) => `<button class="gf-set__row" data-k="${k}" role="switch" aria-checked="${!!s[k]}"><span class="gf-set__ic">${icon(ic as never)}</span><span class="gf-set__t"><b>${name}</b><small>${sub}</small></span><span class="gf-sw"><i>${icon('check')}</i><i>${icon('close')}</i></span></button>`).join('')}
    <p class="gf-set__note">旁白、名字和家长项在大厅的家长页。</p></div>`;
  document.body.appendChild(scrim); const unbind = bindPress(scrim);
  for (const b of scrim.querySelectorAll<HTMLElement>('.gf-set__row')) b.addEventListener('click', () => {
    const k = b.dataset.k as Key; const v = !s[k]; (s as Record<Key, boolean>)[k] = v; app.persist();
    b.setAttribute('aria-checked', String(v)); app.ui(v ? 'ui-toggle-on' : 'ui-tap', 0.5);
    if (k === 'music') { setMusicEnabled(v); if (v) playTheme('map'); }
  });
  const close = (): void => { app.ui('ui-tap', 0.4); scrim.classList.add('is-leaving'); setTimeout(() => { unbind(); scrim.remove(); onClose?.(); }, 220); };
  scrim.querySelector('[data-a=close]')!.addEventListener('click', close);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  app.mark('gf-settings', {});
}
