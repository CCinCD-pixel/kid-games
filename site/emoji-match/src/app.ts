/**
 * Screen router + top-level state machine (spec §8.4): GATE → [first run] PLAY(1-01) | ROUTE ⇄ MAP →
 * CARD → [INTRO] → PLAY → RESULT → MAP | CARD(next); ARRIVAL after an episode's first 10th-level win;
 * HANGAR / FREE from the route, PUZZLE from the map, PARENT (S12) from a long press on the route title.
 * Screens switch in-page; each screen's 「航线」/「地图」 button goes one level up (no reliance on the
 * iOS back gesture); history.pushState is mirrored.
 */
import type { AppCtx, ScreenReq } from './ctx';
import { ArrivalScreen } from './screens/arrival';
import { showLevelCard } from './screens/card';
import { HangarScreen } from './screens/hangar';
import { MapScreen } from './screens/map';
import { PlayScreen } from './screens/play';
import { RouteScreen } from './screens/route';

interface Screen { el: HTMLElement; mount(host: HTMLElement): void | Promise<void>; resize(): void; destroy(): void; pause?(): void; resume?(): void }

export class App {
  current: Screen | null = null;
  req: ScreenReq = { s: 'route' };
  private card: HTMLElement | null = null;
  constructor(private ctx: AppCtx) {
    ctx.go = (r) => this.go(r);
    window.addEventListener('popstate', (e) => { const r = e.state as ScreenReq | null; if (r && r.s !== 'play' && r.s !== 'puzzle' && r.s !== 'free' && r.s !== 'arrival') this.go(r, false); });
  }
  go(r: ScreenReq, push = true): void {
    this.card?.remove(); this.card = null;
    document.querySelectorAll('.em-card-scrim, .em-intro-scrim').forEach((el) => el.remove());
    if (r.s === 'card') {
      // the level card is a modal over the episode map
      const d = r.id.split('-')[0];
      if (!(this.current instanceof MapScreen)) this.show({ s: 'map', ep: Number(d) }, false);
      this.card = showLevelCard(this.ctx, r.id, r.back ?? 'map');
      if (push) history.pushState(r, '');
      return;
    }
    this.show(r, push);
  }
  private show(r: ScreenReq, push: boolean): void {
    this.current?.destroy();
    this.ctx.voice.stop();
    this.req = r;
    let s: Screen;
    switch (r.s) {
      case 'map': s = new MapScreen(this.ctx, r.ep); break;
      case 'play': { const p = new PlayScreen(this.ctx, r.id, { resume: r.resume }); this.ctx.play = p; s = p; break; }
      case 'puzzle': { const p = new PlayScreen(this.ctx, r.id, { mode: 'puzzle' }); this.ctx.play = p; s = p; break; }
      case 'free': { const p = new PlayScreen(this.ctx, 'free', { mode: 'free' }); this.ctx.play = p; s = p; break; }
      case 'hangar': s = new HangarScreen(this.ctx, r.tab); break;
      case 'arrival': s = new ArrivalScreen(this.ctx, r.ep); break;
      default: s = new RouteScreen(this.ctx);
    }
    if (r.s !== 'play' && r.s !== 'puzzle' && r.s !== 'free') this.ctx.play = null;
    this.current = s;
    this.ctx.root.dataset.screen = r.s;
    void s.mount(this.ctx.root);
    if (push) history.pushState(r, '');
  }
  resize(): void { this.current?.resize(); }
  pause(): void { this.current?.pause?.(); }
  resume(): void { this.current?.resume?.(); }
}
