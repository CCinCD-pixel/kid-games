/**
 * 学堂 布阵题 L7-1–L7-4 (spec §2.5b, §4.1 `deploy`): the enlarged own half with a template layout,
 * some slots left empty, the pieces to place in a tray. A placement is accepted only if the rest can
 * still be placed legally (completability, core/layout `placementVerdict`); a refused piece goes back
 * to the tray and the guide says the most relevant reason (`mc.why.deploy.flag/mine/bomb/keep`). A
 * piece just placed can be tapped back to the tray (`mc.dep.back`, once). Hints: H1 the acceptable
 * blanks glow, H2 one piece is placed for him, H3 everything is placed and he swaps any two pieces
 * (still legal) to finish — max 2★.
 */
import { ghostDrag, icon, setHintReady, shouldAutoSkip } from '@kit/ui';
import type { App } from '../app';
import { SLOTS } from '../core/board';
import { placementRule, placementVerdict, slotOf, swapSlots, validateLayout } from '../core/layout';
import { NAMES, typeFromCode } from '../core/pieces';
import { deployStars } from '../core/progress';
import { praiseLine } from '../core/praise';
import { TEMPLATES, type DeployItem } from '../content';
import { EASE, MS, d, dm } from '../view/anim';
import type { Pt, Rect } from '../view/layout';
import { TILE, tileSvg } from '../view/pieces-svg';
import { BaseScreen, IntroSkip, abs, button, demoSeen, div, markDemo, pillRoom } from './base';
import { deployBoardGeom, halfBoardSvg, K, type DeployGeom } from './deploy';
import { afterItem, bookItem, flyStars, goalBarHtml } from './item-common';

export class DeployItemScreen extends BaseScreen {
  readonly name = 'deploy-item';
  private base: string[];
  private idxs: number[];
  /** blank slot → code placed there */
  private filled = new Map<number, string>();
  /** tray codes ('' = taken) */
  private tray: string[];
  private picked = -1;
  private refused = 0;
  private backTipSaid = false;
  private hintLevel: 0 | 1 | 2 | 3 = 0;
  private usedH3 = false;
  /** H3: everything placed, he swaps any two pieces to finish */
  private swapStage = false;
  private swapPick = -1;
  private finished = false;
  private busy = 0;
  private goalEl!: HTMLDivElement;
  private boardEl!: HTMLDivElement;
  private hintBtn!: HTMLButtonElement;
  private glow = new Set<number>();
  private idleTimer = 0;
  private introDone = false;

  constructor(app: App, private item: DeployItem) {
    super(app);
    const tpl = TEMPLATES.find((t) => t.id === item.template) ?? TEMPLATES[0];
    this.base = tpl.layout.split('');
    this.idxs = item.blanks.map(([r, c]) => slotOf(r, c));
    this.tray = item.place.slice();
    this.bag.timeout(() => void this.intro(), 320);
  }

  back(): boolean {
    this.app.go({ name: 'academy', lesson: 'L7' });
    return true;
  }

  private geom(): DeployGeom {
    const portrait = this.o === 'portrait';
    const g = deployBoardGeom(portrait, this.safeTop);
    // the item board sits right under the goal bar (no formation bar)
    return portrait ? { ...g, y: this.safeTop + 96 } : g;
  }

  private layoutNow(): string {
    const b = this.base.slice();
    for (const k of this.idxs) b[k] = this.filled.get(k) ?? '.';
    return b.join('');
  }

  private trayRect(): Rect {
    const g = this.geom();
    return this.o === 'portrait' ? { x: 24, y: g.y + g.h + 14, w: 762, h: 132 } : { x: 720, y: this.safeTop + 150, w: 348, h: 300 };
  }

  private trayXY(i: number): Pt {
    const r = this.trayRect();
    const n = this.item.place.length;
    if (this.o === 'portrait') {
      const pitch = Math.min(126, (r.w - 24) / n);
      return { x: r.x + r.w / 2 + (i - (n - 1) / 2) * pitch, y: r.y + r.h / 2 };
    }
    const cols = 3, rows = Math.ceil(n / cols);
    const c = i % cols, rr = Math.floor(i / cols);
    return { x: r.x + r.w / 2 + (c - 1) * 112, y: r.y + r.h / 2 + (rr - (rows - 1) / 2) * 140 };
  }

