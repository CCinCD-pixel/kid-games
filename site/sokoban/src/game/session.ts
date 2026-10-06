/**
 * One play-through of a level (spec §3, §8.4): the logical state, the history (undo / redo /
 * undoable restart), push counting, win detection and the layer-1 deadlock marks (instant or
 * delayed, with self-rescue counting). Pure logic — no DOM, no timers; the view replays the events.
 *
 * Crates keep their identity (slot = index in the level's start order) so the view can animate
 * them; the engine gets canonical copies when it needs keys.
 */
import { detectAll } from '@engines/puzzle/src/deadlock';
import { nb, parseLevel } from '@engines/puzzle/src/level';
import { walkPath } from '@engines/puzzle/src/path';
import { boxMap, isSolved, walkDist } from '@engines/puzzle/src/rules';
import { DIR_CH, OPP, type DeadType, type Dir, type Level, type State } from '@engines/puzzle/src/types';

export const HISTORY_MAX = 2000;

export interface Snapshot {
  player: number;
  crates: Uint16Array;
}

export type HistEntry =
  | { kind: 'push'; slot: number; dir: Dir; before: Snapshot }
  | { kind: 'restart'; snapshot: Snapshot };

export interface DeadMark {
  slot: number;
  cell: number;
  type: DeadType;
}

export type SessionEvent =
  | { type: 'push'; slot: number; from: number; to: number; dir: Dir; stand: number; unlatch: boolean; lockIn: boolean; locked: number; redo?: boolean }
  | { type: 'undo'; entry: HistEntry; from: Snapshot; to: Snapshot }
  | { type: 'redo'; entry: HistEntry; from: Snapshot; to: Snapshot }
  | { type: 'restart'; from: Snapshot; to: Snapshot }
  | { type: 'dead'; marks: DeadMark[]; shown: boolean }
  | { type: 'deadShown'; marks: DeadMark[] }
  | { type: 'selfRescue' }
  | { type: 'solved' };

export interface SessionStats {
  pushActions: number;
  undos: number;
  redos: number;
  restarts: number;
  dead: Record<DeadType | 'invisible', number>;
  delayed: { events: number; rescued: number };
  arrowPushes: number;
  footprintShows: number;
  unreachableTaps: number;
  boxFirstTaps: number;
}

export interface SessionOptions {
  /** 'instant': marks appear with the push; 'delayed': on the next action or after 4 s (controller) */
  deadMarker: 'instant' | 'delayed';
}

const snap = (player: number, crates: ArrayLike<number>): Snapshot => ({ player, crates: Uint16Array.from(crates as ArrayLike<number>) });

export class PlaySession {
  readonly level: Level;
  player: number;
  crates: Uint16Array;
  history: HistEntry[] = [];
  redoStack: HistEntry[] = [];
  /** shown deadlock marks by crate slot */
  marks = new Map<number, DeadMark>();
  /** delayed marks not shown yet */
  pending: DeadMark[] = [];
  solved = false;
  deadMarker: 'instant' | 'delayed';
  readonly stats: SessionStats = {
    pushActions: 0, undos: 0, redos: 0, restarts: 0,
    dead: { corner: 0, wall: 0, pair: 0, square: 0, invisible: 0 },
    delayed: { events: 0, rescued: 0 }, arrowPushes: 0, footprintShows: 0, unreachableTaps: 0, boxFirstTaps: 0,
  };

  constructor(mapOrLevel: string[] | Level, opts: SessionOptions = { deadMarker: 'instant' }) {
    this.level = Array.isArray(mapOrLevel) ? parseLevel(mapOrLevel) : mapOrLevel;
    this.player = this.level.start.player;
    this.crates = Uint16Array.from(this.level.start.boxes);
    this.deadMarker = opts.deadMarker;
  }

  get state(): State {
    return { player: this.player, boxes: this.crates };
  }

  snapshot(): Snapshot {
    return snap(this.player, this.crates);
  }

