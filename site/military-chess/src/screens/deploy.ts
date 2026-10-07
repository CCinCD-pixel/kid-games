/**
 * S5 布阵 (spec §2.5b): only the owner's half, enlarged. Formation bar (3 kid templates, 我的阵 ×3,
 * random), swap by tapping two pieces or dragging one onto another. A swap that would break R3 is
 * refused (both tiles shake back, the guide says why) — so the board is always a legal layout and
 * 开始 is always available. Handicap blanks show as dashed empty slots.
 */
import { createRng } from '@kit/rng';
import { icon } from '@kit/ui';
import type { App } from '../app';
import { RED, SLOTS, isHQ, slotToIndex } from '../core/board';
import { placementRule, randomLayout, swapSlots, validateLayout, applyHandicap } from '../core/layout';
import { typeFromCode } from '../core/pieces';
import type { SavedMatch } from '../ctrl/save';
import { KID_TEMPLATES, TEMPLATES, type DeployFullItem } from '../content';
import { deployStars } from '../core/progress';
import { afterItem, bookItem, flyStars, goalBarHtml } from './item-common';
import { EASE, MS, dm } from '../view/anim';
import { mcIcon } from '../view/icons';
import type { Pt } from '../view/layout';
import { TILE, tileSvg } from '../view/pieces-svg';
import { BaseScreen, abs, button, div } from './base';

export interface DeployNext {
  match: SavedMatch;
  /** who is deploying now (family 明棋: the child first, then Dad) */
  who: 'kid' | 'dad';
  /** 学堂 L7-5 (deploy-full): pick a formation, swap at least `minSwaps` times, 存起来 → 我的阵 1 */
  lesson?: DeployFullItem;
}

/** the deploy screen as the L7-5 lesson item (no match behind it) */
export function lessonDeployNext(it: DeployFullItem): DeployNext {
  const match: SavedMatch = {
    v: 1, id: 'lesson', mode: 'ming', setup: { firstMover: 0 }, actions: [], opponent: { kind: 'ai', level: 1 }, kidSide: 0, kidSeat: 'near',
    tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false,
  };
  return { match, who: 'kid', lesson: it };
}

export const K = 1.3; // tile enlargement on the deploy board

interface Tile {
  el: HTMLDivElement;
  code: string;
  slot: number;
}

export class DeployScreen extends BaseScreen {
  readonly name = 'deploy';
  private layoutStr: string;
  private handicap: string;
  private tiles: Tile[] = [];
  private selected = -1;
  private rot = 0;
  private busy = false;
  private hqTipShown = false;
  private drag: { tile: Tile; start: Pt; active: boolean; id: number } | null = null;
  /** L7-5: swaps made so far, finished */
  private swaps = 0;
  private lessonDone = false;
  private goalEl: HTMLDivElement | null = null;

  constructor(app: App, private next: DeployNext) {
    super(app);
    const m = next.match;
    this.handicap = next.who === 'dad' ? m.setup.handicap?.blue ?? '' : m.setup.handicap?.red ?? '';
    const base = next.who === 'kid' ? app.save.lastLayout ?? TEMPLATES[0].layout : TEMPLATES[0].layout;
    this.layoutStr = this.handicap ? applyHandicap(base.replace(/\./g, ''), this.handicap) : base;
    if (validateLayout(this.layoutStr, this.handicap).length) this.layoutStr = this.handicap ? applyHandicap(TEMPLATES[0].layout, this.handicap) : TEMPLATES[0].layout;
    if (next.lesson) this.layoutStr = TEMPLATES[0].layout;
    this.bag.timeout(() => void this.say(next.lesson ? 'mc.i.L7-5' : next.who === 'kid' ? 'mc.dep.intro' : 'mc.dep.swap'), 300);
  }

  back(): boolean {
    if (this.next.lesson) {
      this.app.go({ name: 'academy', lesson: 'L7' });
      return true;
    }
    if (this.next.who === 'dad') {
      this.app.go({ name: 'deploy', next: { ...this.next, who: 'kid' } });
      return true;
    }
    const m = this.next.match;
    if (m.free) this.app.go({ name: 'ladder', free: true, mode: m.mode });
    else if (m.opponent.kind === 'ai') this.app.go({ name: 'ladder', mode: m.mode });
    else this.app.go({ name: 'family' });
    return true;
  }

