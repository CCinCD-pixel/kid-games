// 机关守城 · 九攻九距 — entry: shell → save → voice → kit sounds → app (spec §8.1).
import { initShell, currentLayout } from '@kit/shell';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { sound } from '@kit/ui';
import './styles.css';
import { loadSave, store } from './save';
import { createVoice } from './voice';
import { startApp } from './app';
import type { AppCtx } from './ctx';

const root = document.getElementById('app')!;
const test = /[?&]test=1/.test(location.search) || (navigator as Navigator & { webdriver?: boolean }).webdriver === true;
let save = loadSave();
let appApi: ReturnType<typeof startApp> | null = null;

const voice = createVoice();
const ctx = {
  shell: null as unknown as AppCtx['shell'], get save() { return save; }, persist: () => store.save(save), voice, layout: currentLayout(), dpr: Math.min(2, window.devicePixelRatio || 1), test,
  atlas: () => { throw new Error('use atlasFor'); },
  ui: (name: string, gain = 0.6) => sound(name, { gain }),
  mark: (name: string, data: Record<string, unknown>) => ctx.shell?.session?.mark(name, data),
} as AppCtx;
ctx.shell = initShell({
  game: 'gear-fort',
  startGate: { title: '机关守城', subtitle: '跟墨子在沙盘上守住小城' },
  back: { compact: true },
  // the kit waits ≤ 400 ms for this promise: the suspend snapshot is written to IndexedDB at once, not on an idle frame
  onBeforeLeave: () => { const p = appApi?.leave(); store.save(save); return p ?? undefined; },
  onPause: () => appApi?.pause(),
  onLayout: (l) => { ctx.layout = l; ctx.dpr = Math.min(2, l.dpr || window.devicePixelRatio || 1); appApi?.layout(l); },
});
const shell = ctx.shell;


// ?dev=replay — the kernel alone, for the WebKit determinism check (site/gear-fort/tests/determinism.spec.ts):
// the same design solutions and ghost windows as the Node fixtures must give the same per-flag hashes (spec §9.7).
if (/[?&]dev=replay\b/.test(location.search)) {
  const sim = await import('./lane/sim');
  (window as unknown as { __gfKernel: unknown }).__gfKernel = { createSim: sim.createSim, step: sim.step, hash: sim.hash, snapshot: sim.snapshot, resume: sim.resume, restore: sim.restore };
}
// the start gate is up: smoke marker for the platform test (data-ready follows after the tap; GAME_AUTHORING §8)
root.dataset.gate = '1';
await shell.ready;
void installKitSfx({ only: ['ui-tap', 'ui-pick', 'ui-select', 'ui-confirm', 'ui-open', 'ui-locked', 'ui-toggle-on', 'place-piece', 'coin', 'bump', 'lock-in', 'star-1', 'star-2', 'star-3', 'level-complete', 'jingle-win'] });
root.dataset.ready = '1';
appApi = startApp(root, ctx);
