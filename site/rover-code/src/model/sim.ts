/**
 * 玉兔编程 model (the pure part): parse a level, run one card, run a whole program, count edits. A port of the spec's reference
 * model (specs/rover-code, core.mjs) for chapters 1–6: single cards, the repeat block and the magic card (a second row P1 that a card C in the main row plays).
 * Coordinates: x → east, y → south (row 0 is the top of the screen). A program succeeds only when it ENDS on the goal with
 * every required sample taken ("停在终点才算到"): passing over the goal on the way does not count.
 */
export type Card = 'N' | 'E' | 'S' | 'W' | 'F' | 'L' | 'R' | 'P';
/** what the card box can hold: the cards, and the repeat card X (which opens a block) */
export type CardKey = Card | 'X' | 'C';
/** the magic card: plays the whole P1 row once */
export type MainCard = Card | 'C';
/** a repeat block: `n` times the body; the body holds up to four cards (magic cards too) and no block (no nesting) */
export interface Block { k: 'X'; n: number; body: MainCard[] }
export type Item = MainCard | Block;
export const MAX_BODY = 4;
export type Part = 'wheels' | 'panel' | 'mast';
export interface Config { wheels: 'S' | 'L'; panel: 'S' | 'L'; mast: 'S' | 'T' }
export const DEFAULT_CONFIG: Config = { wheels: 'S', panel: 'S', mast: 'S' };

export interface LevelData {
  kind?: 'grid';
  id: string; brief: string; ch: number; n: number; role: string; title: string; teach: string;
  cards: CardKey[]; slots: number; expectMin: number; minCrystal?: number | null;
  p1Slots?: number; needCall?: boolean | 'strict'; buggyP1?: string; fixP1?: string;
  map: string[]; height?: string[];
  garage?: { open: Part[] }; loadout?: Config;
  fog?: { brief: [Card, number][] };
  ghost?: 'full' | 'last' | 'off';
  intro?: boolean; review?: string[];
  fix?: string; buggy?: string; bugs?: number; bugKinds?: string[];
  solution: { main: string; p1?: string };
}

export interface Cell { ch: string; h: number; block: boolean; narrow: boolean; over: boolean; req: number; crystal: boolean; goal: boolean; color: 'B' | 'Y' | null }
export interface Level extends LevelData {
  W: number; H: number; cells: Cell[];
  start: { x: number; y: number; d: number }; goal: { x: number; y: number };
  req: { x: number; y: number; kind: string }[]; full: number; hasCrystal: boolean;
}
export interface State { x: number; y: number; d: number; m: number; c: number }
export type Err = 'edge' | 'rock' | 'step' | 'narrow' | 'overhang' | 'nosample' | 'dark';

export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const START: Record<string, number> = { '^': 0, '>': 1, v: 2, '<': 3 };
const ABS: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };
const VALID = '.#oGad*rnuBY^>v<';

export function parseLevel(L: LevelData): Level {
  const H = L.map.length, W = L.map[0].length;
  if (W > 8 || H > 8) throw new Error(`${L.id}: map larger than 8x8`);
  const cells: Cell[] = [];
  let start: Level['start'] | null = null, goal: Level['goal'] | null = null, hasCrystal = false;
  const req: Level['req'] = [];
  for (let y = 0; y < H; y++) {
    if (L.map[y].length !== W) throw new Error(`${L.id}: row ${y} width`);
    for (let x = 0; x < W; x++) {
      const ch = L.map[y][x];
      if (!VALID.includes(ch)) throw new Error(`${L.id}: bad map symbol ${ch}`);
      const c: Cell = { ch, h: L.height ? Number(L.height[y][x]) : 0, block: ch === '#' || ch === 'o', narrow: ch === 'n', over: ch === 'u', req: -1, crystal: ch === '*', goal: ch === 'G', color: ch === 'B' || ch === 'Y' ? ch : null };
      if (ch in START) { if (start) throw new Error(`${L.id}: two starts`); start = { x, y, d: START[ch] }; }
      if (ch === 'G') { if (goal) throw new Error(`${L.id}: two goals`); goal = { x, y }; }
      if (ch === '*') hasCrystal = true;
      if (ch === 'a' || ch === 'd' || ch === 'r') { c.req = req.length; req.push({ x, y, kind: ch }); }   // a stranded rover (r) is picked up by driving onto it
      cells.push(c);
    }
  }
  if (!start || !goal) throw new Error(`${L.id}: needs a start and a goal`);
  return { ...L, W, H, cells, start, goal, req, full: (1 << req.length) - 1, hasCrystal };
}

export const climbOf = (cfg: Config): number => (cfg.wheels === 'L' ? 2 : 1);
/** the garage trades slots for abilities: a big panel gives 3 more cards, big wheels cost 2 */
export const slotsOf = (lv: Level, cfg: Config): number => lv.slots + (lv.garage ? (cfg.panel === 'L' ? 3 : 0) - (cfg.wheels === 'L' ? 2 : 0) : 0);
export const startState = (lv: Level): State => ({ x: lv.start.x, y: lv.start.y, d: lv.start.d, m: 0, c: 0 });
export const cellAt = (lv: Level, x: number, y: number): Cell => lv.cells[y * lv.W + x];
export const atGoal = (lv: Level, s: State): boolean => s.m === lv.full && s.x === lv.goal.x && s.y === lv.goal.y;

