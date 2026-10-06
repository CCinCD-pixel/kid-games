/**
 * parseLevel (core.mjs 1:1). def.grid rows of single chars:
 *   .  random piece           -  void (no cell)          _  empty cell (puzzles only)
 *   r o y g b p   fixed colour piece
 *   R O Y G B P   fixed colour piece in a 1-layer ice shell
 *   i / I         random colour piece in a 1- / 2-layer ice shell
 *   1 2 3         crate with 1..3 layers
 *   @  pod (救援舱)          x  goo (暗物质)
 *   > ^ * + &     rocketH, rocketV, bomb, propeller, orb (pre-placed specials)
 * def.dust: rows of '0'/'1'/'2' or '.'; def.ice: ice layers on fixed-colour pieces; def.exits: pod exits.
 */
import { BOMB, CRATE, EMPTY, GOO, ORB, PALETTE, PIECE, POD, PROP, RH, RV, type Level, type LevelDef } from './types';

export function parseLevel(def: LevelDef): Level {
  const H = def.grid.length, W = def.grid[0].length;
  if (W > 9 || H > 9) throw new Error(`${def.id}: board > 9x9`);
  const N = W * H;
  const L: Level = {
    id: def.id, def, W, H, N,
    mask: new Uint8Array(N), kind: new Uint8Array(N), color: new Int8Array(N).fill(-1),
    hp: new Uint8Array(N), ice: new Uint8Array(N), dust: new Uint8Array(N),
    randomCell: new Uint8Array(N), exit: new Uint8Array(N), spawner: new Uint8Array(N),
    colors: [...def.colors].map((ch) => { const k = (PALETTE as readonly string[]).indexOf(ch); if (k < 0) throw new Error(`${def.id}: bad colour ${ch}`); return k; }),
    refill: def.refill !== false,
    pods: def.pods ? { total: def.pods.total, max: def.pods.max ?? 1, cols: def.pods.cols, gap: def.pods.gap ?? 2 } : null,
    objectives: [],
    moves: def.moves ?? 0,
  };
  for (let r = 0; r < H; r += 1) {
    const row = def.grid[r];
    if (row.length !== W) throw new Error(`${def.id}: row ${r} width ${row.length} != ${W}`);
    for (let c = 0; c < W; c += 1) {
      const i = r * W + c, ch = row[c];
      if (ch === '-') continue;
      L.mask[i] = 1;
      const lo = 'roygbp'.indexOf(ch), up = 'ROYGBP'.indexOf(ch);
      if (ch === '.') { L.kind[i] = PIECE; L.randomCell[i] = 1; }
      else if (ch === '_') { L.kind[i] = EMPTY; }
      else if (lo >= 0) { L.kind[i] = PIECE; L.color[i] = lo; }
      else if (up >= 0) { L.kind[i] = PIECE; L.color[i] = up; L.ice[i] = 1; }
      else if (ch === 'i' || ch === 'I') { L.kind[i] = PIECE; L.randomCell[i] = 1; L.ice[i] = ch === 'i' ? 1 : 2; }
      else if (ch >= '1' && ch <= '3') { L.kind[i] = CRATE; L.hp[i] = Number(ch); }
      else if (ch === '@') { L.kind[i] = POD; }
      else if (ch === 'x') { L.kind[i] = GOO; L.hp[i] = 1; }
      else if (ch === '>') L.kind[i] = RH;
      else if (ch === '^') L.kind[i] = RV;
      else if (ch === '*') L.kind[i] = BOMB;
      else if (ch === '+') L.kind[i] = PROP;
      else if (ch === '&') L.kind[i] = ORB;
      else throw new Error(`${def.id}: bad cell '${ch}' at ${r},${c}`);
    }
  }
  if (def.dust) {
    for (let r = 0; r < H; r += 1) for (let c = 0; c < W; c += 1) {
      const ch = def.dust[r][c]; const i = r * W + c;
      const v = ch === '.' ? 0 : Number(ch);
      if (v && !L.mask[i]) throw new Error(`${def.id}: dust on void ${r},${c}`);
      if (v && L.kind[i] === CRATE) throw new Error(`${def.id}: dust under crate ${r},${c}`);
      L.dust[i] = v;
    }
  }
  if (def.ice) {
    for (let r = 0; r < H; r += 1) for (let c = 0; c < W; c += 1) {
      const v = def.ice[r][c] === '.' ? 0 : Number(def.ice[r][c]); const i = r * W + c;
      if (v && L.kind[i] !== PIECE) throw new Error(`${def.id}: ice layer on a non-piece ${r},${c}`);
      if (v) L.ice[i] = v;
    }
  }
  // spawners: every cell whose upper neighbour is outside the board or void
  for (let i = 0; i < N; i += 1) if (L.mask[i]) { const r = (i / W) | 0; if (r === 0 || !L.mask[i - W]) L.spawner[i] = 1; }
  for (const c of def.exits ?? []) { for (let r = H - 1; r >= 0; r -= 1) { const i = r * W + c; if (L.mask[i]) { L.exit[i] = 1; break; } } }
  for (const o of def.objectives) {
    if ('collect' in o && o.collect) L.objectives.push({ t: 'collect', c: (PALETTE as readonly string[]).indexOf(o.collect), n: o.n });
    else if ('crate' in o && o.crate) L.objectives.push({ t: 'crate' });
    else if ('dust' in o && o.dust) L.objectives.push({ t: 'dust' });
    else if ('ice' in o && o.ice) L.objectives.push({ t: 'ice' });
    else if ('goo' in o && o.goo) L.objectives.push({ t: 'goo' });
    else if ('pod' in o && o.pod) L.objectives.push({ t: 'pod', n: o.pod });
    else if ('energy' in o && o.energy) L.objectives.push({ t: 'energy', n: o.energy });
    else throw new Error(`${def.id}: bad objective ${JSON.stringify(o)}`);
  }
  return L;
}
