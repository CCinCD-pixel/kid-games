import { Chess, type Move, type Square } from '@weshell/xiangqi.js';
import { pieceName } from './core';

const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function squarePoint(square: Square, flipped: boolean): { x: number; y: number } {
  const col = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const x = 50 + col * 100;
  const y = 50 + (9 - rank) * 100;
  return flipped ? { x: 900 - x, y: 1000 - y } : { x, y };
}

function addLine(board: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, thick = false): void {
  board.append(svg('line', { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), class: thick ? 'xq-line xq-line--thick' : 'xq-line' }));
}

function drawGrid(board: SVGSVGElement): void {
  board.append(svg('rect', { x: '8', y: '8', width: '884', height: '984', rx: '4', class: 'xq-board-ground' }));
  board.append(svg('rect', { x: '38', y: '38', width: '824', height: '924', class: 'xq-frame' }));
  for (let row = 0; row < 10; row++) addLine(board, 50, 50 + row * 100, 850, 50 + row * 100, row === 0 || row === 9);
  for (let col = 0; col < 9; col++) {
    const x = 50 + col * 100;
    if (col === 0 || col === 8) addLine(board, x, 50, x, 950, true);
    else { addLine(board, x, 50, x, 450); addLine(board, x, 550, x, 950); }
  }
  addLine(board, 350, 50, 550, 250);
  addLine(board, 550, 50, 350, 250);
  addLine(board, 350, 750, 550, 950);
  addLine(board, 550, 750, 350, 950);
  const river = svg('text', { x: '450', y: '515', class: 'xq-river', 'text-anchor': 'middle' });
  river.textContent = '楚 河     汉 界';
  board.append(river);
}

export function boardAt(svgBoard: SVGSVGElement, clientX: number, clientY: number, flipped: boolean): Square | null {
  const point = svgBoard.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svgBoard.getScreenCTM();
  if (!matrix) return null;
  const local = point.matrixTransform(matrix.inverse());
  const visualCol = Math.round((local.x - 50) / 100);
  const visualRow = Math.round((local.y - 50) / 100);
  if (visualCol < 0 || visualCol > 8 || visualRow < 0 || visualRow > 9) return null;
  const x = 50 + visualCol * 100;
  const y = 50 + visualRow * 100;
  if (Math.abs(local.x - x) > 48 || Math.abs(local.y - y) > 48) return null;
  const col = flipped ? 8 - visualCol : visualCol;
  const rank = flipped ? visualRow : 9 - visualRow;
  return `${String.fromCharCode(97 + col)}${rank}` as Square;
}

export function makeBoard(game: Chess, options: {
  selected: Square | null;
  legal: Move[];
  last: Move | null;
  flipped: boolean;
  cursor: Square | null;
  onSquare(square: Square): void;
  onCursor(square: Square): void;
}): SVGSVGElement {
  const board = svg('svg', { viewBox: '0 0 900 1000', class: 'xq-board', role: 'application', tabindex: '0', 'aria-label': '中国象棋棋盘。方向键移动光标，回车选棋或落子。' });
  drawGrid(board);
  for (const square of [options.last?.from, options.last?.to]) {
    if (!square) continue;
    const { x, y } = squarePoint(square, options.flipped);
    board.append(svg('rect', { x: String(x - 47), y: String(y - 47), width: '94', height: '94', rx: '8', class: 'xq-last' }));
  }
  if (options.selected) {
    const { x, y } = squarePoint(options.selected, options.flipped);
    board.append(svg('circle', { cx: String(x), cy: String(y), r: '50', class: 'xq-selected' }));
  }
  for (const move of options.legal) {
    const { x, y } = squarePoint(move.to, options.flipped);
    board.append(svg('circle', { cx: String(x), cy: String(y), r: move.captured ? '48' : '13', class: move.captured ? 'xq-legal xq-legal--capture' : 'xq-legal' }));
  }
  if (game.isCheck()) {
    const king = game.findPiece({ type: 'k', color: game.turn() })[0];
    if (king) {
      const { x, y } = squarePoint(king, options.flipped);
      board.append(svg('circle', { cx: String(x), cy: String(y), r: '51', class: 'xq-check' }));
    }
  }
  if (options.cursor) {
    const { x, y } = squarePoint(options.cursor, options.flipped);
    board.append(svg('rect', { x: String(x - 48), y: String(y - 48), width: '96', height: '96', rx: '9', class: 'xq-cursor' }));
  }
  for (const row of game.board()) for (const piece of row) {
    if (!piece) continue;
    const { x, y } = squarePoint(piece.square, options.flipped);
    const group = svg('g', { class: `xq-piece xq-piece--${piece.color === 'w' ? 'red' : 'black'}`, 'data-square': piece.square });
    group.append(svg('circle', { cx: String(x), cy: String(y + 4), r: '42', class: 'xq-piece-shadow' }));
    group.append(svg('circle', { cx: String(x), cy: String(y), r: '42', class: 'xq-piece-disc' }));
    group.append(svg('circle', { cx: String(x), cy: String(y), r: '36', class: 'xq-piece-inner' }));
    const label = svg('text', { x: String(x), y: String(y + 1), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'xq-piece-text' });
    label.textContent = pieceName(piece.type, piece.color);
    group.append(label);
    board.append(group);
  }
  board.addEventListener('click', (event) => {
    const square = boardAt(board, event.clientX, event.clientY, options.flipped);
    if (square) options.onSquare(square);
  });
  board.addEventListener('keydown', (event) => {
    const current = options.cursor ?? (options.flipped ? 'e9' : 'e0');
    const file = current.charCodeAt(0) - 97;
    const rank = Number(current[1]);
    const dx = options.flipped ? -1 : 1;
    const dy = options.flipped ? 1 : -1;
    let nextFile = file;
    let nextRank = rank;
    if (event.key === 'ArrowRight') nextFile += dx;
    else if (event.key === 'ArrowLeft') nextFile -= dx;
    else if (event.key === 'ArrowDown') nextRank += dy;
    else if (event.key === 'ArrowUp') nextRank -= dy;
    else if (event.key === 'Enter' || event.key === ' ') options.onSquare(current);
    else return;
    event.preventDefault();
    if (nextFile >= 0 && nextFile <= 8 && nextRank >= 0 && nextRank <= 9 && (nextFile !== file || nextRank !== rank)) options.onCursor(`${String.fromCharCode(97 + nextFile)}${nextRank}` as Square);
  });
  return board;
}
