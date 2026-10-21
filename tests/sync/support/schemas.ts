// schemas.ts — merge rule trees of every store (mirrors the TS types + the working tree of branch iter/rebuild-2026-10, see docs/specs/sync-audit.md for the field-by-field audit),
// FULL fixtures (every leaf of the type present, real magnitudes: epoch-ms ~1.79e12, dotted ids, null), mirror DEFAULTS for stores whose code cannot be imported (chess not built, economy not built,
// hub-seen, metrics), GAME_CAPS (the caps the games trim to; the rule caps must equal them) and STORE_IDS (every createStore id must be here or in NOT_SYNCED).
// Settings policy: GLOBAL (lww) = displayName narration pinyin hiddenGames + family rules (xiangqi houseRules/coachOn, military-chess fanFlagRule); everything else is DEVICE or TEST = `local` (X).
// Ported from ~/kid-games-work/specs/sync-tools/schemas.mjs v1.1; the real-defaults() layer lives in real.ts.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { R as RB, type Rule } from '@kit/sync/rules';
import { int, pick as pk, T, type Rng } from './gen';

const { max, min, or, set, setN, sum, lww, local, longer, maxArr, rank, pick } = RB;
// loosely typed record builders for fixtures (the compile-time RuleOf<T> layer is exercised in tests/sync/types.check.ts; game save.ts files use obj<T>())
const obj = (fields: Record<string, Rule>, rest?: Rule): Rule => RB.obj<any>(fields as any, rest);
const map = (of: Rule): Rule => RB.map<any>(of);
const gv = (fields: Record<string, Rule>, guarded: string[], rest?: Rule): Rule => RB.gv<any>(fields as any, guarded as any, rest);
const ring = (o: { key: (x: any) => string; ord: (x: any) => number; cap: number; gen?: (r: Rng) => any }): Rule => RB.ring<any>(o);
const fifo = (cap: number): Rule => RB.fifo(cap);
const names = (list: string[], rule: Rule): Record<string, Rule> => Object.fromEntries(list.map((n) => [n, rule]));
const lwwAll = (list: string[]) => names(list, lww);
const maxAll = (list: string[]) => names(list, max);
const sumAll = (list: string[]) => names(list, sum);
const orAll = (list: string[]) => names(list, or);
const localAll = (list: string[]) => names(list, local);
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export { T };                             // an epoch-ms value of 2026-10 (1.79e12 > the old 1e12 limit)
export const STARS = rank([0, 1, 2, 3] as const);
export const SCHEMAS: Record<string, Rule> = {}; export const SAMPLES: Record<string, any> = {}; export const DEFAULTS: Record<string, any> = {}; export const GAME_CAPS: Record<string, number> = {};

// ---- catalog order of lesson step ids (REAL files when the repo is there; else a tiny stand-in). Plain string max AND natural order both fail on it (xiangqi: step 'B1' follows 'L07.4').
function stepOrder(game: string, fallback: string[]): string[] {
  try { const L = JSON.parse(fs.readFileSync(`${REPO}content/${game}/lessons.v1.json`, 'utf8')).lessons; return L.flatMap((l: any) => l.steps.map((s: any) => s.id)); } catch { return fallback; }
}
function lessonSteps(game: string): string[][] { try { return JSON.parse(fs.readFileSync(`${REPO}content/${game}/lessons.v1.json`, 'utf8')).lessons.map((l: any) => l.steps.map((x: any) => x.id)); } catch { return []; } }
export const LESSON_STEPS: Record<string, string[][]> = { xiangqi: lessonSteps('xiangqi'), chess: lessonSteps('chess') };
export const STEP_ORDER: Record<string, string[]> = { xiangqi: stepOrder('xiangqi', ['L07.1', 'L07.2', 'L07.3', 'L07.4', 'B1', 'L08.1']), chess: stepOrder('chess', ['G1.1', 'G1.9', 'G1.10', 'C1.8.2', 'C1.9']) };
const XQ_STEP = rank(STEP_ORDER.xiangqi), CH_STEP = rank(STEP_ORDER.chess);

