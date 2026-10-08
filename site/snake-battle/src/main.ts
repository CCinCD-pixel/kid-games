/**
 * 贪吃蛇大作战 — entry (spec §8.1). Boots the shell (start gate, adopted #sb-back, guards, layout, SW),
 * the save, audio + narration, then the lobby. `#app[data-ready]` is set once the first layout is done
 * (before the gate is tapped) so the smoke test can wait for it.
 */
import { initShell } from '@kit/shell';
import { App } from './app';
import { loadSfx } from './audio';
import { gateSnake } from './gate-snake';
import './styles.css';
import './phone.css';

const params = new URLSearchParams(location.search);
const root = document.getElementById('app')!;
if (params.get('dev') === 'style') void import('./dev/style').then((m) => { m.styleBoard(root); root.dataset.ready = ''; });
// V14 sprite gate (tests/art.spec.ts): automation / dev server only
else if (params.get('dev') === 'art' && (navigator.webdriver || import.meta.env.DEV)) void import('./dev/art').then((m) => { (window as unknown as { __art: unknown }).__art = m.artMetrics(); root.dataset.ready = ''; });
else boot();

function boot() {
  const app = new App(root, params);

  const shell = initShell({
    game: 'snake-battle',
    startGate: params.has('nogate') ? false : { title: '贪吃蛇大作战', subtitle: '星际竞技场，出发！' },
    back: { adopt: '#sb-back' },
    onBeforeLeave: () => app.onLeave(),
    onPause: () => app.onBackground(),
    onLayout: (l) => app.layout(l),
  });
  app.shell = shell;
  // S0: the gold snake swims behind 开始 (spec §2.5)
  const gate = document.querySelector('.kit-start'); if (gate) { gate.classList.add('sb-gate'); gate.prepend(gateSnake()); }
  if (app.test) (window as unknown as { __sbApp: App }).__sbApp = app;
  app.layout(shell.layout());
  // first run (spec §2.6): the very first start goes straight into 1-1 (no lobby, no brief, no 3-2-1)
  const d = app.save.data;
  if (!d.firstRunDone && (d.life.timedPlayed > 0 || (d.missions.c1m3?.clears ?? 0) > 0)) { d.firstRunDone = true; app.save.save(); }
  const firstRun = params.has('firstrun') || (!d.firstRunDone && !params.has('test'));
  if (!firstRun) app.showLobby();
  root.dataset.ready = '';
  // the SFX bank loads on every path, the first run included (QA r3)
  void shell.ready.then(() => { void loadSfx(); if (firstRun) app.startFirstRun(); else void app.afterGate(); });
}
