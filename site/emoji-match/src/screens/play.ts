/**
 * S4 play screen (spec §2.3, §8.4 PLAY state machine) — also S11 星图谜题 and S10 自由星海 (mode):
 *   READY ─(drag / tap / tap-fire)→ ANIMATING ─→ READY | BONUS → WIN (S6) | FAIL (S7)
 *   READY ⇄ SELECTED; READY ⇄ AIM (tools, §2.5) ─(fire)→ ANIMATING; any → PAUSED.
 * The engine computes a whole move at once (src/core), the director replays its events; the save is
 * committed on the winning move before the bonus (review B20) and `resume` after every move/tool.
 */
import { icon, mountSkipButton, setHintReady, shouldAutoSkip, showResult } from '@kit/ui';
import { mount as mountCompanion, sayLine, type Companion } from '@kit/companion';
import { updateHub } from '../hub';
import {
  applyBooster, applyMove, assignUids, bestMove, boosterTargets, contentHash, hint1Move, hintFrom, isSpecial, isWon, listMoves, newGame,
  parseLevel, placeAssist, remaining, rngBelow, rngNew, starsFor, BOMB, ENGINE_VERSION, ORB, PIECE, RH, RV,
  type BoosterUse, type GameState, type Level, type Move, type StepDef,
} from '../core';
import { stepToOp } from '../core/expect';
import { EPISODES, FREE_DEF, FREE_FULL, LEVELS, levelById, nextLevelId, puzzleById, puzzleDef, type LevelData, type PuzzleData } from '../content';
import type { AppCtx } from '../ctx';
import { chime, coin, play as sfx, bonusRocket, setSfxMuted } from '../audio';
import { assistTier, grantFor, type LevelRec, type Op } from '../save';
import { AimController } from '../view/aim';
import { buildAtlas, type Atlas } from '../view/atlas';
import { BoardCanvas } from '../view/board-canvas';
import { direct, directInvalid, directShake, type DirectCtx, type GoalTrack } from '../view/director';
import { Fx } from '../view/fx';
import { GhostHand } from '../view/ghost-hand';
import { Hud, type BarButton } from '../view/hud';
import { assistKinds, energySvg, miniIcon, objectiveIcon } from '../view/icons';
import { BoardInput } from '../view/input';
import { playLayout, type PlayLayout } from '../view/layout';
import { Scene } from '../view/scene';
import type { SceneKey } from '../view/art/sky';
import { backdrop } from '../view/backdrop';
import { dirSvg, toolSvg, TOOL_NAMES, type ToolId } from '../view/art/tools';
import { badgeSvg } from '../view/art/badges';
import { Timeline } from '../view/timeline';

type Phase = 'LOADING' | 'READY' | 'ANIMATING' | 'AIM' | 'BONUS' | 'DONE' | 'PAUSED';
export type PlayMode = 'level' | 'puzzle' | 'free';

const INTRODUCED_BY: Record<string, string> = { bomb: '1-05', orb: '1-07' };
/** a tool's button appears from its intro level on (spec §3.14) */
export const TOOL_FROM: Record<ToolId, string> = { drill: '2-02', tractor: '3-02', ion: '4-02' };
const TOOL_ORDER: ToolId[] = ['drill', 'tractor', 'ion'];
const TOOLS_PER_ATTEMPT = 3;
const BREAK_MS = 15 * 60 * 1000;
const FREE_BREAK_MS = 10 * 60 * 1000;
const lvIndex = (id: string) => LEVELS.findIndex((d) => d.id === id);

export class PlayScreen {
  el: HTMLElement;
  def: LevelData;
  mode: PlayMode;
  puzzle: PuzzleData | null = null;
  L: Level;
  st!: GameState;
  scene!: Scene;
  private board: BoardCanvas;
  private fx: Fx;
  private hud: Hud;
  private stage: HTMLElement;
  private bg: HTMLElement;
  private input: BoardInput;
  private aim: AimController;
  private ghost: GhostHand;
  private tl = new Timeline();
  private atlas: Atlas | null = null;
  private atlasCell = 0;
  private lay!: PlayLayout;
  private phase: Phase = 'LOADING';
  private beforePause: Phase = 'READY';
  private raf = 0;
  private lastTs = 0;
  private beatTimer = 0;
  private hintTimer = 0;
  private hintLoop = 0;
  private hintLevel = 0;
  private selected = -1;
  seed: number;
  private tier: 0 | 1 | 2 | 3;
  private ops: Op[] = [];
  private counted = false;
  private lessonOnly = false;
  private lessonDone = false;
  private bot: Companion | null = null;
  private goals: GoalTrack[] = [];
  private shakeT = 0; private shakeAmp = 0; private shakeDur = 0;
  private metrics = { combos: 0, specials0: 0, maxCascade: 0, t5: [] as number[], readyAt: 0, hintSeen: 0, boosters: 0 };
  private destroyed = false;
  private skipBonus = false;
  /** the kit's 跳过 while a masked lesson (or the puzzle's H3 demo) runs; null otherwise */
  private unskip: (() => void) | null = null;
  private pSkip = false;
  private resultShown = false;
  private toolUses = 0;
  private tools: ToolId[] = [];
  private fresh: ToolId | null = null;
  private clock = 0;
  // puzzle
  private pHint = 0;
  private pHelped = false;
  private pIdle = 0;
  private pAuto = false;
  // free
  private freeFulls = 0;
  private freeStart = 0;
  private freeBreak = false;
  private freeBest = 0;
  private freeEp = 1;

  constructor(private app: AppCtx, id: string, o: { resume?: boolean; mode?: PlayMode } = {}) {
    this.mode = o.mode ?? 'level';
    const s = app.save.data;
    if (this.mode === 'puzzle') { this.puzzle = puzzleById(id) ?? null; this.def = puzzleDef(this.puzzle!); }
    else if (this.mode === 'free') this.def = FREE_DEF;
    else this.def = levelById(id) ?? LEVELS[0];
    this.L = parseLevel(this.def);
    const resume = this.mode === 'level' && o.resume && s.resume?.id === this.def.id ? s.resume : null;
    const valid = !!resume && resume.contentHash === contentHash(this.def) && resume.engine === ENGINE_VERSION;
    this.seed = this.mode === 'puzzle' ? 0 : this.mode === 'free' ? Math.max(s.free.seed ?? 0, s.free.plays) + 1 : valid ? resume!.seed : app.forceSeed ?? s.attemptSeq + 1;
    app.forceSeed = null;
    this.tier = this.mode !== 'level' ? 0 : valid ? resume!.assistTier : ((app.forceAssist ?? assistTier(this.rec().failStreak)) as 0 | 1 | 2 | 3);
    app.forceAssist = null;
    if (this.def.id === '1-01') this.tier = 0; // nothing introduced yet (G36)
    this.newState();
    if (valid) {
      // deterministic replay (spec §3.18): same seed + same ops (moves AND tools) = same board
      let ok = true;
      try {
        for (const op of resume!.ops) {
          const r = 'm' in op ? applyMove(this.st, op.m) : applyBooster(this.st, op.b);
          if (!r.ok) { ok = false; break; }
          this.ops.push(op);
        }
      } catch (err) { ok = false; this.engineError('resume', err); } // a broken resume is dropped, never replayed again
      if (!ok) { this.ops = []; this.newState(); s.resume = null; app.save.commit(); }
      else { this.counted = resume!.counted; this.toolUses = this.ops.filter((x) => 'b' in x).length; assignUids(this.st); this.st.log = []; this.lessonDone = true; }
    } else if (this.mode === 'level' && s.resume) { s.resume = null; app.save.commit(); }
    if (this.mode === 'free') {
      // QA r2: commit the seed now, so leaving by 🏠 / 航线 (not only 结束) gives a new board next time
      s.free.seed = this.seed; app.save.commit();
      const opened = EPISODES.filter((e) => e.ep === 1 || (s.levels[`${e.ep - 1}-10`]?.stars ?? 0) > 0).map((e) => e.ep);
      this.freeEp = opened.includes(s.free.bg ?? 0) ? s.free.bg! : opened[opened.length - 1];
    }
    if (this.mode === 'level') {
      const at = lvIndex(this.def.id);
      this.tools = TOOL_ORDER.filter((t) => at >= lvIndex(TOOL_FROM[t]));
      const intro = this.def.intro;
      if (intro === 'boosterDrill' || intro === 'boosterTractor' || intro === 'boosterIon') {
        const t: ToolId = intro === 'boosterDrill' ? 'drill' : intro === 'boosterTractor' ? 'tractor' : 'ion';
        if (!(s.stats.tools?.[t] ?? 0)) this.fresh = t;
      }
    }

    this.el = document.createElement('div');
    this.el.className = `em-screen em-play em-play--${this.mode}`;
    this.bg = document.createElement('div');
    this.bg.className = 'em-bg em-bg--dim';
    this.stage = document.createElement('div');
    this.stage.className = 'em-stage';
    this.el.append(this.bg, this.stage);
    this.board = new BoardCanvas(this.stage);
    const label = this.mode === 'puzzle' ? `星图谜题 · <b class="xg-num">${this.puzzle!.id.slice(1)}</b>`
      : this.mode === 'free' ? '自由星海'
        : `<b class="xg-num">${this.def.id}</b> · ${EPISODES.find((e) => e.ep === this.def.ep)!.dest}`;
    this.hud = new Hud(this.el, label, this.mode === 'free' ? [] : this.L.objectives, { movesLabel: this.mode === 'puzzle' ? '还能走' : this.mode === 'free' ? '能量' : '步数' });
    this.fx = new Fx(this.el);
    this.ghost = new GhostHand(this.el);
    this.scene = new Scene(this.st);
    this.goals = this.L.objectives.map((ob) => ({ kind: ob.t, color: ob.t === 'collect' ? ob.c : undefined, shown: remaining(this.st, ob), final: remaining(this.st, ob) }) as GoalTrack);
    this.input = new BoardInput(this.stage, {
      enabled: () => this.phase === 'READY' && !this.pAuto,
      isSpecial: (c) => isSpecial(this.st.kind[c]),
      onDrag: (a, b) => this.onDrag(a, b),
      onTap: (c, ms) => this.onTap(c, ms),
      onLong: (c) => this.onLong(c),
      onTouch: () => this.touched(),
    });
    this.aim = new AimController(this.el, {
      layout: () => this.lay, W: this.L.W, H: this.L.H, scene: this.scene,
      targets: (t) => boosterTargets(this.st, t),
      fire: (use) => void this.runOp({ b: use }),
      cancel: () => this.cancelAim(),
      redraw: () => this.draw(),
      touched: () => this.touched(),
    });
    this.hud.pause.addEventListener('click', () => void this.openPause());
    this.el.addEventListener('pointerdown', () => { if (this.phase === 'BONUS') this.skipBonus = true; });
    this.metrics.specials0 = this.st.stats.created.reduce((a, b) => a + b, 0);
    this.buildBar();
  }