// ---- xiangqi (kg:v1:xiangqi v2) — also the template for chess
const robotRec = obj({ unlocked: or, w: sum, d: sum, l: sum, xjWon: set, badges: set, loseStreak: lww, helpTier: lww, easy: lww, wall: max });   // helpTier: lww (audit A-G3/H2): the help ladder resets after a win, so max would be a ratchet
const xqLike = (stepRule: Rule): Record<string, Rule> => ({
  version: max, notice: rank(['none', 'legacy', 'seen']), intro: obj(orAll(['box', 'river', 'palace'])), placement: obj({ done: or, known: map(or), rec: lww }),   // rec = recommended-chapter list, replaced wholesale by academy.ts:199 (audit A-G1)
  lessons: map(obj({ stars: STARS, stepId: stepRule, puzzleIx: max, done: or, known: or })),
  battles: map(obj({ won: or, stars: max })), robots: map(robotRec), xj: map(obj({ wins: max, best: STARS })),
  puzzles: obj({ done: fifo(800), firstTry: fifo(800), daily: lww, recent30: lww, tier: lww }),   // tier is DEMOTED by the game (starmap.ts) -> lww, never max
  game: local,
  history: ring({ key: (h: any) => `${h.t}|${h.robot}`, ord: (h: any) => h.t, cap: 30, gen: (r: Rng) => { const t = T + int(r, 0, 20); return { t, robot: 'R' + (t % 2), result: pk(r, ['w', 'w', 'l']) }; } }),
  settings: obj({ ...localAll(['coords', 'handedness', 'dangerHatch', 'sfx', 'subs', 'material']), r1Skip: or, houseRules: lww, coachOn: map(lww) }),   // r1Skip: audit A-G2 (set once, never lowered)
  stats: obj({ sessions: sum, f2fGames: sum, legacySolved: max }), newContent: set,
});
SCHEMAS.xiangqi = obj(xqLike(XQ_STEP));
SAMPLES.xiangqi = { version: 2, notice: 'none', intro: { box: true, river: false, palace: false }, placement: { done: true, known: { 1: true }, rec: ['C2'] }, lessons: { L07: { stars: 3, stepId: 'B1', puzzleIx: 1, done: true, known: false } },
  battles: { B1: { won: true, stars: 2 } }, robots: { R1: { unlocked: true, w: 2, d: 0, l: 1, xjWon: ['x1'], badges: ['r'], loseStreak: 0, helpTier: 1, easy: false, wall: 1 } }, xj: { x1: { wins: 1, best: 2 } },
  puzzles: { done: ['pool.17'], firstTry: ['pool.17'], daily: { date: '2026-10-19', ids: ['pool.17'], got: 1 }, recent30: [true], tier: 2 }, game: { startFen: 'x', moves: [] },
  history: [{ t: T, robot: 'R1', result: 'w', mode: 'full', plies: 40, undo: 0, coachShown: 1, coachAccepted: 1 }], settings: { coords: false, coachOn: { R1: true }, handedness: 'right', houseRules: { limit: 120 }, dangerHatch: false, sfx: true, subs: true, material: true, r1Skip: true },
  stats: { sessions: 3, f2fGames: 1, legacySolved: 0 }, newContent: ['n1'] };
DEFAULTS.xiangqi = { version: 2, notice: 'none', intro: { box: false, river: false, palace: false }, placement: { done: false, known: {} }, lessons: {}, battles: { B1: { won: false, stars: 0 }, B2: { won: false, stars: 0 }, B3: { won: false, stars: 0 } },
  robots: Object.fromEntries(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map((id, i) => [id, { unlocked: i === 0, w: 0, d: 0, l: 0, xjWon: [], badges: [], loseStreak: 0, helpTier: 0, easy: false, wall: 0 }])), xj: {},
  puzzles: { done: [], firstTry: [], daily: { date: '', ids: [], got: 0 }, recent30: [], tier: 1 }, history: [], settings: { coords: false, coachOn: {}, handedness: 'right', houseRules: { stalemate: 'loss', perpetual: 'loss', limit: 120, undo: 'free' }, dangerHatch: false, sfx: true, subs: true, material: true }, stats: { sessions: 0, f2fGames: 0, legacySolved: 0 }, newContent: [] };
GAME_CAPS['xiangqi.puzzles.done'] = 800; GAME_CAPS['xiangqi.puzzles.firstTry'] = 800; GAME_CAPS['xiangqi.history'] = 30;

