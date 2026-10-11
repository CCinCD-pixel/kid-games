import { icon } from '@kit/ui';
import { emptyTray, readyToShip, trayStep, trayValue, type TrayAction } from '@engines/manip/tray';
import { openNumericPad } from '../ui/pad';
import { C1_NODES, c1AnswerIsCorrect, makeC1Items, type C1Item, type C1Node } from './c1';
import type { ActiveC1, OrbitSave } from '../orbit/save';

export interface C1Context {
  root: HTMLElement;
  save: OrbitSave;
  persist(): void;
  speak(line: string): void;
  go(screen: 'map' | 'certChapter' | 'certMission' | 'certFeedback' | 'certWrap'): void;
  mark(name: string, data: Record<string, unknown>): void;
  replay(): void;
}

let lastFinished: C1Node | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = content;
  return result;
}

function button(label: string, action: () => void, kind = ''): HTMLButtonElement {
  const result = el('button', `mb-button ${kind}`, label);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}

function header(ctx: C1Context, title: string, back: () => void): HTMLElement {
  const head = el('header', 'mb-header');
  const returnButton = button('', back, 'mb-icon-button');
  returnButton.innerHTML = icon('back');
  returnButton.setAttribute('aria-label', '返回');
  const heading = el('h1', '', title);
  const replay = button('', ctx.replay, 'mb-icon-button');
  replay.innerHTML = icon('replay');
  replay.setAttribute('aria-label', '再听一遍');
  head.append(returnButton, heading, replay);
  return head;
}

function nextC1Node(save: OrbitSave): C1Node | undefined {
  return C1_NODES.find((node) => !save.cert.completed.includes(node.id));
}

export function startC1Node(ctx: C1Context, node: C1Node): void {
  if (ctx.save.cert.active?.nodeId !== node.id) {
    ctx.save.cert.active = { nodeId: node.id, seed: Math.floor(Math.random() * 0x7fffffff), index: 0, draft: '', attempts: 0, firstTry: [] };
    ctx.persist();
  }
  ctx.go('certMission');
}

export function renderC1Chapter(ctx: C1Context): void {
  const main = el('main', 'mb-chapter mb-cert-chapter');
  main.append(header(ctx, '位值牌', () => ctx.go('map')), el('p', 'mb-chapter__intro', '读一读、搭一搭，替领航员验收晶体。'));
  const list = el('div', 'mb-node-list');
  const next = nextC1Node(ctx.save);
  for (const node of C1_NODES) {
    const done = ctx.save.cert.completed.includes(node.id);
    const accessible = done || node.id === next?.id;
    const entry = button('', () => startC1Node(ctx, node), `mb-node ${done ? 'mb-node--done' : ''}`);
    entry.disabled = !accessible;
    entry.append(el('span', 'mb-node__id', node.id.split('.').slice(1).join('.')), el('span', 'mb-node__name', node.title), el('span', 'mb-node__badge', done ? '★' : accessible ? '出发' : '待建'));
    list.append(entry);
  }
  main.append(list);
  ctx.root.append(main);
  ctx.speak('总工程师，位值牌的订单等你验收。');
}

function activeItem(ctx: C1Context): { active: ActiveC1; item: C1Item; node: C1Node; count: number } {
  const active = ctx.save.cert.active;
  const node = C1_NODES.find((entry) => entry.id === active?.nodeId);
  if (!active || !node) throw new Error('No active C1 task');
  const items = makeC1Items(node, active.seed);
  const item = items[active.index];
  if (!item) throw new Error('C1 item index is outside the task');
  return { active, item, node, count: items.length };
}

function crystal(): HTMLElement { return el('i', 'mb-crystal'); }
function rod(): HTMLElement { return el('i', 'mb-rod'); }

function pile(rods: number, crystals: number, bundles = 0): HTMLElement {
  const wrapper = el('div', 'mb-pile');
  const rodRow = el('div', 'mb-pile__rods');
  for (let i = 0; i < rods; i++) rodRow.append(rod());
  const crystalRow = el('div', 'mb-pile__crystals');
  for (let i = 0; i < (crystals < 10 ? crystals : crystals % 10); i++) crystalRow.append(crystal());
  for (let i = 0; i < Math.floor(crystals / 10) + bundles; i++) crystalRow.append(el('span', 'mb-crystal-bundle', '10'));
  wrapper.append(rodRow, crystalRow);
  return wrapper;
}

