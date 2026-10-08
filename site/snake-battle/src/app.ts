/**
 * App router + match driver (spec §8.8). Screens are DOM sections inside #app; the browser history is
 * never touched. LOBBY → MATCH(timed|endless) → PODIUM / ENDLESS_RESULT → LOBBY (never automatic).
 * The match loop: read input → step the sim (fixed 60 Hz, ≤3 steps/frame) → build sprites → HUD.
 * Quality tiers (Q2 1.5 / Q1 1.25 / Q0 1.0 render scale) adapt to frame time and only change pixels.
 */
import { h, createSubtitleBar, toast, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import { getSettings } from '@kit/settings';
import { randomSeed } from '@kit/rng';
import { setHubProgress } from '@kit/progress';
import type { Shell, LayoutInfo } from '@kit/shell';
import { Match, type MatchEvent } from './match';
import type { Renderer } from './render/gl';
import { WorldView } from './render/view';
import { menuMusic } from './menu-music';
import { Hud } from './hud';
import { TouchRouter } from './input/touch-router';
import { SaveCtl, today } from './save';
import { Voice, play, playAt, SND, eatSound, MatchPad, BoostLoop, lineText, loadSfx } from './audio';
import { renderLobby, pausePanel, settingsPanel, deathCard, deathCause, podium, panel, btn } from './screens';
import { missionMap, storyCard, briefCard, missionResult, unlockCard, collectionScreen, recordsScreen } from './screens2';
import { MISSIONS, MISSION_BY_ID, twinOf, type Mission } from './sim/mission';
import { allItems } from './collection';
import { hasClip } from './mini-replay';
import demos from '../../../content/snake-battle/demos.json';
import { VENUES, VENUE_IDS, TROPHIES, displayName, type VenueId } from './sim/venues';
import { skinById, hex2rgb, aiBodyColor } from './render/art';
import { PHYS, turnRateOf, angDiff, type KillTag } from './sim/core';

/** S9 praise that fits what the level asked for (QA r3/r4): one pool per objective type, rotating, never the same line
 * as the previous S9 (the last id is kept in the save); a 1★ clear gets a 'you used what you learned' line instead
 * of praise for the very skill he struggled with */
/** the 教一招 tip for a death: the cut tips name the 猎手, so a cut by any other persona gets the persona-neutral
 * "look ahead, go round the body" tip (QA r5: '这条是 贪吃' next to '看到猎手，往它身后拐') */
function tipFor(tag: string, killer: { persona?: string; missionPersona?: string } | null | undefined, n: number): string {
  if (tag === 'cut' && (killer?.missionPersona ?? killer?.persona) !== 'hunter') return 'snake.tip.body.1';
  return `snake.tip.${tag}.${n}`;
}
function praiseFor(ms: Mission, stars: number, n: number, last?: string) {
  const o = ms.objective, tags = [o.tag, ...(o.tags ?? [])].filter(Boolean) as string[];
  let pool: string[];
  if (ms.ai.some((a) => a.king || a.crown) || (ms.ch === 5 && stars >= 2)) pool = ['c5.1', 'c5.2'];
  else if (stars <= 1) pool = ['c2.1', 'c1.2'];   // QA r5: c5.1 学过的招都用上了 is for the boss / chapter 5 only
  else if (o.type === 'rings') pool = ['c1.1', 'c1.2', 'c2.1'];
  else if (o.type === 'loop' || tags.includes('encircle')) pool = ['c4.1', 'c4.2'];
  else if (o.type === 'kill' || o.type === 'streak' || (o.type as string) === 'clear') pool = ['c3.1', 'c3.2'];
  else if (o.type === 'survive') pool = ['c2.1', 'c2.2', 'c1.1'];
  else if (o.type === 'race') pool = ['c5.2', 'c2.1', 'c5.1'];
  else if (o.type === 'pu') pool = ['c2.1', 'c1.2'];
  else pool = ['c2.2', 'c1.2', 'c2.1'];   // eat / length: found the open stardust, looked ahead
  const ids = pool.map((p) => `snake.praise.${p}`);
  for (let k = 0; k < ids.length; k++) { const id = ids[(n + k) % ids.length]; if (id !== last) return id; }
  return ids[0];
}
const GHOST_SVG = '<svg viewBox="0 0 64 64"><path d="M26 30V12a5 5 0 0 1 10 0v16l12 3c4 1 6 4 5 8l-3 13c-1 4-4 6-8 6H31c-3 0-5-1-7-4l-9-12c-2-3 0-6 3-6 2 0 4 1 5 3z" fill="#fff" stroke="#2b3a8a" stroke-width="3" stroke-linejoin="round"/></svg>';
/** the first-run levels: 1-1 → 1-3 with no lobby in between (spec §2.6) */
const FIRST_RUN = ['c1m1', 'c1m2', 'c1m3'];
const LEN_WORD: Record<number, string> = { 100: '一百', 200: '两百', 300: '三百', 500: '五百', 800: '八百', 1000: '一千', 1500: '一千五', 2000: '两千' };
const MULTI: Record<number, string> = { 2: 'double', 3: 'triple', 4: 'quad', 5: 'penta' };
const MULTI_TXT: Record<number, string> = { 2: '两连击！', 3: '三连击！', 4: '四连击！', 5: '五连击！' };

export class App {
  save = new SaveCtl();
  voice: Voice;
  sub: ReturnType<typeof createSubtitleBar>;
  venue: VenueId = 'moon';
  private lobby: ReturnType<typeof renderLobby> | null = null;
  match: Match | null = null; view: WorldView | null = null; hud: Hud | null = null; router: TouchRouter | null = null;
  private canvas: HTMLCanvasElement | null = null; private raf = 0; private last = 0;
  private pad = new MatchPad(); private boostLoop: BoostLoop | null = null;
  private card: HTMLElement | null = null; private pausePanel: HTMLElement | null = null;
  private matchVoice = { near: 0 };
  private frameTimes: number[] = []; private qT = 0; private slowStreak = 0; private upgraded = false;
  private orientation = '';
  readonly test: boolean;
  /** ?test=1: per-frame main-thread work (ms) for perf probes */
  workLog: number[] = [];
  /** parent metrics / on-device frame-time monitoring (spec §8.12): per-match 2 s p90 windows + death causes */
  private perf = App.perf0();
  private static perf0() { return { p90s: [] as number[], causes: [] as string[], t0: 0, offscreen: 0, hist: new Uint32Array(201), max: 0, qChanges: 0, perfPauses: 0, slow: 0 }; }
  /** camera history (≈1.5 s) for the offscreenDeaths metric (spec §8.12 / V2) */
  private camRing: { t: number; x: number; y: number; z: number }[] = [];
  private orbit = { t: 0, hold: 0, turn: 0, lastA: 0, straight: 0 };
  /** spec §8.12 `perf`: frame work p50 / p95 / max (0.25 ms histogram), quality-tier changes, perf-pause count */
  private markEnd(kind: 'perf', extra: Record<string, unknown> = {}) {
    const P = this.perf, n = P.hist.reduce((a, b) => a + b, 0);
    const pct = (q: number) => { let acc = 0; for (let i = 0; i < P.hist.length; i++) { acc += P.hist[i]; if (acc >= n * q) return i * 0.25; } return 50; };
    const a = [...P.p90s].sort((x, y) => x - y);
    this.shell?.session?.mark(kind, { p50: n ? pct(0.5) : 0, p95: n ? pct(0.95) : 0, max: Math.round(P.max * 10) / 10, qChanges: P.qChanges, perfPauses: P.perfPauses, q: this.view?.R.quality ?? -1, p90max: Math.round(a[a.length - 1] ?? 0), windows: a.length, ...extra });
  }
  shell: Shell | null = null;

  constructor(private root: HTMLElement, params: URLSearchParams) {
    // test hooks only under automation (or the dev server): the production bundle never exposes them to a player (spec §8.13)
    this.test = params.has('test') && (navigator.webdriver === true || import.meta.env.DEV);
    this.sub = createSubtitleBar(document.body);
    // subtitles fade 2.5 s after the voice queue drains (the kit bar keeps the last line by design)
    const onCue = this.sub.onCue; let hideT = 0;
    this.sub.onCue = (c) => { clearTimeout(hideT); if (c && this.voice?.inMatch && this.voice.currentPrio === 2) return; onCue(c); if (!c) hideT = window.setTimeout(() => { this.sub.el.hidden = true; }, 2500); };
    this.voice = new Voice({ onCue: this.sub.onCue, onWord: this.sub.onWord, test: this.test && params.has('silentvoice') });
    this.sub.attach(this.voice.narrator);
    const last = VENUE_IDS.filter((v) => this.save.venueOpen(v));
    this.venue = last[last.length - 1] ?? 'moon';
    if (params.get('venue') && VENUE_IDS.includes(params.get('venue') as VenueId)) this.venue = params.get('venue') as VenueId;
  }

  async afterGate() {
    await loadSfx();
    if (!this.match) void this.say('snake.lobby.hello.' + (1 + (new Date().getDate() % 3)));
  }

  private say(id: string, o: { interrupt?: boolean; vars?: Record<string, string | number> } = {}) { return this.voice.say(id, o).catch(() => 'skipped'); }
  /** voice with a lifetime cap per group (spec §7.5): after `cap` plays only the sound + banner remain */
  private sayCapped(group: string, id: string, cap = 3, o: { vars?: Record<string, string | number>; interrupt?: boolean } = {}) {
    if (this.save.voiceCount(group) >= cap) return;
    this.save.voiceBump(group); void this.say(id, o);
  }

  layout(l: LayoutInfo) {
    const s = document.documentElement.style;
    s.setProperty('--sb-st', `${l.safe.top}px`); s.setProperty('--sb-sb', `${l.safe.bottom}px`); s.setProperty('--sb-sl', `${l.safe.left}px`); s.setProperty('--sb-sr', `${l.safe.right}px`);
    s.setProperty('--sb-H', `${l.height - l.safe.top - l.safe.bottom}px`);
    if (this.view) { this.view.resize(l.width, l.height, this.renderScale()); this.wakeLoop(); }   // a sleeping loop redraws the resized canvas
    if (this.orientation && this.orientation !== l.orientation && this.match && this.match.state !== 'over') {
      // rotation: pause → relayout → automatic 3-2-1 after 300 ms (spec §3.18)
      const m = this.match;
      if (m.state !== 'paused' && m.state !== 'dying' && m.state !== 'dead') { m.pause(); setTimeout(() => { if (this.match === m && m.state === 'paused' && !this.pausePanel) m.resume(true); }, 300); }
    }
    this.orientation = l.orientation;
  }
  private renderScale() { const q = this.view?.R.quality ?? 2; return Math.min(devicePixelRatio || 1, q === 2 ? 1.5 : q === 1 ? 1.25 : 1); }

  // ---------------------------------------------------------------- lobby
  showLobby() {
    this.tutorial = false;
    menuMusic(true);
    this.teardownMatch();
    document.body.classList.remove('sb-playing');
    document.getElementById('sb-back')?.removeAttribute('hidden');
    this.root.querySelector('.sb-lobby')?.remove();
    this.closeMenus();
    const name = displayName(getSettings().displayName);
    this.lobby = renderLobby(this.root, this.save, this.venue, name, {
      onPlay: (mode, v) => { this.venue = v; void this.startMatch(mode, v); },
      onVenue: (v, locked) => {
        if (locked) { void this.say(`snake.venue.locked.${v}`).then(() => this.say('snake.venue.locked.or')); return; }
        this.venue = v;
        const d = today();
        if (this.save.data.venueIntroDay[v] !== d) { this.save.data.venueIntroDay[v] = d; this.save.save(); void this.say(`snake.venue.${v}`, { interrupt: true }); }
      },
      onSettings: () => { settingsPanel(this.root, this.save, () => {}, { onTutorial: () => this.startFirstRun(true) }); },
      onSoon: () => toast('下一个版本开放，敬请期待！'),
      onMissions: () => this.showMap(),
      onCollection: () => this.showCollection(),
      onRecords: () => this.showRecords(),
    });
    this.drainCards();
    // spec §2.4: the last 3 timed matches here were all podiums and the next venue is open → a breathing ring on it +
    // snake.lobby.suggest (once a day per venue; never forced)
    const vi = VENUE_IDS.indexOf(this.venue), nv = VENUE_IDS[vi + 1], rr = this.save.data.venues[this.venue].recentRanks;
    if (nv && this.save.venueOpen(nv) && rr.length >= 3 && rr.slice(-3).every((x) => x <= 3)) {
      this.root.querySelector(`.sb-venue[data-v="${nv}"]`)?.classList.add('is-suggest');
      if (!this.save.seen(`suggest:${nv}:${today()}`)) { this.save.markSeen(`suggest:${nv}:${today()}`); void this.say('snake.lobby.suggest'); }
    }
    const sr = this.save.data.session;
    if (sr.matchesInRow >= 3 && !this.save.seen(`rest:${today()}`)) { this.save.markSeen(`rest:${today()}`); void this.say('snake.lobby.rest'); }
    setHubProgress('snake-battle', { label: `${VENUES[this.venue].name}` });
  }

  // ---------------------------------------------------------------- match
  async startMatch(mode: 'timed' | 'endless' | 'mission', venue: VenueId, opts: { seed?: number; countdown?: boolean; stress?: number; mission?: string; twin?: number; demo?: boolean; clip?: boolean; waitTouch?: boolean; floor?: string } = {}) {
    this.lobby?.dispose(); this.lobby = null;
    this.closeMenus();
    this.teardownMatch();
    void loadSfx();   // idempotent; covers every entry path (QA r3)
    document.querySelectorAll('.xg-confetti').forEach((n) => n.remove());   // last result's confetti never falls into the next countdown
    menuMusic(false); this.voice.inMatch = true;
    document.body.classList.add('sb-playing');
    document.getElementById('sb-back')?.setAttribute('hidden', '');
    const s = this.save.data, settings = getSettings();
    const seed = opts.seed ?? randomSeed();
    const skin = s.equipped.skin;
    const avoid = skin === 'venus' ? ['黄', '橙'] : [];
    if (!opts.twin) this.twinLine = null;
    let mdef: Mission | undefined = opts.mission ? MISSION_BY_ID[opts.mission] : undefined;
    if (mdef && opts.twin) for (let k = 0; k < Math.min(3, opts.twin); k++) mdef = twinOf(mdef);
    const demoRec = opts.demo && opts.mission ? (demos as unknown as { demos: Record<string, { seed: number; keyT: number | null }> }).demos[opts.mission] : undefined;
    const demoSeed = demoRec?.seed;
    const m = new Match({ mode, venue, seed: demoSeed ?? seed, heat: mode === 'timed' ? s.venues[venue].heat : 0, name: opts.demo ? '领航员' : displayName(settings.displayName), skin, avoidColors: avoid, stress: opts.stress, countdown: opts.countdown,
      mission: mdef, twin: false, demo: opts.demo ? { tier: 'EXPERT', persona: 'expert' } : undefined, waitTouch: opts.waitTouch });
    if (mdef?.isTwin) (m as Match & { twinLevel?: number }).twinLevel = opts.twin;
    if (this.test && opts.floor) (m as { floor: string }).floor = opts.floor;   // ?test=1 only: V14 read-back on the 土星 floor (QA r5)
    // guard against engine drift (V15 checks Node + WebKit; another engine could still differ): the H3 demo ends
    // quietly once it overruns the recorded finish by 6 s
    const demoT = (demoRec as { t?: number } | undefined)?.t;
    this.demoKey = { t: demoRec?.keyT ?? null, done: false, end: null, limit: opts.demo && demoT ? demoT + 6 : null };
    this.preroll = 0; this.glCanvas?.style.removeProperty('opacity');
    if (opts.demo && m.run) {
      m.state = 'playing';
      // H2 看一招: the clip = 4 s before the key moment to 2 s after (spec §5.1); skip ahead headlessly
      // pre-rolled in ≈200-step chunks per frame behind a hidden canvas, not in one synchronous block (QA r4: up to
      // 1 s of frozen UI on the A13 proxy for 3-7)
      if (opts.clip && demoRec?.keyT != null) {
        this.preroll = Math.max(0, Math.round((demoRec.keyT - 4) * 60));
        this.demoKey.end = demoRec.keyT + 2;
      }
    }
    this.perf = App.perf0(); this.perf.t0 = performance.now(); this.camRing = []; this.orbit = { t: 0, hold: 0, turn: 0, lastA: 0, straight: 0 };
    // adaptive quality is per match (spec §8.6): fresh windows, one upgrade allowed again (QA r3)
    this.frameTimes = []; this.qT = 0; this.slowStreak = 0; this.upgraded = false; this.sleepT = 0;
    this.match = m; this.matchVoice = { near: 0 }; this.missionVoice = { headon: false, windup: false }; this.hintState = { idle: 0, noProg: 0, lastProg: '', h0: 0, pointShown: false, touchSeen: 0 };
    this.tips = { idle: 0, idleDone: false, touchSeen: 0, big: false, firstEat: false };
    if (!this.glCanvas || this.glR?.lost) { this.glCanvas = h('canvas', { id: 'sb-world', class: 'sb-world' }) as HTMLCanvasElement; this.glR = null; }
    this.canvas = this.glCanvas;
    this.root.append(this.canvas);
    let view: WorldView;
    const sd = this.save.data, wearCrown = m.run?.m.id === 'c5m8' || (sd.owned.includes('crown') && sd.settings.crown);
    try { view = new WorldView(this.canvas, m, { trail: sd.equipped.trail, crown: wearCrown, renderer: this.glR ?? undefined }); this.glR = view.R; }
    catch (e) { console.error('[snake-battle] view init failed', e); toast('画面准备失败，请重新打开'); this.showLobby(); return; }
    this.view = view;
    view.onRipple = () => play('hit-soft', { volume: 0.5 });
    // WebGL context loss (spec §8.6/0A.3): pause; if the context is not back within 5 s, a friendly reload card
    // replaces the pause panel (counters are already committed incrementally, §8.9)
    let lostT = 0;
    view.R.onLost = () => {
      m.pause(); this.showPause(); clearTimeout(lostT);
      lostT = window.setTimeout(() => {
        if (this.match !== m) return;
        this.pausePanel?.remove(); this.pausePanel = null;
        this.save.save();
        const card = panel(this.root, 'sb-ctxlost', h('h2', { class: 'sb-panel__title' }, '画面要重新准备一下'), h('p', { class: 'sb-panel__text' }, '你的纪录都保存好了。'),
          btn('重新载入', 'xg-btn--primary xg-btn--lg', () => location.reload(), 'ui-confirm'));
        this.pausePanel = card;
      }, 5000);
    };
    view.R.onRestored = () => { clearTimeout(lostT); view.R.setAtlas(view.atlas); this.wakeLoop(); if (this.pausePanel?.classList.contains('sb-ctxlost')) { this.pausePanel.remove(); this.pausePanel = null; this.showPause(); } };
    const L = this.shell?.layout();
    view.resize(L?.width ?? innerWidth, L?.height ?? innerHeight, this.renderScale());
    view.zoom *= view.screenK;   // a phone starts at its own camera distance (no zoom-out at the start)
    const hud = new Hud(this.root, m, view, this.save.boostSide()); this.hud = hud;
    hud.showNames = s.settings.showNames;
    this.router = new TouchRouter({
      surface: this.root, boostEl: hud.boost, pauseEl: hud.pause, stickEl: hud.stick,
      headScreen: () => (m.me.alive ? view.worldToScreen(m.me.x, m.me.y) : null),
      mode: () => this.save.data.settings.control, doubleTapBoost: () => this.save.data.settings.doubleTapBoost,
      onPause: () => this.showPause(), onBoostLocked: () => play('ui-locked', { volume: 0.5 }), canBoost: () => m.me.mass >= 20,
    });
    m.onEvent = (e) => { if (this.match === m) this.onMatchEvent(e); };
    if (m.run) {
      hud.root.classList.toggle('is-demo', m.demo);
      if (!m.demo) this.save.startMission(m.run.m.id);
      this.shell?.session?.mark('mission-start', { id: m.run.m.id, seed: m.seed, twin: !!opts.twin, demo: !!opts.demo, attempt: (this.save.data.missions[m.run.m.id]?.attempts ?? 0) + 1 });
      if (m.demo) this.demoOverlay(m, !!opts.clip);
      else if (opts.waitTouch) this.ghostHand(m);
      if (!m.demo && this.firstRun && FIRST_RUN.includes(m.run.m.id)) this.firstRunSkip();
      if (!m.demo) this.missionIntroVoice(m);
    } else {
      this.save.startMatch(mode as 'timed' | 'endless', venue);
      this.shell?.session?.mark('match-start', { mode, venue, seed, heat: s.venues[venue].heat, skin });
    }
    if (s.settings.matchMusic) this.pad.start(m.floor === 'jupiter' || m.floor === 'blackhole' ? 'deep' : 'calm');
    this.boostLoop ??= new BoostLoop();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    if (this.test) (window as unknown as { __sb: unknown }).__sb = { app: this, match: m, view, hud };
  }

  private loop = (now: number) => { this.raf = requestAnimationFrame(this.loop); this.frame(now); };
  private sleepT = 0;
  /** H2 clip: sim steps still to pre-roll before the clip shows */
  private preroll = 0;
  /** restart a sleeping match loop (resume, relayout under a panel, context restored) */
  wakeLoop() { if (this.raf || !this.match) return; this.last = performance.now(); this.sleepT = 0; this.raf = requestAnimationFrame(this.loop); }

  private frame(now: number) {
    const m = this.match, v = this.view, hud = this.hud, r = this.router; if (!m || !v || !hud || !r) return;
    if (this.preroll > 0) {
      for (let i = 0; i < 200 && this.preroll > 0 && m.run && !m.run.done; i++, this.preroll--) { m.run.step(); m.world.drainEvents(() => {}); }
      if (!m.run || m.run.done) this.preroll = 0;
      if (this.preroll <= 0) { this.preroll = 0; this.canvas?.style.removeProperty('opacity'); v.camX = m.me.x; v.camY = m.me.y; v.camVX = 0; v.camVY = 0; (m as unknown as { snapPrev(): void }).snapPrev(); }
      else { if (this.canvas) this.canvas.style.opacity = '0'; this.last = now; return; }
      this.last = now;
    }
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const t0 = performance.now();
    r.tick();
    if (this.match !== m) return;
    m.input.target = this.antiOrbit(m, v, r.target, dt); m.input.boost = r.boost;
    if (m.waitTouch && r.target !== null) { this.root.querySelector('.sb-ghost:not(.is-once)')?.remove(); this.root.querySelector('.sb-ghost-line')?.remove(); }
    if (m.run && !m.demo) this.hintTick(m, dt);
    if (!m.demo) this.tipsTick(m, v, r, dt);
    if (m.demo) { this.demoTick(m); if (this.match !== m) return; }   // an H2 clip can end (and tear down) here
    m.update(dt);
    if (this.match !== m) return;
    this.boostLoop?.set(m.state === 'playing' && m.me.alive && m.me.boost && !m.demo);
    this.camRing.push({ t: m.world.t, x: v.camX, y: v.camY, z: v.zoom }); if (this.camRing.length > 90) this.camRing.shift();
    v.focus = m.state === 'dying' && m.lastDeath ? { x: m.lastDeath.x, y: m.lastDeath.y, killer: m.lastDeath.killer?.id ?? -1, t0: v.focus?.t0 ?? v.time } : (m.state === 'dying' ? v.focus : null);
    v.frame(dt);
    hud.update(dt);
    const work = performance.now() - t0;
    if (this.test) { this.workLog.push(work); if (this.workLog.length > 4000) this.workLog.shift(); }
    if (m.state === 'playing') { this.perf.hist[Math.min(200, Math.floor(work * 4))]++; if (work > this.perf.max) this.perf.max = work; }
    this.adaptQuality(work, dt);
    // battery (GAME_AUTHORING §7, QA r3): under the pause panel or after the match is over, the last frame stays
    // on screen and the rAF sleeps (menus already sleep); wakeLoop() restarts it
    if ((m.state === 'paused' && this.pausePanel) || m.state === 'over') {
      this.sleepT += dt;
      if (this.sleepT > (m.state === 'over' ? 2.5 : 0.35)) { cancelAnimationFrame(this.raf); this.raf = 0; }
    } else this.sleepT = 0;
  }

  /** follow-finger 'orbit trap' (QA r2): a finger held on a point inside his turning circle makes the snake circle
   * it forever. After 1 s inside that circle the heading is held for 0.45 s (≈ one turning diameter), so he swims
   * out and comes round to the point on a reachable arc. Input shaping only: the sim rules are unchanged. */
  private antiOrbit(m: Match, v: WorldView, target: number | null, dt: number) {
    const o = this.orbit, me = m.me, f = this.router?.finger() ?? null;
    if (target === null || f === null || !me.alive || m.demo || m.state !== 'playing') { o.t = 0; o.hold = 0; o.turn = 0; o.lastA = me.angle; return target; }
    // heading change over a leaky ≈2.5 s window (steady max-rate circling crosses 2π after ≈1.5 turns)
    o.turn = o.turn * Math.exp(-dt / 2.5) + angDiff(o.lastA, me.angle); o.lastA = me.angle;
    if (o.hold > 0) { o.hold -= dt; return me.angle; }
    const wx = (f[0] - v.vw / 2) / v.zoom + v.camX, wy = (f[1] - v.vh / 2) / v.zoom + v.camY;
    const R = PHYS.baseSpeed / turnRateOf(me.mass), nx = -Math.sin(me.angle) * R, ny = Math.cos(me.angle) * R;
    const inside = Math.hypot(wx - me.x - nx, wy - me.y - ny) < R * 0.95 || Math.hypot(wx - me.x + nx, wy - me.y + ny) < R * 0.95;
    // QA r5: react after 0.4 s (was 1 s — the coil had already closed into an O) and hold a little longer
    if (inside) { o.t += dt; if (o.t > 0.4) { o.t = 0; o.hold = 0.5; return me.angle; } return target; }
    o.t = Math.max(0, o.t - dt * 0.5);
    // snake-side trap (QA r3): the finger points out past a pellet that sits inside his turning circle, so he circles
    // it forever. Seen from the snake: > 2π of turning in the window, a pellet inside the circle on the finger's
    // bearing, and no other snake inside it (a deliberate encircle is never touched) → swim straight 0.45 s.
    if (Math.abs(o.turn) > Math.PI * 1.6) {
      const sd = Math.sign(o.turn), ccx = me.x + sd * nx, ccy = me.y + sd * ny; let trap = false;
      m.world.food.query(ccx, ccy, R, (fd) => { if (!trap && Math.hypot(fd.x - ccx, fd.y - ccy) < R * 0.95 && Math.abs(angDiff(target, Math.atan2(fd.y - me.y, fd.x - me.x))) < 0.6) trap = true; });
      if (trap) for (const sn of m.world.snakes) if (sn !== me && sn.alive && Math.hypot(sn.x - ccx, sn.y - ccy) < R * 1.6 + sn.r) { trap = false; break; }
      if (trap) { o.turn = 0; o.hold = 0.5; return me.angle; }
    }
    return target;
  }

  /** every 2 s: p90 > 18 ms twice → one tier down; 20 s p90 < 12 ms → one tier up (once per match) */
  private adaptQuality(work: number, dt: number) {
    const v = this.view!, m = this.match!, P = this.perf;
    // very slow device (spec §3 rule 15): 2 s of frames > 50 ms → Q0; still 5 s at Q0 → the '小蛇有点累了' pause
    if (m.state === 'playing' && dt * 1000 > 50) P.slow += dt; else if (m.state === 'playing') P.slow = 0;
    if (P.slow >= 2 && v.R.quality > 0) { v.R.quality = 0; P.qChanges++; P.slow = 0; this.relayout(); this.shell?.session?.mark('quality', { q: 0 }); }
    else if (P.slow >= 5 && v.R.quality === 0) { P.slow = 0; P.perfPauses++; this.shell?.session?.mark('perf-pause', { venue: m.venue }); this.showPause(true); return; }
    this.frameTimes.push(Math.max(work, dt * 1000 * 0.25)); this.qT += dt;
    if (this.qT < 2) return; this.qT = 0;
    const a = this.frameTimes.sort((x, y) => x - y), p90 = a[Math.floor(a.length * 0.9)] ?? 0; this.frameTimes = [];
    P.p90s.push(p90);
    if (p90 > 18) { this.slowStreak++; if (this.slowStreak >= 2 && v.R.quality > 0) { v.R.quality--; P.qChanges++; this.slowStreak = 0; this.relayout(); this.shell?.session?.mark('quality', { q: v.R.quality }); } }
    else { this.slowStreak = 0; if (p90 < 12 && v.R.quality < 2 && !this.upgraded && m.world.t > 20) { v.R.quality++; P.qChanges++; this.upgraded = true; this.relayout(); } }
  }
  private relayout() { const L = this.shell?.layout(); if (L) this.view?.resize(L.width, L.height, this.renderScale()); }

  private onMatchEvent(e: MatchEvent) {
    const m = this.match!, v = this.view!, hud = this.hud!, me = m.me;
    if (m.demo && (e.kind === 'milestone' || e.kind === 'rank1' || e.kind === 'last10' || e.kind === 'wall' || e.kind === 'boostReady' || e.kind === 'respawned' || e.kind === 'endlessNudge')) return;
    switch (e.kind) {
      case 'countdown': {
        hud.showCount(e.n); play('ui-tick');
        if (e.n === 3 && m.world.t === 0) {
          // the first match in each mode says what the mode is (snake.mode.*), then 准备好了
          if (m.run && !m.demo && this.twinLine) { const tl = this.twinLine; this.twinLine = null; void this.say(tl, { interrupt: true }); this.twinChip(tl); }
          else if (!m.run && !this.save.seen(`mode.${m.mode}`)) { this.save.markSeen(`mode.${m.mode}`); void this.say(`snake.mode.${m.mode}`, { interrupt: true }).then(() => this.say('snake.match.go')); }
          else void this.say('snake.match.go', { interrupt: true });
        } else if (e.n === 3 && m.world.t > 0 && !m.demo) void this.say('snake.match.resume', { interrupt: true });   // 3-2-1 after a pause
        break;
      }
      case 'go': {
        hud.showCount('出发'); play('launch', { volume: 0.7 });
        // first run 1-2 / 1-3 skip S8, so the level's goal is read in-level right after GO (spec §2.6)
        if (m.run && !m.demo && this.firstRun && m.world.t < 0.5 && (m.run.m.id === 'c1m2' || m.run.m.id === 'c1m3')) void this.say(m.run.m.lines.brief, { interrupt: true });
        break;
      }
      case 'milestone': {
        hud.bannerShow(`长度${LEN_WORD[e.n]}！`, 'is-len'); play('level-up'); v.fx.confetti(me.x, me.y, 16); v.zoom *= 0.97;
        this.sayCapped(`len.${e.n}`, `snake.len.${e.n}`);
        break;
      }
      case 'rank1': hud.bannerShow('你是第一名！', 'is-gold'); play('jingle-magic'); this.pad.raise(true); void this.say('snake.match.rank1'); setTimeout(() => this.pad.raise(m.timeLeft <= 10), 6000); break;
      case 'last10': play('ui-notify'); void this.say('snake.match.last10'); this.pad.raise(true); break;
      case 'wall': if (!this.save.seen('wall')) { this.save.markSeen('wall'); void this.say('snake.match.wall'); } break;
      case 'boostReady': if (!this.save.seen('boost')) { this.save.markSeen('boost'); hud.pulseBoost(); void this.say('snake.match.boost'); } break;
      case 'boost': if (e.on && !m.demo) SND.boostStart(); break;
      case 'ending': hud.bannerShow('比赛结束', 'is-end'); play('jingle-round-over'); this.pad.raise(false); void this.say('snake.match.end', { interrupt: true }); this.root.classList.add('sb-freeze'); break;
      case 'died': this.onDied(e.cause.tag, e.cause.killer); break;
      case 'card': this.showDeathCard(); break;
      case 'respawned': this.card?.remove(); this.card = null; hud.setDying(false); if (m.run?.m.playerRespawn === 'keep') { if (!this.save.seen('respawn.keep')) { this.save.markSeen('respawn.keep'); void this.say('snake.respawn.keep'); } } else if (!this.save.seen('respawn')) { this.save.markSeen('respawn'); void this.say('snake.respawn'); } break;
      case 'endlessNudge': void this.say('snake.endless.nudge'); break;
      case 'over': void (m.run ? this.finishMission() : this.finishMatch()); break;
      case 'mission': this.onMissionNote(e.n); break;
      case 'missionDone': if (e.ok) { hud.bannerShow(m.demo ? '看明白了吗？' : '过关！', 'is-gold'); play('jingle-win'); v.fx.confetti(me.x, me.y, 24); } break;
      case 'sim': this.onSim(e.e); break;
    }
  }

  private onSim(e: import('./sim/world').SimEvent) {
    const m = this.match!, v = this.view!, hud = this.hud!, w = m.world, me = m.me;
    switch (e.type) {
      case 'eat': {
        // first run 1-2: his first stardust → 吃星尘，变长！ (spec §2.6)
        if (!this.tips.firstEat && m.run?.m.id === 'c1m2' && this.firstRun && w.t > 3) { this.tips.firstEat = true; void this.say('snake.intro.4'); }
        eatSound(e.kind === 'big'); if (e.kind === 'big') hud.floater('+5', me.x, me.y, 'is-gold'); break; }
      case 'meteor': {
        const s = w.byId.get(e.id)!;
        if (s === me && !m.demo) this.sayCapped('meteor', 'snake.meteor', 3);   // the first 3 in a lifetime (spec §7.4)
        if (s === me) { play('coin'); SND.meteor(); v.fx.burst(me.x, me.y, [255, 120, 200], 30, 260, 9, 'spark', 0.8); hud.floater('+15', me.x, me.y, 'is-gold'); this.root.classList.remove('sb-rainbow'); void this.root.offsetWidth; this.root.classList.add('sb-rainbow'); v.happyUntil = v.time + 0.6; }
        break;
      }
      case 'pu': {
        const s = w.byId.get(e.id)!;
        if (s === me) { play('powerup'); if (e.kind === 'shield') SND.shieldUp(); if (e.kind === 'magnet') SND.magnet(); if (e.kind === 'speed') SND.speed(); if (!m.demo) this.sayCapped(`pu.${e.kind}`, `snake.pu.${e.kind}`, 3); v.fx.shockwave(me.x, me.y, [255, 255, 255], 10, 60, 0.35); }
        break;
      }
      case 'gem': {
        const k = w.byId.get(e.id)!;
        v.fx.burst(k.x, k.y - k.r, [255, 210, 63], 30, 320, 10, 'spark', 0.8); v.fx.shockwave(k.x, k.y, [255, 120, 200], k.r, k.r * 6, 0.5); v.fx.kick(4, 0.15); SND.gem();
        hud.bannerShow(e.left > 0 ? `宝石 ${(k.crownMax ?? 3) - e.left}/${k.crownMax ?? 3}` : '王冠碎了！', 'is-gold');
        void this.say(e.left > 0 ? 'snake.king.gem' : 'snake.king.down', { interrupt: true });
        break;
      }
      case 'king-windup': { const k = w.byId.get(e.id)!; if (v.onScreen(k.x, k.y, 300)) SND.windup(); if (!this.missionVoice.windup) { this.missionVoice.windup = true; void this.say('snake.king.charge', { interrupt: true }); } break; }
      case 'king-charge': { const k = w.byId.get(e.id)!; if (v.onScreen(k.x, k.y, 200)) { v.fx.shockwave(k.x, k.y, [255, 140, 60], k.r, k.r * 4, 0.35); SND.charge(); } break; }
      case 'wake': { const k = w.byId.get(e.id)!; if (v.onScreen(k.x, k.y, 100)) { SND.wake(); hud.floater('醒了！', k.x, k.y, 'is-near'); if (!m.demo) this.sayCapped('wake', 'snake.wake', 3); } break; }
      case 'shieldsave': {
        const s = w.byId.get(e.id)!;
        if (v.onScreen(s.x, s.y, 80)) { v.fx.burst(s.x, s.y, [90, 230, 255], 12, 300, 10, 'shard', 0.5); v.fx.shockwave(s.x, s.y, [255, 255, 255], s.r, s.r * 4, 0.35); SND.shieldBreak(); }
        if (s === me) { void this.say('snake.pu.saved', { interrupt: true }); }
        break;
      }
      case 'nearmiss': {
        if (e.id !== me.id) break;
        const txt = ['好险！', '擦身而过！', '躲开了！'][me.stats.nearMiss % 3];
        hud.floater(txt, me.x + Math.cos(me.angle + 1.2) * 40, me.y + Math.sin(me.angle + 1.2) * 40, 'is-near'); play('whoosh-up', { rate: 1.4, volume: 0.7 });
        if (this.matchVoice.near < 2 && !m.demo) { this.matchVoice.near++; this.sayCapped('near', `snake.near.${1 + (me.stats.nearMiss % 3)}`); }
        break;
      }
      case 'spawn': {
        const s = w.byId.get(e.id)!;
        if (v.onScreen(s.x, s.y, 100)) v.fx.shockwave(s.x, s.y, [255, 255, 255], s.r, s.r * 5, 0.4);
        break;
      }
      case 'kill': {
        const victim = w.byId.get(e.victim)!, killer = e.killer >= 0 ? w.byId.get(e.killer) ?? null : null;
        if (victim !== me && killer !== me && v.onScreen(victim.x, victim.y, 200)) playAt('snake-drop-burst', v.worldToScreen(victim.x, victim.y)[0], v.vw, v.onScreen(victim.x, victim.y, 0));
        if (v.onScreen(victim.x, victim.y, 200)) { v.ghost(victim); const c = v.colorOf(victim); v.fx.burst(victim.x, victim.y, c as [number, number, number], 14, 240, 10, 'spark', 0.6); }
        const top = m.ranking().slice(0, 3).map((x) => x.s);
        if (killer === me || victim === me || top.includes(victim) || (killer && top.includes(killer))) hud.feedLine(killer, e.tag, victim);
        if (killer === me && victim !== me) { if (m.demo) { SND.kill(); v.fx.shockwave(victim.x, victim.y, [255, 210, 63], victim.r, victim.r * 6, 0.45); } else this.onPlayerKill(e.tag, victim); }
        break;
      }
    }
  }

  private onPlayerKill(tag: KillTag, victim: import('./sim/core').Snake) {
    const v = this.view!, hud = this.hud!, me = this.match!.me;
    SND.kill(); v.fx.shockwave(victim.x, victim.y, [255, 210, 63], victim.r, victim.r * 6, 0.45); v.happyUntil = v.time + 0.6;
    const multi = me.stats.multi;
    if (multi >= 2) { const k = Math.min(5, multi); hud.bannerShow(MULTI_TXT[k], 'is-gold'); SND.sting(k); void this.say(`snake.ann.${MULTI[k]}`, { interrupt: true }); }
    else if (tag === 'cut') { hud.bannerShow('截住了！', 'is-gold'); void this.say('snake.ann.cut', { interrupt: true }); }
    else if (tag === 'encircle') { hud.bannerShow('围住了！', 'is-gold'); void this.say('snake.ann.encircle', { interrupt: true }); }
    else void this.say('snake.ann.kill');
    if (me.stats.lifeKills === 3) { hud.bannerShow('一条命击败三条！', 'is-gold'); void this.say('snake.ann.streak3'); }
    const vk = me.stats.killTags[me.stats.killTags.length - 1]?.victimLifeKills ?? 0;
    if (vk >= 3) void this.say('snake.ann.shutdown');
  }

  private onDied(tag: KillTag, killer: import('./sim/core').Snake | null) {
    const v = this.view!, hud = this.hud!, me = this.match!.me;
    SND.out(); v.ghost(me); v.focus = null; v.fx.kick(4, 0.12);
    hud.setDying(true);
    this.router?.reset();
    this.perf.causes.push(tag);
    // offscreenDeaths (spec §8.12): was the fatal point outside his viewport 0.8 s earlier?
    const d = this.match!.lastDeath, t = this.match!.world.t - 0.8;
    const c = this.camRing.find((x) => x.t >= t) ?? this.camRing[0];
    if (d && c && (Math.abs(d.x - c.x) > v.vw / 2 / c.z || Math.abs(d.y - c.y) > v.vh / 2 / c.z)) this.perf.offscreen++;
    void killer;
  }

  private showDeathCard() {
    const m = this.match!, d = m.lastDeath; if (!d || this.card) return;
    if (m.demo || (m.run && !m.run.m.playerRespawn)) return;   // out-is-failure levels go straight to S9
    const killerName = d.killer?.name ?? '它';
    const line = (lineText(`snake.death.${d.tag}`) || '撞到了{name}的身体。').replace('{name}', killerName);
    const kc = d.killer ? this.view!.colorOf(d.killer) : hex2rgb('#8d97ad');
    const sayDeath = () => this.say(`snake.death.${d.tag}`, { interrupt: true, vars: { name: killerName } });
    void sayDeath().then(() => {
      const tips = { body: 2, cut: 2, headon: 1, encircle: 1 } as Record<string, number>;
      if (this.save.tipAllowed(d.tag)) void this.say(tipFor(d.tag, d.killer, 1 + (this.save.data.tipDay.byCause[d.tag]! - 1) % (tips[d.tag] ?? 1)));
    });
    const endless = m.mode === 'endless';
    // endless (QA r4): no card that flashes for 0.75 s and is swapped for the result — the result itself carries the
    // cause line and tip (finishMatch); the voice already said who and how
    if (endless) return;
    const vr = this.save.data.venues[m.venue];
    const tipId = tipFor(d.tag, d.killer, 1);
    this.card = deathCard(this.root, {
      tipText: lineText(tipId) || undefined,
      tag: d.tag, killer: d.killer, line, killerColor: kc, mode: m.mode === 'mission' ? 'timed' : m.mode, respawnIn: Math.max(0.5, m.respawnAt - m.world.t),
      stats: endless ? { len: Math.floor(m.me.mass), peak: Math.floor(m.me.stats.peak), record: m.me.stats.peak > vr.endless.bestPeak && vr.endless.runs > 0 } : undefined,
      onOk: () => { this.card?.remove(); this.card = null; },
      onAgain: () => { this.card?.remove(); this.card = null; if (m.run) this.retryMission(m.run.m.id); else void this.startMatch(m.mode, m.venue); },
      onLobby: () => { this.card?.remove(); this.card = null; this.showLobby(); },
      onReplay: () => void sayDeath(),
    });
  }

  showPause(tired = false) {
    const m = this.match; if (!m || m.state === 'over' || this.pausePanel) return;
    m.pause(); this.router?.reset();
    const close = () => { this.pausePanel?.remove(); this.pausePanel = null; };
    this.pausePanel = pausePanel(this.root, {
      endless: m.mode === 'endless', mission: !!m.run, tired,
      onResume: () => { close(); m.resume(true); this.wakeLoop(); },
      onRestart: () => { close(); this.markLeave(m); this.save.leaveMatch(m.counters(), m.lifeSec()); if (m.run) this.retryMission(m.run.m.id); else void this.startMatch(m.mode, m.venue); },
      onSettings: () => settingsPanel(this.root, this.save, () => { if (this.hud) { this.hud.showNames = this.save.data.settings.showNames; this.hud.setBoostSide(this.save.boostSide()); } }),
      onLobby: () => { close(); this.markLeave(m); this.save.leaveMatch(m.counters(), m.lifeSec()); if (m.run) this.showMap(m.run.m.ch); else this.showLobby(); },
      onBank: () => { close(); void this.say('snake.endless.bank'); m.bank(); this.wakeLoop(); },
    });
  }

  /** background: pause + commit the counter increment (spec §3.18) */
  onBackground() { const m = this.match; if (!m || m.state === 'over') return; this.save.commitProgress(m.counters(), m.lifeSec()); this.showPause(); }
  private markLeave(m: Match) {
    const base = { durationSec: Math.round((performance.now() - this.perf.t0) / 1000), deaths: this.perf.causes.length, left: true };
    if (m.run) this.shell?.session?.mark('mission-leave', { id: m.run.m.id, ...base }); else this.shell?.session?.mark('match-end', { mode: m.mode, venue: m.venue, ...base });
    this.markEnd('perf', { mode: m.mode, venue: m.venue, left: true });
  }
  onLeave() { const m = this.match; if (m && m.state !== 'over') this.save.leaveMatch(m.counters(), m.lifeSec()); this.save.save(); }

  private async finishMatch() {
    const m = this.match!; const r = m.result();
    this.pad.stop();
    this.root.classList.remove('sb-freeze');
    const res = this.save.endMatch(r);
    const d = r.mode === 'endless' && !r.banked ? m.lastDeath : null;
    const causes: Record<string, number> = { body: 0, cut: 0, headon: 0, encircle: 0 }; for (const c of this.perf.causes) causes[c] = (causes[c] ?? 0) + 1;
    if (r.mode === 'endless') this.shell?.session?.mark('endless-end', { venue: r.venue, lifeSec: r.lifeSec, peak: r.peak, kills: r.kills, banked: r.banked, deaths: this.perf.causes.length, causes, offscreenDeaths: this.perf.offscreen });
    else this.shell?.session?.mark('match-end', { mode: r.mode, venue: r.venue, rank: r.rank, n: r.of, peak: r.peak, kills: r.kills, cut: r.cut, enc: r.enc, deaths: this.perf.causes.length, causes, offscreenDeaths: this.perf.offscreen, durationSec: Math.round((performance.now() - this.perf.t0) / 1000), left: false, trophies: res.trophies.length });
    if (r.mode === 'timed' && res.heat.from !== res.heat.to) this.shell?.session?.mark('heat', { venue: r.venue, from: res.heat.from, to: res.heat.to });
    this.markEnd('perf', { mode: r.mode, venue: r.venue });
    await new Promise((ok) => setTimeout(ok, d ? 1300 : 300));
    if (this.match !== m) return;
    this.card?.remove(); this.card = null;
    const trophies = res.trophies.map((id) => TROPHIES[r.venue].find((t) => `trophy:${r.venue}.${t.id}` === id)!).filter(Boolean);
    let title: string; let line: string; let vars: Record<string, number> | undefined;
    if (r.mode === 'timed' && r.rank <= 3) { title = r.rank === 1 ? '冠军！' : `第${r.rank === 2 ? '二' : '三'}名！`; line = `snake.podium.${r.rank}`; play(r.rank === 1 ? 'level-complete' : 'jingle-win'); }
    else if (res.newRecord) { title = '比纪录还长！'; line = 'snake.podium.best'; play('jingle-win'); }
    else if (r.peak >= 60) { title = `这局长到了 ${r.peak}！`; line = 'snake.podium.grow'; vars = { n: r.peak }; play('star-2'); }
    else if (r.kills > 0) { title = `这局击败了 ${r.kills} 条！`; line = 'snake.podium.kills'; vars = { n: r.kills }; play('star-2'); }
    else { title = '下局再来！'; line = 'snake.podium.other'; play('star-1'); }
    if (r.mode === 'endless' && r.banked) title = '平安返航！';
    // queued after the result line: a won trophy (spec §5.4), a new record (snake.record.*)
    const lifeRec = r.mode === 'endless' && res.lifeRecord;
    void this.say(line, { interrupt: !d, vars }).then(() => {   // after an endless out the death line + tip finish first
      if (this.match !== m) return;
      if (trophies.length) void this.say('snake.trophy');
      if (res.newRecord && line !== 'snake.podium.best') void this.say('snake.record.len');
      else if (lifeRec) void this.say('snake.record.life');
    });
    if (trophies.length) setTimeout(() => play('unlock'), 900);
    this.hud?.root.classList.add('is-faded');   // the result never sits over a live, half-covered HUD (QA r4)
    podium(this.root, {
      r, meId: m.me.id, meName: m.me.name, skin: this.save.data.equipped.skin, colorOf: (s) => (s.isPlayer ? hex2rgb(skinById(this.save.data.equipped.skin).base) : aiBodyColor(s.color ?? '灰', s.persona)),
      title, newRecord: res.newRecord, trophies, unlocked: res.unlocked.map((u) => VENUES[u].name),
      cause: d ? deathCause({ tag: d.tag, killer: d.killer, killerColor: d.killer ? this.view?.colorOf(d.killer) ?? hex2rgb('#8d97ad') : hex2rgb('#8d97ad'), line: (lineText(`snake.death.${d.tag}`) || '撞到了{name}的身体。').replace('{name}', d.killer?.name ?? '它'), tipText: lineText(tipFor(d.tag, d.killer, 1)) || undefined }) : undefined,
      onAgain: () => { this.root.querySelector('.sb-podium')?.remove(); void this.startMatch(r.mode, r.venue); },
      onLobby: () => { this.root.querySelector('.sb-podium')?.remove(); this.showLobby(); },
    });
    // unlock cards pop one by one once he has read his own result: 3 s after the podium rises, or at his first tap
    // on it (QA r3: the card covered the podium after 1.4 s)
    const pod = this.root.querySelector('.sb-podium');
    let drained = false;
    const drain = () => { if (drained || this.root.querySelector('.sb-podium') !== pod) return; drained = true; this.drainCards(); };
    setTimeout(drain, 3200);
    pod?.addEventListener('pointerup', (e) => { if (!(e.target as Element).closest?.('button')) setTimeout(drain, 250); });
  }

  /** one WebGL canvas for the whole session (see WorldView) */
  private glCanvas: HTMLCanvasElement | null = null; private glR: Renderer | null = null;
  teardownMatch() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.router?.dispose(); this.router = null;
    this.hud?.dispose(); this.hud = null;
    if (this.view) { this.view.R.onLost = null; this.view.R.onRestored = null; }
    this.canvas?.remove(); this.canvas = null;
    this.view = null; this.match = null;
    this.card?.remove(); this.card = null; this.pausePanel?.remove(); this.pausePanel = null;
    this.root.querySelectorAll('.sb-scrim, .sb-ghost, .sb-ghost-line').forEach((n) => n.remove());
    this.skipOff?.(); this.skipOff = null;
    this.pad.stop(); this.boostLoop?.set(false); this.voice.stop(); this.voice.inMatch = false;
    this.root.classList.remove('sb-freeze');
  }

  // ================================================================ stage 2: 挑战关 / 收藏 / 纪录
  private menu: { dispose(): void } | null = null;

  private missionVoice = { headon: false, windup: false };
  private hintState = { idle: 0, noProg: 0, lastProg: '', h0: 0, pointShown: false, touchSeen: 0 };
  private cardBusy = false;

  private closeMenus() { document.body.classList.remove('sb-onmap'); this.sub.el.hidden = true; this.menu?.dispose(); this.menu = null; this.root.querySelectorAll('.sb-brief, .sb-story, .sb-unlock, .sb-cbig, .sb-demo').forEach((n) => n.remove()); }
  private leaveLobby() { this.lobby?.dispose(); this.lobby = null; this.closeMenus(); }

  /** `then` runs once the chapter's first-entry story card is closed (or at once if it was seen) — the next brief
   * never buries the story (QA r4) */
  showMap(ch?: number, then?: () => void) {
    this.tutorial = false;
    menuMusic(true);
    this.teardownMatch(); this.leaveLobby();
    document.body.classList.remove('sb-playing');
    document.getElementById('sb-back')?.setAttribute('hidden', '');
    const cur = MISSION_BY_ID[this.save.currentMission()];
    const c0 = ch ?? cur.ch;
    const map = missionMap(this.root, this.save, c0, {
      onPick: (id) => this.openMission(id),
      onBack: () => this.showLobby(),
      onChapter: (c) => this.storyOnce(c),
    });
    this.menu = map;
    document.body.classList.add('sb-onmap');   // landscape: the subtitle bubble moves clear of the node path (QA r1)
    this.storyOnce(c0, then);
    setHubProgress('snake-battle', { label: `挑战关 第${c0}章` });
  }
  /** first entry into a chapter: story card read by the narrator (spec §2.5 S7) */
  private storyOnce(ch: number, then?: () => void) {
    const key = `story:c${ch}`;
    if (this.save.seen(key)) { then?.(); return; }
    this.save.markSeen(key);
    if (shouldAutoSkip()) { then?.(); return; }   // parent page: 跳过开场和教学
    void this.say(`snake.story.c${ch}`, { interrupt: true });
    this.storyCardSkippable(ch, () => then?.());
  }
  /** a story card (chapter opener / 尾声) with the kit 跳过 pill: a tap anywhere still closes it; 跳过 also stops the
   * narrator mid-line (Dad 2026-10-08) */
  private storyCardSkippable(ch: number | 'end', then: () => void) {
    let off: (() => void) | null = null;
    const card = storyCard(this.root, ch, () => { off?.(); then(); });
    off = mountSkipButton(document.body, () => { off = null; this.voice.stop(); card.close(); });
  }

  /** hint level for the next attempt (spec §5.1): misses 1/2/3 → H1/H2/H3 */
  private hintLevel(id: string): 0 | 1 | 2 | 3 { const r = this.save.data.missions[id]; return (r && r.clears === 0 ? Math.min(3, r.failStreak) : 0) as 0 | 1 | 2 | 3; }

  /** S8 only the first time, or when this retry just unlocked a new hint level (spec §2.1) */
  openMission(id: string) {
    const m = MISSION_BY_ID[id]; const rec = this.save.data.missions[id];
    const first = !rec || rec.attempts === 0;
    const hl = this.hintLevel(id);
    const newHint = !first && hl > (rec?.hintMax ?? 0);
    if (!first && !newHint) { void this.startMatch('mission', this.venue, { mission: id }); return; }
    if (newHint) { this.save.mission(id).hintMax = hl; this.save.save(); this.shell?.session?.mark('hint', { id, level: hl }); }
    // first appearance of every new element auto-plays its 看一招 clip (spec §5.1), chapter 1 included
    const autoWatch = first && !!m.newElement && hasClip(id);
    const card = briefCard(this.root, {
      m, hint: first ? (autoWatch ? 2 : 0) : hl, firstTime: first,
      onStart: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id }); },
      onWatch: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id, demo: true, clip: true }); this.afterDemo = () => this.openBriefAgain(id); },
      onDemo: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id, demo: true }); this.afterDemo = () => this.startTwin(id); },
      onBack: () => card.remove(),
      onReplay: () => void this.say(hl >= 1 && !first ? m.lines.h1 : m.lines.brief, { interrupt: true }),
    });
    void this.say(hl >= 1 && !first ? m.lines.h1 : m.lines.brief, { interrupt: true }).then(() => { if (!first && hl >= 2) void this.say(hl >= 3 ? 'snake.hint.offer3' : 'snake.hint.offer2'); });
  }
  private openBriefAgain(id: string) { this.showMap(MISSION_BY_ID[id].ch); this.openMissionBrief(id); }
  private demoKey: { t: number | null; done: boolean; end: number | null; limit: number | null } = { t: null, done: false, end: null, limit: null };
  /** the demo's key moment plays at 0.5× for 1.5 s; the H2 clip ends 2 s after it (spec §5.1) */
  private demoTick(m: Match) {
    const k = this.demoKey, t = m.world.t;
    if (k.t !== null && !k.done && t >= k.t - 0.4) { k.done = true; m.timeScale = 0.5; this.hud?.bannerShow('看这里！', 'is-gold'); setTimeout(() => { if (this.match === m && m.state === 'playing') m.timeScale = 1; }, 1500); }
    if ((k.end !== null && t >= k.end) || (k.limit !== null && t >= k.limit)) { k.end = null; k.limit = null; (m as Match & { onDemoEnd?: () => void }).onDemoEnd?.(); }
  }
  private openMissionBrief(id: string) {
    const m = MISSION_BY_ID[id]; const hl = this.hintLevel(id);
    const card = briefCard(this.root, { m, hint: hl, firstTime: hl === 0, onStart: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id }); }, onDemo: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id, demo: true }); this.afterDemo = () => this.startTwin(id); }, onBack: () => card.remove(), onReplay: () => void this.say(m.lines.brief, { interrupt: true }) });
  }
  /** H3 twin: same level, new seed, knobs; each further twin miss loosens one more step (spec §5.1) */
  private startTwin(id: string) {
    const lvl = this.save.data.twinLevel?.[id] ?? 1;
    const tm = twinOf(MISSION_BY_ID[id]);
    const line = tm.ai.some((a) => a.crown) ? 'snake.hint.twin.king' : tm.objective.type === 'race' ? (MISSION_BY_ID[id].objective.killsGE ? 'snake.hint.twin.racekill' : 'snake.hint.twin.race') : tm.objective.type === 'survive' ? (MISSION_BY_ID[id].ai.length ? 'snake.hint.twin.shield' : 'snake.hint.twin.survive') : tm.playerRespawn === 'keep' && !MISSION_BY_ID[id].playerRespawn ? 'snake.hint.twin.respawn' : tm.ai.length ? 'snake.hint.twin.ai' : tm.objective.type === 'rings' ? 'snake.hint.twin.rings' : MISSION_BY_ID[id].arena.meteors?.speed ? 'snake.hint.twin.meteor' : 'snake.hint.twin.count';
    // said on the twin's 3-2-1 in place of 三二一出发 (QA r5: said here, startMatch's go line cut it in the same tick)
    this.twinLine = line;
    void this.startMatch('mission', this.venue, { mission: id, twin: lvl });
  }
  private twinLine: string | null = null;
  /** what changed in the twin, for non-readers: an icon chip under the goal pill for 4 s (QA r5) */
  private twinChip(line: string) {
    const k = line.split('.').pop() ?? 'count';
    const txt: Record<string, string> = { respawn: '撞了能接着游', shield: '送你一个护盾', ai: '蛇游得慢一点', rings: '星环大一点', meteor: '流星糖慢一点', count: '少吃一点', survive: '时间短一点', king: '王冠只要两颗', race: '名次放宽一名', racekill: '不比名次' };
    const chip = h('div', { class: `sb-twinchip sb-twinchip--${k}` }, h('i', { class: 'sb-twinchip__ic' }), h('span', {}, txt[k] ?? '换你来'));
    this.hud?.root.append(chip);
    window.setTimeout(() => { chip.classList.add('is-out'); window.setTimeout(() => chip.remove(), 400); }, 4200);
  }
  private afterDemo: (() => void) | null = null;
  /** a retry that brings a hint card shows it over the chapter map, not over black (QA r1) */
  retryMission(id: string) {
    const rec = this.save.data.missions[id];
    if (!this.firstRun && this.hintLevel(id) > (rec?.hintMax ?? 0)) this.showMap(MISSION_BY_ID[id].ch);
    this.openMission(id);
  }

  /** demo overlay: the 领航员 plays (bot + hook, deterministic seed); a tap ends it (spec §5.1 H3) */
  private demoOverlay(m: Match, clip = false) {
    // H2 看一招 returns to the brief; only the H3 示范 hands over to his twin attempt (QA r4)
    const ov = h('div', { class: 'sb-demo' + (clip ? ' is-clip' : '') }, h('div', { class: 'sb-demo__tag' }, clip ? '看一招' : '领航员示范'), h('div', { class: 'sb-demo__tap' }, clip ? '点屏幕，回去' : '点屏幕，换你来'));
    this.root.append(ov);
    const end = () => { ov.remove(); const f = this.afterDemo; this.afterDemo = null; this.teardownMatch(); f?.(); };
    setTimeout(() => ov.addEventListener('pointerdown', end), 600);
    (m as Match & { onDemoEnd?: () => void }).onDemoEnd = end;
  }
  /** first run c1m1: the ghost hand loops toward the first ring until his first touch (spec §2.6) */
  private ghostHand(m: Match) {
    const g = h('div', { class: 'sb-ghost' }); g.innerHTML = GHOST_SVG;
    // a dashed line from his head to the fingertip, in step with the hand's press (spec §2.6)
    const NS = 'http://www.w3.org/2000/svg'; const line = document.createElementNS(NS, 'svg'); line.setAttribute('class', 'sb-ghost-line');
    const ln = document.createElementNS(NS, 'line'); line.append(ln);
    this.root.append(line, g);
    const p = m.run!.m.objective.points?.[0];
    if (p) {
      const v = this.view!;
      const place = () => {
        if (!g.isConnected) { line.remove(); return; }
        const [sx, sy] = v.worldToScreen(p[0] + 40, p[1]); g.style.left = `${sx}px`; g.style.top = `${sy}px`;
        const [hx, hy] = v.worldToScreen(m.me.x, m.me.y), tx = sx + 13, ty = sy - 1, d = Math.hypot(tx - hx, ty - hy) || 1;
        const k = Math.min(0.9, (m.me.r * v.zoom + 44) / d);   // start clear of the head and its name tag
        ln.setAttribute('x1', `${hx + (tx - hx) * k}`); ln.setAttribute('y1', `${hy + (ty - hy) * k}`); ln.setAttribute('x2', `${tx - (tx - hx) * 18 / d}`); ln.setAttribute('y2', `${ty - (ty - hy) * 18 / d}`);
        requestAnimationFrame(place);
      };
      requestAnimationFrame(place);
    } else line.remove();
  }
  private missionIntroVoice(m: Match) {
    const ms = m.run!.m;
    if (ms.id === 'c1m1' && this.firstRun) { void this.say('snake.intro.1', { interrupt: true }).then(() => this.say('snake.intro.2')); return; }
    if (this.hintLevel(ms.id) >= 1) { this.hud!.pointUntil = 3; this.hintState.pointShown = true; }
    if (ms.ai.some((a) => a.king)) { if (ms.id === 'c5m7') SND.king(); }
    if (ms.ai.some((a) => a.king)) void this.say(ms.id === 'c5m7' ? 'snake.king.appear' : 'snake.king.sleep');
  }
  /** H0 (spec §5.1): 6 s without touching, or 20 s without progress → ghost hand (one 2.5 s drag from 120 px ahead
   * of his head toward the target) + the gold pointing arrow for 3 s; ≤2 per level. Idle = no finger down and no
   * new touch (the router keeps the last heading after a lift, so `target` alone never reads as idle — QA r3). */
  private hintTick(m: Match, dt: number) {
    const hs = this.hintState, run = m.run!, r = this.router!, hud = this.hud!;
    if (m.state !== 'playing' || !m.me.alive) return;
    if (m.waitTouch && r.target === null) return;   // the first-run hand is already looping
    if (r.steering() || r.lastTouch !== hs.touchSeen) { hs.touchSeen = r.lastTouch; hs.idle = 0; this.root.querySelector('.sb-ghost.is-once')?.remove(); }
    else hs.idle += dt;
    const p = run.progress(); const key = `${p.cur}`;
    if (key !== hs.lastProg) { hs.lastProg = key; hs.noProg = 0; } else hs.noProg += dt;
    if (hs.h0 < 2 && (hs.idle >= 6 || hs.noProg >= 20)) {
      hs.h0++; hs.idle = 0; hs.noProg = 0; hud.pointUntil = m.world.t + 3;
      const tg = hud.hintTarget(); if (tg) this.ghostDrag(m, tg);
      this.shell?.session?.mark('hint', { id: run.m.id, level: 0 });
    }
  }
  /** one-shot match tips: timed / endless 6 s without touching → ghost hand + snake.match.idle (once per match, spec
   * §5.1); first-run 1-2: the first big bead on screen swells twice + snake.intro.5 (spec §2.6) */
  private tips = { idle: 0, idleDone: false, touchSeen: 0, big: false, firstEat: false };
  private tipsTick(m: Match, v: WorldView, r: TouchRouter, dt: number) {
    const tp = this.tips, me = m.me;
    if (m.state !== 'playing' || !me.alive) return;
    if (!m.run && !tp.idleDone) {
      if (r.steering() || r.lastTouch !== tp.touchSeen) { tp.touchSeen = r.lastTouch; tp.idle = 0; this.root.querySelector('.sb-ghost.is-once')?.remove(); }
      else tp.idle += dt;
      if (tp.idle >= 6) { tp.idleDone = true; this.ghostDrag(m, [me.x + Math.cos(me.angle) * 320, me.y + Math.sin(me.angle) * 320]); this.sayCapped('idle', 'snake.match.idle', 3); }
    }
    if (m.run?.m.id === 'c1m2' && this.firstRun && !tp.big) {
      const rad = Math.min(v.vw, v.vh) * 0.42 / v.zoom; let hit: { x: number; y: number } | null = null;
      m.world.food.query(v.camX, v.camY, rad, (fd) => { if (!hit && fd.kind === 'big' && Math.hypot(fd.x - v.camX, fd.y - v.camY) < rad) hit = fd; });
      const b = hit as { x: number; y: number } | null;
      if (b) {
        tp.big = true; const bx = b.x, by = b.y;
        const swell = () => { if (this.match === m) v.fx.shockwave(bx, by, [255, 216, 77], 8, 46, 0.7); };
        swell(); setTimeout(swell, 800);
        void this.say('snake.intro.5');
      }
    }
  }
  /** H0 ghost hand: presses 120 px ahead of his head on the line to the target, drags 140 px toward it, lifts */
  private ghostDrag(m: Match, tg: [number, number]) {
    const v = this.view!; this.root.querySelector('.sb-ghost.is-once')?.remove();
    const [hx, hy] = v.worldToScreen(m.me.x, m.me.y), [tx, ty] = v.worldToScreen(tg[0], tg[1]);
    const a = Math.atan2(ty - hy, tx - hx), ca = Math.cos(a), sa = Math.sin(a);
    const L = this.shell?.layout(), W = L?.width ?? innerWidth, H = L?.height ?? innerHeight;
    const x = Math.max(60, Math.min(W - 100, hx + ca * 120)), y = Math.max(90, Math.min(H - 140, hy + sa * 120));
    const g = h('div', { class: 'sb-ghost is-once', style: `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--dx:${(ca * 140).toFixed(0)}px;--dy:${(sa * 140).toFixed(0)}px` });
    g.innerHTML = GHOST_SVG;
    this.root.append(g);
    setTimeout(() => g.remove(), 2600);
  }
  private onMissionNote(n: { kind: string; id?: number; n?: number }) {
    const m = this.match!, v = this.view!, hud = this.hud!, me = m.me, run = m.run!;
    switch (n.kind) {
      case 'ring': { const p = run.m.objective.points![(n.n ?? 1) - 1]; SND.ring((n.n ?? 1) - 1); play('chime', { volume: 0.6 }); if (p) { v.fx.burst(p[0], p[1], [255, 214, 90], 26, 300, 9, 'spark', 0.7); v.fx.shockwave(p[0], p[1], [255, 240, 170], 30, run.m.objective.radius! * 1.4, 0.45); } if (run.m.id === 'c1m1' && n.n === 1 && this.firstRun) void this.say('snake.intro.3'); break; }
      case 'marker': SND.core(); hud.bannerShow('圈住了！', 'is-gold'); break;
      case 'headonTarget': if (!this.missionVoice.headon) { this.missionVoice.headon = true; void this.say('snake.m.headon', { interrupt: true }); } break;
      case 'phase2': void this.say('snake.king.guards', { interrupt: true }); break;
      case 'phase3': void this.say('snake.king.angry', { interrupt: true }); this.pad.raise(true); break;
      case 'bigSwimIn': { const s = m.world.byId.get(n.id!); if (s) { hud.floater('大蛇来了！', me.x, me.y - 60, 'is-gold'); void this.say('snake.m.bigcome', { interrupt: true }); } break; }
      case 'grown': void this.say('snake.m.grown', { interrupt: true }); break;
    }
  }

  private async finishMission() {
    const m = this.match!; const res = m.result(); const mr = res.mission!; const ms = m.run!.m;
    this.pad.stop(); this.root.classList.remove('sb-freeze');
    if (m.demo) { const f = (m as Match & { onDemoEnd?: () => void }).onDemoEnd; await new Promise((ok) => setTimeout(ok, 900)); if (this.match === m) f?.(); return; }
    const twin = !!ms.isTwin;
    const out = this.save.endMission(ms.id, { ok: mr.ok, stars: mr.stars, t: mr.t, why: mr.why }, res.counters, { twin });
    this.shell?.session?.mark('mission-end', { id: ms.id, ok: mr.ok, stars: mr.stars, t: Math.round(mr.t), why: mr.why ?? '', twin, hintMax: this.save.data.missions[ms.id]?.hintMax ?? 0, deaths: this.perf.causes.length, attempt: this.save.data.missions[ms.id]?.attempts ?? 0, seed: m.seed, bumps: m.me.bumps ?? 0, keyTag: ms.objective.tag ?? ms.objective.tags?.join('+') ?? '' });
    this.markEnd('perf', { mission: ms.id });
    await new Promise((ok) => setTimeout(ok, mr.ok ? 700 : 400));
    if (this.match !== m) return;
    this.card?.remove(); this.card = null;
    const i = MISSIONS.findIndex((x) => x.id === ms.id); const next = MISSIONS[i + 1];
    // rotate on the chapter's running clear count, so consecutive first clears never repeat the same praise (QA r2)
    const chClears = MISSIONS.filter((x) => x.ch === ms.ch).reduce((a, x) => a + (this.save.data.missions[x.id]?.clears ?? 0), 0);
    const praise = praiseFor(ms, mr.stars, chClears, this.save.data.lastPraise);
    if (mr.ok) { this.save.data.lastPraise = praise; this.save.save(); }
    const retry = mr.why === 'cap' ? (ms.ai.some((a) => a.crown) ? 'snake.retry.cap.king' : ms.objective.type === 'kill' ? 'snake.retry.cap.kill' : 'snake.retry.cap.other') : `snake.retry.${1 + (this.save.data.missions[ms.id].failStreak % 4)}`;
    // out-is-failure levels (QA r4): S9 says who got him and how — the death line, then the tip, then the retry line
    const d = !mr.ok && mr.why === 'out' ? m.lastDeath : null;
    let cause: HTMLElement | undefined;
    if (d) {
      const kn = d.killer?.name ?? '它';
      const tipVariants = ({ body: 2, cut: 2 } as Record<string, number>)[d.tag] ?? 1;
      const tipN = this.save.tipAllowed(d.tag) ? 1 + ((this.save.data.tipDay.byCause[d.tag] ?? 1) - 1) % tipVariants : 0;
      cause = deathCause({ tag: d.tag, killer: d.killer, killerColor: d.killer ? this.view!.colorOf(d.killer) : hex2rgb('#8d97ad'), line: (lineText(`snake.death.${d.tag}`) || '撞到了{name}的身体。').replace('{name}', kn), tipText: lineText(tipFor(d.tag, d.killer, tipN || 1)) || undefined });
      play('star-1');
      void this.say(`snake.death.${d.tag}`, { interrupt: true, vars: { name: kn } }).then(() => (tipN ? this.say(tipFor(d.tag, d.killer, tipN)) : 'skipped')).then(() => this.say(retry));
    } else if (mr.ok) { play(mr.stars >= 3 ? 'level-complete' : 'jingle-win'); void this.say(praise, { interrupt: true }); }
    else { play('star-1'); void this.say(retry, { interrupt: true }); }
    if (mr.ok && ms.id === 'c1m3' && !this.save.data.firstRunDone) { this.save.data.firstRunDone = true; this.save.save(); }
    const canSkip = !mr.ok && this.save.canSkip(ms.id);
    if (canSkip) void this.say('snake.hint.skip');
    const hasNext = !!next && this.save.missionOpen(next.id);
    this.hud?.root.classList.add('is-faded');
    const act = await missionResult({ m: ms, ok: mr.ok, stars: mr.stars, star2: mr.star2, star3: mr.star3, praise, retry, canSkip, hasNext, twin, cause, nextLabel: mr.ok && ms.id === 'c1m3' && (out.firstClear || this.tutorial) ? '去大厅' : undefined });
    if (this.match !== m) return;
    // unlock / story cards show over the finished (dimmed) arena, not over a black screen (QA r1); the match is torn
    // down only when the next screen is about to appear
    const go = () => {
      this.teardownMatch();
      if (act === 'next' && next) {
        if (this.firstRun || ms.id === 'c1m1' || ms.id === 'c1m2') { void this.startMatch('mission', this.venue, { mission: next.id }); return; }
        if (next.ch !== ms.ch) this.showMap(next.ch, () => this.openMission(next.id)); else this.openMission(next.id);
      }
      else if (act === 'again') { if (twin && !mr.ok) this.startTwin(ms.id); else this.retryMission(ms.id); }
      else if (act === 'skip' && next) { this.save.skip(ms.id); this.showMap(next.ch, () => this.openMission(next.id)); }
      else if (!this.save.data.firstRunDone) { void this.startMatch('mission', this.venue, { mission: ms.id }); }
      else this.showMap(ms.ch);   // a replayed 新手教学 ends on the map (showMap clears the flag)
    };
    const end = mr.ok && out.firstClear && ms.id === 'c5m7';
    // first run: c1m3 cleared → the lobby appears for the first time (spec §2.6)
    if (mr.ok && ms.id === 'c1m3' && (out.firstClear || this.tutorial) && act !== 'again') { this.endFirstRun(); return; }
    if (end && !shouldAutoSkip()) { void this.say('snake.story.end', { interrupt: true }); this.storyCardSkippable('end', () => this.drainCards(go)); return; }
    this.drainCards(go);
  }

  /** unlock cards one by one (name + fact read aloud), then `then` (spec §5.4) */
  drainCards(then?: () => void) {
    const q = this.save.data.cardQueue;
    if (this.cardBusy) return;
    const key = q.shift();
    if (!key) { this.save.save(); then?.(); return; }
    this.save.save();
    if (key.startsWith('trophy:')) { this.drainCards(then); return; }   // trophies have their own podium card
    this.cardBusy = true; play('unlock');
    this.shell?.session?.mark('unlock', { id: key });   // §8.12 field name
    const kind = key.startsWith('venue:') ? 'venue' : key.split(':')[0];
    const name = allItems().find((x) => x.key === key)?.item.name ?? (key.startsWith('venue:') ? VENUES[key.slice(6) as VenueId]?.name : '') ?? '';
    void this.say(`snake.unlock.${kind === 'crown' ? 'skin' : kind}`, { interrupt: true, vars: { name } });
    unlockCard(this.root, key, () => { this.cardBusy = false; this.drainCards(then); });
  }

  showCollection() {
    menuMusic(true);
    this.leaveLobby(); document.getElementById('sb-back')?.setAttribute('hidden', '');
    this.menu = collectionScreen(this.root, this.save, {
      onBack: () => this.showLobby(),
      onEquip: (key) => { const [k, id] = key.split(':'); if (k === 'skin') this.save.data.equipped.skin = id; if (k === 'trail') this.save.data.equipped.trail = id; this.save.save(); play('ui-confirm'); },
      onFact: (key) => { const id = key.split(':')[1] ?? key; void this.say(key === 'crown' ? 'snake.fact.crown' : key.startsWith('trail:') ? `snake.fact.trail.${id}` : `snake.fact.${id}`, { interrupt: true }); },
      onLocked: () => play('ui-locked', { volume: 0.6 }),
    });
  }
  showRecords() {
    menuMusic(true);
    this.leaveLobby(); document.getElementById('sb-back')?.setAttribute('hidden', '');
    this.menu = recordsScreen(this.root, this.save, () => this.showLobby());
  }
  /** first run (spec §2.6): straight into c1m1, no lobby, no S8, no 3-2-1; the sim waits for his first touch */
  /** first run: resumes at 1-2 / 1-3 if he left after clearing 1-1 / 1-2 (QA r1) */
  /** `replay`: 设置 → 新手教学 · 再玩一次 runs the same 1-1 → 1-3 sequence again (it ends in the lobby) */
  startFirstRun(replay = false) {
    if (replay) this.tutorial = true;
    // parent page 跳过开场和教学: straight to the lobby, exactly as if 跳过 had been tapped
    else if (shouldAutoSkip()) { this.endFirstRun(false); return; }
    const cur = this.save.currentMission();
    if (!replay && (cur === 'c1m2' || cur === 'c1m3')) { void this.startMatch('mission', 'moon', { mission: cur }); return; }
    void this.startMatch('mission', 'moon', { mission: 'c1m1', countdown: false, waitTouch: true });
  }
  /** 新手教学 replay in progress (the first-run voice, ghost hand and 1-1 → 1-3 chaining apply again) */
  tutorial = false;
  /** the first-run sequence is running: never finished yet, or replayed from 设置 */
  get firstRun() { return !this.save.data.firstRunDone || this.tutorial; }
  private skipOff: (() => void) | null = null;
  /** 跳过 over the first-run levels (Dad 2026-10-08): appears 1.5 s in, under the pause key; skipping = seen */
  private firstRunSkip() {
    this.skipOff?.();
    this.skipOff = mountSkipButton(document.body, () => { this.skipOff = null; this.endFirstRun(); }, { className: 'sb-skip' });
  }
  /** the first run is over — 1-3 cleared, 跳过 tapped, or the parent's 跳过开场和教学: the lobby opens with every mode
   * (all the sequence unlocks; 1-1 … 1-3 stay on the 挑战关 map and 设置 can replay the tutorial) (spec §2.6) */
  endFirstRun(voice = true) {
    this.skipOff?.(); this.skipOff = null;
    if (!this.save.data.firstRunDone) { this.save.data.firstRunDone = true; this.save.save(); }
    this.teardownMatch(); this.showLobby();
    if (voice) void this.say('snake.intro.done', { interrupt: true }); else void this.afterGate();
  }
}
