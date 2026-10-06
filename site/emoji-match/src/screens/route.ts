/**
 * S1 route map (spec §2.4): nine destinations on an S-curve (portrait: bottom → top; landscape: left →
 * right), 星晶号 parked at the current stop with its installed modules and paints, 「继续 x-yy」 primary
 * button, 机库 (bottom left) and 自由星海 (bottom right, open after 1-10). Stops 5–9 are silhouettes
 * with a 建造中 sign (voice em.route.locked). Holding the title for 3 s opens the parent panel (S12).
 * Menu music plays here (spec §7.3).
 */
import { bindPress, icon, showResult } from '@kit/ui';
import { EPISODES, LEVELS, ROUTE } from '../content';
import type { AppCtx } from '../ctx';
import { planetSvg, type PlanetKey } from '../view/art/planets';
import { PAINTS, shipSvg, type ModuleKey } from '../view/art/ship';
import { backdrop } from '../view/backdrop';
import { play as sfx } from '../audio';
import { pendingArrival, totalStars } from './arrival';
import { constellationSvg, litBy } from '../view/art/skycard';
import { openParent } from './parent';

export function nextPlayable(app: AppCtx): string {
  const s = app.save.data;
  if (s.resume) return s.resume.id;
  const open = LEVELS.filter((d) => d.ep <= app.playableEpisodes && epUnlocked(app, d.ep));
  const firstUnwon = open.find((d) => (s.levels[d.id]?.stars ?? 0) === 0);
  return firstUnwon?.id ?? open[open.length - 1].id;
}
export function epUnlocked(app: AppCtx, ep: number): boolean {
  if (ep === 1) return true;
  return (app.save.data.levels[`${ep - 1}-10`]?.stars ?? 0) > 0;
}
export const freeUnlocked = (app: AppCtx): boolean => (app.save.data.levels['1-10']?.stars ?? 0) > 0;
/** modules on the ship = episodes whose 10th level is won, in their chosen paint */
export function installed(app: AppCtx): Partial<Record<ModuleKey, string>> {
  const out: Partial<Record<ModuleKey, string>> = {};
  for (const e of EPISODES) if ((app.save.data.levels[`${e.ep}-10`]?.stars ?? 0) > 0) out[e.module as ModuleKey] = app.save.data.cosmetics[e.module] ?? PAINTS[e.module as ModuleKey][0];
  return out;
}

