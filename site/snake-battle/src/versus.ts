import { h } from '@kit/ui';
import { randomSeed } from '@kit/rng';
import { Match, type MatchEvent } from './match';
import { WorldView } from './render/view';
import type { Renderer } from './render/gl';
import { TouchRouter } from './input/touch-router';
import type { VenueId } from './sim/venues';
import { BoostLoop, eatSound, MatchPad, play, SND } from './audio';

type CachedView = { canvas: HTMLCanvasElement; renderer: Renderer };

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
  private pad = new MatchPad();
  private boostLoop = new BoostLoop();
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(host: HTMLElement, venue: VenueId, onAgain: () => void, private onLobby: () => void, music: boolean) {
    this.onAgain = onAgain;
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
      const boost = h('button', { class: 'sb-boost sb-versus__boost', type: 'button', 'aria-label': `${i + 1}号加速`, title: '按住加速' }, '⚡');
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
  }

  private onAgain: () => void;

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
    if (e.kind === 'countdown') this.clock.textContent = String(e.n);
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
    if (this.disposed || this.overlay || this.match.state === 'over') return;
    this.match.pause();
    for (const router of this.routers) router.reset();
    this.overlay = this.panel('暂停', '', [
      ['继续', () => { this.closePanel(); this.match.resume(true); this.wake(); }],
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
    this.overlay = this.panel(winner ? `${winner}号获胜！` : '平局！', `一号 长度 ${Math.floor(sa)} · 击败 ${a.stats.kills}　　二号 长度 ${Math.floor(sb)} · 击败 ${b.stats.kills}`, [
      ['再来一局', () => this.onAgain()], ['回大厅', () => this.onLobby()],
    ]);
  }

  private panel(title: string, detail: string, actions: [string, () => void][]) {
    const card = h('div', { class: 'sb-versus__modal' },
      h('div', { class: 'sb-versus__card' }, h('h2', {}, title), detail ? h('p', {}, detail) : null,
        h('div', { class: 'sb-versus__actions' }, ...actions.map(([label, fn]) => {
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
    this.root.remove(); this.closePanel();
  }
}
