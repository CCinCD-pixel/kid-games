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
import { STAGE, fitStage, type Orientation } from './view/layout';
import { installPieceDefs } from './view/pieces-svg';
import { RANK_NAMES } from './view/insignia';
import { Voice } from './voice';
import { makeScreen } from './router';

export interface Screen {
  readonly name: string;
  readonly el: HTMLElement;
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
    const fit = fitStage(o, l.width, l.height);
    const s = STAGE[o];
    app.o = o;
    app.scale = fit.scale;
    // iPad home-screen app: safe top ≈20 (spec §2.2); a browser tab reports 0 → keep the same 20 band
    app.safeTop = l.safe.top > 0 ? Math.round(l.safe.top / fit.scale) : 20;
    Object.assign(stage.style, { width: `${s.w}px`, height: `${s.h}px`, transform: `translate(${fit.ox}px, ${fit.oy}px) scale(${fit.scale})` });
    stage.dataset.o = o;
    document.documentElement.dataset.mcO = o;
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
    screen = makeScreen(app, r);
    stage.appendChild(screen.el);
    screen.layout(app.o, app.safeTop);
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
