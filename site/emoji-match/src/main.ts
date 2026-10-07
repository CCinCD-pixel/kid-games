/**
 * 星晶消消乐 — entry (spec §8.1). Shell (start gate, 🏠, guards, layout), save (legacy import,
 * read-only guard), audio + narration, then the router. `?dev=style` lazy-loads the style board,
 * `?dev=sound` the audition board, `?test=1` the test hook (separate chunks, absent otherwise).
 */
import { initShell, currentLayout, type Shell } from '@kit/shell';
import { createSubtitleBar } from '@kit/ui';
import { installPhraseWrap } from './view/phrase-wrap';
import { requestPersistence } from '@kit/progress';
import { App } from './app';
import type { AppCtx } from './ctx';
import { PLAYABLE_EPISODES } from './content';
import { initAudio, routeMusic, setSfxMuted } from './audio';
import { openSave } from './save';
import { updateHub } from './hub';
import { createVoice } from './voice';
import { backdrop } from './view/backdrop';
import { shipSvg } from './view/art/ship';
import { playCutscene } from './screens/cutscene';
import './styles.css';

const params = new URLSearchParams(location.search);
const root = document.getElementById('app')!;

/** started by boot.ts (dynamic import; the legacy page never loads this chunk or its CSS) */
export async function startGame(): Promise<void> {
  root.classList.add('em-app');
  if (params.get('dev') === 'style') {
    initShell({ game: 'emoji-match', startGate: false, log: false, serviceWorker: false, lockScroll: false });
    const { mountStyleBoard } = await import('./dev/style');
    await mountStyleBoard(root);
    root.dataset.ready = '';
    return;
  }
  if (params.get('dev') === 'sound') {
    // audition board (spec §7.5): the gate tap unlocks audio; nothing here is on the child's path
    const sh = initShell({ game: 'emoji-match', startGate: { title: '试听板', subtitle: '星晶消消乐的全部声音', buttonLabel: '开始' }, log: false, serviceWorker: false, lockScroll: false });
    root.dataset.gate = '';
    await sh.ready;
    const { mountSoundBoard } = await import('./dev/sound');
    await mountSoundBoard(root);
    root.dataset.ready = '';
    return;
  }
  const test = params.get('test') === '1';
  const save = openSave();
  const subBar = createSubtitleBar(document.body);
  installPhraseWrap(subBar.el);
  subBar.el.classList.add('em-subbar');
  // menu screens (route, map, hangar, level card) have no subtitle lane: there the bar floats at the
  // bottom and fades 2.6 s after the line ends; in a lane (play, intro card, arrival) it stays for 再听一遍
  let subHide = 0;
  const onCue: typeof subBar.onCue = (c) => {
    subBar.onCue(c);
    window.clearTimeout(subHide);
    if (!c && !subBar.el.classList.contains('is-docked')) subHide = window.setTimeout(() => { if (!subBar.el.classList.contains('is-docked')) subBar.hide(); }, 2600);
  };
  const voice = createVoice({ onCue, onWord: subBar.onWord, test });
  subBar.attach(voice.narrator);
  // start-gate illustration: our own layer under the kit gate (kit request #6)
  const art = document.createElement('div');
  art.className = 'em-gate-art';
  const land = innerWidth > innerHeight;
  art.innerHTML = `<div class="em-bg">${backdrop('ep1', land)}</div><div class="em-gate-ship">${shipSvg({ thrusters: '#5FB4FF' }, { slots: false })}</div>`;
  document.body.append(art);

  let app: App | null = null;
  let shell: Shell | null = null;
  const ctx: AppCtx = {
    root, save, voice, sub: subBar, shell: null,
    layout: () => shell?.layout() ?? currentLayout(),
    go: () => {},
    mark: (name, data) => { try { shell?.session?.mark(name, data); } catch { /* log full */ } },
    test, timeScale: 1, forceSeed: null, forceAssist: null,
    lessFx: () => save.data.settings.lessFx || matchMedia('(prefers-reduced-motion: reduce)').matches,
    dockSub: (lane) => {
      (lane ?? document.body).append(subBar.el); subBar.el.classList.toggle('is-docked', !!lane);
      if (!lane) subBar.hide(); // leaving a lane: no stale line floating over the next screen
    },
    play: null,
    playableEpisodes: PLAYABLE_EPISODES,
    playMs: 0,
    breakShown: false,
    lastPraise: null,
    music: (on) => routeMusic(on && save.data.settings.music !== false),
  };
  // the kit's 🏠 返回 pill is wider than the spec's 56 px corner: top bars start after its real right edge
  // (--em-home-r) and the play layout gets its real width, so nothing slides under it (V15 checks the true corner)
  const syncHome = () => {
    const r = document.querySelector('.kit-back')?.getBoundingClientRect();
    if (!r || !r.width) return;
    ctx.homeW = Math.ceil(r.width);
    root.style.setProperty('--em-home-r', `${Math.ceil(r.right)}px`);
  };
  setSfxMuted(save.data.settings.sound === false);
  shell = initShell({
    game: 'emoji-match',
    startGate: test ? false : { title: '星晶消消乐', subtitle: '收集星晶，开着星晶号去远航', buttonLabel: '开始' },
    onBeforeLeave: () => save.commit(),
    onPause: () => app?.pause(),
    onResume: () => app?.resume(),
    onLayout: () => { syncHome(); app?.resize(); },
  });
  ctx.shell = shell;
  syncHome();
  root.dataset.gate = ''; // the start gate is up (smoke marker; data-ready follows after the tap)
  if (test) { const { installTestHook } = await import('./dev/test-hook'); installTestHook(ctx, () => app); }
  await shell.ready;
  syncHome();
  art.classList.add('is-leaving');
  window.setTimeout(() => art.remove(), 600);
  void requestPersistence();
  if (!save.readOnly) updateHub(save.data);
  void initAudio();
  app = new App(ctx);
  // `?test=1&firstrun=1` drives the real first-run path under the test hook (QA r2: veteran toast)
  if (!save.data.firstRunDone && (!test || params.get('firstrun') === '1')) {
    // first open: 4 s dock cutscene (em.start.1), then straight into 1-01 (no route, no card, spec §2.6);
    // the masked lesson IS the swap intro. A first run closed half way resumes the same 1-01 board.
    // A veteran (legacy import) hears em.veteran on the 1-01 result card (play.ts showWin), not here:
    // the cutscene and the lesson own the narration until then.
    const resume = save.data.resume?.id === '1-01';
    if (!resume) await playCutscene(ctx);
    if (!save.data.intros.includes('swap')) { save.data.intros.push('swap'); save.commit(); }
    app.go({ s: 'play', id: '1-01', resume }, false);
  } else {
    app.go({ s: 'route' }, false);
    if (save.data.veteranToast) { void voice.say('em.veteran'); save.data.veteranToast = false; save.commit(); }
  }
  root.dataset.ready = '';
}