function buildStage(ctx: C1Context, active: ActiveC1): HTMLElement {
  const stage = el('div', 'mb-tray-stage');
  const state = active.tray ?? emptyTray({ rod: 9, crystal: 9 });
  active.tray = state;
  const count = el('strong', 'mb-tray-count', `${trayValue(state)}`);
  const contents = el('div', 'mb-tray-contents');
  const paint = () => {
    const value = active.tray!;
    count.textContent = String(trayValue(value));
    const visual = pile(value.rods, value.crystals + value.pressEntry, value.cutBundles);
    if (value.stagedCrystals) visual.append(el('span', 'mb-tray-staging', `暂存 ${value.stagedCrystals}`));
    contents.replaceChildren(visual);
  };
  paint();
  const actions = el('div', 'mb-tray-actions');
  const change = (action: TrayAction) => {
    const next = trayStep(active.tray!, action);
    if (!next) { ctx.speak('这个位置已经放满了，先整理晶体。'); return; }
    active.trayBefore = active.tray;
    active.tray = next;
    ctx.persist();
    paint();
  };
  actions.append(button('倒 1 根棒', () => change({ op: 'pour', cart: 'rod' })), button('倒 1 颗晶', () => change({ op: 'pour', cart: 'crystal' })));
  const tools = el('div', 'mb-tray-tools');
  tools.append(button('↶ 撤销', () => {
    if (!active.trayBefore) return;
    active.tray = active.trayBefore;
    active.trayBefore = undefined;
    ctx.persist();
    paint();
  }, 'mb-button--secondary'), button('重来', () => {
    active.tray = emptyTray({ rod: 9, crystal: 9 });
    active.trayBefore = undefined;
    ctx.persist();
    paint();
  }, 'mb-button--secondary'));
  stage.append(count, contents, actions, tools);
  return stage;
}

function comparisonStage(ctx: C1Context, item: Extract<C1Item, { family: 'pv2.compare' }>, active: ActiveC1): HTMLElement {
  const stage = el('div', 'mb-compare-stage');
  const row = el('div', 'mb-compare-row');
  const left = el('div', 'mb-compare-number', String(item.left));
  const right = el('div', 'mb-compare-number', String(item.right));
  const symbol = el('span', 'mb-compare-symbol', active.symbol ?? '?');
  row.append(left, symbol, right);
  const signs = el('div', 'mb-compare-signs');
  const signButtons: HTMLButtonElement[] = [];
  for (const sign of ['>', '<', '='] as const) {
    const choice = button(sign, () => {
      active.symbol = sign;
      symbol.textContent = sign;
      ctx.persist();
      signButtons.forEach((entry) => {
        const selected = entry.textContent === sign;
        entry.classList.toggle('mb-choice-selected', selected);
        entry.setAttribute('aria-pressed', String(selected));
      });
    }, active.symbol === sign ? 'mb-choice-selected' : '');
    choice.setAttribute('aria-pressed', String(active.symbol === sign));
    signButtons.push(choice);
    signs.append(choice);
  }
  const places = el('div', 'mb-compare-places');
  const placeButtons: HTMLButtonElement[] = [];
  for (const place of ['tens', 'ones'] as const) {
    const label = place === 'tens' ? '十位' : '个位';
    const choice = button(label, () => {
      active.decisive = place;
      ctx.persist();
      placeButtons.forEach((entry) => {
        const selected = entry.textContent === label;
        entry.classList.toggle('mb-choice-selected', selected);
        entry.setAttribute('aria-pressed', String(selected));
      });
    }, active.decisive === place ? 'mb-choice-selected' : '');
    choice.setAttribute('aria-pressed', String(active.decisive === place));
    placeButtons.push(choice);
    places.append(choice);
  }
  stage.append(el('p', 'mb-compare-prompt', '放好符号，再指出决定大小的数位'), row, signs, places);
  return stage;
}

function hundredChart(from: number): HTMLElement {
  const chart = el('div', 'mb-hundred-chart');
  for (let n = 1; n <= 100; n++) chart.append(el('span', n === from ? 'mb-hundred-chart__current' : '', String(n)));
  return chart;
}