  readonly phoneReady = true;
  /** phones: the board + tray are drawn at the iPad geometry inside this container, which is scaled */
  private body: HTMLElement = this.el;
  private nextSlot: Rect | null = null;

  /** phones (Dad, 2026-10-08): goal bar, scaled board + tray, guide + caption + 💡 around them */
  private phoneFrame(gh: HTMLElement): void {
    const W = this.W, H = this.H, tb = this.app.topBand, sr = this.app.safeR, portrait = this.o === 'portrait';
    const g = this.geom(), t = this.trayRect();
    const rx = Math.min(g.x, t.x), ry = Math.min(g.y, t.y);
    const rw = Math.max(g.x + g.w, t.x + t.w) - rx, rh = Math.max(g.y + g.h, t.y + t.h) - ry;
    let k: number, x: number, y: number;
    this.goalEl.classList.remove('is-col');
    this.goalEl.classList.add('is-phone');
    if (portrait) {
      abs(this.goalEl, { x: tb, y: 4, w: W - tb - 6, h: tb - 10 });
      this.goalEl.style.setProperty('--gw-pill', `${W - tb - pillRoom(this.app)}px`);
      k = Math.min((W - 8) / rw, (H - tb - 6 - 84) / rh);
      x = (W - rw * k) / 2;
      y = tb + Math.max(0, (H - tb - 6 - 84 - rh * k) / 2);
      abs(this.hintBtn, { x: W - 6 - sr - 54, y: H - 6 - 54, w: 54, h: 54 });
      this.nextSlot = { x: 70, y: H - 6 - 58, w: W - 76, h: 58 };
      this.el.append(this.hintBtn);
      this.phoneFoot({ mood: 'happy', right: 54 + 8 });
    } else {
      // landscape: board + tray left, a column right for the guide, the caption and 💡
      const x0 = this.phoneCol + 4, colW = 220;
      abs(this.goalEl, { x: x0, y: 4, w: W - x0 - 6 - sr, h: 56 });
      this.goalEl.style.setProperty('--gw-pill', `${W - x0 - sr - pillRoom(this.app)}px`);
      k = Math.min((W - x0 - 6 - sr - colW - 8) / rw, (H - 66 - 6) / rh);
      x = x0;
      y = 66;
      const cx = x0 + rw * k + 8, cw = W - sr - 6 - cx;
      abs(gh, { x: cx, y: 70, w: 62, h: 62 });
      abs(this.hintBtn, { x: cx + cw - 54, y: H - 6 - 54, w: 54, h: 54 });
      this.phoneCaption(cx, 6 + 54 + 8);
      this.nextSlot = { x: cx, y: H - 6 - 58, w: cw, h: 58 };
      this.el.append(gh, this.caption.el, this.hintBtn);
      this.placeGuide(gh, 58, { mood: 'happy', variant: 'head' });
    }
    const dw = portrait ? 810 : 1080, dh = portrait ? 1080 : 810;
    Object.assign(this.body.style, { position: 'absolute', left: '0', top: '0', width: `${dw}px`, height: `${dh}px`, transformOrigin: '0 0', transform: `translate(${x - rx * k}px, ${y - ry * k}px) scale(${k})`, pointerEvents: 'none' });
  }

