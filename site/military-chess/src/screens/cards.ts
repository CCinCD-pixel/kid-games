/**
 * S4 卡片题 (spec §4.1 题型表, §5.1 卡片题提示, §5.3): three card puzzles in one screen.
 *  - order   (L1-1): nine shuffled rank tiles → a staircase of nine slots; checked when all are placed;
 *                    misplaced tiles shake, a "5 > 3" plate shows one inversion, they go back to the tray.
 *  - compare (L1-2, L2-1): attacker → defender, three or four big answer buttons (进攻赢 / 防守赢 /
 *                    一起下场 / 扛到军旗); every answer plays the real VS result; a wrong answer is
 *                    explained (mc.why.*) and the same pair comes again.
 *  - infer   (L8): an event strip (collision, footprints, a turning track, a lit flag) above a hidden
 *                    blue piece and three candidates; the answer is checked against `inferMask`.
 * Hints: H1 lights a right slot / button / option; H2 explains (rule line) and narrows; H3 shows the
 * answer and then gives the twin (reshuffled, max 2★). Intro cards start with the ghost hand.
 */
import { createRng } from '@kit/rng';
import { ghostDrag, ghostTap, icon, setHintReady, shouldAutoSkip } from '@kit/ui';
import type { App } from '../app';
import { inferMask, optionConsistent } from '../core/belief';
import { resolve, type Outcome } from '../core/combat';
import { BOMB, ENG, FLAG, MINE, NAMES, rankOf, typeFromCode } from '../core/pieces';
import { cardStars } from '../core/progress';
import { praiseLine } from '../core/praise';
import type { CompareItem, InferEvent, InferItem, OrderItem } from '../content';
import { EASE, MS, d, dm } from '../view/anim';
import * as fx from '../view/fx';
import { mcIcon, type McIcon } from '../view/icons';
import type { Pt, Rect } from '../view/layout';
import { tileSvg } from '../view/pieces-svg';
import { BaseScreen, IntroSkip, abs, button, demoSeen, div, markDemo, pillRoom } from './base';
import { afterItem, bookItem, flyStars, goalBarHtml } from './item-common';

type CardItem = OrderItem | CompareItem | InferItem;

const BTN: Record<Outcome, { label: string; ico: McIcon; line: string }> = {
  A: { label: '进攻赢', ico: 'swords', line: 'mc.btn.A' },
  D: { label: '防守赢', ico: 'shield', line: 'mc.btn.D' },
  B: { label: '一起下场', ico: 'smoke', line: 'mc.btn.B' },
  F: { label: '扛到军旗', ico: 'flag', line: 'mc.btn.F' },
};

const tileOf = (code: string, side: 0 | 1, shape: 'wide' | 'tall' = 'wide', face: 'up' | 'back' = 'up'): string =>
  tileSvg({ side, type: typeFromCode(code), shape, face }, 'mc-tile');

/** the compare explanation for an outcome (what really happens) */
function compareLine(att: number, def: number, r: Outcome, miss = false): string {
  if (r === 'F') return 'mc.why.flag.any';
  if (att === BOMB || def === BOMB) return 'mc.why.bomb';
  if (def === MINE) return 'mc.why.mine.die';
  if (r === 'B') return 'mc.why.equal';
  if (r === 'D') return 'mc.why.bigger';
  // attacker wins: the cheerful "大吃小，拿下了！" only when it was the child's (or the ghost's) right answer;
  // after a different answer the neutral rule line explains it (QA r1: a miss must not sound like praise)
  return miss ? 'mc.ft.1' : 'mc.ft.ok';
}

/** the line of the event that decides an option for an infer card */
function inferLine(events: readonly InferEvent[], opt: string): string {
  for (const e of events) {
    const m = inferMask([e]);
    if (optionConsistent(opt, m)) continue;
    if (e.flagShown) return 'mc.why.infer.reveal';
    if (e.moved && e.from) return 'mc.why.infer.eng';
    if (e.moved) return 'mc.why.infer.moved';
    if (e.act === 'attack') {
      if (e.outcome === 'A') return 'mc.why.infer.win';
      if (e.outcome === 'B') return 'mc.why.infer.both';
      return events.some((x) => x.unmoved) ? 'mc.why.infer.lose' : 'mc.why.bigger';
    }
  }
  const any = events.find((e) => e.flagShown) ?? events.find((e) => e.act === 'attack') ?? events[0];
  if (any?.flagShown) return 'mc.why.infer.reveal';
  if (any?.act === 'attack') return any.outcome === 'A' ? 'mc.why.infer.win' : any.outcome === 'B' ? 'mc.why.infer.both' : 'mc.why.infer.lose';
  return any?.from ? 'mc.why.infer.eng' : 'mc.why.infer.moved';
}

export class CardScreen extends BaseScreen {
  readonly name = 'cards';
  private item: CardItem;
  private twin: boolean;
  private corrections = 0;
  private hintLevel: 0 | 1 | 2 | 3 = 0;
  private finished = false;
  private busy = 0;
  private goalEl!: HTMLDivElement;
  private panel!: HTMLDivElement;
  private fxLayer!: HTMLDivElement;
  private hintBtn!: HTMLButtonElement;
  private idleTimer = 0;
  private ghostDone = false;
  // order
  private tray: string[] = [];
  private slots: Array<string | null> = [];
  private locked: boolean[] = [];
  private picked: { from: 'tray' | 'slot'; k: number } | null = null;
  // compare
  private pair = 0;
  private pairOrder: number[] = [];
  private introButtons = false;
  // infer
  private options: string[] = [];
  private crossed = new Set<string>();
  private solved = false;

  constructor(app: App, item: CardItem, o: { twin?: boolean } = {}) {
    super(app);
    this.item = item;
    this.twin = !!o.twin;
    this.setup();
    this.bag.timeout(() => void this.intro(), 320);
  }

  /** a fresh shuffle (the twin uses another seed: same idea, different order) */
  private setup(): void {
    const rng = createRng(`mc:card:${this.item.id}:${this.twin ? 'twin' : 'main'}`);
    this.corrections = this.corrections || 0;
    if (this.item.type === 'order') {
      this.tray = this.twin ? rng.shuffle(this.item.cards.slice()) : this.item.cards.slice();
      this.slots = this.item.answer.map(() => null);
      this.locked = this.item.answer.map(() => false);
    } else if (this.item.type === 'compare') {
      this.pair = 0;
      this.pairOrder = this.item.pairs.map((_, k) => k);
      if (this.twin) this.pairOrder = rng.shuffle(this.pairOrder);
    } else {
      this.options = this.twin ? rng.shuffle(this.item.options.slice()) : this.item.options.slice();
      this.crossed.clear();
      this.solved = false;
    }
  }

