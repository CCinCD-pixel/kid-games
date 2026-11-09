import { initShell } from '@kit/shell';
import { registerMetrics } from '@kit/metrics';
import { setHubProgress } from '@kit/progress';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { bindPress } from '@kit/ui';
import { LEVELS, levelById } from './model/levels';
import { doneCount, store, type RoverSave } from './save';
import { PlayScreen } from './screens/play';
import { frontier, renderMap } from './screens/map';
import './styles.css';

const root = document.getElementById('app')!;
const save: RoverSave = store.load();
if (!save.chapter) save.chapter = 1;
let play: PlayScreen | null = null;
let redrawMap: (() => void) | null = null;

const metrics = registerMetrics('rover-code', [
  { id: 'levels', label: '月球车关卡', value: () => ({ value: `${doneCount(save)} / ${LEVELS.length}`, frac: doneCount(save) / LEVELS.length, detail: '已通过的关数（前四章）' }) },
]);
const persist = () => {
  store.save(save);
  setHubProgress('rover-code', { label: `第 ${frontier(save)} 章`, value: doneCount(save) / LEVELS.length });
  metrics.refresh();
};

function showMap(): void {
  play?.dispose(); play = null;
  save.chapter = frontier(save) > save.chapter && save.chapter === 1 ? frontier(save) : save.chapter;
  redrawMap = renderMap({
    root, save,
    pick: (id) => openLevel(id),
    pickChapter: (ch) => { save.chapter = ch; persist(); showMap(); },
  });
}
function openLevel(id: string): void {
  const lv = levelById(id);
  if (!lv) return showMap();
  play?.dispose();
  save.chapter = lv.ch;
  play = new PlayScreen({
    root,
    onWin: (l, stars) => { const r = save.levels[l.id] ?? { stars: 0, tries: 0 }; save.levels[l.id] = { stars: Math.max(r.stars, stars), tries: r.tries + 1 }; persist(); shell.session?.mark('level-complete', { level: l.id, stars }); },
    goMap: showMap,
    openLevel,
  }, lv);
  redrawMap = null;
}

const shell = initShell({
  game: 'rover-code',
  startGate: { title: '玉兔编程', subtitle: '给月球车排指令卡', buttonLabel: '进入飞控中心' },
  back: { onClick: () => { if (play) { showMap(); return true; } return false; } },
  onLayout: () => { play?.resize(); redrawMap?.(); },
});
bindPress(document);
showMap();
root.dataset.ready = '1';
void shell.ready.then(() => installKitSfx({ only: ['step', 'bump', 'place-piece', 'ui-pop', 'ui-tap', 'ui-locked', 'ui-toggle-on', 'launch', 'hint', 'lock-in', 'coin', 'star-1', 'star-2', 'star-3'] }));