  /** face-to-face family game: Dad's screen turns toward his seat */
  private rotation(): number {
    const m = this.next.match;
    if (m.opponent.kind !== 'family' || m.opponent.seating !== 'face') return 0;
    if (this.o === 'portrait') return this.next.who === 'dad' ? 180 : 0;
    return this.next.who === 'dad' ? -90 : 90;
  }

  protected render(): void {
    this.el.replaceChildren();
    this.tiles = [];
    this.selected = -1;
    this.rot = this.rotation();
    // a ±90° rotation in landscape lays the portrait design out and turns it toward the seat
    const designPortrait = this.o === 'portrait' || Math.abs(this.rot) === 90;
    const root = div('mc-deploy');
    if (Math.abs(this.rot) === 90) {
      abs(root, { x: (1080 - 810) / 2, y: (810 - 1080) / 2, w: 810, h: 1080 });
      root.style.transform = `rotate(${this.rot}deg)`;
    } else {
      abs(root, { x: 0, y: 0, w: this.o === 'portrait' ? 810 : 1080, h: this.o === 'portrait' ? 1080 : 810 });
      if (this.rot === 180) root.style.transform = 'rotate(180deg)';
    }
    this.el.appendChild(root);
    const st = Math.abs(this.rot) === 90 ? 16 : this.safeTop;
    const portrait = designPortrait;
    const red = this.next.who === 'kid';
    const side = red ? 0 : 1;

    // header
    const who = this.next.who === 'kid' ? this.next.match.opponent.kind === 'family' ? this.next.match.opponent.names[0] : '' : this.next.match.opponent.kind === 'family' ? this.next.match.opponent.names[1] : '';
    if (this.next.lesson) {
      const goal = div('mc-goal');
      goal.dataset.testid = 'goal-bar';
      goal.innerHTML = goalBarHtml(this.app, { cur: this.next.lesson.id, ico: 'shield', text: this.app.voice.text('mc.i.L7-5'), sub: `<span class="mc-steps" data-testid="swaps">${mcIcon('swap')} ${Math.min(this.swaps, 9)}</span>` });
      goal.addEventListener('click', () => void this.say('mc.i.L7-5'));
      abs(goal, portrait ? { x: 84, y: st + 6, w: 642, h: 84 } : { x: 720, y: st + 6, w: 348, h: 86 });
      if (!portrait) goal.classList.add('is-compact');
      root.appendChild(goal);
      this.goalEl = goal;
    } else {
      const title = div('mc-h2 mc-center', `${who ? who + '：' : ''}摆好你的阵`);
      abs(title, portrait ? { x: 90, y: st + 16, w: 630, h: 44 } : { x: 720, y: st + 12, w: 348, h: 44 });
      root.appendChild(title);
    }

    // formation bar
    const bar = div('mc-formations');
    // one row (QA r2: 7 chips wrapped into 2 cramped rows over the goal bar): 3 named formations,
    // one 我的阵 chip that opens the saved slots, 随机
    const mine = this.app.save.deployments.filter((d) => d);
    const forms: Array<{ id: string; label: string; ico: string; layout: string | null; line: string; act?: () => void }> = [
      ...KID_TEMPLATES.map((t) => ({ id: t.id, label: t.name, ico: mcIcon('flag'), layout: t.layout, line: `mc.dep.t.${t.id}` })),
      { id: 'mine', label: '我的阵', ico: icon('star'), layout: mine.length ? 'mine' : null, line: 'mc.dep.t.mine', act: () => this.openMine() },
      { id: 'random', label: '随机', ico: mcIcon('dice'), layout: 'random', line: 'mc.dep.random' },
    ];
    for (const fm of forms) {
      const b = button(`mc-form${fm.layout ? '' : ' is-empty'}`, `${fm.ico}<span>${fm.label}</span>`, () => (fm.act ? fm.act() : void this.pickFormation(fm.layout, fm.line)), `form-${fm.id}`);
      if (!fm.layout) b.disabled = true;
      bar.appendChild(b);
    }
    abs(bar, portrait ? { x: 14, y: st + 98, w: 782, h: 64 } : { x: 720, y: st + (this.next.lesson ? 100 : 66), w: 348, h: this.next.lesson ? 190 : 236 });
    root.appendChild(bar);

    // board
    const g = this.geom(portrait);
    const board = div('mc-dboard');
    abs(board, { x: g.x, y: g.y, w: g.w, h: g.h });
    board.innerHTML = halfBoardSvg(portrait, g.w, g.h, side);
    root.appendChild(board);
    const t = TILE[portrait ? 'wide' : 'tall'];
    for (let k = 0; k < 25; k++) {
      const code = this.layoutStr[k];
      const el = div('mc-piece mc-dpiece');
      el.dataset.slot = String(k);
      if (code === '.') {
        el.classList.add('is-blank');
        el.innerHTML = `<div class="mc-blank" style="width:${t.w * K}px;height:${t.h * K}px"></div>`;
      } else {
        el.innerHTML = tileSvg({ side, type: typeFromCode(code), shape: portrait ? 'wide' : 'tall', face: 'up' }) + `<i class="mc-sel"></i>${mcIcon('lock', 'mc-lock')}`;
        el.dataset.code = code;
      }
      const tile: Tile = { el, code, slot: k };
      this.tiles.push(tile);
      board.appendChild(el);
      this.place(tile, k);
    }
    this.bindBoardInput(board);

    // buttons
    const saveBtn = button('xg-btn xg-btn--secondary mc-dep-save', `${icon('download')}<span>存起来</span>`, () => this.saveMine(), 'dep-save');
    const go = button('xg-btn xg-btn--primary xg-btn--lg mc-dep-go', `${icon('play')}<span>${this.next.who === 'kid' && this.next.match.mode === 'ming' && this.next.match.opponent.kind === 'family' ? '摆好了' : '开始'}</span>`, () => this.finish(), 'dep-go');
    if (this.next.lesson) {
      // L7-5: 存起来 is the goal; there is no match to start
      saveBtn.className = 'xg-btn xg-btn--primary xg-btn--lg mc-dep-save';
      if (portrait) abs(saveBtn, { x: 205, y: g.y + g.h + 12, w: 400, h: 76 });
      else abs(saveBtn, { x: 720, y: 810 - 16 - 76, w: 348, h: 76 });
      if (!this.lessonDone) root.append(saveBtn);
    } else {
      if (portrait) {
        abs(saveBtn, { x: 40, y: g.y + g.h + 18, w: 200, h: 64 });
        abs(go, { x: 270, y: g.y + g.h + 12, w: 500, h: 76 });
      } else {
        abs(saveBtn, { x: 720, y: 810 - 16 - 76 - 12 - 64, w: 348, h: 64 });
        abs(go, { x: 720, y: 810 - 16 - 76, w: 348, h: 76 });
      }
      root.append(saveBtn, go);
    }

    // guide + caption
    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: 1080 - 16 - 120, w: 100, h: 120 });
      abs(this.caption.el, { x: 140, y: 1080 - 16 - 92, w: 646, h: 80 });
    } else {
      abs(gh, { x: 724, y: st + 314, w: 100, h: 120 });
      abs(this.caption.el, { x: 720, y: st + 444, w: 348, h: 96 });
    }
    root.append(gh, this.caption.el);
    this.placeGuide(gh, 100);
  }

  private geom(portrait: boolean): DeployGeom {
    return deployBoardGeom(portrait, Math.abs(this.rot) === 90 ? 16 : this.safeTop);
  }

  private slotXY(k: number): Pt {
    const portrait = this.o === 'portrait' || Math.abs(this.rot) === 90;
    return this.geom(portrait).cx(k);
  }

  private place(t: Tile, k: number): void {
    const p = this.slotXY(k);
    const portrait = this.o === 'portrait' || Math.abs(this.rot) === 90;
    const ts = TILE[portrait ? 'wide' : 'tall'];
    if (t.code === '.') {
      t.el.style.transform = `translate3d(${p.x - (ts.w * K) / 2}px, ${p.y - (ts.h * K) / 2}px, 0)`;
      return;
    }
    const w = (ts.w + 12) * K, h = (ts.h + 12) * K;
    t.el.style.transform = `translate3d(${p.x - w / 2}px, ${p.y - h / 2}px, 0)`;
    const svg = t.el.firstElementChild as SVGElement;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
  }

  // ------------------------------------------------------------------ interaction
  private bindBoardInput(board: HTMLDivElement): void {
    const toLocal = (ev: PointerEvent): Pt => {
      const r = board.getBoundingClientRect();
      // undo the screen rotation: map the client point into the board's own frame
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      const a = (-this.rot * Math.PI) / 180;
      const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
      const w = parseFloat(board.style.width), h = parseFloat(board.style.height);
      const k = (Math.abs(this.rot) === 90 ? r.height : r.width) / w;
      return { x: rx / k + w / 2, y: ry / k + h / 2 };
    };
    const slotAt = (p: Pt): number => {
      let best = -1, bd = 70 * 70;
      for (let k = 0; k < 25; k++) {
        const c = this.slotXY(k);
        const dd = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      }
      return best;
    };
    board.addEventListener('pointerdown', (ev) => {
      if (this.busy || this.drag) return;
      const p = toLocal(ev);
      const k = slotAt(p);
      if (k < 0) return;
      const tile = this.tiles.find((t) => t.slot === k)!;
      this.drag = { tile, start: p, active: false, id: ev.pointerId };
      try {
        board.setPointerCapture(ev.pointerId);
      } catch {
        /* synthetic */
      }
    });
    board.addEventListener('pointermove', (ev) => {
      const d = this.drag;
      if (!d || d.id !== ev.pointerId || d.tile.code === '.') return;
      const p = toLocal(ev);
      if (!d.active && Math.hypot(p.x - d.start.x, p.y - d.start.y) > 8) {
        d.active = true;
        d.tile.el.classList.add('is-lifted');
        d.tile.el.style.zIndex = '50';
      }
      if (d.active) {
        const portrait = this.o === 'portrait' || Math.abs(this.rot) === 90;
        const ts = TILE[portrait ? 'wide' : 'tall'];
        d.tile.el.style.transform = `translate3d(${p.x - ((ts.w + 12) * K) / 2}px, ${p.y - ((ts.h + 12) * K) / 2 - 10}px, 0)`;
      }
    });
    const end = (ev: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== ev.pointerId) return;
      this.drag = null;
      const p = toLocal(ev);
      const k = slotAt(p);
      if (!d.active) {
        if (k >= 0) this.tapSlot(k);
        return;
      }
      d.tile.el.classList.remove('is-lifted');
      d.tile.el.style.zIndex = '';
      if (k < 0 || k === d.tile.slot) {
        this.place(d.tile, d.tile.slot);
        return;
      }
      this.selected = d.tile.slot;
      void this.trySwap(d.tile.slot, k, true);
    };
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', (ev) => {
      const d = this.drag;
      this.drag = null;
      if (d && d.id === ev.pointerId) {
        d.tile.el.classList.remove('is-lifted');
        this.place(d.tile, d.tile.slot);
      }
    });
  }

  private tileAt(k: number): Tile {
    return this.tiles.find((t) => t.slot === k)!;
  }

  private tapSlot(k: number): void {
    if (this.busy) return;
    const t = this.tileAt(k);
    if (t.code === '.') {
      this.app.play('ui-locked');
      return;
    }
    if (this.selected < 0) {
      this.selected = k;
      t.el.classList.add('is-lifted');
      this.app.play('ui-pick');
      if (isHQ(slotToIndex(RED, SLOTS[k][0], SLOTS[k][1])) && !this.hqTipShown) {
        this.hqTipShown = true;
        t.el.classList.add('show-lock');
        this.bag.timeout(() => t.el.classList.remove('show-lock'), 1200);
        if (!this.app.save.firstRun.seenHqTip) {
          this.app.save.firstRun.seenHqTip = true;
          void this.say('mc.ref.hq');
        }
      }
      return;
    }
    if (this.selected === k) {
      t.el.classList.remove('is-lifted');
      this.selected = -1;
      return;
    }
    void this.trySwap(this.selected, k, false);
  }

  private async trySwap(a: number, b: number, dragged: boolean): Promise<void> {
    const ta = this.tileAt(a), tb = this.tileAt(b);
    this.selected = -1;
    ta.el.classList.remove('is-lifted');
    if (tb.code === '.') {
      this.place(ta, a);
      this.app.play('bump');
      return;
    }
    const ruleA = placementRule(ta.code, b), ruleB = placementRule(tb.code, a);
    const rule = ruleA ?? ruleB;
    if (rule) {
      this.busy = true;
      this.app.play('bump');
      void this.say(`mc.why.deploy.${rule}`, 'encouraging');
      if (dragged) this.place(ta, a);
      await Promise.all([ta, tb].map((t) => t.el.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: dm(300) }).finished.catch(() => undefined)));
      this.busy = false;
      return;
    }
    this.busy = true;
    this.app.play('ui-slide');
    this.swaps++;
    this.layoutStr = swapSlots(this.layoutStr, a, b);
    if (this.next.lesson && this.goalEl) {
      const sw = this.goalEl.querySelector('[data-testid="swaps"]');
      if (sw) sw.innerHTML = `${mcIcon('swap')} ${Math.min(this.swaps, 9)}`;
    }
    ta.slot = b;
    tb.slot = a;
    await Promise.all([this.arc(ta, b, 34), this.arc(tb, a, -34)]);
    this.busy = false;
  }

  private async arc(t: Tile, k: number, lift: number): Promise<void> {
    const from = t.el.style.transform;
    this.place(t, k);
    const to = t.el.style.transform;
    const m1 = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(from), m2 = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(to);
    if (!m1 || !m2) return;
    const mid = `translate3d(${(+m1[1] + +m2[1]) / 2}px, ${(+m1[2] + +m2[2]) / 2 - lift}px, 0)`;
    t.el.style.zIndex = '40';
    await t.el.animate([{ transform: from }, { transform: mid }, { transform: to }], { duration: dm(MS.swap), easing: EASE.inOut }).finished.catch(() => undefined);
    t.el.style.zIndex = '';
  }

  /** 我的阵: the saved slots as thumbnails (empty slots are not offered) */
  private openMine(): void {
    this.app.play('ui-open');
    const scrim = div('mc-scrim');
    const sheet = div('mc-sheet mc-pick-slot');
    sheet.dataset.testid = 'mine-sheet';
    sheet.innerHTML = '<h2>我的阵</h2>';
    const row = div('mc-row');
    this.app.save.deployments.forEach((x, k) => {
      if (!x) return;
      row.appendChild(button('mc-slot-thumb', `${miniLayout(x.layout)}<span>${x.name ?? `我的阵 ${k + 1}`}</span>`, () => {
        drop();
        void this.pickFormation(x.layout, 'mc.dep.t.mine');
      }, `form-my${k}`));
    });
    sheet.appendChild(row);
    sheet.appendChild(button('xg-btn xg-btn--ghost', '<span>算了</span>', () => {
      this.app.play('ui-close');
      drop();
    }));
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) drop();
    });
    scrim.appendChild(sheet);
    const drop = this.keepOverlay(scrim, () => abs(sheet, this.o === 'portrait' ? { x: 60, y: 300, w: 690, h: 360 } : { x: 195, y: 200, w: 690, h: 360 }));
  }

  private async pickFormation(layout: string | null, line: string): Promise<void> {
    if (!layout || this.busy) return;
    let next = layout === 'random' ? randomLayout(createRng().next) : layout;
    if (this.handicap) next = applyHandicap(next.replace(/\./g, ''), this.handicap);
    if (validateLayout(next, this.handicap).length) return;
    void this.say(line);
    this.app.play('shuffle');
    this.busy = true;
    // move tiles of the same code to the new slots (each code keeps its tiles)
    const pool = new Map<string, Tile[]>();
    for (const t of this.tiles) (pool.get(t.code) ?? pool.set(t.code, []).get(t.code)!).push(t);
    const moves: Array<Promise<void>> = [];
    for (let k = 0; k < 25; k++) {
      const t = pool.get(next[k])!.shift()!;
      if (t.slot !== k) {
        t.slot = k;
        moves.push(this.arc(t, k, 18));
      }
    }
    this.layoutStr = next;
    await Promise.all(moves);
    this.busy = false;
  }

  private saveMine(): void {
    if (this.next.lesson) {
      this.lessonSave();
      return;
    }
    if (this.handicap) {
      this.app.play('ui-locked');
      return;
    }
    const d = this.app.save.deployments;
    const store = (k: number) => {
      d[k] = { name: `我的阵 ${k + 1}`, layout: this.layoutStr };
      this.app.persist();
      this.app.play('correct');
      void this.say('mc.dep.saved', 'happy');
      this.render();
    };
    const empty = d.findIndex((x) => !x);
    if (empty >= 0) {
      store(empty);
      return;
    }
    // all three slots used: ask which one to replace (three thumbnails)
    this.app.play('ui-open');
    const scrim = div('mc-scrim');
    const sheet = div('mc-sheet mc-pick-slot');
    sheet.innerHTML = '<h2>换掉哪一个？</h2>';
    const row = div('mc-row');
    d.forEach((x, k) => {
      row.appendChild(button('mc-slot-thumb', `${miniLayout(x!.layout)}<span>${x!.name}</span>`, () => {
        drop();
        store(k);
      }, `slot-${k}`));
    });
    sheet.appendChild(row);
    sheet.appendChild(button('xg-btn xg-btn--ghost', '<span>算了</span>', () => {
      this.app.play('ui-close');
      drop();
    }));
    scrim.appendChild(sheet);
    const drop = this.keepOverlay(scrim, () => abs(sheet, this.o === 'portrait' ? { x: 60, y: 300, w: 690, h: 360 } : { x: 195, y: 200, w: 690, h: 360 }));
  }

  private finish(): void {
    if (this.busy) return;
    const errs = validateLayout(this.layoutStr, this.handicap);
    if (errs.length) return;
    this.app.play('lock-in');
    const m = { ...this.next.match, setup: { ...this.next.match.setup } };
    if (this.next.who === 'kid') {
      m.setup.red = this.layoutStr;
      this.app.save.lastLayout = this.handicap ? null : this.layoutStr;
      this.app.persist();
      if (m.opponent.kind === 'family') {
        void this.say('mc.dep.ready');
        this.app.go({ name: 'deploy', next: { match: m, who: 'dad' } });
        return;
      }
    } else m.setup.blue = this.layoutStr;
    void this.say('mc.dep.ready');
    this.app.go({ name: 'match', setup: m });
  }

  /** L7-5: at least one swap, then the layout becomes 我的阵 1 and the item is done */
  private lessonSave(): void {
    const it = this.next.lesson!;
    if (this.busy || this.lessonDone) return;
    if (this.swaps < it.minSwaps) {
      this.app.play('ui-locked');
      void this.say('mc.dep.swap', 'thinking');
      return;
    }
    this.lessonDone = true;
    this.app.save.deployments[0] = { name: '我的阵 1', layout: this.layoutStr };
    this.app.save.lastLayout = this.layoutStr;
    this.app.play('correct-big');
    void this.say('mc.dep.saved', 'happy');
    const info = bookItem(this.app, it.id, deployStars(0), { hintMax: 0, extra: { swaps: this.swaps } });
    this.render();
    const host = this.el;
    const board = host.querySelector('.mc-dboard');
    if (board && this.goalEl) flyStars(this.app, host, board, this.goalEl, info.stars, { portrait: this.o === 'portrait' });
    const portrait = this.o === 'portrait';
    void this.bag.wait(1300).then(() =>
      afterItem(this.app, host, it.id, info, {
        portrait,
        say: (l) => void this.say(l, 'celebrating'),
        wait: (ms) => this.bag.wait(ms),
        nextRect: portrait ? { x: 205, y: 1080 - 16 - 96 - 100, w: 400, h: 80 } : { x: 720, y: 810 - 16 - 76, w: 348, h: 76 },
        teaches: it.teaches,
        caption: this.caption,
      }),
    );
  }

  /** ?test=1 hooks: current layout, client point of a slot */
  debug() {
    return {
      layout: () => this.layoutStr,
      busy: () => this.busy,
      slotPoint: (k: number) => {
        const t = this.tileAt(k);
        const r = t.el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
    };
  }

  destroy(): void {
    super.destroy();
  }
}