// ---- chess / 棋手学院 (kg:v1:chess v1, docs/specs/chess.md 8.5): xiangqi-shaped; review[] / coachCap[] / theme / seatHints are device or single-writer (audit at build)
const chessRobot = obj({ unlocked: or, w: sum, d: sum, l: sum, xjWon: set, badges: set, loseStreak: lww, nonWinStreak: lww, helpTier: lww, easy: lww, wall: max });   // nonWinStreak: audit A-H1 (chess.md:154)
SCHEMAS.chess = obj({ ...xqLike(CH_STEP), robots: map(chessRobot), puzzles: obj({ done: fifo(800), firstTry: fifo(800), daily: lww, recent30: lww, tier: lww, review: lww }), settings: obj({ ...localAll(['coords', 'coachCap', 'theme', 'seatHints', 'dangerHatch']), houseRules: lww }), cards: set, stars: max, stats: obj({ sessions: sum, games: sum }) });
SAMPLES.chess = { ...SAMPLES.xiangqi, robots: { R1: { ...SAMPLES.xiangqi.robots.R1, nonWinStreak: 1 } }, lessons: { C1: { stars: 2, stepId: 'C1.8.2', puzzleIx: 0, done: false, known: false } }, puzzles: { done: ['p.77'], firstTry: [], daily: { date: '2026-10-19', ids: [], got: 0 }, recent30: [false], tier: 1, review: ['p.77'] },
  settings: { coords: true, coachCap: [3, 2], theme: 'wood', seatHints: true, dangerHatch: false, houseRules: { repetition: 'draw', fifty: 'draw', undo: 'free' } }, cards: ['c1'], stars: 5, stats: { sessions: 2, games: 4 } };
DEFAULTS.chess = { ...DEFAULTS.xiangqi, puzzles: { done: [], firstTry: [], daily: { date: '', ids: [], got: 0 }, recent30: [], tier: 1, review: [] }, settings: { coords: true, coachCap: [], theme: 'wood', seatHints: true, dangerHatch: false, houseRules: { repetition: 'draw', fifty: 'draw', undo: 'free' } }, cards: [], stars: 0, stats: { sessions: 0, games: 0 } };
GAME_CAPS['chess.puzzles.done'] = 800; GAME_CAPS['chess.puzzles.firstTry'] = 800; GAME_CAPS['chess.history'] = 30;

// ---- mars-base (kg:v1:mars-base v5)
// audit B-R3: same state+attempts can still differ in progress (recheck flag, remedial plays, provisional items left) -> rank on all of them so the tie is not an arbitrary pick
const certRank = (c: any): number[] => [['none', 'half', 'lit'].indexOf(c.state), c.attempts ?? 0, (c.remedialPlays ?? 0) + (c.recheck ? 1 : 0), c.prov ? -(c.prov.left ?? 0) : 0];
SCHEMAS['mars-base'] = obj({
  onboarded: or, tutorials: map(or), salt: local, session: obj(maxAll(['index', 'lastActiveAt', 'missions'])),
  nodes: map(gv({ st: rank(['open', 'skipped', 'done']), stars: max, plays: max, ft: longer, bridge: or, why: rank(['calib', 'cert', 'direct', 'probe', 'voided']) }, ['st', 'why'])),   // the game bumps nodes[id].g when it RE-OPENS a node (cert.ts recordProvisional, adaptive.ts failDirectProbe)
  tags: map(lww), cert: map(pick(certRank)), probes: map(obj({ done: or, score: max })),
  orbit: obj({ tests: ring({ key: (t: any) => `${t.node}|${t.L}|${t.at}`, ord: (t: any) => t.at, cap: 40, gen: (r: Rng) => ({ node: 'n' + int(r, 0, 2), L: int(r, 0, 1), at: T + int(r, 0, 20), pass: pk(r, [true, false]) }) }) }), mission: local,
  challenge: obj({ plays: sum, best: max }),   // 挑战订单 (mission.ts:117): plays++ / best = max; found by the interface drift test (not in the v1.1 table)
  zoneHist: map(lww), lastPlayed: map(max), visited: setN(400), buildings: map(max), baseLevel: max, cards: set, checker: max, race: obj({ games: max, inProgress: local }),
  errors: map(obj({ n: max, recent: ring({ key: (r: any) => `${r.fam}|${r.at}`, ord: (r: any) => r.at, cap: 3, gen: (r: Rng) => ({ fam: 'f' + int(r, 0, 2), at: T + int(r, 0, 20) }) }) })),   // cap 3 = mission.ts:71 (audit B-R4); the v1.1 table said 12
  recent: ring({ key: (s: any) => s, ord: (s: any) => Number(String(s).split('|')[8]) || 0, cap: 300, gen: (r: Rng) => `k${int(r, 0, 6)}|f|1|1|0|0|0|m|${int(r, 0, 20)}|n|` }),
  settings: local, directOffer: local, direct: lww,
});
SAMPLES['mars-base'] = { onboarded: true, tutorials: { t1: true }, salt: 7, session: { index: 5, lastActiveAt: T, missions: 9 }, nodes: { 'orbit.O1.0': { st: 'done', stars: 3, plays: 2, ft: [1, 0], bridge: true, why: 'calib', g: 1 } },
  tags: { add: { level: 2, streak: 1 } }, cert: { C1: { state: 'lit', attempts: 1 } }, probes: { factory: { done: true, score: 3 } }, orbit: { tests: [{ node: 'n', L: 1, at: T }] }, mission: { node: 'n' },
  challenge: { plays: 2, best: 4 }, zoneHist: { z1: [0.5] }, lastPlayed: { z1: 4 }, visited: ['z1'], buildings: { b1: 2 }, baseLevel: 2, cards: ['c1'], checker: 3, race: { games: 1, inProgress: null }, errors: { slip: { n: 2, recent: [{ fam: 'f', at: T }] } },
  recent: ['aa|f|1|1|0|0|0|m|3|n|'], settings: { music: true, liveReadout: true }, directOffer: null, direct: { pending: [] } };