  /** Pushes in the current history since the last restart (the HUD number). */
  get pushes(): number {
    let n = 0;
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      const e = this.history[i];
      if (e.kind === 'restart') break;
      n += 1;
    }
    return n;
  }

  get canUndo(): boolean {
    return !this.solved && this.history.length > 0;
  }

  get canRedo(): boolean {
    return !this.solved && this.redoStack.length > 0;
  }

  /** "没推过任何箱子时重来按钮置灰" */
  get canRestart(): boolean {
    return !this.solved && this.pushes > 0;
  }

  crateAt(cell: number): number {
    for (let s = 0; s < this.crates.length; s += 1) if (this.crates[s] === cell) return s;
    return -1;
  }

  isLocked(slot: number): boolean {
    return this.level.goal[this.crates[slot]] === this.level.colorOf[slot];
  }

  lockedCount(): number {
    let n = 0;
    for (let s = 0; s < this.crates.length; s += 1) if (this.isLocked(s)) n += 1;
    return n;
  }

  /** Walking distances from the robot (crates are obstacles). */
  reach(): Int16Array {
    return walkDist(this.level, boxMap(this.level, this.crates), this.player);
  }

  /** Path for tap-to-walk, or null (unreachable). Walking never enters the history. */
  pathTo(cell: number, heading = -1): number[] | null {
    return walkPath(this.level, this.state, cell, heading);
  }

  /** Commit a walk (logic first; the view animates the path). */
  walkTo(cell: number, heading = -1): number[] | null {
    if (this.solved) return null;
    const path = this.pathTo(cell, heading);
    if (path && path.length) this.player = path[path.length - 1];
    return path;
  }

  /** Directions the crate in `slot` can be pushed right now (target free floor + stand cell reachable). */
  legalDirs(slot: number): Dir[] {
    const l = this.level;
    const p = this.crates[slot];
    const dist = this.reach();
    const bmap = boxMap(l, this.crates);
    const out: Dir[] = [];
    for (let d = 0; d < 4; d += 1) {
      const stand = nb(l, p, OPP[d]);
      const to = nb(l, p, d);
      if (stand < 0 || to < 0 || !l.floor[to] || bmap[to] >= 0 || !l.floor[stand] || bmap[stand] >= 0) continue;
      if (dist[stand] < 0) continue;
      out.push(d as Dir);
    }
    return out;
  }

  /** Stand cell to push `slot` in `dir`. */
  standFor(slot: number, dir: Dir): number {
    return nb(this.level, this.crates[slot], OPP[dir]);
  }

  /** Is the robot right next to the crate, on the side opposite to `dir`? */
  adjacentDir(slot: number): Dir | -1 {
    const l = this.level;
    for (let d = 0; d < 4; d += 1) if (nb(l, this.player, d) === this.crates[slot]) return d as Dir;
    return -1;
  }

  canPush(slot: number, dir: Dir): boolean {
    const l = this.level;
    const p = this.crates[slot];
    if (nb(l, p, OPP[dir]) !== this.player) return false;
    const to = nb(l, p, dir);
    return to >= 0 && !!l.floor[to] && this.crateAt(to) < 0;
  }

  private applyPush(slot: number, dir: Dir, redo = false): SessionEvent[] {
    const l = this.level;
    const from = this.crates[slot];
    const to = nb(l, from, dir);
    const stand = this.player;
    const color = l.colorOf[slot];
    const unlatch = l.goal[from] === color;
    const lockIn = l.goal[to] === color;
    this.crates[slot] = to;
    this.player = from;
    const ev: SessionEvent[] = [{ type: 'push', slot, from, to, dir, stand, unlatch, lockIn, locked: this.lockedCount(), ...(redo ? { redo: true } : {}) }];
    if (isSolved(l, this.crates)) {
      this.solved = true;
      this.pending = [];
      ev.push({ type: 'solved' });
      return ev;
    }
    ev.push(...this.detect());
    return ev;
  }

  /** Push the crate in `slot` one cell in `dir` (the robot must stand behind it). */
  push(slot: number, dir: Dir): SessionEvent[] | null {
    if (this.solved || !this.canPush(slot, dir)) return null;
    this.history.push({ kind: 'push', slot, dir, before: snap(this.player, this.crates) });
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.redoStack = [];
    this.stats.pushActions += 1;
    return this.applyPush(slot, dir);
  }

  /** Layer 1: new marks after a move. Instant marks show now; delayed ones wait (controller reveals). */
  private detect(): SessionEvent[] {
    const found = detectAll(this.level, this.crates);
    const fresh: DeadMark[] = [];
    for (const f of found) {
      const slot = this.crateAt(f.cell);
      if (slot < 0) continue;
      const known = this.marks.get(slot) ?? this.pending.find((m) => m.slot === slot);
      if (known) {
        known.cell = f.cell;
        continue;
      }
      fresh.push({ slot, cell: f.cell, type: f.type });
    }
    if (!fresh.length) return [];
    for (const m of fresh) this.stats.dead[m.type] += 1;
    if (this.deadMarker === 'instant') {
      for (const m of fresh) this.marks.set(m.slot, m);
      return [{ type: 'dead', marks: fresh, shown: true }];
    }
    this.stats.delayed.events += 1;
    this.pending.push(...fresh);
    return [{ type: 'dead', marks: fresh, shown: false }];
  }

  /** Delayed mode: the next action (or the 4 s timer) reveals pending marks. */
  revealPending(): SessionEvent[] {
    if (!this.pending.length) return [];
    const marks = this.pending;
    this.pending = [];
    for (const m of marks) this.marks.set(m.slot, m);
    return [{ type: 'deadShown', marks }];
  }

  /**
   * Marks after an undo: every crate that is dead in the restored state is marked (it was marked
   * before — in instant mode always; in delayed mode an undo while marks were pending is a rescue),
   * keeping the type it was first named with; crates that are alive again lose their ✕.
   */
  private resyncMarks(): void {
    const next = new Map<number, DeadMark>();
    for (const f of detectAll(this.level, this.crates)) {
      const slot = this.crateAt(f.cell);
      if (slot < 0) continue;
      const prev = this.marks.get(slot);
      next.set(slot, { slot, cell: f.cell, type: prev?.type ?? f.type });
    }
    this.marks = next;
  }

  private rescueIfPending(): SessionEvent[] {
    if (!this.pending.length) return [];
    this.pending = [];
    this.stats.delayed.rescued += 1;
    return [{ type: 'selfRescue' }];
  }

  undo(): SessionEvent[] | null {
    if (!this.canUndo) return null;
    const entry = this.history.pop()!;
    const from = this.snapshot();
    const ev = this.rescueIfPending();
    if (entry.kind === 'push') {
      this.player = entry.before.player;
      this.crates = Uint16Array.from(entry.before.crates);
    } else {
      this.player = entry.snapshot.player;
      this.crates = Uint16Array.from(entry.snapshot.crates);
    }
    this.redoStack.push(entry);
    this.stats.undos += 1;
    this.resyncMarks();
    return [{ type: 'undo', entry, from, to: this.snapshot() }, ...ev];
  }

  redo(): SessionEvent[] | null {
    if (!this.canRedo) return null;
    const entry = this.redoStack.pop()!;
    const from = this.snapshot();
    this.stats.redos += 1;
    if (entry.kind === 'restart') {
      this.history.push({ kind: 'restart', snapshot: this.snapshot() });
      this.player = this.level.start.player;
      this.crates = Uint16Array.from(this.level.start.boxes);
      this.pending = [];
      this.marks.clear();
      return [{ type: 'redo', entry, from, to: this.snapshot() }];
    }
    // the robot returns to the stand cell of that push, then pushes again
    this.player = entry.before.player;
    this.history.push({ kind: 'push', slot: entry.slot, dir: entry.dir, before: snap(this.player, this.crates) });
    const ev = this.applyPush(entry.slot, entry.dir, true);
    return [{ type: 'redo', entry, from, to: this.snapshot() }, ...ev];
  }

  restart(): SessionEvent[] | null {
    if (!this.canRestart) return null;
    const from = this.snapshot();
    const ev = this.rescueIfPending();
    this.history.push({ kind: 'restart', snapshot: from });
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.redoStack = [];
    this.player = this.level.start.player;
    this.crates = Uint16Array.from(this.level.start.boxes);
    this.marks.clear();
    this.stats.restarts += 1;
    return [{ type: 'restart', from, to: this.snapshot() }, ...ev];
  }

  /** Undo back to history length `len` (the "回到能推完的地方" rewind); returns all events. */
  undoTo(len: number): SessionEvent[] {
    const out: SessionEvent[] = [];
    while (this.history.length > len) {
      const e = this.undo();
      if (!e) break;
      out.push(...e);
    }
    return out;
  }

  /** Snapshots after each history entry (index 0 = start), for the rewind search. */
  historyStates(): Snapshot[] {
    const l = this.level;
    const out: Snapshot[] = [snap(l.start.player, l.start.boxes)];
    for (const e of this.history) {
      if (e.kind === 'push') {
        const crates = Uint16Array.from(e.before.crates);
        const from = crates[e.slot];
        crates[e.slot] = nb(l, from, e.dir);
        out.push({ player: from, crates });
      } else out.push(snap(l.start.player, l.start.boxes));
    }
    return out;
  }

  // ------------------------------------------------------------- save / restore (spec §8.7 `hist`)

  /** Two characters per entry: crate slot digit + u/d/l/r; a restart is `**`. */
  serializeHistory(): string {
    let s = '';
    for (const e of this.history) s += e.kind === 'restart' ? '**' : `${e.slot.toString(36)}${DIR_CH[e.dir]}`;
    return s;
  }

  /** Replay a serialized history from the start. Returns false (and resets) when it does not apply. */
  restoreHistory(hist: string): boolean {
    const l = this.level;
    this.player = l.start.player;
    this.crates = Uint16Array.from(l.start.boxes);
    this.history = [];
    this.redoStack = [];
    this.marks.clear();
    this.pending = [];
    this.solved = false;
    for (let i = 0; i + 1 < hist.length; i += 2) {
      const a = hist[i];
      const b = hist[i + 1];
      if (a === '*' && b === '*') {
        this.history.push({ kind: 'restart', snapshot: this.snapshot() });
        this.player = l.start.player;
        this.crates = Uint16Array.from(l.start.boxes);
        continue;
      }
      const slot = parseInt(a, 36);
      const dir = DIR_CH.indexOf(b) as Dir;
      if (!(slot >= 0 && slot < this.crates.length) || dir < 0) return this.resetAll();
      const stand = nb(l, this.crates[slot], OPP[dir]);
      const to = nb(l, this.crates[slot], dir);
      if (stand < 0 || !l.floor[stand] || to < 0 || !l.floor[to] || this.crateAt(to) >= 0 || this.crateAt(stand) >= 0) return this.resetAll();
      this.history.push({ kind: 'push', slot, dir, before: snap(stand, this.crates) });
      this.player = this.crates[slot];
      this.crates[slot] = to;
    }
    if (isSolved(l, this.crates)) return this.resetAll();
    // shown marks for whatever is dead in the restored state
    for (const f of detectAll(l, this.crates)) {
      const slot = this.crateAt(f.cell);
      if (slot >= 0) this.marks.set(slot, { slot, cell: f.cell, type: f.type });
    }
    return true;
  }

  private resetAll(): false {
    this.player = this.level.start.player;
    this.crates = Uint16Array.from(this.level.start.boxes);
    this.history = [];
    this.redoStack = [];
    this.marks.clear();
    this.pending = [];
    return false;
  }
}

/**
 * Long-press cadence for undo/redo (spec §3.4): one action at once; from 600 ms on, repeats every
 * 220 ms, each interval ×0.8, never below 150 ms (220, 176, 150, 150 …). Returns the action times.
 */
export function holdSchedule(holdMs: number): number[] {
  const out = [0];
  let t = 600;
  let gap = 220;
  while (t <= holdMs) {
    out.push(t);
    t += gap;
    gap = Math.max(150, gap * 0.8);
  }
  return out;
}

/** Index i ≥ 1 → delay before the i-th repeat (ms). */
export function holdGap(i: number): number {
  if (i <= 0) return 600;
  let gap = 220;
  for (let k = 1; k < i; k += 1) gap = Math.max(150, gap * 0.8);
  return gap;
}
