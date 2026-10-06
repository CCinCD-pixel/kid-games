/**
 * The public view of a game for one side (spec §8.5 "不偷看", review B5). The AI Worker and the hint
 * level only ever receive a PublicView — never a GameState — so they cannot read hidden identities:
 *  - 暗棋: the enemy's identities are UNKNOWN (−1); the view carries that side's knowledge masks and
 *    the enemy's per-type totals (handicap-aware);
 *  - 翻翻棋: every face-down piece has UNKNOWN identity AND colour; the view carries the public
 *    multiset of face-down pieces (what has not been turned up yet is public: nothing can be taken
 *    face down).
 * `worldFrom` turns a view plus a sampled assignment back into a GameState for search.
 */
import { BLUE, RED, type Side } from './board';
import { ALL, sampleAssignment, type BeliefInput, type Knowledge, type Rand } from './belief';
import { COUNTS, FLAG } from './pieces';
import { MAXP, defaultRules, type GameResult, type GameState, type Mode, type RuleSet, type Shuttle } from './state';

export const UNKNOWN = -1;

export interface PublicView {
  mode: Mode;
  /** the side whose eyes these are */
  me: Side;
  np: number;
  board: number[];
  ptype: number[];
  pside: number[];
  pinit: number[];
  ppos: number[];
  palive: number[];
  pup: number[];
  pmoved: number[];
  turn: Side | -1;
  ply: number;
  quiet: number;
  flagShown: [boolean, boolean];
  shuttle: [Shuttle, Shuttle];
  colorOf: [Side | -1, Side | -1];
  toAct: 0 | 1;
  firstMover: Side;
  rules: RuleSet;
  result: GameResult | null;
  /** 暗棋: masks of the enemy pieces by pid (own pieces ALL) */
  masks: number[] | null;
  /** 暗棋: the enemy's per-type totals (COUNTS minus handicap) */
  enemyCounts: number[] | null;
  /** 翻翻棋: face-down multiset, index side·12 + type */
  hidden: number[] | null;
}

/**
 * The view of side `me`. 暗棋 needs `me`'s knowledge (and the enemy's handicap totals); 明棋 is fully
 * public; 翻翻棋 hides every face-down piece.
 */
export function redact(s: GameState, me: Side, k: Knowledge | null = null, enemyCounts: readonly number[] | null = null): PublicView {
  const n = s.np;
  const ptype: number[] = [], pside: number[] = [];
  let hidden: number[] | null = null;
  if (s.mode === 'fan') hidden = new Array(24).fill(0);
  for (let p = 0; p < n; p++) {
    let t: number = s.ptype[p], side: number = s.pside[p];
    // 暗棋: enemy identities are hidden, except a flag shown after its 司令 went down (public, R6.5)
    if (s.mode === 'an' && side !== me) t = s.palive[p] && s.flagShown[side] && t === FLAG ? FLAG : UNKNOWN;
    if (s.mode === 'fan' && !s.pup[p]) {
      if (s.palive[p]) hidden![side * 12 + t]++;
      t = UNKNOWN;
      side = UNKNOWN;
    }
    ptype.push(t);
    pside.push(side);
  }
  let masks: number[] | null = null;
  if (s.mode === 'an') {
    masks = [];
    for (let p = 0; p < n; p++) masks.push(s.pside[p] === me ? ALL : k ? k.mask[p] : ALL);
  }
  return {
    mode: s.mode,
    me,
    np: n,
    board: Array.from(s.board),
    ptype,
    pside,
    pinit: Array.from(s.pinit.subarray(0, n)),
    ppos: Array.from(s.ppos.subarray(0, n)),
    palive: Array.from(s.palive.subarray(0, n)),
    pup: Array.from(s.pup.subarray(0, n)),
    pmoved: Array.from(s.pmoved.subarray(0, n)),
    turn: s.turn,
    ply: s.ply,
    quiet: s.quiet,
    flagShown: [s.flagShown[0], s.flagShown[1]],
    shuttle: [{ ...s.shuttle[0] }, { ...s.shuttle[1] }],
    colorOf: [s.colorOf[0], s.colorOf[1]],
    toAct: s.toAct,
    firstMover: s.firstMover,
    rules: { ...s.rules },
    result: s.result ? { ...s.result } : null,
    masks,
    enemyCounts: s.mode === 'an' ? (enemyCounts ? enemyCounts.slice() : COUNTS.slice()) : null,
    hidden,
  };
}

