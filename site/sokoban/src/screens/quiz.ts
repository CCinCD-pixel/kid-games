/**
 * S6 侦探题 (spec §3.7, §4.4): three static boards in turn (a board flips in, 300 ms; 小推 is not on
 * them). "哪些箱子再也推不到台上？" — the child taps crates to put a magnifier on them (tap again to take
 * it off), then 检查. The reveal is a detective's discovery, never a "wrong":
 *  - a dead crate he found: ✕ + its type ("这是墙角/墙边/并排/四方块", voiced) + a ≤ 2 s ghost
 *    demonstration of why (corner, pair, square: a ghost 小推 tries every push it can reach and bumps;
 *    wall: a ghost crate slides along the wall to both ends — no pad on the way);
 *  - a dead crate he missed: the same, with a little ghost hand by the label and "这个也没救了，你看";
 *  - a live crate he marked: the mark turns into a cyan ✓ and a ghost pushes it home along its own
 *    single-crate line (≤ 8 pushes, ≤ 2 s), "这个还能推到台上，你看";
 *  - a crate already on its pad that he marked: "在台上的，已经到家啦".
 * All right the first time counts; otherwise the board's twin (mirror / flip / rot180) comes for one
 * more try ("换个方向，再找一次"), revealed whatever happens. ★★★ = all three right first time, ★★ two.
 */
