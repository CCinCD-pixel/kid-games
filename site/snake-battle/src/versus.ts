import { h, icon } from '@kit/ui';
import { randomSeed } from '@kit/rng';
import { Match, type MatchEvent } from './match';
import { WorldView } from './render/view';
import type { Renderer } from './render/gl';
import { TouchRouter } from './input/touch-router';
import type { VenueId } from './sim/venues';
import { BoostLoop, eatSound, lineText, MatchPad, play, SND } from './audio';
import { versusIntro, type VersusIntro } from './versus-intro';

type CachedView = { canvas: HTMLCanvasElement; renderer: Renderer };
/** what the app lends the session: the voice (Voice.say), 'hush' (stop it + clear the subtitle), and the 玩法说明 once-flag */
export interface VersusHooks {
  say(id: string, o?: { interrupt?: boolean }): Promise<unknown>;
  hush(): void;
  introSeen(): boolean;
  markIntroSeen(): void;
  /** the parent's 跳过开场和教学 */
  autoSkip(): boolean;
}
const BOLT = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 4 11 27h11l-4 17 19-25H25z"/></svg>';

export class VersusSession {
  private static cache: CachedView[] = [];
  readonly match: Match;
  readonly views: WorldView[] = [];
  readonly routers: TouchRouter[] = [];
  readonly root: HTMLElement;
  private panes: HTMLElement[] = [];
  private scores: HTMLElement[] = [];
  private clock: HTMLElement;
  private overlay: HTMLElement | null = null;
  private intro: VersusIntro | null = null;
  private pad = new MatchPad();
  private boostLoop = new BoostLoop();
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(private host: HTMLElement, venue: VenueId, onAgain: () => void, private onLobby: () => void, music: boolean, private hooks?: VersusHooks) {
    this.onAgain = onAgain;
    document.body.classList.add('sb-vs');   // the subtitle sits above the clock instead of over the boost keys (styles.css)
    const m = new Match({ mode: 'timed', venue, seed: randomSeed(), name: '一号玩家', skin: 'venus', versus: true });
    this.match = m;
    this.root = h('section', { class: 'sb-versus', 'aria-label': '双人分屏对战' });
    const players = [m.me, m.other!];
    for (let i = 0; i < 2; i++) {
      const pane = h('div', { class: `sb-versus__pane sb-versus__pane--${i + 1}` });
      const canvas = VersusSession.cache[i]?.canvas ?? h('canvas', { class: 'sb-versus__world' }) as HTMLCanvasElement;
      pane.append(canvas);
      const view = new WorldView(canvas, m, { follow: players[i], renderer: VersusSession.cache[i]?.renderer, atlas: this.views[0]?.atlas });
      VersusSession.cache[i] = { canvas, renderer: view.R };
      view.R.quality = 0;
      view.R.onLost = () => this.pause();
      view.R.onRestored = () => { view.R.setAtlas(view.atlas); this.resize(); this.wake(); };
      this.views.push(view);
      const score = h('div', { class: 'sb-versus__score' });
      const boost = h('button', { class: 'sb-boost sb-versus__boost', type: 'button', 'aria-label': `${i + 1}号加速`, title: '按住加速' });
      boost.innerHTML = BOLT;   // the solo HUD's dark bolt (a text ⚡ glyph is an emoji: pale outline on the yellow disc)
      const stick = h('div', { class: 'sb-versus__stick', hidden: true });
      const noPause = h('div', { hidden: true });
      pane.append(score, boost, stick, noPause);
      this.panes.push(pane); this.scores.push(score);
      const router = new TouchRouter({
        surface: pane, boostEl: boost, pauseEl: noPause, stickEl: stick,
        headScreen: () => {
          if (!players[i].alive) return null;
          const [x, y] = view.worldToScreen(players[i].x, players[i].y);
          const rect = pane.getBoundingClientRect();
          return [x + rect.left, y + rect.top];
        },
        mode: () => 'follow', doubleTapBoost: () => false,
        onPause: () => this.pause(), onBoostLocked: () => play('ui-locked', { volume: 0.4 }),
        canBoost: () => players[i].mass >= 20, keyboard: false,
      });
      this.routers.push(router);
      this.root.append(pane);
    }
    m.world.onEat = (snake, food) => { for (const view of this.views) view.handleEat(snake, food); };
    this.clock = h('div', { class: 'sb-versus__clock', 'aria-live': 'off' });
    const pause = h('button', { class: 'sb-versus__pause', type: 'button', 'aria-label': '暂停', title: '暂停' }, 'Ⅱ');
    pause.addEventListener('click', () => this.pause());
    this.root.append(this.clock, pause);
    host.append(this.root);
    if (music) this.pad.start(venue === 'jupiter' || venue === 'blackhole' ? 'deep' : 'calm');
    m.onEvent = (e) => this.onEvent(e);
    this.resize();
    for (const view of this.views) view.zoom *= view.screenK;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    // first entry: the 怎么玩 card (six short rules) before the 3-2-1 (the match waits paused under it); the parent switch skips it
    if (hooks) {
      if (hooks.autoSkip()) hooks.markIntroSeen();
      else if (!hooks.introSeen()) { m.pause(); this.showIntro('start'); }
    }
  }

