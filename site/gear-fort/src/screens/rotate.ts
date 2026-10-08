// 把手机横过来玩 (Dad's feedback 2026-10-08: he tried the game on his phone). Five lanes side by side need the long
// side of the screen, so on a phone held upright — shorter side < 600 px, GAME_AUTHORING §3 — a full-screen card asks
// for the turn. It is pure CSS (styles.css, `.gf-rotate`): it goes away by itself the moment the phone is turned, and
// it is mounted before the start gate, so the child turns the phone first and then taps 开始. A battle running under
// it pauses (its pause layer is waiting when the phone comes back); iPads never see it.
import { portrait } from '../art/icons';

/** the phone-portrait query (the hub and the parent page use exactly this one) */
export const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 599px)';

export function installRotateGate(dpr: number, onShow: () => void): { showing(): boolean; destroy(): void } {
  const el = document.createElement('div'); el.className = 'gf-rotate xg-root'; el.dataset.xgTheme = 'night';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '把手机横过来玩');
  el.innerHTML = `<div class="gf-rotate__stage" aria-hidden="true">
      <span class="gf-rotate__mozi"></span>
      <span class="gf-rotate__phone"><i class="gf-rotate__screen"><b></b><b></b><b></b><b></b><b></b></i></span>
      <svg class="gf-rotate__arrow" viewBox="0 0 64 64"><path d="M14 40a20 20 0 0 1 32-24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M40 6l9 11-13 4z" fill="currentColor"/></svg>
    </div>
    <h2 class="gf-rotate__t">把手机横过来玩</h2>
    <p class="gf-rotate__s">沙盘要横着摆，五条路才看得清。</p>`;
  el.querySelector('.gf-rotate__mozi')!.append(portrait('mozi', 112, dpr, 'happy'));
  // swallow taps: nothing under the card (start gate, battle) may react while it is up
  for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart'] as const) el.addEventListener(t, (e) => { e.stopPropagation(); if (t !== 'touchstart') e.preventDefault(); });
  document.body.appendChild(el);
  const mq = matchMedia(PHONE_PORTRAIT);
  const on = (): void => { if (mq.matches) onShow(); };
  mq.addEventListener('change', on);
  return { showing: () => mq.matches, destroy: () => { mq.removeEventListener('change', on); el.remove(); } };
}