function numericStage(item: C1Item): HTMLElement {
  const stage = el('div', 'mb-numeric-stage');
  if (item.family === 'pv2.read') {
    stage.append(el('p', '', '这批货一共有多少颗？'), pile(item.rods, item.crystals));
  } else if (item.family === 'pv2.step') {
    stage.append(el('p', '', `${item.from} ${item.delta > 0 ? '+' : '−'} ${Math.abs(item.delta)} = ?`), hundredChart(item.from));
  }
  return stage;
}

function splitStage(ctx: C1Context, item: Extract<C1Item, { family: 'pv2.split' }>, active: ActiveC1): HTMLElement {
  if (!active.tray) {
    active.tray = emptyTray();
    active.tray.rods = Math.floor(item.total / 10);
    active.tray.crystals = item.total % 10;
  }
  const stage = el('div', 'mb-tray-stage');
  const prompt = el('p', '', `${item.total} = ${item.rods} 个十 + ? 个一`);
  const contents = el('div', 'mb-tray-contents');
  const paint = () => {
    const state = active.tray!;
    contents.replaceChildren(pile(state.rods, state.crystals, state.cutBundles));
  };
  paint();
  const actions = el('div', 'mb-tray-actions');
  actions.append(button('切 1 根棒', () => {
    const next = trayStep(active.tray!, { op: 'cutRod' });
    if (!next || next.rods < item.rods) { ctx.speak('已经切够了，数一数散晶吧。'); return; }
    active.trayBefore = active.tray;
    active.tray = next;
    ctx.persist();
    paint();
  }), button('↶ 撤销', () => {
    if (!active.trayBefore) return;
    active.tray = active.trayBefore;
    active.trayBefore = undefined;
    ctx.persist();
    paint();
  }, 'mb-button--secondary'));
  stage.append(prompt, contents, actions);
  return stage;
}

export function renderC1Mission(ctx: C1Context): void {
  const { active, item, node, count } = activeItem(ctx);
  const main = el('main', 'mb-mission mb-cert-mission');
  main.append(header(ctx, node.title, () => { ctx.persist(); ctx.go('certChapter'); }));
  const pips = el('div', 'mb-progress');
  pips.setAttribute('aria-label', `第 ${active.index + 1} 题，共 ${count} 题`);
  for (let i = 0; i < count; i++) pips.append(el('i', `${i < active.index ? 'done' : ''} ${i === active.index ? 'now' : ''}`));
  main.append(pips);
  const order = el('section', 'mb-order');
  const orderTarget = item.family === 'pv2.build' ? String(item.target) : item.family === 'pv2.read' ? '?' : item.family === 'pv2.compare' ? '比大小' : item.family === 'pv2.split' ? '换着拆' : '走一步';
  order.append(el('span', 'mb-order__label', '基地订单'), el('strong', 'mb-order__target', orderTarget), el('span', 'mb-order__unit', `${active.index + 1}/${count}`));
  main.append(order);
  const work = el('section', 'mb-cert-work');
  if (item.family === 'pv2.build') work.append(buildStage(ctx, active));
  else if (item.family === 'pv2.compare') work.append(comparisonStage(ctx, item, active));
  else if (item.family === 'pv2.split') work.append(splitStage(ctx, item, active));
  else work.append(numericStage(item));
  main.append(work);
  const controls = el('div', 'mb-controls');
  if (item.family !== 'pv2.compare' && item.family !== 'pv2.build') {
    const display = button(active.draft || '填数字', () => {
      openNumericPad(ctx.root, {
        value: active.draft,
        onChange(value) { active.draft = value; display.textContent = value || '填数字'; ctx.persist(); },
        onSubmit: () => submitC1(ctx),
      });
    }, 'mb-answer');
    display.setAttribute('aria-label', `答案，当前${active.draft || '未填写'}`);
    controls.append(display);
  }
  controls.append(button('提示', () => {
    const hint = item.family === 'pv2.compare' ? '先比较十位，十位相同再看个位。' : item.family === 'pv2.split' ? '切开一根棒，就多出十颗。' : item.family === 'pv2.step' ? '在百数表上，向下一行就是多十。' : '一根棒是十颗。';
    ctx.speak(hint);
  }, 'mb-button--secondary'));
  controls.append(button('交付', () => submitC1(ctx), 'mb-button--primary'));
  main.append(controls, el('p', 'mb-subtitle', ''));
  ctx.root.append(main);
  ctx.speak(item.family === 'pv2.build' ? `把 ${item.target} 颗晶体装进晶槽。` : item.family === 'pv2.compare' ? '哪个数更大？还要找到决定大小的数位。' : item.family === 'pv2.read' ? '读一读，晶槽里一共有多少颗？' : item.family === 'pv2.split' ? '切开晶棒，数一数有多少颗散晶。' : '看看百数表，这一步落在哪个数？');
}

