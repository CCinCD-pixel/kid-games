/**
 * App context + router (spec §8.3 routes). Screens draw into a design-unit stage (810×1080 or
 * 1080×810) that is scaled as a whole to the viewport; orientation changes re-layout the screen.
 * The kit 🏠 button is replaced by our own (same look): on 营地 it leaves for the hub, elsewhere it
 * goes back one level (saving first).
 */
import { initShell, type LayoutInfo, type Shell } from '@kit/shell';
import { bindPress } from '@kit/ui';
import { setHubProgress, type Store } from '@kit/progress';
import { loadSounds, play } from './audio/sound';
import { startAmbience, stopAmbience } from './audio/ambience';
import { normalizeSave, openStore, type SaveV1 } from './ctrl/save';
import { configureMotion } from './view/anim';
import { STAGE, fitStage, isPhone, phoneStage, type Orientation } from './view/layout';
import { installPieceDefs, setBigPieceText } from './view/pieces-svg';
import { RANK_NAMES } from './view/insignia';
import { Voice } from './voice';
import { makeScreen } from './router';

export interface Screen {
  readonly name: string;
  readonly el: HTMLElement;
  /** true when the screen has its own phone layouts (else phones get the iPad stage, letterboxed) */
  readonly phoneReady?: boolean;
  layout(o: Orientation, safeTop: number): void;
  /** 🏠 pressed: return true when handled (went back a level) */
  back?(): boolean;
  pause?(): void;
  resume?(): void;
  persist?(): void;
  destroy(): void;
}

export type Route =
  | { name: 'home'; skipFt?: boolean; ftPromos?: number[] }
  | { name: 'ft' }
  | { name: 'family' }
  | { name: 'deploy'; next: import('./screens/deploy').DeployNext }
  | { name: 'match'; resume?: boolean; setup?: import('./ctrl/save').SavedMatch; start?: import('./core/state').GameState }
  | { name: 'result'; data: import('./screens/result').ResultData }
  | { name: 'review'; data: import('./screens/result').ResultData; ply?: number }
  | { name: 'physical' }
  | { name: 'academy'; lesson?: string }
  | { name: 'item'; id: string; twin?: boolean; resume?: boolean }
  | { name: 'ladder'; mode?: import('./core/state').Mode; free?: boolean }
  | { name: 'endgames' }
  | { name: 'medals' }
  | { name: 'rules'; from?: 'home' | 'match'; card?: number }
  | { name: 'parent' }
  | { name: 'style' };

export interface App {
  root: HTMLElement;
  stage: HTMLElement;
  shell: Shell;
  store: Store<SaveV1>;
  save: SaveV1;
  persist(): void;
  voice: Voice;
  test: boolean;
  params: URLSearchParams;
  o: Orientation;
  safeTop: number;
  scale: number;
  /**
   * Phones (Dad, 2026-10-08; the shorter side < 600 CSS px): screens with `phoneReady` get a stage that
   * fills the screen — 390 units across in portrait, 390 tall in landscape (≈ 1 unit per CSS px on an
   * iPhone 13, 0.82 on an SE) — instead of the letterboxed iPad stage. `W × H` is the current stage.
   */
  phone: boolean;
  W: number;
  H: number;
  /** stage units hidden under the left / right safe areas (phone landscape notch) */
  safeL: number;
  safeR: number;
  /** stage units taken at the top by the kit 🏠 (and the 跳过 pill): keep the corners free above this */
  topBand: number;
  go(r: Route): void;
  screen(): Screen | null;
  play(name: string, o?: { volume?: number; rate?: number; step?: number }): void;
  mark(name: string, data?: Record<string, unknown>): void;
  hub(): void;
}

