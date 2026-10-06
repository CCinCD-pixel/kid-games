/**
 * Visual board state: one sprite per engine uid (pieces, specials, pods) + the cell layers (dust, ice,
 * crates, goo) as the child currently SEES them. The engine state is already final while the
 * director replays a move; `syncFrom` snaps the scene to the engine after every move (and on
 * rotation / resume), so the view can never drift.
 */
import { CRATE, GOO, PIECE, POD, isSpecial, type GameState } from '../core/types';

export interface Sprite {
  uid: number; kind: number; color: number;
  /** position in cell units (col, row of the cell's top-left) */
  x: number; y: number;
  sx: number; sy: number; rot: number; alpha: number;
  /** additive white flash 0..1 */
  flash: number;
  z: number;
  /** idle animation phase offset */
  phase: number;
}

export class Scene {
  W: number; H: number; N: number;
  mask: Uint8Array; spawner: Uint8Array;
  sprites = new Map<number, Sprite>();
  dust: Uint8Array; dustFade: Float32Array;
  ice: Uint8Array; iceShake: Float32Array;
  crate: Uint8Array; crateDent: Uint8Array; crateScale: Float32Array;
  goo: Uint8Array;
  /** selection / hint (cell indices) */
  selected = -1;
  hintCells: number[] = [];
  hintPhase = 0;
  /** dims everything but these cells (teaching mask 60 % / tool aim 30 %) */
  maskCells: number[] | null = null;
  maskAlpha = 0.6;
  /** tool-aim preview rings */
  aimCells: number[] = [];
  /** tool aim: every cell the tool may act on (corner brackets; QA r1 — aim mode must read at a glance) */
  aimTargets: number[] = [];
  /** star-gate flashes per spawner cell (0..1) */
  gate: Float32Array;

  constructor(st: GameState) {
    this.W = st.W; this.H = st.H; this.N = st.N;
    this.mask = st.mask; this.spawner = st.spawner;
    this.dust = new Uint8Array(st.N); this.dustFade = new Float32Array(st.N);
    this.ice = new Uint8Array(st.N); this.iceShake = new Float32Array(st.N);
    this.crate = new Uint8Array(st.N); this.crateDent = new Uint8Array(st.N); this.crateScale = new Float32Array(st.N).fill(1);
    this.goo = new Uint8Array(st.N);
    this.gate = new Float32Array(st.N);
    this.syncFrom(st);
  }

  syncFrom(st: GameState): void {
    const keep = new Set<number>();
    for (let i = 0; i < st.N; i += 1) {
      const k = st.kind[i];
      this.dust[i] = st.dust[i]; this.dustFade[i] = 0;
      this.ice[i] = k === PIECE ? st.ice[i] : 0; this.iceShake[i] = 0;
      this.crate[i] = k === CRATE ? st.hp[i] : 0; this.crateScale[i] = 1;
      if (k !== CRATE) this.crateDent[i] = 0;
      this.goo[i] = k === GOO ? 1 : 0;
      if (k === PIECE || k === POD || isSpecial(k)) {
        const u = st.uid ? st.uid[i] : i + 1;
        keep.add(u);
        const s = this.sprites.get(u);
        const x = i % st.W, y = (i / st.W) | 0;
        if (s) Object.assign(s, { kind: k, color: st.color[i], x, y, sx: 1, sy: 1, rot: 0, alpha: 1, flash: 0, z: 0 });
        else this.sprites.set(u, { uid: u, kind: k, color: st.color[i], x, y, sx: 1, sy: 1, rot: 0, alpha: 1, flash: 0, z: 0, phase: (u * 7) % 13 });
      }
    }
    for (const u of [...this.sprites.keys()]) if (!keep.has(u)) this.sprites.delete(u);
    this.gate.fill(0);
  }

  /** sprite standing on cell i (by position), if any */
  spriteAt(i: number): Sprite | undefined {
    const x = i % this.W, y = (i / this.W) | 0;
    for (const s of this.sprites.values()) if (Math.abs(s.x - x) < 0.01 && Math.abs(s.y - y) < 0.01 && s.alpha > 0) return s;
    return undefined;
  }
  hasSpecials(): boolean { for (const s of this.sprites.values()) if (isSpecial(s.kind)) return true; return false; }
}
