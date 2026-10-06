/** gravity + refill + diagonal slides + pod delivery (core.mjs `settle`, 1:1). */
import { falls, movable, solid } from './moves';
import { rngBelow } from './rng';
import { log } from './state';
import { EMPTY, PIECE, POD, type GameState } from './types';

function shadowed(st: GameState, i: number): boolean {
  // an empty cell that nothing can reach by falling straight down (a solid thing above it)
  for (let j = i - st.W; j >= 0; j -= st.W) {
    if (!st.mask[j]) return false; // segment top below a void: has its own spawner
    const k = st.kind[j];
    if (k === EMPTY) continue;
    return solid(st, j);
  }
  return false;
}
function podsOnBoard(st: GameState): number { let n = 0; for (let i = 0; i < st.N; i += 1) if (st.kind[i] === POD) n += 1; return n; }

export function settle(st: GameState): void {
  const { W, H, kind, color, mask } = st;
  const uid = st.uid;
  for (let guard = 0; guard < 2000; guard += 1) {
    let moved = false;
    // 1. straight falls (bottom-up per column)
    for (let c = 0; c < W; c += 1) {
      for (let r = H - 1; r >= 0; r -= 1) {
        const i = r * W + c;
        if (!mask[i] || kind[i] !== EMPTY) continue;
        for (let rr = r - 1; rr >= 0; rr -= 1) {
          const j = rr * W + c;
          if (!mask[j]) break;
          if (kind[j] === EMPTY) continue;
          if (falls(st, j)) {
            kind[i] = kind[j]; color[i] = color[j]; kind[j] = EMPTY; color[j] = -1; moved = true;
            let u = 0; if (uid) { u = uid[j]; uid[i] = u; uid[j] = 0; }
            log(st, { e: 'fall', from: j, to: i, uid: u });
          }
          break;
        }
      }
    }
    // 2. spawn at empty spawners
    if (st.refill) {
      for (let c = 0; c < W; c += 1) for (let r = 0; r < H; r += 1) {
        const i = r * W + c;
        if (!st.spawner[i] || kind[i] !== EMPTY) continue;
        const P = st.L.pods;
        let u = 0; if (uid) { u = st.nextUid++; uid[i] = u; }
        if (P && P.cols.includes(c) && st.podsReleased < P.total && podsOnBoard(st) < P.max && st.movesUsed - st.lastPodMove >= P.gap) {
          kind[i] = POD; color[i] = -1; st.podsReleased += 1; st.lastPodMove = st.movesUsed; log(st, { e: 'spawn', i, pod: true, uid: u });
        } else {
          const col = st.L.colors[rngBelow(st.rFill, st.L.colors.length)];
          kind[i] = PIECE; color[i] = col; log(st, { e: 'spawn', i, col, uid: u });
        }
        moved = true;
      }
    }
    if (moved) continue;
    // 3. one diagonal slide into a shadowed hole (bottom-up, left source first)
    outer: for (let r = H - 1; r >= 1; r -= 1) for (let c = 0; c < W; c += 1) {
      const i = r * W + c;
      if (!mask[i] || kind[i] !== EMPTY || !shadowed(st, i)) continue;
      for (const dc of [-1, 1]) {
        const cc = c + dc; if (cc < 0 || cc >= W) continue;
        const j = (r - 1) * W + cc;
        if (!mask[j] || !movable(st, j)) continue;
        kind[i] = kind[j]; color[i] = color[j]; kind[j] = EMPTY; color[j] = -1; moved = true; st.stats.slides += 1;
        let u = 0; if (uid) { u = uid[j]; uid[i] = u; uid[j] = 0; }
        log(st, { e: 'slide', from: j, to: i, uid: u });
        break outer;
      }
    }
    if (moved) continue;
    // 4. deliver pods sitting on exits
    for (let i = 0; i < st.N; i += 1) if (st.exit[i] && kind[i] === POD) {
      kind[i] = EMPTY; st.delivered += 1; moved = true;
      let u = 0; if (uid) { u = uid[i]; uid[i] = 0; }
      log(st, { e: 'deliver', i, uid: u });
    }
    if (!moved) return;
  }
  throw new Error('settle did not converge');
}
