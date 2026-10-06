/**
 * Test hooks (spec §8.11), compiled into the production bundle but only installed with `?test=1`
 * (the platform smoke tests run the built dist) or in dev: `window.__sok`.
 */
import { grantRewards } from './app/collection';
import type { AppCtx } from './app/context';
import { resetBroken } from './app/broken';
import { CHAPTERS, CLASSIC_LEVELS, chapterLevels, isQuiz, levelById } from './data';
import { PlayScreen } from './screens/play';
import { QuizScreen } from './screens/quiz';

export interface SokTestApi {
  load(id: string, fresh?: boolean): void;
  map(tab?: number | 'classic'): void;
  hangar(): void;
  state(): { level: string; player: number; crates: number[]; pushes: number; solved: boolean; marks: number[]; pending: number; busy: boolean; mode: string; redo: boolean; demo: boolean } | null;
  replay(lurd: string): Promise<void>;
  solve(): Promise<boolean>;
  tapCell(cell: number): void;
  /** tap a crate's drawn centre through the real input path */
  tapCrate(slot: number): void;
  cellCenter(cell: number): { x: number; y: number } | null;
  crateCenter(slot: number): { x: number; y: number } | null;
  /** tests: make a level's map unparsable (spec §3.10 维修中) and redraw the map */
  breakLevel(id: string): void;
  /** where the robot is drawn (page px) — tests compare it with its logical cell */
  robotCenter(): { x: number; y: number } | null;
  /** pass every level (1 star) except `except`; `rewards` also hands out the milestone items and cards */
  unlockAll(o?: { except?: string[]; rewards?: boolean }): void;
  setArrows(mode: 'locked' | 'celebrate' | 'on'): void;
  lines(): string[];
  marks(): [string, Record<string, unknown>][];
  save(): unknown;
  drawMs(): number;
  togo(): Promise<number>;
  /** draw-cost probe (spec §8.6): `frames` full fg redraws and one static-layer rebuild, in ms */
  bench(frames?: number): { frameAvg: number; frameMax: number; staticMs: number; cells: number } | null;
  /** press 💡 now (the 4 s cool-down is skipped in tests) */
  hint(): Promise<void>;
  hintState(): { usedMax: number; ring: number | null; chevron: { slot: number; dir: number } | null; demo: boolean } | null;
  /** 侦探题: answer the current board ('right' = exactly the dead crates; 'none' = nothing; or [r,c] cells) and press 检查 */
  quiz(answer?: 'right' | 'none' | [number, number][]): Promise<void>;
  /** 侦探题: press the button after a reveal (下一块 / 再找一次 / 完成) */
  quizNext(): Promise<void>;
  quizState(): { board: string; idx: number; attempt: number; firstTry: number; dead: { r: number; c: number }[] } | null;
  seed(n: number): void;
  forcePool(on: boolean): void;
  order(tier: 1 | 2 | 3): Promise<void>;
  deadMarker(mode: 'instant' | 'delayed'): void;
  overlay(name: 'finale' | 'wrap' | 'chapter' | 'cert' | 'orders', arg?: number): Promise<unknown>;
}

