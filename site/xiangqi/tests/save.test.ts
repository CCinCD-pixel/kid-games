// V13 存档：真实旧信封迁移（version 1 → 2）+ 损坏信封 + 形状校验 + 进度规则（解锁 / 帮助阶梯 / 战绩）。
import { describe, expect, it } from 'vitest';
import { ROBOT_IDS, createXqStore, defaults, helpInvite, isValidXqSave, newRobot, r1Open, r1Soft, recordResult, robotUnlocked, type XqSave } from '../src/progress/save';

const mem = (init: Record<string, string> = {}): Storage => { const m = new Map(Object.entries(init)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage; };
const OLD_START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
const oldEnv = (data: unknown): string => JSON.stringify({ v: 1, updatedAt: 1, data });

describe('V13 存档迁移', () => {
  it('旧版（v1，空棋局）→ 默认值 + legacy 快照，不弹说明卡', () => {
    const st = mem({ 'kg:v1:xiangqi': oldEnv({ mode: 'local', level: 'learner', human: 'w', initialFen: OLD_START, moves: [], flipped: false, autoRotate: false, solved: [] }) });
    const s = createXqStore(st).load(); expect(isValidXqSave(s)).toBe(true); expect(s.version).toBe(2); expect(s.notice).toBe('none'); expect(st.getItem('kg:v1:legacy-xiangqi')).toContain('learner');
  });
  it('旧版带着法与 solved → notice = legacy，legacySolved 计数，快照原文保留，新存档可用', () => {
    const raw = oldEnv({ mode: 'robot', level: 'master', human: 'w', initialFen: OLD_START, moves: ['h3e3', 'h10g8'], solved: ['p1', 'p2', 'p3'] }); const st = mem({ 'kg:v1:xiangqi': raw });
    const store = createXqStore(st); const s = store.load(); expect(s.notice).toBe('legacy'); expect(s.stats.legacySolved).toBe(3); expect(st.getItem('kg:v1:legacy-xiangqi')).toBe(raw);
    s.lessons.L01 = { stars: 3, stepId: 'L01.3', done: true }; store.save(s); expect(createXqStore(st).load().lessons.L01.done).toBe(true); expect(st.getItem('kg:v1:legacy-xiangqi')).toBe(raw);
  });
  it('已有 legacy 快照不被覆盖', () => { const st = mem({ 'kg:v1:xiangqi': oldEnv({ moves: ['a'] }), 'kg:v1:legacy-xiangqi': 'KEEP' }); createXqStore(st).load(); expect(st.getItem('kg:v1:legacy-xiangqi')).toBe('KEEP'); });
  it('损坏信封：非 JSON / v 为字符串 / data 为 null / v2 缺字段 → 默认值，不抛', () => {
    for (const bad of ['not json{', JSON.stringify({ v: '2', data: {} }), JSON.stringify({ v: 2, data: null }), JSON.stringify({ v: 2, data: { version: 2 } }), JSON.stringify({ v: 2, data: { ...defaults(), robots: {} } })]) {
      const s = createXqStore(mem({ 'kg:v1:xiangqi': bad })).load(); expect(isValidXqSave(s)).toBe(true); expect(s.version).toBe(2);
    }
  });
  it('更新版本的存档（v3）不被覆盖也不降级', () => { const st = mem({ 'kg:v1:xiangqi': JSON.stringify({ v: 3, data: { future: true } }) }); const store = createXqStore(st); const s = store.load(); expect(isValidXqSave(s)).toBe(true); expect(store.save(s)).toBe(false); expect(st.getItem('kg:v1:xiangqi')).toContain('future'); });
  it('在局存档的非法着法形状被拒绝', () => { const s = defaults() as unknown as Record<string, unknown>; s.game = { mode: 'robot', startFen: 'x', moves: [1, 2], side: 0, seed: 1 }; expect(isValidXqSave(s)).toBe(false); });
});

describe('进度规则', () => {
  const O = { lessonsReady: true, unlockAll: false };
  it('R1 开门：第 5 章 / 摸底 / 家长开关；R_{k+1} = 整盘胜 R_k 或 3 个不同小局', () => {
    const s = defaults(); expect(r1Open(s, O)).toBe(false); expect(r1Open(s, { ...O, unlockAll: true })).toBe(true); expect(r1Open(s, { lessonsReady: false, unlockAll: false })).toBe(true);
    for (const id of ['L17', 'L18', 'L19', 'L20']) s.lessons[id] = { stars: 2, stepId: id, done: true }; expect(r1Open(s, O)).toBe(true); expect(robotUnlocked(s, 0, O)).toBe(true); expect(robotUnlocked(s, 1, O)).toBe(false);
    recordResult(s, { robot: 'R1', mode: 'xj', xjId: 'a', result: 'w', plies: 20, undo: 0, coachShown: 0, coachAccepted: 0, kidSide: 0, hintsUsed: 0, helped: false }); recordResult(s, { robot: 'R1', mode: 'xj', xjId: 'b', result: 'w', plies: 20, undo: 0, coachShown: 0, coachAccepted: 0, kidSide: 0, hintsUsed: 0, helped: false }); expect(robotUnlocked(s, 1, O)).toBe(true);   // w>0 也算
    const t = defaults(); recordResult(t, { robot: 'R1', mode: 'full', result: 'w', plies: 50, undo: 0, coachShown: 0, coachAccepted: 0, kidSide: 1, hintsUsed: 0, helped: false }); expect(t.robots.R2.unlocked).toBe(true); expect(t.robots.R1.badges).toEqual(expect.arrayContaining(['b', 'clean']));
  });
  it('R1 软门（家长定的规矩：不设锁）：L17–L20 没学时只是推荐；R1 永远能进，软门卡片可跳过且只问一次', () => {
    const s = defaults();
    expect(r1Open(s, O)).toBe(false); expect(robotUnlocked(s, 0, O)).toBe(true); expect(r1Soft(s, O)).toBe(true);        // 推荐没满足 → 弹卡片，但 R1 本身是开的
    expect(r1Soft(s, { ...O, unlockAll: true })).toBe(false); expect(r1Soft(s, { lessonsReady: false, unlockAll: false })).toBe(false);
    s.settings.r1Skip = true; expect(r1Soft(s, O)).toBe(false); expect(robotUnlocked(s, 0, O)).toBe(true);               // 点过「不用，直接下」→ 不再问
    const t = defaults(); recordResult(t, { robot: 'R1', mode: 'xj', xjId: 'a', result: 'l', plies: 20, undo: 0, coachShown: 0, coachAccepted: 0, kidSide: 0, hintsUsed: 0, helped: false }); expect(r1Soft(t, O)).toBe(false);   // 已经跟 R1 下过
    const u = defaults(); u.placement.known = { '5': true }; for (const id of ['L17', 'L18', 'L19', 'L20']) u.lessons[id] = { stars: 0, stepId: id, done: false, known: true }; expect(r1Soft(u, O)).toBe(false);   // 摸底测会也算
    expect(isValidXqSave(s)).toBe(true);
  });
  it('帮助阶梯：连输 2 盘 → 轻松；再 2 → 教练；赢则清零，和棋不动', () => {
    const rb = newRobot(true); expect(helpInvite(rb)).toBe(0); rb.loseStreak = 2; expect(helpInvite(rb)).toBe(1); rb.helpTier = 1; expect(helpInvite(rb)).toBe(0); rb.loseStreak = 4; expect(helpInvite(rb)).toBe(2);
    const s = defaults(); const lose = (): void => void recordResult(s, { robot: 'R2', mode: 'full', result: 'l', plies: 40, undo: 0, coachShown: 0, coachAccepted: 0, kidSide: 0, hintsUsed: 0, helped: false });
    lose(); lose(); expect(s.robots.R2.loseStreak).toBe(2); recordResult(s, { robot: 'R2', mode: 'full', result: 'd', plies: 40, undo: 0, coachShown: 0, coachAccepted: 0, kidSide: 0, hintsUsed: 0, helped: false }); expect(s.robots.R2.loseStreak).toBe(2); recordResult(s, { robot: 'R2', mode: 'full', result: 'w', plies: 40, undo: 1, coachShown: 0, coachAccepted: 0, kidSide: 0, hintsUsed: 0, helped: false }); expect(s.robots.R2.loseStreak).toBe(0); expect(s.robots.R2.badges).not.toContain('clean');
  });
  it('历史环 ≤ 30；小局星：无悔且 ≤20 步 = ★★★', () => {
    const s = defaults() as XqSave; for (let i = 0; i < 40; i++) recordResult(s, { robot: ROBOT_IDS[0], mode: 'xj', xjId: 'x1', result: 'w', plies: 18, undo: 0, coachShown: 0, coachAccepted: 0, kidSide: 0, hintsUsed: 0, helped: false }); expect(s.history.length).toBe(30); expect(s.xj.x1.best).toBe(3); expect(s.xj.x1.wins).toBe(40);
  });
});