  private rec(): LevelRec {
    const s = this.app.save.data;
    return (s.levels[this.def.id] ??= { stars: 0, bestLeft: 0, attempts: 0, wins: 0, failStreak: 0 });
  }
  /** spec §8.3 safe(): an engine throw never blanks the page; the screen stays alive and logs it */
  private engineError(where: string, err: unknown): void {
    try { this.app.mark('engine-error', { id: this.def.id, where }); } catch { /* log full */ }
    console.warn(err);
  }
  private newState(): void {
    // initialFill / settle can throw on a pathological seed: reseed (deterministically) a few times
    for (let k = 0; ; k += 1) {
      try { this.st = newGame(this.L, this.seed + k * 7919, { record: true }); if (k) this.seed += k * 7919; break; } catch (err) {
        this.engineError('newGame', err);
        if (k >= 4) throw err;
      }
    }
    if (this.tier > 0) {
      const allow = new Set<number>();
      const passed = (id: string) => lvIndex(this.def.id) >= lvIndex(id);
      if (passed(INTRODUCED_BY.bomb)) allow.add(BOMB);
      if (passed(INTRODUCED_BY.orb)) allow.add(ORB);
      placeAssist(this.st, this.tier, `em:${this.def.id}:${this.seed}:assist`, { avoid: this.lessonCells(), allow });
      assignUids(this.st);
    }
    this.st.log = [];
  }
  private lessonCells(): number[] {
    const ls = this.def.lesson; if (!ls) return [];
    const at = (rc: [number, number]) => rc[0] * this.L.W + rc[1];
    if ('tap' in ls) return [at(ls.tap)];
    // the lesson swap plus the run it completes (same colour neighbours on the fixed board)
    const cells = new Set([at(ls.from), at(ls.to)]);
    const st = newGame(this.L, this.seed);
    const moved = st.color[at(ls.from)];
    for (let i = 0; i < st.N; i += 1) if (st.kind[i] === PIECE && st.color[i] === moved && st.L.def.grid[(i / st.W) | 0][i % st.W] !== '.') cells.add(i);
    return [...cells];
  }

