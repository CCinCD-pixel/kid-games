/**
 * Boot + router (spec §8.4): shell (start gate → #app[data-ready] as soon as the gate is painted),
 * save (read-only guard, legacy import), sounds, narration, the puzzle Worker, then
 * OPENING → PLAY(0-1) on the very first run, else the cargo map (or straight back into 0-1 while
 * the first level is not done yet). Routes: map, play (fixed levels, 跳级考试, 经典仓库, 镜子仓库
 * twins, 随机新仓库 orders; 侦探题 nodes open the quiz screen), hangar, opening.
 * `?level=<id>` (dev/test) opens a level directly; `?test=1` makes animations instant and exposes
 * window.__sok; `?bench=1` runs the device benchmark (spec §8.11).
 */
import { initShell, type LayoutInfo } from '@kit/shell';
import { setHubProgress } from '@kit/progress';
import { prefersReducedMotion } from '@kit/tween';
import { bindPress } from '@kit/ui';
import { loadSounds } from '../audio/sfx';
import { createVoice } from '../audio/voice';
import { markBroken } from './broken';
import { isQuiz, levelById, type LevelDef } from '../data';
import { PuzzleClient } from '../hints/hintClient';
import { MarkBuffer } from '../log';
import { HangarScreen } from '../screens/hangar';
import { MapScreen } from '../screens/map';
import { OpeningScreen } from '../screens/opening';
import { shouldAutoSkip } from '@kit/ui';
import { PlayScreen } from '../screens/play';
import { QuizScreen } from '../screens/quiz';
import { hubLine } from './collection';
import type { AppCtx, Route, Screen } from './context';
import { randomLevelDef } from './random';
import { openSave } from './save';
import { levelPassed } from './unlock';
import { loadVisit, storeVisit, visitClock } from './visit';
import { guardGateClickThrough } from './gateGuard';
import { installTestHooks } from '../dev';

export function boot(app: HTMLElement, params: URLSearchParams): void {
  const test = params.get('test') === '1';
  const save = openSave();
  let screen: Screen | null = null;
  let layoutInfo: LayoutInfo | null = null;
  let clock: ReturnType<typeof visitClock> | null = null;
  const touchVisit = (owned = !!screen?.ownsClock) => {
    clock ??= visitClock(ctx.visit);
    clock.tick(owned);
    storeVisit(ctx.visit);
  };
  const shell = initShell({
    game: 'sokoban',
    startGate: test ? false : { title: '星港搬运工', subtitle: '把补给箱推上发射台', buttonLabel: '开始' },
    onBeforeLeave: () => {
      screen?.persist?.();
      ctx.marks.flush();
      save.flush();
      touchVisit();
    },
    onPause: () => {
      screen?.pause?.();
      ctx.marks.flush();
      save.flush();
      touchVisit();
    },
    onResume: () => {
      clock?.reset();
      screen?.resume?.();
    },
    onLayout: (l) => {
      layoutInfo = l;
      screen?.layout(l);
    },
  });
  // the start gate is on screen now: the smoke test waits for this
  app.dataset.ready = '';
  if (save.readOnly) app.dataset.readonly = '';
  void loadSounds();
  bindPress(document);
  const voice = createVoice({ test });
  const ctx: AppCtx = {
    app,
    save,
    voice,
    shell,
    marks: new MarkBuffer(shell.session),
    client: new PuzzleClient(),
    test,
    slowmo: test || import.meta.env.DEV ? Math.max(1, Number(params.get('slowmo')) || 1) : 1,
    instant: test && params.get('anim') !== 'real',
    reduced: prefersReducedMotion(),
    layout: () => layoutInfo ?? shell.layout(),
    go,
    hub: () => {
      if (!save.readOnly) setHubProgress('sokoban', hubLine(save.data));
    },
    screen: () => screen,
    visit: loadVisit(),
    certRun: null,
    randomSlot: {},
  };

  /** A level by route: fixed ids / twins from the content, random orders from the route or the save. */
  function resolve(route: Extract<Route, { name: 'play' }>): LevelDef | undefined {
    if (route.def) return route.def;
    const fixed = levelById(route.id);
    if (fixed) return fixed;
    const left = save.data.inProgress;
    if (left?.rnd && left.id === route.id) return randomLevelDef(left.rnd);
    return undefined;
  }

  function go(route: Route): void {
    const owned = !!screen?.ownsClock;
    screen?.destroy();
    screen = null;
    app.dataset.screen = route.name;
    touchVisit(owned);
    if (route.name === 'opening') {
      // replayed from 机库 → 本领: back there afterwards
      if (route.replay) {
        const back = route.replay;
        screen = new OpeningScreen(ctx, () => go(back));
        return;
      }
      const seen = () => {
        if (save.readOnly) return;
        save.update((s) => {
          s.tutorialDone = true;
        });
      };
      // the parent switch 跳过开场和教学 (Dad's feedback 2026-10-08): as if 跳过 had been tapped
      if (shouldAutoSkip()) {
        seen();
        go({ name: 'play', id: '0-1' });
        return;
      }
      screen = new OpeningScreen(ctx, () => {
        seen();
        go({ name: 'play', id: '0-1' });
      });
      return;
    }
    if (route.name === 'map') {
      screen = new MapScreen(ctx, { tab: route.tab, opened: route.opened, focus: route.focus, say: route.say });
      return;
    }
    if (route.name === 'hangar') {
      screen = new HangarScreen(ctx, route.back);
      return;
    }
    const def = resolve(route);
    if (!def) {
      console.error(`[sokoban] unknown level ${route.id}`);
      go({ name: 'map' });
      return;
    }
    try {
      if (isQuiz(def)) {
        app.dataset.screen = 'quiz';
        screen = new QuizScreen(ctx, def);
      } else screen = new PlayScreen(ctx, def, { fresh: route.fresh, newChapter: route.newChapter, lesson: route.lesson });
    } catch (err) {
      // a broken level never reaches the child (validators); if it ever did: log and go back to the map
      console.error(`[sokoban] level ${route.id} failed to start`, err);
      ctx.marks.add('level-broken', { id: route.id });
      markBroken(route.id); // its node shows 维修中 from now on (spec §3.10)
      // a corrupted half-played record (e.g. a random order's stored warehouse) must not bounce again
      if (ctx.save.data.inProgress?.id === route.id && !ctx.save.readOnly) {
        ctx.save.update((s) => {
          s.inProgress = undefined;
        });
      }
      go({ name: 'map' });
    }
  }

  if (test || import.meta.env.DEV) installTestHooks(ctx);
  const first = (): Route => {
    const lv = params.get('level');
    if (lv && (import.meta.env.DEV || test) && levelById(lv)) return { name: 'play', id: lv, fresh: params.has('fresh') };
    if (params.get('screen') === 'map') return { name: 'map' };
    if (params.get('screen') === 'hangar' && (import.meta.env.DEV || test)) return { name: 'hangar' };
    if (!save.data.tutorialDone && !levelPassed(save.data, '0-1')) return { name: 'opening' };
    if (!levelPassed(save.data, '0-1')) return { name: 'play', id: '0-1' };
    return { name: 'map' };
  };
  // the gate tap must not click through to the first screen (QA r1 blocker; only when a gate was shown)
  const afterGate = () => {
    if (!test) guardGateClickThrough();
  };
  if (params.get('bench') === '1') {
    void shell.ready.then(() => {
      afterGate();
      return import('../dev/bench').then((m) => m.mountBench(app, ctx));
    });
    return;
  }
  void shell.ready.then(() => {
    afterGate();
    go(first());
  });
}