export interface DeployGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  /** centre of layout slot k in board coordinates */
  cx: (k: number) => Pt;
}
/** the enlarged own-half board of S5 (portrait: 150 × 96 pitch; landscape: 110 × 128, front row on the right) */
export function deployBoardGeom(portrait: boolean, top: number): DeployGeom {
  if (portrait) {
    const w = 32 + 5 * 150, h = 32 + 6 * 96;
    return { x: (810 - w) / 2, y: top + 182, w, h, cx: (k) => ({ x: 16 + (SLOTS[k][1] - 1) * 150 + 75, y: 16 + (SLOTS[k][0] - 1) * 96 + 48 }) };
  }
  const w = 32 + 6 * 110, h = 32 + 5 * 128;
  return { x: 12, y: (810 - h) / 2 + 8, w, h, cx: (k) => ({ x: 16 + (6 - SLOTS[k][0]) * 110 + 55, y: 16 + (SLOTS[k][1] - 1) * 128 + 64 }) };
}

export function halfBoardSvg(portrait: boolean, W: number, H: number, side: number): string {
  const hqStroke = side === 0 ? '#c4553f' : '#3f6fb5', hqFill = side === 0 ? '#f2d6cc' : '#d3dff0';
  const P = (r: number, c: number): Pt => (portrait ? { x: 16 + (c - 1) * 150 + 75, y: 16 + (r - 1) * 96 + 48 } : { x: 16 + (6 - r) * 110 + 55, y: 16 + (c - 1) * 128 + 64 });
  const isCampRC = (r: number, c: number) => (r === 2 || r === 4) ? c === 2 || c === 4 : r === 3 && c === 3;
  const isRailRC = (r: number, c: number) => r === 1 || r === 5 || ((c === 1 || c === 5) && r <= 5);
  let roads = '', rails = '', diag = '', stations = '';
  for (let r = 1; r <= 6; r++) for (let c = 1; c <= 5; c++) {
    const a = P(r, c);
    if (c < 5) {
      const b = P(r, c + 1);
      if (isRailRC(r, c) && isRailRC(r, c + 1) && (r === 1 || r === 5)) rails += `M${a.x} ${a.y}L${b.x} ${b.y}`;
      else roads += `M${a.x} ${a.y}L${b.x} ${b.y}`;
    }
    if (r < 6) {
      const b = P(r + 1, c);
      if ((c === 1 || c === 5) && r + 1 <= 5) rails += `M${a.x} ${a.y}L${b.x} ${b.y}`;
      else roads += `M${a.x} ${a.y}L${b.x} ${b.y}`;
    }
    if (isCampRC(r, c)) for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 1 || rr > 6 || cc < 1 || cc > 5) continue;
      const b = P(rr, cc);
      diag += `M${a.x} ${a.y}L${b.x} ${b.y}`;
    }
    if (isCampRC(r, c)) stations += `<circle cx="${a.x}" cy="${a.y}" r="30" fill="#f7efdc" fill-opacity=".92" stroke="#5e3a1c" stroke-width="2.4"/><circle cx="${a.x}" cy="${a.y}" r="24" fill="none" stroke="#5e3a1c" stroke-opacity=".6"/><text x="${a.x}" y="${a.y + 6}" text-anchor="middle" class="mc-board-glyph" style="font-size:17px">营</text>`;
    else if (r === 6 && (c === 2 || c === 4)) {
      const w = portrait ? 132 : 92, h = portrait ? 80 : 112;
      stations += `<rect x="${a.x - w / 2}" y="${a.y - h / 2}" width="${w}" height="${h}" rx="10" fill="${hqFill}" stroke="${hqStroke}" stroke-width="3.5"/><text x="${a.x}" y="${a.y + 6}" text-anchor="middle" class="mc-board-glyph" style="font-size:17px">本</text>`;
    } else stations += `<circle cx="${a.x}" cy="${a.y}" r="5" fill="${isRailRC(r, c) ? '#2a241d' : '#f4ecd3'}"/>`;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <rect width="${W}" height="${H}" rx="18" fill="#5e3a1c"/><rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17" fill="url(#mc-wood-g)"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="7" fill="#3a2210"/><rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="5" fill="#7f9452"/>
    <path d="${roads}" stroke="#f4ecd3" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="${diag}" stroke="#f4ecd3" stroke-width="2.4" stroke-dasharray="5 5" fill="none"/>
    <path d="${rails}" stroke="#2a241d" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="${rails}" stroke="#f1e8cf" stroke-width="7" stroke-dasharray="12 12" fill="none"/>
    ${stations}</svg>`;
}

/** tiny 6×5 colour grid of a layout (slot picker thumbnails) */
function miniLayout(layout: string): string {
  let k = 0;
  let cells = '';
  for (let r = 1; r <= 6; r++) {
    for (let c = 1; c <= 5; c++) {
      const camp = (r === 2 || r === 4) ? c === 2 || c === 4 : r === 3 && c === 3;
      const x = (c - 1) * 22 + 2, y = (r - 1) * 16 + 2;
      if (camp) {
        cells += `<circle cx="${x + 10}" cy="${y + 7}" r="5" fill="#f7efdc"/>`;
        continue;
      }
      const ch = layout[k++];
      const col = ch === 'F' ? '#f6c548' : ch === 'M' ? '#3a3a3a' : ch === 'B' ? '#e4513d' : '#b8342a';
      cells += `<rect x="${x}" y="${y}" width="20" height="14" rx="3" fill="${col}"/>`;
    }
  }
  return `<svg viewBox="0 0 114 100" width="148" height="130" aria-hidden="true"><rect width="114" height="100" rx="6" fill="#7f9452"/>${cells}</svg>`;
}