DEFAULTS['mars-base'] = { onboarded: false, tutorials: {}, salt: 0, session: { index: 0, lastActiveAt: 0, missions: 0 }, nodes: {}, tags: {}, cert: { C1: { state: 'none', attempts: 0 }, C2: { state: 'none', attempts: 0 }, C3: { state: 'none', attempts: 0 } },
  probes: { factory: { done: false }, balance: { done: false }, vault: { done: false } }, orbit: { tests: [] }, mission: null, zoneHist: {}, lastPlayed: {}, visited: [], buildings: {}, baseLevel: 1, cards: [], checker: 0, race: { games: 0, inProgress: null }, errors: {}, recent: [],
  settings: { music: true, liveReadout: true }, directOffer: null, direct: { pending: [] } };
GAME_CAPS['mars-base.orbit.tests'] = 40; GAME_CAPS['mars-base.recent'] = 300; GAME_CAPS['mars-base.errors.*.recent'] = 3;

// ---- gear-fort (kg:v1:gear-fort v1)
SCHEMAS['gear-fort'] = obj({
  levels: map(obj({ best: STARS, attempts: max, firstTry: rank(['lose', 'win']), wins: max, lastAt: max })), current: lww, resume: local, lossStreak: map(lww),
  counters: map(map(max)), learned: set, jinnang: map(obj({ seen: or, mastered: max })), almanac: map(rank(['unseen', 'shown', 'seen'])), coach: obj({ followed: map(max) }), fastTrack: lww,
  puzzles: map(obj({ stars: STARS, bestSpent: min, tries: max })), infer: obj({ firstSeenAt: min, solvedUnaided: or }), story: set, decks: map(lww),   // audit C: the game REPLACES the deck array (menus.ts:315); union would reorder/accumulate
  settings: local, kernelVersion: local,
});
SAMPLES['gear-fort'] = { levels: { '1-1': { best: 3, attempts: 2, firstTry: 'win', wins: 1, lastAt: '2026-10-19T08:30:00.000Z' } }, current: '1-2', resume: null, lossStreak: { '1-1': 0 }, counters: { fear: { c: 2 } }, learned: ['a'],
  jinnang: { j: { seen: true, mastered: '1-3' } }, almanac: { a: 'seen' }, coach: { followed: { k: 1 } }, fastTrack: false, puzzles: { p: { stars: 2, bestSpent: 5, tries: 1 } }, infer: { firstSeenAt: '1-2', solvedUnaided: true },
  story: ['s'], decks: { d: ['c'] }, settings: { music: true, musicInLevel: false, shake: true, numbers: false, speed: 1 }, kernelVersion: 'k1' };
DEFAULTS['gear-fort'] = { levels: {}, current: '1-1', resume: null, lossStreak: {}, counters: {}, learned: [], jinnang: {}, almanac: {}, coach: { followed: {} }, fastTrack: false, puzzles: {}, infer: { solvedUnaided: false }, story: [], decks: {}, settings: { music: true, musicInLevel: false, shake: true, numbers: false, speed: 1 }, kernelVersion: '' };

