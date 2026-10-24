import './math/styles.css';
import { initShell } from '@kit/shell';
import { registerMetrics } from '@kit/metrics';
import { setHubProgress } from '@kit/progress';
import { ArithmeticApp } from './math/app';
import { openMathStore, readMathSave } from './math/save';
import { PASS_SCORE, STAGES } from './math/problems';

const root = document.getElementById('app')!;
const store = openMathStore();
const save = readMathSave(store);
const persist = () => {
  store.save(save);
  const passed = STAGES.filter((stage) => (save.best[stage.id] ?? 0) >= PASS_SCORE).length;
  setHubProgress('mars-base', { label: `算术 ${passed} / ${STAGES.length} 阶`, value: passed / STAGES.length });
  metrics.refresh();
};
const metrics = registerMetrics('mars-base', [{
  id: 'arithmetic', label: '算术阶梯',
  value: () => {
    const passed = STAGES.filter((stage) => (save.best[stage.id] ?? 0) >= PASS_SCORE).length;
    return { value: `${passed} / ${STAGES.length}`, frac: passed / STAGES.length, detail: '四则运算已通过的阶数' };
  },
}]);
const shell = initShell({ game: 'mars-base', startGate: false, back: { compact: true }, onBeforeLeave: persist, onPause: persist });
const app = new ArithmeticApp(root, save, persist);
void shell.ready.then(() => { app.render(); root.dataset.ready = '1'; });