import type { LayoutInfo } from '@kit/shell';
import { icon, showResult, type ResultAction } from '@kit/ui';
import { nb, parseLevel } from '@engines/puzzle/src/level';
import { OPP, type Dir } from '@engines/puzzle/src/types';
import { stopMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import { chapterEmblem } from '../art/emblems';
import { applyQuizResult, hallFor, type Outcome } from '../app/collection';
import type { AppCtx, Screen } from '../app/context';
import { nextAfter } from '../app/unlock';
import { noteActive, noteLevel, storeVisit } from '../app/visit';
import { QUIZZES, type DeadKind, type LevelDef, type QuizBoard, type QuizSide } from '../data';
import { quizStars } from '../game/stars';
import { attachBoardInput, type BoardGesture } from '../input/boardInput';
import { mountSky } from '../render/backdrop';
import { BoardView } from '../render/board';
import { HALLS } from '../render/halls';
import { playLayout, type Rect } from '../render/layout';
import { CompanionStrip } from './companion';
import { ceremonies, follow } from './flow';
import { setPhraseText } from './wrap';

/** The play grid; on a phone in portrait the instruction bar takes a row under the board. */
function quizLayout(l: LayoutInfo) {
  const g = playLayout(l.width, l.height, l.safe.top, l.safe);
  if (g.phone && g.orientation === 'portrait') g.board = { ...g.board, h: g.board.h - 70 };
  return g;
}

const TYPE_NAME: Record<DeadKind, string> = { corner: '墙角', wall: '墙边', pair: '并排', square: '四方块' };

export class QuizScreen implements Screen {
  readonly ownsClock = true;
  readonly el: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly plate: HTMLButtonElement;
  private readonly chip: HTMLDivElement;
  private readonly host: HTMLDivElement;
  private readonly inputLayer: HTMLDivElement;
  private readonly strip: CompanionStrip;
  private readonly bar: HTMLDivElement;
  private readonly checkBtn: HTMLButtonElement;
  private readonly mapBtn: HTMLButtonElement;
  private readonly labels: HTMLDivElement;
  board: BoardView | null = null;
  private side: QuizSide | null = null;
  private readonly boards: QuizBoard[];
  idx = 0;
  /** 0 = the board itself, 1 = its twin (the retry) */
  attempt = 0;
  firstTry = 0;
  readonly marked = new Set<number>();
  private busy = false;
  /** waiting for 下一块 / 再找一次 */
  private stage: 'mark' | 'reveal' | 'after' = 'mark';
  private detach: (() => void) | null = null;
  private destroyed = false;
  private activeMs = 0;
  private t0 = performance.now();

  constructor(private readonly ctx: AppCtx, readonly def: LevelDef) {
    const quiz = QUIZZES[def.quiz ?? ''];
    if (!quiz) throw new Error(`no quiz ${def.quiz}`);
    this.boards = quiz.boards;
    stopMusic();
    this.el = document.createElement('div');
    this.el.className = 'sok-play sok-quiz';
    this.el.dataset.level = def.id;
    ctx.app.append(this.el);
    mountSky(document.body, HALLS[hallFor(def)].sky, def.id);
    this.hud = document.createElement('div');
    this.hud.className = 'sok-hud';
    this.plate = document.createElement('button');
    this.plate.type = 'button';
    this.plate.className = 'sok-plate';
    this.plate.innerHTML = `<span class="sok-plate__badge">${chapterEmblem('ch3', 40)}</span><span class="sok-plate__title"><b>${def.id}</b> ${def.name}</span>`;
    this.plate.addEventListener('click', () => void this.strip.say('sok.quiz.ask', { mood: 'encouraging' }));
    this.chip = document.createElement('div');
    this.chip.className = 'xg-chip sok-pushes sok-quiz__count';
    this.chip.dataset.testid = 'quiz-count';
    this.hud.append(this.plate, this.chip);
    this.el.append(this.hud);
    this.host = document.createElement('div');
    this.host.className = 'sok-boardhost';
    this.el.append(this.host);
    this.labels = document.createElement('div');
    this.labels.className = 'sok-qlabels';
    this.el.append(this.labels);
    this.inputLayer = document.createElement('div');
    this.inputLayer.className = 'sok-input';
    this.inputLayer.dataset.testid = 'board';
    this.el.append(this.inputLayer);
    this.strip = new CompanionStrip(this.el, ctx.voice);
    this.bar = document.createElement('div');
    this.bar.className = 'sok-quizbar';
    const rep = document.createElement('button');
    rep.type = 'button';
    rep.className = 'xg-iconbtn xg-iconbtn--sm';
    rep.setAttribute('aria-label', '再听一遍');
    rep.innerHTML = icon('replay');
    rep.addEventListener('click', () => void this.strip.say('sok.quiz.bar', { mood: 'encouraging', interrupt: true }));
    this.bar.innerHTML = `<span class="sok-quizbar__icon" aria-hidden="true">${icon('zoom-in')}</span><span class="sok-quizbar__text">${ctx.voice.text('sok.quiz.bar')}</span>`;
    const barText = this.bar.querySelector<HTMLElement>('.sok-quizbar__text');
    if (barText) setPhraseText(barText, ctx.voice.text('sok.quiz.bar'));
    this.bar.append(rep);
    this.el.append(this.bar);
    this.checkBtn = document.createElement('button');
    this.checkBtn.type = 'button';
    this.checkBtn.className = 'xg-btn xg-btn--primary xg-btn--lg sok-act sok-quiz__check';
    this.checkBtn.dataset.testid = 'quiz-check';
    this.checkBtn.innerHTML = `${icon('check')}<span>检查</span>`;
    this.checkBtn.addEventListener('click', () => void this.onCheck());
    this.mapBtn = document.createElement('button');
    this.mapBtn.type = 'button';
    this.mapBtn.className = 'xg-iconbtn xg-iconbtn--lg sok-act sok-act--map';
    this.mapBtn.setAttribute('aria-label', '地图');
    this.mapBtn.innerHTML = icon('map');
    this.mapBtn.addEventListener('click', () => this.ctx.go({ name: 'map', tab: 3 }));
    this.el.append(this.checkBtn, this.mapBtn);
    this.detach = attachBoardInput(this.inputLayer, {
      swipeOn: () => false,
      enabled: () => this.stage === 'mark' && !this.busy,
      onGesture: (g) => this.onGesture(g),
    });
    ctx.marks.add('level-start', { id: def.id, track: 'quiz' });
    this.layout(ctx.layout());
    void this.open(0, 0, true);
  }

  private get geom() {
    return quizLayout(this.ctx.layout());
  }

  layout(l: LayoutInfo): void {
    const g = quizLayout(l);
    const place = (el: HTMLElement, r: Rect) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    this.el.dataset.orient = g.orientation;
    this.el.toggleAttribute('data-phone', g.phone);
    place(this.hud, g.hud);
    place(this.inputLayer, g.board);
    if (g.phone && g.orientation === 'portrait') {
      // phone portrait: 检查 + 地图 on the key row, the instruction bar full width over the strip
      const y = g.actions.map.y;
      place(this.checkBtn, { x: 16, y, w: g.actions.map.x - 12 - 16, h: g.actions.map.h });
      place(this.mapBtn, g.actions.map);
      place(this.bar, { x: g.side.x, y: g.board.y + g.board.h + 6, w: g.side.w, h: 64 });
      this.strip.layout(g.side, g.stripMode);
    } else if (g.phone) {
      const col = g.side;
      place(this.bar, { x: col.x, y: g.actions.restart.y, w: col.w - g.actions.map.w - 8, h: g.actions.map.h });
      place(this.checkBtn, { x: col.x, y: g.actions.undo.y, w: col.w, h: g.actions.undo.h });
      place(this.mapBtn, g.actions.map);
      this.strip.layout(col, g.stripMode);
    } else if (g.orientation === 'portrait') {
      const y = g.actions.undo.y;
      place(this.bar, { x: 16, y, w: l.width - 16 - 92 - 8 - 176 - 8, h: 76 });
      place(this.checkBtn, { x: l.width - 92 - 8 - 176, y, w: 176, h: 76 });
      place(this.mapBtn, g.actions.map);
      this.strip.layout(g.side, g.orientation);
    } else {
      const col = g.side;
      place(this.bar, { x: col.x, y: g.actions.restart.y - 8 - 120, w: col.w, h: 120 });
      place(this.checkBtn, { x: col.x, y: g.actions.undo.y, w: col.w, h: 76 });
      place(this.mapBtn, g.actions.map);
      this.strip.layout({ x: col.x, y: col.y, w: col.w, h: Math.max(140, g.actions.restart.y - 8 - 120 - 8 - col.y) }, g.orientation);
    }
    this.board?.layout(g.board);
    this.placeLabels();
    mountSky(document.body, HALLS[hallFor(this.def)].sky, this.def.id);
  }

  pause(): void {
    this.activeMs += performance.now() - this.t0;
    this.board?.setHidden(true);
  }

  resume(): void {
    this.t0 = performance.now();
    this.board?.setHidden(false);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.stage !== 'after') {
      const ms = Math.round(this.activeMs + performance.now() - this.t0);
      // left unfinished: book the active time into the visit (this screen owns the clock)
      noteActive(this.ctx.visit, ms);
      storeVisit(this.ctx.visit);
      this.ctx.marks.add('level-leave', { id: this.def.id, pushes: 0, ms });
    }
    this.ctx.marks.flush();
    this.detach?.();
    this.strip.destroy();
    this.board?.destroy();
    this.el.remove();
  }

  // ------------------------------------------------------------------ boards

  private async open(idx: number, attempt: number, first = false): Promise<void> {
    this.idx = idx;
    this.attempt = attempt;
    this.stage = 'mark';
    this.marked.clear();
    this.labels.textContent = '';
    const B = this.boards[idx];
    const side: QuizSide = attempt === 0 ? B : B.twin;
    this.side = side;
    this.chip.innerHTML = `<b>第 ${idx + 1}/${this.boards.length} 块</b>`;
    this.el.dataset.board = `${B.id}${attempt ? '~twin' : ''}`;
    this.board?.destroy();
    const l = parseLevel(side.map, `${this.def.id}:${B.id}${attempt ? 't' : ''}`);
    this.board = new BoardView(this.host, {
      level: l, hall: HALLS[hallFor(this.def)], levelId: `${this.def.id}-${B.id}`, crates: l.start.boxes, player: l.start.player,
      reducedMotion: this.ctx.reduced, instant: this.ctx.instant, slowmo: this.ctx.slowmo, sfx: (n, o) => playSfx(n, o), showRobot: false,
    });
    this.board.layout(this.geom.board);
    this.checkBtn.innerHTML = `${icon('check')}<span>检查</span>`;
    this.checkBtn.dataset.mode = 'check';
    this.checkBtn.toggleAttribute('aria-disabled', false);
    this.busy = true;
    await this.board.flipIn();
    this.busy = false;
    if (this.destroyed) return;
    if (first) {
      await this.strip.say('sok.quiz.ask', { mood: 'encouraging' });
      // the how-to line only while he is still marking (a reveal's lines must never be cut off by it)
      if (!this.destroyed && this.stage === 'mark' && !this.busy) void this.strip.say('sok.quiz.tap', { mood: 'encouraging', polite: true });
    } else if (attempt === 1) void this.strip.say('sok.quiz.again', { mood: 'encouraging' });
  }

  private slotAt(r: number, c: number): number {
    const b = this.board!;
    return b.crates.findIndex((x) => Math.round(x.x) === c && Math.round(x.y) === r);
  }

  private onGesture(g: BoardGesture): void {
    if (g.kind !== 'tap' || !this.board) return;
    const hit = this.board.hitTest(g.x, g.y);
    if (hit.kind !== 'crate') return; // walls and floor: no reaction (spec §3.10)
    const on = !this.marked.has(hit.slot);
    if (on) this.marked.add(hit.slot);
    else this.marked.delete(hit.slot);
    this.board.setQuizMark(hit.slot, on);
    playSfx('ui-pop', { volume: 0.6 });
    this.el.dataset.marked = String(this.marked.size);
  }

  /** Tap a crate cell through the real input path (tests: __sok.quiz). */
  tapCrate(r: number, c: number): void {
    const slot = this.slotAt(r, c);
    if (slot < 0 || !this.board) return;
    const p = this.board.crateCenterPage(slot);
    this.onGesture({ kind: 'tap', x: p.x, y: p.y });
  }

  get isBusy(): boolean {
    return this.busy;
  }

  /** 检查 / 下一块 / 再找一次 / 完成 (tests call it like a tap on the button). */
  check(): Promise<void> {
    return this.onCheck();
  }

  get correctCells(): { r: number; c: number }[] {
    return (this.side?.dead ?? []).map((d) => ({ r: d.r, c: d.c }));
  }

  // ------------------------------------------------------------------ the reveal

  private async onCheck(): Promise<void> {
    if (this.busy || !this.board || !this.side) return;
    if (this.checkBtn.dataset.mode === 'next') {
      await this.advance();
      return;
    }
    this.busy = true;
    this.stage = 'reveal';
    this.checkBtn.toggleAttribute('aria-disabled', true);
    const side = this.side;
    const deadSlots = side.dead.map((d) => this.slotAt(d.r, d.c));
    const aliveMarked = side.alive.filter((a) => this.marked.has(this.slotAt(a.r, a.c)));
    const homeMarked = side.home.filter((h) => this.marked.has(this.slotAt(h.r, h.c)));
    const allRight = deadSlots.every((s) => this.marked.has(s)) && !aliveMarked.length && !homeMarked.length;
    const doneBlocks = new Set<string>();
    for (const d of side.dead) {
      if (this.destroyed) return;
      const slot = this.slotAt(d.r, d.c);
      const found = this.marked.has(slot);
      this.board.setQuizMark(slot, false);
      this.revealDead(slot);
      this.addLabel(slot, `这是${TYPE_NAME[d.type]}`, !found, d.type);
      const line = found ? `sok.quiz.w.${d.type}` : 'sok.quiz.missed';
      const said = this.strip.say(line, { mood: found ? 'happy' : 'encouraging', interrupt: true });
      await Promise.all([said, this.why(slot, d.type, doneBlocks)]);
      if (!found && !this.destroyed) await this.strip.say(`sok.quiz.w.${d.type}`, { mood: 'encouraging', interrupt: true });
    }
    for (const a of aliveMarked) {
      if (this.destroyed) return;
      const slot = this.slotAt(a.r, a.c);
      this.board.setQuizMark(slot, true, true);
      const said = this.strip.say('sok.quiz.alive', { mood: 'encouraging', interrupt: true });
      await Promise.all([said, this.board.ghostLine(a.demo, this.board.level.start.player, 2000)]);
    }
    for (const h of homeMarked) {
      if (this.destroyed) return;
      const slot = this.slotAt(h.r, h.c);
      this.board.setQuizMark(slot, false);
      this.addLabel(slot, '到家啦', false);
      await this.strip.say('sok.quiz.home', { mood: 'happy', interrupt: true });
    }
    if (this.destroyed) return;
    if (allRight) {
      playSfx('correct');
      if (this.attempt === 0) this.firstTry += 1;
      await this.strip.say('sok.quiz.right', { mood: 'celebrating', interrupt: true });
    }
    this.busy = false;
    this.checkBtn.toggleAttribute('aria-disabled', false);
    this.checkBtn.dataset.mode = 'next';
    const last = this.idx === this.boards.length - 1;
    const retry = !allRight && this.attempt === 0;
    this.checkBtn.innerHTML = retry ? `${icon('restart')}<span>再找一次</span>` : `${icon('next')}<span>${last ? '完成' : '下一块'}</span>`;
    this.checkBtn.dataset.next = retry ? 'retry' : last ? 'done' : 'next';
    this.checkBtn.classList.remove('is-ready');
    void this.checkBtn.offsetWidth;
    this.checkBtn.classList.add('is-ready');
  }

  private revealDead(slot: number): void {
    const b = this.board!;
    const m = { t: 0 };
    b.marks.set(slot, m);
    b.crates[slot].look.dead = true;
    playSfx('try-again', { volume: 0.5 });
    void b.anim.add(180, (v) => (m.t = v));
    b.requestFrame();
  }

  /** ≤ 2 s ghost demonstration of why a crate can never reach a pad. */
  private async why(slot: number, type: DeadKind, done: Set<string>): Promise<void> {
    const b = this.board!;
    const l = b.level;
    const cell = Math.round(b.crates[slot].y) * l.W + Math.round(b.crates[slot].x);
    const occupied = new Set(b.crates.map((c) => Math.round(c.y) * l.W + Math.round(c.x)));
    const free = (i: number) => i >= 0 && !!l.floor[i] && !occupied.has(i);
    if (type === 'wall') {
      // slide along the wall it is stuck on (to both ends and back): no pad anywhere on the way
      const isWall = (i: number) => i < 0 || !l.floor[i];
      const axis: Dir[] = isWall(nb(l, cell, 0)) || isWall(nb(l, cell, 1)) ? [2, 3] : [0, 1];
      const path: number[] = [];
      for (const d of axis) {
        let p = cell;
        const run: number[] = [];
        for (;;) {
          const q = nb(l, p, d);
          if (!free(q)) break;
          run.push(q);
          p = q;
        }
        if (run.length) path.push(...run, ...run.slice(0, -1).reverse(), cell);
      }
      if (path.length) await b.ghostSlide(slot, path);
      return;
    }
    // corner / pair / square: every push the ghost can try on this crate (and its block) bumps
    const block = type === 'corner' ? [slot] : this.blockOf(slot);
    const key = block.slice().sort().join(',');
    if (done.has(key)) return;
    done.add(key);
    const tries: { stand: number; dir: number }[] = [];
    for (const s of block) {
      const c = Math.round(b.crates[s].y) * l.W + Math.round(b.crates[s].x);
      for (let d = 0; d < 4; d += 1) {
        const stand = nb(l, c, OPP[d]);
        if (free(stand)) tries.push({ stand, dir: d });
      }
    }
    await b.ghostTries(tries.slice(0, 6));
  }

  /** The dead crates sharing a frozen 2×2 with this one (pair / square). */
  private blockOf(slot: number): number[] {
    const side = this.side!;
    const me = side.dead.find((d) => this.slotAt(d.r, d.c) === slot)!;
    return side.dead.filter((d) => d.type === me.type && Math.abs(d.r - me.r) <= 1 && Math.abs(d.c - me.c) <= 1).map((d) => this.slotAt(d.r, d.c));
  }

  private addLabel(slot: number, text: string, missed: boolean, type?: DeadKind): void {
    const el = document.createElement('div');
    el.className = `sok-qlabel${missed ? ' is-missed' : ''}`;
    el.dataset.slot = String(slot);
    if (type) el.dataset.type = type;
    el.innerHTML = `${missed ? '<span class="sok-qlabel__hand" aria-hidden="true"></span>' : ''}<span>${text}</span>`;
    this.labels.append(el);
    this.placeLabels();
  }

  private placeLabels(): void {
    if (!this.board) return;
    for (const el of Array.from(this.labels.children) as HTMLElement[]) {
      const p = this.board.crateCenterPage(Number(el.dataset.slot));
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y - this.board.s * 0.62}px`;
    }
  }

  private async advance(): Promise<void> {
    const mode = this.checkBtn.dataset.next;
    if (mode === 'retry') {
      await this.open(this.idx, 1);
      return;
    }
    if (mode === 'next') {
      await this.open(this.idx + 1, 0);
      return;
    }
    await this.finish();
  }

  // ------------------------------------------------------------------ result

  private async finish(): Promise<void> {
    this.stage = 'after';
    this.busy = true;
    const ctx = this.ctx;
    const def = this.def;
    const stars = quizStars(this.firstTry);
    let outcome: Outcome | null = null;
    ctx.save.update((d) => {
      outcome = applyQuizResult(d, def, this.firstTry, stars);
    });
    const o = outcome as unknown as Outcome;
    const ms = Math.round(this.activeMs + performance.now() - this.t0);
    noteLevel(ctx.visit, { id: def.id, ch: def.ch, h3: false, activeMs: ms, launched: false });
    storeVisit(ctx.visit);
    ctx.hub();
    ctx.marks.add('quiz', { id: def.id, firstTry: this.firstTry });
    ctx.marks.flush();
    const next = nextAfter(ctx.save.data, def.id, o.firstPass);
    const actions: ResultAction[] = [
      { id: 'next', label: next.kind === 'map' ? '回地图' : '下一关', kind: 'primary', icon: 'next' },
      { id: 'again', label: '再来一次', kind: 'secondary', icon: 'restart' },
      ...(next.kind === 'map' ? [] : [{ id: 'map', label: '地图', kind: 'secondary' as const, icon: 'map' as const }]),
    ];
    void ctx.voice.say('sok.quiz.right', { interrupt: true });
    const choice = await showResult({
      ribbon: `${def.id} ${def.name}`,
      stars,
      title: ctx.voice.text('sok.quiz.right'),
      stats: [{ label: '第一次就找对', value: `${this.firstTry} / ${this.boards.length}` }],
      actions,
      accentGame: 'porter',
      onOpen: (panel) => {
        panel.classList.add('sok-result');
        panel.dataset.testid = 'result';
        panel.dataset.stars = String(stars);
      },
    });
    if (this.destroyed) return;
    ctx.voice.stop();
    if ((await ceremonies(ctx, def, o, () => !this.destroyed)) === 'hub' || this.destroyed) return;
    await follow(ctx, def, choice, next, o);
  }
}
