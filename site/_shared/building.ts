/**
 * The 建造中 screen every registered-but-unbuilt game shows until its game agent replaces
 * site/<id>/src/main.ts. Reads title/subtitle/emblem from the registry, so a placeholder page is
 * three lines:
 *
 *   import { mountBuildingScreen } from '../../_shared/building';
 *   mountBuildingScreen('mars-base');
 *
 * Sets #app[data-ready] when painted (the smoke test waits for it).
 */
import registry from 'virtual:kg-registry';
import { sfx } from '@kit/audio';
import { mount, sayLine } from '@kit/companion';
import { Narrator } from '@kit/narration';
import { initShell } from '@kit/shell';
import { bindPress, h, icon } from '@kit/ui';
import './building.css';

export function mountBuildingScreen(id: string): void {
  const g = registry.find((e) => e.id === id);
  if (g?.theme) document.body.dataset.xgGame = g.theme;
  document.body.dataset.xgTheme = 'night';
  const shell = initShell({ game: id, startGate: false, log: false });
  const app = document.getElementById('app') ?? document.body.appendChild(h('div', { id: 'app' }));

  const home = h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg', type: 'button' });
  home.innerHTML = `${icon('home')}<span>回星港</span>`;
  home.addEventListener('click', () => void shell.leave('/'));
  const emblem = h('div', { class: 'bld__emblem' }, g?.icon.startsWith('/') ? h('img', { src: g.icon, alt: '' }) : null);
  const card = h('section', { class: 'bld__card', 'aria-label': `${g?.title ?? id} 建造中` },
    emblem,
    h('h1', { class: 'bld__title' }, g?.title ?? id),
    g ? h('p', { class: 'bld__sub' }, g.subtitle) : null,
    h('div', { class: 'bld__tape', 'aria-hidden': 'true' }, h('span', null, '建造中')),
    h('p', { class: 'bld__note' }, '工程师们正在建造这里，很快就能来玩啦。'),
    home,
  );
  const botHost = h('div', { class: 'bld__bot' });
  app.append(h('main', { class: 'bld' }, h('div', { class: 'bld__stage' }, card, botHost)));
  bindPress(document);

  const portrait = innerHeight > innerWidth;
  const bot = mount(botHost, { size: portrait ? 120 : 140, mood: 'thinking', bubble: portrait ? 'left' : 'top', bubbleMax: portrait ? 420 : 230, sfx: (n) => sfx.play(n) });
  const narrator = new Narrator({ manifestUrl: '/audio/hub/audio-manifest.json' });
  void narrator.ready().then(() => bot.say(narrator.text('hub.building') ?? '这里还在建造中。', { hold: 0, mood: 'encouraging' }));
  bot.el.addEventListener('click', () => {
    bot.react('hop');
    void sayLine(bot, narrator, 'hub.building', { interrupt: true, hold: 0, mood: 'encouraging' });
  });
  app.dataset.ready = '';
}
