import { icon } from '@kit/ui';
import { emptyTray, readyToShip, trayStep, trayValue, type TrayAction, type TrayState } from '@engines/manip/tray';
import { openNumericPad } from '../ui/pad';
import type { ActiveAddition, OrbitSave } from '../orbit/save';
import { ADDITION_NODES, makeAdditionItems, type AdditionItem, type AdditionNode } from './model';

export interface AdditionContext {
  root: HTMLElement;
  save: OrbitSave;
  persist(): void;
  speak(line: string): void;
  go(screen: 'map' | 'certOverview' | 'addChapter' | 'addMission' | 'addFeedback' | 'addWrap'): void;
  mark(name: string, data: Record<string, unknown>): void;
  replay(): void;
}

let lastFinished: AdditionNode | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', content = ''): HTMLElementTagNameMap[K] {
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

function header(ctx: AdditionContext, title: string, back: () => void): HTMLElement {
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

export function startAdditionNode(ctx: AdditionContext, node: AdditionNode): void {
  ctx.save.activeArea = 'addition';
  if (ctx.save.addition.active?.nodeId !== node.id) {
    ctx.save.addition.active = { nodeId: node.id, seed: Math.floor(Math.random() * 0x7fffffff), index: 0, draft: '', attempts: 0, firstTry: [] };
  }
  ctx.persist();
  ctx.go('addMission');
}

export function renderAdditionChapter(ctx: AdditionContext): void {
  const main = el('main', 'mb-chapter');
  main.append(header(ctx, '加法牌', () => ctx.go('certOverview')), el('p', 'mb-chapter__intro', '把晶体装好，再替基地验算订单。'));
  const list = el('div', 'mb-node-list');
  const next = ADDITION_NODES.find((node) => !ctx.save.addition.completed.includes(node.id));
  for (const node of ADDITION_NODES) {
    const done = ctx.save.addition.completed.includes(node.id);
    const accessible = done || node.id === next?.id;
    const entry = button('', () => startAdditionNode(ctx, node), `mb-node ${done ? 'mb-node--done' : ''}`);
    entry.disabled = !accessible;
    entry.append(el('span', 'mb-node__id', node.id.split('.').slice(1).join('.')), el('span', 'mb-node__name', node.title), el('span', 'mb-node__badge', done ? '★' : accessible ? '出发' : '待建'));
    list.append(entry);
  }
  main.append(list);
  ctx.root.append(main);
  ctx.speak('加法牌正在等你。先把晶体合到一起。');
}

function activeItem(ctx: AdditionContext): { active: ActiveAddition; item: AdditionItem; node: AdditionNode; count: number } {
  const active = ctx.save.addition.active;
  const node = ADDITION_NODES.find((entry) => entry.id === active?.nodeId);
  if (!active || !node) throw new Error('No active addition task');
  const items = makeAdditionItems(node, active.seed);
  const item = items[active.index];
  if (!item) throw new Error('Addition item index is outside the task');
  return { active, item, node, count: items.length };
}

function pile(state: TrayState): HTMLElement {
  const wrapper = el('div', 'mb-pile');
  const rods = el('div', 'mb-pile__rods');
  for (let i = 0; i < state.rods; i++) rods.append(el('i', 'mb-rod'));
  const crystals = el('div', 'mb-pile__crystals');
  for (let i = 0; i < state.crystals + state.pressEntry; i++) crystals.append(el('i', 'mb-crystal'));
  wrapper.append(rods, crystals);
  return wrapper;
}

function cargoPile(rods: number, crystals: number): HTMLElement {
  const state = emptyTray();
  state.rods = rods;
  state.crystals = crystals;
  return pile(state);
}

function ensureTray(active: ActiveAddition, item: AdditionItem): TrayState {
  if (!active.tray) {
    active.tray = emptyTray({ rod: Math.floor(item.b / 10), crystal: item.b % 10 });
    active.tray.rods = Math.floor(item.a / 10);
    active.tray.crystals = item.a % 10;
  }
  return active.tray;
}

function trayStage(ctx: AdditionContext, active: ActiveAddition, item: AdditionItem): HTMLElement {
  ensureTray(active, item);
  const stage = el('div', 'mb-addition-stage');
  const summary = el('div', 'mb-addition-summary');
  const current = el('section', 'mb-addition-bin');
  const waiting = el('section', 'mb-addition-bin');
  const currentLabel = el('strong', '', '晶槽里');
  const waitingLabel = el('strong', '', '待装货');
  current.append(currentLabel);
  waiting.append(waitingLabel);
  summary.append(current, waiting);
  const actions = el('div', 'mb-addition-actions');
  const pourRod = button('倒 1 根棒', () => change({ op: 'pour', cart: 'rod' }));
  const pourCrystal = button('倒 1 颗晶', () => change({ op: 'pour', cart: 'crystal' }));
  const press = button('压成棒', () => change({ op: 'press' }), 'mb-button--primary');
  const undo = button('撤销', () => {
    if (!active.trayBefore) return;
    active.tray = active.trayBefore;
    active.trayBefore = undefined;
    ctx.persist();
    paint();
  }, 'mb-button--secondary');
  function change(action: TrayAction): void {
    const next = trayStep(active.tray!, action);
    if (!next) { ctx.speak('先看看晶槽还有没有位置。'); return; }
    active.trayBefore = active.tray;
    active.tray = next;
    ctx.persist();
    paint();
  }
  function paint(): void {
    const state = active.tray!;
    currentLabel.textContent = `晶槽里 · ${trayValue(state)}`;
    waitingLabel.textContent = `待装货 · ${state.carts.rod * 10 + state.carts.crystal}`;
    current.replaceChildren(currentLabel, pile(state));
    waiting.replaceChildren(waitingLabel, cargoPile(state.carts.rod, state.carts.crystal));
    pourRod.disabled = state.carts.rod === 0;
    pourCrystal.disabled = state.carts.crystal === 0 || state.pressEntry === 1;
    press.disabled = state.pressEntry === 0;
    undo.disabled = !active.trayBefore;
  }
  actions.append(pourRod, pourCrystal, press, undo);
  stage.append(summary, actions);
  paint();
  return stage;
}

function numericInput(ctx: AdditionContext, active: ActiveAddition, field: 'draft' | 'firstPart' | 'secondPart', label: string): HTMLButtonElement {
  const value = String(active[field] ?? '');
  const display = button(value || label, () => {
    openNumericPad(ctx.root, {
      value: String(active[field] ?? ''), maxLength: field === 'draft' ? 2 : 1,
      onChange(next) {
        if (field === 'draft') active.draft = next;
        else active[field] = next ? Number(next) : undefined;
        display.textContent = next || label;
        ctx.persist();
      },
      onSubmit() { /* The order is delivered with the main button. */ },
    });
  }, 'mb-answer');
  display.setAttribute('aria-label', `${label}，当前${value || '未填写'}`);
  return display;
}

function strategyStage(ctx: AdditionContext, active: ActiveAddition, item: AdditionItem): HTMLElement {
  const stage = el('div', 'mb-addition-strategy');
  if (item.strategy === 'makeTen') {
    stage.append(el('p', '', `先把 ${item.a} 凑成整十，再把 ${item.b} 分开。`));
    const steps = el('div', 'mb-addition-steps');
    const first = el('label', '', '先补几颗');
    const second = el('label', '', '还剩几颗');
    first.append(numericInput(ctx, active, 'firstPart', '先补几'));
    second.append(numericInput(ctx, active, 'secondPart', '还剩几'));
    steps.append(first, second);
    stage.append(steps, trayStage(ctx, active, item));
  } else if (item.strategy === 'compensate') {
    stage.append(el('p', '', `先把 ${item.a} 当成 ${Math.ceil(item.a / 10) * 10}，算完要拿回几颗？`));
    const options = el('div', 'mb-addition-choice');
    for (const amount of [1, 2]) {
      const option = button(String(amount), () => {
        active.firstPart = amount;
        ctx.persist();
        for (const entry of options.querySelectorAll('button')) entry.setAttribute('aria-pressed', String(entry === option));
      }, active.firstPart === amount ? 'mb-choice-selected' : '');
      option.setAttribute('aria-pressed', String(active.firstPart === amount));
      options.append(option);
    }
    stage.append(options, el('span', '', '最后一共有'), numericInput(ctx, active, 'draft', '填答案'));
  } else {
    stage.append(el('p', '', '个位满十，把新压的那根棒记到十位。'));
    const column = el('div', 'mb-addition-column');
    column.append(el('span', '', String(item.a)), el('span', '', `+ ${item.b}`), el('span', '', '────'));
    stage.append(column);
    const options = el('div', 'mb-addition-choice');
    for (const amount of [0, 1]) {
      const option = button(`进位 ${amount}`, () => {
        active.carry = amount;
        ctx.persist();
        for (const entry of options.querySelectorAll('button')) entry.setAttribute('aria-pressed', String(entry === option));
      }, active.carry === amount ? 'mb-choice-selected' : '');
      option.setAttribute('aria-pressed', String(active.carry === amount));
      options.append(option);
    }
    stage.append(options, numericInput(ctx, active, 'draft', '填结果'));
  }
  return stage;
}

function methodStage(ctx: AdditionContext, active: ActiveAddition, item: AdditionItem): HTMLElement {
  const stage = el('div', 'mb-method-stage');
  stage.append(el('p', '', '选一条路，先算中间那一步。'));
  const options = el('div', 'mb-addition-choice');
  const details = el('p', 'mb-method-detail');
  for (const method of ['place', 'round'] as const) {
    const option = button(method === 'place' ? '十位先合' : '先凑整十', () => {
      active.method = method;
      active.methodReady = false;
      active.draft = '';
      ctx.persist();
      for (const entry of options.querySelectorAll('button')) entry.setAttribute('aria-pressed', String(entry === option));
      details.textContent = method === 'place'
        ? `${Math.floor(item.a / 10) * 10} + ${Math.floor(item.b / 10) * 10} = ?，再加上个位。`
        : `${item.a} + ${10 - item.a % 10} = ?，第二堆还剩 ${item.b - (10 - item.a % 10)}。`;
      const replacement = numericInput(ctx, active, 'draft', '先得到');
      answer.replaceWith(replacement);
      answer = replacement;
    }, active.method === method ? 'mb-choice-selected' : '');
    option.setAttribute('aria-pressed', String(active.method === method));
    options.append(option);
  }
  details.textContent = active.method === 'place'
    ? `${Math.floor(item.a / 10) * 10} + ${Math.floor(item.b / 10) * 10} = ?，再加上个位。`
    : active.method === 'round' ? `${item.a} + ${10 - item.a % 10} = ?，第二堆还剩 ${item.b - (10 - item.a % 10)}。` : '';
  let answer = numericInput(ctx, active, 'draft', '先得到');
  stage.append(options, details, answer, button('开始装货', () => {
    if (!active.method || active.draft === '') { ctx.speak('先选一种算法，填好中间那一步。'); return; }
    active.methodReady = true;
    ctx.persist();
    ctx.go('addMission');
  }, 'mb-button--primary'));
  return stage;
}

export function renderAdditionMission(ctx: AdditionContext): void {
  const { active, item, node, count } = activeItem(ctx);
  const main = el('main', 'mb-mission mb-addition-mission');
  main.append(header(ctx, node.title, () => { ctx.persist(); ctx.go('addChapter'); }));
  const pips = el('div', 'mb-progress');
  pips.setAttribute('aria-label', `第 ${active.index + 1} 题，共 ${count} 题`);
  for (let i = 0; i < count; i++) pips.append(el('i', `${i < active.index ? 'done' : ''} ${i === active.index ? 'now' : ''}`));
  main.append(pips);
  const order = el('section', 'mb-order');
  order.append(el('span', 'mb-order__label', '基地订单'), el('strong', 'mb-order__target', `${item.a} + ${item.b}`), el('span', 'mb-order__unit', `${active.index + 1}/${count}`));
  main.append(order);
  const work = el('section', 'mb-cert-work');
  if (node.id === 'cert.C2.6' && active.methodReady) {
    const chosen = el('div', 'mb-method-tray');
    chosen.append(el('p', '', `${active.method === 'place' ? '十位先合' : '先凑整十'}，先得到 ${active.draft}`), trayStage(ctx, active, item));
    work.append(chosen);
  } else work.append(node.id === 'cert.C2.6' ? methodStage(ctx, active, item) : item.strategy === 'tray' ? trayStage(ctx, active, item) : strategyStage(ctx, active, item));
  main.append(work);
  const controls = el('div', 'mb-controls');
  controls.append(button('提示', () => {
    ctx.speak(item.strategy === 'makeTen' ? '先想想个位离十差几，再看看第二堆还剩几颗。' : item.strategy === 'compensate' ? '把前一个数凑成整十后，记得把多算的拿回来。' : item.strategy === 'column' ? '先算个位。满十的话，新的一根棒要放进十位。' : '把待装货倒进晶槽。个位放满十颗，压成一根棒。');
  }, 'mb-button--secondary'), button('交付', () => submit(ctx), 'mb-button--primary'));
  main.append(controls, el('p', 'mb-subtitle', ''));
  ctx.root.append(main);
  ctx.speak(item.strategy === 'column' ? '先算个位，再检查要不要进位。' : item.strategy === 'compensate' ? '试试把第一个数凑成整十。' : `把 ${item.a} 和 ${item.b} 的货合在一起。`);
}

function submit(ctx: AdditionContext): void {
  const { active, item, node } = activeItem(ctx);
  if (item.strategy === 'makeTen' && (active.firstPart === undefined || active.secondPart === undefined)) { ctx.speak('先填好凑整十的两步。'); return; }
  if ((item.strategy === 'compensate' || item.strategy === 'column') && active.draft === '') { ctx.speak('先填好结果。'); return; }
  if (item.strategy === 'compensate' && active.firstPart === undefined) { ctx.speak('还要选出多算了几颗。'); return; }
  if (item.strategy === 'column' && active.carry === undefined) { ctx.speak('先检查个位有没有进位。'); return; }
  if (node.id === 'cert.C2.6' && (!active.method || active.draft === '')) { ctx.speak('先选一种算法，填好中间那一步。'); return; }
  if (node.id === 'cert.C2.6' && !active.methodReady) { ctx.speak('先点开始装货，把两批晶体合起来。'); return; }
  const trayCorrect = !!active.tray && readyToShip(active.tray) && active.tray.carts.rod === 0 && active.tray.carts.crystal === 0 && trayValue(active.tray) === item.answer;
  const methodCorrect = node.id !== 'cert.C2.6' || Number(active.draft) === (active.method === 'place' ? Math.floor(item.a / 10) * 10 + Math.floor(item.b / 10) * 10 : item.a + 10 - item.a % 10);
  const correct = item.strategy === 'tray' ? trayCorrect && methodCorrect
    : item.strategy === 'makeTen' ? trayCorrect && active.firstPart === item.firstPart && active.secondPart === item.secondPart
      : item.strategy === 'compensate' ? Number(active.draft) === item.answer && active.firstPart === item.firstPart
        : Number(active.draft) === item.answer && active.carry === item.carry;
  if (active.attempts === 0) active.firstTry.push(correct);
  active.lastCorrect = correct;
  ctx.persist();
  ctx.go('addFeedback');
}

export function renderAdditionFeedback(ctx: AdditionContext): void {
  const { active, item } = activeItem(ctx);
  const correct = active.lastCorrect === true;
  const main = el('main', 'mb-feedback');
  main.append(header(ctx, '订单回传', () => ctx.go('addMission')));
  const panel = el('div', 'mb-feedback__display');
  panel.append(el('span', 'mb-feedback__value', correct ? '✓' : '?'), el('span', 'mb-feedback__result', correct ? '验收成功' : '再看一眼'));
  if (!correct) panel.append(el('p', 'mb-feedback__delta', item.strategy === 'compensate' ? '凑成整十后，要把多算的拿回来。' : item.strategy === 'column' ? '个位满十，十位要多一根棒。' : '中间一步和晶槽都检查一下。'));
  main.append(panel);
  const retry = !correct && active.attempts < 2;
  main.append(button(retry ? '再试一次' : '继续', () => {
    if (retry) {
      active.attempts++;
      active.lastCorrect = undefined;
      ctx.persist();
      ctx.go('addMission');
      return;
    }
    const { node, count } = activeItem(ctx);
    active.index++;
    active.attempts = 0;
    active.draft = '';
    active.firstPart = undefined;
    active.secondPart = undefined;
    active.carry = undefined;
    active.method = undefined;
    active.methodReady = undefined;
    active.tray = undefined;
    active.trayBefore = undefined;
    active.lastCorrect = undefined;
    if (active.index >= count) finish(ctx, node);
    else { ctx.persist(); ctx.go('addMission'); }
  }, 'mb-button--primary'));
  ctx.root.append(main);
  ctx.speak(correct ? '这一单装好了。' : '先看看晶体，再试一次。');
}

function finish(ctx: AdditionContext, node: AdditionNode): void {
  const active = ctx.save.addition.active!;
  if (!ctx.save.addition.completed.includes(node.id)) ctx.save.addition.completed.push(node.id);
  ctx.mark('mission-end', { node: node.id, firstTry: active.firstTry.filter(Boolean).length });
  ctx.save.addition.active = undefined;
  ctx.save.activeArea = undefined;
  lastFinished = node;
  ctx.persist();
  ctx.go('addWrap');
}

export function renderAdditionWrap(ctx: AdditionContext): void {
  const node = lastFinished ?? ADDITION_NODES.find((entry) => entry.id === ctx.save.addition.completed.at(-1))!;
  const main = el('main', 'mb-wrap');
  main.append(header(ctx, '建造完成', () => ctx.go('addChapter')), el('div', 'mb-wrap__star', '★'), el('h2', 'mb-wrap__title', node.title), el('p', 'mb-wrap__detail', `${node.buildingPart?.name ?? '加法牌'}已经装好。`), button('回基地', () => ctx.go('map'), 'mb-button--primary'));
  ctx.root.append(main);
  ctx.speak(`${node.title}完成了。`);
}
