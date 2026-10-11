import { Chess, type Square } from '@weshell/xiangqi.js';
import { initShell } from '@kit/shell';
import { createStore, setHubProgress } from '@kit/progress';
import { icon } from '@kit/ui';
import { sfx } from '@kit/audio';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { makeBoard } from './board';
import { defaultSave, isValidSave, legalFrom, makeMove, pieceName, restore, turnLabel, type AiLevel, type Mode, type XiangqiSave } from './core';
import { PUZZLES, matingMoves, puzzleSolved, type Puzzle } from './puzzles';
import './styles.css';

const root = document.getElementById('app')!;
const test = new URLSearchParams(location.search).has('test');
const store = createStore<XiangqiSave>('xiangqi', { version: 1, defaults: defaultSave });
let save = store.load();
let game: Chess;
try {
  if (!isValidSave(save) || (save.mode === 'puzzle' && !PUZZLES.some((puzzle) => puzzle.id === save.puzzleId && puzzle.fen === save.initialFen))) throw new Error('Invalid save');
  game = restore(save);
}
catch { save = defaultSave(); game = restore(save); store.save(save); }
let selected: Square | null = null;
let cursor: Square | null = null;
let note = '先看对方正在守哪里，再决定落点。';
let wrongAttempts = 0;
let hintStage = 0;
let hintSquare: Square | null = null;
let aiBusy = false;
let aiRequest = 0;
let aiTimeout: ReturnType<typeof setTimeout> | null = null;
let aiWorker: Worker | null = null;
let aiFinisher: ((move: string | null) => void) | null = null;

const shell = initShell({
  game: 'xiangqi',
  startGate: test ? false : { title: '楚河棋院', subtitle: '一棋一想，走前先看', buttonLabel: '入席' },
  back: { compact: true },
  onBeforeLeave: persist,
  onPause: persist,
});

function persist(): void {
  store.save(save);
  const solved = save.solved.length;
  setHubProgress('xiangqi', { label: solved ? `残局 ${solved}/${PUZZLES.length}` : '棋局待开', value: solved / PUZZLES.length });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', content = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = content;
  return result;
}

function button(label: string, action: () => void, className = 'xq-command'): HTMLButtonElement {
  const result = el('button', className, label);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}

function iconButton(name: 'undo' | 'restart' | 'swap' | 'hint', label: string, action: () => void): HTMLButtonElement {
  const result = button('', action, 'xq-iconbtn');
  result.innerHTML = icon(name);
  result.setAttribute('aria-label', label);
  result.title = label;
  return result;
}

function currentPuzzle(): Puzzle {
  return PUZZLES.find((puzzle) => puzzle.id === save.puzzleId) ?? PUZZLES[0];
}

function cancelAi(): void {
  aiRequest++;
  aiBusy = false;
  if (aiTimeout) clearTimeout(aiTimeout);
  aiTimeout = null;
  aiFinisher = null;
}

function resetBoard(fen: string): void {
  cancelAi();
  game = new Chess(fen);
  save.initialFen = fen;
  save.moves = [];
  selected = null;
  cursor = null;
  hintSquare = null;
  hintStage = 0;
  wrongAttempts = 0;
  persist();
  render();
  requestAi();
}

function confirmChange(title: string, message: string, action: () => void): void {
  if (!save.moves.length) { action(); return; }
  const backdrop = el('div', 'xq-dialog-backdrop');
  const dialog = el('div', 'xq-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', title);
  const actions = el('div');
  actions.append(button('继续当前对局', () => backdrop.remove()), button('重新开始', () => { backdrop.remove(); action(); }, 'xq-command xq-command--primary'));
  dialog.append(el('h2', '', title), el('p', '', message), actions);
  backdrop.append(dialog);
  root.append(backdrop);
  actions.querySelector('button')?.focus();
}

