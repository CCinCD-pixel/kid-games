/**
 * Self-play harness (spec §9.3, §9.4): plays one game between two agents on the REAL engine, with
 * the REAL AI (think() on a redacted public view, exactly as the Worker does) and the kid models.
 * Checks the §9.3 invariants on every ply. Used by selfplay / calibrate / bench heavy tests.
 */
import { createRng } from '@kit/rng';
import { BLUE, RED, isCamp, isHQ, type Side } from '../../site/military-chess/src/core/board';
import { knowledgeConsistent, newKnowledge, observe, type Knowledge } from '../../site/military-chess/src/core/belief';
import { LAYOUT_STYLES, aiLayout } from '../../site/military-chess/src/core/layout';
import { hasAnyAction, isMove, legalMoves, type Action } from '../../site/military-chess/src/core/movegen';
import { parseNote, toNote } from '../../site/military-chess/src/core/notation';
import { MARSHAL, isMobileType } from '../../site/military-chess/src/core/pieces';
import { redact } from '../../site/military-chess/src/core/redact';
import { apply } from '../../site/military-chess/src/core/rules';
import { encode, setupFan, setupStandard, type GameResult, type GameState, type Mode } from '../../site/military-chess/src/core/state';
import { LEVELS, type Level } from '../../site/military-chess/src/ai/levels';
import { ladderRuleOverrides } from '../../site/military-chess/src/ctrl/ladder';
import { think } from '../../site/military-chess/src/ai/think';
import { kidMove } from './kid';
import templates from '../../content/military-chess/templates.json';

export type Agent = { kind: 'random' } | { kind: 'kidA' } | { kind: 'kidB' } | { kind: 'ai'; level: Level };
export const agentName = (a: Agent): string => (a.kind === 'ai' ? `L${a.level}` : a.kind);

export interface GameRecord {
  mode: Mode;
  seed: string;
  setup: { red?: string; blue?: string; fanSeed?: string; firstMover: Side; firstPlayer: 0 | 1 };
  notes: string[];
  result: GameResult;
  ply: number;
  /** player (0/1) → colour */
  colourOf: [number, number];
  violations: string[];
  /** ms per AI move, per player */
  aiMs: [number[], number[]];
  /** actions taken by each player */
  actions: [number, number];
  /** C-test hooks: per player decision trace (optional) */
  finalHash: string;
  /** 1 档 sanity: own-HQ entries and visible-bigger attacks by each player */
  blunders: [number, number];
  beliefResets: number;
  shuttleDecided: boolean;
  /** non-default quiet limit the game was played with (ladder overrides) */
  quietLimit?: number;
}

const KID_LAYOUTS = (templates as Array<{ kid: boolean; layout: string }>).filter((t) => t.kid).map((t) => t.layout);

export function startFor(mode: Mode, agents: [Agent, Agent], seed: string, ladder: boolean): { s: GameState; setup: GameRecord['setup'] } {
  const rng = createRng(`mc:selfplay:${seed}`);
  const first = (rng.next() < 0.5 ? 0 : 1) as 0 | 1;
  // ladder games use the robot's ladder rules (the higher robot's when two robots play)
  const aiLevel = Math.max(0, ...agents.map((a) => (a.kind === 'ai' ? a.level : 0)));
  const rules = { endByCount: ladder, ...(ladder && aiLevel ? ladderRuleOverrides(mode, aiLevel) : {}) };
  if (mode === 'fan') {
    const fanSeed = `mc:fan:sp:${seed}`;
    return { s: setupFan(createRng(fanSeed).next, rules, first), setup: { fanSeed, firstMover: RED, firstPlayer: first } };
  }
  const lay = agents.map((a, side) => {
    if (a.kind === 'ai') return aiLayout(LAYOUT_STYLES[LEVELS[mode][a.level].layout], createRng(`mc:deploy:sp:${seed}:${side}`).next);
    return KID_LAYOUTS[Math.floor(rng.next() * KID_LAYOUTS.length)];
  });
  const s = setupStandard(mode, { red: lay[0], blue: lay[1], firstMover: first as Side, rules });
  return { s, setup: { red: lay[0], blue: lay[1], firstMover: first as Side, firstPlayer: first } };
}

const playerOf = (s: GameState): 0 | 1 => (s.mode !== 'fan' ? (s.turn as 0 | 1) : s.turn === -1 ? s.toAct : (s.colorOf[0] === s.turn ? 0 : 1));

