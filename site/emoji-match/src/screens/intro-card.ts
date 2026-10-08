/**
 * S3a element intro card (spec §2.1, §4.6): a wordless, looping demo on a tiny fixed board played by
 * the REAL engine (refill off, seed 0) with the real sprites, the director's animations and the
 * ghost hand; 1–3 voice lines with subtitles + 再听一遍 (the kit subtitle bar docked into the card);
 * 「知道了」 (64 px). Shown automatically once before the first attempt of an intro level, again from
 * the level card's "i" button or the hangar. A booster card grants that booster the first time
 * (spec §5.5: drill-intro / tractor-intro / ion-intro, idempotent).
 */
import { bindPress, icon, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import { INTROS, LINES, type IntroData } from '../content';
import { applyBooster, applyMove, assignUids, newGame, parseLevel, type GameState } from '../core';
import { stepToOp } from '../core/expect';
import type { AppCtx } from '../ctx';
import { chime, coin, play as sfx } from '../audio';
import { grantFor, INTRO_GRANTS } from '../save';
import { buildAtlas, type Atlas } from '../view/atlas';
import { BoardCanvas } from '../view/board-canvas';
import { direct, directShake, type DirectCtx, type GoalTrack } from '../view/director';
import { Fx } from '../view/fx';
import { GhostHand } from '../view/ghost-hand';
import { energySvg } from '../view/icons';
import type { PlayLayout } from '../view/layout';
import { Scene } from '../view/scene';
import { Timeline } from '../view/timeline';
import { dirSvg, toolSvg } from '../view/art/tools';

export const introLines = (id: string): string[] => LINES.filter((l) => l.id.startsWith(`em.intro.${id}.`)).map((l) => l.id).sort();

/** marks the card as seen and applies its grant; returns true when a booster was granted now */
export function markIntroSeen(app: AppCtx, id: string): boolean {
  const s = app.save.data;
  if (!s.intros.includes(id)) s.intros.push(id);
  const granted = grantFor(s, { k: 'intro', id }) !== null;
  app.save.commit();
  return granted;
}

interface Box { w: number; h: number; cell: number; ox: number; oy: number }

class IntroPlayer {
  st!: GameState;
  scene!: Scene;
  board: BoardCanvas;
  fx: Fx;
  tl = new Timeline();
  ghost: GhostHand;
  atlas: Atlas | null = null;
  box!: Box;
  moves = 5;
  energy = 0;
  private raf = 0;
  private last = 0;
  private alive = true;
  private shakeT = 0;
  constructor(private stage: HTMLElement, private host: HTMLElement, private it: IntroData, private ui: { moves: HTMLElement | null; tool: HTMLElement | null; dir: HTMLElement | null; energy: HTMLElement | null }, private lessFx: boolean) {
    this.board = new BoardCanvas(stage);
    this.fx = new Fx(host);
    this.ghost = new GhostHand(host);
  }
  private newState(): void {
    const it = this.it;
    this.st = newGame(parseLevel({ id: `intro-${it.id}`, colors: it.colors ?? 'rygbp', grid: it.grid, dust: it.dust, ice: it.ice, exits: it.exits, objectives: it.objectives ?? [{ energy: 999 }], refill: false, fixedBoard: true }), 0, { record: true });
    assignUids(this.st);
    this.st.log = [];
    this.scene = new Scene(this.st);
  }
  /** fit the board into `boxEl` (a placeholder inside the host); stage + fx live in the host.
   *  Layout offsets (not getBoundingClientRect): the modal pops in with a scale transform. */
  async layout(boxEl: HTMLElement, dpr: number): Promise<void> {
    if (!this.st) this.newState();
    const bw = boxEl.offsetWidth, bh = boxEl.offsetHeight, hw = this.host.clientWidth, hh = this.host.clientHeight;
    if (bw < 40 || bh < 40) return;
    const W = this.st.W, H = this.st.H, rim = 10;
    const cell = Math.max(40, Math.floor(Math.min(96, (bw - 2 * rim) / W, (bh - 2 * rim) / H) / 2) * 2);
    const pw = W * cell + 2 * rim, ph = H * cell + 2 * rim;
    this.box = { w: hw, h: hh, cell, ox: Math.round(boxEl.offsetLeft + (bw - pw) / 2), oy: Math.round(boxEl.offsetTop + (bh - ph) / 2) };
    this.stage.style.left = `${this.box.ox}px`; this.stage.style.top = `${this.box.oy}px`;
    const l = { cell, rim, panel: { x: 0, y: 0, w: pw, h: ph } } as unknown as PlayLayout;
    this.board.setup(l, this.scene, dpr, 1);
    this.fx.resize(hw, hh, Math.min(2, dpr));
    this.fx.cellPx = cell; this.fx.lessFx = this.lessFx;
    const size = Math.round(cell * Math.min(2, dpr));
    if (!this.atlas || this.atlas.size !== size) {
      const a = await buildAtlas(size);
      if (!this.alive) { a.dispose(); return; }
      this.atlas?.dispose(); this.atlas = a; this.fx.atlas = a;
    }
    this.draw();
  }
  /** cell centre in the host's coordinates */
  c(rc: [number, number]): { x: number; y: number } { return { x: this.box.ox + 10 + (rc[1] + 0.5) * this.box.cell, y: this.box.oy + 10 + (rc[0] + 0.5) * this.box.cell }; }
  /** element centre in host coordinates, from layout offsets (immune to the modal's scale-in) */
  private center(el: HTMLElement): { x: number; y: number } {
    let x = el.offsetWidth / 2, y = el.offsetHeight / 2, e: HTMLElement | null = el;
    while (e && e !== this.host) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent as HTMLElement | null; }
    return { x, y };
  }
  private draw(): void { this.board.draw(this.scene, this.atlas); this.fx.draw(); }
  private kick(): void { if (!this.raf && this.alive) { this.last = 0; this.raf = requestAnimationFrame(this.frame); } }
  private frame = (ts: number) => {
    this.raf = 0;
    const dt = this.last ? Math.min(50, ts - this.last) : 16;
    this.last = ts;
    const live = this.tl.step(dt);
    this.fx.step(dt);
    if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt); const k = this.shakeT / 260; this.stage.style.transform = `translate(${(Math.sin(ts / 14) * 5 * k).toFixed(1)}px, 0)`; } else this.stage.style.transform = '';
    this.draw();
    if (live || this.fx.busy || this.shakeT > 0) this.raf = requestAnimationFrame(this.frame);
  };
  private wait(ms: number): Promise<void> { return new Promise((r) => window.setTimeout(r, ms)); }
  private settled(): Promise<void> {
    return new Promise((res) => { const chk = () => (!this.alive || (!this.tl.running && !this.fx.busy) ? res() : window.setTimeout(chk, 40)); this.kick(); window.setTimeout(chk, 40); });
  }
  private dctx(goals: GoalTrack[], e0: number): DirectCtx {
    return {
      scene: this.scene, board: this.board, fx: this.fx, tl: this.tl, panelX: this.box.ox, panelY: this.box.oy,
      goals, energy0: e0, energy1: this.st.energy, lessFx: this.lessFx,
      hooks: {
        sfx: (n, o) => sfx(n, o), chime: (s) => chime(s), coin: (_g, n) => coin(n),
        shake: () => { if (!this.lessFx) this.shakeT = 260; },
        callout: () => {}, goalArrive: () => {}, goalTarget: () => (this.ui.energy ? this.center(this.ui.energy) : null), mood: () => {},
        energy: (v) => { if (this.ui.energy) this.ui.energy.innerHTML = energySvg(Math.min(1, v / 12)); },
      },
    };
  }
  /** play the script once (the caller loops it) */
  async run(): Promise<void> {
    this.newState();
    this.moves = 5;
    if (this.ui.moves) this.ui.moves.querySelector('b')!.textContent = String(this.moves);
    if (this.ui.energy) this.ui.energy.innerHTML = energySvg(0);
    this.ui.tool?.classList.remove('is-on'); this.ui.dir?.classList.remove('is-on');
    this.board.setup({ cell: this.box.cell, rim: 10, panel: { x: 0, y: 0, w: this.st.W * this.box.cell + 20, h: this.st.H * this.box.cell + 20 } } as unknown as PlayLayout, this.scene, Math.min(2, devicePixelRatio || 1), 1);
    this.stage.classList.remove('is-fading');
    this.draw();
    await this.wait(550);
    for (const step of this.it.steps) {
      if (!this.alive) return;
      const op = stepToOp(this.st, step);
      if ('booster' in step) {
        // tap the tool, (ion: pick 竖), then the cell
        if (this.ui.tool) { const p = this.center(this.ui.tool); await this.ghost.once(p.x, p.y, p.x, p.y, 640); this.ui.tool.classList.add('is-on'); sfx('ui-select', { gain: 0.6 }); }
        if (step.booster.t === 'ion' && this.ui.dir) { const p = this.center(this.ui.dir); await this.ghost.once(p.x, p.y, p.x, p.y, 600); this.ui.dir.classList.add('is-on'); sfx('ui-tap', { gain: 0.6 }); }
        const a = this.c(step.booster.a);
        if (step.booster.t === 'tractor' && step.booster.b) { const b = this.c(step.booster.b); await this.ghost.once(a.x, a.y, a.x, a.y, 560); this.scene.aimCells = [op.booster!.a]; this.draw(); await this.ghost.once(b.x, b.y, b.x, b.y, 560); }
        else await this.ghost.once(a.x, a.y, a.x, a.y, 640);
        this.scene.aimCells = [];
      } else if ('tap' in step) {
        const a = this.c(step.tap); await this.ghost.once(a.x, a.y, a.x, a.y);
      } else {
        const a = this.c(step.from), b = this.c(step.to); await this.ghost.once(a.x, a.y, b.x, b.y);
      }
      if (!this.alive) return;
      const e0 = this.st.energy;
      const res = op.booster ? applyBooster(this.st, op.booster) : applyMove(this.st, op.move!);
      const ev = this.st.log!.splice(0);
      if (!res.ok) {
        // e.g. the frozen gem cannot be dragged: it wobbles, nothing is spent
        const cell = op.move?.t === 'swap' ? op.move.a : -1;
        if (cell >= 0) { this.tl.clear(); directShake(this.scene, this.tl, cell, { sfx }); }
      } else {
        if (op.move && this.ui.moves) { this.moves -= 1; const m = this.ui.moves; m.querySelector('b')!.textContent = String(this.moves); m.classList.remove('is-tick'); void m.offsetWidth; m.classList.add('is-tick'); }
        this.tl.clear();
        direct(ev, this.dctx(this.ui.energy ? [{ kind: 'energy', shown: 0, final: 0 }] : [], e0), 0);
      }
      await this.settled();
      if (!this.alive) return;
      this.scene.syncFrom(this.st);
      this.ui.tool?.classList.remove('is-on'); this.ui.dir?.classList.remove('is-on');
      this.draw();
      await this.wait(420);
    }
    await this.wait(900);
    this.stage.classList.add('is-fading');
    await this.wait(320);
  }
  destroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ghost.destroy();
    this.atlas?.dispose(); this.atlas = null;
    this.board.dispose(); this.fx.dispose();
  }
}