function setMode(mode: Mode): void {
  if (mode === save.mode) return;
  confirmChange('换一种玩法？', '当前棋局会重新摆好，已完成的残局会保留。', () => {
    save.mode = mode;
    if (mode === 'puzzle') {
      const next = PUZZLES.find((puzzle) => !save.solved.includes(puzzle.id)) ?? PUZZLES[0];
      save.puzzleId = next.id;
      note = `这一局：${next.title}。想办法一步将死。`;
      resetBoard(next.fen);
    } else {
      save.puzzleId = undefined;
      note = mode === 'ai' ? '和小军师下：先看自己棋子能守住哪条路。' : '和家人轮流下。点一枚棋子，看它能走到哪里。';
      resetBoard(new Chess().fen());
    }
  });
}

function choosePuzzle(puzzle: Puzzle): void {
  if (save.puzzleId === puzzle.id && !save.moves.length) return;
  save.puzzleId = puzzle.id;
  note = `这一局：${puzzle.title}。想办法一步将死。`;
  resetBoard(puzzle.fen);
}

function canUndo(): boolean {
  if (save.mode === 'puzzle' || !save.moves.length) return false;
  if (save.mode === 'local') return true;
  const history = game.history({ verbose: true });
  return history.at(-1)?.color === save.human || history.some((move) => move.color === save.human);
}

function undo(): void {
  if (!canUndo()) return;
  cancelAi();
  if (save.mode === 'ai') {
    while (save.moves.length) {
      const undone = game.undo();
      save.moves.pop();
      if (undone?.color === save.human) break;
    }
  } else { game.undo(); save.moves.pop(); }
  selected = null;
  note = '退回一步，再看看另一条路。';
  persist();
  render();
  requestAi();
}

function onSquare(square: Square): void {
  if (aiBusy || game.isGameOver() || (save.mode === 'ai' && game.turn() !== save.human)) return;
  if (save.mode === 'puzzle' && save.moves.length) return;
  const piece = game.get(square);
  if (selected === square) { selected = null; render(); return; }
  if (selected) {
    const move = makeMove(game, selected, square);
    if (move) {
      sfx.play('place-piece');
      selected = null;
      hintSquare = null;
      if (save.mode === 'puzzle') {
        if (puzzleSolved(game)) {
          save.moves.push(move.lan);
          const puzzle = currentPuzzle();
          if (!save.solved.includes(puzzle.id)) save.solved.push(puzzle.id);
          sfx.play('star-1');
          note = `${puzzle.lesson} 这一局解开了。`;
          persist();
        } else {
          game.undo();
          wrongAttempts++;
          note = wrongAttempts >= 2 ? currentPuzzle().hint : '这一步还没封住所有退路，再观察一下。';
        }
      } else {
        save.moves.push(move.lan);
        note = move.isCheckmate ? `${move.zh}，将死！` : move.isCheck ? `${move.zh}，将军。看看对方怎么应对。` : move.captured ? `${move.zh}，吃子之后也要看看能否被吃回。` : `${move.zh}。落子前多看一步。`;
        persist();
      }
      render();
      requestAi();
      return;
    }
  }
  if (piece?.color === game.turn()) {
    selected = square;
    note = `${pieceName(piece.type, piece.color)}可以走到亮起的位置。`;
  } else {
    note = selected ? '这枚棋子走不到那里，看看亮起的位置。' : '先点轮到这一方的一枚棋子。';
  }
  render();
}

function requestAi(): void {
  if (save.mode !== 'ai' || game.turn() === save.human || game.isGameOver() || aiBusy) return;
  const fen = game.fen();
  const id = ++aiRequest;
  const started = performance.now();
  aiBusy = true;
  note = '小军师正在看棋路…';
  render();
  const finish = (moveLan: string | null): void => {
    if (id !== aiRequest || aiFinisher !== finish || save.mode !== 'ai' || game.fen() !== fen) return;
    aiFinisher = null;
    if (aiTimeout) clearTimeout(aiTimeout);
    aiTimeout = null;
    const wait = Math.max(0, 320 - (performance.now() - started));
    aiTimeout = setTimeout(() => {
      aiTimeout = null;
      if (id !== aiRequest || game.fen() !== fen) return;
      const legal = game.moves({ verbose: true });
      const selectedMove = legal.find((move) => move.lan === moveLan) ?? legal[0];
      aiBusy = false;
      if (!selectedMove) { render(); return; }
      const move = game.move(selectedMove.lan);
      sfx.play('place-piece');
      save.moves.push(move.lan);
      note = move.isCheckmate ? `小军师走了${move.zh}，这一局结束。` : move.isCheck ? `小军师走了${move.zh}，先保护帅。` : `小军师走了${move.zh}。轮到你了。`;
      persist();
      render();
    }, wait);
  };
  aiFinisher = finish;
  aiTimeout = setTimeout(() => finish(null), 5000);
  if (aiWorker) aiWorker.postMessage({ id, fen, level: save.level });
  else finish(null);
}

