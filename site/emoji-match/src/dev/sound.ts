/**
 * `?dev=sound` audition board (spec §7.5, release gate R3): every semantic sound of the game as a
 * button (single play, or 连播 = all in a row), the chain ladder and the coin ladder, the route
 * music on/off, and three scripted mix scenes that stack sounds the way a real move does:
 *   ① a 9×9 board, one move, an 8-round cascade (swap → clears + ladder + landings + coin flights
 *      + a special made + a rocket fired + "goal done"),
 *   ② an OO board clear (combo + two orbs + board-clear + a wave of landings and coins),
 *   ③ a full win show (stars, level-complete, 星晶号加速 with 15 bonus rockets, jingle).
 * Dad listens on the iPad (R3); here it is only exercised silently (kit automute under automation).
 * Lazy chunk: absent unless `?dev=sound`.
 */
import { pentatonic } from '@kit/ui/sfx-bridge';
import { bonusRocket, chime, coin, initAudio, play, routeMusic, textureCount } from '../audio';

const GROUPS: { title: string; names: string[] }[] = [
  { title: '界面（设计系统）', names: ['ui-tap', 'ui-press', 'ui-open', 'ui-close', 'ui-back', 'ui-locked', 'ui-notify', 'ui-select', 'ui-confirm'] },
  { title: '棋盘基本', names: ['em-select', 'em-swap', 'em-swap-bad', 'match-clear', 'em-land', 'shuffle', 'hint'] },
  { title: '道具与组合技', names: ['em-special-make', 'em-rocket', 'em-bomb', 'em-drone', 'em-orb', 'em-combo', 'em-board-clear'] },
  { title: '障碍与目标', names: ['em-crate-paper', 'em-crate-metal', 'em-crate-break', 'em-ice-crack', 'em-ice-break', 'em-dust', 'coin', 'em-goal-done'] },
  { title: '工具', names: ['em-drill', 'em-ion', 'em-tractor'] },
  { title: '结果与到站', names: ['star-1', 'star-2', 'star-3', 'level-complete', 'jingle-win', 'jingle-round-over', 'chapter-complete', 'unlock', 'lock-in', 'em-bonus-rocket'] },
  { title: '领航员', names: ['blip-happy', 'blip-think', 'blip-talk'] },
];

type Step = [ms: number, fn: () => void];
let timers: number[] = [];
function stopAll(): void { timers.forEach((t) => window.clearTimeout(t)); timers = []; }
function run(steps: Step[]): number {
  stopAll();
  for (const [ms, fn] of steps) timers.push(window.setTimeout(fn, ms));
  return steps.reduce((a, [ms]) => Math.max(a, ms), 0);
}

/** ① 9×9, one move, 8 rounds: the director's timing (≈420 ms per round, landings throttled to 60 ms) */
function sceneCascade(): Step[] {
  const s: Step[] = [[0, () => play('em-swap')]];
  let t = 220, coins = 0;
  for (let k = 0; k < 8; k += 1) {
    s.push([t, () => { play('match-clear', { rate: 1 + 0.04 * k }); chime(k); }]);
    const n = 3 + (k % 3);
    for (let j = 0; j < n; j += 1) { const c = coins; s.push([t + 120 + j * 45, () => coin(c)]); coins += 1; }
    if (k === 2) s.push([t + 60, () => play('em-special-make')]);
    if (k === 4) s.push([t + 30, () => play('em-rocket')]);
    if (k === 5) s.push([t + 40, () => play('em-ice-break')]);
    if (k === 6) s.push([t + 40, () => play('em-crate-metal')]);
    for (let j = 0; j < 4; j += 1) s.push([t + 230 + j * 61, () => play('em-land', { gain: 0.5 })]);
    t += 420;
  }
  s.push([t + 80, () => play('em-goal-done')]);
  return s;
}
/** ② OO: combo call-out, two orbs, board clear, a wave of landings and coins */
function sceneBoardClear(): Step[] {
  const s: Step[] = [[0, () => play('em-swap')], [180, () => play('em-combo')], [220, () => play('em-orb')], [420, () => play('em-orb', { rate: 1.12 })], [700, () => play('em-board-clear')]];
  for (let j = 0; j < 24; j += 1) s.push([760 + j * 38, () => coin(j % 12)]);
  for (let j = 0; j < 12; j += 1) s.push([1500 + j * 62, () => play('em-land', { gain: 0.5 })]);
  s.push([2400, () => { play('match-clear', { rate: 1.04 }); chime(1); }]);
  return s;
}
/** ③ win show: stars land, then 15 bonus rockets climb the pentatonic ladder */
function sceneWin(): Step[] {
  const s: Step[] = [[0, () => play('em-goal-done')], [520, () => play('star-1')], [940, () => play('star-2')], [1360, () => play('star-3')], [1480, () => play('level-complete', { gain: 0.8 })]];
  for (let j = 0; j < 15; j += 1) s.push([2200 + j * 140, () => bonusRocket(j)]);
  s.push([2200 + 15 * 140 + 300, () => play('jingle-win', { gain: 0.7 })]);
  return s;
}

