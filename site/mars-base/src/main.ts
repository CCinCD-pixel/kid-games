import { initShell } from '@kit/shell';
import { Narrator } from '@kit/narration';
import { bindPress, icon, shouldAutoSkip } from '@kit/ui';
import { createNumberLine, type NumberLineControl } from '@engines/manip/numberline';
import { ORBIT_NODES, evaluateOrbitItem, makeOrbitItems, scoreCalibration, type OrbitItem, type OrbitNode } from './orbit/model';
import { orbitStore, updateHub, type OrbitSave } from './orbit/save';
import { openNumericPad } from './ui/pad';
import { C1_NODES } from './cert/c1';
import { renderC1Chapter, renderC1Feedback, renderC1Mission, renderC1Wrap, startC1Node, type C1Context } from './cert/ui';
import './styles.css';

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const test = params.get('test') === '1';
let save: OrbitSave = orbitStore.load();
let line: NumberLineControl | null = null;
let answer = '';
let subtitle: HTMLElement | null = null;
type Route = 'onboarding' | 'map' | 'chapter' | 'mission' | 'feedback' | 'wrap' | 'certChapter' | 'certMission' | 'certFeedback' | 'certWrap';
let route: Route = 'map';
let currentZone = 'orbit';
let wrappedNode: OrbitNode | null = null;
const voice = new Narrator({ onCue: (cue) => { if (subtitle && cue) subtitle.textContent = cue.text; } });

function persist(): void {
  orbitStore.save(save);
  updateHub(save);
}

const shell = initShell({
  game: 'mars-base',
  startGate: test ? false : { title: '火星基地', subtitle: '祝融基地，等待总工程师', buttonLabel: '进入基地' },
  back: { compact: true },
  onBeforeLeave: persist,
  onPause: persist,
});
root.dataset.ready = '1';
bindPress(document);

