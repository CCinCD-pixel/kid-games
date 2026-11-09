/**
 * 玉兔编程 model (the pure part): parse a level, run one card, run a whole program, count edits. A port of the spec's reference
 * model (specs/rover-code, core.mjs) restricted to the flat programs of chapters 1–4: no repeat card, no magic card.
 * Coordinates: x → east, y → south (row 0 is the top of the screen). A program succeeds only when it ENDS on the goal with
 * every required sample taken ("停在终点才算到"): passing over the goal on the way does not count.
 */
export type Card = 'N' | 'E' | 'S' | 'W' | 'F' | 'L' | 'R' | 'P';
export type Part = 'wheels' | 'panel' | 'mast';
export interface Config { wheels: 'S' | 'L'; panel: 'S' | 'L'; mast: 'S' | 'T' }
export const DEFAULT_CONFIG: Config = { wheels: 'S', panel: 'S', mast: 'S' };

export interface LevelData {
  id: string; brief: string; ch: number; n: number; role: string; title: string; teach: string;
  cards: Card[]; slots: number; expectMin: number; minCrystal?: number | null;
  map: string[]; height?: string[];
  garage?: { open: Part[] }; loadout?: Config;
  fog?: { brief: [Card, number][] };
  ghost?: 'full' | 'last' | 'off';
  intro?: boolean; review?: string[];
  fix?: string; buggy?: string; bugs?: number; bugKinds?: string[];
  solution: { main: string };
}

export interface Cell { ch: string; h: number; block: boolean; narrow: boolean; over: boolean; req: number; crystal: boolean; goal: boolean }
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
      const c: Cell = { ch, h: L.height ? Number(L.height[y][x]) : 0, block: ch === '#' || ch === 'o', narrow: ch === 'n', over: ch === 'u', req: -1, crystal: ch === '*', goal: ch === 'G' };
      if (ch in START) { if (start) throw new Error(`${L.id}: two starts`); start = { x, y, d: START[ch] }; }
      if (ch === 'G') { if (goal) throw new Error(`${L.id}: two goals`); goal = { x, y }; }
      if (ch === '*') hasCrystal = true;
      if (ch === 'a' || ch === 'd') { c.req = req.length; req.push({ x, y, kind: ch }); }
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
    if (c.req < 0 || (s.m >> c.req) & 1) return { s, err: 'nosample' };
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
  return { s: { x: nx, y: ny, d, m: s.m, c: c.crystal ? 1 : s.c } };
}

export interface Step { card: Card; index: number; s: State; err?: Err }
export interface RunResult { res: 'win' | 'crash' | 'end'; s: State; steps: Step[]; err?: Err; at?: number; crystal: boolean }

/** run a whole program; stops at the first card the rover cannot do */
export function run(lv: Level, cfg: Config, prog: readonly Card[]): RunResult {
  let s = startState(lv);
  const steps: Step[] = [];
  for (let i = 0; i < prog.length; i++) {
    const r = act(lv, cfg, s, prog[i]);
    steps.push({ card: prog[i], index: i, s: r.s, err: r.err });
    s = r.s;
    if (r.err) return { res: 'crash', err: r.err, at: i, s, steps, crystal: s.c === 1 };
  }
  return { res: atGoal(lv, s) ? 'win' : 'end', s, steps, crystal: s.c === 1 };
}

export const parseProg = (str: string): Card[] => [...str.replace(/\s/g, '')] as Card[];

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
export const editCount = (a: readonly Card[], b: readonly Card[]): number => osa(a, b);

/** metres still to go, for the "还差 N 米" line when the program ran out before the goal */
export const metresLeft = (lv: Level, s: State): number => Math.abs(lv.goal.x - s.x) + Math.abs(lv.goal.y - s.y);