export function playGame(mode: Mode, agents: [Agent, Agent], seed: string, o: { ladder?: boolean; invariants?: boolean } = {}): GameRecord {
  const ladder = o.ladder ?? true;
  const { s: s0, setup } = startFor(mode, agents, seed, ladder);
  let s = s0;
  const rng = createRng(`mc:agents:${seed}`);
  const know: [Knowledge | null, Knowledge | null] = mode === 'an' ? [newKnowledge(s, RED), newKnowledge(s, BLUE)] : [null, null];
  const notes: string[] = [];
  const violations: string[] = [];
  const aiMs: [number[], number[]] = [[], []];
  const actions: [number, number] = [0, 0];
  const blunders: [number, number] = [0, 0];
  let beliefResets = 0;
  let shuttleDecided = false;
  const v = (msg: string): void => {
    if (violations.length < 20) violations.push(`${seed} ply ${s.ply}: ${msg}`);
  };
  while (!s.result) {
    const player = playerOf(s);
    const agent = agents[player];
    const side = s.turn;
    const legal = legalMoves(s);
    if (!legal.length) {
      v('no legal action but no result');
      break;
    }
    let a: Action | null = null;
    const myKnow: Knowledge | null = side === -1 ? null : know[side];
    if (agent.kind === 'random') a = legal[Math.floor(rng.next() * legal.length)];
    else if (agent.kind === 'kidA' || agent.kind === 'kidB') a = kidMove(s, () => rng.next(), myKnow, agent.kind === 'kidA' ? 'A' : 'B');
    else {
      const me = (side === -1 ? RED : side) as Side;
      const view = redact(s, me, myKnow);
      const t0 = performance.now();
      const r = think({ view, level: agent.level, seed: `mc:ai:sp:${seed}:${s.ply}` });
      aiMs[player].push(performance.now() - t0);
      beliefResets += r.stats.beliefResets;
      a = parseNote(s, r.note);
      if (!a) v(`AI returned an illegal note ${r.note}`);
    }
    if (!a) a = legal[0];
    actions[player]++;
    const note = toNote(a);
    if (o.invariants !== false) {
      if (!legal.some((x) => toNote(x) === note)) v('illegal action ' + note);
      if (isMove(a)) {
        if (a.kind === 'attack' && isCamp(a.to)) v('attacked a camp ' + note);
        if (isHQ(a.from) || !isMobileType(s.ptype[a.pid])) v('immobile piece moved ' + note);
        // "looks like a beginner, not broken" (§9.4): walking into a 大本营 or attacking a visible
        // bigger piece counts as a blunder only when something else was possible (forced moves are fine)
        const isBlunder = (m: Action): boolean => {
          if (!isMove(m)) return false;
          if (m.kind === 'move' && isHQ(m.to)) return true;
          if (m.kind === 'attack' && s.mode !== 'an') {
            const def = s.board[m.to];
            const visible = s.mode === 'ming' || !!s.pup[def];
            return visible && resolveSafe(s, m.pid, def) === 'D';
          }
          return false;
        };
        if (isBlunder(a) && legal.some((x) => !isBlunder(x))) blunders[player]++;
      }
    }
    const before = s;
    const { state, event } = apply(s, a);
    if (mode === 'an') for (const k of know) {
      observe(k!, before, event);
      if (o.invariants !== false && !knowledgeConsistent(k!, state)) v('knowledge inconsistent');
    }
    if (o.invariants !== false) {
      for (const sd of [RED, BLUE] as Side[]) {
        let marshalAlive = false;
        for (let p = 0; p < state.np; p++) if (state.pside[p] === sd && state.ptype[p] === MARSHAL && state.palive[p]) marshalAlive = true;
        if (state.flagShown[sd] === marshalAlive) v('flagShown ⇔ marshal dead broken');
      }
    }
    notes.push(note);
    s = state;
    if (s.result && s.result.reason === 'no-moves' && s.turn !== -1) {
      // did the anti-shuttle rule decide it? (the loser could move if the shuttle limit were lifted)
      const loser = s.turn as Side;
      const t = { ...s, shuttle: [{ pid: -1, from: -1, to: -1, n: 0 }, { pid: -1, from: -1, to: -1, n: 0 }] as GameState['shuttle'] };
      if (hasAnyAction(t, loser)) shuttleDecided = true;
    }
  }
  // the 600-ply cap is a safety net (it ends the game by 清点兵力 / draw); the self-play test checks it
  const colourOf: [number, number] = mode === 'fan' ? [s.colorOf[0], s.colorOf[1]] : [0, 1];
  return { mode, seed, setup, notes, result: s.result!, ply: s.ply, colourOf, violations, aiMs, actions, finalHash: encode(s), blunders, beliefResets, shuttleDecided, quietLimit: s0.rules.quietLimit !== (mode === 'fan' ? 40 : 80) ? s0.rules.quietLimit : undefined };
}

function resolveSafe(s: GameState, att: number, def: number): string {
  const t = s.ptype[att], d = s.ptype[def];
  if (d === 0) return 'F';
  if (t === 2 || d === 2) return 'B';
  if (d === 1) return t === 3 ? 'A' : 'D';
  return t > d ? 'A' : t < d ? 'D' : 'B';
}

/** replay a record from its setup + notes → final encode (determinism check) */
export function replayRecord(r: GameRecord, ladder = true): string {
  const rules = { endByCount: ladder, ...(r.quietLimit ? { quietLimit: r.quietLimit } : {}) };
  let s = r.mode === 'fan'
    ? setupFan(createRng(r.setup.fanSeed!).next, rules, r.setup.firstPlayer)
    : setupStandard(r.mode, { red: r.setup.red!, blue: r.setup.blue!, firstMover: r.setup.firstMover, rules });
  for (const n of r.notes) {
    const a = parseNote(s, n);
    if (!a) throw new Error('replay: illegal ' + n);
    s = apply(s, a).state;
  }
  return encode(s);
}

/** score of player 0 in a record: 1 win, 0.5 draw, 0 loss */
export function scoreOf(r: GameRecord, player: 0 | 1): number {
  if (r.result.winner === -1) return 0.5;
  return r.colourOf[player] === r.result.winner ? 1 : 0;
}

export function wilson(p: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 1];
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

export const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const a = xs.slice().sort((x, y) => x - y);
  return a[a.length >> 1];
};
export const pct = (xs: number[], q: number): number => {
  if (!xs.length) return 0;
  const a = xs.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * q))];
};
