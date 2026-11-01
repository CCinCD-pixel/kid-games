import { createRules } from '@engines/board/games/chess/rules';
import { stateSearchAdapter } from '@engines/board/core/stateadapter';
import { Searcher } from '@engines/board/core/search';

interface Request { id: number; fen: string; level: number; seed: number }
const rules = createRules();
const adapter = stateSearchAdapter(rules);
const searcher = new Searcher(adapter, 14);

(self as unknown as { onmessage: ((e: MessageEvent<Request>) => void) | null }).onmessage = (e) => {
  const { id, fen, level, seed } = e.data;
  try {
    const state = rules.fromFen(fen);
    const legal = rules.legalMoves(state);
    if (!legal.length) { self.postMessage({ id, move: null }); return; }
    let move = legal[seed % legal.length];
    if (level === 0) {
      const quiet = legal.filter((m) => !m.captured);
      if (quiet.length) move = quiet[seed % quiet.length];
    } else if (level === 1) {
      const captures = legal.filter((m) => m.captured).sort((a, b) => rules.value(state, b.to.r * 8 + b.to.c) - rules.value(state, a.to.r * 8 + a.to.c));
      if (captures.length && seed % 4 !== 0) move = captures[0];
    } else {
      searcher.clearTT();
      move = searcher.search(adapter.create(state), { depth: 2, nodes: 3000, maxMs: 700 }).best ?? move;
    }
    self.postMessage({ id, move: rules.encode(move) });
  } catch (error) { self.postMessage({ id, error: String(error) }); }
};