  protected render(): void {
    const portrait = this.o === 'portrait', st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-deploy-item');
    this.body = this.el;
    if (this.phone) {
      this.body = div('mc-dbody');
      this.el.appendChild(this.body);
    }
    // goal bar
    this.goalEl = div('mc-goal');
    this.goalEl.dataset.testid = 'goal-bar';
    this.goalEl.innerHTML = goalBarHtml(this.app, { cur: this.item.id, ico: 'shield', text: this.app.voice.text(`mc.i.${this.item.id}`), twin: this.usedH3 });
    this.goalEl.addEventListener('click', () => void this.say(`mc.i.${this.item.id}`));
    abs(this.goalEl, portrait ? { x: 84, y: st + 6, w: 642, h: 80 } : { x: 720, y: st + 6, w: 348, h: 130 });
    if (portrait && !this.phone) {
      this.goalEl.classList.add('is-pillable');
      this.goalEl.style.setProperty('--gw-pill', `${810 - 84 - pillRoom(this.app)}px`);
    }
    if (!portrait) this.goalEl.classList.add('is-col');
    this.el.appendChild(this.goalEl);

    // board
    const g = this.geom();
    this.boardEl = div('mc-dboard');
    this.boardEl.dataset.testid = 'deploy-board';
    abs(this.boardEl, { x: g.x, y: g.y, w: g.w, h: g.h });
    this.boardEl.innerHTML = halfBoardSvg(portrait, g.w, g.h, 0);
    this.body.appendChild(this.boardEl);
    const lay = this.layoutNow();
    const t = TILE[portrait ? 'wide' : 'tall'];
    for (let k = 0; k < 25; k++) {
      const p = g.cx(k);
      const code = lay[k];
      const blank = this.idxs.includes(k);
      if (code === '.') {
        const b = div(`mc-dblank${this.glow.has(k) ? ' is-glow' : ''}${this.picked >= 0 ? ' is-armed' : ''}`);
        b.dataset.slot = String(k);
        b.dataset.testid = `blank-${k}`;
        abs(b, { x: p.x - (t.w * K) / 2 - 4, y: p.y - (t.h * K) / 2 - 4, w: t.w * K + 8, h: t.h * K + 8 });
        b.addEventListener('click', () => this.tapBlank(k));
        this.boardEl.appendChild(b);
        continue;
      }
      const el = div(`mc-piece mc-dpiece${blank ? ' is-placed' : ''}${this.swapPick === k ? ' is-lifted' : ''}`);
      el.innerHTML = tileSvg({ side: 0, type: typeFromCode(code), shape: portrait ? 'wide' : 'tall', face: 'up' }) + '<i class="mc-sel"></i>';
      el.dataset.slot = String(k);
      el.dataset.code = code;
      const w = (t.w + 12) * K, h = (t.h + 12) * K;
      el.style.transform = `translate3d(${p.x - w / 2}px, ${p.y - h / 2}px, 0)`;
      const svg = el.firstElementChild as SVGElement;
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      el.style.pointerEvents = 'auto';
      el.addEventListener('click', () => this.tapBoardPiece(k));
      this.boardEl.appendChild(el);
    }

    // tray
    const trayBox = div('mc-tray');
    abs(trayBox, this.trayRect());
    this.body.appendChild(trayBox);
    this.tray.forEach((code, i) => {
      if (!code) return;
      const p = this.trayXY(i);
      const w = (t.w + 12) * K, h = (t.h + 12) * K;
      const el = div(`mc-ttile${this.picked === i ? ' is-lifted' : ''}`, tileSvg({ side: 0, type: typeFromCode(code), shape: portrait ? 'wide' : 'tall', face: 'up' }));
      el.dataset.testid = `tray-${i}`;
      el.dataset.code = code;
      abs(el, { x: p.x - w / 2, y: p.y - h / 2, w, h });
      const svg = el.firstElementChild as SVGElement;
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      this.bindTrayDrag(el, i);
      this.body.appendChild(el);
    });

    // guide, caption, hint
    const gh = div('');
    this.hintBtn = button('xg-iconbtn mc-hint-btn', icon('hint'), () => void this.onHint(), 'hint');
    if (this.phone) {
      this.phoneFrame(gh);
      if (this.finished) this.hintBtn.style.visibility = 'hidden';
      return;
    }
    if (portrait) {
      abs(gh, { x: 20, y: 1080 - 16 - 140, w: 120, h: 140 });
      abs(this.caption.el, { x: 150, y: 1080 - 16 - 96, w: 548, h: 84 });
      abs(this.hintBtn, { x: 810 - 24 - 72, y: 1080 - 16 - 90, w: 72, h: 72 });
    } else {
      abs(gh, { x: 724, y: 810 - 16 - 250, w: 96, h: 116 });
      abs(this.caption.el, { x: 720, y: 810 - 16 - 126, w: 348, h: 110 });
      this.caption.el.classList.add('is-tall');
      abs(this.hintBtn, { x: 1080 - 16 - 72, y: 810 - 16 - 250, w: 72, h: 72 });
    }
    this.el.append(gh, this.caption.el, this.hintBtn);
    this.placeGuide(gh, portrait ? 112 : 92, { mood: 'happy' });
    if (this.finished) this.hintBtn.style.visibility = 'hidden';
  }