// ---- snake-battle (kg:v1:snake-battle v1)
const SUM = ['kills', 'cut', 'enc', 'headon', 'meteors', 'speedPu', 'shieldSaves', 'near', 'boostSec', 'eaten', 'playSec', 'peakGrown', 'timedPlayed', 'podiums', 'wins'];
const SNAKE_MAX = ['multiMax', 'streakMax'];   // audit C: save.ts:70 MAX_KEYS take Math.max, so these two are M not S (S would add the devices' maxima and unlock collection cards early)
SCHEMAS['snake-battle'] = obj({
  firstRunDone: or, settings: local, equipped: obj(lwwAll(['skin', 'trail'])), owned: set, cardQueue: lww, seenTips: set,
  voiceSeen: map(max), tipDay: lww, venueIntroDay: map(lww),
  missions: map(obj({ stars: max, attempts: max, failStreak: lww, clears: max, bestT: min, hintMax: max, skipped: or, why: map(max) })),
  venues: map(obj({ played: max, podiums: max, wins: max, bestRank: min, bestPeak: max, bestKills: max, recentRanks: lww, heat: lww, endless: obj(maxAll(['runs', 'bestPeak', 'bestLife'])) })),
  life: obj({ ...sumAll(SUM), ...maxAll(SNAKE_MAX) }), inProgress: local, twinLevel: map(lww),   // twinLevel: the game DELETES the key on a pass (save.ts:157) -> write null under lww (audit C)
  lastPraise: lww, attemptSeq: max, session: obj({ day: lww, matchesInRow: lww, lastEndAt: max }),
});
SAMPLES['snake-battle'] = { firstRunDone: true, settings: { control: 'follow', boostSide: 'auto', doubleTapBoost: false, showNames: true, matchMusic: true, crown: true }, equipped: { skin: 'venus', trail: 'stardust' }, owned: ['skin:venus'],
  cardQueue: [], seenTips: ['t'], voiceSeen: { v: 2 }, tipDay: { day: 'd', byCause: {} }, venueIntroDay: { moon: 'd' }, missions: { m1: { stars: 3, attempts: 1, failStreak: 0, clears: 1, bestT: 9, hintMax: 0, skipped: false, why: { a: 1 } } },
  venues: { moon: { played: 1, podiums: 1, wins: 0, bestRank: 2, bestPeak: 5, bestKills: 1, recentRanks: [2], heat: 1, endless: { runs: 1, bestPeak: 3, bestLife: 40 } } },
  life: Object.fromEntries([...SUM, ...SNAKE_MAX].map((k) => [k, 3])), inProgress: { matchId: 'm' }, twinLevel: { t: 1 }, lastPraise: 'p', attemptSeq: 4, session: { day: 'd', matchesInRow: 1, lastEndAt: T } };
DEFAULTS['snake-battle'] = { ...SAMPLES['snake-battle'], missions: {}, venues: {}, voiceSeen: {}, venueIntroDay: {}, twinLevel: {}, owned: [], seenTips: [], life: Object.fromEntries([...SUM, ...SNAKE_MAX].map((k) => [k, 0])), inProgress: null, firstRunDone: false };

// ---- sokoban (kg:v1:sokoban v1)
const SOK_STATS = ['pushes', 'undos', 'redos', 'restarts', 'deadEvents', 'deadDelayed', 'selfRescues', 'activeMs'];
SCHEMAS.sokoban = obj({
  tutorialDone: or, levels: map(obj({ best: min, stars: STARS, clean: or, firstClean: or, plays: max, hintMax: max, legacy: or, cert: or, twinStars: STARS })), quiz: map(obj({ stars: max, firstTry: max })),
  cert: obj({ offered: or, passed: or, at: min }), chaptersSeen: set, taught: set, named: set, onceLines: set, arrows: rank(['locked', 'celebrate', 'on']),
  launched: obj({ total: max, byDest: map(max), random: max }), random: obj({ nextSeed: max, recent: lww, byTier: maxArr, poolIdx: local }), cosmetics: obj({ owned: set, equipped: map(lww) }), cards: set,
  settings: local, finale: obj({ v1At: min, v2At: min }), inProgress: local, stats: obj(sumAll(SOK_STATS)),
  wrapShownAt: lww, classicUnlocked: max, veteran: or,   // wrapShownAt: written unconditionally (overlays.ts:189), never read -> lww (audit D)
});
SAMPLES.sokoban = { tutorialDone: true, levels: { C1: { best: 12, stars: 2, clean: true, firstClean: false, plays: 3, hintMax: 1, legacy: true, cert: true, twinStars: 1 } }, quiz: { q: { stars: 2, firstTry: 1 } }, cert: { offered: true, passed: true, at: T },
  chaptersSeen: [1], taught: ['corner'], named: ['pair'], onceLines: ['a'], arrows: 'on', launched: { total: 2, byDest: { moon: 1 }, random: 1 }, random: { nextSeed: 3, recent: [1], byTier: [1, 0, 0, 0], poolIdx: [1, 0, 0, 0] },
  cosmetics: { owned: ['h1'], equipped: { hat: 'h1' } }, cards: ['c'], settings: { swipe: 'auto', autoRoute: true }, finale: { v1At: T }, inProgress: { id: 'x' },
  stats: Object.fromEntries(SOK_STATS.map((k) => [k, k === 'activeMs' ? 2.6e9 : 5])), wrapShownAt: T, classicUnlocked: 3, veteran: true };