  private onAgain: () => void;

  /** 怎么玩: automatically once ('start': the match resumes through a fresh 3-2-1 when it closes) or from the pause card ('help') */
  showIntro(mode: 'start' | 'help') {
    if (!this.hooks || this.intro || this.disposed) return;
    const hooks = this.hooks;
    this.intro = versusIntro(this.host, {
      say: (id, o) => hooks.say(id, o), hush: () => hooks.hush(), doneLabel: mode === 'start' ? '开始比赛' : '知道了',
      onClose: () => {
        this.intro = null;
        if (this.disposed) return;
        hooks.markIntroSeen();
        if (mode === 'start') { for (const router of this.routers) router.reset(); this.match.resume(true); this.wake(); }
      },
    });
  }

  private say(id: string, o: { interrupt?: boolean } = {}) { return this.hooks ? this.hooks.say(id, o).catch(() => 'skipped') : Promise.resolve('skipped'); }

  resize() {
    if (this.disposed) return;
    for (let i = 0; i < 2; i++) {
      const r = this.panes[i].getBoundingClientRect();
      this.views[i].resize(r.width, r.height, Math.min(devicePixelRatio || 1, 1.25));
    }
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const m = this.match;
    for (const router of this.routers) router.tick();
    m.input.target = this.routers[0].target; m.input.boost = this.routers[0].boost;
    m.otherInput.target = this.routers[1].target; m.otherInput.boost = this.routers[1].boost;
    m.update(dt);
    if (this.disposed) return;
    this.boostLoop.set(m.state === 'playing' && (m.me.boost || !!m.other?.boost));
    for (const view of this.views) view.frame(dt);
    const players = [m.me, m.other!];
    for (let i = 0; i < 2; i++) {
      const s = players[i];
      const label = `${i + 1}号 · 长度 ${Math.floor(s.mass)} · 击败 ${s.stats.kills}${s.alive ? '' : ' · 重生中'}`;
      if (this.scores[i].textContent !== label) this.scores[i].textContent = label;
    }
    if (m.state === 'playing') {
      const left = Math.ceil(m.timeLeft);
      const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (this.clock.textContent !== label) this.clock.textContent = label;
    }
    if (m.state === 'over') { cancelAnimationFrame(this.raf); this.raf = 0; }
  };

  private wake() { if (this.raf || this.disposed) return; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }

  private onEvent(e: MatchEvent) {
    if (e.kind === 'countdown') {
      this.clock.textContent = String(e.n);
      if (e.n === 3) void this.say(this.match.world.t === 0 ? 'snake.match.go' : 'snake.match.resume', { interrupt: true });   // 三，二，一，出发！ / 准备，继续！
    }
    if (e.kind === 'last10') void this.say('snake.match.last10');
    if (e.kind === 'go') { this.clock.textContent = '出发'; play('launch', { volume: 0.5 }); }
    if (e.kind === 'sim' && e.e.type === 'eat' && (e.e.id === this.match.me.id || e.e.id === this.match.other?.id)) eatSound(e.e.kind === 'big');
    if (e.kind === 'sim' && e.e.type === 'kill') {
      const victim = this.match.world.byId.get(e.e.victim);
      if (e.e.killer === this.match.me.id || e.e.killer === this.match.other?.id) SND.kill();
      if (victim) for (const view of this.views) if (view.onScreen(victim.x, victim.y, 200)) view.ghost(victim);
    }
    if (e.kind === 'over') this.result();
  }

