import { icon } from '@kit/ui';
import { emptyTray, readyToShip, trayStep, trayValue, type TrayState } from '@engines/manip/tray';
import { openNumericPad } from '../ui/pad';
import type { ActiveSubtraction, OrbitSave } from '../orbit/save';
import { SUBTRACTION_NODES, makeSubtractionItems, type SubtractionItem, type SubtractionNode } from './model';

export interface SubtractionContext {
  root: HTMLElement;
  save: OrbitSave;
  persist(): void;
  speak(line: string): void;
  go(screen: 'map' | 'certOverview' | 'subChapter' | 'subMission' | 'subFeedback' | 'subWrap'): void;
  mark(name: string, data: Record<string, unknown>): void;
  replay(): void;
}

let lastFinished: SubtractionNode | null = null;

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

function header(ctx: SubtractionContext, title: string, back: () => void): HTMLElement {
  const head = el('header', 'mb-header');
  const returnButton = button('', back, 'mb-icon-button');
  returnButton.innerHTML = icon('back');
  returnButton.setAttribute('aria-label', '返回');
  const replay = button('', ctx.replay, 'mb-icon-button');
  replay.innerHTML = icon('replay');
  replay.setAttribute('aria-label', '再听一遍');
  head.append(returnButton, el('h1', '', title), replay);
  return head;
}

export function startSubtractionNode(ctx: SubtractionContext, node: SubtractionNode): void {
  ctx.save.activeArea = 'subtraction';
  if (ctx.save.subtraction.active?.nodeId !== node.id) {
    ctx.save.subtraction.active = { nodeId: node.id, seed: Math.floor(Math.random() * 0x7fffffff), index: 0, draft: '', attempts: 0, firstTry: [] };
  }
  ctx.persist();
  ctx.go('subMission');
}

export function renderSubtractionChapter(ctx: SubtractionContext): void {
  const main = el('main', 'mb-chapter');
  main.append(header(ctx, '减法牌', () => ctx.go('certOverview')), el('p', 'mb-chapter__intro', '把要发走的晶体取出来，看看还剩多少。'));
  const list = el('div', 'mb-node-list');
  const next = SUBTRACTION_NODES.find((node) => !ctx.save.subtraction.completed.includes(node.id));
  for (const node of SUBTRACTION_NODES) {
    const done = ctx.save.subtraction.completed.includes(node.id);
    const entry = button('', () => startSubtractionNode(ctx, node), `mb-node ${done ? 'mb-node--done' : ''}`);
    entry.disabled = !done && node.id !== next?.id;
    entry.append(el('span', 'mb-node__id', node.id.split('.').slice(1).join('.')), el('span', 'mb-node__name', node.title), el('span', 'mb-node__badge', done ? '★' : entry.disabled ? '待建' : '出发'));
    list.append(entry);
  }
  main.append(list);
  ctx.root.append(main);
  ctx.speak('减法牌从整十减开始。要取走的货和剩下的货，要一起对上订单。');
}

function activeItem(ctx: SubtractionContext): { active: ActiveSubtraction; item: SubtractionItem; node: SubtractionNode; count: number } {
  const active = ctx.save.subtraction.active;
  const node = SUBTRACTION_NODES.find((entry) => entry.id === active?.nodeId);
  if (!active || !node) throw new Error('No active subtraction task');
  const items = makeSubtractionItems(node, active.seed);
  const item = items[active.index];
  if (!item) throw new Error('Subtraction item index is outside the task');
  return { active, item, node, count: items.length };
}

function pile(state: TrayState): HTMLElement {
  const result = el('div', 'mb-pile');
  const rods = el('div', 'mb-pile__rods');
  for (let i = 0; i < state.rods; i++) rods.append(el('i', 'mb-rod'));
  const crystals = el('div', 'mb-pile__crystals');
  for (let i = 0; i < state.crystals; i++) crystals.append(el('i', 'mb-crystal'));
  result.append(rods, crystals);
  if (state.stagedCrystals) {
    const opened = el('div', 'mb-subtraction-opened');
    opened.append(el('span', '', '切开的棒'));
    for (let i = 0; i < state.stagedCrystals; i++) opened.append(el('i', 'mb-crystal'));
    result.append(opened);
  }
  return result;
}