/** one card → the next state; `err` says why the rover stayed (the state then only carries the turn) */
export function act(lv: Level, cfg: Config, s: State, a: Card): { s: State; err?: Err } {
  if (a === 'L') return { s: { ...s, d: (s.d + 3) & 3 } };
  if (a === 'R') return { s: { ...s, d: (s.d + 1) & 3 } };
  if (a === 'P') {
    const c = cellAt(lv, s.x, s.y);
    if (c.req < 0 || c.ch === 'r' || (s.m >> c.req) & 1) return { s, err: 'nosample' };
    if (c.ch === 'd' && cfg.mast !== 'T') return { s, err: 'dark' };
    return { s: { ...s, m: s.m | (1 << c.req) } };
  }
  const d = a in ABS ? ABS[a] : s.d;
  const [dx, dy] = DIRS[d];
  const nx = s.x + dx, ny = s.y + dy;
  const turned = { ...s, d };
  if (nx < 0 || ny < 0 || nx >= lv.W || ny >= lv.H) return { s: turned, err: 'edge' };
  const c = cellAt(lv, nx, ny), cur = cellAt(lv, s.x, s.y);
  if (c.block) return { s: turned, err: 'rock' };
  if (Math.abs(c.h - cur.h) > climbOf(cfg)) return { s: turned, err: 'step' };
  if (c.narrow && cfg.panel === 'L') return { s: turned, err: 'narrow' };
  if (c.over && cfg.mast === 'T') return { s: turned, err: 'overhang' };
  return { s: { x: nx, y: ny, d, m: c.ch === 'r' ? s.m | (1 << c.req) : s.m, c: c.crystal ? 1 : s.c } };
}

/** `path` says where in the programme the card sits: [item] for a plain card, [block item, place in the body] inside a block */
export interface Step { card: Card; path: [number, number?]; p1?: number; s: State; err?: Err }
export interface RunResult { res: 'win' | 'crash' | 'end'; s: State; steps: Step[]; err?: Err; at?: Step['path']; crystal: boolean }

/** the plain cards a programme boils down to, in the order the rover does them, each with where it came from; a magic card plays the P1 row
 *  (its steps carry the call site in `path` and the place in the row in `p1`) */
export function flatten(prog: readonly Item[], p1: readonly Card[] = []): { card: Card; path: Step['path']; p1?: number }[] {
  const out: { card: Card; path: Step['path']; p1?: number }[] = [];
  const play = (c: MainCard, path: Step['path']) => {
    if (c === 'C') p1.forEach((q, k) => out.push({ card: q, path, p1: k }));
    else out.push({ card: c, path });
  };
  prog.forEach((it, i) => {
    if (typeof it === 'string') play(it, [i]);
    else for (let k = 0; k < it.n; k++) it.body.forEach((c, j) => play(c, [i, j]));
  });
  return out;
}
/** what a programme costs in rail slots: a card 1, a repeat block 1 plus the cards in it, plus the cards of the P1 row */
export const cost = (prog: readonly Item[], p1: readonly Card[] = []): number =>
  prog.reduce((a, it) => a + (typeof it === 'string' ? 1 : 1 + it.body.length), 0) + p1.length;
/** the main row alone: the P1 row has its own slots */
export const mainCost = (prog: readonly Item[]): number => cost(prog);

/** run a whole program; stops at the first card the rover cannot do */
export function run(lv: Level, cfg: Config, prog: readonly Item[], p1: readonly Card[] = []): RunResult {
  let s = startState(lv);
  const steps: Step[] = [];
  for (const { card, path, p1: at } of flatten(prog, p1)) {
    const r = act(lv, cfg, s, card);
    steps.push({ card, path, p1: at, s: r.s, err: r.err });
    s = r.s;
    if (r.err) return { res: 'crash', err: r.err, at: path, s, steps, crystal: s.c === 1 };
  }
  return { res: atGoal(lv, s) ? 'win' : 'end', s, steps, crystal: s.c === 1 };
}

/** text form: "FF3(FR)F" — a digit 2-5 opens a block, a closing bracket ends it */
export function parseProg(str: string): Item[] {
  const out: Item[] = [];
  const t = str.replace(/\s/g, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (/[2-5]/.test(ch)) {
      if (t[i + 1] !== '(') throw new Error(`expected ( in ${str}`);
      const end = t.indexOf(')', i);
      if (end < 0) throw new Error(`missing ) in ${str}`);
      out.push({ k: 'X', n: Number(ch), body: [...t.slice(i + 2, end)] as MainCard[] });
      i = end;
    } else out.push(ch as MainCard);
  }
  return out;
}
export const progStr = (prog: readonly Item[]): string => prog.map((it) => (typeof it === 'string' ? it : `${it.n}(${it.body.join('')})`)).join('');
const tokens = (prog: readonly Item[]): string[] => prog.flatMap((it) => (typeof it === 'string' ? [it] : [`X${it.n}`, ...it.body, ')']));