  // ---------------------------------------------------------------- lifecycle
  async mount(host: HTMLElement): Promise<void> {
    host.append(this.el);
    this.app.music(false);
    this.app.dockSub(this.hud.sub);
    this.bot = mountCompanion(this.hud.head, { size: 64, variant: 'head', sfx: (n: string) => sfx(n, { gain: 0.5 }) });
    this.resize();
    this.syncHud();
    await this.ensureAtlas();
    if (this.destroyed) return;
    this.phase = 'READY';
    this.clock = performance.now();
    this.draw();
    this.startBeat();
    if (this.mode === 'level') {
      this.app.save.data.lastLevel = this.def.id;
    }
    this.intro();
    this.el.dataset.ready = '1';
  }
  private intro(): void {
    const say = (id: string) => void this.app.voice.say(id);
    if (this.mode === 'puzzle') {
      const p = this.app.save.data.puzzles[this.puzzle!.id];
      say(this.puzzle!.par === 1 ? 'em.puzzle.par1' : 'em.puzzle.par2');
      if (!p?.attempts) { say('em.puzzle.nofill'); say('em.puzzle.undo'); }
      this.armPuzzleIdle();
      return;
    }
    if (this.mode === 'free') {
      if (!this.app.save.data.free.plays) say('em.free.1');
      this.freeStart = performance.now();
      this.armHint();
      return;
    }
    const rec = this.rec();
    const ls = this.def.lesson;
    // a lesson shows on the first attempt only; 跳过 (or the parent's 跳过开场和教学) marks it seen
    const fresh = rec.attempts === 0 && !this.ops.length && !this.app.save.data.intros.includes(`lesson:${this.def.id}`);
    const auto = fresh && !!ls && shouldAutoSkip();
    if (auto) { this.lessonDone = true; this.markLessonSeen(); }
    if (ls?.mask && fresh && !auto) {
      this.lessonOnly = true;
      this.scene.maskCells = this.lessonCells();
      this.draw();
      this.demoLesson();
      this.el.classList.add('is-lesson');
      this.unskip = mountSkipButton(document.body, () => this.skipLesson(), { theme: 'night', className: 'em-skip' });
    } else if (ls && fresh && !auto) this.demoLesson(true);
    // 1-01 skips the intro card on the very first run: its line is spoken on the masked board instead
    if (this.def.intro === 'swap' && fresh && !auto) say('em.intro.swap.1');
    else if (this.def.intro === 'swap' && auto) { this.flashGoals(); say('em.goal.collect'); }
    else if (this.tier > 0) say(`em.assist.${this.tier}`);
    this.armHint();
  }
  private markLessonSeen(): void {
    const s = this.app.save.data, key = `lesson:${this.def.id}`;
    if (!s.intros.includes(key)) { s.intros.push(key); this.app.save.commit(); }
  }
  /** 跳过 on a masked lesson: the whole board opens, no more demo, the lesson counts as seen */
  private skipLesson(): void {
    this.endLessonSkip();
    if (!this.lessonOnly || this.destroyed) return;
    this.lessonOnly = false; this.lessonDone = true;
    this.scene.maskCells = null; this.ghost.stop();
    this.markLessonSeen();
    this.app.voice.stop();
    this.draw();
    if (this.def.intro === 'swap') { this.flashGoals(); void this.app.voice.say('em.goal.collect'); }
    this.armHint();
  }
  private endLessonSkip(): void { this.unskip?.(); this.unskip = null; this.el.classList.remove('is-lesson'); }
  /** first run, right after the lesson swap (spec §2.6 ~10 s; review D3): the rule line, then the goal
   *  line while the goal card flashes, since the very first 1-01 skips the level card */
  private goalLesson(): void {
    const v = this.app.voice;
    void v.say('em.intro.swap.2', { interrupt: true }).then((r) => {
      if (this.destroyed || r === 'interrupted') return;
      this.flashGoals();
      void v.say('em.goal.collect');
    });
  }
  private flashGoals(): void {
    for (const el of this.hud.goals) { el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); }
    window.setTimeout(() => { for (const el of this.hud.goals) el.classList.remove('is-flash'); }, 2000);
  }
  /** the teaching move: masked levels loop it every 4 s; other lesson levels show it once (≤ 3 s) */
  private demoLesson(once = false): void {
    const mv = this.lessonMove(); if (!mv) return;
    const p0 = this.cellXY(mv.a), p1 = mv.t === 'tap' ? p0 : this.cellXY(mv.b);
    if (once) void this.ghost.once(p0.x, p0.y, p1.x, p1.y, mv.t === 'tap' ? 1200 : 2400);
    else this.ghost.loop(p0.x, p0.y, p1.x, p1.y, 4000);
  }
  private cellXY(i: number): { x: number; y: number } {
    return { x: this.lay.ox + ((i % this.L.W) + 0.5) * this.lay.cell, y: this.lay.oy + (Math.floor(i / this.L.W) + 0.5) * this.lay.cell };
  }

  resize(): void {
    const li = this.app.layout();
    const prev = this.lay?.cell;
    const nBar = this.mode === 'puzzle' ? 3 : this.mode === 'free' ? 1 : this.tools.length;
    this.lay = playLayout({ vw: li.width, vh: li.height, T: li.safe.top, B: li.safe.bottom, Lft: li.safe.left, R: li.safe.right, cols: this.L.W, rows: this.L.H, tools: nBar > 0, nTools: nBar, goals: Math.max(1, this.mode === 'free' ? 1 : this.L.objectives.length), dock: !!this.def.exits?.length, homeW: this.app.homeW });
    const l = this.lay;
    this.stage.style.left = `${l.panel.x}px`; this.stage.style.top = `${l.panel.y}px`;
    this.stage.style.width = `${l.panel.w}px`; this.stage.style.height = `${l.panel.h}px`;
    const ep = this.mode === 'free' ? this.freeEp : this.def.ep;
    this.board.setup(l, this.scene, li.dpr, ep);
    this.fx.resize(li.width, li.height, Math.min(2, li.dpr));
    this.fx.cellPx = l.cell;
    this.el.style.setProperty("--em-ghost", `${Math.round(Math.max(l.size === "phone" ? 44 : 64, l.cell * 0.9))}px`);
    this.hud.layout(l);
    this.input.setLayout(l, this.L.W, this.L.H);
    const key = `ep${ep}` as SceneKey;
    const want = `${key}-${l.orientation}`;
    if (this.bg.dataset.key !== want) { this.bg.innerHTML = backdrop(key, l.orientation === 'landscape'); this.bg.dataset.key = want; }
    this.el.classList.toggle('is-small', l.tooSmall);
    // a phone held sideways that is too short (SE 568×320) is told to turn upright, without the
    // 把窗口放大一点 voice (no window to enlarge there; QA fb1 r2)
    const turn = l.tooSmall && l.size === 'phone' && l.orientation === 'landscape';
    this.el.classList.toggle('is-turn', turn);
    if (l.tooSmall && !turn && !this.el.dataset.smallSaid) { this.el.dataset.smallSaid = '1'; void this.app.voice.say('em.window.small'); }
    if (prev && prev !== l.cell) void this.ensureAtlas().then(() => this.draw());
    else this.draw();
    if (this.ghost.active && this.lessonOnly) this.demoLesson();
    if (this.mode === 'free') this.freeHud();
  }
  private async ensureAtlas(): Promise<void> {
    const size = Math.round(this.lay.cell * Math.min(2, this.app.layout().dpr));
    if (this.atlas && this.atlasCell === size) return;
    const old = this.atlas;
    const a = await buildAtlas(size);
    if (this.destroyed) { a.dispose(); return; }
    this.atlas = a; this.atlasCell = size; this.fx.atlas = a;
    old?.dispose();
  }
  private tickClock(): void {
    const now = performance.now();
    if (this.clock && this.mode === 'level') this.app.playMs += now - this.clock;
    this.clock = now;
  }
  pause(): void {
    this.tickClock(); this.clock = 0;
    if (this.phase !== 'PAUSED') { this.beforePause = this.phase; this.phase = 'PAUSED'; }
    cancelAnimationFrame(this.raf); this.raf = 0; window.clearTimeout(this.hintTimer);
  }
  resume(): void {
    this.clock = performance.now();
    if (this.phase === 'PAUSED') { this.phase = this.beforePause; this.lastTs = 0; this.kick(); if (this.phase === 'READY') this.armHint(); }
  }
  destroy(): void {
    this.tickClock();
    this.destroyed = true;
    cancelAnimationFrame(this.raf); window.clearTimeout(this.beatTimer); window.clearTimeout(this.hintTimer); window.clearInterval(this.hintLoop);
    window.clearTimeout(this.pIdle);
    this.unskip?.(); this.unskip = null;
    this.input.destroy(); this.aim.destroy(); this.ghost.destroy(); this.bot?.destroy(); this.hud.destroy();
    this.atlas?.dispose(); this.atlas = null;
    this.board.dispose(); this.fx.dispose();
    this.app.dockSub(null);
    this.el.remove();
  }

  // ---------------------------------------------------------------- render loop (on demand)
  private kick(): void { if (!this.raf && this.phase !== 'PAUSED') { this.lastTs = 0; this.raf = requestAnimationFrame(this.frame); } }
  private frame = (ts: number) => {
    this.raf = 0;
    const dt = this.lastTs ? Math.min(50, ts - this.lastTs) * this.app.timeScale * (this.phase === 'BONUS' ? 1.5 : 1) : 16;
    this.lastTs = ts;
    const live = this.tl.step(dt);
    this.fx.step(dt);
    if (this.scene.hintCells.length) this.scene.hintPhase = Math.min(1.2, this.scene.hintPhase + dt / 900);
    this.applyShake(dt);
    this.draw();
    if (live || this.fx.busy || this.shakeT > 0 || (this.scene.hintCells.length && this.scene.hintPhase < 1.2)) this.raf = requestAnimationFrame(this.frame);
  };
  private draw(): void { this.board.draw(this.scene, this.atlas); this.fx.draw(); }
  private startBeat(): void {
    window.clearTimeout(this.beatTimer);
    const tick = () => {
      if (this.destroyed) return;
      if (this.phase !== 'PAUSED' && !this.raf && this.scene.hasSpecials()) { this.board.beat += 1; this.draw(); }
      else if (this.raf) this.board.beat += 1;
      this.beatTimer = window.setTimeout(tick, 80);
    };
    this.beatTimer = window.setTimeout(tick, 80);
  }
  private shake(amp: number, ms: number): void {
    if (this.app.lessFx()) return;
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), amp); this.shakeDur = ms; this.shakeT = ms;
  }
  private applyShake(dt: number): void {
    if (this.shakeT <= 0) { this.stage.style.transform = ''; return; }
    this.shakeT = Math.max(0, this.shakeT - dt);
    const k = this.shakeT / this.shakeDur, t = (this.shakeDur - this.shakeT) / 1000;
    const x = Math.sin(t * 70) * this.shakeAmp * k, y = Math.cos(t * 55) * this.shakeAmp * k * 0.6;
    this.stage.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  private run(): Promise<void> {
    return new Promise((res) => {
      const check = () => { if (this.destroyed) return res(); if (!this.tl.running && this.phase !== 'PAUSED') { res(); return; } window.setTimeout(check, 30); };
      this.kick(); window.setTimeout(check, 30);
    });
  }

  // ---------------------------------------------------------------- HUD
  private movesLeft(): number { return this.mode === 'free' ? 99 : Math.max(0, this.def.moves - this.st.movesUsed); }
  private syncHud(): void {
    if (this.mode === 'free') { this.freeHud(); return; }
    const left = this.movesLeft();
    this.hud.setMoves(left, this.mode === 'level' && left <= 3);
    this.L.objectives.forEach((o, k) => { const r = remaining(this.st, o); this.goals[k].shown = r; this.goals[k].final = r; this.hud.setGoal(k, r); });
  }
  /** free mode: the moves bubble becomes the energy ring (energy % 300), the goal card = best cascade */
  private freeHud(): void {
    const e = this.st.energy % FREE_FULL;
    // S10 (spec §2.4): the energy ring + the max-chain record chip under it
    const rec = this.app.save.data.free.bestCascade ?? 0;
    this.hud.moves.innerHTML = `<span class="em-freering">${energySvg(e / FREE_FULL)}</span><b class="xg-num">${this.freeFulls}</b><span class="em-freebest" aria-label="最大连锁 ${rec}"><small>最大连锁</small><b class="xg-num">${rec}</b></span>`;
    this.hud.moves.classList.add('is-free');
  }
  private buildBar(): void {
    let buttons: BarButton[] = [];
    if (this.mode === 'level') buttons = this.tools.map((t) => this.toolButton(t));
    else if (this.mode === 'puzzle') buttons = [
      { id: 'undo', icon: icon('undo'), label: '撤销', aria: '撤销' },
      { id: 'restart', icon: icon('restart'), label: '重来', aria: '重来' },
      { id: 'hint', icon: icon('hint'), label: '提示', aria: '提示' },
    ];
    else buttons = [{ id: 'end', icon: icon('check'), label: '结束', aria: '结束' }];
    this.hud.setBar(buttons, (id) => this.onBar(id));
  }
  private toolButton(t: ToolId): BarButton {
    const n = this.app.save.data.boosters[t];
    const state: BarButton['state'] = this.phase === 'AIM' && this.aim.tool === t ? 'active' : this.toolUses >= TOOLS_PER_ATTEMPT ? 'limit' : n <= 0 ? 'empty' : 'ok';
    return { id: t, icon: toolSvg(t), count: n, state, fresh: this.fresh === t, aria: TOOL_NAMES[t] };
  }
  private refreshTools(): void { for (const t of this.tools) this.hud.updateBar(t, this.toolButton(t)); }

  // ---------------------------------------------------------------- input
  private touched(): void {
    if (this.scene.hintCells.length) { this.scene.hintCells = []; this.draw(); }
    window.clearInterval(this.hintLoop); this.hintLoop = 0;
    if (this.ghost.active && !this.lessonOnly) this.ghost.stop();
    if (!this.lessonOnly) this.ghost.stop();
    if (this.mode === 'puzzle') this.armPuzzleIdle();
    this.armHint();
  }
  private onDrag(a: number, b: number): void {
    this.setSelected(-1);
    if (this.st.mask[a] && this.st.kind[a] === PIECE && this.st.ice[a] > 0) { this.tl.clear(); directShake(this.scene, this.tl, a, { sfx }); this.kick(); return; }
    void this.tryMove({ t: 'swap', a, b });
  }
  private onTap(c: number, ms: number): void {
    const st = this.st;
    if (!st.mask[c]) return;
    const sel = this.selected;
    const adj = sel >= 0 && (Math.abs(sel - c) === st.W || (Math.abs(sel - c) === 1 && Math.floor(sel / st.W) === Math.floor(c / st.W)));
    if (sel === c) { this.setSelected(-1); return; }
    if (sel >= 0 && adj) { this.setSelected(-1); void this.tryMove({ t: 'swap', a: sel, b: c }); return; }
    if (isSpecial(st.kind[c]) && ms < 350) { this.setSelected(-1); void this.tryMove({ t: 'tap', a: c }); return; }
    if (st.kind[c] === PIECE && st.ice[c] > 0) { this.tl.clear(); directShake(this.scene, this.tl, c, { sfx }); this.kick(); return; }
    if (st.kind[c] === PIECE || isSpecial(st.kind[c])) { this.setSelected(c); sfx('em-select'); }
  }
  private onLong(c: number): void { if (isSpecial(this.st.kind[c])) { this.setSelected(c); sfx('em-select'); } }
  private setSelected(c: number): void { this.selected = c; this.scene.selected = c; this.draw(); }
  private isLessonMove(mv: Move): boolean {
    const ls = this.lessonMove(); if (!ls) return false;
    if (ls.t === 'tap') return mv.t === 'tap' && mv.a === ls.a;
    return mv.t === 'swap' && ((mv.a === ls.a && mv.b === ls.b) || (mv.a === ls.b && mv.b === ls.a));
  }

  // ---------------------------------------------------------------- tools (spec §3.14, §2.5)
  private onBar(id: string): void {
    this.touched();
    if (this.mode === 'puzzle') { this.onPuzzleKey(id); return; }
    if (this.mode === 'free') { if (id === 'end' && (this.phase === 'READY' || this.phase === 'AIM')) void this.endFree(); return; }
    const t = id as ToolId;
    if (this.phase === 'AIM' && this.aim.tool === t) { this.cancelAim(); sfx('ui-close'); return; }
    if (this.phase !== 'READY' && this.phase !== 'AIM') return;
    const nudge = () => { const el = this.hud.barEl(t); if (el) { el.classList.remove('is-nudge'); void el.offsetWidth; el.classList.add('is-nudge'); } sfx('ui-locked'); };
    if (this.toolUses >= TOOLS_PER_ATTEMPT) { nudge(); void this.app.voice.say('em.booster.limit', { interrupt: true }); return; }
    if (this.app.save.data.boosters[t] <= 0) { nudge(); void this.app.voice.say('em.booster.none', { interrupt: true }); return; }
    if (this.phase === 'AIM') this.aim.stop();
    this.setSelected(-1);
    this.phase = 'AIM';
    window.clearTimeout(this.hintTimer); window.clearInterval(this.hintLoop); this.scene.hintCells = [];
    this.aim.start(t);
    this.stage.classList.add('is-aiming');
    if (t === 'ion') this.showDirKeys();
    sfx('ui-select');
    this.refreshTools();
    // the how-to line, for the first few uses
    const used = this.app.save.data.stats.tools?.[t] ?? 0;
    if (used < 3) void this.app.voice.say(t === 'drill' ? 'em.intro.boosterDrill.2' : t === 'tractor' ? 'em.intro.boosterTractor.2' : 'em.intro.boosterIon.2', { interrupt: true });
  }
  private showDirKeys(): void {
    const d = this.aim.dir;
    this.hud.showAimbar(`<button class="em-dirkey${d === 'H' ? ' is-on' : ''}" data-dir="H" aria-label="横">${dirSvg('H')}<span>横</span></button><button class="em-dirkey${d === 'V' ? ' is-on' : ''}" data-dir="V" aria-label="竖">${dirSvg('V')}<span>竖</span></button>`);
    this.hud.aimbar.querySelectorAll<HTMLElement>('[data-dir]').forEach((b) => b.addEventListener('click', () => { this.aim.setDir(b.dataset.dir as 'H' | 'V'); sfx('ui-tap'); this.showDirKeys(); }));
  }
  private cancelAim(): void {
    if (this.phase !== 'AIM') return;
    this.aim.stop();
    this.stage.classList.remove('is-aiming');
    this.hud.showAimbar(null);
    this.phase = 'READY';
    this.refreshTools();
    this.armHint();
  }

  // ---------------------------------------------------------------- moves & tools
  async tryMove(mv: Move): Promise<boolean> {
    if (this.phase !== 'READY' || this.pAuto) return false;
    if (this.mode === 'puzzle' && this.movesLeft() <= 0) { if (mv.t === 'swap') { this.tl.clear(); directInvalid(this.scene, this.tl, mv.a, mv.b, { sfx }, true); this.kick(); } this.pulseUndo(); return false; }
    // teaching mask (spec §5.1a): only the lesson move; others bounce back silently and cost nothing
    if (this.lessonOnly && !this.isLessonMove(mv)) {
      if (mv.t === 'swap') { this.tl.clear(); directInvalid(this.scene, this.tl, mv.a, mv.b, { sfx }, true); this.kick(); }
      return false;
    }
    // combo teaching levels: the preset specials do not fire on a single tap before the combo
    if (mv.t === 'tap' && this.def.lesson?.expect === 'combo' && !this.lessonDone && this.rec().attempts === 0) {
      this.tl.clear(); directShake(this.scene, this.tl, mv.a, { sfx: () => {} }); this.kick(); return false;
    }
    return this.runOp({ m: mv });
  }
  /** one move or one tool use: apply on the engine, record, animate, then route the outcome */
  private async runOp(op: Op): Promise<boolean> {
    const isTool = 'b' in op;
    if (isTool ? this.phase !== 'AIM' : this.phase !== 'READY') return false;
    const think = this.metrics.readyAt ? performance.now() - this.metrics.readyAt : 0;
    const before = this.L.objectives.map((o) => remaining(this.st, o));
    const energy0 = this.st.energy;
    let res;
    try { res = isTool ? applyBooster(this.st, op.b) : applyMove(this.st, op.m); } catch (err) {
      this.engineError(isTool ? 'applyBooster' : 'applyMove', err);
      this.scene.syncFrom(this.st); this.draw(); return false;
    }
    if (!res.ok) {
      this.st.log = [];
      if (isTool) { // a refused tractor pair (no-op): bounce, nothing spent, keep aiming
        const b = op.b;
        if (b.t === 'tractor') { this.tl.clear(); directInvalid(this.scene, this.tl, b.a, b.b, { sfx }); this.kick(); }
        this.aim.reset();
      } else if (op.m.t === 'swap') { this.tl.clear(); directInvalid(this.scene, this.tl, op.m.a, op.m.b, { sfx }); this.kick(); }
      return false;
    }
    if (isTool) {
      const t = op.b.t, s = this.app.save.data;
      s.boosters[t] = Math.max(0, s.boosters[t] - 1);
      (s.stats.tools ??= {})[t] = (s.stats.tools[t] ?? 0) + 1;
      this.toolUses += 1; this.metrics.boosters += 1;
      if (this.fresh === t) this.fresh = null;
      this.aim.stop(); this.stage.classList.remove('is-aiming'); this.hud.showAimbar(null);
    }
    const wasMasked = this.lessonOnly;
    if (this.lessonOnly) { this.lessonOnly = false; this.scene.maskCells = null; this.ghost.stop(); this.endLessonSkip(); }
    if (!isTool && this.isLessonMove(op.m)) { this.lessonDone = true; this.ghost.stop(); }
    if (!isTool && this.metrics.t5.length < 5) this.metrics.t5.push(this.hintLevel ? -1 : think);
    const save = this.app.save.data;
    // the first move (or tool) of an attempt counts it (spec §5.2 / B20)
    if (this.mode === 'level' && !this.counted) {
      this.counted = true; this.rec().attempts += 1; save.attemptSeq = Math.max(save.attemptSeq, this.seed);
      this.app.mark('level-start', { id: this.def.id, a: this.rec().attempts, s: this.seed, t: this.tier });
    }
    if (this.mode === 'puzzle' && !this.counted) { this.counted = true; const p = (save.puzzles[this.puzzle!.id] ??= { solved: false, attempts: 0, maxHint: 0 }); p.attempts += 1; }
    this.ops.push(op);
    const won = this.mode !== 'free' && !!res.won;
    const ev = this.st.log!.splice(0);
    const combos = ev.filter((e) => e.e === 'combo');
    this.metrics.combos += combos.length;
    this.metrics.maxCascade = Math.max(this.metrics.maxCascade, res.steps ?? 0);
    for (const e of combos) save.stats.combos[e.k] = (save.stats.combos[e.k] ?? 0) + 1;
    for (const e of ev) if (e.e === 'create') { const k = String(e.k); save.stats.specials[k] = (save.stats.specials[k] ?? 0) + 1; }
    save.stats.maxCascade = Math.max(save.stats.maxCascade, res.steps ?? 0);
    if (this.mode === 'level') {
      if (won) this.commitWin();
      else { save.resume = { id: this.def.id, seed: this.seed, assistTier: this.tier, toolUses: this.toolUses, ops: this.ops.slice(), contentHash: contentHash(this.def), engine: ENGINE_VERSION, counted: true }; this.app.save.commit(); }
    } else if (this.mode === 'free') {
      this.freeBest = Math.max(this.freeBest, res.steps ?? 0);
      save.free.bestCascade = Math.max(save.free.bestCascade, res.steps ?? 0);
      this.app.save.commit();
    } else this.app.save.commit();
    // animate
    this.phase = 'ANIMATING';
    this.scene.hintCells = []; this.hintLevel = this.mode === 'level' ? this.hintLevel : 0;
    if (this.mode !== 'level') this.hintLevel = 0;
    window.clearTimeout(this.hintTimer); window.clearInterval(this.hintLoop);
    if (this.mode !== 'free') { this.hud.setMoves(this.movesLeft(), this.mode === 'level' && this.movesLeft() <= 3); if (!isTool) this.hud.bumpMoves(); }
    if (isTool || this.tools.length) this.refreshTools();
    this.L.objectives.forEach((o, k) => { this.goals[k].shown = before[k]; this.goals[k].final = remaining(this.st, o); });
    this.tl.clear();
    direct(ev, this.dctx(energy0), 0);
    await this.run();
    if (this.destroyed) return true;
    this.afterAnimation();
    if (wasMasked && this.def.intro === 'swap') this.goalLesson();
    if (this.mode === 'puzzle') { this.afterPuzzleOp(won); return true; }
    if (this.mode === 'free') { this.afterFreeOp(energy0); return true; }
    // the result flows run on their own (they wait for a button on the result modal)
    if (won) void this.bonusAndWin();
    else if (this.movesLeft() <= 0) void this.fail();
    else { this.phase = 'READY'; this.metrics.readyAt = performance.now(); this.armHint(); }
    return true;
  }
  private dctx(energy0: number): DirectCtx {
    return {
      scene: this.scene, board: this.board, fx: this.fx, tl: this.tl,
      panelX: this.lay.panel.x, panelY: this.lay.panel.y,
      goals: this.goals, energy0, energy1: this.st.energy, lessFx: this.app.lessFx(),
      hooks: {
        sfx: (n, o) => sfx(n, o),
        chime: (s) => chime(s),
        coin: (_g, n) => coin(n),
        shake: (a, ms) => this.shake(a, ms),
        callout: (t, kind, big) => this.hud.callout(t, kind, big, this.app.lessFx()),
        goalArrive: (g) => this.goalArrive(g),
        goalTarget: (g) => this.hud.goalCenter(g),
        mood: (m) => this.bot?.setMood(m),
        energy: () => {
          if (this.mode === 'free') this.freeHud();
          else this.L.objectives.forEach((o, k) => { if (o.t === 'energy') this.hud.setGoal(k, remaining(this.st, o)); });
        },
      },
    };
  }
  private goalArrive(g: number): void {
    const o = this.L.objectives[g];
    const shown = Math.max(this.goals[g].final, Number(this.hud.goals[g]?.querySelector('.em-goal__n')?.textContent ?? 0) - 1);
    this.hud.setGoal(g, shown);
    this.hud.bumpGoal(g);
    if (shown <= 0 && o) sfx('em-goal-done');
  }
  private afterAnimation(): void {
    this.scene.syncFrom(this.st);
    this.syncHud();
    this.draw();
    this.bot?.setMood('idle');
  }

  // ---------------------------------------------------------------- hints (H0–H2, spec §5.1, §5.1a)
  private armHint(): void {
    window.clearTimeout(this.hintTimer);
    if (this.phase !== 'READY' || this.lessonOnly || this.mode === 'puzzle') return;
    const delay = this.mode === 'free' ? 10000 : ['N', 'H', 'B'].includes(this.def.role) ? 10000 : 6000;
    this.hintTimer = window.setTimeout(() => this.showHint(), delay / Math.max(0.01, this.app.timeScale));
  }
  private showHint(): void {
    if (this.phase !== 'READY') return;
    const lesson = this.lessonMove();
    // teaching levels: until the lesson's effect happened, every idle 6 s shows the lesson again
    if (lesson && this.mode === 'level') this.demoLesson(true);
    const mv: Move | null = lesson ?? hint1Move(this.st, rngNew(`em:${this.def.id}:${this.seed}:hint:${this.st.movesUsed}`));
    if (!mv) return;
    this.hintLevel = Math.max(this.hintLevel, 1);
    const cells = mv.t === 'tap' ? [mv.a] : [mv.a, mv.b];
    const pulse = () => { this.scene.hintCells = cells; this.scene.hintPhase = 0; this.kick(); };
    pulse();
    this.hintLoop = window.setInterval(pulse, 4000 / Math.max(0.01, this.app.timeScale));
    sfx('hint', { gain: 0.4 });
    this.bot?.setMood('thinking');
    if (this.mode === 'free') return;
    // H2 after 15 s more: the ghost hand shows the best move (never executed). N/H/B: once per attempt.
    if (['N', 'H', 'B'].includes(this.def.role) && this.metrics.hintSeen >= 1 && !lesson) return;
    this.hintTimer = window.setTimeout(() => {
      if (this.phase !== 'READY') return;
      const b = lesson ?? bestMove(this.st);
      if (!b) return;
      this.hintLevel = 2; this.metrics.hintSeen += 1;
      const p0 = this.cellXY(b.a), p1 = b.t === 'tap' ? p0 : this.cellXY(b.b);
      this.ghost.loop(p0.x, p0.y, p1.x, p1.y, 6000);
      void this.app.voice.say('em.hint.2');
    }, 15000 / Math.max(0.01, this.app.timeScale));
  }

  // ---------------------------------------------------------------- puzzles (S11, spec §3.16)
  private armPuzzleIdle(): void {
    window.clearTimeout(this.pIdle);
    const btn = this.hud.barEl('hint');
    if (btn) setHintReady(btn, false);
    if (this.mode !== 'puzzle') return;
    this.pIdle = window.setTimeout(() => { const b = this.hud.barEl('hint'); if (b && this.phase === 'READY') setHintReady(b, true); }, 20000 / Math.max(0.01, this.app.timeScale));
  }
  private pulseUndo(): void { const el = this.hud.barEl('undo'); if (el) { el.classList.remove('em-breathe'); void el.offsetWidth; el.classList.add('em-breathe'); } }
  private rebuildPuzzle(ops: Op[]): void {
    this.st = newGame(this.L, 0, { record: true });
    try { for (const op of ops) if ('m' in op) applyMove(this.st, op.m); } catch (err) {
      this.engineError('puzzle', err); this.st = newGame(this.L, 0, { record: true }); ops = [];
    }
    assignUids(this.st); this.st.log = [];
    this.ops = ops.slice();
    this.scene.sprites.clear();
    this.scene.syncFrom(this.st);
    this.aimSceneRefresh();
    this.syncHud();
    this.draw();
  }
  private aimSceneRefresh(): void { this.scene.hintCells = []; this.scene.selected = -1; this.selected = -1; this.ghost.stop(); }
  private onPuzzleKey(id: string): void {
    if (this.phase !== 'READY' || this.pAuto) return;
    sfx('ui-tap');
    if (id === 'undo') {
      if (!this.ops.length) return;
      this.hud.barEl('undo')?.classList.remove('em-breathe');
      this.rebuildPuzzle(this.ops.slice(0, -1));
      this.fx.flashAt(this.lay.panel.x + this.lay.panel.w / 2, this.lay.panel.y + this.lay.panel.h / 2, this.lay.panel.w * 0.6, 'rgba(160,200,255,.25)', 260); this.kick();
      return;
    }
    if (id === 'restart') { this.hud.barEl('undo')?.classList.remove('em-breathe'); this.rebuildPuzzle([]); return; }
    // the bulb: H1 → H2 → H3 on successive presses, always relative to the CURRENT board
    this.pHint = Math.min(3, this.pHint + 1);
    const rec = (this.app.save.data.puzzles[this.puzzle!.id] ??= { solved: false, attempts: 0, maxHint: 0 });
    rec.maxHint = Math.max(rec.maxHint, this.pHint) as 0 | 1 | 2 | 3;
    this.app.save.commit();
    if (this.pHint >= 3) { void this.puzzleH3(); return; }
    const next = hintFrom(this.def, this.st, this.movesLeft());
    if (!next) { void this.app.voice.say('em.puzzle.offpath', { interrupt: true }); this.pulseUndo(); return; }
    const op = stepToOp(this.st, next).move!;
    if (this.pHint === 1) {
      this.scene.hintCells = [op.a]; this.scene.hintPhase = 0; this.kick();
      void this.app.voice.say('em.puzzle.h1', { interrupt: true });
    } else {
      const p0 = this.cellXY(op.a), p1 = op.t === 'tap' ? p0 : this.cellXY(op.b);
      this.ghost.loop(p0.x, p0.y, p1.x, p1.y, 4000);
      void this.app.voice.say('em.puzzle.h2', { interrupt: true });
    }
  }
  /** H3: play the standard solution from the start, then back to the start for the child */
  private async puzzleH3(): Promise<void> {
    this.pHelped = true; this.pAuto = true; this.pSkip = false;
    void this.app.voice.say('em.puzzle.h3', { interrupt: true });
    this.rebuildPuzzle([]);
    // QA r2: the board is locked for the whole demo (input gate checks phase AND pAuto); 跳过 ends it early
    this.phase = 'ANIMATING';
    this.unskip = mountSkipButton(document.body, () => { this.pSkip = true; this.unskip = null; this.ghost.stop(); this.app.voice.stop(); }, { theme: 'night', className: 'em-skip' });
    this.el.classList.add('is-lesson');
    await this.wait(700);
    for (const step of this.puzzle!.solution as StepDef[]) {
      if (this.destroyed) return;
      if (this.pSkip) break;
      const mv = stepToOp(this.st, step).move!;
      const p0 = this.cellXY(mv.a), p1 = mv.t === 'tap' ? p0 : this.cellXY(mv.b);
      await this.ghost.once(p0.x, p0.y, p1.x, p1.y);
      if (this.pSkip || this.destroyed) break;
      const e0 = this.st.energy;
      applyMove(this.st, mv);
      const ev = this.st.log!.splice(0);
      this.L.objectives.forEach((o, k) => { this.goals[k].final = remaining(this.st, o); });
      this.phase = 'ANIMATING';
      this.tl.clear(); direct(ev, this.dctx(e0), 0);
      await this.run();
      this.afterAnimation();
      if (this.pSkip) break;
      await this.wait(500);
    }
    if (!this.pSkip) await this.wait(900);
    if (this.destroyed) return;
    this.endLessonSkip();
    this.pAuto = false;
    this.phase = 'READY';
    this.rebuildPuzzle([]);
    this.counted = false;
  }
  private afterPuzzleOp(won: boolean): void {
    if (won) { void this.puzzleSolved(); return; }
    this.phase = 'READY';
    if (this.movesLeft() <= 0 || listMoves(this.st).length === 0) {
      // no fail page: the board stays, the companion nudges, 撤销 pulses (spec §3.16, B20)
      void this.app.voice.say('em.puzzle.retry', { interrupt: true });
      this.pulseUndo();
    }
    this.armPuzzleIdle();
  }
  private async puzzleSolved(): Promise<void> {
    this.phase = 'DONE';
    const p = this.puzzle!, s = this.app.save.data;
    const rec = (s.puzzles[p.id] ??= { solved: false, attempts: 0, maxHint: 0 });
    const first = !rec.solved;
    rec.solved = true;
    if (this.pHelped) rec.maxHint = 3;
    // reward (spec §5.5): the tool the child has fewest of +1 (ties → drill), once per puzzle
    let gift: ToolId | null = null;
    if (first) { const g = grantFor(s, { k: 'puzzle', id: p.id }); gift = g ? (Object.keys(g)[0] as ToolId) : null; }
    this.app.save.commit();
    this.app.mark('puzzle-end', { id: p.id, ok: 1, m: this.st.movesUsed, h: rec.maxHint });
    this.bot?.setMood('celebrating');
    this.hud.callout('星图点亮了！', 'combo', true, this.app.lessFx());
    sfx('jingle-win', { gain: 0.6 });
    await this.wait(900);
    if (this.resultShown) return;
    this.resultShown = true;
    void this.app.voice.say('em.puzzle.solved');
    const act = await showResult({
      ribbon: `星图谜题 <span class="xg-num">${p.id.slice(1)}</span>`, title: '星图点亮了！', text: p.teach, accentGame: 'match',
      actions: [{ id: 'map', label: '地图', kind: 'secondary', icon: 'map' }, { id: 'again', label: '再来一次', kind: 'primary', icon: 'restart' }],
      onOpen: (panel) => {
        const box = document.createElement('div');
        box.className = 'em-badge-won';
        box.innerHTML = `<span class="em-badge-won__badge">${badgeSvg(p.id, { helped: rec.maxHint >= 3 })}</span>${gift ? `<span class="em-badge-won__gift"><span class="em-mini">${toolSvg(gift)}</span><b class="xg-num">+1</b></span>` : ''}`;
        panel.querySelector('.xg-modal__title')?.before(box);
      },
    });
    if (act === 'again') this.app.go({ s: 'puzzle', id: p.id }); else this.app.go({ s: 'map', ep: p.ep });
  }

  // ---------------------------------------------------------------- free mode (S10, spec §3.17)
  private afterFreeOp(energy0: number): void {
    const full = Math.floor(this.st.energy / FREE_FULL), was = Math.floor(energy0 / FREE_FULL);
    if (full > was) {
      this.freeFulls = full;
      this.app.save.data.free.energy += (full - was) * FREE_FULL;
      this.app.save.commit();
      this.freeHud();
      const m = this.hud.moves.getBoundingClientRect();
      this.fx.sparks(m.left + m.width / 2, m.top + m.height / 2, '#7FE38A', 26, 1.2, 0);
      this.fx.ring(m.left + m.width / 2, m.top + m.height / 2, 120, 'rgba(127,227,138,.8)', 420); this.kick();
      sfx('jingle-magic', { gain: 0.5 });
      this.hud.callout('能量满格！', 'combo', true, this.app.lessFx());
      void this.app.voice.say('em.free.full');
    }
    this.phase = 'READY';
    this.metrics.readyAt = performance.now();
    if (!this.freeBreak && performance.now() - this.freeStart >= FREE_BREAK_MS / Math.max(0.01, this.app.timeScale)) { this.freeBreak = true; void this.bubble('em.free.break'); }
    this.armHint();
  }
  private async endFree(): Promise<void> {
    if (this.phase === 'AIM') this.cancelAim();
    this.phase = 'DONE';
    const s = this.app.save.data;
    s.free.plays += 1;
    this.app.save.commit();
    const made = this.st.stats.created.reduce((a, b) => a + b, 0) - this.metrics.specials0;
    const breakNow = !this.freeBreak && performance.now() - this.freeStart >= FREE_BREAK_MS / Math.max(0.01, this.app.timeScale);
    const act = await showResult({
      ribbon: '自由星海', title: '这一趟的记录', accentGame: 'match',
      stats: [{ label: '最长连锁', value: this.freeBest }, { label: '做出的道具', value: made }, { label: '组合技', value: this.metrics.combos }, { label: '能量满格', value: this.freeFulls }],
      actions: [{ id: 'route', label: '航线', kind: 'secondary', icon: 'back' }, { id: 'again', label: '再飞一趟', kind: 'primary', icon: 'restart' }],
      onOpen: (panel) => { if (breakNow) this.injectBubble(panel, 'em.free.break'); },
    });
    if (act === 'again') this.app.go({ s: 'free' }); else this.app.go({ s: 'route' });
  }
  /** the companion pops up with a line (stop-point bubbles, spec §5.7) */
  private async bubble(id: string): Promise<void> {
    if (!this.bot) return;
    await sayLine(this.bot, this.app.voice.narrator, id, { mood: 'happy', hold: 2600 });
  }
  private injectBubble(panel: HTMLElement, id: string): void {
    const row = document.createElement('div');
    row.className = 'em-result-bubble';
    panel.querySelector('.xg-modal__actions')?.before(row);
    // QA r1: the robot sits at the card's left edge and the bubble is capped to the card's inner width
    const inner = Math.max(200, (row.clientWidth || panel.clientWidth - 48) - 84 - 36);
    const c = mountCompanion(row, { size: 84, bubble: 'right', bubbleMax: Math.min(420, inner), mood: 'happy', sfx: (n: string) => sfx(n, { gain: 0.5 }) });
    this.app.voice.log.push(id); // same trail as voice.say (tests, QA)
    void sayLine(c, this.app.voice.narrator, id, { mood: 'happy', hold: 0 });
  }

  // ---------------------------------------------------------------- win / bonus / fail (levels)
  private commitWin(): void {
    const s = this.app.save.data, rec = this.rec();
    const left = this.movesLeft();
    const stars = starsFor(this.def, left);
    rec.wins += 1; rec.failStreak = 0;
    if (stars > rec.stars) rec.stars = stars;
    rec.bestLeft = Math.max(rec.bestLeft, left);
    rec.firstWinAt ??= Date.now();
    s.resume = null;
    s.firstRunDone = true;
    const next = nextLevelId(this.def.id);
    s.lastLevel = next ?? this.def.id;
    this.app.save.commit();
    updateHub(s);
    this.endMark(true, stars);
  }
  private endMark(won: boolean, stars: number): void {
    const t5 = this.metrics.t5.filter((x) => x >= 0);
    this.app.mark('level-end', {
      id: this.def.id, w: won ? 1 : 0, u: this.st.movesUsed, l: this.movesLeft(), st: stars,
      rem: this.L.objectives.map((o) => remaining(this.st, o)),
      sp: this.st.stats.created.reduce((a, b) => a + b, 0) - this.metrics.specials0, cb: this.metrics.combos, mc: this.metrics.maxCascade,
      h: this.hintLevel, bo: this.metrics.boosters, t5: t5.length ? Math.round(t5.reduce((a, b) => a + b, 0) / t5.length / 100) * 100 : 0,
      ah: this.metrics.t5.reduce((m, x, k) => (x < 0 ? m | (1 << k) : m), 0),
    });
  }
  private async bonusAndWin(): Promise<void> {
    this.phase = 'BONUS';
    this.skipBonus = false;
    const stars = starsFor(this.def, this.movesLeft());
    this.hud.callout('目标完成！', 'combo', true, this.app.lessFx());
    void this.app.voice.say('em.win.1');
    this.bot?.setMood('celebrating');
    sfx('jingle-win', { gain: 0.6 });
    await this.wait(900);
    // the rockets come from the moves left at the win (spec §3.13); leftover specials fire for free
    const left = this.movesLeft();
    // 1) remaining specials fire top to bottom
    for (let guard = 0; guard < 30 && !this.skipBonus && !this.destroyed; guard += 1) {
      let at = -1;
      for (let i = 0; i < this.st.N; i += 1) if (isSpecial(this.st.kind[i])) { at = i; break; }
      if (at < 0) break;
      await this.bonusTap(at);
    }
    // 2) every move left becomes a little rocket (max 15; the rest merge into one big flash)
    const r = rngNew(`em:${this.def.id}:${this.seed}:bonus`);
    const n = Math.min(15, left);
    if (n > 0 && !this.skipBonus) void this.app.voice.say('em.bonus.1');
    for (let k = 0; k < n && !this.skipBonus && !this.destroyed; k += 1) {
      const cells: number[] = [];
      for (let i = 0; i < this.st.N; i += 1) if (this.st.kind[i] === PIECE && this.st.ice[i] === 0) cells.push(i);
      if (!cells.length) break;
      const i = cells[rngBelow(r, cells.length)];
      this.hud.setMoves(left - k - 1, false);
      bonusRocket(k);
      await this.flyBonusRocket(i);
      if (this.skipBonus) break;
      this.st.kind[i] = k % 2 ? RV : RH; this.st.color[i] = -1;
      const s = this.scene.spriteAt(i); if (s) { s.kind = this.st.kind[i]; s.color = -1; }
      await this.bonusTap(i);
    }
    if (left > 15 && !this.skipBonus && !this.destroyed) {
      this.hud.setMoves(0, false);
      const c = this.cellXY(Math.floor(this.st.N / 2));
      sfx('em-combo', { gain: 0.7 });
      this.fx.whiteout(0.7);
      this.fx.ring(c.x, c.y, this.lay.cell * Math.max(this.L.W, this.L.H) * 0.75, 'rgba(255,224,138,.95)', 520, 10);
      this.fx.sparks(c.x, c.y, '#FFE08A', this.app.lessFx() ? 12 : 40, 1.6);
      this.kick();
      await this.wait(560);
    }
    this.tl.finish(); this.fx.clear();
    this.afterAnimation();
    if (left > 0) this.hud.setMoves(0, false); // every move left flew off as a rocket (movesUsed itself is untouched)
    this.phase = 'DONE';
    await this.showWin(stars);
  }
  private async bonusTap(at: number): Promise<void> {
    this.st.log = [];
    const used = this.st.movesUsed;
    let res;
    try { res = applyMove(this.st, { t: 'tap', a: at }); } catch (err) { this.engineError('bonusTap', err); this.st.log = []; this.skipBonus = true; return; }
    this.st.movesUsed = used; // bonus taps are show, not moves (the counter only drops as rockets fly)
    const ev = this.st.log!.splice(0);
    if (!res.ok) return;
    this.L.objectives.forEach((o, k) => { this.goals[k].shown = 0; this.goals[k].final = remaining(this.st, o); });
    this.tl.clear();
    direct(ev, this.dctx(this.st.energy), 0);
    await this.run();
    this.scene.syncFrom(this.st);
  }
  private flyBonusRocket(i: number): Promise<void> {
    return new Promise((res) => {
      const m = this.hud.moves.getBoundingClientRect();
      const x0 = m.left + m.width / 2, y0 = m.top + m.height / 2;
      const { x: x1, y: y1 } = this.cellXY(i);
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 120;
      const life = 380 / Math.max(0.01, this.app.timeScale);
      this.fx.fly('rh-1', this.lay.cell * 0.7, life, (p) => { const q = 1 - p; const x = q * q * x0 + 2 * q * p * mx + p * p * x1, y = q * q * y0 + 2 * q * p * my + p * p * y1; return { x, y, rot: Math.atan2(y1 - my, x1 - mx) * p + Math.atan2(my - y0, mx - x0) * (1 - p) }; }, { trail: '#FF9A3C', onEnd: () => res() });
      this.kick();
      window.setTimeout(res, life + 400);
    });
  }
  private wait(ms: number): Promise<void> {
    return new Promise((res) => {
      const end = performance.now() + ms / Math.max(0.01, this.app.timeScale);
      const check = () => (this.skipBonus || this.destroyed || performance.now() >= end ? res() : window.setTimeout(check, 30));
      check();
    });
  }
  /** process praise (spec §7.4): combo → cascade ≥4 → 3★-efficient → ≥2 specials → plain; never twice in a row */
  private praise(): string {
    const made = this.st.stats.created.reduce((a, b) => a + b, 0) - this.metrics.specials0;
    const ok = [
      this.metrics.combos > 0 ? 'em.win.combo' : '',
      this.metrics.maxCascade >= 4 ? 'em.win.cascade' : '',
      this.movesLeft() >= (this.def.stars?.[1] ?? 99) && this.def.id !== '1-01' ? 'em.win.efficient' : '',
      made >= 2 ? 'em.win.special' : '',
      'em.win.plain',
    ].filter(Boolean);
    const pick = ok.find((x) => x !== this.app.lastPraise) ?? ok[0];
    this.app.lastPraise = pick;
    return pick;
  }
  /** spec §5.7: after ≥ 15 min of main-line play, the next result page shows one bubble per session */
  private breakDue(): boolean {
    this.tickClock();
    if (this.app.breakShown || this.app.playMs < BREAK_MS) return false;
    this.app.breakShown = true;
    return true;
  }
  private async showWin(stars: number): Promise<void> {
    if (this.resultShown) return;
    this.resultShown = true;
    const line = this.praise();
    void this.app.voice.say(line);
    const next = nextLevelId(this.def.id);
    const s = this.app.save.data;
    const arrival = this.def.n === 10 && !s.arrivals.includes(this.def.ep);
    const nextOk = !arrival && next && (levelById(next)?.ep ?? 9) <= this.app.playableEpisodes && (levelById(next)?.ep === this.def.ep);
    const brk = this.breakDue();
    // a veteran's first open runs the cutscene + 1-01 lesson; the welcome-back line lands here (QA r2)
    const vet = !!s.veteranToast;
    if (vet) { s.veteranToast = false; this.app.save.commit(); if (brk) this.app.breakShown = false; }
    const act = await showResult({
      ribbon: `第 <span class="xg-num">${this.def.id}</span> 关`, stars: stars as 1 | 2 | 3, title: '目标完成！', text: this.app.voice.text(line), accentGame: 'match',
      actions: arrival
        ? [{ id: 'arrive', label: '到站', kind: 'primary', icon: 'next' }]
        : [
          { id: 'map', label: '地图', kind: 'secondary', icon: 'map' },
          { id: 'again', label: '再来一次', kind: 'secondary', icon: 'restart' },
          ...(nextOk ? [{ id: 'next', label: '下一关', kind: 'primary' as const, icon: 'next' as const }] : []),
        ],
      onOpen: (panel) => {
        panel.querySelector('[data-act="next"], [data-act="arrive"]')?.classList.add('em-breathe');
        if (vet) this.injectBubble(panel, 'em.veteran');
        else if (brk) this.injectBubble(panel, 'em.free.break');
      },
    });
    if (act === 'arrive') { this.app.go({ s: 'arrival', ep: this.def.ep }); return; }
    this.leaveTo(act, next);
  }
  private async fail(): Promise<void> {
    this.phase = 'DONE';
    const rec = this.rec();
    rec.failStreak += 1;
    this.app.save.data.resume = null;
    this.app.save.commit();
    this.endMark(false, 0);
    sfx('jingle-round-over', { gain: 0.6 });
    void this.app.voice.say('em.outofmoves');
    await this.wait(700);
    if (this.resultShown) return;
    this.resultShown = true;
    const rem = this.L.objectives.map((o) => ({ o, r: remaining(this.st, o) }));
    const coach = this.coachLine(rem.map((x) => x.r));
    // one line at a time, each only while the fail page is still up (no 再来一次 line over the next screen)
    let open = true;
    const v = this.app.voice;
    const next = (id: string) => (r: string) => (open && !this.destroyed && r !== 'interrupted' ? v.say(id) : Promise.resolve('skipped' as const));
    void v.say('em.fail.1').then(next(coach)).then(next(this.def.fixedBoard ? 'em.fail.2b' : 'em.fail.2'));
    const tierNext = assistTier(rec.failStreak);
    const brk = this.breakDue();
    const act = await showResult({
      ribbon: '差一点', title: '还差这些', accentGame: 'match',
      actions: [{ id: 'map', label: '回地图', kind: 'secondary', icon: 'map' }, { id: 'again', label: '再来一次', kind: 'primary', icon: 'restart' }],
      onOpen: (panel) => {
        const box = document.createElement('div');
        box.className = 'em-fail';
        box.innerHTML = `<div class="em-fail__goals">${rem.filter((x) => x.r > 0).map((x) => `<div class="em-fail__goal"><span class="em-fail__icon">${objectiveIcon(x.o)}</span><b class="xg-num">${x.r}</b></div>`).join('')}</div>
          <p class="em-fail__coach">${this.app.voice.text(coach)}</p>
          ${tierNext > 0 && this.def.id !== '1-01' ? `<div class="em-assist-row"><span>${icon('robot')}</span><span>下一次领航员帮你装好：</span>${this.assistIcons(tierNext)}</div>` : ''}`;
        panel.querySelector('.xg-modal__title')?.after(box);
        if (brk) this.injectBubble(panel, 'em.free.break');
      },
    });
    open = false;
    v.stop();
    this.leaveTo(act, null);
  }
  assistIcons(tier: number): string {
    return assistKinds(lvIndex(this.def.id), lvIndex('1-05'), lvIndex('1-07'), tier).map(miniIcon).join('');
  }
  private coachLine(rem: number[]): string {
    const objs = this.L.objectives;
    const frac = objs.map((o, k) => {
      const total = o.t === 'collect' ? o.n : Math.max(1, remaining(newGame(this.L, this.seed), o));
      return rem[k] / total;
    });
    const made = this.st.stats.created.reduce((a, b) => a + b, 0) - this.metrics.specials0;
    if (made >= 2 && this.metrics.combos === 0) return 'em.coach.combo';
    let worst = 0; frac.forEach((f, k) => { if (f > frac[worst]) worst = k; });
    if (objs.length > 1) { const others = frac.filter((_, k) => k !== worst); if (others.every((f) => frac[worst] - f >= 0.4)) return 'em.coach.priority'; }
    const o = objs[worst];
    if (o.t === 'dust') {
      const W = this.L.W, H = this.L.H; let corner = 0, all = 0;
      for (let i = 0; i < this.st.N; i += 1) if (this.st.dust[i]) { all += 1; const r = Math.floor(i / W), c = i % W; if ((r < 2 || r >= H - 2) && (c < 2 || c >= W - 2)) corner += 1; }
      return all && corner === all ? 'em.coach.corner' : 'em.coach.dust';
    }
    if (o.t === 'crate') return 'em.coach.crate';
    if (o.t === 'ice') return 'em.coach.ice';
    return 'em.coach.collect';
  }
  private leaveTo(act: string, next: string | null): void {
    if (act === 'next' && next) this.app.go({ s: 'card', id: next });
    else if (act === 'again') this.app.go({ s: 'play', id: this.def.id });
    else this.app.go({ s: 'map', ep: this.def.ep });
  }

  // ---------------------------------------------------------------- pause (S5)
  private async openPause(): Promise<void> {
    if (this.phase === 'DONE' || this.phase === 'LOADING') return;
    if (this.phase === 'AIM') this.cancelAim();
    this.pause();
    const usedHalf = this.st.movesUsed >= this.def.moves / 2;
    const s = this.app.save.data.settings;
    const acts = this.mode === 'free'
      ? [{ id: 'resume', label: '继续', kind: 'primary' as const, icon: 'play' as const }, { id: 'end', label: '结束', kind: 'secondary' as const, icon: 'check' as const }]
      : [{ id: 'resume', label: '继续', kind: 'primary' as const, icon: 'play' as const }, { id: 'restart', label: '重来', kind: 'secondary' as const, icon: 'restart' as const }, { id: 'map', label: '回地图', kind: 'secondary' as const, icon: 'map' as const }];
    const act = await showResult({
      ribbon: '暂停', accentGame: 'match', closable: false, actions: acts,
      onOpen: (panel) => {
        const row = document.createElement('div');
        row.className = 'em-pause-toggles';
        // three switches (parent-ish settings): icon, one-line label, a sliding on/off switch
        type T = 'fx' | 'music' | 'sound';
        const on = (k: T) => (k === 'fx' ? s.lessFx : k === 'music' ? s.music !== false : s.sound !== false);
        const name: Record<T, string> = { sound: '声音', music: '音乐', fx: '少一点特效' };
        const ico = (k: T) => icon(k === 'fx' ? 'eye' : k === 'music' ? 'music' : on('sound') ? 'sound-on' : 'sound-off');
        const inner = (k: T) => `<span class="em-toggle__ico">${ico(k)}</span><span class="em-toggle__label">${name[k]}</span><i class="em-toggle__sw" aria-hidden="true"></i>`;
        row.innerHTML = (['sound', 'music', 'fx'] as const).map((k) => `<button class="em-toggle" data-xg-press data-t="${k}" role="switch" aria-checked="${on(k)}">${inner(k)}</button>`).join('');
        row.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => b.addEventListener('click', () => {
          const t = b.dataset.t as T;
          if (t === 'fx') { s.lessFx = !s.lessFx; this.fx.lessFx = s.lessFx; }
          else if (t === 'music') s.music = s.music === false;
          else { s.sound = s.sound === false; setSfxMuted(!s.sound); }
          this.app.save.commit();
          b.setAttribute('aria-checked', String(on(t)));
          b.innerHTML = inner(t);
        }));
        panel.querySelector('.xg-modal__actions')?.before(row);
      },
    });
    if (act === 'resume') { this.resume(); return; }
    if (act === 'end') { this.resume(); void this.endFree(); return; }
    if (act === 'restart') {
      void this.app.voice.say('em.restart.ask');
      const tierNext = this.mode === 'level' ? assistTier(this.rec().failStreak + (this.counted && usedHalf ? 1 : 0)) : 0;
      const ok = await showResult({
        ribbon: '要重来吗？', accentGame: 'match', actions: [{ id: 'no', label: '继续玩', kind: 'secondary' }, { id: 'yes', label: '重来', kind: 'primary', icon: 'restart' }],
        onOpen: (panel) => {
          // QA r2: what a fresh start looks like — the full goals and full moves (icons + numbers, the
          // line em.restart.ask is read aloud), then the next-attempt assist preview when there is one
          if (this.mode !== 'free') {
            const st0 = newGame(this.L, this.seed, {});
            const info = document.createElement('div');
            info.className = 'em-restart';
            info.innerHTML = `<div class="em-restart__goals">${this.L.objectives.map((o) => `<div class="em-fail__goal"><span class="em-fail__icon">${objectiveIcon(o)}</span><b class="xg-num">${remaining(st0, o)}</b></div>`).join('')}</div>
              <div class="em-restart__moves"><b class="xg-num">${this.def.moves}</b><span>步</span></div>`;
            panel.querySelector('.xg-modal__actions')?.before(info);
          }
          if (tierNext > 0 && this.def.id !== '1-01') {
            const row = document.createElement('div');
            row.className = 'em-assist-row';
            row.innerHTML = `<span>${icon('robot')}</span><span>领航员帮你装好：</span>${this.assistIcons(tierNext)}`;
            panel.querySelector('.xg-modal__actions')?.before(row);
          }
        },
      });
      if (ok !== 'yes') { this.resume(); return; }
    }
    if (this.mode === 'puzzle') {
      if (act === 'restart') { this.resume(); this.rebuildPuzzle([]); return; }
      this.app.go({ s: 'map', ep: this.puzzle!.ep }); return;
    }
    // leaving a started attempt: ≥ 50 % moves used counts toward the assist streak only (spec §3.15)
    if (this.counted && usedHalf) this.rec().failStreak += 1;
    if (this.counted) this.endMark(false, 0);
    this.app.save.data.resume = null; this.app.save.commit();
    if (act === 'restart') this.app.go({ s: 'play', id: this.def.id }); else this.app.go({ s: 'map', ep: this.def.ep });
  }

  // ---------------------------------------------------------------- test hook
  async play(mv: Move): Promise<boolean> { return this.tryMove(mv); }
  async tool(use: BoosterUse): Promise<boolean> {
    if (this.phase !== 'READY') return false;
    const t = use.t;
    if (this.toolUses >= TOOLS_PER_ATTEMPT || this.app.save.data.boosters[t] <= 0) return false;
    this.onBar(t);
    if (use.t === 'ion') this.aim.setDir(use.dir);
    return this.runOp({ b: use });
  }
  barPress(id: string): void { this.onBar(id); }
  /** perf/QA only (?test=1): put specials on plain uncovered pieces, e.g. two adjacent orbs for the OO
   *  scene of perf.mjs (spec §8.9 heaviest scene). Returns the cells actually planted. */
  plant(list: [number, number][]): number[] {
    if (this.phase !== 'READY') return [];
    const done: number[] = [];
    for (const [c, k] of list) {
      if (c < 0 || c >= this.st.N || this.st.kind[c] !== PIECE || this.st.ice[c] || !isSpecial(k)) continue;
      this.st.kind[c] = k; this.st.color[c] = -1; done.push(c);
    }
    this.scene.syncFrom(this.st); this.draw();
    return done;
  }
  bestMove(): Move | null { return bestMove(this.st); }
  legal(): Move[] { return listMoves(this.st); }
  /** the pending lesson move (teaching levels), else null */
  lessonMove(): Move | null {
    const ls = this.def.lesson;
    if (!ls || this.lessonDone || this.mode !== 'level') return null;
    const at = (rc: [number, number]) => rc[0] * this.L.W + rc[1];
    return 'tap' in ls ? { t: 'tap', a: at(ls.tap) } : { t: 'swap', a: at(ls.from), b: at(ls.to) };
  }
  get done(): boolean { return this.phase === 'DONE'; }
  get ready(): boolean { return this.phase === 'READY'; }
  get aiming(): boolean { return this.phase === 'AIM'; }
  get uses(): number { return this.toolUses; }
  rects(): PlayLayout { return this.lay; }
  pauseAt(ms: number): void { this.tl.step(ms); this.fx.step(ms); this.draw(); }
  won(): boolean { return isWon(this.st); }
}
