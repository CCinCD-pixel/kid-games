// view/anim.ts — 动画队列（纯调度，无 DOM）+ WAAPI 小工具。
// 队列语义：任务依次执行；finishAll() 把当前任务推进到终态，其余排队任务"启动即完成"（同步），保证最终棋盘状态正确，并释放所有等待者。
export interface JobHandle { done: Promise<void>; /** 同步推进到终态（幂等） */ finish(): void }
export interface AnimJob { start(): JobHandle }
export interface AnimQueue {
  enqueue(job: AnimJob): Promise<void>;
  finishAll(): void;
  readonly idle: boolean; readonly pending: number;
  onIdleChange(cb: (idle: boolean) => void): () => void;
}

export function createAnimQueue(): AnimQueue {
  type Item = { job: AnimJob; resolve: () => void };
  const waiting: Item[] = [];
  let current: { handle: JobHandle; item: Item } | null = null;
  const listeners = new Set<(idle: boolean) => void>();
  let lastIdle = true;
  const emit = (): void => { const idle = current === null && waiting.length === 0; if (idle !== lastIdle) { lastIdle = idle; for (const l of [...listeners]) l(idle); } };

  const pump = (): void => {
    if (current || !waiting.length) { emit(); return; }
    const item = waiting.shift() as Item;
    let handle: JobHandle;
    try { handle = item.job.start(); } catch (e) { item.resolve(); console.warn('[board] anim job failed', e); pump(); return; }
    current = { handle, item }; emit();
    void handle.done.then(() => {
      if (current && current.item === item) { current = null; item.resolve(); pump(); }
    }, () => { if (current && current.item === item) { current = null; item.resolve(); pump(); } });
  };
  return {
    enqueue(job) { return new Promise<void>((resolve) => { waiting.push({ job, resolve }); pump(); }); },
    finishAll() {
      if (current) { const c = current; current = null; try { c.handle.finish(); } catch (e) { console.warn('[board] finish failed', e); } c.item.resolve(); }
      while (waiting.length) {
        const item = waiting.shift() as Item;
        try { const h = item.job.start(); h.finish(); } catch (e) { console.warn('[board] instant job failed', e); }
        item.resolve();
      }
      emit();
    },
    get idle() { return current === null && waiting.length === 0; },
    get pending() { return waiting.length + (current ? 1 : 0); },
    onIdleChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
}

export interface PlayHandle { finished: Promise<void>; finish(): void }
const NOOP: PlayHandle = { finished: Promise.resolve(), finish() { /* nothing */ } };
/** WAAPI：只动 transform / opacity。没有 animate()（极旧环境）→ 立即完成。结束后样式不保留（调用方先写好终态样式）。 */
export function play(el: Element | null, keyframes: Keyframe[], opts: KeyframeAnimationOptions): PlayHandle {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return NOOP;
  const a = (el as HTMLElement).animate(keyframes, { fill: 'backwards', ...opts });
  const finished = a.finished.then(() => undefined, () => undefined);
  return { finished, finish() { try { a.finish(); } catch { a.cancel(); } } };
}
export const ease = { out: 'cubic-bezier(.22, 1, .36, 1)', inOut: 'cubic-bezier(.45, 0, .25, 1)', slide: 'cubic-bezier(.32, .72, .24, 1)' } as const;
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
