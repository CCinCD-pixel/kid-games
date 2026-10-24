// site/xiangqi/src/progress/save.ts — 楚河棋院存档 v2（规格 §8.4）。kit createStore('xiangqi', { version: 2, … }) → kg:v1:xiangqi。
// 旧版（33c149c，version 1）在局存档丢弃：migrate 里先把旧信封原文留到 kg:v1:legacy-xiangqi（kit 的 LEGACY_KEYS 里没有 xiangqi，不会替我们留快照）。
import { createBoardStore } from '@engines/board/save/adapter';
import type { Store } from '@kit/progress';

export type HouseRules = { stalemate: 'loss' | 'draw'; perpetual: 'loss' | 'warn' | 'off'; limit: 120 | 0; undo: 'free' | 3 };
export const DEFAULT_HOUSE: HouseRules = { stalemate: 'loss', perpetual: 'loss', limit: 120, undo: 'free' };
export type GameMode = 'robot' | 'f2f' | 'xj';
export interface LessonRec { stars: 0 | 1 | 2 | 3; stepId: string; puzzleIx?: number; done: boolean; known?: boolean }
export interface RobotRec { unlocked: boolean; w: number; d: number; l: number; xjWon: string[]; badges: ('r' | 'b' | 'clean')[]; loseStreak: number; helpTier: 0 | 1 | 2 | 3 | 4; easy: boolean; wall: number }
export interface HistoryRec { t: number; robot: string; mode: 'full' | 'xj'; result: 'w' | 'd' | 'l'; plies: number; undo: number; coachShown: number; coachAccepted: number }
export interface SavedGameRec { mode: GameMode; robot?: string; xjId?: string; startFen: string; moves: string[]; side: 0 | 1; handicap: string; seed: number; coach: boolean; easy: boolean; rules: HouseRules; undo: number; used?: [number, number]; hints: number; coachShown: number; coachAccepted: number; startedAt: number; /** 从某一课（L33 第一盘棋）开出来的整盘：下完这盘，那一课算学完 */ lesson?: string }
export interface XqSave {
  version: 2; notice: 'none' | 'legacy' | 'seen';
  intro: { box: boolean; river: boolean; palace: boolean };
  /** 摸底：known[章] = 该章所有课都已测会；rec = 推荐接着学的课（没考过的课，应将三法 / 将死 / 困毙判负优先），学堂地图上标「推荐」 */
  placement: { done: boolean; known: Record<string, boolean>; rec?: string[] };
  lessons: Record<string, LessonRec>;
  battles: Record<'B1' | 'B2' | 'B3', { won: boolean; stars: number }>;
  robots: Record<string, RobotRec>;
  xj: Record<string, { wins: number; best: 0 | 1 | 2 | 3 }>;
  puzzles: { done: string[]; firstTry: string[]; daily: { date: string; ids: string[]; got: number }; recent30: boolean[]; tier: 1 | 2 | 3 };
  game?: SavedGameRec;
  history: HistoryRec[];
  settings: { coords: boolean; coachOn: Record<string, boolean>; handedness: 'right' | 'left'; houseRules: HouseRules; dangerHatch: boolean; sfx?: boolean; subs?: boolean; material?: boolean; /** 孩子在软门卡片上点过「不用，直接下」：之后不再提示先学三招 */ r1Skip?: boolean };
  stats: { sessions: number; f2fGames: number; legacySolved: number }; newContent: string[];
}
export const ROBOT_IDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;
export const newRobot = (unlocked: boolean): RobotRec => ({ unlocked, w: 0, d: 0, l: 0, xjWon: [], badges: [], loseStreak: 0, helpTier: 0, easy: false, wall: 0 });
export const defaults = (): XqSave => ({
  version: 2, notice: 'none', intro: { box: false, river: false, palace: false }, placement: { done: false, known: {} }, lessons: {},
  battles: { B1: { won: false, stars: 0 }, B2: { won: false, stars: 0 }, B3: { won: false, stars: 0 } },
  robots: Object.fromEntries(ROBOT_IDS.map((id, i) => [id, newRobot(i === 0)])), xj: {},
  puzzles: { done: [], firstTry: [], daily: { date: '', ids: [], got: 0 }, recent30: [], tier: 1 }, history: [],
  settings: { coords: false, coachOn: {}, handedness: 'right', houseRules: { ...DEFAULT_HOUSE }, dangerHatch: false, sfx: true, subs: true, material: true }, stats: { sessions: 0, f2fGames: 0, legacySolved: 0 }, newContent: [],
});

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** 形状校验：缺字段 / 类型不对 → 回到 defaults()（半截数据、手改、旧 bug 都不会让页面抛错） */
export function isValidXqSave(x: unknown): x is XqSave {
  if (!isObj(x) || x.version !== 2) return false;
  if (!isObj(x.intro) || !isObj(x.placement) || !isObj(x.lessons) || !isObj(x.battles) || !isObj(x.robots) || !isObj(x.xj) || !isObj(x.puzzles) || !isObj(x.settings) || !isObj(x.stats)) return false;
  if (!Array.isArray(x.history) || !Array.isArray(x.newContent)) return false;
  const rb = x.robots as Record<string, unknown>; for (const id of ROBOT_IDS) { const r = rb[id]; if (!isObj(r) || typeof r.unlocked !== 'boolean' || typeof r.w !== 'number' || !Array.isArray(r.xjWon)) return false; }
  const p = x.puzzles; if (!Array.isArray(p.done) || !Array.isArray(p.firstTry) || !Array.isArray(p.recent30) || !isObj(p.daily)) return false;
  const s = x.settings; if (!isObj(s.houseRules) || !isObj(s.coachOn)) return false;
  if (x.game !== undefined) { const g = x.game; if (!isObj(g) || typeof g.startFen !== 'string' || !Array.isArray(g.moves) || !g.moves.every((m) => typeof m === 'string') || (g.side !== 0 && g.side !== 1) || typeof g.seed !== 'number') return false; }
  return true;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const LEGACY_SNAPSHOT = 'kg:v1:legacy-xiangqi';
/** 迁移（kit 只调一次；直接返回当前形状）。from === 1：旧信封原文 → legacy 快照（已存在不覆盖），返回 defaults，stats.legacySolved = 旧 solved 数，旧存档有着法则 notice = 'legacy'。 */
export function makeMigrate(storage?: StorageLike): (old: unknown, from: number) => XqSave {
  return (old, from) => {
    const d = defaults(); if (from !== 1) return d;
    const st = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    try { if (st && !st.getItem(LEGACY_SNAPSHOT)) { const raw = st.getItem('kg:v1:xiangqi'); st.setItem(LEGACY_SNAPSHOT, raw ?? JSON.stringify({ v: 1, data: old })); } } catch { /* 存储不可用：放弃快照，不挡游戏 */ }
    const o = isObj(old) ? old : {}; const solved = Array.isArray(o.solved) ? o.solved.length : 0; d.stats.legacySolved = solved;
    if (Array.isArray(o.moves) && o.moves.length > 0) d.notice = 'legacy'; return d;
  };
}
export function createXqStore(storage?: Storage): Store<XqSave> {
  return createBoardStore<XqSave>('xiangqi', { version: 2, defaults, migrate: makeMigrate(storage), isValid: isValidXqSave, ...(storage ? { storage } : {}) });
}

// ───────────────────────── 进度计算（页面与测试共用）─────────────────────────
export const lessonsDone = (s: XqSave): number => Object.values(s.lessons).filter((l) => l.done || l.known).length;
export const xjDone = (s: XqSave): number => Object.values(s.xj).filter((x) => x.wins > 0).length;
/** R1 开门：将军 / 应将 / 将死 / 困毙（L17–L20）全部学过（摸底只能证明 L17 会，L18–L20 摸底从不跳过）/ 家长全部解锁 / 学堂尚未开放（lessonsReady = false） */
/** 「推荐」口径：L17–L20（将军 / 应将 / 将死 / 困毙）都学过或测过会了。注意这只是推荐，不是门槛（家长定的规矩：不设锁）。 */
export function r1Open(s: XqSave, o: { lessonsReady: boolean; unlockAll: boolean }): boolean { if (!o.lessonsReady || o.unlockAll) return true; return ['L17', 'L18', 'L19', 'L20'].every((id) => s.lessons[id]?.done || s.lessons[id]?.known); }
/** 软门：点 R1 时是否要先弹「先学三招保护将，好吗？」——推荐课没学完、没点过「不用」、也没跟 R1 下过棋。小局 / 和爸爸下 / 家长「全部解锁」永不弹。 */
export function r1Soft(s: XqSave, o: { lessonsReady: boolean; unlockAll: boolean }): boolean { if (r1Open(s, o) || s.settings.r1Skip) return false; const r = s.robots.R1; return !(r && (r.w + r.d + r.l > 0 || r.xjWon.length > 0)); }
/** R_{k+1} 解锁 = 整盘胜 R_k 一盘，或 3 个不同小局胜 R_k（两者都计入 w） */
export function robotUnlocked(s: XqSave, ix: number, o: { lessonsReady: boolean; unlockAll: boolean }): boolean {
  if (o.unlockAll) return true; const id = ROBOT_IDS[ix]; const r = s.robots[id]; if (r?.unlocked && ix > 0) return true;
  if (ix === 0) return true;   // 不设锁：R1 永远能进。软门只是一张友好的卡片（r1Soft），孩子可以点「不用，直接下」
  const prev = s.robots[ROBOT_IDS[ix - 1]]; return !!prev && (prev.w > 0 || prev.xjWon.length >= 3);
}
export interface ResultIn { robot: string; mode: 'full' | 'xj'; xjId?: string; result: 'w' | 'd' | 'l'; plies: number; undo: number; coachShown: number; coachAccepted: number; kidSide: 0 | 1; hintsUsed: number; helped: boolean }
/** 记一盘棋：战绩、连输计数（赢则清零，和棋不动）、徽章、小局星、解锁、历史环（≤30） */
export function recordResult(s: XqSave, r: ResultIn, now = Date.now()): XqSave {
  const rb = s.robots[r.robot]; if (!rb) return s;
  if (r.result === 'w') { rb.w++; rb.loseStreak = 0; if (r.mode === 'full') { if (!r.helped) rb.badges = [...new Set([...rb.badges, r.kidSide === 0 ? 'r' : 'b', ...(r.undo === 0 ? ['clean'] : [])])] as RobotRec['badges']; rb.wall = Math.max(rb.wall, 1); } else if (r.xjId && !rb.xjWon.includes(r.xjId)) rb.xjWon.push(r.xjId); }
  else if (r.result === 'd') rb.d++; else { rb.l++; rb.loseStreak++; }
  if (r.result === 'w') { const ix = ROBOT_IDS.indexOf(r.robot as (typeof ROBOT_IDS)[number]); const nxt = ROBOT_IDS[ix + 1]; if (nxt && (r.mode === 'full' || rb.xjWon.length >= 3)) s.robots[nxt].unlocked = true; }
  if (r.mode === 'xj' && r.xjId && r.result === 'w') { const x = (s.xj[r.xjId] ??= { wins: 0, best: 0 }); x.wins++; const stars = (r.undo === 0 ? (r.plies <= 20 ? 3 : 2) : 1) as 1 | 2 | 3; if (stars > x.best) x.best = stars; }
  s.history.push({ t: now, robot: r.robot, mode: r.mode, result: r.result, plies: r.plies, undo: r.undo, coachShown: r.coachShown, coachAccepted: r.coachAccepted }); if (s.history.length > 30) s.history.splice(0, s.history.length - 30);
  delete s.game; return s;
}
/** 帮助阶梯（连输 2 盘 → 轻松；再 2 → 教练；再 2 → 让左马；再 2 → 让双马或让一车）：返回当前该邀请的档（0 = 无） */
export function helpInvite(rb: RobotRec): 0 | 1 | 2 | 3 | 4 { const tier = Math.min(4, Math.floor(rb.loseStreak / 2)); return (tier > rb.helpTier ? tier : 0) as 0 | 1 | 2 | 3 | 4; }
export function hubLabel(s: XqSave): { label: string; value: number } { const l = lessonsDone(s), x = xjDone(s); return { label: l > 0 || x > 0 ? `学堂 ${l}/33 · 小局 ${x}/28` : '开始下棋', value: Math.min(1, (l / 33 + x / 28) / 2) }; }
