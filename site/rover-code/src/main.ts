import { initShell } from '@kit/shell';
import { registerMetrics } from '@kit/metrics';
import { setHubProgress } from '@kit/progress';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { bindPress } from '@kit/ui';
import { LEVELS, levelById } from './model/levels';
import { doneCount, store, type RoverSave } from './save';
import { PlayScreen } from './screens/play';
import { RulesScreen } from './screens/rules';
import { frontier, renderMap } from './screens/map';
import { customLevel, renderEditor, renderMine } from './screens/mine';
import './styles.css';

const root = document.getElementById('app')!;
const save: RoverSave = store.load();
if (!save.chapter) save.chapter = 1;
let play: PlayScreen | RulesScreen | null = null;
let redrawMap: (() => void) | null = null;
type View = 'map' | 'mine' | 'edit' | 'play' | 'custom';
let view: View = 'map';

const metrics = registerMetrics('rover-code', [
  { id: 'levels', label: '月球车关卡', value: () => ({ value: `${doneCount(save)} / ${LEVELS.length}`, frac: doneCount(save) / LEVELS.length, detail: '已通过的关数（共八章）' }) },
]);
const persist = () => {
  store.save(save);
  setHubProgress('rover-code', { label: `第 ${frontier(save)} 章`, value: doneCount(save) / LEVELS.length });
  metrics.refresh();
};

function showMap(): void {
  play?.dispose(); play = null; view = 'map';
  save.chapter = frontier(save) > save.chapter && save.chapter === 1 ? frontier(save) : save.chapter;
  redrawMap = renderMap({
    root, save,
    pick: (id) => openLevel(id),
    pickChapter: (ch) => { save.chapter = ch; persist(); showMap(); },
    mine: showMine,
  });
}
/** 我的地图: the maps I drew, solved by me, for dad to play */
function showMine(): void {
  play?.dispose(); play = null; view = 'mine'; redrawMap = null;
  renderMine({ root, save, persist, back: showMap, test: (map, i) => openEditor(map, i), play: (i) => driveCustom(save.custom![i].map, i) });
}
function openEditor(map: string[], index: number): void {
  view = 'edit';
  renderEditor({ root, save, persist, list: showMine, drive: (m, i) => driveCustom(m, i) }, map, index);
}
function driveCustom(map: string[], index: number): void {
  play?.dispose(); view = 'custom'; redrawMap = null;
  const slot = index < 0 ? (save.custom?.length ?? 0) : index;
  const host = {
    root,
    onWin: () => {
      const list = (save.custom ??= []);
      list[Math.min(slot, list.length)] = { map, solved: true };
      persist(); shell.session?.mark('custom-map-solved', { slot });
    },
    goMap: showMine,
    openLevel: () => showMine(),
  };
  play = new PlayScreen(host, customLevel(slot, map));
}
function openLevel(id: string): void {
  const lv = levelById(id);
  if (!lv) return showMap();
  play?.dispose(); view = 'play';
  save.chapter = lv.ch;
  const host = {
    root,
    onWin: (l: { id: string }, stars: 1 | 2 | 3) => { const r = save.levels[l.id] ?? { stars: 0, tries: 0 }; save.levels[l.id] = { stars: Math.max(r.stars, stars), tries: r.tries + 1 }; persist(); shell.session?.mark('level-complete', { level: l.id, stars }); },
    goMap: showMap,
    openLevel,
  };
  play = lv.kind === 'rules' ? new RulesScreen(host, lv) : new PlayScreen(host, lv);
  redrawMap = null;
}

const shell = initShell({
  game: 'rover-code',
  startGate: { title: '玉兔编程', subtitle: '给月球车排指令卡', buttonLabel: '进入飞控中心' },
  back: { onClick: () => { if (view === 'custom' || view === 'edit') { showMine(); return true; } if (view === 'play' || view === 'mine') { showMap(); return true; } return false; } },
  onLayout: () => { play?.resize(); redrawMap?.(); },
});
bindPress(document);
showMap();
root.dataset.ready = '1';
void shell.ready.then(() => installKitSfx({ only: ['step', 'bump', 'place-piece', 'ui-pop', 'ui-tap', 'ui-locked', 'ui-toggle-on', 'launch', 'hint', 'lock-in', 'coin', 'star-1', 'star-2', 'star-3'] }));
