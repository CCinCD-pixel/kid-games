/**
 * First-run cutscene (spec §2.6 "~2 s", review D3): 4 s, no words on screen. 星晶号 is moored at the
 * 星港 dock with its engine lamps dark; the navigator (companion head) peeks out over the hull and
 * waves while em.start.1 plays. A tap after 0.8 s skips it. Shown once, before the first 1-01 board.
 */
import { mount as mountCompanion } from '@kit/companion';
import type { AppCtx } from '../ctx';
import { shipSvg } from '../view/art/ship';
import { backdrop } from '../view/backdrop';
import { play as sfx } from '../audio';

const DOCK = `<svg class="em-cut__dock" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="emcutd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4790"/><stop offset="1" stop-color="#1a2160"/></linearGradient></defs>
  <path d="M0 22H400V90H0Z" fill="url(#emcutd)"/><path d="M0 22H400V32H0Z" fill="#5d6cc0"/>
  <path d="M0 22H400" stroke="#a9b5ff" stroke-width="3" opacity=".8"/>
  <g fill="#ffe08a">${[30, 110, 190, 270, 350].map((x, i) => `<circle class="em-cut__lamp" style="animation-delay:${i * 0.18}s" cx="${x}" cy="27" r="3.6"/>`).join('')}</g>
  <g stroke="#2a3478" stroke-width="3">${[70, 150, 230, 310].map((x) => `<path d="M${x} 34V90"/>`).join('')}</g>
</svg>`;

export function playCutscene(app: AppCtx): Promise<void> {
  return new Promise((done) => {
    const land = innerWidth > innerHeight;
    const el = document.createElement('div');
    el.className = 'em-cut';
    el.dataset.testid = 'em-cutscene';
    el.innerHTML = `<div class="em-bg">${backdrop('route', land)}</div>
      <div class="em-cut__pier">${DOCK}</div>
      <div class="em-cut__ship"><svg class="em-cut__tether" viewBox="-36 20 316 152" preserveAspectRatio="none" aria-hidden="true">
        <g stroke="#1d2654" stroke-width="7" stroke-linecap="round"><path d="M104 132V176M184 128V176"/></g>
        <g stroke="#ffe08a" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 6"><path d="M104 132V176M184 128V176"/></g>
        <g fill="#3a4790" stroke="#a9b5ff" stroke-width="2"><rect x="94" y="164" width="20" height="10" rx="3"/><rect x="174" y="164" width="20" height="10" rx="3"/></g></svg><div class="em-cut__bot"></div><div class="em-cut__hull">${shipSvg({ thrusters: '#5FB4FF' }, { flame: false, slots: false })}</div></div>`;
    document.body.append(el);
    const bot = mountCompanion(el.querySelector<HTMLElement>('.em-cut__bot')!, { size: '100%', variant: 'head' });
    const t0 = performance.now();
    let over = false;
    const timers: number[] = [];
    const finish = () => {
      if (over) return; over = true;
      timers.forEach((t) => window.clearTimeout(t));
      el.classList.add('is-leaving');
      window.setTimeout(() => { bot.destroy(); el.remove(); }, 420);
      done();
    };
    timers.push(window.setTimeout(() => { el.classList.add('is-peek'); sfx('em-select', { gain: 0.4 }); }, 900));
    timers.push(window.setTimeout(() => bot.setMood('happy'), 1500));
    timers.push(window.setTimeout(finish, 4000));
    el.addEventListener('pointerdown', () => { if (performance.now() - t0 > 800) finish(); });
    void app.voice.say('em.start.1');
  });
}
