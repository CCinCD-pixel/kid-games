// ai/host.ts — AI 宿主（主线程）：epoch 取消、超时 → terminate 重建 → 重发 → 主线程兜底、同步搜索卡住时重建、热身、挂起恢复后重发。
// 为什么要 terminate：Worker 在同步搜索里收不到消息，bump() 只能让主线程丢弃迟到回复；真想让位只能杀掉重建（≈30 ms + 热身）。
import type { AiEnvelope, AiHost, AiHostOptions, AiRequest, WorkerLike } from '../core/types';
import { isReply, WARMUP } from './protocol';

export interface AiHostImpl extends AiHost {
  /** 已创建过的 Worker 个数（含重建）；测试用 */
  readonly generations: number;
  /** 已发出但尚未回复的消息数（含已被 bump 取消、Worker 还在算的） */
  readonly outstanding: number;
  readonly pendingCount: number;
}
/** 新请求到来时，旧搜索已占用 Worker 超过这个时间 → 杀掉重建，而不是让新请求排队 */
export const OLD_SEARCH_MS = 200;
const now = (): number => Date.now();
const cancelled = (): Error => Object.assign(new Error('cancelled'), { cancelled: true });
/** 浏览器 Worker → WorkerLike（onmessage 的事件类型更宽，运行时兼容） */
export const fromWorker = (w: Worker): WorkerLike => w as unknown as WorkerLike;
export const isCancelled = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { cancelled?: boolean }).cancelled === true;

interface Pend { id: number; req: AiRequest; epoch: number; attempt: number; resolve(v: unknown): void; reject(e: unknown): void; timer: ReturnType<typeof setTimeout> | null }
/** Worker 连续报错（没收到过一次好回复）时的重建间隔：第 1 次立刻重建，之后 300 / 900 ms；再错就放弃 Worker，改主线程兜底 */
export const WORKER_ERROR_BACKOFF_MS: readonly number[] = [0, 300, 900];
/** 放弃 Worker 后，隔这么久再给它一次机会（例如网络恢复后哈希 chunk 又能取到） */
export const WORKER_RETRY_AFTER_MS = 60_000;

