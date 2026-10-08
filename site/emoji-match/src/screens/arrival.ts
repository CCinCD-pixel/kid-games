/**
 * S8 到站 (spec §5.4, §5.7, §6.10): after an episode's first 10th-level win —
 *   星晶号 flies in (2.4 s) → the module clicks on (0.8 s scan + lock-in) → 涂装二选一 → knowledge card
 *   (read aloud, 再听一遍) → tools earned (ep 2–4, idempotent grants) → newly lit constellations →
 *   [episode 4: the v1 ending — the ship parks in the belt, the shield lights up, the camera pulls back
 *   to the route with stops 5–9 "建造中"] → stop card (em.stop.1) + a 讲给爸爸听 card → 回航线图 only
 *   (never straight into the next episode). Every step waits for a tap; nothing is timed out.
 * 跳过 (kit, after 1.5 s) or the parent's 跳过开场和教学 switch: everything the sequence grants is kept
 * (tools, the module in its first paint — repaintable in the hangar —, lit constellations, the arrival
 * itself) and the child is back on the route; the cards stay in the hangar.
 */
import { bindPress, confetti, icon, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import { mount as mountCompanion, type Companion } from '@kit/companion';
import { EPISODES, LEVELS, ROUTE } from '../content';
import type { AppCtx } from '../ctx';
import { play as sfx } from '../audio';
import { grantFor } from '../save';
import { cardArt } from '../view/art/cards';
import { planetSvg, type PlanetKey } from '../view/art/planets';
import { MODULES, PAINT_NAMES, PAINTS, shipSvg, type ModuleKey } from '../view/art/ship';
import { constellationSvg, litBy } from '../view/art/skycard';
import type { SceneKey } from '../view/art/sky';
import { backdrop } from '../view/backdrop';
import { toolSvg, type ToolId } from '../view/art/tools';
import { installed } from './route';
import { routeGeom } from '../view/route-geom';


export function totalStars(app: AppCtx): number { return LEVELS.reduce((a, d) => a + (app.save.data.levels[d.id]?.stars ?? 0), 0); }

export class ArrivalScreen {
  el: HTMLElement;
  private alive = true;
  private bot: Companion | null = null;
  private skip: (() => void) | null = null;
  private unskip: (() => void) | null = null;
  private skipped = false;
  constructor(private app: AppCtx, private ep: number) {
    this.el = document.createElement('div');
    this.el.className = 'em-screen em-arrival';
  }
  async mount(host: HTMLElement): Promise<void> {
    host.append(this.el);
    this.app.music(true);
    this.render();
    this.el.dataset.ready = '1';
    if (shouldAutoSkip()) { this.skipAll(); return; }
    this.unskip = mountSkipButton(document.body, () => this.skipAll(), { theme: 'night', className: 'em-skip' });
    await this.sequence();
  }
  /** 跳过: settle every reward the sequence would give, then back to the route */
  private skipAll(): void {
    if (this.skipped || !this.alive) return;
    this.skipped = true;
    this.unskip?.(); this.unskip = null;
    const s = this.app.save.data, mod = this.module;
    grantFor(s, { k: 'arrival', ep: this.ep });
    if (!s.cosmetics[mod]) s.cosmetics[mod] = PAINTS[mod][0];
    for (const c of litBy(totalStars(this.app))) if (!(s.sky ??= []).includes(c.id)) s.sky.push(c.id);
    if (!s.arrivals.includes(this.ep)) s.arrivals.push(this.ep);
    this.app.save.commit();
    this.app.voice.stop();
    this.app.go({ s: 'route' });
  }
  resize(): void {
    const bg = this.el.querySelector<HTMLElement>('.em-bg'), land = this.land();
    if (bg && bg.dataset.land !== String(land)) { bg.innerHTML = backdrop(`ep${this.ep}` as SceneKey, land); bg.dataset.land = String(land); }
  }
  destroy(): void { this.alive = false; this.unskip?.(); this.unskip = null; this.bot?.destroy(); this.app.dockSub(null); this.el.remove(); }
  private land(): boolean { const l = this.app.layout(); return l.width > l.height; }
  private get module(): ModuleKey { return EPISODES.find((e) => e.ep === this.ep)!.module as ModuleKey; }
  private render(): void {
    const route = ROUTE.find((r) => r.ep === this.ep)!;
    const before = installed(this.app); delete before[this.module];
    this.el.innerHTML = `<div class="em-bg" data-land="${this.land()}">${backdrop(`ep${this.ep}` as SceneKey, this.land())}</div>
      <div class="em-arr__dest">${planetSvg(route.planet as PlanetKey)}<span>${route.name}</span></div>
      <div class="em-arr__ship">${shipSvg(before)}</div>
      <div class="em-arr__bot"></div>
      <div class="em-arr__panel"></div>
      <div class="em-arr__lane em-sub-lane"></div>`;
    this.el.addEventListener('pointerdown', () => this.skip?.());
    // every spoken line goes to the subtitle lane at the bottom (never a second copy in a bubble)
    this.app.dockSub(this.el.querySelector<HTMLElement>('.em-arr__lane'));
    this.bot = mountCompanion(this.el.querySelector<HTMLElement>('.em-arr__bot')!, { size: 104, bubble: 'right', mood: 'happy', sfx: (n: string) => sfx(n, { gain: 0.5 }) });
  }
  private wait(ms: number): Promise<void> {
    return new Promise((res) => { const t = window.setTimeout(() => { this.skip = null; res(); }, ms / Math.max(0.01, this.app.timeScale)); this.skip = () => { window.clearTimeout(t); this.skip = null; res(); }; });
  }
  /** the navigator speaks (subtitle lane + a hop; the lane is the only text copy) */
  private say(id: string): Promise<unknown> { this.bot?.react('hop'); return this.app.voice.say(id, { interrupt: true }); }
  /**
   * show a step panel; resolves with the id of the button pressed (`keep(act)` = handle it and stay).
   * `textCard`: the card prints its own line (knowledge, constellation, stop) and carries its own
   * 再听一遍 — the subtitle lane steps aside and the card may use the full height.
   */
  private panel(html: string, cls = '', keep: (act: string) => boolean = () => false, textCard = false): Promise<string> {
    const p = this.el.querySelector<HTMLElement>('.em-arr__panel')!;
    p.className = `em-arr__panel is-on ${cls}`;
    p.innerHTML = `<div class="xg-modal em-arr__card">${html}</div>`;
    this.el.classList.add('has-panel');
    this.el.classList.toggle('is-textcard', textCard);
    bindPress(p);
    return new Promise((res) => {
      p.addEventListener('click', function on(e) {
        const b = (e.target as Element).closest<HTMLElement>('[data-act]'); if (!b) return;
        if (keep(b.dataset.act!)) return;
        p.removeEventListener('click', on);
        res(b.dataset.act!);
      });
    });
  }
  private closePanel(): void {
    const p = this.el.querySelector<HTMLElement>('.em-arr__panel'); if (p) { p.classList.remove('is-on'); p.innerHTML = ''; }
    this.el.classList.remove('has-panel', 'is-textcard');
  }
  private again(): string { return `<button class="xg-btn xg-btn--secondary" data-act="again" data-sfx="ui-tap">${icon('listen')}<span>再听一遍</span></button>`; }
  private setShip(scan?: ModuleKey): void {
    const ship = this.el.querySelector<HTMLElement>('.em-arr__ship')!;
    ship.innerHTML = shipSvg(installed(this.app), { scan });
  }

  private async sequence(): Promise<void> {
    const s = this.app.save.data, ep = this.ep, mod = this.module;
    const e = EPISODES.find((x) => x.ep === ep)!;
    // grants first (idempotent), so a closed tab never loses them
    const gift = grantFor(s, { k: 'arrival', ep });
    const granted = gift !== null;
    this.app.save.commit();
    sfx('chapter-complete', { gain: 0.7 });
    // 1) fly in
    const ship = this.el.querySelector<HTMLElement>('.em-arr__ship')!;
    ship.classList.add('is-flying');
    await this.wait(2400);
    ship.classList.remove('is-flying'); ship.classList.add('is-parked');
    if (!this.alive) return;
    // 2) the module clicks on
    if (!s.cosmetics[mod]) s.cosmetics[mod] = PAINTS[mod][0];
    this.setShip(mod);
    sfx('lock-in');
    window.setTimeout(() => sfx('unlock', { gain: 0.6 }), 600);
    void this.say(`em.arrive.ep${ep}`);
    await this.wait(1400);
    if (!this.alive) return;
    // 3) paint: pick one of two (spec §5.4, review D29)
    void this.app.voice.say('em.pick.1', { interrupt: true });
    const pick = await this.panel(`<div class="xg-ribbon">${e.moduleName}</div><div class="em-paint">${PAINTS[mod].map((c, k) => `
        <button class="em-paint__card" data-act="${k}" style="--paint:${c}"><span class="em-paint__ship">${cropTo(mod, shipSvg({ ...installed(this.app), [mod]: c }))}</span><b>${PAINT_NAMES[mod][k]}</b></button>`).join('')}</div>`, 'is-paint');
    s.cosmetics[mod] = PAINTS[mod][Number(pick)];
    this.app.save.commit();
    sfx('ui-confirm'); this.setShip(mod);
    this.closePanel();
    await this.wait(500);
    if (!this.alive) return;
    // 4) knowledge card (read aloud; 再听一遍)
    const cardId = `em.card.${e.card}`;
    void this.app.voice.say(cardId, { interrupt: true });
    await this.panel(`<div class="xg-ribbon">太空知识卡</div><div class="em-kcard__art">${cardArt(e.card)}</div><p class="em-kcard__text">${this.app.voice.text(cardId)}</p>
      <div class="em-arr__actions">${this.again()}<button class="xg-btn xg-btn--primary xg-btn--lg" data-act="ok" data-sfx="ui-confirm">${icon('check')}<span>收好了</span></button></div>`, 'is-kcard',
    (a) => { if (a !== 'again') return false; void this.app.voice.say(cardId, { interrupt: true }); return true; }, true);
    this.closePanel();
    if (!this.alive) return;
    // 5) tools earned
    if (granted && gift) {
      void this.app.voice.say('em.booster.earn', { interrupt: true });
      await this.panel(`<div class="xg-ribbon">新工具</div><div class="em-earn">${(Object.entries(gift) as [ToolId, number][]).map(([t, k]) => `<span class="em-earn__tool"><span class="em-earn__icon">${toolSvg(t)}</span><b class="xg-num">+${k}</b></span>`).join('')}</div>
        <div class="em-arr__actions"><button class="xg-btn xg-btn--primary xg-btn--lg" data-act="ok" data-sfx="ui-confirm">${icon('check')}<span>好的</span></button></div>`, 'is-earn');
      this.closePanel();
    }
    // 6) constellations lit since the last time we showed one (stars are cumulative, spec §4.7)
    const seen = new Set(s.sky ?? []);
    for (const c of litBy(totalStars(this.app)).filter((x) => !seen.has(x.id))) {
      if (!this.alive) return;
      (s.sky ??= []).push(c.id); this.app.save.commit();
      sfx('unlock', { gain: 0.7 });
      void this.app.voice.say(c.line, { interrupt: true });
      await this.panel(`<div class="xg-ribbon">星图点亮：${c.name}</div><div class="em-sky__card">${constellationSvg(c, { animate: true })}</div><p class="em-kcard__text">${this.app.voice.text(c.line)}</p>
        <div class="em-arr__actions">${this.again()}<button class="xg-btn xg-btn--primary xg-btn--lg" data-act="ok" data-sfx="ui-confirm">${icon('check')}<span>好的</span></button></div>`, 'is-sky',
      (a) => { if (a !== 'again') return false; void this.app.voice.say(c.line, { interrupt: true }); return true; }, true);
      this.closePanel();
    }
    if (!s.arrivals.includes(ep)) s.arrivals.push(ep);
    this.app.save.commit();
    // 7) the v1 ending after the asteroid belt
    if (ep === 4) await this.ending();
    if (!this.alive) return;
    // 8) stop card + 讲给爸爸听 (rotating em.talk.1–4); only 回航线图
    const talk = `em.talk.${((s.talk ?? 0) % 4) + 1}`;
    s.talk = (s.talk ?? 0) + 1; this.app.save.commit();
    void this.say('em.stop.1').then(() => this.app.voice.say(talk));
    await this.panel(`<div class="xg-ribbon">到站啦</div><p class="em-stop__line">${this.app.voice.text('em.stop.1')}</p>
      <div class="em-talk">${icon('parent')}<p>${this.app.voice.text(talk)}</p></div>
      <div class="em-arr__actions">${this.again()}<button class="xg-btn xg-btn--primary xg-btn--lg" data-act="route" data-sfx="ui-back">${icon('map')}<span>回航线图</span></button></div>`, 'is-stop',
    (a) => { if (a !== 'again') return false; void this.app.voice.say('em.stop.1', { interrupt: true }).then(() => this.app.voice.say(talk)); return true; }, true);
    if (!this.alive) return;
    this.app.go({ s: 'route' });
  }
  /**
   * v1 ending (spec §5.4): shield glows, then the camera pulls back over the whole route (the S1 curve:
   * portrait bottom → top, landscape left → right) — the 4 finished stops sparkle, the ship sits at the
   * asteroid belt with its shield glowing, stops 5–9 are big 建造中 silhouettes; confetti, companion waves.
   */
  private async ending(): Promise<void> {
    this.el.classList.add('is-ending');
    sfx('jingle-magic', { gain: 0.6 }); window.setTimeout(() => sfx('bell', { gain: 0.5 }), 500);
    const ship = this.el.querySelector<HTMLElement>('.em-arr__ship')!;
    ship.classList.add('is-glow');
    await this.wait(1600);
    if (!this.alive) return;
    const li = this.app.layout();
    const land = li.width > li.height;
    // the S1 route itself (same serpentine as the route screen), in px of the full overlay; the camera
    // starts close on the parked ship and pulls back over the whole route (QA r2: big, not a diagram)
    const W = li.width, H = li.height;
    const { pts, path } = routeGeom(W, H, li.safe.top, li.safe.bottom, land, Math.min(W, H) < 600 ? {} : { bottom: land ? 300 : 210, top: land ? 170 : 200 });
    const here = Math.max(0, ROUTE.findIndex((r) => r.ep === 4));
    const strip = document.createElement('div');
    strip.className = 'em-ending';
    strip.style.setProperty('--ox', `${pts[here].x}px`); strip.style.setProperty('--oy', `${pts[here].y}px`);
    strip.innerHTML = `<div class="em-ending__cam">
      <svg class="em-ending__road" viewBox="0 0 ${W} ${H}"><path d="${path()}" class="is-all"/><path d="${path(here + 1)}" class="is-done"/></svg>
      ${ROUTE.map((r, k) => `<div class="em-ending__stop${r.ep > 4 ? ' is-future' : ' is-done'}" style="left:${pts[k].x}px;top:${pts[k].y}px;--i:${k}">
        ${r.ep <= 4 ? '<span class="em-ending__glow"></span>' : ''}${planetSvg(r.planet as PlanetKey, r.ep > 4)}<span class="em-ending__name">${r.name}</span>${r.ep > 4 ? '<i>建造中</i>' : ''}
        ${r.ep === 4 ? `<span class="em-ending__here">${shipSvg(installed(this.app))}</span>` : ''}</div>`).join('')}
      </div>`;
    this.el.append(strip);
    strip.querySelector('.em-ending__here')?.classList.add('is-glow');
    requestAnimationFrame(() => requestAnimationFrame(() => strip.classList.add('is-on')));
    this.bot?.setMood('celebrating');
    this.bot?.react('hop');
    window.setTimeout(() => { if (this.alive && !this.app.lessFx()) confetti(70); sfx('jingle-win', { gain: 0.45 }); }, 1500);
    window.setTimeout(() => { if (this.alive) this.bot?.react('wiggle'); }, 2600);
    void this.say('em.v1.end');
    await this.wait(6400);
    strip.remove();
    this.bot?.setMood('happy');
    this.el.classList.remove('is-ending');
  }
}

/** an episode whose 10th level is won but whose arrival never played (closed mid-way) */
export function pendingArrival(app: AppCtx): number | null {
  const s = app.save.data;
  for (const e of EPISODES) if ((s.levels[`${e.ep}-10`]?.stars ?? 0) > 0 && !s.arrivals.includes(e.ep)) return e.ep;
  return null;
}
export { MODULES };

/** QA r1: the paint cards show a close-up of the module being painted (the whole ship made 蓝焰 / 橙焰
 *  two tiny flame tips); same ship art, a tighter viewBox around the module */
const CROP: Record<ModuleKey, string> = { thrusters: '-40 44 132 96', legs: '40 96 186 136', arm: '120 92 110 80', shield: '168 36 116 116' };
function cropTo(mod: ModuleKey, svg: string): string {
  return svg.replace(/viewBox="[^"]*"/, `viewBox="${CROP[mod]}"`).replace('class="em-ship"', 'class="em-ship" preserveAspectRatio="xMidYMid slice"');
}