  // ------------------------------------------------------------------ input
  private bindTrayDrag(el: HTMLDivElement, i: number): void {
    let start: { x: number; y: number; id: number } | null = null;
    let moved = false;
    // screen px per design unit (phones: the scaled board container)
    const k0 = (): number => this.body.getBoundingClientRect().width / (this.body === this.el ? this.W : this.o === 'portrait' ? 810 : 1080) || 1;
    el.addEventListener('pointerdown', (ev) => {
      if (this.busy || this.finished || this.swapStage) return;
      start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
      moved = false;
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* synthetic */
      }
    });
    el.addEventListener('pointermove', (ev) => {
      if (!start || start.id !== ev.pointerId) return;
      const dx = (ev.clientX - start.x) / k0(), dy = (ev.clientY - start.y) / k0();
      if (!moved && Math.hypot(dx, dy) > 10) {
        moved = true;
        this.picked = i;
        el.classList.add('is-dragging');
        this.app.play('ui-pick');
      }
      if (moved) el.style.translate = `${dx}px ${dy}px`;
    });
    const end = (ev: PointerEvent): void => {
      if (!start || start.id !== ev.pointerId) return;
      start = null;
      if (!moved) {
        this.tapTray(i);
        return;
      }
      el.classList.remove('is-dragging');
      el.style.translate = '';
      const k = this.blankAtClient(ev.clientX, ev.clientY);
      if (k >= 0) void this.tryPlace(i, k);
      else {
        this.picked = -1;
        this.render();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => {
      start = null;
      el.classList.remove('is-dragging');
      el.style.translate = '';
    });
  }