export class RouteScreen {
  el: HTMLElement;
  private holdTimer = 0;
  constructor(private app: AppCtx) {
    this.el = document.createElement('div');
    this.el.className = 'em-screen em-route';
  }
  mount(host: HTMLElement): void {
    host.append(this.el);
    const pend = pendingArrival(this.app);
    if (pend) { this.app.go({ s: 'arrival', ep: pend }); return; }
    this.app.music(true);
    this.render();
    this.el.dataset.ready = '1';
    void this.revealSky();
  }
  /**
   * QA r2 (spec §4.7): constellation cards are revealed inside the arrival flow; once every v1 arrival has
   * played there is no next arrival, so gates crossed later (replaying for stars) are revealed here, with
   * the same card and em.sky line.
   */
  private async revealSky(): Promise<void> {
    const s = this.app.save.data;
    if (!s.arrivals.includes(this.app.playableEpisodes)) return;
    const seen = new Set(s.sky ?? []);
    for (const c of litBy(totalStars(this.app)).filter((x) => !seen.has(x.id))) {
      if (!this.el.isConnected) return;
      (s.sky ??= []).push(c.id); this.app.save.commit();
      sfx('unlock', { gain: 0.7 });
      void this.app.voice.say(c.line, { interrupt: true });
      let again = true;
      while (again && this.el.isConnected) {
        const act = await showResult({
          ribbon: `星图点亮：${c.name}`, text: this.app.voice.text(c.line), accentGame: 'match',
          actions: [{ id: 'again', label: '再听一遍', kind: 'secondary', icon: 'listen' }, { id: 'ok', label: '好的', kind: 'primary', icon: 'check' }],
          onOpen: (panel) => {
            panel.classList.add('em-has-text');
            const card = document.createElement('div');
            card.className = 'em-sky__card em-sky__card--route';
            card.innerHTML = constellationSvg(c, { animate: true });
            panel.querySelector('.xg-modal__text')?.before(card);
          },
        });
        again = act === 'again';
        if (again) void this.app.voice.say(c.line, { interrupt: true });
      }
    }
  }
  resize(): void { this.render(); }
  destroy(): void { window.clearTimeout(this.holdTimer); this.el.remove(); }
  private render(): void {
    const li = this.app.layout();
    const land = li.width > li.height;
    const next = nextPlayable(this.app);
    const allWon = LEVELS.every((d) => (this.app.save.data.levels[d.id]?.stars ?? 0) > 0);
    const curEp = allWon ? 4 : Number(next.split('-')[0]);
    const free = freeUnlocked(this.app);
    this.el.innerHTML = `<div class="em-bg">${backdrop('route', land)}</div>
      <div class="em-route__title"><span>星晶消消乐</span></div>
      <svg class="em-route__path" aria-hidden="true"></svg>
      <div class="em-route__stops"></div>
      <div class="em-route__ship">${shipSvg(installed(this.app))}</div>
      <div class="em-route__bar"><button class="xg-btn xg-btn--secondary em-route__hangar" data-sfx="ui-open">${icon('rocket')}<span>机库</span></button>
      <button class="xg-btn xg-btn--secondary em-route__free${free ? '' : ' is-locked'}" data-sfx="${free ? 'ui-open' : 'ui-locked'}">${free ? icon('star') : icon('lock')}<span>自由星海</span></button></div>
      <button class="xg-btn xg-btn--primary xg-btn--lg em-continue" data-sfx="ui-press">${icon('play')}<span>继续 <b class="xg-num">${next}</b></span></button>`;
    const W = li.width, H = li.height, T = li.safe.top, B = li.safe.bottom;
    // serpentine rows (stops never overlap; stop = 112×136 incl. label): portrait 3×3 bottom → top,
    // landscape 5 + 4; rows alternate direction, the middle of each row lifts a little (an arc)
    const rows = land ? [5, 4] : [3, 3, 3];
    const yBot = H - B - (land ? 236 : W < 600 ? 306 : 270), yTop = T + (land ? 290 : 230); // narrow: 继续 sits above 机库/自由星海
    const pts: { x: number; y: number; row: number }[] = [];
    rows.forEach((n, r) => {
      const y = rows.length === 1 ? yBot : yBot - (r * (yBot - yTop)) / (rows.length - 1);
      for (let j = 0; j < n; j += 1) {
        const f = land ? (j + (r % 2 ? 0.5 : 0)) / 4 : j / (n - 1);
        const fx = r % 2 ? 1 - f : f;
        const x = land ? W * 0.1 + fx * W * 0.8 : W * 0.19 + fx * W * 0.62;
        const lift = Math.sin(((j + (r % 2 && land ? 0.5 : 0)) / Math.max(1, n - 1)) * Math.PI) * (land ? 26 : 34);
        pts.push({ x, y: y - lift, row: r });
      }
    });
    const path = this.el.querySelector<SVGSVGElement>('.em-route__path')!;
    path.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let k = 1; k < pts.length; k += 1) {
      const a = pts[k - 1], b = pts[k];
      if (a.row === b.row) d += `C${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`;
      else { const out = a.x > W / 2 ? 110 : -110; d += `C${a.x + out} ${a.y} ${b.x + out} ${b.y} ${b.x} ${b.y}`; }
    }
    const doneIdx = Math.max(0, curEp - 1);
    path.innerHTML = `<path d="${d}" fill="none" stroke="rgba(207,216,255,.28)" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round"/>`;
    const stops = this.el.querySelector<HTMLElement>('.em-route__stops')!;
    ROUTE.forEach((r, k) => {
      const v1 = r.ep <= 4, open = v1 && r.ep <= this.app.playableEpisodes && epUnlocked(this.app, r.ep);
      const b = document.createElement('button');
      b.className = `em-stop${open ? '' : ' is-locked'}${r.ep === curEp ? ' is-current' : ''}${k <= doneIdx ? ' is-done' : ''}`;
      b.style.left = `${pts[k].x}px`; b.style.top = `${pts[k].y}px`;
      b.innerHTML = `${planetSvg(r.planet as PlanetKey, !open)}<span class="em-stop__name">${r.name}</span>${!v1 || !open ? `<span class="em-stop__sign">${v1 && !epUnlocked(this.app, r.ep) ? icon('lock') : '建造中'}</span>` : ''}`;
      b.addEventListener('click', () => {
        if (open) { sfx('ui-press'); void this.app.voice.say(`em.route.ep${r.ep}`); this.app.go({ s: 'map', ep: r.ep }); }
        else { sfx('ui-locked'); void this.app.voice.say('em.route.locked', { interrupt: true }); b.classList.remove('is-nudge'); void b.offsetWidth; b.classList.add('is-nudge'); }
      });
      stops.append(b);
    });
    const ship = this.el.querySelector<HTMLElement>('.em-route__ship')!;
    const p = pts[curEp - 1];
    const k0 = (q: { x: number }) => q.x < W * 0.2;
    // parked just above its stop (top row: just below, under the label)
    const top = p.row === rows.length - 1;
    // narrow windows (Split View / Slide Over): keep the parked ship inside the frame
    ship.style.left = `${Math.min(W - (land ? 104 : 130), Math.max(land ? 104 : 130, p.x + (land && k0(p) ? 46 : 0)))}px`;
    ship.style.top = `${p.y + (top ? 150 : -122)}px`;
    ship.classList.toggle('is-small', land);
    this.el.querySelector('.em-continue')!.addEventListener('click', () => this.app.go({ s: 'card', id: next, back: 'route' }));
    this.el.querySelector('.em-route__hangar')!.addEventListener('click', () => this.app.go({ s: 'hangar' }));
    this.el.querySelector('.em-route__free')!.addEventListener('click', (e) => {
      if (free) { this.app.go({ s: 'free' }); return; }
      const b = e.currentTarget as HTMLElement; b.classList.remove('is-nudge'); void b.offsetWidth; b.classList.add('is-nudge');
      void this.app.voice.say('em.route.locked', { interrupt: true });
    });
    // S12: hold the title 3 s → parent PIN (spec §2.1); a child's quick taps never open it
    const title = this.el.querySelector<HTMLElement>('.em-route__title span')!;
    const cancel = () => { window.clearTimeout(this.holdTimer); title.classList.remove('is-holding'); };
    title.addEventListener('pointerdown', () => { cancel(); title.classList.add('is-holding'); this.holdTimer = window.setTimeout(() => { cancel(); openParent(this.app); }, 3000); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) title.addEventListener(ev, cancel);
    bindPress(this.el);
  }
}
