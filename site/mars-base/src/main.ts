import './styles.css';
import './pets.css';
import './stages.css';
import '@engines/manip/numberline.css';
import { initShell } from '@kit/shell';
import { Narrator } from '@kit/narration';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { bindPress } from '@kit/ui';
import { registerMetrics } from '@kit/metrics';
import { openSave } from './save/store';
import { App } from './screens/app';
import { metricsOf } from './app/base';

const root = document.getElementById('app')!;
const handle = openSave();
const save = handle.load();   // never throws, never half a save (save/repair.ts)
const narrator = new Narrator({ manifestUrl: '/audio/mars-base/audio-manifest.json' });
const numbersReady = narrator.addManifest('/audio/mars-base/numbers-manifest.json');

const shell = initShell({
  game: 'mars-base',
  startGate: { title: '火星基地', subtitle: '总工程师，基地等你', buttonLabel: '开始' },
  back: { compact: true },
  onBeforeLeave: () => { handle.save(save); },
  onPause: () => handle.save(save),
});
bindPress(document);

const metricsDefs = ['progress', 'orbit', 'cert'].map((id) => ({ id, label: id, value: () => { const m = metricsOf(save).metrics.find((x) => x.id === id); return m ? { value: m.value, frac: m.frac, detail: m.detail, status: m.status, hint: m.hint } : null; } }));
const metrics = registerMetrics('mars-base', metricsDefs.map((d) => ({ ...d, label: ({ progress: '基地进度', orbit: '数轴估算', cert: '徽章' } as Record<string, string>)[d.id] })));

void (async () => {
  await shell.ready;
  await Promise.race([Promise.all([narrator.ready(), numbersReady]), new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
  void installKitSfx({ only: ['ui-tap', 'ui-press', 'ui-confirm', 'ui-key', 'ui-key-delete', 'ui-back', 'ui-select', 'correct', 'correct-big', 'try-again', 'chime', 'hint', 'star-1', 'star-2', 'star-3', 'level-complete', 'unlock', 'ui-open', 'ui-close', 'ui-pop', 'blip-happy', 'blip-think', 'blip-talk', 'blip-surprised', 'blip-sleepy', 'blip-question'] }).catch(() => undefined);
  const app = new App(save, handle, shell, narrator, root); app.metrics = metrics;
  if (new URLSearchParams(location.search).get('test') === '1' && (navigator.webdriver || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    const { installTestHook } = await import('./dev/test-hook');
    installTestHook(app);
  }
  root.dataset.ready = '1';
  await app.start();
})().catch((e) => rescue(e));

/** Last line of defence: whatever goes wrong at boot, the child never sees a blank page. The raw save is kept under a backup key before the reset. */
function rescue(err: unknown): void {
  console.error('[mars-base] boot failed', err);
  try { const raw = localStorage.getItem('kg:v1:mars-base'); if (raw) localStorage.setItem(`kg:v1:mars-base:corrupt-${Date.now()}`, raw); } catch { /* blocked */ }
  root.replaceChildren();
  const box = document.createElement('div'); box.className = 'mb-rescue';
  box.innerHTML = '<p>基地的信号有点弱。</p><button class="xg-btn xg-btn--primary xg-btn--lg" type="button">再试一次</button>';
  (box.querySelector('button') as HTMLButtonElement).onclick = () => { try { localStorage.removeItem('kg:v1:mars-base'); } catch { /* blocked */ } location.reload(); };
  root.append(box); root.dataset.ready = '1';
}