  private blankAtClient(cx: number, cy: number): number {
    let best = -1, bd = Infinity;
    this.boardEl.querySelectorAll<HTMLElement>('.mc-dblank').forEach((b) => {
      const r = b.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      if (Math.abs(dx) > r.width || Math.abs(dy) > r.height) return;
      const dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = Number(b.dataset.slot);
      }
    });
    return best;
  }

  private tapTray(i: number): void {
    if (this.busy || this.finished || this.swapStage) return;
    const code = this.tray[i];
    if (!code) return;
    if (this.picked === i) {
      this.picked = -1;
      this.app.play('ui-tap');
    } else {
      this.picked = i;
      this.app.play('ui-pick');
      void this.say(`mc.w.${NAMES[typeFromCode(code)]}`);
    }
    this.glow.clear();
    this.render();
    this.armIdle();
  }

  private tapBlank(k: number): void {
    if (this.busy || this.finished) return;
    if (this.picked < 0) {
      // nothing in hand: the tray pieces nod to say "pick one of us first"
      this.app.play('ui-tap');
      this.el.querySelectorAll<HTMLElement>('.mc-ttile').forEach((el, n) => el.animate([{ translate: '0 0' }, { translate: '0 -8px' }, { translate: '0 0' }], { duration: d(260), delay: d(n * 40) }));
      return;
    }
    void this.tryPlace(this.picked, k);
  }

  /** a piece on the board: placed by him → back to the tray; template piece → its name (H3 stage: swap) */
  private tapBoardPiece(k: number): void {
    if (this.busy || this.finished) return;
    if (this.swapStage) return this.swapTap(k);
    if (this.filled.has(k)) {
      const code = this.filled.get(k)!;
      this.filled.delete(k);
      this.tray[this.tray.findIndex((x) => !x)] = code;
      this.app.play('ui-slide');
      this.glow.clear();
      this.render();
      this.armIdle();
      return;
    }
    const code = this.layoutNow()[k];
    if (code && code !== '.') void this.say(`mc.w.${NAMES[typeFromCode(code)]}`);
  }

  private async tryPlace(i: number, k: number): Promise<void> {
    const code = this.tray[i];
    if (!code || this.filled.has(k) || !this.idxs.includes(k)) return;
    this.busy++;
    clearTimeout(this.idleTimer);
    const rest = this.tray.filter((x) => x);
    const why = placementVerdict(this.base, this.idxs, this.filled, rest, code, k);
    this.picked = -1;
    this.glow.clear();
    if (why) {
      this.refused++;
      this.app.play('bump');
      this.render();
      // the tile shakes in the tray (it never stayed on the board)
      const el = this.el.querySelector<HTMLElement>(`[data-testid="tray-${i}"]`);
      el?.animate([{ translate: '0 0' }, { translate: '-8px 0' }, { translate: '8px 0' }, { translate: '-5px 0' }, { translate: '0 0' }], { duration: dm(320) });
      this.boardEl.querySelector<HTMLElement>(`.mc-dblank[data-slot="${k}"]`)?.animate([{ background: 'rgba(228,81,61,.35)' }, { background: 'rgba(228,81,61,0)' }], { duration: d(600) });
      this.app.mark('deploy-refused', { id: this.item.id, code, slot: k, why });
      // input stays free while the guide explains
      this.busy--;
      const tip = !this.backTipSaid && this.filled.size > 0;
      if (tip) this.backTipSaid = true;
      void this.say(`mc.why.deploy.${why}`, 'encouraging').then((r) => {
        if (tip && r === 'done') void this.say('mc.dep.back', 'happy');
      });
      if (this.refused >= 2) setHintReady(this.hintBtn, true);
      this.armIdle();
      return;
    }
    this.tray[i] = '';
    this.filled.set(k, code);
    this.app.play('place-piece');
    this.render();
    const el = this.boardEl.querySelector<HTMLElement>(`.mc-dpiece[data-slot="${k}"]`);
    el?.animate([{ scale: '1.18' }, { scale: '1' }], { duration: d(MS.drop + 60), easing: EASE.back });
    this.busy--;
    if (this.filled.size === this.idxs.length) this.complete();
    else this.armIdle();
  }

  private complete(): void {
    if (validateLayout(this.layoutNow()).length) return; // cannot happen: every placement kept it completable
    if (this.usedH3) {
      // H3: he still has to make one legal swap himself
      this.swapStage = true;
      void this.say('mc.dep.swap', 'happy');
      this.render();
      return;
    }
    void this.done();
  }

  private swapTap(k: number): void {
    if (this.swapPick < 0) {
      this.swapPick = k;
      this.app.play('ui-pick');
      this.render();
      return;
    }
    if (this.swapPick === k) {
      this.swapPick = -1;
      this.render();
      return;
    }
    const a = this.swapPick, lay = this.layoutNow();
    this.swapPick = -1;
    const rule = placementRule(lay[a], k) ?? placementRule(lay[k], a);
    if (rule) {
      this.app.play('bump');
      this.render();
      void this.say(`mc.why.deploy.${rule}`, 'encouraging');
      return;
    }
    const next = swapSlots(lay, a, k);
    // the swapped layout becomes the new base (blanks keep what they hold)
    this.base = next.split('');
    for (const b of this.idxs) this.filled.set(b, this.base[b]);
    this.app.play('ui-slide');
    this.render();
    this.swapStage = false;
    void this.done();
  }

  // ------------------------------------------------------------------ intro, hints
  private async intro(): Promise<void> {
    let ghost = !!this.item.ghost && !this.app.save.items[this.item.id] && !demoSeen(this.app, this.item.id);
    // the parent's 跳过开场和教学: no demo (as if 跳过 had been tapped)
    if (ghost && shouldAutoSkip()) {
      markDemo(this.app, this.item.id);
      ghost = false;
    }
    if (ghost) {
      markDemo(this.app, this.item.id);
      // the first touch takes over from the demo (QA r1: intro demos swallowed taps)
      const gate = new IntroSkip(this.el, () => {
        this.app.voice.stop();
        this.app.mark('intro-skip', { id: this.item.id });
        this.guide?.react('nod');
      });
      this.busy++;
      try {
        if (await gate.step(this.say(`mc.i.${this.item.id}`))) await this.ghost(gate);
      } finally {
        this.busy = Math.max(0, this.busy - 1);
        gate.end();
      }
    } else if (this.item.id === 'L7-2') {
      // the first practice after the intro: H1 lights by itself after 5 s without a touch (§4.1)
      this.bag.timeout(() => {
        if (!this.filled.size && this.hintLevel === 0 && this.picked < 0 && !this.finished) void this.onHint();
      }, 5000);
    }
    this.introDone = true;
    this.armIdle();
  }

  /** L7-1: the ghost hand puts the first piece where it belongs ("我做"), he does the rest */
  private async ghost(gate: IntroSkip): Promise<void> {
    const i = 0;
    const code = this.tray[i];
    const rest = this.tray.filter((x) => x);
    const k = this.idxs.find((b) => !this.filled.has(b) && placementVerdict(this.base, this.idxs, this.filled, rest, code, b) === null);
    if (k === undefined) return;
    const from = this.el.querySelector(`[data-testid="tray-${i}"]`);
    const to = this.boardEl.querySelector(`.mc-dblank[data-slot="${k}"]`);
    if (from && to && !(await gate.step(ghostDrag(from, to)))) return;
    this.busy--;
    try {
      await this.tryPlace(i, k);
    } finally {
      this.busy++;
    }
  }

  private armIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.finished) return;
    setHintReady(this.hintBtn, this.refused >= 2);
    this.idleTimer = this.bag.timeout(() => {
      if (this.finished) return;
      setHintReady(this.hintBtn, true);
      const r = this.boardEl.getBoundingClientRect();
      this.guide?.bot.lookAt(r.left + r.width / 2, r.top + r.height / 2);
    }, 30000);
  }

  private acceptable(i: number): number[] {
    const code = this.tray[i];
    const rest = this.tray.filter((x) => x);
    return this.idxs.filter((b) => !this.filled.has(b) && placementVerdict(this.base, this.idxs, this.filled, rest, code, b) === null);
  }

  private async onHint(): Promise<void> {
    if (this.busy || this.finished || this.swapStage) return;
    this.app.play('hint');
    setHintReady(this.hintBtn, false);
    const level = Math.min(3, this.hintLevel + 1) as 1 | 2 | 3;
    this.hintLevel = level;
    this.app.mark('hint', { id: this.item.id, level });
    const i = this.picked >= 0 ? this.picked : this.tray.findIndex((x) => x);
    if (i < 0) return;
    if (level === 1) {
      // the slots the chosen piece may go to glow
      this.picked = i;
      this.glow = new Set(this.acceptable(i));
      this.render();
      void this.say(`mc.w.${NAMES[typeFromCode(this.tray[i])]}`, 'thinking');
      return;
    }
    if (level === 2) {
      const k = this.acceptable(i)[0];
      if (k === undefined) return;
      void this.say('mc.hint.piece', 'thinking');
      const from = this.el.querySelector(`[data-testid="tray-${i}"]`);
      const to = this.boardEl.querySelector(`.mc-dblank[data-slot="${k}"]`);
      this.busy++;
      if (from && to) await ghostDrag(from, to);
      this.busy--;
      await this.tryPlace(i, k);
      return;
    }
    // H3: everything placed for him, then one swap of his own
    this.usedH3 = true;
    void this.say('mc.hint.show', 'happy');
    this.busy++;
    while (this.filled.size < this.idxs.length) {
      const j = this.tray.findIndex((x) => x);
      const k = this.acceptable(j)[0];
      if (j < 0 || k === undefined) break;
      const code = this.tray[j];
      this.tray[j] = '';
      this.filled.set(k, code);
      this.app.play('place-piece');
      this.render();
      await this.bag.wait(d(260));
    }
    this.busy--;
    this.complete();
  }

  // ------------------------------------------------------------------ done
  private async done(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.idleTimer);
    const stars = deployStars(this.refused, this.usedH3);
    const info = bookItem(this.app, this.item.id, stars, { hintMax: this.hintLevel, extra: { refused: this.refused } });
    this.render();
    this.app.play('correct-big');
    flyStars(this.app, this.el, this.boardEl, this.goalEl, stars, { portrait: this.o === 'portrait', onArrive: () => (this.goalEl.innerHTML = goalBarHtml(this.app, { cur: this.item.id, ico: 'shield', text: this.app.voice.text(`mc.i.${this.item.id}`) })) });
    this.bag.timeout(() => {
      void this.say(praiseLine({ kind: 'deploy', retried: this.refused > 0 }), 'celebrating');
      this.guide?.react('hop');
    }, d(900));
    await this.bag.wait(d(1300));
    const portrait = this.o === 'portrait';
    await afterItem(this.app, this.el, this.item.id, info, {
      portrait,
      say: (l) => void this.say(l, 'celebrating'),
      wait: (ms) => this.bag.wait(ms),
      nextRect: this.phone && this.nextSlot ? this.nextSlot : portrait ? { x: 205, y: this.trayRect().y + 26, w: 400, h: 80 } : { x: 720, y: 810 - 16 - 80, w: 348, h: 76 },
      teaches: this.item.teaches,
      caption: this.caption,
    });
  }

  destroy(): void {
    clearTimeout(this.idleTimer);
    super.destroy();
  }

  /** ?test=1 */
  debug() {
    return {
      layout: () => this.layoutNow(),
      tray: () => this.tray.slice(),
      refused: () => this.refused,
      finished: () => this.finished,
      busy: () => this.busy,
      introDone: () => this.introDone,
      blanks: () => this.idxs.slice(),
      slotsOf: () => SLOTS.length,
    };
  }
}