export function installTestHooks(ctx: AppCtx): void {
  const play = () => {
    const s = ctx.screen();
    return s instanceof PlayScreen ? s : null;
  };
  const quiz = () => {
    const s = ctx.screen();
    return s instanceof QuizScreen ? s : null;
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const api: SokTestApi = {
    load: (id, fresh = true) => ctx.go({ name: 'play', id, fresh }),
    map: (tab) => ctx.go({ name: 'map', tab }),
    hangar: () => ctx.go({ name: 'hangar' }),
    state() {
      const p = play();
      if (!p) return null;
      const s = p.session;
      return {
        level: p.def.id, player: s.player, crates: Array.from(s.crates), pushes: s.pushes, solved: s.solved,
        marks: [...s.marks.keys()], pending: s.pending.length, busy: p.isBusy, mode: p.mode, redo: s.canRedo, demo: p.board.demoRunning,
      };
    },
    replay: async (lurd) => {
      await play()?.replay(lurd);
    },
    async solve() {
      const p = play();
      if (!p) return false;
      const snap = p.session.snapshot();
      const line = await ctx.client.solve({ player: snap.player, boxes: snap.crates });
      if (!line) return false;
      for (const step of line) {
        const slot = p.session.crateAt(step.from);
        const stand = p.session.standFor(slot, step.dir as 0 | 1 | 2 | 3);
        p.session.player = stand;
        p.board.place(stand, p.session.crates);
        await p.push(slot, step.dir as 0 | 1 | 2 | 3);
      }
      return p.session.solved;
    },
    tapCell: (cell) => play()?.tapCell(cell),
    tapCrate: (slot) => play()?.tapCrateAt(slot),
    cellCenter: (cell) => play()?.board.cellCenterPage(cell) ?? null,
    crateCenter: (slot) => play()?.board.crateCenterPage(slot) ?? null,
    robotCenter: () => play()?.board.robotCenterPage() ?? null,
    breakLevel(id) {
      const l = levelById(id);
      if (!l) return;
      l.map = ['###', '#@#'];
      resetBroken();
      ctx.go({ name: 'map' });
    },
    unlockAll(o = {}) {
      const skip = new Set(o.except ?? []);
      ctx.save.update((s) => {
        for (const c of CHAPTERS) {
          for (const l of chapterLevels(c.ch)) {
            if (skip.has(l.id)) continue;
            if (isQuiz(l)) s.quiz[l.id] ??= { stars: 1, firstTry: 1 };
            else s.levels[l.id] ??= { best: l.opt.pushes, stars: 1, clean: true, firstClean: true, plays: 1, hintMax: 0 };
          }
        }
        for (const l of CLASSIC_LEVELS) if (!skip.has(l.id)) s.levels[l.id] ??= { best: l.opt.pushes, stars: 1, clean: true, firstClean: true, plays: 1, hintMax: 0 };
        s.tutorialDone = true;
        s.arrows = 'on';
        s.cert.offered = true;
        if (o.rewards) grantRewards(s);
      });
    },
    setArrows(mode) {
      ctx.save.update((s) => {
        s.arrows = mode;
      });
    },
    lines: () => [...ctx.voice.log],
    marks: () => [...ctx.marks.written],
    save: () => JSON.parse(JSON.stringify(ctx.save.data)),
    drawMs: () => play()?.board.lastDrawMs ?? 0,
    bench(frames = 120) {
      const p = play();
      if (!p) return null;
      return p.board.bench(frames);
    },
    async togo() {
      const p = play();
      if (!p) return -2;
      const snap = p.session.snapshot();
      return ctx.client.togo({ player: snap.player, boxes: snap.crates });
    },
    async hint() {
      const p = play();
      if (!p?.ladder) return;
      p.ladder.forceReady();
      p.hintBtn?.click();
      await wait(30);
      while (p.ladder.isPressing) await wait(20);
    },
    hintState() {
      const p = play();
      if (!p?.ladder) return null;
      return { usedMax: p.ladder.usedMax, ring: p.board.hint?.slot ?? null, chevron: p.board.hint2 ? { slot: p.board.hint2.slot, dir: p.board.hint2.dir } : null, demo: p.board.demoRunning };
    },
    async quiz(answer = 'right') {
      const q = quiz();
      if (!q) return;
      while (q.isBusy) await wait(20);
      const cells = answer === 'right' ? q.correctCells.map((x) => [x.r, x.c] as [number, number]) : answer === 'none' ? [] : answer;
      for (const [r, c] of cells) q.tapCrate(r, c);
      await q.check();
    },
    async quizNext() {
      const q = quiz();
      if (!q) return;
      await q.check();
    },
    quizState() {
      const q = quiz();
      if (!q) return null;
      return { board: q.el.dataset.board ?? '', idx: q.idx, attempt: q.attempt, firstTry: q.firstTry, dead: q.correctCells };
    },
    seed(n) {
      ctx.save.update((s) => {
        s.random.nextSeed = n;
      });
    },
    forcePool(on) {
      ctx.forcePool = on;
    },
    async order(tier) {
      const { deliverOrder } = await import('./screens/random');
      await deliverOrder(ctx, tier);
    },
    deadMarker(mode) {
      const p = play();
      if (p) p.session.deadMarker = mode;
    },
    async overlay(name, arg) {
      if (name === 'finale') return (await import('./screens/finale')).showFinale(ctx);
      const o = await import('./screens/overlays');
      if (name === 'wrap') return o.showWrapUp(ctx, arg ?? 2);
      if (name === 'chapter') return o.showChapterDone(ctx, arg ?? 2, ['lamp', 'hat', 'plate', 'magnifier', 'stripes'], ['wenchang', 'tianzhou', 'cz7', 'strap', 'order']);
      if (name === 'cert') return o.showCertOffer(ctx);
      if (name === 'orders') return (await import('./screens/random')).showOrderBoard(ctx);
      return null;
    },
  };
  (window as unknown as { __sok: SokTestApi }).__sok = api;
}
