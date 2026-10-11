import { Chess, type Color, type Move } from '@weshell/xiangqi.js';
import { hashString } from '@kit/rng';
import type { AiLevel } from './core';

const PIECE_VALUE: Record<string, number> = { k: 20_000, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 };

function score(game: Chess, side: Color): number {
  if (game.isCheckmate() || game.isStalemate()) return game.turn() === side ? -100_000 : 100_000;
  if (game.isDraw()) return 0;
  let total = 0;
  for (const row of game.board()) for (const piece of row) {
    if (!piece) continue;
    const rank = Number(piece.square[1]);
    const acrossRiver = piece.type === 'p' && (piece.color === 'w' ? rank >= 5 : rank <= 4);
    const advance = piece.type === 'p' ? (piece.color === 'w' ? rank : 9 - rank) * 3 : 0;
    total += (piece.color === side ? 1 : -1) * (PIECE_VALUE[piece.type] + (acrossRiver ? 55 : 0) + advance);
  }
  return total;
}

function jitter(fen: string, move: Move, amplitude: number): number {
  return (hashString(`${fen}:${move.lan}`) / 0xffffffff - 0.5) * amplitude;
}

export function chooseAiMove(fen: string, level: AiLevel): string | null {
  const game = new Chess(fen);
  const side = game.turn();
  const choices = game.moves({ verbose: true });
  if (!choices.length) return null;
  let best = choices[0].lan;
  let bestScore = -Infinity;
  for (const move of choices) {
    game.move(move.lan);
    let value = score(game, side);
    if (level === 'challenger' && !game.isGameOver()) {
      let worstReply = Infinity;
      for (const reply of game.moves({ verbose: true })) {
        game.move(reply.lan);
        worstReply = Math.min(worstReply, score(game, side));
        game.undo();
      }
      value = worstReply;
    }
    value += jitter(fen, move, level === 'learner' ? 130 : 12);
    game.undo();
    if (value > bestScore) { bestScore = value; best = move.lan; }
  }
  return best;
}