DEFAULTS.sokoban = { tutorialDone: false, levels: {}, quiz: {}, cert: { offered: false, passed: false }, chaptersSeen: [], taught: [], named: [], onceLines: [], arrows: 'locked', launched: { total: 0, byDest: { tiangong: 0, moon: 0, mars: 0 }, random: 0 },
  random: { nextSeed: 1, recent: [], byTier: [0, 0, 0, 0], poolIdx: [0, 0, 0, 0] }, cosmetics: { owned: [], equipped: {} }, cards: [], settings: { swipe: 'auto', autoRoute: true }, finale: {}, stats: Object.fromEntries(SOK_STATS.map((k) => [k, 0])) };

// ---- military-chess (kg:v1:military-chess v1)
const trk = obj({ wins: maxArr, cleanWins: maxArr, handicapWins: maxArr, undoWins: maxArr, losses: maxArr, draws: maxArr, streakLoss: lww, unlocked: max, handicapOffer: lww, recent: lww });
SCHEMAS['military-chess'] = obj({
  firstRun: obj({ ft: or, seenHqTip: or, seenRefereeIntro: or, fanCoach: set, seenCmpButtons: or, demos: set }), rank: max,
  items: map(obj({ stars: STARS, best: max, tries: max, hintMax: max, at: max, last: lww, lastHint: lww })), ladder: map(trk), deployments: lww, lastTemplate: lww, lastLayout: lww, cards: set,
  family: obj({ games: sum, kidWins: sum, dadWins: sum, draws: sum, physicalGames: sum, physicalVerdicts: sum, lastMode: lww, seating: lww, dadName: lww, firstMover: lww, lastAttacker: lww, log: ring({ key: (x: any) => String(x), ord: (x: any) => x, cap: 100, gen: (r: Rng) => T + int(r, 0, 30) }) }),
  tagStats: obj(sumAll(['games', 'correct', 'total'])), settings: obj({ ...localAll(['numberBadges', 'coachNotes', 'coachAlerts', 'music', 'unlockAll', 'refereeSpeed', 'aiOverride', 'familyQuiet', 'shuttleMax']), fanFlagRule: lww }),
  resume: local, puzzleResume: local, stats: obj(sumAll(['matches', 'minutes'])),
});
SAMPLES['military-chess'] = { firstRun: { ft: true, seenHqTip: true, seenRefereeIntro: false, fanCoach: ['a'], seenCmpButtons: true, demos: ['d'] }, rank: 2, items: { i1: { stars: 2, best: 3, tries: 2, hintMax: 1, at: T, last: 2, lastHint: 1 } },
  ladder: { fan: { wins: [1, 0, 0, 0], cleanWins: [0, 0, 0, 0], handicapWins: [0, 0, 0, 0], undoWins: [0, 0, 0, 0], losses: [0, 0, 0, 0], draws: [0, 0, 0, 0], streakLoss: [0, 0, 0, 0], unlocked: 1, handicapOffer: 0, recent: [[], [], [], []] } },
  deployments: [null, null, null], lastTemplate: 'balanced', lastLayout: null, cards: ['c'], family: { games: 1, kidWins: 0, dadWins: 1, draws: 0, physicalGames: 0, physicalVerdicts: 0, lastMode: 'fan', seating: 'side', dadName: '爸爸', firstMover: 'kid', lastAttacker: 'red', log: [T] },
  tagStats: { games: 1, correct: 2, total: 3 }, settings: { numberBadges: true, coachNotes: true, coachAlerts: 'auto', music: true, fanFlagRule: 'standard', unlockAll: false, refereeSpeed: 'normal', aiOverride: null, familyQuiet: 40, shuttleMax: 3 },
  resume: null, puzzleResume: null, stats: { matches: 2, minutes: 9 } };
DEFAULTS['military-chess'] = { ...SAMPLES['military-chess'], items: {}, ladder: {}, cards: [], family: { ...SAMPLES['military-chess'].family, games: 0, log: [] } };
GAME_CAPS['military-chess.family.log'] = 100;   // match.ts:1241 slice(-100); the v1.1 table said 60 (audit D)

