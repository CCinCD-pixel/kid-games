/**
 * Shared parent-PIN dialog for in-game 家长角 / 家规 / "和爸爸下" settings (xiangqi, chess, mars-base …).
 * Built on the family PIN in kit/settings (the same one the parent page uses) — a soft gate against a curious
 * six-year-old, not security. It never locks anyone out: a wrong PIN just shakes and clears.
 *
 *   if (await askParentPin({ title: '家长角', text: '请输入家长 PIN' })) openParentCorner();
 *
 * Resolves `true` only when the right PIN was entered. Resolves `false` when cancelled (✕ / Esc) — and when no PIN
 * exists yet: then the dialog explains "请先在家长页设置 PIN" with a button to /parent/ (nothing is revealed).
 */
import { checkPin, hasPin } from '../settings';
import { bindPress, icon, mountKeypad, sound } from './xg';

export interface ParentPinOptions {
  title?: string;
  /** one line under the title (default 请输入家长 PIN) */
  text?: string;
  /** accent colour of the dialog, e.g. 'xiangqi' (sets data-xg-game on the scrim) */
  accentGame?: string;
}

export function askParentPin(o: ParentPinOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'xg-scrim xg-root xg-pin';
    if (o.accentGame) scrim.dataset.xgGame = o.accentGame;
    const noPin = !hasPin();
    scrim.innerHTML = `<div class="xg-modal xg-pin__card${noPin ? ' xg-pin__card--nopin' : ''}" role="dialog" aria-modal="true" aria-label="${o.title ?? '家长'}">
      <button class="xg-iconbtn xg-iconbtn--sm xg-modal__close" data-act="close" aria-label="关闭">${icon('close')}</button>
      <h2 class="xg-modal__title">${o.title ?? '家长'}</h2>
      <p class="xg-modal__text xg-pin__text" role="status">${noPin ? '还没有设置家长 PIN。请先在家长页设置。' : o.text ?? '请输入家长 PIN'}</p>
      <div class="xg-pin__body"></div>
      ${noPin ? `<div class="xg-modal__actions"><a class="xg-btn xg-btn--primary" href="/parent/" data-act="parent"><span>去家长页</span></a></div>` : ''}
    </div>`;
    document.body.appendChild(scrim);
    const unbind = bindPress(scrim);
    sound('ui-open');
    const text = scrim.querySelector<HTMLElement>('.xg-pin__text')!;
    const body = scrim.querySelector<HTMLElement>('.xg-pin__body')!;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      sound(ok ? 'ui-confirm' : 'ui-close');
      scrim.classList.add('is-leaving');
      window.setTimeout(() => { unbind(); scrim.remove(); }, 260);
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('click', (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') finish(false);
    });
    if (noPin) { body.remove(); return; }
    // short, wide screens (landscape phones): 4 × 3 keys beside the text keep the whole dialog on screen (CSS: kit.css .xg-pin)
    const short = window.matchMedia('(max-height: 560px) and (min-width: 560px)').matches;
    const kp = mountKeypad(body, {
      maxLength: 6, mask: true, placeholder: '····', layout: short ? '4x3' : '3x4', keySize: short ? { w: 60, h: 46 } : { w: 72, h: 64 },
      onChange: (v) => { if (v.length >= 4 && checkPin(v)) finish(true); },
      onSubmit: (v) => {
        if (checkPin(v)) { finish(true); return; }
        text.textContent = 'PIN 不对，再试一次';
        kp.clear();
        return false;
      },
    });
    (body.querySelector('.xg-display') as HTMLElement).classList.add('xg-pin__display');
  });
}