function ensureTray(active: ActiveSubtraction, item: SubtractionItem): TrayState {
  if (!active.tray) {
    active.tray = emptyTray();
    active.tray.rods = Math.floor(item.a / 10);
    active.tray.crystals = item.a % 10;
  }
  return active.tray;
}

function trayStage(ctx: SubtractionContext, active: ActiveSubtraction, item: SubtractionItem): HTMLElement {
  ensureTray(active, item);
  const stage = el('div', 'mb-addition-stage mb-subtraction-stage');
  const summary = el('div', 'mb-addition-summary');
  const current = el('section', 'mb-addition-bin');
  const shipped = el('section', 'mb-addition-bin');
  const currentLabel = el('strong');
  const shippedLabel = el('strong');
  summary.append(current, shipped);
  const actions = el('div', 'mb-addition-actions mb-subtraction-actions');
  const shipRod = button('取走 1 根棒', () => change([{ op: 'ship', part: 'rod' }]));
  const shipCrystal = button('取走 1 颗晶', () => {
    const steps = active.tray!.crystals ? [] : [{ op: 'moveStaged' as const }];
    change([...steps, { op: 'ship', part: 'crystal' }]);
  });
  const cut = button('切棒成十颗', () => change([{ op: 'cutRod' }, { op: 'openBundle' }]));
  const gather = button('收好余晶', () => {
    const steps = Array.from({ length: active.tray!.stagedCrystals }, () => ({ op: 'moveStaged' as const }));
    change(steps);
  });
  const undo = button('撤销', () => {
    if (!active.trayBefore) return;
    active.tray = active.trayBefore;
    active.trayBefore = undefined;
    ctx.persist();
    paint();
  }, 'mb-button--secondary');
  const reset = button('重摆', () => {
    active.tray = undefined;
    active.trayBefore = undefined;
    ensureTray(active, item);
    ctx.persist();
    paint();
  }, 'mb-button--secondary');
  function change(steps: ({ op: 'ship'; part: 'rod' | 'crystal' } | { op: 'cutRod' | 'openBundle' | 'moveStaged' })[]): void {
    let next = active.tray!;
    for (const step of steps) {
      const updated = trayStep(next, step);
      if (!updated) { ctx.speak('这一步还不能这样做，看看晶槽里有什么。'); return; }
      next = updated;
    }
    active.trayBefore = active.tray;
    active.tray = next;
    ctx.persist();
    paint();
  }
  function paint(): void {
    const state = active.tray!;
    currentLabel.textContent = `还剩 · ${trayValue(state)}`;
    shippedLabel.textContent = `已取走 · ${state.shipped}/${item.b}`;
    current.replaceChildren(currentLabel, pile(state));
    shipped.replaceChildren(shippedLabel, el('span', 'mb-subtraction-shipped', String(state.shipped)));
    shipRod.disabled = state.rods === 0 || state.shipped + 10 > item.b;
    shipCrystal.disabled = state.shipped >= item.b || (state.crystals === 0 && state.stagedCrystals === 0);
    cut.disabled = state.rods === 0 || state.stagedCrystals > 0 || state.shipped === item.b;
    gather.disabled = state.stagedCrystals === 0 || state.shipped !== item.b;
    undo.disabled = !active.trayBefore;
  }
  actions.append(shipRod, shipCrystal, cut, gather, undo, reset);
  stage.append(summary, actions);
  paint();
  return stage;
}

function numericInput(ctx: SubtractionContext, active: ActiveSubtraction, field: 'draft' | 'step', label: string, maxLength = 2): HTMLButtonElement {
  const value = active[field] ?? '';
  const display = button(value || label, () => {
    openNumericPad(ctx.root, {
      value: active[field] ?? '', maxLength,
      onChange(next) { active[field] = next; display.textContent = next || label; ctx.persist(); },
      onSubmit() { /* The main button delivers the order. */ },
    });
  }, 'mb-answer');
  display.setAttribute('aria-label', `${label}，当前${value || '未填写'}`);
  return display;
}

