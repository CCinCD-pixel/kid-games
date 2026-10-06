/**
 * The 💡 hint ladder (spec §5.1): H0 glow → H1 which crate → H2 where to stand and which way →
 * H3 a ghost shows the next (≤ 3) pushes. The answers come from the puzzle Worker (full graph →
 * reference line → budgeted A*); after every move the next answer is prefetched (300 ms debounce),
 * so a press is almost always a table lookup (≤ 100 ms). Hints never use crate colours (night-blue
 * signals only) and never move the real board.
 *  - Two presses at least 4 s apart (a cool-down ring on the button).
 *  - After a push the next press starts again at H1; the highest level used this run is kept for the
 *    stars (H3 → at most ★★), mastery (clean = at most H1) and the play log.
 *  - Pressed in a state that cannot be finished: the "回到能推完的地方" offer instead.
 *  - H0 (glow, never an automatic hint): 30 s without a touch (20 s after two H3 levels in a row in
 *    the chapter), the level restarted 3×, 3 deadlocks (both layers), or 5 minutes on the level.
 */
import { setHintReady } from '@kit/ui';
import { walkPath } from '@engines/puzzle/src/path';
import { nb } from '@engines/puzzle/src/level';
import { OPP, type Dir } from '@engines/puzzle/src/types';
import { playSfx } from '../audio/sfx';
import type { AppCtx } from '../app/context';
import type { LevelDef } from '../data';
import type { PlaySession } from '../game/session';
import type { BoardView } from '../render/board';
import type { CompanionStrip } from '../screens/companion';
import type { HintReply } from '../worker/protocol';

export const HINT_COOLDOWN_MS = 4000;

export interface LadderHost {
  readonly ctx: AppCtx;
  readonly def: LevelDef;
  readonly session: PlaySession;
  readonly board: BoardView;
  readonly strip: CompanionStrip;
  /** animations or a walk in flight */
  busy(): boolean;
  /** the H3 demo locks board input (a tap aborts the demo instead) */
  setDemo(on: boolean): void;
  /** the state cannot be finished: offer "回到能推完的地方" with this line */
  offerRewind(line: string): void;
  /** rewind the real history to `len` entries (animated like the stuck rewind) */
  rewindTo(len: number): Promise<void>;
}

const H1_LINE = { normal: 'sok.hint.h1', unlock: 'sok.hint.h1.unlock', park: 'sok.hint.h1.park' } as const;

