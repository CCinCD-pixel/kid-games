import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiHost, isCancelled, OLD_SEARCH_MS, WORKER_ERROR_BACKOFF_MS, WORKER_RETRY_AFTER_MS } from './host';
import { registerAiWorker } from './worker-entry';
import { createAiHandler } from './handler';
import { createErrorModel } from '../core/errormodel';
import { createCoachPolicy } from '../core/coach';
import { stateSearchAdapter } from '../core/stateadapter';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import type { AiPlugin, AiRequest, RobotLevel, WorkerLike, WorkerScopeLike } from '../core/types';
import type { AiMoveResult, AiPluginExt } from './protocol';

/** 假 Worker：记录收到的消息，由测试决定何时回复 */
class FakeWorker implements WorkerLike {
  received: { id: number; epoch: number; op?: string; type?: string }[] = []; onmessage: ((e: { data: unknown }) => void) | null = null; terminated = false;
  postMessage(m: unknown): void { this.received.push(m as FakeWorker['received'][number]); }
  terminate(): void { this.terminated = true; }
  reply(id: number, result: unknown, epoch = 0): void { this.onmessage?.({ data: { id, epoch, ok: true, result } }); }
  get requests() { return this.received.filter((m) => typeof m.id === 'number'); }
}
const LEVEL: RobotLevel = { id: 't', depth: 2, nodes: 4000, slip: 0, glanceTemp: 60, temp: 25, margin: 40, mateSight: 0, coachCap: 2, look: {} };
const moveReq = (extra: Partial<Extract<AiRequest, { op: 'move' }>> = {}): AiRequest => ({ op: 'move', startFen: '', moves: [], level: LEVEL, gameSeed: 7, budget: { maxMs: Infinity, maxDepth: 6 }, ...extra });

