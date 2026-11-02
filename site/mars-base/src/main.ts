import './math/styles.css';
import { initShell } from '@kit/shell';
import { registerMetrics } from '@kit/metrics';
import { setHubProgress } from '@kit/progress';
import { ArithmeticApp } from './math/app';
import { doneCount, openMathStore, readMathSave } from './math/save';
import { STAGES } from './math/problems';

const root = document.getElementById('app')!;
const store = openMathStore();
const save = readMathSave(store);
const persist = () => {
  store.save(save);
  setHubProgress('mars-base', { label: `算术 ${doneCount(save)} / ${STAGES.length} 阶`, value: doneCount(save) / STAGES.length });
  metrics.refresh();
};
const metrics = registerMetrics('mars-base', [{
  id: 'arithmetic', label: '算术阶梯',
  value: () => {
    const passed = doneCount(save);
    return { value: `${passed} / ${STAGES.length}`, frac: passed / STAGES.length, detail: '四则运算与混合挑战已通过的阶数（含测起点通过）' };
  },
}]);
const shell = initShell({ game: 'mars-base', startGate: { title: '火星基地', subtitle: '和火星搭档一起挑战四则运算', buttonLabel: '进入算术站' }, back: { compact: true }, onBeforeLeave: persist, onPause: persist });
const app = new ArithmeticApp(root, save, persist);
app.render(); root.dataset.ready = '1';
void shell.ready.then(() => app.intro());