export class HintLadder {
  /** the next press gives level step + 1 (max 3) */
  private step = 0;
  usedMax: 0 | 1 | 2 | 3 = 0;
  h3Count = 0;
  private lastPress = -1e9;
  private glowing = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private cache: { key: string; answer: HintReply } | null = null;
  private pressing = false;
  private destroyed = false;
  private restarts = 0;
  private deads = 0;
  private coolTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly h: LadderHost, readonly btn: HTMLButtonElement, private readonly quietMs: number) {
    btn.addEventListener('click', () => void this.press());
    this.armIdle();
  }

  get usedH3(): boolean {
    return this.usedMax >= 3;
  }

  /** tests: a press is being answered / demonstrated */
  get isPressing(): boolean {
    return this.pressing || this.h.board.demoRunning;
  }

  /** tests: skip the cool-down for the next press */
  forceReady(): void {
    this.lastPress = -1e9;
  }

  // ------------------------------------------------------------------ H0

  /** A touch on the board or a button: restart the quiet clock. */
  noteTouch(): void {
    this.armIdle();
  }

  private armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.destroyed || this.h.ctx.test) return;
    this.idleTimer = setTimeout(() => {
      // animation time does not count: wait until the board is still
      if (this.h.busy() || this.h.board.demoRunning) {
        this.idleTimer = null;
        this.armIdleShort();
        return;
      }
      this.glow('idle');
    }, this.quietMs);
  }

  private armIdleShort(): void {
    this.idleTimer = setTimeout(() => this.armIdle(), 2000);
  }

  noteRestart(): void {
    this.restarts += 1;
    if (this.restarts >= 3) this.glow('restarts');
  }

  noteDead(): void {
    this.deads += 1;
    if (this.deads >= 3) this.glow('deadlocks');
  }

  /** active ms on this level (from the play screen's clock) */
  noteActive(ms: number): void {
    if (ms >= 5 * 60_000) this.glow('time');
  }

  private glow(_why: string): void {
    if (this.glowing || this.destroyed || this.h.session.solved) return;
    this.glowing = true;
    setHintReady(this.btn, true);
    this.btn.dataset.glow = '';
    const save = this.h.ctx.save.data;
    const ch = this.h.def.ch;
    if ((ch === 0 || ch === 1) && !save.onceLines.includes('sok.hint.glow')) {
      this.h.ctx.save.update((s) => s.onceLines.push('sok.hint.glow'));
      void this.h.strip.say('sok.hint.glow', { mood: 'encouraging', polite: true });
    }
  }

  private unglow(): void {
    if (!this.glowing) return;
    this.glowing = false;
    setHintReady(this.btn, false);
    delete this.btn.dataset.glow;
  }

  // ------------------------------------------------------------------ moves

  /** After every push / undo / redo / restart: the ladder starts over, the signals go, prefetch the next answer. */
  noteMove(kind: 'push' | 'undo' | 'redo' | 'restart'): void {
    if (kind === 'push') this.unglow();
    this.step = 0;
    this.h.board.clearHints();
    this.armIdle();
    this.prefetch();
  }

  private stateKey(): string {
    const s = this.h.session;
    return `${s.player}|${Array.from(s.crates).join(',')}`;
  }

  /** Ask the Worker for the next push 300 ms after a move (most presses then answer at once). */
  prefetch(): void {
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
    if (this.destroyed || this.h.session.solved) return;
    this.prefetchTimer = setTimeout(() => {
      const key = this.stateKey();
      const s = this.h.session;
      void this.h.ctx.client.hint({ player: s.player, boxes: s.crates }).then((answer) => {
        if (key === this.stateKey()) this.cache = { key, answer };
      });
    }, 300);
  }

  // ------------------------------------------------------------------ the press

  async press(): Promise<void> {
    const now = performance.now();
    if (this.pressing || this.destroyed || this.h.session.solved || this.h.board.demoRunning) return;
    if (now - this.lastPress < HINT_COOLDOWN_MS) {
      this.btn.classList.remove('is-nudge');
      void this.btn.offsetWidth;
      this.btn.classList.add('is-nudge');
      return;
    }
    this.pressing = true;
    this.lastPress = now;
    this.unglow();
    this.cooldown();
    this.armIdle();
    try {
      const answer = await this.answer();
      if (this.destroyed || this.h.session.solved) return;
      if (answer && 'rewind' in answer) {
        this.h.offerRewind('sok.hint.rewind');
        return;
      }
      if (!answer) {
        // no graph yet and off the reference line: back to the newest state on it, then hint from there
        const states = this.h.session.historyStates().map((x) => ({ player: x.player, boxes: x.crates }));
        const idx = await this.h.ctx.client.refRewind(states);
        if (idx >= 0 && idx < this.h.session.history.length) {
          await this.h.rewindTo(idx);
          const again = await this.answer();
          if (again && !('rewind' in again)) await this.give(again, 1);
        }
        return;
      }
      const level = Math.min(3, this.step + 1) as 1 | 2 | 3;
      await this.give(answer, level);
    } finally {
      this.pressing = false;
    }
  }

  /** The cached answer for this state, else a fresh one (think LED + line when it takes > 800 ms). */
  private async answer(): Promise<HintReply> {
    const key = this.stateKey();
    if (this.cache?.key === key) return this.cache.answer;
    const s = this.h.session;
    let thinking = false;
    const t = setTimeout(() => {
      thinking = true;
      this.h.board.express('think', 1400);
      void this.h.strip.say('sok.hint.think', { mood: 'thinking' });
    }, 800);
    const answer = await this.h.ctx.client.hint({ player: s.player, boxes: s.crates });
    clearTimeout(t);
    void thinking;
    if (key === this.stateKey()) this.cache = { key, answer };
    return answer;
  }

  private async give(a: Exclude<HintReply, null | { rewind: true }>, level: 1 | 2 | 3): Promise<void> {
    const s = this.h.session;
    const slot = s.crateAt(a.slotCell);
    if (slot < 0) return;
    const dir = a.dir as Dir;
    this.step = level;
    this.usedMax = Math.max(this.usedMax, level) as 0 | 1 | 2 | 3;
    this.h.board.clearHints();
    const b = this.h.board;
    if (level === 1) {
      playSfx('hint', { volume: 0.6 });
      const c = b.crateCenterPage(slot);
      b.glance(c.x, c.y);
      void b.showHintRing(slot);
      void this.h.strip.say(H1_LINE[a.kind], { mood: 'encouraging', interrupt: true });
      return;
    }
    if (level === 2) {
      playSfx('hint', { volume: 0.6 });
      const stand = nb(s.level, a.slotCell, OPP[dir]);
      const route = s.player === stand ? [] : walkPath(s.level, s.state, stand, b.robot.pose.facing);
      b.showHint2(slot, dir, route, dir);
      void this.h.strip.say('sok.hint.h2', { mood: 'encouraging', interrupt: true });
      return;
    }
    // H3: the ghost plays the next (≤ 3) pushes
    const line = await this.h.ctx.client.line({ player: s.player, boxes: s.crates }, 3);
    if (!line || !line.length || this.destroyed || s.solved) return;
    const steps = this.choreograph(line);
    if (!steps.length) return;
    this.h3Count += 1;
    playSfx('jingle-magic', { volume: 0.35 });
    this.h.setDemo(true);
    const said = this.h.strip.say('sok.hint.h3', { mood: 'encouraging', interrupt: true });
    const done = await b.ghostDemo(steps);
    this.h.setDemo(false);
    if (done && !this.destroyed) {
      await Promise.race([said, new Promise((r) => setTimeout(r, 1200))]);
      void this.h.strip.say('sok.hint.h3.after', { mood: 'happy' });
    }
  }

  /** Walk paths for the ghost on the virtual state (the crates it already moved are obstacles where they now stand). */
  private choreograph(line: { from: number; dir: number }[]): { walk: number[]; slot: number; dir: number }[] {
    const s = this.h.session;
    const l = s.level;
    let player = s.player;
    const crates = Uint16Array.from(s.crates);
    const out: { walk: number[]; slot: number; dir: number }[] = [];
    let facing = this.h.board.robot.pose.facing;
    for (const p of line.slice(0, 3)) {
      let slot = -1;
      for (let k = 0; k < crates.length; k += 1) if (crates[k] === p.from) slot = k;
      if (slot < 0) break;
      const stand = nb(l, p.from, OPP[p.dir]);
      const walk = player === stand ? [] : walkPath(l, { player, boxes: crates }, stand, facing);
      if (walk === null) break;
      out.push({ walk, slot, dir: p.dir });
      player = p.from;
      crates[slot] = nb(l, p.from, p.dir);
      facing = p.dir as typeof facing;
    }
    return out;
  }

  private cooldown(): void {
    this.btn.classList.remove('is-cooling');
    void this.btn.offsetWidth;
    this.btn.classList.add('is-cooling');
    if (this.coolTimer) clearTimeout(this.coolTimer);
    this.coolTimer = setTimeout(() => this.btn.classList.remove('is-cooling'), HINT_COOLDOWN_MS);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
    if (this.coolTimer) clearTimeout(this.coolTimer);
  }
}