// ---- emoji-match (kg:v1:emoji-match v1)
SCHEMAS['emoji-match'] = obj({
  levels: map(obj({ stars: STARS, bestLeft: max, attempts: max, wins: max, failStreak: lww, firstWinAt: min })), puzzles: map(obj({ solved: or, attempts: max, maxHint: max })), boosters: lww, grants: set, intros: set, arrivals: set,
  cosmetics: map(lww), free: obj({ plays: max, bestCascade: max, energy: max, bg: lww, seed: max }), stats: obj({ combos: map(sum), specials: map(sum), maxCascade: max, minutes: max, tools: map(sum) }),   // energy only grows (play.ts:841) and stats are ++ counters (audit C)
  settings: local, talk: max, sky: set, attemptSeq: max, resume: local, lastLevel: lww, firstRunDone: or, veteranToast: or,
});
SAMPLES['emoji-match'] = { levels: { l1: { stars: 3, bestLeft: 4, attempts: 2, wins: 1, failStreak: 0, firstWinAt: T } }, puzzles: { p1: { solved: true, attempts: 1, maxHint: 0 } }, boosters: { drill: 1, tractor: 0, ion: 2 }, grants: ['veteran'], intros: ['i'], arrivals: [2],
  cosmetics: { bg: 'a' }, free: { plays: 2, bestCascade: 3, energy: 1, bg: 1, seed: 5 }, stats: { combos: { c: 1 }, specials: { s: 1 }, maxCascade: 4, minutes: 9, tools: { drill: 1 } }, settings: { lessFx: false, music: true, sound: true },
  talk: 2, sky: ['k'], attemptSeq: 7, resume: null, lastLevel: 'l1', firstRunDone: true, veteranToast: true };
DEFAULTS['emoji-match'] = { ...SAMPLES['emoji-match'], levels: {}, puzzles: {}, grants: [], intros: [], arrivals: [], cosmetics: {}, sky: [], stats: { combos: {}, specials: {}, maxCascade: 0, minutes: 0, tools: {} }, firstRunDone: false, veteranToast: false };

// ---- memory-matrix REBUILT (kg:v1:memory-matrix v1): the adaptive controller moves levels UP and DOWN -> one sector = ONE lww register (never per-field max)
// audit B: nightClock (M1) max, seenRules (M2) union, practiceN/salt/voice (M3-M5) device-local; sectors stay ONE lww register per sector as the spec says, but see M6 (a stale device can overwrite more progress): S10 decides pick-by-progress.
SCHEMAS['memory-matrix'] = obj({ v: max, introSeen: or, tutorial: obj(orAll(['s1', 's2', 's3', 's4'])), nights: max, nightsAny: max, nightClock: max, seenRules: set, practiceN: local, salt: local, voice: local, cards: set, flags: obj({ rotation: lww }), sectors: map(lww), recent: map(lww), settings: local, lastSeen: local, veteran: lww });
SAMPLES['memory-matrix'] = { v: 1, introSeen: true, tutorial: { s1: true, s2: false, s3: false, s4: false }, nights: 4, nightsAny: 5, cards: ['vet'], flags: { rotation: false },
  sectors: { s1: { sector: 's1', open: true, rounds: 12, nights: 2, tracks: [{ L: 5, cleared: 1 }] } }, recent: { s1: { exact: [123456789], shape: [7] } }, settings: { colorAssist: false }, lastSeen: T, nightClock: 9, seenRules: ['r.rotation'], practiceN: 2, salt: 'abc', voice: { once: ['v1'], week: { v1: 3 }, nightAt: { v1: 4 } }, veteran: { stars: 3, cleared: 5, awardedAt: T, source: 'live' } };
DEFAULTS['memory-matrix'] = { ...SAMPLES['memory-matrix'], nightClock: 0, seenRules: [], practiceN: 0, voice: { once: [], week: {}, nightAt: {} }, introSeen: false, tutorial: { s1: false, s2: false, s3: false, s4: false }, nights: 0, nightsAny: 0, cards: [], sectors: {}, recent: {}, lastSeen: 0 };

// ---- economy (kg:v1:economy v1, star-pets 3): the LEDGER travels on its own channel (field `ledger` is local to the slot rule); pet = Record<key, value|null> (null = deleted; stamps come from the sync layer)
SCHEMAS.economy = obj({ v: max, ledger: local, pet: map(lww), seen: set });   // `dev` is gone: device id + Lamport live in kit/clock (sync.md 8.4, star-pets 3.9)
SAMPLES.economy = { v: 1, ledger: [], pet: { 'name:rover': '阿福', 'slot:room1:3': 'item:lamp', tint: null }, seen: ['tut.shop', 'first.egg'] };
DEFAULTS.economy = { v: 1, ledger: [], pet: {}, seen: [] };