describe('AiHost（假 Worker）', () => {
  let workers: FakeWorker[];
  const mk = (o: Partial<Parameters<typeof createAiHost>[0]> = {}) => createAiHost({ createWorker: () => { const w = new FakeWorker(); workers.push(w); return w; }, timeoutMs: 1000, retries: 1, warmup: true, ...o });
  beforeEach(() => { workers = []; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('创建时热身；请求带 id/epoch，回复解析', async () => {
    const host = mk(); const w = workers[0]; expect(w.received[0]).toEqual({ type: 'warmup' });
    const p = host.request<string>(moveReq()); expect(w.requests).toHaveLength(1); const { id, epoch } = w.requests[0]; w.reply(id, 'e2e4', epoch); await expect(p).resolves.toBe('e2e4'); expect(host.pendingCount).toBe(0); expect(host.fallbackActive).toBe(false);
  });
  it('bump：在途请求立即 reject cancelled；迟到回复丢弃；新请求不受影响', async () => {
    const host = mk(); const w = workers[0]; const a = host.request(moveReq()); const aId = w.requests[0].id; const rejected = a.catch((e) => e); host.bump(); expect(isCancelled(await rejected)).toBe(true);
    const b = host.request<string>(moveReq()); const bId = w.requests[1].id; expect(w.requests[1].epoch).toBe(1); w.reply(aId, 'late', 0); w.reply(bId, 'ok', 1); await expect(b).resolves.toBe('ok');
  });
  it('旧搜索 ≤200 ms：新请求排队不重建；>200 ms：terminate + 重建并发到新 Worker', async () => {
    const host = mk(); const a = host.request(moveReq()); void a.catch(() => undefined); host.bump(); vi.advanceTimersByTime(OLD_SEARCH_MS - 20); void host.request(moveReq()); expect(workers).toHaveLength(1);
    const host2 = mk(); const c = host2.request(moveReq()); void c.catch(() => undefined); host2.bump(); vi.advanceTimersByTime(OLD_SEARCH_MS + 50); const before = workers.length; void host2.request(moveReq()); expect(workers).toHaveLength(before + 1); expect(workers[before - 1].terminated).toBe(true); expect(workers[before].requests).toHaveLength(1);
  });
  it('超时 → terminate 重建 → 重发 → 仍超时走主线程兜底；之后新请求仍先试 Worker', async () => {
    const fallback = vi.fn(async () => 'fb'); const host = mk({ fallback, timeoutMs: 500, retries: 1 }); const p = host.request<string>(moveReq());
    vi.advanceTimersByTime(500); expect(workers).toHaveLength(2); expect(workers[0].terminated).toBe(true); expect(workers[1].requests).toHaveLength(1);        // 第一次重发
    vi.advanceTimersByTime(500); await expect(p).resolves.toBe('fb'); expect(fallback).toHaveBeenCalledTimes(1); expect(host.fallbackActive).toBe(true); expect(workers).toHaveLength(3);
    const q = host.request<string>(moveReq()); const w = workers[2]; w.reply(w.requests[0].id, 'w', 0); await expect(q).resolves.toBe('w'); expect(host.fallbackActive).toBe(false);
  });
  it('超时 = timeoutMs + budget.maxMs（有限时）；maxMs = Infinity 只用 timeoutMs', () => {
    const fallback = vi.fn(async () => 'fb'); const host = mk({ fallback, timeoutMs: 1000, retries: 0 }); const p = host.request(moveReq({ budget: { maxMs: 1800, maxDepth: 6 } })); void p;
    vi.advanceTimersByTime(2799); expect(fallback).not.toHaveBeenCalled(); vi.advanceTimersByTime(2); expect(fallback).toHaveBeenCalledTimes(1);
  });
  it('没有兜底：超时耗尽后 reject ai-timeout', async () => { const host = mk({ timeoutMs: 100, retries: 0 }); const p = host.request(moveReq()); const r = p.catch((e: Error) => e.message); vi.advanceTimersByTime(101); expect(await r).toBe('ai-timeout'); });
  it('createWorker 抛错 → 直接走兜底（fallbackActive）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); const host = createAiHost({ createWorker: () => { throw new Error('no worker'); }, timeoutMs: 100, retries: 0, warmup: true, fallback: async () => 'fb' });
    expect(host.fallbackActive).toBe(true); await expect(host.request(moveReq())).resolves.toBe('fb'); warn.mockRestore();
  });
  it('Worker 报错回复 → reject；onerror → 重建并重发在途请求', async () => {
    const host = mk(); const w = workers[0]; const p = host.request(moveReq()); const r = p.catch((e: Error) => e.message); w.onmessage?.({ data: { id: w.requests[0].id, epoch: 0, ok: false, error: 'bad-history' } }); expect(await r).toBe('bad-history');
    const q = host.request<string>(moveReq()); (w as unknown as { onerror: () => void }).onerror(); expect(workers).toHaveLength(2); const w2 = workers[1]; expect(w2.requests).toHaveLength(1); w2.reply(w2.requests[0].id, 'again', 0); await expect(q).resolves.toBe('again');
  });
  it('post-freeze：Worker 创建成功但每次都出错（部署后哈希 chunk 404）→ 有限次重建 + 退避，之后主线程兜底，不再无限重建', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); const fallback = vi.fn(async () => 'fb');
    const host = createAiHost({ createWorker: () => { const w = new FakeWorker(); workers.push(w); setTimeout(() => (w as unknown as { onerror?: () => void }).onerror?.(), 10); return w; }, timeoutMs: 1000, retries: 1, warmup: true, fallback });
    const p = host.request<string>(moveReq()); await vi.advanceTimersByTimeAsync(5000); await expect(p).resolves.toBe('fb');
    expect(workers.length).toBeLessThanOrEqual(WORKER_ERROR_BACKOFF_MS.length + 2); expect(host.fallbackActive).toBe(true); expect(fallback).toHaveBeenCalledTimes(1);
    const n = workers.length; await vi.advanceTimersByTimeAsync(30_000); expect(workers.length).toBe(n);                       // 放弃之后不再重建
    await expect(host.request<string>(moveReq())).resolves.toBe('fb'); expect(workers.length).toBe(n);                           // 之后的请求直接兜底
    await vi.advanceTimersByTimeAsync(WORKER_RETRY_AFTER_MS + 1); void host.request(moveReq()).catch(() => undefined); expect(workers.length).toBe(n + 1);   // 冷却后再给 Worker 一次机会
    host.terminate(); warn.mockRestore();
  });
  it('post-freeze：Worker 持续出错且没有兜底 → 请求 reject（不挂死）；10 秒内最多建几个 Worker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = createAiHost({ createWorker: () => { const w = new FakeWorker(); workers.push(w); setTimeout(() => (w as unknown as { onerror?: () => void }).onerror?.(), 10); return w; }, timeoutMs: 1000, retries: 1, warmup: true });
    const p = host.request(moveReq()); const r = p.catch((e: Error) => e.message); await vi.advanceTimersByTimeAsync(10_000); expect(await r).toBe('ai-timeout'); expect(workers.length).toBeLessThanOrEqual(WORKER_ERROR_BACKOFF_MS.length + 2); warn.mockRestore();
  });
  it('post-freeze：Worker 回 ok:false → 先走主线程兜底；兜底也失败才 reject 原错误', async () => {
    const fb = vi.fn(async () => 'fb'); const host = mk({ fallback: fb }); const w = workers[0]; const p = host.request<string>(moveReq()); w.onmessage?.({ data: { id: w.requests[0].id, epoch: 0, ok: false, error: 'boom' } }); await expect(p).resolves.toBe('fb'); expect(fb).toHaveBeenCalledTimes(1); expect(host.fallbackActive).toBe(true);
    const bad = mk({ fallback: async () => { throw new Error('fb-fail'); } }); const w2 = workers[workers.length - 1]; const q = bad.request(moveReq()); const rq = q.catch((e: Error) => e.message); w2.onmessage?.({ data: { id: w2.requests[0].id, epoch: 0, ok: false, error: 'boom' } }); expect(await rq).toBe('boom');
  });
  it('terminate：reject 在途请求；之后的请求直接 reject', async () => { const host = mk(); const p = host.request(moveReq()); const r = p.catch((e: Error) => e.message); host.terminate(); expect(await r).toBe('terminated'); await expect(host.request(moveReq())).rejects.toThrow('terminated'); expect(workers[0].terminated).toBe(true); });
});