  back(): boolean {
    this.app.go({ name: 'academy', lesson: this.item.id.startsWith('F') ? 'F' : this.item.id.split('-')[0] });
    return true;
  }

  private instruction(): string {
    if (this.item.type === 'infer') return this.item.ask === 'can' ? 'mc.i.can' : 'mc.i.cannot';
    return `mc.i.${this.item.id}`;
  }

  // ------------------------------------------------------------------ layout
  private panelRect(): Rect {
    return this.o === 'portrait' ? { x: 25, y: this.safeTop + 100, w: 760, h: 790 } : { x: 60, y: this.safeTop + 84, w: 960, h: 580 };
  }

  readonly phoneReady = true;
  /** phones: the scaled activity panel's box and the [下一题] slot */
  private nextSlot: Rect | null = null;

  /**
   * Phones (Dad, 2026-10-08): the activity panel keeps its iPad geometry (drags and hit-tests measure
   * the panel on screen) and is scaled into the free area; goal bar, guide, caption and 💡 are laid
   * out for the phone around it. Portrait: panel full width under the goal bar, the foot below;
   * landscape: panel left, a column for the guide + caption + 💡 at the right.
   */
  private phoneFrame(): void {
    const r = this.panelRect(), W = this.W, H = this.H, tb = this.app.topBand, sr = this.app.safeR;
    const gh = div('mc-cards__guide');
    if (this.o === 'portrait') {
      abs(this.goalEl, { x: tb, y: 4, w: W - tb - 6, h: tb - 10 });
      this.goalEl.style.setProperty('--gw-pill', `${W - tb - pillRoom(this.app)}px`);
      const k = Math.min((W - 8) / r.w, (H - tb - 6 - 84) / r.h);
      const x = (W - r.w * k) / 2, y = tb + Math.max(0, (H - tb - 6 - 84 - r.h * k) / 2);
      Object.assign(this.panel.style, { left: `${x}px`, top: `${y}px`, transformOrigin: '0 0', transform: `scale(${k})` });
      abs(this.hintBtn, { x: W - 6 - sr - 54, y: H - 6 - 54, w: 54, h: 54 });
      this.nextSlot = { x: 70, y: H - 6 - 58, w: W - 76, h: 58 };
      this.el.append(this.hintBtn);
      this.phoneFoot({ mood: 'happy', right: 54 + 8 });
      return;
    }
    const x0 = this.phoneCol + 4, colW = 224;
    abs(this.goalEl, { x: x0, y: 4, w: W - x0 - 6 - sr, h: 56 });
    this.goalEl.style.setProperty('--gw-pill', `${W - x0 - sr - pillRoom(this.app)}px`);
    const k = Math.min((W - x0 - 6 - sr - colW - 8) / r.w, (H - 66 - 6) / r.h);
    Object.assign(this.panel.style, { left: `${x0}px`, top: '66px', transformOrigin: '0 0', transform: `scale(${k})` });
    const cx = x0 + r.w * k + 8, cw = W - sr - 6 - cx;
    abs(gh, { x: cx, y: 70, w: 62, h: 62 });
    abs(this.hintBtn, { x: cx + cw - 54, y: H - 6 - 54, w: 54, h: 54 });
    this.phoneCaption(cx, 6 + 54 + 8);
    this.nextSlot = { x: cx, y: H - 6 - 58, w: cw, h: 58 };
    this.el.append(gh, this.caption.el, this.hintBtn);
    this.placeGuide(gh, 58, { mood: 'happy', variant: 'head' });
  }

  protected render(): void {
    const portrait = this.o === 'portrait', st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-cards');
    this.goalEl = div('mc-goal');
    this.goalEl.dataset.testid = 'goal-bar';
    if (this.phone) this.goalEl.classList.add('is-phone');
    abs(this.goalEl, portrait ? { x: 84, y: st + 6, w: 642, h: 80 } : { x: 84, y: st + 6, w: 912, h: 70 });
    if (portrait && !this.phone) {
      this.goalEl.classList.add('is-pillable');
      this.goalEl.style.setProperty('--gw-pill', `${810 - 84 - pillRoom(this.app)}px`);
    }
    this.goalEl.addEventListener('click', () => void this.say(this.instruction()));
    this.el.appendChild(this.goalEl);
    this.renderGoal();

    this.panel = div('mc-cardpanel');
    this.panel.dataset.testid = 'card-panel';
    this.panel.dataset.type = this.item.type;
    abs(this.panel, this.panelRect());
    this.el.appendChild(this.panel);
    this.fxLayer = div('mc-fx');
    Object.assign(this.fxLayer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '60' });

    // guide, caption, hint
    const gh = div('mc-cards__guide');
    this.hintBtn = button('xg-iconbtn mc-hint-btn', icon('hint'), () => void this.onHint(), 'hint');
    if (this.phone) this.phoneFrame();
    else if (portrait) {
      abs(gh, { x: 20, y: 1080 - 12 - 130, w: 112, h: 130 });
      abs(this.caption.el, { x: 140, y: 1080 - 12 - 84, w: 560, h: 76 });
      abs(this.hintBtn, { x: 810 - 24 - 72, y: 1080 - 12 - 80, w: 72, h: 72 });
    } else {
      abs(gh, { x: 24, y: 810 - 12 - 130, w: 110, h: 130 });
      abs(this.caption.el, { x: 150, y: 810 - 12 - 90, w: 760, h: 78 });
      abs(this.hintBtn, { x: 1080 - 24 - 72, y: 810 - 12 - 84, w: 72, h: 72 });
    }
    if (!this.phone) {
      this.el.append(gh, this.caption.el, this.hintBtn);
      this.placeGuide(gh, portrait ? 108 : 104, { mood: 'happy' });
    }