function strategyStage(ctx: SubtractionContext, active: ActiveSubtraction, item: SubtractionItem): HTMLElement {
  const stage = el('div', 'mb-addition-strategy mb-subtraction-strategy');
  if (item.strategy === 'thinkAdd') {
    stage.append(el('p', '', `从 ${item.b} 往上数，走几步能到 ${item.a}？`));
    const rail = el('div', 'mb-subtraction-rail');
    rail.append(el('b', '', String(item.b)), el('span', '', '+ ?'), el('b', '', String(item.a)));
    stage.append(rail, numericInput(ctx, active, 'draft', '相差几'));
  } else if (item.strategy === 'compensate') {
    stage.append(el('p', '', `${item.a} 减 ${item.b}，先当成减 ${item.rounded}。`));
    const steps = el('div', 'mb-addition-steps');
    const first = el('label', '', `先减 ${item.rounded} 得到`);
    first.append(numericInput(ctx, active, 'step', '中间结果'));
    const final = el('label', '', `再还回 ${item.rounded! - item.b} 得到`);
    final.append(numericInput(ctx, active, 'draft', '最后结果'));
    steps.append(first, final);
    stage.append(steps);
  } else if (item.strategy === 'compare') {
    stage.append(el('p', '', '两批货对齐看，多出来的那截有多少？'));
    const bars = el('div', 'mb-subtraction-bars');
    for (const [name, amount] of [['甲', item.a], ['乙', item.b]] as const) {
      const row = el('div', 'mb-subtraction-bars__row');
      row.append(el('strong', '', `${name} ${amount}`));
      const bar = el('i');
      bar.style.width = `${Math.round(amount / item.a * 100)}%`;
      row.append(bar);
      bars.append(row);
    }
    stage.append(bars, numericInput(ctx, active, 'draft', '多几颗'));
  } else {
    stage.append(el('p', '', '从个位算起。个位不够减，就向十位借一根棒。'));
    const column = el('div', 'mb-addition-column');
    column.append(el('span', '', String(item.a)), el('span', '', `− ${item.b}`), el('span', '', '────'));
    const choices = el('div', 'mb-addition-choice');
    for (const borrow of [false, true]) {
      const option = button(borrow ? '切一根棒' : '不用切棒', () => {
        active.borrowChoice = borrow;
        ctx.persist();
        for (const entry of choices.querySelectorAll('button')) entry.setAttribute('aria-pressed', String(entry === option));
      });
      option.setAttribute('aria-pressed', String(active.borrowChoice === borrow));
      choices.append(option);
    }
    const fields = el('div', 'mb-addition-steps');
    const ones = el('label', '', '个位得几');
    ones.append(numericInput(ctx, active, 'step', '个位', 1));
    const result = el('label', '', '最后剩几');
    result.append(numericInput(ctx, active, 'draft', '结果'));
    fields.append(ones, result);
    stage.append(column, choices, fields);
  }
  return stage;
}

export function renderSubtractionMission(ctx: SubtractionContext): void {
  const { active, item, node, count } = activeItem(ctx);
  const main = el('main', 'mb-mission mb-subtraction-mission');
  main.append(header(ctx, node.title, () => { ctx.persist(); ctx.go('subChapter'); }));
  const pips = el('div', 'mb-progress');
  pips.setAttribute('aria-label', `第 ${active.index + 1} 题，共 ${count} 题`);
  for (let i = 0; i < count; i++) pips.append(el('i', `${i < active.index ? 'done' : ''} ${i === active.index ? 'now' : ''}`));
  main.append(pips);
  const order = el('section', 'mb-order');
  order.append(el('span', 'mb-order__label', '基地订单'), el('strong', 'mb-order__target', `${item.a} − ${item.b}`), el('span', 'mb-order__unit', `${active.index + 1}/${count}`));
  const work = el('section', 'mb-cert-work');
  work.append(item.strategy === 'tray' ? trayStage(ctx, active, item) : strategyStage(ctx, active, item));
  const controls = el('div', 'mb-controls');
  controls.append(button('提示', () => ctx.speak(item.borrow ? '个位不够时，先拿走能取的晶，再切开一根棒。' : item.strategy === 'thinkAdd' ? '从小数往大数数，相差几就是答案。' : item.strategy === 'compensate' ? '多减了几颗，就要还回几颗。' : item.strategy === 'compare' ? '把两条货带对齐，只看多出来的那一截。' : '先取走十位，再取走个位。'), 'mb-button--secondary'), button('交付', () => submit(ctx), 'mb-button--primary'));
  main.append(order, work, controls, el('p', 'mb-subtitle', ''));
  ctx.root.append(main);
  ctx.speak(item.strategy === 'tray' ? `晶槽里有 ${item.a}，请取走 ${item.b}。` : item.strategy === 'compare' ? '两批货对齐看，多出来的是多少？' : `${item.a} 减 ${item.b}，你想怎么验算？`);
}