export function boot(root: HTMLElement): App {
  const params = new URLSearchParams(location.search);
  const test = params.get('test') === '1';
  configureMotion({ speed: test && params.get('fast') === '1' ? 0.1 : Number(params.get('slow') ?? 1) || 1 });
  const store = openStore();
  // the kit returns a same-version save untouched (migrate runs only for older versions): fill every
  // field a partial / earlier-build v1 save may lack (QA r1: family games lost the anti-shuttle limit)
  let save = normalizeSave(store.load());
  let screen: Screen | null = null;
  const stage = document.createElement('div');
  stage.className = 'mc-stage';
  root.appendChild(stage);
  const backBtn = document.createElement('a');
  let booted = false;

  const shell = initShell({
    game: 'military-chess',
    // ?test=1 skips the start gate; ?test=1&gate=1 keeps it (audio-unlock tests)
    startGate: test && params.get('gate') !== '1' ? false : { title: '陆战棋', subtitle: '摆好阵，扛军旗', buttonLabel: '开始' },
    back: false,
    onBeforeLeave: () => {
      screen?.persist?.();
      store.save(save);
    },
    onPause: () => {
      screen?.pause?.();
      stopAmbience();
      store.save(save);
    },
    onResume: () => {
      screen?.resume?.();
      music();
    },
    onLayout: (l) => {
      if (booted) applyLayout(l);
    },
  });

  const app: App = {
    root,
    stage,
    shell,
    store,
    get save() {
      return save;
    },
    set save(v: SaveV1) {
      save = v;
    },
    persist: () => {
      store.save(save);
    },
    voice: new Voice({ test, fast: test && params.get('fast') === '1' }),
    test,
    params,
    o: 'portrait',
    safeTop: 20,
    scale: 1,
    phone: false,
    W: STAGE.portrait.w,
    H: STAGE.portrait.h,
    safeL: 0,
    safeR: 0,
    topBand: 88,
    go,
    screen: () => screen,
    play,
    mark: (name, data) => shell.session?.mark(name, data),
    hub: () => {
      // spec §5.4: the hub card shows the child's rank (a place in the story, never a score)
      if (!save.firstRun.ft) setHubProgress('military-chess', { label: '摆好阵，扛军旗' });
      else setHubProgress('military-chess', { label: RANK_NAMES[save.rank] ?? '工兵', value: save.rank / 8 });
    },
  };

  function applyLayout(l: LayoutInfo): void {
    const o: Orientation = l.width >= l.height ? 'landscape' : 'portrait';
    const phone = isPhone(l.width, l.height) && !!screen?.phoneReady;
    let w: number, h: number, scale: number, ox = 0, oy = 0;
    if (phone) {
      const st = phoneStage(o, l.width, l.height);
      ({ w, h, scale } = st);
      // phones: the safe areas are real (notch / home bar); a Safari tab reports 0
      app.safeTop = Math.round(l.safe.top / scale);
      app.safeL = Math.round(l.safe.left / scale);
      app.safeR = Math.round(l.safe.right / scale);
    } else {
      const fit = fitStage(o, l.width, l.height);
      ({ w, h } = STAGE[o]);
      ({ scale, ox, oy } = fit);
      // iPad home-screen app: safe top ≈20 (spec §2.2); a browser tab reports 0 → keep the same 20 band
      app.safeTop = l.safe.top > 0 ? Math.round(l.safe.top / scale) : 20;
      app.safeL = app.safeR = 0;
    }
    app.o = o;
    app.phone = phone;
    setBigPieceText(phone);
    app.W = w;
    app.H = h;
    app.scale = scale;
    // the kit 🏠 is 56 CSS px at max(12, safe top): its band in stage units (+ 8 px air)
    app.topBand = Math.ceil((Math.max(12, l.safe.top) + 56 + 8) / scale);
    Object.assign(stage.style, { width: `${w}px`, height: `${h}px`, transform: `translate(${ox}px, ${oy}px) scale(${scale})` });
    stage.dataset.o = o;
    stage.dataset.phone = phone ? '1' : '';
    document.documentElement.dataset.mcO = o;
    document.documentElement.dataset.mcPhone = phone ? '1' : '';
    screen?.layout(o, app.safeTop);
  }

  /** the camp tune plays on the camp, the maps, the ladder and the results — never on a board (§7.2) */
  const MUSIC = new Set(['home', 'academy', 'ladder', 'endgames', 'result']);
  function music(): void {
    if (screen && MUSIC.has(screen.name) && save.settings.music) startAmbience(true);
    else stopAmbience();
  }

  function go(r: Route): void {
    screen?.persist?.();
    screen?.destroy();
    screen = null;
    app.voice.setTarget(null);
    stage.replaceChildren();
    root.dataset.screen = r.name;
    try {
      screen = makeScreen(app, r);
      stage.appendChild(screen.el);
      // the stage form depends on the screen (phone layouts or the iPad stage): lays the screen out too
      applyLayout(shell.layout());
    } catch (err) {
      // a resume that no longer rebuilds (corrupted storage / a future format change) must never leave a
      // blank stage: drop it, persist, and land on the camp (QA r3)
      console.error('[military-chess] screen failed', r.name, err);
      try { screen?.destroy(); } catch { /* already broken */ }
      stage.replaceChildren();
      if (r.name === 'match' && r.resume) save.resume = null;
      if (r.name === 'item' && r.resume) save.puzzleResume = null;
      app.persist();
      if (r.name === 'home') throw err;
      root.dataset.screen = 'home';
      screen = makeScreen(app, { name: 'home', skipFt: true });
      stage.appendChild(screen.el);
      applyLayout(shell.layout());
    }
    backBtn.style.display = r.name === 'style' ? 'none' : '';
    music();
  }

  // our own 🏠 (kit look: .kit-back, compact 56×56)
  backBtn.className = 'kit-back';
  backBtn.href = '/';
  backBtn.dataset.compact = '';
  backBtn.setAttribute('aria-label', '返回');
  backBtn.dataset.testid = 'back';
  backBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 2.6 11.3a1 1 0 0 0 1.3 1.5l.9-.8V20a1 1 0 0 0 1 1h4.2v-5.5h4V21h4.2a1 1 0 0 0 1-1v-8l.9.8a1 1 0 0 0 1.3-1.5z"/></svg><span class="kit-back__label">返回</span>';
  backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    play('ui-back');
    if (screen?.back?.()) return;
    void shell.leave('/');
  });
  document.body.appendChild(backBtn);

  installPieceDefs();
  bindPress(document);
  booted = true;
  applyLayout(shell.layout());
  void shell.ready.then(async () => {
    await loadSounds();
    music();
  });
  return app;
}