export async function mountSoundBoard(root: HTMLElement): Promise<void> {
  await initAudio();
  const el = document.createElement('div');
  el.className = 'em-style em-sound';
  root.append(el);
  el.innerHTML = `<h1 class="em-sound__h">星晶消消乐 · 试听板</h1>
    <p class="em-sound__note">单播：点名字。连播：一组里从左到右。混音场景按真实一步的节奏叠放声音。听的时候注意：响度是否平衡、有没有爆音或刺耳的高频、同时发声会不会糊。</p>`;
  const row = (title: string) => { const h = document.createElement('h2'); h.textContent = title; const r = document.createElement('div'); r.className = 'em-style__row'; el.append(h, r); return r; };
  const btn = (r: HTMLElement, label: string, fn: () => void, cls = '') => {
    const b = document.createElement('button'); b.className = `xg-btn xg-btn--secondary xg-btn--sm em-sound__btn ${cls}`; b.textContent = label;
    b.addEventListener('click', fn); r.append(b); return b;
  };
  const scenes = row('混音场景');
  btn(scenes, '① 9×9 一步 8 轮连锁', () => run(sceneCascade()), 'is-scene');
  btn(scenes, '② OO 全屏清空', () => run(sceneBoardClear()), 'is-scene');
  btn(scenes, '③ 过关演出（15 枚小火箭）', () => run(sceneWin()), 'is-scene');
  btn(scenes, '停', stopAll);
  const music = row('音乐（只在航线图、地图、机库、到站）');
  let on = false;
  const mb = btn(music, '航线图音乐：关', () => { on = !on; routeMusic(on); mb.textContent = `航线图音乐：${on ? '开' : '关'}`; });
  const ladders = row('连锁音阶 / 收集音阶（五声，C6 起）');
  for (let k = 0; k < 10; k += 1) btn(ladders, `连锁 ${k + 1}`, () => chime(k));
  btn(ladders, '音阶上行', () => run(Array.from({ length: 10 }, (_, k): Step => [k * 260, () => chime(k)])));
  btn(ladders, '收集 ×12', () => run(Array.from({ length: 12 }, (_, k): Step => [k * 70, () => coin(k)])));
  for (const g of GROUPS) {
    const r = row(g.title);
    btn(r, '连播', () => run(g.names.map((n, k): Step => [k * 650, () => play(n)])), 'is-chain');
    for (const n of g.names) btn(r, n, () => play(n));
  }
  const meta = document.createElement('p');
  meta.className = 'em-sound__note em-sound__meta';
  meta.textContent = `质感层（Kenney 采样）已加载 ${textureCount()} / 13 · 五声音阶半音：${Array.from({ length: 10 }, (_, k) => pentatonic(k)).join(' ')}`;
  el.append(meta);
}