/** rebuild a playable GameState from a view; unknown identities come from `assign` (pid → [side, type]) */
export function worldFrom(v: PublicView, assign: Map<number, [number, number]> | null): GameState {
  const ptype = new Uint8Array(MAXP), pside = new Uint8Array(MAXP), pinit = new Int8Array(MAXP).fill(-1);
  const ppos = new Int8Array(MAXP).fill(-1), palive = new Uint8Array(MAXP), pup = new Uint8Array(MAXP), pmoved = new Uint8Array(MAXP);
  for (let p = 0; p < v.np; p++) {
    let t = v.ptype[p], side = v.pside[p];
    const a = assign?.get(p);
    if (a) {
      side = a[0];
      t = a[1];
    }
    if (t < 0 || side < 0) {
      // an unknown that nobody assigned (a piece that is down and irrelevant): neutral filler
      t = t < 0 ? 4 : t;
      side = side < 0 ? 0 : side;
    }
    ptype[p] = t;
    pside[p] = side;
    pinit[p] = v.pinit[p];
    ppos[p] = v.ppos[p];
    palive[p] = v.palive[p];
    pup[p] = v.pup[p];
    pmoved[p] = v.pmoved[p];
  }
  return {
    mode: v.mode,
    board: Int8Array.from(v.board),
    np: v.np,
    ptype,
    pside,
    pinit,
    ppos,
    palive,
    pup,
    pmoved,
    turn: v.turn,
    ply: v.ply,
    quiet: v.quiet,
    flagShown: [v.flagShown[0], v.flagShown[1]],
    shuttle: [{ ...v.shuttle[0] }, { ...v.shuttle[1] }],
    colorOf: [v.colorOf[0], v.colorOf[1]],
    toAct: v.toAct,
    firstMover: v.firstMover,
    rules: { ...defaultRules(v.mode), ...v.rules },
    result: v.result,
  };
}

/** 暗棋: sample the enemy's identities from the view's masks (deployment prior); counts-only fallback */
export function sampleEnemy(v: PublicView, rng: Rand): { assign: Map<number, [number, number]>; reset: boolean } {
  const enemy = (1 - v.me) as Side;
  const pieces: number[] = [];
  for (let p = 0; p < v.np; p++) if (v.pside[p] === enemy) pieces.push(p);
  const masks = pieces.map((p) => (v.ptype[p] >= 0 ? 1 << v.ptype[p] : v.masks ? v.masks[p] : ALL));
  const input: BeliefInput = { pieces, masks, pinit: pieces.map((p) => v.pinit[p]), moved: pieces.map((p) => !!v.pmoved[p]), counts: v.enemyCounts ?? COUNTS };
  let reset = false;
  let sample: Map<number, number>;
  try {
    sample = sampleAssignment(input, rng);
  } catch {
    // R6 (§10.2): masks contradict the counts → counts-only sampling, logged by the caller
    reset = true;
    sample = sampleAssignment({ ...input, masks: masks.map((m, i) => (v.ptype[pieces[i]] >= 0 ? m : ALL)) }, rng, false);
  }
  const assign = new Map<number, [number, number]>();
  for (const p of pieces) assign.set(p, [enemy, sample.get(p)!]);
  return { assign, reset };
}

/** 翻翻棋: deal the public face-down multiset onto the face-down pieces (a seeded permutation) */
export function dealHidden(v: PublicView, rng: Rand): Map<number, [number, number]> {
  const bag: Array<[number, number]> = [];
  v.hidden!.forEach((n, k) => {
    for (let i = 0; i < n; i++) bag.push([k >= 12 ? BLUE : RED, k % 12]);
  });
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const assign = new Map<number, [number, number]>();
  let k = 0;
  for (let p = 0; p < v.np; p++) if (v.palive[p] && !v.pup[p]) assign.set(p, bag[k++]);
  return assign;
}