function submitC1(ctx: C1Context): void {
  const { active, item } = activeItem(ctx);
  if (item.family === 'pv2.compare' && (!active.symbol || !active.decisive)) { ctx.speak('先放符号，再点一个数位。'); return; }
  if (item.family !== 'pv2.compare' && item.family !== 'pv2.build' && active.draft === '') { ctx.speak('先把数字填上。'); return; }
  const correct = item.family === 'pv2.build' ? !!active.tray && readyToShip(active.tray) && trayValue(active.tray) === item.target
    : item.family === 'pv2.compare' ? c1AnswerIsCorrect(item, active.symbol!, active.decisive)
      : item.family === 'pv2.split' ? !!active.tray && active.tray.rods === item.rods && trayValue(active.tray) === item.total && c1AnswerIsCorrect(item, active.draft)
        : c1AnswerIsCorrect(item, active.draft);
  if (active.attempts === 0) active.firstTry.push(correct);
  active.lastCorrect = correct;
  ctx.persist();
  ctx.go('certFeedback');
}

export function renderC1Feedback(ctx: C1Context): void {
  const { active, item } = activeItem(ctx);
  const correct = active.lastCorrect === true;
  const main = el('main', 'mb-feedback');
  main.append(header(ctx, '订单回传', () => ctx.go('certMission')));
  const panel = el('div', 'mb-feedback__display');
  panel.append(el('span', 'mb-feedback__value', correct ? '✓' : '?'), el('span', 'mb-feedback__result', correct ? '验收成功' : '再看一眼'));
  if (!correct) panel.append(el('p', 'mb-feedback__delta', item.family === 'pv2.compare' ? '先看十位，再看个位。' : item.family === 'pv2.split' ? '切开一根棒，会多出十颗。' : '一根棒代表十颗。'));
  main.append(panel);
  const retry = !correct && active.attempts < 2;
  main.append(button(retry ? '再试一次' : '继续', () => {
    if (retry) {
      active.attempts++;
      active.lastCorrect = undefined;
      ctx.persist();
      ctx.go('certMission');
      return;
    }
    const { node, count } = activeItem(ctx);
    active.index++;
    active.attempts = 0;
    active.draft = '';
    active.symbol = undefined;
    active.decisive = undefined;
    active.tray = undefined;
    active.trayBefore = undefined;
    active.lastCorrect = undefined;
    if (active.index >= count) finishC1(ctx, node);
    else { ctx.persist(); ctx.go('certMission'); }
  }, 'mb-button--primary'));
  ctx.root.append(main);
  ctx.speak(correct ? '订单验收成功。' : '再看一眼，领航员陪你一起试。');
}

function finishC1(ctx: C1Context, node: C1Node): void {
  const active = ctx.save.cert.active!;
  if (!ctx.save.cert.completed.includes(node.id)) ctx.save.cert.completed.push(node.id);
  ctx.mark('mission-end', { node: node.id, firstTry: active.firstTry.filter(Boolean).length, hints: 0 });
  ctx.save.cert.active = undefined;
  lastFinished = node;
  ctx.persist();
  ctx.go('certWrap');
}

export function renderC1Wrap(ctx: C1Context): void {
  const node = lastFinished ?? C1_NODES.find((entry) => entry.id === ctx.save.cert.completed.at(-1))!;
  const main = el('main', 'mb-wrap');
  main.append(header(ctx, '建造完成', () => ctx.go('certChapter')), el('div', 'mb-wrap__star', '★'), el('h2', 'mb-wrap__title', node.title), el('p', 'mb-wrap__detail', `${node.buildingPart?.name ?? '位值牌'}已经装好。`), button('回基地', () => ctx.go('map'), 'mb-button--primary'));
  ctx.root.append(main);
  ctx.speak(`${node.title}完成了。`);
}