  pause() {
    if (this.disposed || this.overlay || this.intro || this.match.state === 'over') return;
    this.match.pause();
    for (const router of this.routers) router.reset();
    this.overlay = this.panel('暂停', [], [
      ['继续', () => { this.closePanel(); this.match.resume(true); this.wake(); }],
      ...(this.hooks ? [['玩法说明', () => this.showIntro('help')] as [string, () => void]] : []),
      ['重新开始', () => this.onAgain()],
      ['回大厅', () => this.onLobby()],
    ]);
  }

  private result() {
    this.pad.stop(); this.boostLoop.set(false);
    const a = this.match.me, b = this.match.other!;
    const score = (s: typeof a) => s.alive ? s.mass : (this.match.world.respawnQueue.find((q) => q.s === s)?.mass ?? 0);
    const sa = score(a), sb = score(b);
    const winner = sa === sb ? (a.stats.kills === b.stats.kills ? 0 : a.stats.kills > b.stats.kills ? 1 : 2) : sa > sb ? 1 : 2;
    const verdict = winner === 1 ? 'snake.vs.win.1' : winner === 2 ? 'snake.vs.win.2' : 'snake.vs.draw';
    const show = () => {
      if (this.disposed || this.overlay) return;
      this.overlay = this.panel(winner ? `${winner}号获胜！` : '平局！', [`1号 长度 ${Math.floor(sa)} · 击败 ${a.stats.kills}`, `2号 长度 ${Math.floor(sb)} · 击败 ${b.stats.kills}`], [
        ['再来一局', () => this.onAgain()], ['回大厅', () => this.onLobby()],
      ], verdict);
      void this.say(verdict, { interrupt: true });
    };
    // 比赛结束！ (the kit bar above the clock shows it over the frozen arena), then the card with the verdict line; a stalled
    // voice never holds the card back
    if (!this.hooks) { show(); return; }
    let shown = false; const once = () => { if (shown) return; shown = true; show(); };
    void this.say('snake.match.end', { interrupt: true }).then(once, once);
    window.setTimeout(once, 2600);
  }

  /** `say`: the verdict line, shown as the card's subtitle with its own 再听一遍 */
  private panel(title: string, detail: string[], actions: [string, () => void][], say?: string) {
    const replay = say ? h('button', { class: 'xg-btn xg-btn--secondary sb-versus__replay', type: 'button', 'aria-label': '再听一遍' }) : null;
    if (replay) { replay.innerHTML = `${icon('listen')}<span>再听一遍</span>`; replay.addEventListener('click', () => void this.say(say!, { interrupt: true })); }
    const card = h('div', { class: 'sb-versus__modal' },
      h('div', { class: 'sb-versus__card' }, h('h2', {}, title), detail.length ? h('p', {}, ...detail.map((d) => h('span', {}, d))) : null,   // one span per player: never wraps mid-score
        say ? h('p', { class: 'sb-versus__say', 'data-line': say }, lineText(say)) : null,
        h('div', { class: 'sb-versus__actions' }, ...(replay ? [replay] : []), ...actions.map(([label, fn]) => {
          const b = h('button', { class: 'xg-btn', type: 'button' }, label); b.addEventListener('click', fn); return b;
        }))));
    this.root.append(card); return card;
  }

  private closePanel() { this.overlay?.remove(); this.overlay = null; }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf); this.raf = 0;
    for (const router of this.routers) router.dispose();
    for (const view of this.views) { view.R.onLost = null; view.R.onRestored = null; }
    this.pad.stop(); this.boostLoop.set(false);
    this.match.world.onEat = null;
    this.intro?.close('skip'); this.intro = null;   // (onClose sees `disposed`: no resume)
    this.hooks?.hush();
    document.body.classList.remove('sb-vs');
    this.root.remove(); this.closePanel();
  }
}
