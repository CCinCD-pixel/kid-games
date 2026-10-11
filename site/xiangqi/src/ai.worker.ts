import { chooseAiMove } from './ai';
import type { AiLevel } from './core';

self.onmessage = (event: MessageEvent<{ id: number; fen: string; level: AiLevel }>) => {
  const { id, fen, level } = event.data;
  try {
    self.postMessage({ id, move: chooseAiMove(fen, level) });
  } catch {
    self.postMessage({ id, move: null });
  }
};
