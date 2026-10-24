import './styles.css';
import { initShell } from '@kit/shell';
import { registerMetrics } from '@kit/metrics';
import { setHubProgress } from '@kit/progress';
import { ChessApp } from './app';
import { ENDGAMES, MATE_PUZZLES } from './lessons';
import { readSave, store } from './save';

const root = document.getElementById('app')!;
const save = readSave();
const persist = () => {
  store.save(save);
  setHubProgress('chess', { label: `已学 ${save.lessons.length}/6 种棋子`, value: save.lessons.length / 6 });
  metrics.refresh();
};
const metrics = registerMetrics('chess', [
  { id: 'pieces', label: '棋子学堂', value: () => ({ value: `${save.lessons.length} / 6`, frac: save.lessons.length / 6, detail: '已经完成的棋子训练' }) },
  { id: 'mates', label: '一步将死', value: () => ({ value: `${MATE_PUZZLES.filter((p) => save.puzzles.includes(p.id)).length} / 8`, frac: MATE_PUZZLES.filter((p) => save.puzzles.includes(p.id)).length / 8, detail: '找到的一步将死' }) },
  { id: 'endgames', label: '残局练习', value: () => ({ value: `${ENDGAMES.filter((p) => save.puzzles.includes(p.id)).length} / 8`, frac: ENDGAMES.filter((p) => save.puzzles.includes(p.id)).length / 8, detail: '将死过黑王的残局' }) },
]);
const app = new ChessApp(root, save, persist);
initShell({ game: 'chess', startGate: false, back: { compact: true, onClick: () => app.back() }, onBeforeLeave: persist, onPause: persist });
app.render(); root.dataset.ready = '1';