function showHint(): void {
  if (save.mode !== 'puzzle' || save.moves.length) return;
  const puzzle = currentPuzzle();
  hintStage = Math.min(3, hintStage + 1);
  const solution = matingMoves(puzzle.fen)[0];
  if (hintStage === 1) note = puzzle.hint;
  else if (hintStage === 2) { hintSquare = solution.from; note = '看看被圈出来的这枚棋子。'; }
  else note = `这一步可以走：${solution.zh}。再亲手试一次。`;
  render();
}

function settingSelect(label: string, values: { value: string; text: string }[], selectedValue: string, onChange: (value: string) => void): HTMLElement {
  const wrapper = el('label', 'xq-control', label);
  const select = el('select');
  for (const entry of values) {
    const option = el('option', '', entry.text);
    option.value = entry.value;
    select.append(option);
  }
  select.value = selectedValue;
  select.addEventListener('change', () => onChange(select.value));
  wrapper.append(select);
  return wrapper;
}

function segment(options: { value: string; label: string }[], active: string, onChange: (value: string) => void): HTMLElement {
  const row = el('div', 'xq-segment');
  for (const option of options) {
    const choice = button(option.label, () => onChange(option.value), '');
    choice.setAttribute('aria-pressed', String(option.value === active));
    row.append(choice);
  }
  return row;
}

function renderModeOptions(side: HTMLElement): void {
  if (save.mode === 'local') {
    const label = el('label', 'xq-control', '轮到黑方时自动翻盘');
    const toggle = el('input');
    toggle.type = 'checkbox';
    toggle.checked = save.autoRotate;
    toggle.addEventListener('change', () => { save.autoRotate = toggle.checked; persist(); render(); });
    label.prepend(toggle);
    side.append(label);
  } else if (save.mode === 'ai') {
    side.append(settingSelect('小军师', [
      { value: 'learner', text: '学徒 · 会吃子，偶尔留空' },
      { value: 'challenger', text: '棋友 · 会多想一步' },
    ], save.level, (value) => { save.level = value as AiLevel; persist(); render(); }));
    const color = segment([{ value: 'w', label: '执红先行' }, { value: 'b', label: '执黑后行' }], save.human, (value) => {
      if (value === save.human) return;
      confirmChange('换一方下？', '棋子会重新摆好。', () => {
        save.human = value as 'w' | 'b';
        save.flipped = value === 'b';
        note = value === 'b' ? '小军师执红先行，等它落子后轮到你。' : '你执红先行。';
        resetBoard(new Chess().fen());
      });
    });
    side.append(color);
  } else {
    const puzzle = currentPuzzle();
    const heading = el('div', 'xq-puzzle-head');
    heading.append(el('span', '', puzzle.title), el('small', '', `${save.solved.length}/${PUZZLES.length} 已解开`));
    side.append(heading);
    const list = el('div', 'xq-puzzles');
    for (const [index, entry] of PUZZLES.entries()) {
      const choice = button(String(index + 1), () => choosePuzzle(entry), '');
      choice.setAttribute('aria-label', `第 ${index + 1} 局，${entry.title}${save.solved.includes(entry.id) ? '，已完成' : ''}`);
      choice.setAttribute('aria-current', String(entry.id === puzzle.id));
      choice.dataset.solved = String(save.solved.includes(entry.id));
      list.append(choice);
    }
    side.append(list);
    side.append(button('线索', showHint));
    if (save.moves.length) side.append(button('下一局', () => {
      const current = PUZZLES.findIndex((entry) => entry.id === puzzle.id);
      const next = PUZZLES.slice(current + 1).find((entry) => !save.solved.includes(entry.id)) ?? PUZZLES.find((entry) => !save.solved.includes(entry.id)) ?? PUZZLES[(current + 1) % PUZZLES.length];
      choosePuzzle(next);
    }, 'xq-command xq-command--primary'));
  }
}