/** optimal-string-alignment distance: insert, delete, replace, swap two neighbours each cost 1 */
export function osa<T>(a: readonly T[], b: readonly T[]): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
export const editCount = (a: readonly Item[], b: readonly Item[], aP1: readonly Card[] = [], bP1: readonly Card[] = []): number => osa(tokens(a), tokens(b)) + osa(aP1, bP1);

/** metres still to go, for the "还差 N 米" line when the program ran out before the goal */
export const metresLeft = (lv: Level, s: State): number => Math.abs(lv.goal.x - s.x) + Math.abs(lv.goal.y - s.y);

// ───────────────────────────────────────────────────────── chapter 7: rule cards and the autopilot
export type Cond = 'B' | 'Y' | 'A' | 'W';          // on a blue tile · on a yellow tile · on a sample not yet taken · the way ahead is blocked
export type Rules = Partial<Record<Cond, 'L' | 'R' | 'P'>>;
export interface RuleLevelData {
  kind: 'rules'; id: string; brief: string; ch: number; n: number; role: string; title: string; teach: string;
  conds: Cond[]; ruleSlots: number; expectRules: number; needW?: boolean; review?: string[];
  maps: { map: string[] }[]; solution: Rules;
}
/** a level with two maps and one set of rules for both */
export interface RuleLevel extends Omit<RuleLevelData, 'maps'> { maps: Level[] }
export type AnyLevel = Level | RuleLevel;

export function parseRuleLevel(d: RuleLevelData): RuleLevel {
  const maps = d.maps.map((m, i) => parseLevel({ id: `${d.id}-${'AB'[i]}`, brief: d.brief, ch: d.ch, n: d.n, role: d.role, title: d.title, teach: d.teach, cards: [], slots: 0, expectMin: 0, map: m.map, solution: { main: '' } }));
  return { ...d, maps };
}

export type AutoRes = 'win' | 'crash' | 'stuck' | 'loop' | 'cap';
export interface AutoStep { card: Card; s: State; err?: Err }
export interface AutoResult { res: AutoRes; s: State; steps: AutoStep[]; err?: Err }
const blockedAhead = (lv: Level, cfg: Config, s: State): boolean => !!act(lv, cfg, s, 'F').err;

/**
 * "一直走，到终点就停": on arriving on a tile (and once on the start tile) a colour rule fires if the tile has that colour, else the
 * sample rule if the tile holds a sample not yet taken; then, with the wall rule, the rover turns up to three times while the way ahead is
 * blocked; then it drives one tile. Reaching the goal with everything collected ends the run.
 */
export function autopilot(lv: Level, cfg: Config, rules: Rules, cap = 60): AutoResult {
  let s = startState(lv);
  const steps: AutoStep[] = [];
  const seen = new Set<string>();
  let fresh = true;
  for (let t = 0; t < cap; t++) {
    const k = `${s.x},${s.y},${s.d},${s.m},${s.c},${fresh ? 1 : 0}`;
    if (seen.has(k)) return { res: 'loop', s, steps };
    seen.add(k);
    const c = cellAt(lv, s.x, s.y);
    if (fresh) {
      fresh = false;
      let a: 'L' | 'R' | 'P' | null = null;
      if (c.color && rules[c.color]) a = rules[c.color]!;
      else if (c.req >= 0 && c.ch !== 'r' && !((s.m >> c.req) & 1) && rules.A) a = rules.A;
      if (a) {
        const r = act(lv, cfg, s, a);
        steps.push({ card: a, s: r.s, err: r.err });
        if (r.err) return { res: 'crash', err: r.err, s: r.s, steps };
        s = r.s;
        if (atGoal(lv, s)) return { res: 'win', s, steps };
      }
    }
    if (rules.W) {
      let turns = 0;
      while (blockedAhead(lv, cfg, s) && turns < 3) { const r = act(lv, cfg, s, rules.W); s = r.s; steps.push({ card: rules.W, s }); turns++; }
      if (blockedAhead(lv, cfg, s)) return { res: 'stuck', s, steps };
    }
    const r = act(lv, cfg, s, 'F');
    steps.push({ card: 'F', s: r.s, err: r.err });
    if (r.err) return { res: 'crash', err: r.err, s: r.s, steps };
    s = r.s; fresh = true;
    if (atGoal(lv, s)) return { res: 'win', s, steps };
  }
  return { res: 'cap', s, steps };
}

/** stars for a rule level: 3 for getting both rovers home with no more rules than the fewest, else 2; the hint's third step caps at 2 */
export function ruleStars(rl: RuleLevel, rules: Rules, hinted: boolean): 1 | 2 | 3 {
  if (hinted) return 2;
  return Object.keys(rules).length <= rl.expectRules ? 3 : 2;
}