function speak(text: string): void { void voice.say(text, { interrupt: true }); }
function makeButton(label: string, action: () => void, kind = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mb-button ${kind}`;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}
function head(title: string, back?: () => void): HTMLElement {
  const header = document.createElement('header');
  header.className = 'mb-header';
  if (back) {
    const button = makeButton('', back, 'mb-icon-button');
    button.setAttribute('aria-label', '返回基地');
    button.title = '返回基地';
    button.innerHTML = icon('back');
    header.append(button);
  } else header.append(document.createElement('span'));
  const heading = document.createElement('h1');
  heading.textContent = title;
  header.append(heading);
  const repeat = makeButton('', () => { void voice.replay(); }, 'mb-icon-button');
  repeat.setAttribute('aria-label', '再听一遍');
  repeat.title = '再听一遍';
  repeat.innerHTML = icon('replay');
  header.append(repeat);
  return header;
}
function text(tag: 'div' | 'p' | 'h2' | 'span' | 'strong', value: string, className = ''): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
const c1Context: C1Context = {
  root,
  get save() { return save; },
  persist,
  speak,
  go: (screen) => show(screen),
  mark: (name, data) => { shell.session?.mark(name, data); },
  replay: () => { void voice.replay(); },
};

function show(next: Route): void {
  line?.destroy();
  line = null;
  route = next;
  root.dataset.screen = next;
  subtitle = null;
  root.replaceChildren();
  if (next === 'onboarding') renderOnboarding();
  if (next === 'map') renderMap();
  if (next === 'chapter') renderChapter();
  if (next === 'mission') renderMission();
  if (next === 'feedback') renderFeedback();
  if (next === 'wrap') renderWrap();
  if (next === 'certChapter') renderC1Chapter(c1Context);
  if (next === 'certMission') renderC1Mission(c1Context);
  if (next === 'certFeedback') renderC1Feedback(c1Context);
  if (next === 'certWrap') renderC1Wrap(c1Context);
}

function renderOnboarding(): void {
  const stage = document.createElement('main');
  stage.className = 'mb-onboarding';
  const scene = document.createElement('div');
  scene.className = 'mb-lander-scene';
  scene.innerHTML = '<div class="mb-planet"></div><div class="mb-lander"><i></i><i></i><i></i></div><div class="mb-robot"><b>● ●</b></div>';
  const callout = text('p', '总工程师，先把第一面旗放上轨道。', 'mb-onboarding__text');
  stage.append(scene, callout, makeButton('出发', () => { save.onboardingDone = true; persist(); show('map'); }, 'mb-button--primary'));
  root.append(stage);
  subtitle = callout;
  speak(callout.textContent ?? '');
}

const zoneNames: Record<string, string> = { orbit: '轨道站', puzzle: '谜题舱', cert: '认证站', vault: '千晶大仓', race: '火箭赛道', factory: '生产线', balance: '称重台', supply: '补给站', clock: '任务时刻表' };
const zoneSymbols: Record<string, string> = { orbit: '◎', puzzle: '✧', cert: '✦', vault: '▣', race: '▲', factory: '⚙', balance: '⚖', supply: '◆', clock: '◷' };

function nextOrbitNode(): OrbitNode | undefined {
  return ORBIT_NODES.find((node) => !save.completed.includes(node.id) && !save.skipped.includes(node.id));
}

function renderMap(): void {
  const main = document.createElement('main');
  main.className = 'mb-map';
  const top = document.createElement('div');
  top.className = 'mb-map__top';
  top.append(head('祝融基地'), text('p', `${save.completed.length} 座轨道设施已建成`, 'mb-map__status'));
  const landscape = document.createElement('div');
  landscape.className = 'mb-landscape';
  const sky = document.createElement('div');
  sky.className = 'mb-sky';
  sky.innerHTML = '<span class="mb-sky__sun"></span><span class="mb-sky__moon"></span>';
  landscape.append(sky);
  const zones = document.createElement('div');
  zones.className = 'mb-zones';
  Object.keys(zoneNames).forEach((id) => {
    const available = id === 'orbit' || id === 'cert';
    const button = makeButton('', () => { if (available) { currentZone = id; show(id === 'cert' ? 'certChapter' : 'chapter'); } }, `mb-zone mb-zone--${id}`);
    button.disabled = !available;
    button.setAttribute('aria-label', `${zoneNames[id]}${available ? '' : '建设中'}`);
    button.append(text('span', zoneSymbols[id], 'mb-zone__symbol'), text('span', zoneNames[id], 'mb-zone__name'));
    if (!available) button.append(text('span', '建设中', 'mb-zone__state'));
    zones.append(button);
  });
  landscape.append(zones);
  const foot = document.createElement('div');
  foot.className = 'mb-map__foot';
  const next = nextOrbitNode();
  foot.append(makeButton(next ? `继续 · ${next.title}` : '轨道已完成', () => { if (next) startNode(next); }, 'mb-button--primary'));
  main.append(top, landscape, foot);
  root.append(main);
  speak(next ? `总工程师，${next.title}在等你。` : '轨道站的任务完成了。');
}

function renderChapter(): void {
  if (currentZone === 'cert') { renderC1Chapter(c1Context); return; }
  const main = document.createElement('main');
  main.className = 'mb-chapter';
  main.append(head(zoneNames[currentZone], () => show('map')));
  const intro = text('p', '沿着轨道，一站一站把卫星送出去。', 'mb-chapter__intro');
  main.append(intro);
  const list = document.createElement('div');
  list.className = 'mb-node-list';
  const next = nextOrbitNode();
  for (const node of ORBIT_NODES) {
    const finished = save.completed.includes(node.id);
    const skipped = save.skipped.includes(node.id);
    const accessible = finished || skipped || node.id === next?.id;
    const button = makeButton('', () => startNode(node), `mb-node ${finished ? 'mb-node--done' : ''}`);
    button.disabled = !accessible;
    button.append(text('span', node.id.split('.').slice(1).join('.'), 'mb-node__id'), text('span', node.title, 'mb-node__name'), text('span', finished ? '★' : skipped ? '可选' : accessible ? '出发' : '待建', 'mb-node__badge'));
    list.append(button);
  }
  main.append(list);
  root.append(main);
  subtitle = intro;
  speak(intro.textContent ?? '');
}

function startNode(node: OrbitNode): void {
  if (!save.active || save.active.nodeId !== node.id) {
    save.active = { nodeId: node.id, seed: Math.floor(Math.random() * 0x7fffffff), index: 0, attempts: 0, estimates: [], firstTry: [] };
    persist();
  }
  show('mission');
}

function activeContext(): { node: OrbitNode; item: OrbitItem; count: number } {
  const active = save.active;
  const node = ORBIT_NODES.find((entry) => entry.id === active?.nodeId);
  if (!active || !node) throw new Error('No active orbit node');
  const items = makeOrbitItems(node, active.seed);
  const item = items[active.index];
  if (!item) throw new Error('Orbit item index is outside the task');
  return { node, item, count: items.length };
}

function renderMission(): void {
  const { node, item, count } = activeContext();
  const active = save.active!;
  answer = active.draft === undefined ? '' : String(active.draft);
  const main = document.createElement('main');
  main.className = 'mb-mission';
  main.append(head(node.title, () => { persist(); show('chapter'); }));
  const progress = document.createElement('div');
  progress.className = 'mb-progress';
  progress.setAttribute('aria-label', `第 ${active.index + 1} 面，共 ${count} 面`);
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('i');
    if (i < active.index) dot.classList.add('done');
    if (i === active.index) dot.classList.add('now');
    progress.append(dot);
  }
  main.append(progress);
  const zoomStage = active.zoomStage ?? 0;
  const instruction = item.family === 'nl.read' ? '读出旗子所在的位置' : item.family === 'nl.zoom' ? ['找到目标在哪个百段', '再找到目标在哪个十段', '精确插旗'][zoomStage] : item.family === 'nl.calib' ? '把卫星旗放在轨道上' : '把旗插在轨道上';
  const order = document.createElement('section');
  order.className = 'mb-order';
  order.append(text('span', '轨道订单', 'mb-order__label'), text('strong', item.family === 'nl.read' ? '?' : String(item.target), 'mb-order__target'), text('span', item.family === 'nl.read' ? '读旗位置' : item.family === 'nl.zoom' ? ['选百段', '选十段', '插旗'][zoomStage] : `从 0 到 ${item.length}`, 'mb-order__unit'));
  main.append(order);
  const railArea = document.createElement('section');
  railArea.className = 'mb-rail-area';
  const railHost = document.createElement('div');
  railHost.className = 'mb-rail-host';
  railArea.append(text('h2', instruction, 'mb-rail-area__title'), railHost);
  const rangeStart = item.family === 'nl.zoom' && zoomStage > 0 ? Math.floor(item.target / (zoomStage === 1 ? 100 : 10)) * (zoomStage === 1 ? 100 : 10) : 0;
  const rangeSize = item.family === 'nl.zoom' ? [1000, 100, 10][zoomStage] : item.length;
  const anchors = item.family === 'nl.zoom' ? Array.from({ length: 11 }, (_, i) => rangeStart + i * rangeSize / 10) : item.anchors;
  line = createNumberLine(railHost, { min: rangeStart, max: rangeStart + rangeSize, anchors, value: item.family === 'nl.read' ? { flag: item.target } : { flag: active.draft }, readOnly: item.family === 'nl.read' });
  line.on('change', (v) => { if (item.family !== 'nl.read') { active.draft = v.flag; persist(); } });
  main.append(railArea);
  const controls = document.createElement('div');
  controls.className = 'mb-controls';
  if (item.family === 'nl.read') {
    const display = makeButton(answer || '填数字', () => openReadPad(display, active), 'mb-answer');
    display.setAttribute('aria-label', `旗子所在的位置，当前${answer || '未填写'}`);
    controls.append(display);
  } else controls.append(makeButton('↶ 撤销', () => { line?.undo(); }, 'mb-button--secondary'));
  controls.append(makeButton('提示', () => {
    const hint = item.family === 'nl.read' ? `先找旗子左右两个刻度，再估计中间的位置。` : `看看 ${item.target} 离 ${item.anchors[0]} 和 ${item.anchors.at(-1)} 哪边更近。`;
    speak(hint);
  }, 'mb-button--secondary'));
  controls.append(makeButton(item.family === 'nl.zoom' && zoomStage < 2 ? '放大' : '交付', submit, 'mb-button--primary'));
  main.append(controls);
  subtitle = text('p', '', 'mb-subtitle');
  main.append(subtitle);
  root.append(main);
  speak(item.family === 'nl.read' ? '读一读，这面旗在轨道的哪个位置？' : item.family === 'nl.zoom' ? `${instruction}，目标是 ${item.target}。` : `请把旗放在 ${item.target}。`);
}

function openReadPad(display: HTMLButtonElement, active: NonNullable<OrbitSave['active']>): void {
  openNumericPad(root, {
    value: answer,
    onChange(value) {
      answer = value;
      display.textContent = answer || '填数字';
      display.setAttribute('aria-label', `旗子所在的位置，当前${answer || '未填写'}`);
      active.draft = answer === '' ? undefined : Number(answer);
      persist();
    },
    onSubmit: submit,
  });
}

function submit(): void {
  const { item } = activeContext();
  const active = save.active!;
  const value = item.family === 'nl.read' ? Number(answer) : line?.value.flag;
  if (value === undefined || (item.family === 'nl.read' && answer.trim() === '') || !Number.isInteger(value) || value < 0 || value > item.length) {
    speak('先放好旗，或者填好数字。');
    return;
  }
  if (item.family === 'nl.zoom' && (active.zoomStage ?? 0) < 2) {
    const size = active.zoomStage === 1 ? 10 : 100;
    if (Math.floor(Math.min(value, 999) / size) !== Math.floor(item.target / size)) {
      speak('目标不在这一段，再找找。');
      return;
    }
    active.zoomStage = active.zoomStage === 1 ? 2 : 1;
    active.draft = undefined;
    persist();
    show('mission');
    return;
  }
  const judgment = evaluateOrbitItem(item, value);
  if (active.attempts === 0) active.firstTry.push(judgment === 'exact');
  active.estimates.push(value);
  active.draft = undefined;
  persist();
  show('feedback');
}

function renderFeedback(): void {
  const { item } = activeContext();
  const active = save.active!;
  const value = active.estimates.at(-1)!;
  const judgment = evaluateOrbitItem(item, value);
  const main = document.createElement('main');
  main.className = 'mb-feedback';
  main.append(head('轨道回传'));
  const display = document.createElement('div');
  display.className = 'mb-feedback__display';
  display.append(text('span', `${value}`, 'mb-feedback__value'), text('span', item.family === 'nl.calib' ? '卫星入轨' : judgment === 'exact' ? '到站了' : judgment === 'close' ? '很接近' : '再看一眼', 'mb-feedback__result'));
  if (item.family !== 'nl.calib') display.append(text('p', `目标 ${item.target} · 相差 ${Math.abs(item.target - value)}`, 'mb-feedback__delta'));
  main.append(display);
  const retry = judgment === 'retry' && item.family !== 'nl.calib' && active.attempts < 2;
  const button = makeButton(retry ? '再放一次' : '继续', () => {
    if (retry) {
      active.attempts += 1;
      persist();
      show('mission');
      return;
    }
    active.index += 1;
    active.attempts = 0;
    active.zoomStage = 0;
    persist();
    const { node } = activeContextAtNode();
    if (active.index >= makeOrbitItems(node, active.seed).length) finishNode(node);
    else show('mission');
  }, 'mb-button--primary');
  main.append(button);
  subtitle = text('p', '', 'mb-subtitle');
  main.append(subtitle);
  root.append(main);
  speak(item.family === 'nl.calib' ? '卫星入轨。' : judgment === 'exact' ? '到站了！' : judgment === 'close' ? '很接近，继续出发。' : '看一眼目标，再试试。');
}

function activeContextAtNode(): { node: OrbitNode } {
  const node = ORBIT_NODES.find((entry) => entry.id === save.active?.nodeId);
  if (!node) throw new Error('Missing orbit node');
  return { node };
}

function finishNode(node: OrbitNode): void {
  const active = save.active!;
  if (node.kind === 'calib') {
    const items = makeOrbitItems(node, active.seed);
    const score = scoreCalibration(items[0].length, items.map((item) => item.target), active.estimates);
    save.calibrations.push({ nodeId: node.id, at: Date.now(), score });
    shell.session?.mark('orbit-calib', { L: items[0].length, r2: score.r2, slope: score.slope, pae: score.pae });
    if (node.id === 'orbit.O1.0' && score.pass) save.skipped.push(...ORBIT_NODES.filter((entry) => entry.chapter === 'O1' && entry.id !== node.id).map((entry) => entry.id));
  }
  if (!save.completed.includes(node.id)) save.completed.push(node.id);
  shell.session?.mark('mission-end', { node: node.id, firstTry: active.firstTry.filter(Boolean).length, hints: 0 });
  save.active = undefined;
  wrappedNode = node;
  persist();
  show('wrap');
}

function renderWrap(): void {
  const node = wrappedNode ?? ORBIT_NODES.find((entry) => entry.id === save.completed.at(-1))!;
  const main = document.createElement('main');
  main.className = 'mb-wrap';
  main.append(head('建造完成'));
  const badge = text('div', '★', 'mb-wrap__star');
  const title = text('h2', node.title, 'mb-wrap__title');
  const detail = text('p', `${node.buildingPart?.name ?? '轨道'}已装上基地。`, 'mb-wrap__detail');
  main.append(badge, title, detail, makeButton('回基地', () => show('map'), 'mb-button--primary'));
  subtitle = detail;
  root.append(main);
  speak(`${node.title}完成了，${node.buildingPart?.name ?? '轨道'}已经装上基地。`);
}

void shell.ready.then(() => {
  if (shouldAutoSkip()) save.onboardingDone = true;
  if (params.get('node') && test) {
    const node = ORBIT_NODES.find((entry) => entry.id === params.get('node'));
    if (node) { startNode(node); return; }
    const c1 = C1_NODES.find((entry) => entry.id === params.get('node'));
    if (c1) { startC1Node(c1Context, c1); return; }
  }
  if (save.active && ORBIT_NODES.some((node) => node.id === save.active?.nodeId)) show('mission');
  else if (save.cert.active && C1_NODES.some((node) => node.id === save.cert.active?.nodeId)) show('certMission');
  else show(save.onboardingDone ? 'map' : 'onboarding');
});

if (test) (window as unknown as { __mars: object }).__mars = { get save() { return save; }, get route() { return route; }, show, startNode };