export function createAiHost(o: AiHostOptions): AiHostImpl {
  let worker: WorkerLike | null = null; let gen = 0; let epoch = 0; let nextId = 1; let dead = false; let usedFallback = false; let workerBroken = false; let brokenAt = 0; let errStreak = 0; let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<number, Pend>(); const outstanding = new Map<number, number>();
  let hiddenAt: number | null = null;

  const timeoutFor = (req: AiRequest): number => o.timeoutMs + (req.op === 'move' && Number.isFinite(req.budget.maxMs) ? req.budget.maxMs : 0);
  const clearTimer = (p: Pend): void => { if (p.timer !== null) { clearTimeout(p.timer); p.timer = null; } };

  function create(): void {
    outstanding.clear();
    try { worker = o.createWorker(); } catch (e) { console.warn('[board-ai] 创建 Worker 失败，改用主线程兜底', e); worker = null; workerBroken = true; brokenAt = now(); return; }
    workerBroken = false; gen++; const w = worker;
    w.onmessage = (e) => { if (w === worker) onMessage(e.data); };
    (w as { onerror?: unknown }).onerror = () => { if (w === worker) onWorkerError(); };
    if (o.warmup) w.postMessage(WARMUP);
  }
  function kill(): void { const w = worker; worker = null; try { w?.terminate(); } catch { /* ignore */ } }
  /** 杀掉重建；pending 里仍然有效的请求原样重发（不增加重试次数） */
  function rebuild(): void { kill(); create(); if (worker) for (const p of pending.values()) post(p); else if (pending.size) giveUp(); }

  function post(p: Pend): void {
    if (!worker) return; clearTimer(p); outstanding.set(p.id, now());
    worker.postMessage({ ...p.req, id: p.id, epoch: p.epoch } satisfies AiEnvelope);
    p.timer = setTimeout(() => onTimeout(p), timeoutFor(p.req));
  }
  function onMessage(d: unknown): void {
    if (!isReply(d)) return; outstanding.delete(d.id);
    const p = pending.get(d.id); if (!p || p.epoch !== d.epoch) return;          // 过期 / 未知：丢弃
    pending.delete(d.id); clearTimer(p);
    if (d.ok) { usedFallback = false; errStreak = 0; p.resolve(d.result); return; }
    // Worker 里这次请求抛错（回了 ok:false）：给主线程兜底一次机会；兜底也失败才把原始错误交出去
    if (o.fallback) { void runFallback(p.req).then(p.resolve, () => p.reject(new Error(d.error))); return; }
    p.reject(new Error(d.error));
  }
  /** Worker 创建成功但随即出错（部署后旧页面请求已不存在的哈希 chunk → 404 / 网络抖动）：有限次重建 + 退避，再错就放弃 Worker，在途请求全部走兜底 */
  function onWorkerError(): void {
    if (dead) return; errStreak++; kill();
    if (errStreak > WORKER_ERROR_BACKOFF_MS.length) { console.warn(`[board-ai] Worker 连续出错 ${errStreak} 次，改用主线程兜底`); giveUp(); return; }
    for (const p of pending.values()) clearTimer(p);
    const wait = WORKER_ERROR_BACKOFF_MS[errStreak - 1]; if (retryTimer !== null) clearTimeout(retryTimer);
    const again = (): void => { retryTimer = null; if (dead) return; create(); if (worker) for (const p of pending.values()) post(p); else giveUp(); };
    if (wait === 0) again(); else retryTimer = setTimeout(again, wait);
  }
  function giveUp(): void {
    if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; } kill(); workerBroken = true; brokenAt = now();
    const ps = [...pending.values()]; pending.clear();
    for (const p of ps) { clearTimer(p); void runFallback(p.req).then(p.resolve, p.reject); }
  }
  function onTimeout(p: Pend): void {
    if (dead || !pending.has(p.id)) return; p.timer = null; p.attempt++;
    if (p.attempt > o.retries) { pending.delete(p.id); rebuild(); void runFallback(p.req).then(p.resolve, p.reject); return; }
    rebuild();                                                                    // 含 p 自己的重发
  }
  function runFallback(req: AiRequest): Promise<unknown> {
    usedFallback = true; if (!o.fallback) return Promise.reject(new Error('ai-timeout'));
    try { return Promise.resolve(o.fallback(req)); } catch (e) { return Promise.reject(e); }
  }
  function onVisibility(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') { hiddenAt = now(); return; }
    const was = hiddenAt; hiddenAt = null;
    // 挂起恢复后：在途搜索的墙钟早已过期，只会返回一层弱着 → 杀掉重建并重发
    if (was !== null && now() - was > 300 && pending.size && worker) rebuild();
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  create();

  return {
    get fallbackActive() { return usedFallback || workerBroken; },
    get generations() { return gen; }, get outstanding() { return outstanding.size; }, get pendingCount() { return pending.size; },
    request<R>(req: AiRequest): Promise<R> {
      if (dead) return Promise.reject(new Error('terminated'));
      return new Promise<R>((resolve, reject) => {
        if (workerBroken && now() - brokenAt > WORKER_RETRY_AFTER_MS) { workerBroken = false; errStreak = 0; }
        if (!worker && !workerBroken && retryTimer === null) create();
        if (!worker && retryTimer === null) { void runFallback(req).then((v) => resolve(v as R), reject); return; }
        // 旧搜索（已被 bump 取消、Worker 仍在同步计算）占着 Worker 超过 200 ms：杀掉重建，别让新请求排队
        let oldest = Infinity; for (const t of outstanding.values()) oldest = Math.min(oldest, t);
        if (outstanding.size && now() - oldest > OLD_SEARCH_MS) rebuild();
        const p: Pend = { id: nextId++, req, epoch, attempt: 0, resolve: resolve as (v: unknown) => void, reject, timer: null };
        pending.set(p.id, p); if (retryTimer === null) post(p);                      // 退避等待重建时只登记，重建后统一重发
      });
    },
    bump() { epoch++; for (const p of pending.values()) { clearTimer(p); p.reject(cancelled()); } pending.clear(); },
    terminate() {
      dead = true; if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; } kill(); for (const p of pending.values()) { clearTimer(p); p.reject(new Error('terminated')); } pending.clear(); outstanding.clear();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