function render(): void {
  const viewFlipped = save.mode === 'local' && save.autoRotate ? game.turn() === 'b' : save.flipped;
  root.replaceChildren();
  const app = el('main', 'xq-app');
  const header = el('header', 'xq-header');
  header.append(el('h1', '', '楚河棋院'), el('span', 'xq-header__mark', '一棋一想'));
  app.append(header);
  const tabs = el('nav', 'xq-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const [mode, label] of [['local', '和家人下'], ['ai', '和小军师下'], ['puzzle', '残局']] as const) {
    const tab = button(label, () => setMode(mode), '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(mode === save.mode));
    tabs.append(tab);
  }
  app.append(tabs);
  const layout = el('div', 'xq-layout');
  const boardPanel = el('div', 'xq-board-panel');
  const history = game.history({ verbose: true });
  const board = makeBoard(game, {
    selected: selected ?? hintSquare,
    legal: selected ? legalFrom(game, selected) : [],
    last: history.at(-1) ?? null,
    flipped: viewFlipped,
    cursor,
    onSquare,
    onCursor(square) { cursor = square; render(); root.querySelector<SVGSVGElement>('.xq-board')?.focus(); },
  });
  boardPanel.append(board);
  layout.append(boardPanel);
  const side = el('aside', 'xq-side');
  const status = el('div', 'xq-status');
  status.setAttribute('aria-live', 'polite');
  status.append(el('strong', '', save.mode === 'puzzle' && save.moves.length ? '残局解开了' : aiBusy ? '小军师思考中' : turnLabel(game)), el('span', '', save.mode === 'puzzle' ? '红方走一步，找到将死' : save.mode === 'ai' ? `你执${save.human === 'w' ? '红' : '黑'} · ${save.level === 'learner' ? '学徒' : '棋友'}` : '红黑轮流 · 同屏对弈'));
  side.append(status);
  const coach = el('p', 'xq-coach');
  coach.append(el('b', '', '小军师'), document.createTextNode(note));
  side.append(coach);
  const tools = el('div', 'xq-actions');
  if (save.mode !== 'puzzle') {
    const undoButton = iconButton('undo', '悔棋', undo);
    undoButton.disabled = !canUndo();
    tools.append(undoButton);
  }
  tools.append(iconButton('restart', '重新摆棋', () => confirmChange('重新摆棋？', '当前棋局会从开头重新开始。', () => resetBoard(save.mode === 'puzzle' ? currentPuzzle().fen : new Chess().fen()))));
  if (save.mode !== 'puzzle') tools.append(iconButton('swap', '翻转棋盘', () => { save.autoRotate = false; save.flipped = !save.flipped; persist(); render(); }));
  side.append(tools);
  renderModeOptions(side);
  if (save.mode !== 'puzzle' && history.length) {
    const moves = el('ol', 'xq-history');
    for (const move of history.slice(-6)) moves.append(el('li', '', move.zh));
    side.append(moves);
  }
  layout.append(side);
  app.append(layout);
  root.append(app);
  root.dataset.ready = '1';
}

try {
  aiWorker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
  aiWorker.onmessage = (event: MessageEvent<{ id: number; move: string | null }>) => {
    if (event.data.id !== aiRequest) return;
    aiFinisher?.(event.data.move);
  };
  aiWorker.onerror = () => {
    aiWorker?.terminate();
    aiWorker = null;
    aiFinisher?.(null);
  };
} catch { aiWorker = null; }

render();
void shell.ready.then(() => {
  void installKitSfx({ only: ['place-piece', 'star-1'] });
  requestAi();
});