    if (this.item.type === 'order') this.renderOrder();
    else if (this.item.type === 'compare') this.renderCompare();
    else this.renderInfer();
    this.panel.appendChild(this.fxLayer);
    if (this.finished) this.hintBtn.style.visibility = 'hidden';
  }

  private renderGoal(): void {
    const ico: McIcon = this.item.type === 'order' ? 'star' : this.item.type === 'compare' ? 'scale' : 'eye';
    let sub = '';
    if (this.item.type === 'compare') {
      const n = this.item.pairs.length;
      sub = `<span class="mc-steps" data-testid="steps">第 ${Math.min(this.pair + 1, n)} 对 · 共 ${n} 对</span>`;
    }
    this.goalEl.innerHTML = goalBarHtml(this.app, { cur: this.item.id, ico, text: this.app.voice.text(this.instruction()), sub, twin: this.twin });
  }

  // ================================================================== ORDER
  private orderGeom(): { tray: (k: number) => Pt; slot: (k: number) => Pt; tileW: number; tileH: number; scale: number; stepH: (k: number) => number } {
    const r = this.panelRect();
    const n = (this.item as OrderItem).answer.length;
    const portrait = this.o === 'portrait';
    const pitch = portrait ? 80 : 98;
    const x0 = (r.w - pitch * n) / 2 + pitch / 2;
    const scale = portrait ? 1.22 : 1.4;
    const tileW = 64 * scale, tileH = 100 * scale;
    const trayY = portrait ? 130 : 100;
    const slotY = portrait ? 520 : 370;
    return {
      tray: (k) => ({ x: x0 + k * pitch, y: trayY }),
      slot: (k) => ({ x: x0 + k * pitch, y: slotY - k * (portrait ? 12 : 9) }),
      tileW,
      tileH,
      scale,
      stepH: (k) => (portrait ? 40 : 30) + k * (portrait ? 13 : 9),
    };
  }

  private renderOrder(): void {
    const it = this.item as OrderItem;
    const g = this.orderGeom();
    const portrait = this.o === 'portrait';
    // tray shelf + label icons
    const shelf = div('mc-order__shelf');
    abs(shelf, { x: 16, y: g.tray(0).y - g.tileH / 2 - 14, w: this.panelRect().w - 32, h: g.tileH + 28 });
    this.panel.appendChild(shelf);
    // staircase slots
    for (let k = 0; k < it.answer.length; k++) {
      const p = g.slot(k);
      const step = div('mc-order__step');
      abs(step, { x: p.x - (portrait ? 38 : 46), y: p.y + g.tileH / 2 + 4, w: portrait ? 76 : 92, h: g.stepH(k) });
      this.panel.appendChild(step);
      const slot = div(`mc-order__slot${this.locked[k] ? ' is-locked' : ''}`);
      slot.dataset.slot = String(k);
      slot.dataset.testid = `slot-${k}`;
      abs(slot, { x: p.x - g.tileW / 2 + 2, y: p.y - g.tileH / 2 + 4, w: g.tileW - 4, h: g.tileH - 8 });
      slot.addEventListener('click', () => this.tapSlot(k));
      this.panel.appendChild(slot);
    }
    // small → big
    const arrow = div('mc-order__arrow', `<span class="mc-order__small">${mcIcon('star')}</span><svg viewBox="0 0 200 24" class="mc-order__line" aria-hidden="true" preserveAspectRatio="none"><path d="M4 12H186M174 3l14 9-14 9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="mc-order__big">${mcIcon('crown')}</span>`);
    const ay = portrait ? 690 : 488;
    abs(arrow, { x: 60, y: ay, w: this.panelRect().w - 120, h: 64 });
    this.panel.appendChild(arrow);
    // tiles
    this.tray.forEach((code, k) => {
      if (!code) return;
      this.panel.appendChild(this.orderTile(code, 'tray', k));
    });
    this.slots.forEach((code, k) => {
      if (code) this.panel.appendChild(this.orderTile(code, 'slot', k));
    });
  }

  private orderTile(code: string, where: 'tray' | 'slot', k: number): HTMLDivElement {
    const g = this.orderGeom();
    const p = where === 'tray' ? g.tray(k) : g.slot(k);
    const el = div(`mc-otile${where === 'slot' && this.locked[k] ? ' is-locked' : ''}${this.picked && this.picked.from === where && this.picked.k === k ? ' is-lifted' : ''}`, tileOf(code, 0, 'tall'));
    el.dataset.code = code;
    el.dataset.where = where;
    el.dataset.k = String(k);
    el.dataset.testid = `otile-${code}`;
    abs(el, { x: p.x - g.tileW / 2, y: p.y - g.tileH / 2, w: g.tileW, h: g.tileH });
    const svg = el.firstElementChild as SVGElement;
    svg.setAttribute('width', String(g.tileW));
    svg.setAttribute('height', String(g.tileH));
    this.bindDrag(el, where, k);
    return el;
  }

  private bindDrag(el: HTMLDivElement, where: 'tray' | 'slot', k: number): void {
    let start: { x: number; y: number; id: number } | null = null;
    let moved = false;
    const scale = (): number => this.panel.getBoundingClientRect().width / this.panelRect().w || 1;
    el.addEventListener('pointerdown', (ev) => {
      if (this.busy || this.finished || (where === 'slot' && this.locked[k])) return;
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
      const dx = (ev.clientX - start.x) / scale(), dy = (ev.clientY - start.y) / scale();
      if (!moved && Math.hypot(dx, dy) > 10) {
        moved = true;
        el.classList.add('is-dragging');
        this.app.play('ui-pick');
      }
      if (moved) el.style.translate = `${dx}px ${dy}px`;
    });
    const end = (ev: PointerEvent): void => {
      if (!start || start.id !== ev.pointerId) return;
      start = null;
      if (!moved) {
        this.tapTile(where, k);
        return;
      }
      el.classList.remove('is-dragging');
      // which slot is under the finger?
      const target = this.slotAtClient(ev.clientX, ev.clientY);
      el.style.translate = '';
      if (target >= 0) this.placeTo(where, k, target);
      else if (where === 'slot') this.toTray(k);
      else this.render();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => {
      start = null;
      el.classList.remove('is-dragging');
      el.style.translate = '';
    });
  }

  private slotAtClient(cx: number, cy: number): number {
    const els = this.panel.querySelectorAll<HTMLElement>('.mc-order__slot');
    let best = -1, bd = Infinity;
    els.forEach((s) => {
      const r = s.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      const dd = dx * dx + dy * dy;
      if (Math.abs(dx) < r.width * 0.9 && Math.abs(dy) < r.height * 0.9 && dd < bd) {
        bd = dd;
        best = Number(s.dataset.slot);
      }
    });
    return best;
  }

  private tapTile(where: 'tray' | 'slot', k: number): void {
    if (this.busy || this.finished) return;
    const code = where === 'tray' ? this.tray[k] : this.slots[k];
    if (!code) return;
    if (where === 'slot' && this.locked[k]) {
      void this.say(`mc.w.${NAMES[typeFromCode(code)]}`);
      return;
    }
    if (this.picked && this.picked.from === where && this.picked.k === k) {
      this.picked = null;
      this.app.play('ui-tap');
      this.render();
      return;
    }
    if (this.picked && this.picked.from === 'tray' && where === 'slot') {
      // tapping a filled slot with a tile in hand: swap them
      this.placeTo('tray', this.picked.k, k);
      return;
    }
    this.picked = { from: where, k };
    this.app.play('ui-pick');
    void this.say(`mc.w.${NAMES[typeFromCode(code)]}`);
    this.render();
  }

  private tapSlot(k: number): void {
    if (this.busy || this.finished || this.locked[k]) return;
    if (!this.picked) {
      if (this.slots[k]) this.tapTile('slot', k);
      return;
    }
    this.placeTo(this.picked.from, this.picked.k, k);
  }

  private placeTo(from: 'tray' | 'slot', k: number, slot: number): void {
    if (this.locked[slot]) {
      this.app.play('bump');
      this.picked = null;
      this.render();
      return;
    }
    const code = from === 'tray' ? this.tray[k] : this.slots[k];
    if (!code) return;
    const occupant = this.slots[slot];
    if (from === 'tray') this.tray[k] = '';
    else this.slots[k] = null;
    if (occupant) {
      if (from === 'slot') this.slots[k] = occupant;
      else this.tray[this.tray.findIndex((x) => !x)] = occupant;
    }
    this.slots[slot] = code;
    this.picked = null;
    this.app.play('ui-snap');
    this.render();
    this.armIdle();
    if (this.slots.every((x) => x)) this.bag.timeout(() => void this.checkOrder(), d(320));
  }

  private toTray(k: number): void {
    const code = this.slots[k];
    if (!code) return;
    this.slots[k] = null;
    this.tray[this.tray.findIndex((x) => !x)] = code;
    this.app.play('ui-slide');
    this.render();
  }

  private async checkOrder(): Promise<void> {
    const it = this.item as OrderItem;
    if (this.finished || this.busy) return;
    this.busy++;
    const wrong: number[] = [];
    it.answer.forEach((a, k) => {
      if (this.slots[k] !== a) wrong.push(k);
      else this.locked[k] = true;
    });
    if (!wrong.length) {
      this.busy--;
      this.app.play('correct-big');
      this.render();
      this.panel.querySelectorAll<HTMLElement>('.mc-otile').forEach((el, i) => el.animate([{ translate: '0 0' }, { translate: '0 -14px' }, { translate: '0 0' }], { duration: d(360), delay: d(i * 50), easing: EASE.back }));
      void this.done();
      return;
    }
    this.corrections += wrong.length;
    this.app.play('try-again');
    this.render();
    for (const k of wrong) this.panel.querySelector<HTMLElement>(`.mc-otile[data-where="slot"][data-k="${k}"]`)?.animate([{ translate: '0 0' }, { translate: '-7px 0' }, { translate: '7px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: dm(320) });
    // one inversion as a plate between the two tiles ("5 > 3")
    const ranks = this.slots.map((c) => rankOf(typeFromCode(c!)));
    let inv = -1;
    for (let k = 0; k + 1 < ranks.length; k++) if (ranks[k] > ranks[k + 1] && (wrong.includes(k) || wrong.includes(k + 1))) {
      inv = k;
      break;
    }
    void this.say('mc.why.order', 'encouraging');
    if (inv >= 0) {
      const g = this.orderGeom();
      const a = g.slot(inv), b = g.slot(inv + 1);
      await fx.plate(this.fxLayer, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - g.tileH / 2 - 34 }, `<b class="r">${ranks[inv]}</b><span class="op">&gt;</span><b class="r">${ranks[inv + 1]}</b>`, 900);
    } else await this.bag.wait(d(900));
    // misplaced tiles go back to the tray
    for (const k of wrong) {
      const code = this.slots[k]!;
      this.slots[k] = null;
      this.tray[this.tray.findIndex((x) => !x)] = code;
    }
    this.app.play('ui-slide');
    this.render();
    this.busy--;
    if (this.corrections >= 2 && this.hintBtn) setHintReady(this.hintBtn, true);
    this.armIdle();
  }

  // ================================================================== COMPARE
  private cmpGeom(): { att: Pt; def: Pt; vs: Pt; scale: number; btnY: number; btnH: number } {
    const r = this.panelRect();
    const portrait = this.o === 'portrait';
    const cy = portrait ? 270 : 200;
    return { att: { x: r.w * 0.24, y: cy }, def: { x: r.w * 0.76, y: cy }, vs: { x: r.w / 2, y: cy }, scale: portrait ? 2.1 : 2.2, btnY: portrait ? 540 : 390, btnH: portrait ? 170 : 150 };
  }

  private curPair(): [string, string] {
    const it = this.item as CompareItem;
    return it.pairs[this.pairOrder[Math.min(this.pair, it.pairs.length - 1)]];
  }

  private renderCompare(): void {
    const it = this.item as CompareItem;
    const g = this.cmpGeom();
    const [a, b] = this.curPair();
    const portrait = this.o === 'portrait';
    // pair dots
    const dots = div('mc-cmp__dots', it.pairs.map((_, k) => `<i class="${k < this.pair ? 'is-done' : k === this.pair ? 'is-cur' : ''}"></i>`).join(''));
    abs(dots, { x: 0, y: portrait ? 34 : 22, w: this.panelRect().w, h: 24 });
    this.panel.appendChild(dots);
    // labels
    const la = div('mc-cmp__who is-att', `${mcIcon('swords')}<span>进攻</span>`);
    const lb = div('mc-cmp__who is-def', `${mcIcon('shield')}<span>防守</span>`);
    abs(la, { x: g.att.x - 90, y: g.att.y - 128, w: 180, h: 40 });
    abs(lb, { x: g.def.x - 90, y: g.def.y - 128, w: 180, h: 40 });
    this.panel.append(la, lb);
    // tiles
    const w = (92 + 12) * g.scale, h = (50 + 12) * g.scale;
    const ta = div('mc-cmp__tile is-att', tileOf(a, 0, 'wide'));
    const tb = div('mc-cmp__tile is-def', tileOf(b, 1, 'wide'));
    ta.dataset.testid = 'cmp-att';
    tb.dataset.testid = 'cmp-def';
    for (const [el, p] of [[ta, g.att], [tb, g.def]] as const) {
      abs(el, { x: p.x - w / 2, y: p.y - h / 2, w, h });
      const svg = el.firstElementChild as SVGElement;
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      this.panel.appendChild(el);
    }
    ta.addEventListener('click', () => void this.say(`mc.w.${NAMES[typeFromCode(a)]}`));
    tb.addEventListener('click', () => void this.say(`mc.w.${NAMES[typeFromCode(b)]}`));
    // VS medallion with the arrow
    const vs = div('mc-cmp__vs', `<svg viewBox="0 0 120 60" aria-hidden="true"><path d="M8 30H100M88 16l16 14-16 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg><b>VS</b>`);
    abs(vs, { x: g.vs.x - 70, y: g.vs.y - 50, w: 140, h: 100 });
    this.panel.appendChild(vs);
    // buttons
    const n = it.buttons.length;
    const bw = portrait ? (n === 4 ? 166 : 200) : n === 4 ? 200 : 230;
    const gap = portrait ? 16 : 22;
    const x0 = (this.panelRect().w - n * bw - (n - 1) * gap) / 2;
    it.buttons.forEach((o, k) => {
      const def = BTN[o];
      const b2 = button(`mc-ans mc-ans--${o}`, `<span class="mc-ans__ico">${mcIcon(def.ico)}</span><span class="mc-ans__t">${def.label}</span>`, () => void this.answer(o), `ans-${o}`);
      abs(b2, { x: x0 + k * (bw + gap), y: g.btnY, w: bw, h: g.btnH });
      this.panel.appendChild(b2);
    });
  }

  private async answer(o: Outcome): Promise<void> {
    if (this.busy || this.finished || this.item.type !== 'compare') return;
    this.busy++;
    clearTimeout(this.idleTimer);
    const [a, b] = this.curPair();
    const ta = typeFromCode(a), tb = typeFromCode(b);
    const real = resolve(ta, tb);
    const btn = this.panel.querySelector<HTMLElement>(`.mc-ans--${o}`);
    btn?.classList.add('is-chosen');
    this.app.play('ui-confirm');
    await this.playVs(ta, tb, real);
    if (o === real) {
      btn?.classList.add('is-right');
      this.app.play('correct', { step: this.pair });
      await this.bag.wait(d(500));
      this.pair++;
      this.busy--;
      if (this.pair >= (this.item as CompareItem).pairs.length) {
        void this.done();
        return;
      }
      this.renderGoal();
      this.render();
      this.slideIn();
      this.armIdle();
      return;
    }
    // explain what really happened, then the same pair again
    this.corrections++;
    btn?.classList.add('is-miss');
    btn?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: d(320), easing: 'ease-in-out' });
    const rightBtn = this.panel.querySelector<HTMLElement>(`.mc-ans--${real}`);
    rightBtn?.classList.add('is-lit', 'is-answer');
    this.app.play('try-again');
    await this.say(compareLine(ta, tb, real, true), 'encouraging');
    rightBtn?.classList.remove('is-lit', 'is-answer');
    this.busy--;
    if (this.corrections >= 2) setHintReady(this.hintBtn, true);
    this.render();
    this.armIdle();
  }

  private slideIn(): void {
    for (const sel of ['.mc-cmp__tile.is-att', '.mc-cmp__tile.is-def']) {
      const el = this.panel.querySelector<HTMLElement>(sel);
      el?.animate([{ transform: `translateX(${sel.includes('att') ? -60 : 60}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(260), easing: EASE.out });
    }
  }

  /** the real result: approach, clash, outcome, comparison plate */
  private async playVs(ta: number, tb: number, r: Outcome): Promise<void> {
    const g = this.cmpGeom();
    const att = this.panel.querySelector<HTMLElement>('.mc-cmp__tile.is-att');
    const def = this.panel.querySelector<HTMLElement>('.mc-cmp__tile.is-def');
    if (!att || !def) return;
    const dx = g.def.x - g.att.x;
    const meet: Pt = { x: g.vs.x + dx * 0.12, y: g.vs.y };
    this.app.play('whoosh-up');
    await att.animate([{ transform: 'none' }, { transform: `translateX(${dx * 0.55}px)` }], { duration: dm(MS.approach), easing: EASE.in, fill: 'forwards' }).finished.catch(() => undefined);
    this.app.play(ta === BOMB || tb === BOMB ? 'mc.boom' : tb === MINE ? (r === 'A' ? 'mc.shovel' : 'mc.mine') : 'capture');
    if (ta === BOMB || tb === BOMB) void fx.bomb(this.fxLayer, meet);
    else if (tb === MINE && r === 'D') void fx.mineDust(this.fxLayer, meet);
    else void fx.sparks(this.fxLayer, meet, 8);
    const out = (el: HTMLElement, dir: number) => el.animate([{ opacity: 1 }, { transform: `${el === att ? `translateX(${dx * 0.55}px) ` : ''}translateY(40px) rotate(${dir * 18}deg)`, opacity: 0 }], { duration: dm(MS.loserOut), easing: EASE.in, fill: 'forwards' }).finished.catch(() => undefined);
    if (r === 'A' || r === 'F') {
      await out(def, 1);
      if (r === 'F') {
        this.app.play('mc.flag');
        void fx.ribbons(this.fxLayer, g.def);
      }
      await att.animate([{ transform: `translateX(${dx * 0.55}px)` }, { transform: `translateX(${dx}px)` }], { duration: dm(MS.winnerSettle), easing: EASE.out, fill: 'forwards' }).finished.catch(() => undefined);
    } else if (r === 'D') {
      await out(att, -1);
    } else {
      void fx.smoke(this.fxLayer, meet);
      await Promise.all([out(att, -1), out(def, 1)]);
    }
    // the comparison plate
    let html: string;
    if (ta >= ENG && tb >= ENG) html = `<b class="r">${rankOf(ta)}</b><span class="op">${r === 'A' ? '&gt;' : r === 'D' ? '&lt;' : '='}</span><b class="b">${rankOf(tb)}</b>`;
    else html = `<span class="r">${this.miniIco(ta)}</span><span class="op">${mcIcon(BTN[r].ico)}</span><span class="b">${this.miniIco(tb)}</span>`;
    await fx.plate(this.fxLayer, { x: g.vs.x, y: g.vs.y + 104 }, html, 700);
  }

  private miniIco(t: number): string {
    if (t === BOMB) return mcIcon('bomb');
    if (t === MINE) return mcIcon('mine');
    if (t === FLAG) return mcIcon('flag');
    return `<b>${rankOf(t)}</b>`;
  }

  // ================================================================== INFER
  private renderInfer(): void {
    const it = this.item as InferItem;
    const portrait = this.o === 'portrait';
    const W = this.panelRect().w;
    // event strip
    const strip = div('mc-ev-strip');
    strip.dataset.testid = 'events';
    const evs = it.events;
    const ew = portrait ? Math.min(330, (W - 60 - (evs.length - 1) * 20) / evs.length) : Math.min(360, (W - 80 - (evs.length - 1) * 24) / evs.length);
    const eh = portrait ? 190 : 160;
    const ex0 = (W - evs.length * ew - (evs.length - 1) * (portrait ? 20 : 24)) / 2;
    evs.forEach((e, k) => {
      const card = div('mc-ev', this.eventHtml(e));
      abs(card, { x: ex0 + k * (ew + (portrait ? 20 : 24)), y: portrait ? 30 : 16, w: ew, h: eh });
      card.addEventListener('click', () => void this.say(this.eventLine(e)));
      strip.appendChild(card);
    });
    this.panel.appendChild(strip);
    // the hidden piece
    const myY = portrait ? 350 : 270;
    const plinth = div('mc-inf__plinth');
    abs(plinth, { x: W / 2 - 120, y: myY - 54, w: 240, h: 140 });
    this.panel.appendChild(plinth);
    const scale = 2.2;
    const tw = 104 * scale, th = 62 * scale;
    const hidden = div('mc-inf__hidden', tileSvg({ side: 1, type: 4, shape: 'wide', face: 'back' }) + `<span class="mc-inf__q">?</span>`);
    abs(hidden, { x: W / 2 - tw / 2, y: myY - th / 2, w: tw, h: th });
    const svg = hidden.firstElementChild as SVGElement;
    svg.setAttribute('width', String(tw));
    svg.setAttribute('height', String(th));
    hidden.dataset.testid = 'hidden-piece';
    this.panel.appendChild(hidden);
    // options
    const ow = portrait ? 220 : 260, oh = portrait ? 190 : 160, gap = portrait ? 20 : 30;
    const ox0 = (W - 3 * ow - 2 * gap) / 2, oy = portrait ? 560 : 390;
    this.options.forEach((opt, k) => {
      const parts = opt.split('|');
      const inner = parts.map((c) => `<span class="mc-opt__t">${tileOf(c, 1, 'wide')}</span>`).join('<i class="mc-opt__or">或</i>');
      const isAnswer = opt === it.answer;
      const crossed = this.crossed.has(opt);
      const b = button(`mc-opt${parts.length > 1 ? ' is-combo' : ''}${crossed ? ' is-crossed' : ''}${this.solved && isAnswer ? ' is-right' : ''}`, `${inner}${crossed ? `<span class="mc-opt__x">${icon('close')}</span>` : ''}${this.solved && isAnswer ? `<span class="mc-opt__ok">${icon('check')}</span>` : ''}`, () => void this.pickOption(opt), `opt-${k}`);
      b.dataset.opt = opt;
      abs(b, { x: ox0 + k * (ow + gap), y: oy, w: ow, h: oh });
      this.panel.appendChild(b);
    });
    // ask badge (can / cannot)
    const ask = div(`mc-inf__ask is-${it.ask}`, it.ask === 'can' ? `${icon('check')}<span>可能是</span>` : `${icon('close')}<span>不可能是</span>`);
    abs(ask, { x: W / 2 - 110, y: oy - 54, w: 220, h: 44 });
    this.panel.appendChild(ask);
  }

  private eventLine(e: InferEvent): string {
    if (e.flagShown) return 'mc.why.infer.reveal';
    if (e.act === 'attack') return e.outcome === 'A' ? 'mc.why.infer.win' : e.outcome === 'B' ? 'mc.why.infer.both' : 'mc.why.bigger';
    if (e.moved && e.from) return 'mc.why.infer.eng';
    if (e.moved) return 'mc.why.infer.moved';
    return 'mc.note.unmoved';
  }

  private eventHtml(e: InferEvent): string {
    if (e.act === 'attack') {
      const mine = tileOf(e.my!, 0, 'wide');
      const theirs = tileSvg({ side: 1, type: 4, shape: 'wide', face: 'back' }, 'mc-tile');
      const res = e.outcome === 'A' ? `<span class="mc-ev__res is-A">${tileOf(e.my!, 0, 'wide')}${icon('check')}</span>` : e.outcome === 'D' ? `<span class="mc-ev__res is-D">${theirs}${icon('check')}</span>` : `<span class="mc-ev__res is-B">${mcIcon('smoke')}</span>`;
      const flag = e.flagShown ? `<span class="mc-ev__flag">${mcIcon('flag')}</span>` : '';
      return `<div class="mc-ev__row"><span class="mc-ev__t">${mine}</span><span class="mc-ev__vs">${mcIcon('swords')}</span><span class="mc-ev__t">${theirs}</span></div><div class="mc-ev__row is-res"><span class="mc-ev__eq">=</span>${res}${flag}</div>`;
    }
    if (e.moved && e.from && e.to) {
      return `<div class="mc-ev__row">${this.trackSvg()}</div><div class="mc-ev__row is-res"><span class="mc-ev__cap">${mcIcon('train')}</span></div>`;
    }
    if (e.moved) return `<div class="mc-ev__row"><span class="mc-ev__big">${mcIcon('feet')}</span></div><div class="mc-ev__row is-res"><span class="mc-ev__t">${tileSvg({ side: 1, type: 4, shape: 'wide', face: 'back' }, 'mc-tile')}</span></div>`;
    if (e.unmoved) return `<div class="mc-ev__row"><span class="mc-ev__big">${mcIcon('lock')}</span></div><div class="mc-ev__row is-res"><span class="mc-ev__rows"><i></i><i></i><i class="is-on"></i><i class="is-on"></i></span></div>`;
    return '';
  }

  /** a rail corner: the piece went a7 → a11 → e11 in one move (only an engineer can turn) */
  private trackSvg(): string {
    return `<svg class="mc-ev__track" viewBox="0 0 220 110" aria-hidden="true">
      <path d="M30 14V86H196" fill="none" stroke="#2a241d" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M30 14V86H196" fill="none" stroke="#f1e8cf" stroke-width="8" stroke-dasharray="11 11" stroke-linejoin="round"/>
      <path d="M30 14V86H196" fill="none" stroke="var(--xg-gold-500)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>
      <circle cx="30" cy="86" r="14" fill="none" stroke="var(--xg-gold-500)" stroke-width="5"/>
      <circle cx="30" cy="14" r="9" fill="#2d5ba3"/><circle cx="196" cy="86" r="11" fill="#2d5ba3" stroke="#fff" stroke-width="3"/></svg>`;
  }

  private async pickOption(opt: string): Promise<void> {
    if (this.busy || this.finished || this.solved || this.item.type !== 'infer') return;
    const it = this.item;
    if (this.crossed.has(opt)) {
      this.app.play('ui-locked');
      return;
    }
    this.busy++;
    clearTimeout(this.idleTimer);
    const el = this.panel.querySelector<HTMLElement>(`.mc-opt[data-opt="${opt}"]`);
    if (opt === it.answer) {
      this.solved = true;
      this.app.play('correct-big');
      // the other options get their verdict (crossed for "can": they are impossible)
      if (it.ask === 'can') for (const o of this.options) if (o !== opt) this.crossed.add(o);
      this.render();
      this.panel.querySelector<HTMLElement>(`.mc-opt[data-opt="${opt}"]`)?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: d(420), easing: EASE.back });
      await this.say(inferLine(it.events, it.ask === 'can' ? this.options.find((o) => o !== opt) ?? opt : opt), 'happy');
      this.busy--;
      void this.done();
      return;
    }
    this.corrections++;
    this.app.play('try-again');
    el?.animate([{ translate: '0 0' }, { translate: '-7px 0' }, { translate: '7px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: dm(320) });
    // "can": the tapped option is impossible — cross it and say why; "cannot": it is possible
    if (it.ask === 'can') this.crossed.add(opt);
    await this.bag.wait(d(320));
    this.render();
    await this.say(inferLine(it.events, it.ask === 'can' ? opt : it.answer), 'encouraging');
    this.busy--;
    if (this.corrections >= 2) setHintReady(this.hintBtn, true);
    this.armIdle();
  }

  // ================================================================== intro, ghost, hints
  private async intro(): Promise<void> {
    // an intro card is shown first ("我做"): input is held while the ghost does its step, but the
    // first touch takes over at once (QA r1: a 9.5 s read-through swallowed taps)
    let hold = !!this.item.ghost && !this.twin && !this.ghostDone && !demoSeen(this.app, this.item.id);
    let readButtons = this.item.type === 'compare' && !this.twin && !this.app.save.firstRun.seenCmpButtons;
    // the parent's 跳过开场和教学: no demo, no button read-through (as if 跳过 had been tapped)
    if ((hold || readButtons) && shouldAutoSkip()) {
      if (hold) markDemo(this.app, this.item.id);
      if (readButtons) this.app.save.firstRun.seenCmpButtons = true;
      this.app.persist();
      this.ghostDone = this.ghostDone || hold;
      hold = readButtons = false;
    }
    if (hold) markDemo(this.app, this.item.id);
    const gate = hold || readButtons ? new IntroSkip(this.el, () => this.introSkipped()) : null;
    if (gate) this.busy++;
    try {
      const said = this.say(this.instruction());
      if (gate ? await gate.step(said) : (await said, true)) {
        if (readButtons && gate) await this.introduceButtons(gate);
        if (hold && gate && !gate.skipped) await this.ghost(gate);
      }
    } finally {
      if (gate) {
        this.busy = Math.max(0, this.busy - 1);
        gate.end();
      }
      this.introDone = true;
    }
    this.armIdle();
  }
  private introDone = false;

  /** the child touched the card during the intro: hand over at once */
  private introSkipped(): void {
    this.ghostDone = true;
    this.app.voice.stop();
    this.panel.querySelectorAll('.mc-ans.is-lit').forEach((b) => b.classList.remove('is-lit'));
    this.app.mark('intro-skip', { id: this.item.id });
    this.guide?.react('nod');
  }

  /** first compare card ever: the guide lights the buttons in turn and names them (once per save) */
  private async introduceButtons(gate: IntroSkip): Promise<void> {
    if (this.introButtons) return;
    this.introButtons = true;
    this.app.save.firstRun.seenCmpButtons = true;
    this.app.persist();
    if (!(await gate.step(this.say('mc.btn.intro')))) return;
    for (const o of (this.item as CompareItem).buttons) {
      const b = this.panel.querySelector<HTMLElement>(`.mc-ans--${o}`);
      b?.classList.add('is-lit');
      const go = await gate.step(this.say(BTN[o].line));
      b?.classList.remove('is-lit');
      if (!go) return;
    }
  }

  /** intro items: the ghost does the first step ("我做"), the child does the rest */
  private async ghost(gate: IntroSkip): Promise<void> {
    this.ghostDone = true;
    this.busy++;
    try {
      if (this.item.type === 'order') {
        const code = this.item.answer[0];
        const k = this.tray.indexOf(code);
        const tile = this.panel.querySelector<HTMLElement>(`.mc-otile[data-where="tray"][data-k="${k}"]`);
        const slot = this.panel.querySelector<HTMLElement>('.mc-order__slot[data-slot="0"]');
        if (tile && slot && !(await gate.step(ghostDrag(tile, slot)))) return;
        this.busy--;
        this.placeTo('tray', k, 0);
        this.busy++;
      } else if (this.item.type === 'compare') {
        const real = (this.item as CompareItem).answers[this.pairOrder[0]];
        const b = this.panel.querySelector<HTMLElement>(`.mc-ans--${real}`);
        if (b && !(await gate.step(ghostTap(b)))) return;
        const [a, c] = this.curPair();
        // once the ghost has answered, its VS plays out (short) and the demo pair is done
        await this.playVs(typeFromCode(a), typeFromCode(c), real);
        await gate.step(this.say(compareLine(typeFromCode(a), typeFromCode(c), real), 'happy'));
        this.pair = 1;
        this.renderGoal();
        this.render();
        this.slideIn();
      } else {
        const it = this.item as InferItem;
        const ev = this.panel.querySelector<HTMLElement>('.mc-ev');
        if (ev && !(await gate.step(ghostTap(ev)))) return;
        const wrong = this.options.find((o) => o !== it.answer && (it.ask === 'can' ? !optionConsistent(o, inferMask(it.events)) : optionConsistent(o, inferMask(it.events))));
        if (wrong && it.ask === 'can') {
          const b = this.panel.querySelector<HTMLElement>(`.mc-opt[data-opt="${wrong}"]`);
          if (b && !(await gate.step(ghostTap(b)))) return;
          this.crossed.add(wrong);
          this.render();
          await gate.step(this.say(inferLine(it.events, wrong), 'happy'));
        } else await gate.step(this.say(this.eventLine(it.events[0]), 'happy'));
      }
    } finally {
      this.busy = Math.max(0, this.busy - 1);
    }
  }

  private armIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.finished) return;
    this.idleTimer = this.bag.timeout(() => {
      if (this.finished) return;
      setHintReady(this.hintBtn, true);
      const r = this.panel.getBoundingClientRect();
      this.guide?.bot.lookAt(r.left + r.width / 2, r.top + r.height / 2);
    }, 30000);
  }

  private async onHint(): Promise<void> {
    if (this.busy || this.finished) return;
    this.app.play('hint');
    setHintReady(this.hintBtn, false);
    const level = Math.min(3, this.hintLevel + 1) as 1 | 2 | 3;
    this.hintLevel = level;
    this.app.mark('hint', { id: this.item.id, level });
    if (level === 3) return this.hint3();
    if (this.item.type === 'order') return this.hintOrder(level);
    if (this.item.type === 'compare') return this.hintCompare(level);
    return this.hintInfer(level);
  }

  private pulse(el: Element | null): void {
    el?.animate([{ boxShadow: '0 0 0 0 rgba(246,185,52,.9)', transform: 'scale(1)' }, { boxShadow: '0 0 0 18px rgba(246,185,52,0)', transform: 'scale(1.06)' }, { boxShadow: '0 0 0 0 rgba(246,185,52,0)', transform: 'scale(1)' }], { duration: d(700), iterations: 3 });
  }

  private hintOrder(level: 1 | 2): void {
    const it = this.item as OrderItem;
    const k = this.slots.findIndex((c, i) => c !== it.answer[i]);
    if (k < 0) return;
    const code = it.answer[k];
    if (level === 1) {
      const tile = this.panel.querySelector(`.mc-otile[data-code="${code}"]`);
      this.pulse(tile);
      this.pulse(this.panel.querySelector(`.mc-order__slot[data-slot="${k}"]`));
      void this.say('mc.why.order', 'thinking');
      return;
    }
    // H2: put one right tile in place for him
    void this.say('mc.why.order', 'thinking');
    const fromTray = this.tray.indexOf(code);
    if (fromTray >= 0) this.placeTo('tray', fromTray, k);
    else {
      const fromSlot = this.slots.indexOf(code);
      if (fromSlot >= 0) this.placeTo('slot', fromSlot, k);
    }
  }

  private hintCompare(level: 1 | 2): void {
    const it = this.item as CompareItem;
    const real = it.answers[this.pairOrder[this.pair]];
    const [a, b] = this.curPair();
    if (level === 1) {
      this.pulse(this.panel.querySelector(`.mc-ans--${real}`));
      void this.say(BTN[real].line, 'thinking');
      return;
    }
    void this.say(compareLine(typeFromCode(a), typeFromCode(b), real), 'thinking');
    this.pulse(this.panel.querySelector(`.mc-ans--${real}`));
  }

  private hintInfer(level: 1 | 2): void {
    const it = this.item as InferItem;
    if (level === 1) {
      this.pulse(this.panel.querySelector(`.mc-opt[data-opt="${it.answer}"]`));
      void this.say(this.eventLine(it.events[it.events.length - 1]), 'thinking');
      return;
    }
    // H2: narrow it down — cross one impossible option and say why
    const m = inferMask(it.events);
    const wrong = this.options.find((o) => o !== it.answer && !this.crossed.has(o) && (it.ask === 'can' ? !optionConsistent(o, m) : optionConsistent(o, m)));
    if (wrong && it.ask === 'can') {
      this.crossed.add(wrong);
      this.render();
      void this.say(inferLine(it.events, wrong), 'thinking');
    } else {
      this.pulse(this.panel.querySelector(`.mc-opt[data-opt="${it.answer}"]`));
      void this.say(inferLine(it.events, it.answer), 'thinking');
    }
  }

  /** H3: show the answer, then the twin (same idea, reshuffled; max 2★) */
  private async hint3(): Promise<void> {
    this.busy++;
    void this.say('mc.hint.show', 'happy');
    await this.bag.wait(d(500));
    const it = this.item;
    if (it.type === 'order') {
      this.slots = it.answer.slice();
      this.tray = it.answer.map(() => '');
      this.render();
      this.app.play('correct');
    } else if (it.type === 'compare') {
      const real = it.answers[this.pairOrder[this.pair]];
      const b = this.panel.querySelector<HTMLElement>(`.mc-ans--${real}`);
      if (b) await ghostTap(b);
      const [a, c] = this.curPair();
      await this.playVs(typeFromCode(a), typeFromCode(c), real);
    } else {
      const b = this.panel.querySelector<HTMLElement>(`.mc-opt[data-opt="${it.answer}"]`);
      if (b) await ghostTap(b);
      this.solved = true;
      if (it.ask === 'can') for (const o of this.options) if (o !== it.answer) this.crossed.add(o);
      this.render();
      await this.say(inferLine(it.events, it.ask === 'can' ? this.options.find((o) => o !== it.answer)! : it.answer), 'happy');
    }
    await this.bag.wait(d(1200));
    this.twin = true;
    this.hintLevel = 0;
    this.setup();
    this.render();
    this.renderGoal();
    void this.say('mc.hint.twin', 'encouraging');
    this.busy--;
    this.armIdle();
  }

  // ================================================================== done
  private async done(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.idleTimer);
    this.hintBtn.style.visibility = 'hidden';
    const stars = cardStars(this.corrections, this.twin);
    const info = bookItem(this.app, this.item.id, stars, { hintMax: this.hintLevel, extra: { corrections: this.corrections, twin: this.twin } });
    if (this.phone) this.hintBtn.style.visibility = 'hidden';
    flyStars(this.app, this.el, this.panel, this.goalEl, stars, { portrait: this.o === 'portrait', onArrive: () => this.renderGoal() });
    this.bag.timeout(() => {
      void this.say(praiseLine({ kind: this.item.type, retried: this.corrections > 0 || this.twin }), 'celebrating');
      this.guide?.react('hop');
    }, d(900));
    await this.bag.wait(d(1300));
    const portrait = this.o === 'portrait';
    await afterItem(this.app, this.el, this.item.id, info, {
      portrait,
      say: (l) => void this.say(l, 'celebrating'),
      wait: (ms) => this.bag.wait(ms),
      nextRect: this.phone && this.nextSlot ? this.nextSlot : portrait ? { x: 205, y: this.panelRect().y + this.panelRect().h - 110, w: 400, h: 80 } : { x: 1080 - 24 - 72 - 16 - 320, y: 810 - 12 - 84, w: 320, h: 76 },
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
    return { introDone: () => this.introDone, item: () => this.item.id, corrections: () => this.corrections, finished: () => this.finished, busy: () => this.busy, twin: () => this.twin, slots: () => this.slots.slice(), pair: () => this.pair };
  }
}