/**
 * Show the card; resolves when the child taps 知道了. `first` = the automatic first showing (marks
 * it seen, applies the booster grant and speaks a grant line); it also carries the kit's 跳过, and the
 * parent's 跳过开场和教学 switch skips it outright (seen + granted, replayable from the "i" / hangar).
 */
export function showIntroCard(app: AppCtx, id: string, o: { first?: boolean } = {}): Promise<void> {
  const it = INTROS.find((x) => x.id === id);
  if (!it) return Promise.resolve();
  if (o.first) markIntroSeen(app, id);
  if (o.first && shouldAutoSkip()) return Promise.resolve();
  const g = INTRO_GRANTS[id];
  const showMoves = id === 'tap' || !!g;
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'xg-scrim xg-root em-intro-scrim';
    scrim.dataset.xgGame = 'match';
    scrim.innerHTML = `<div class="xg-modal em-intro" role="dialog" aria-modal="true" data-intro="${id}">
        <div class="em-intro__anim">
          <div class="em-intro__box"></div>
          ${showMoves || g || id === 'energy' ? `<div class="em-intro__side">
            ${showMoves ? '<div class="em-intro__moves"><b class="xg-num">5</b><span>步数</span></div>' : ''}
            ${id === 'energy' ? `<div class="em-intro__energy">${energySvg(0)}</div>` : ''}
            ${g ? `<div class="em-intro__tool">${toolSvg(g.tool)}<b class="xg-num">3</b></div>${g.tool === 'ion' ? `<div class="em-intro__dir">${dirSvg('V')}</div>` : ''}` : ''}</div>` : ''}
          <div class="em-intro__stage"></div>
        </div>
        <div class="em-intro__foot"><div class="em-intro__lane"></div>
          <button class="xg-btn xg-btn--primary em-intro__ok" data-act="ok" data-sfx="ui-confirm">${icon('check')}<span>知道了</span></button></div>
      </div>`;
    document.body.append(scrim);
    bindPress(scrim);
    const anim = scrim.querySelector<HTMLElement>('.em-intro__anim')!;
    const lane = scrim.querySelector<HTMLElement>('.em-intro__lane')!;
    app.dockSub(lane);
    const player = new IntroPlayer(scrim.querySelector<HTMLElement>('.em-intro__stage')!, anim, it, {
      moves: scrim.querySelector('.em-intro__moves'), tool: scrim.querySelector('.em-intro__tool'), dir: scrim.querySelector('.em-intro__dir'), energy: scrim.querySelector('.em-intro__energy'),
    }, app.lessFx());
    let open = true;
    const boxEl = scrim.querySelector<HTMLElement>('.em-intro__box')!;
    const fit = () => { void player.layout(boxEl, app.layout().dpr); };
    window.setTimeout(fit, 380); // again once the modal's pop-in transform has settled
    requestAnimationFrame(() => {
      fit();
      void (async () => {
        await new Promise((r) => window.setTimeout(r, 60));
        while (open) { await player.run(); }
      })();
    });
    // voice: the card's lines in order (spec §4.6); booster cards say "你得到了…" only when granting
    void (async () => {
      const lines = introLines(id).filter((_l, k) => !(g && k === 0 && !o.first));
      for (const line of lines) { if (!open) return; await app.voice.say(line); }
    })();
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    let unskip = () => {};
    const close = () => {
      if (!open) return;
      open = false;
      unskip();
      window.removeEventListener('resize', onResize);
      player.destroy();
      app.voice.stop();
      app.dockSub(null);
      scrim.classList.add('is-leaving');
      window.setTimeout(() => scrim.remove(), 240);
      resolve();
    };
    scrim.querySelector('[data-act="ok"]')!.addEventListener('click', close);
    if (o.first) unskip = mountSkipButton(document.body, close, { className: 'em-skip' });
  });
}