// ───────── 真 handler + 回环 Worker（端到端协议）─────────
function chessPlugin(): AiPluginExt<unknown, unknown> {
  const rules = chessRules(); const adapter = stateSearchAdapter(rules);
  return { createRules: () => chessRules(), adapter, errorModel: createErrorModel(), coach: createCoachPolicy({ valueAt: adapter.valueAt, encode: (m: unknown) => rules.encode(m), stalemate: false }), highlights: { detect: () => [{ kind: 'x', ply: 0, score: 0, neg: false, say: 'hi' }] },
    ops: { echo: (payload) => ({ echoed: payload }), perft1: (_p, ctx) => ctx.rules.legalMoves(ctx.rules.initial()).length } } as AiPluginExt<unknown, unknown>;
}
class Loopback implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null; private scope: WorkerScopeLike; terminated = false;
  constructor(plugin: AiPlugin<unknown, unknown>) { const w = this; this.scope = { onmessage: null, postMessage(m) { queueMicrotask(() => w.onmessage?.({ data: m })); } }; registerAiWorker(this.scope, plugin); }
  postMessage(m: unknown): void { const d = JSON.parse(JSON.stringify(m, (_k, v) => (v === Infinity ? '__inf' : v))) as unknown; const s = this.scope; queueMicrotask(() => s.onmessage?.({ data: JSON.parse(JSON.stringify(d), (_k, v) => (v === '__inf' ? Infinity : v)) })); }
  terminate(): void { this.terminated = true; }
}
describe('AiHost + registerAiWorker（回环；国象原型适配器）', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const mkHost = (): ReturnType<typeof createAiHost> => createAiHost({ createWorker: () => new Loopback(chessPlugin()), timeoutMs: 5000, retries: 0, warmup: true });
  const mv = (host: ReturnType<typeof createAiHost>, moves: string[], seed = 11, extra: Partial<Extract<AiRequest, { op: 'move' }>> = {}): Promise<AiMoveResult> => host.request<AiMoveResult>({ op: 'move', startFen: START, moves, level: LEVEL, gameSeed: seed, budget: { maxMs: Infinity, maxDepth: 6 }, ...extra });
  it('move：返回合法着法；同请求二次同结果；中间插别的请求不改变（确定性）', async () => {
    const host = mkHost(); const a = await mv(host, ['e2e4']); const rules = chessRules(); const s = rules.initial(); const s1 = rules.apply(s, rules.decode(s, 'e2e4')); expect(rules.decode(s1, a.move as string)).not.toBeNull(); expect(a.ply).toBe(1);
    await mv(host, ['d2d4', 'd7d5']); await mv(host, ['e2e4'], 99); const b = await mv(host, ['e2e4']); expect(b).toEqual(a);
  });
  it('悔棋后同一 (gameSeed, ply) 得同一步；不同 gameSeed 在多个局面上至少有一处不同', async () => {
    const host = mkHost(); const first = await mv(host, ['e2e4']); await mv(host, ['e2e4', 'e7e5', 'g1f3']); expect(await mv(host, ['e2e4'])).toEqual(first);
    const lv = { ...LEVEL, slip: 0, temp: 80, margin: 120 }; const outs = new Set<string>(); for (let seed = 1; seed <= 12; seed++) outs.add((await mv(host, ['e2e4'], seed, { level: lv })).move as string); expect(outs.size).toBeGreaterThan(1);
  });
  it('exclude 的着法不会被选；全被排除时忽略排除', async () => {
    const host = mkHost(); const rules = chessRules(); const s = rules.apply(rules.initial(), rules.decode(rules.initial(), 'e2e4')); const all = rules.legalMoves(s).map((m: unknown) => rules.encode(m)) as string[];
    const r1 = await mv(host, ['e2e4'], 3, { exclude: all.filter((m) => m !== 'g8f6') }); expect(r1.move).toBe('g8f6'); const r2 = await mv(host, ['e2e4'], 3, { exclude: all }); expect(all).toContain(r2.move);
  });
  it('非法历史 → reject bad-history；终局无着法 → move:null', async () => {
    const host = mkHost(); await expect(mv(host, ['e2e5'])).rejects.toThrow('bad-history');
    const mate = await host.request<AiMoveResult>({ op: 'move', startFen: '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', moves: [], level: LEVEL, gameSeed: 1, budget: { maxMs: Infinity, maxDepth: 4 } }); expect(mate.move).toBeNull();
  });
  it('coach：吃亏的着法被标记 hang；hint：返回合法着法与 from/to；highlights / custom ops', async () => {
    const host = mkHost(); const rows = await host.request<{ m: string; reason: string | null }[]>({ op: 'coach', startFen: '4k3/8/8/8/4p3/8/3Q4/4K3 w - - 0 1', moves: [] }); expect(rows.find((r) => r.m === 'd2d4')?.reason).toBe(null); expect(rows.find((r) => r.m === 'd2d3')?.reason).toBe('hang');
    const h = await host.request<{ move: string; from: number; to: number }>({ op: 'hint', startFen: START, moves: [], tier: 2 }); expect(chessRules().decode(chessRules().initial(), h.move)).not.toBeNull(); expect(typeof h.from).toBe('number');
    expect(await host.request<unknown[]>({ op: 'highlights', startFen: START, moves: [], kidSide: 0, budgetMs: 10 })).toHaveLength(1);
    expect(await host.request<{ echoed: number }>({ op: 'custom', name: 'echo', payload: 5 })).toEqual({ echoed: 5 }); expect(await host.request<number>({ op: 'custom', name: 'perft1', payload: null })).toBe(20);
    await expect(host.request({ op: 'custom', name: 'nope', payload: null })).rejects.toThrow('unknown-op:nope');
  });
  it('兜底处理器（fallback 模式）：深度 ≤1 仍返回合法着法', async () => {
    const h = createAiHandler(chessPlugin(), { fallback: true }); const r = h.handle({ op: 'move', startFen: START, moves: [], level: { ...LEVEL, depth: 4, nodes: 50000 }, gameSeed: 5, budget: { maxMs: Infinity, maxDepth: 4 } }) as AiMoveResult; expect(chessRules().decode(chessRules().initial(), r.move as string)).not.toBeNull();
  });
});
describe('象棋原型：根过滤避开长将 / 一步杀检测配置', () => {
  it('xq 插件（stalemateLoss）跑通 move 请求：黑方开局应着合法', () => {
    const rules = xqRules(); const adapter = stateSearchAdapter(rules); const plugin = { createRules: () => xqRules(), adapter, errorModel: createErrorModel(), coach: createCoachPolicy({ valueAt: adapter.valueAt, encode: (m: unknown) => rules.encode(m) }), highlights: { detect: () => [] }, stalemateLoss: true } as AiPluginExt<unknown, unknown>;
    const h = createAiHandler(plugin); const r = h.handle({ op: 'move', startFen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b', moves: [], level: { ...LEVEL, mateSight: 1 }, gameSeed: 1, budget: { maxMs: Infinity, maxDepth: 3 } }) as AiMoveResult; expect(rules.decode(rules.fromFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b'), r.move as string)).not.toBeNull();
  });
});