// ---- kit-level small stores
SCHEMAS.settings = obj({ displayName: lww, narration: lww, pinyin: lww, hiddenGames: lww, skipIntros: local, unlockAll: local });   // skipIntros / unlockAll are TEST switches: never synced
SAMPLES.settings = { displayName: '小步步', narration: true, pinyin: false, hiddenGames: ['x'], skipIntros: false, unlockAll: false };
DEFAULTS.settings = { displayName: '小步步', narration: true, pinyin: false, hiddenGames: [], skipIntros: false, unlockAll: false };
SCHEMAS['hub-seen'] = set;                                                    // kg:hub:seen only. kg:hub:v1 is DERIVED (recomputed at every game boot) -> never synced
SAMPLES['hub-seen'] = ['xiangqi:n1']; DEFAULTS['hub-seen'] = [];
SCHEMAS.metrics = map(lww);                                                   // keys '<game>@<devlabel>': each device writes only its own keys; the parent page shows 'iPad, 2 h ago'
SAMPLES.metrics = { 'xiangqi@ipad': { v: 1, updatedAt: T, metrics: [{ id: 'a', label: 'b', value: 'c' }] } }; DEFAULTS.metrics = {};

// ---- every createStore id / sync slot, and what is deliberately not synced (CI: each createStore id must be in one of the two lists)
export const STORE_IDS: string[] = ['xiangqi', 'chess', 'mars-base', 'gear-fort', 'snake-battle', 'sokoban', 'military-chess', 'emoji-match', 'memory-matrix', 'economy', 'settings', 'hub-seen', 'metrics'];
export const NOT_SYNCED: string[] = ['kg:v1:dev-kit', 'kg:log:v1', 'kg:launch', 'kg:parent:*', 'kg:hub:v1', 'kg:hub:tab', 'kg:hub:visited', 'kg:sync:*', 'kg:clock:v1', 'kg:v1:legacy-*', 'kg:v1:mars-base:pre-v5-*', 'kg:v1:mars-base:corrupt-*'];

// ---- demo composite for the simulators: mirrors the shapes the games really have (counters, demotable tier, re-openable node, FIFO window, step pointer, lww maps with null deletes)
SCHEMAS.demo = obj({
  stars: map(STARS), plays: sum,
  cards: set, tutorials: map(or), settings: obj({ music: lww, speed: lww }), tags: map(lww), hist: ring({ key: (h: any) => h.id, ord: (h: any) => h.n, cap: 12, gen: (r: Rng) => { const n = int(r, 0, 20); return { id: 'h' + n, n }; } }),
  owned: set, best: map(min), pet: obj({ name: lww, species: lww }), home: map(lww), mission: local,
  tier: lww, nodes: map(gv({ st: rank(['open', 'skipped', 'done']), stars: max }, ['st'])), done: fifo(5), step: rank(['L1.1', 'L1.2', 'B1', 'L2.1', 'L2.2', 'L2.10']),
});

// ---- tiny trees: trimming at tiny caps must stay associative (props.mjs)
export const EXTRA_TREES: Record<string, Rule> = {
  ring3: obj({ r: ring({ key: (x: any) => x.id, ord: (x: any) => x.n, cap: 3, gen: (rr: Rng) => { const n = int(rr, 0, 9); return { id: 'h' + n, n, v: int(rr, 0, 2) }; } }) }),
  fifo3: obj({ f: fifo(3), s: setN(3) }),
  gv2: obj({ n: map(gv({ st: rank(['open', 'skipped', 'done']), stars: max }, ['st'])) }),
};
/** The 17 trees every property run covers: 13 store slots + demo composite + 3 tiny-cap trees. */
export const PROP_TREES: Record<string, Rule> = { ...SCHEMAS, ...EXTRA_TREES };

// ---- the REAL defaults() replace the hand-mirrored ones wherever the game code can be imported (real.ts). Everything else (chess, economy, hub-seen, metrics) stays mirrored.
import { REAL_DEFAULTS } from './real';
export const MIRRORED: string[] = Object.keys(SAMPLES).filter((k) => !(k in REAL_DEFAULTS));
for (const [k, f] of Object.entries(REAL_DEFAULTS)) DEFAULTS[k] = f();