function submit(ctx: SubtractionContext): void {
  const { active, item } = activeItem(ctx);
  const trayCorrect = !!active.tray && active.tray.shipped === item.b && trayValue(active.tray) === item.answer && readyToShip(active.tray);
  const correct = item.strategy === 'tray' ? trayCorrect
    : item.strategy === 'compensate' ? active.step !== undefined && Number(active.step) === item.a - item.rounded! && active.draft !== '' && Number(active.draft) === item.answer
      : item.strategy === 'column' ? active.borrowChoice === item.borrow && active.step !== undefined && Number(active.step) === item.answer % 10 && active.draft !== '' && Number(active.draft) === item.answer
        : active.draft !== '' && Number(active.draft) === item.answer;
  if (active.attempts === 0) active.firstTry.push(correct);
  active.lastCorrect = correct;
  ctx.persist();
  ctx.go('subFeedback');
}

export function renderSubtractionFeedback(ctx: SubtractionContext): void {
  const { active, item } = activeItem(ctx);
  const correct = active.lastCorrect === true;
  const main = el('main', 'mb-feedback');
  main.append(header(ctx, '订单回传', () => ctx.go('subMission')));
  const panel = el('div', 'mb-feedback__display');
  panel.append(el('span', 'mb-feedback__value', correct ? '✓' : '?'), el('span', 'mb-feedback__result', correct ? '验收成功' : '再看一眼'));
  if (!correct) panel.append(el('p', 'mb-feedback__delta', item.borrow ? '个位不够时，借来的一根棒是十颗晶。' : item.strategy === 'compensate' ? '多减的晶，还要加回来。' : '再看看取走的和剩下的能不能合回原数。'));
  main.append(panel);
  const retry = !correct && active.attempts < 2;
  main.append(button(retry ? '再试一次' : '继续', () => {
    if (retry) {
      active.attempts++;
      active.lastCorrect = undefined;
      ctx.persist();
      ctx.go('subMission');
      return;
    }
    const { node, count } = activeItem(ctx);
    active.index++;
    active.attempts = 0;
    active.draft = '';
    active.step = undefined;
    active.borrowChoice = undefined;
    active.tray = undefined;
    active.trayBefore = undefined;
    active.lastCorrect = undefined;
    if (active.index >= count) finish(ctx, node);
    else { ctx.persist(); ctx.go('subMission'); }
  }, 'mb-button--primary'));
  ctx.root.append(main);
  ctx.speak(correct ? '取走的和剩下的正好对上。' : '看看切棒或中间一步，再试一次。');
}

function finish(ctx: SubtractionContext, node: SubtractionNode): void {
  const active = ctx.save.subtraction.active!;
  if (!ctx.save.subtraction.completed.includes(node.id)) ctx.save.subtraction.completed.push(node.id);
  ctx.mark('mission-end', { node: node.id, firstTry: active.firstTry.filter(Boolean).length });
  ctx.save.subtraction.active = undefined;
  ctx.save.activeArea = undefined;
  lastFinished = node;
  ctx.persist();
  ctx.go('subWrap');
}

export function renderSubtractionWrap(ctx: SubtractionContext): void {
  const node = lastFinished ?? SUBTRACTION_NODES.find((entry) => entry.id === ctx.save.subtraction.completed.at(-1))!;
  const main = el('main', 'mb-wrap');
  main.append(header(ctx, '建造完成', () => ctx.go('subChapter')), el('div', 'mb-wrap__star', '★'), el('h2', 'mb-wrap__title', node.title), el('p', 'mb-wrap__detail', `${node.buildingPart?.name ?? '减法牌'}已经装好。`), button('回基地', () => ctx.go('map'), 'mb-button--primary'));
  ctx.root.append(main);
  ctx.speak(`${node.title}完成了。`);
}
