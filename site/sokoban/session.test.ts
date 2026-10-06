/**
 * Session logic (spec §3.3–§3.6, §8.10 session.test): push / undo / redo / undoable restart,
 * hold cadence, instant win lock, unlatching, history round-trips, redo cleared by a new push,
 * delayed marks and self-rescue.
 */
import { describe, expect, it } from 'vitest';
import { replayLurd } from '@engines/puzzle/src/rules';
import { DIR_CH, type Dir } from '@engines/puzzle/src/types';
import { PlaySession, holdSchedule, type SessionEvent } from './src/game/session';
import { levelById } from './src/data';
import { starsFor } from './src/game/stars';

/** Play a LURD line through the session API (walks + pushes) like the input layer does. */
function play(s: PlaySession, lurd: string): SessionEvent[] {
  const out: SessionEvent[] = [];
  const l = s.level;
  for (const ch of lurd) {
    const d = DIR_CH.indexOf(ch.toLowerCase()) as Dir;
    const r = (s.player / l.W) | 0;
    const c = s.player % l.W;
    const next = (r + [-1, 1, 0, 0][d]) * l.W + c + [0, 0, -1, 1][d];
    if (ch === ch.toUpperCase()) {
      const ev = s.push(s.crateAt(next), d);
      expect(ev, `push ${ch}`).not.toBeNull();
      out.push(...(ev ?? []));
    } else {
      expect(s.walkTo(next)).not.toBeNull();
    }
  }
  return out;
}

const L = (id: string) => levelById(id)!;

describe('PlaySession', () => {
  it('solves every shipped ch0–2 level with its reference line and locks at once', () => {
    for (const id of ['0-1', '0-2', '0-3', '0-4', '1-1', '1-6', '2-5', '2-7']) {
      const s = new PlaySession(L(id).map);
      const ev = play(s, L(id).ref);
      expect(s.solved).toBe(true);
      expect(s.pushes).toBe(L(id).opt.pushes);
      expect(ev.some((e) => e.type === 'solved')).toBe(true);
      expect(s.canUndo).toBe(false);
      expect(s.push(0, 0)).toBeNull();
    }
  });

  it('counts pushes in history; undo rewinds to the stand cell; redo replays', () => {
    const s = new PlaySession(L('2-5').map);
    play(s, 'rrDRR');
    expect(s.pushes).toBe(3);
    const before = s.snapshot();
    const u = s.undo()!;
    expect(u[0].type).toBe('undo');
    expect(s.pushes).toBe(2);
    expect(s.canRedo).toBe(true);
    // the robot stands where it stood for that push, facing the crate
    const e = u[0] as Extract<SessionEvent, { type: 'undo' }>;
    expect(e.entry.kind).toBe('push');
    s.walkTo(s.level.start.player); // walking does not clear redo
    expect(s.canRedo).toBe(true);
    s.redo();
    expect(s.snapshot()).toEqual(before);
    expect(s.pushes).toBe(3);
    s.undo();
    play(s, 'lD'); // a new push clears the redo stack
    expect(s.canRedo).toBe(false);
  });

  it('restart is undoable and disabled before any push', () => {
    const s = new PlaySession(L('2-1').map);
    expect(s.canRestart).toBe(false);
    play(s, 'llluRRR');
    const mid = s.snapshot();
    expect(s.restart()).not.toBeNull();
    expect(s.pushes).toBe(0);
    expect(s.player).toBe(s.level.start.player);
    s.undo();
    expect(s.snapshot()).toEqual(mid);
    expect(s.pushes).toBe(3);
    // redo of a restart restarts again
    s.redo();
    expect(s.pushes).toBe(0);
  });

  it('marks unlatching and lock-in with a rising locked count', () => {
    const s = new PlaySession(L('2-8').map);
    const ev = play(s, 'rDDuu');
    const pushes = ev.filter((e) => e.type === 'push') as Extract<SessionEvent, { type: 'push' }>[];
    expect(pushes[1].lockIn).toBe(true);
    expect(pushes[1].locked).toBe(1);
  });

  it('serialises the history (with restarts) and restores the same state', () => {
    const s = new PlaySession(L('2-5').map);
    play(s, 'rrDRR');
    s.restart();
    play(s, 'rrDR');
    const hist = s.serializeHistory();
    expect(hist).toMatch(/\*\*/);
    const t = new PlaySession(L('2-5').map);
    expect(t.restoreHistory(hist)).toBe(true);
    expect(t.snapshot()).toEqual(s.snapshot());
    expect(t.pushes).toBe(2);
    t.undo();
    t.undo();
    t.undo(); // undo the restart → back to the 3-push state
    expect(t.pushes).toBe(3);
    expect(new PlaySession(L('2-5').map).restoreHistory('9z')).toBe(false);
  });

  it('instant marks: 0-3 pushed into the corner shows a corner ✕ at once', () => {
    const s = new PlaySession(L('0-3').map, { deadMarker: 'instant' });
    const ev = s.push(s.crateAt(s.level.start.boxes[0]), 0)!;
    const dead = ev.find((e) => e.type === 'dead') as Extract<SessionEvent, { type: 'dead' }>;
    expect(dead.shown).toBe(true);
    expect(dead.marks[0].type).toBe('corner');
    expect(s.marks.size).toBe(1);
    s.undo();
    expect(s.marks.size).toBe(0);
  });

  it('delayed marks: undo before the reveal counts as a self-rescue', () => {
    const s = new PlaySession(L('0-3').map, { deadMarker: 'delayed' });
    const ev = s.push(0, 0)!;
    expect((ev.find((e) => e.type === 'dead') as Extract<SessionEvent, { type: 'dead' }>).shown).toBe(false);
    expect(s.marks.size).toBe(0);
    const u = s.undo()!;
    expect(u.some((e) => e.type === 'selfRescue')).toBe(true);
    expect(s.stats.delayed).toEqual({ events: 1, rescued: 1 });
    s.push(0, 0);
    const shown = s.revealPending();
    expect(shown[0].type).toBe('deadShown');
    expect(s.marks.size).toBe(1);
    s.undo();
    expect(s.stats.delayed.rescued).toBe(1);
  });

  it('history states line up with the history for the rewind search', () => {
    const s = new PlaySession(L('2-5').map);
    play(s, 'rrDRRRll');
    const states = s.historyStates();
    expect(states.length).toBe(s.history.length + 1);
    const r = replayLurd(s.level, 'rrDRRR');
    expect(Array.from(states[states.length - 1].crates)).toEqual(Array.from(r.boxes));
  });

  it('hold cadence: 2 s of holding = 10 actions (220, 176, 150 … ms after 600 ms)', () => {
    const t = holdSchedule(2000);
    expect(t.length).toBe(10);
    expect(t.slice(0, 5)).toEqual([0, 600, 820, 996, 1146]);
  });
});

describe('stars', () => {
  it('three stars only at the optimum without H3', () => {
    expect(starsFor(11, 11, 14, false)).toBe(3);
    expect(starsFor(11, 11, 14, true)).toBe(2);
    expect(starsFor(14, 11, 14, false)).toBe(2);
    expect(starsFor(15, 11, 14, false)).toBe(1);
  });
});
