// C 称职 (a child who has learned the 锦囊), K2 (C with a child's hands) and O 最优 — port of proto/bots/c.mjs (rev d).
// Strategy concepts are modules; disabling one is the concept-necessity ablation (spec §9.4).
// Lane template: col 0 economy · cols 1–3 attack · col 4 support or 4th attacker · col 5 wall · col 6 spikes / pit · col 7 listener.
import { T, COLS, LANES, TPS } from '../lane/rules';
import { UNITS, ENEMIES, MOVES } from '../lane/tables';
import { canPlace, isNight, inSmoke, tileOf, topAt, occupant } from '../lane/sim';
import { prng, lognormal, ATTACK, ECON, dpsVs, visible, laneUnits, attackersIn, inLoadout, affordable, activeLanes, threatOf, cards, type Bot } from './common';
import { speedAt, type Speed } from './k';
import type { Action, Enemy, Level, SimState, Unit } from '../lane/types';

export const MODULES = ['econ', 'invest', 'counter', 'aoe', 'timing', 'priority', 'control', 'depth', 'synergy', 'adapt', 'preview', 'feint', 'improvise', 'budget', 'risk', 'mark', 'detect', 'swap', 'save'];
export const DEFAULT_PARAMS = { react: 10, every: 5, econDay: 8, econNight: 5, bankDay: 0, safety: 1.15, strikeMin: 45, wallCol: 4, attackMax: 4, lookahead: 0, prepLead: 35, surplus: 150, waitMax: 12, waitCounter: 10, prepWalls: 1, base1: 1, base2: 1, base3: 2, wallHeavyOnly: 0 };
export type CParams = typeof DEFAULT_PARAMS;
export interface COptions { off?: string[]; params?: Partial<CParams>; omni?: boolean; kid?: boolean; speedPct?: Speed; noEmerg?: boolean }

interface LaneEntry { e: Enemy; t: number; hp: number }
interface LaneInfo { l: number; es: LaneEntry[]; need: number; have: number; deficit: number; minT: number; w: number }
interface Want { pri: number; card: string; lane: number; col: number; nowait?: boolean }

const speedOf = (e: Enemy): number => { const D = ENEMIES[e.k]; if (!D) return 40; if (e.k === 'ram') return (D.speed + D.speedMax!) / 2; return e.spd || D.speed; };
const BITE = (k: string): number => (ENEMIES[k]?.bite || ENEMIES[k]?.peck || 40);
/** a partial "enemy" used for virtual / baseline estimates (same as the prototype's object literals) */
const ve = (o: Record<string, unknown>): Enemy => o as unknown as Enemy;

export function makeC(level: Level, seed = 1, opt: COptions = {}): Bot {
  const P: CParams = { ...DEFAULT_PARAMS, ...(opt.params || {}) };
  const off = new Set(opt.off || []);
  const on = (m: string): boolean => !off.has(m);
  const omni = !!opt.omni;
  const seenAt = new Map<number, number>();
  let last = -99; let swapDone = -1;
  const kr = opt.kid ? prng(seed * 7919 + 13) : null; const reactT = new Map<number, number>(); const kidSpeed: Speed = opt.speedPct ?? 100;
  const reactOf = (id: number, S: SimState): number => { if (!kr) return P.react; if (!reactT.has(id)) reactT.set(id, Math.round((lognormal(kr, 2.2, 1.0) * TPS * speedAt(S, kidSpeed)) / 100)); return reactT.get(id)!; };
  const isWater = (S: SimState, l: number): boolean => !!S.waterNow[l];

  const wallCol = (S: SimState, l: number): number => { for (let c = COLS - 1; c >= 0; c--) { const u = topAt(S, l, c); if (u && u.k === 'wall' && !u.dead) return c; } return -1; };
  function standingFace(S: SimState, l: number): number { for (let c = COLS - 1; c >= 0; c--) { const u = topAt(S, l, c); if (u && !u.dead && !UNITS[u.k].flat && u.k !== 'raft') return c * T + 8000; } return 0; }
  function freeCol(S: SimState, card: string, l: number, cols: number[]): number {
    for (const c of cols) {
      if (c < 0 || c >= COLS || S.rock[l * 16 + c]) continue;
      const o = occupant(S, l, c);
      if (isWater(S, l)) { if (card === 'raft') { if (!o) return c; continue; } if (!o || (o.k === 'raft' && !o.top)) { if (UNITS[card].flat || card === 'farm' || card === 'bank') continue; return c; } continue; }
      if (!o) return c;
    }
    return -1;
  }
  function attackCols(S: SimState, l: number): number[] { const w = wallCol(S, l); const max = w >= 0 ? w - 1 : P.attackMax; const cols: number[] = []; for (let c = 1; c <= max; c++) cols.push(c); cols.push(0); return cols; }
  function acts4(S: SimState, card: string, l: number, col: number): Action[] | null {
    if (col < 0) return null;
    if (card !== 'strike' && card !== 'raft' && isWater(S, l)) {
      const o = occupant(S, l, col);
      if (!o) { if (inLoadout(S, 'raft') && affordable(S, 'raft') && (S.L.belt || S.grain >= UNITS.raft.cost + UNITS[card].cost)) return [{ t: 'place', card: 'raft', lane: l, col }]; return null; }
    }
    return canPlace(S, card, l, col) === null ? [{ t: 'place', card, lane: l, col }] : null;
  }

  function seen(S: SimState): Enemy[] {
    const list: Enemy[] = [];
    for (const e of S.enemies) {
      if (!visible(S, e, { omni })) continue;
      if (!seenAt.has(e.id)) seenAt.set(e.id, S.tick);
      if (S.tick - seenAt.get(e.id)! < reactOf(e.id, S)) continue;
      list.push(e);
    }
    if (omni && P.lookahead > 0) for (let i = S.si; i < S.spawns.length; i++) {
      const s = S.spawns[i]; if (s.t > S.tick + P.lookahead) break;
      const k = s.k === 'swarm' ? 'ant' : s.k; if (!ENEMIES[k]) continue;
      for (let j = 0; j < (s.k === 'swarm' ? 6 : 1); j++) list.push(ve({ id: -1 - i * 10 - j, k, lane: s.lane, x: 80000 + j * 2500, hp: ENEMIES[k].hp, sh: ENEMIES[k].shield || 0, layer: ENEMIES[k].layer, spd: ENEMIES[k].speed, virtual: (s.t - S.tick) / TPS }));
    }
    return list;
  }
  function dpsOf(S: SimState, u: Unit, e: Enemy): number {
    if (u.dead || u.pin) return 0;
    if (e.boss) return bossDps(S, u.k, e);
    if (u.k === 'radial') { const dx = e.x - (u.col * T + 5000), dy = (e.lane - u.lane) * T; return dx * dx + dy * dy <= 25000 * 25000 ? dpsVs('radial', e.k, S, e) : 0; }
    if (u.lane !== e.lane || !ATTACK.includes(u.k) || e.x < u.col * T + 3000) return 0;
    if ((u.k === 'shooter' || u.k === 'beam') && inSmoke(S, u.lane, u.col)) return 0;
    if (u.k === 'beam' && e.x > u.col * T + 5000 + 5 * T) return 0;
    return dpsVs(u.k, e.k, S, e);
  }
  function bossDps(S: SimState, card: string, e: Enemy): number {
    if (e.k === 'rhino') { const ph = e.boss!.phase; if (ph === 2) return card === 'lobber' ? 18 : card === 'beam' && !isNight(S) ? 30 : 0; return dpsVs(card, ph === 3 ? 'walker' : 'brute', S); }
    if (e.k === 'owl') return e.highOnly ? (card === 'radial' ? 13 : 0) : dpsVs(card, 'walker', S);
    if (e.untargetable || e.k === 'shipproxy') return 0;
    return dpsVs(card, 'walker', S);
  }
  function laneInfo(S: SimState, l: number, list: Enemy[]): LaneInfo {
    const es0 = list.filter((e) => e.lane === l && e.k !== 'shipproxy' && !e.untargetable);
    const face = standingFace(S, l); const w = wallCol(S, l); const wall = w >= 0 ? topAt(S, l, w) : null;
    let bite = 0; for (const e of es0) bite += BITE(e.k);
    const wallT = wall ? Math.min(60, wall.hp / Math.max(10, bite)) : 0;
    const es = es0.map((e) => {
      const v = speedOf(e) * TPS; const air = ENEMIES[e.k]?.layer === 'air' && !(e.downUntil > S.tick);
      const tgt = air ? Math.max(0, face - T) : e.layer === 'under' ? 0 : face;
      const t = Math.max(0.5, (e.x - tgt) / Math.max(1, v)) + (air ? 0 : wallT) + (e.virtual || 0);
      const hp = (e.hp ?? 500) + (e.sh || 0) * 0.6;
      return { e, t, hp };
    }).sort((a, b) => a.t - b.t);
    let cum = 0, need = 0, minT = 1e9;
    for (const x of es) { cum += x.hp; need = Math.max(need, cum / (x.t + 3)); minT = Math.min(minT, x.t); }
    let have = 0, tot = 0;
    for (const x of es) { let d = 0; for (const u of S.units) d += dpsOf(S, u, x.e); have += d * x.hp; tot += x.hp; }
    have = tot ? have / tot : 0;
    return { l, es, need: need * P.safety, have, deficit: need * P.safety - have, minT, w };
  }
  function cardValue(S: SimState, c: string, es: { e: Enemy; hp: number }[]): number {
    if (!ATTACK.includes(c) || !inLoadout(S, c)) return 0;
    if (c === 'beam' && isNight(S) && on('adapt')) return 0;
    let v = 0;
    for (const x of es) {
      const e = x.e; let d = e.boss ? bossDps(S, c, e) : on('counter') ? dpsVs(c, e.k, S, e) : (ENEMIES[e.k]?.layer === 'air' ? (c === 'radial' ? 10 : 0) : 12);
      if (!on('aoe') && c === 'burner' && e.k === 'ant') d /= 4;
      v += d * x.hp;
    }
    return v / (S.L.belt ? 100 : UNITS[c].cost);
  }
  function attackChoice(S: SimState, _l: number, es: { e: Enemy; hp: number }[]): { card: string | null; reserve?: string } {
    const cs = cards(S).filter((c) => ATTACK.includes(c));
    let best: string | null = null, bv = 0, bestAff: string | null = null, bav = 0;
    for (const c of cs) { const v = cardValue(S, c, es); if (v > bv) { bv = v; best = c; } if (affordable(S, c) && v > bav) { bav = v; bestAff = c; } }
    if (!best) return { card: null };
    if (best === bestAff) return { card: best };
    if (!on('save') || S.L.belt) return { card: bestAff };
    const waitG = Math.max(0, UNITS[best].cost - S.grain) / 8; const waitCd = Math.max(0, (S.cdReady[best] ?? 0) - S.tick) / TPS;
    if (Math.max(waitG, waitCd) <= P.waitMax && bav < 0.75 * bv) return { card: null, reserve: best };
    return { card: bestAff };
  }

  function income(S: SimState): number {
    let g = (S.skyNext >= 0 && !isNight(S)) ? 20 / 8 : 0;
    for (const u of S.units) { if (u.k === 'farm') g += (isNight(S) ? 10 : 20) / 18; else if (u.k === 'bank') g += 50 / 16; }
    return Math.max(0.5, g);
  }
  const prevKinds = new Set<string>();
  for (const sp of level.spawns || []) { const k = sp[2]; prevKinds.add(k.startsWith('boss:') ? k.slice(5) : k === 'swarm' ? 'ant' : k); }
  const inner: Bot = function C(S: SimState): Action[] {
    const acts: Action[] = [];
    for (const d of S.drops) if (S.tick - d.t >= P.react) acts.push({ t: 'collect', id: d.id });
    if (S.tick - last < P.every) return acts;
    last = S.tick;
    const L = S.L; const lanes = activeLanes(S); const list = seen(S); const remaining = (S.endTick - S.tick) / TPS;
    if (S.boss?.type === 'fortress' && S.boss.swapOpen && !S.boss.swapUsed && on('swap') && swapDone !== S.boss.move) {
      swapDone = S.boss.move!; const mv = MOVES[S.boss.move!]; const lo = S.loadout || [];
      const need = mv.counters.find((c) => !lo.includes(c));
      const out = lo.find((c) => !['shooter', 'farm', 'lobber', 'wall', 'burner', ...mv.counters].includes(c)) || lo.find((c) => !mv.counters.includes(c) && !['shooter', 'farm', 'lobber'].includes(c));
      if (need && out) acts.push({ t: 'swap', out, in: need });
    }
    if (on('mark')) {
      const pri = list.filter((e) => e.id > 0 && ['drummer', 'tower', 'shipdrum', 'shiparm', 'smoker'].includes(e.k)).sort((a, b) => a.x - b.x)[0];
      if (pri && S.mark !== pri.id) acts.push({ t: 'mark', id: pri.id });
    }
    const info = lanes.map((l) => laneInfo(S, l, list));
    const order = on('priority') ? info.slice().sort((a, b) => b.deficit - a.deficit) : info.slice().sort((a, b) => ((a.l * 7 + (S.tick >> 6)) % 5) - ((b.l * 7 + (S.tick >> 6)) % 5));
    const short = order.filter((x) => x.deficit > 0.5 && x.es.some((y) => y.e.id > 0 || omni));
    const wants: Want[] = [];
    const want = (pri: number, card: string | null | undefined, lane: number, cols: number[] | 'any', nowait?: boolean): void => {
      if (!card || !inLoadout(S, card)) return; const col = cols === 'any' ? 0 : freeCol(S, card, lane, cols); if (col >= 0) wants.push({ pri, card, lane, col, nowait });
    };
    // emergency
    for (const x of short) {
      if (x.minT > 5) continue;
      const front = x.es.find((y) => y.e.id > 0); if (!front) continue;
      if (affordable(S, 'strike') || (L.belt && S.belt.includes('strike'))) { acts.push({ t: 'place', card: 'strike', lane: front.e.lane, col: Math.max(0, Math.min(COLS - 1, tileOf(front.e.x + 3000))) }); return acts; }
      if (S.tokens > 0) { const u = attackersIn(S, x.l).sort((a, b) => b.col - a.col)[0] || laneUnits(S, x.l).find((v) => v.k === 'wall'); if (u) { acts.push({ t: 'token', lane: u.lane, col: u.col }); return acts; } }
    }
    if (S.tokens > 0 && short.length && short[0].minT < 12) { const u = attackersIn(S, short[0].l).sort((a, b) => b.col - a.col)[0]; if (u) { acts.push({ t: 'token', lane: u.lane, col: u.col }); return acts; } }
    if (affordable(S, 'strike') || (L.belt && S.belt.includes('strike'))) {
      let best: Enemy | null = null, bv = 0;
      for (const e of list) {
        if (e.id < 0 || e.layer === 'under' || e.highOnly) continue;
        let v = 0; for (const o of list) if (o.id > 0 && Math.abs(o.lane - e.lane) <= 1 && Math.abs(o.x - e.x) <= 1.2 * T && o.layer !== 'under' && !o.highOnly) v += o.boss ? 70 : threatOf(o);
        if (e.boss?.type === 'owl' && e.boss.state === 'down') v += 120;
        if (e.boss?.type === 'rhino' && e.boss.phase === 2) v += 80;
        if (v > bv) { bv = v; best = e; }
      }
      if (best && bv >= (on('timing') ? P.strikeMin : 1)) { acts.push({ t: 'place', card: 'strike', lane: best.lane, col: Math.max(0, Math.min(COLS - 1, tileOf(best.x + 3000))) }); return acts; }
    }
    if (on('detect')) for (const e of S.enemies) {
      if (e.k !== 'tunneler' || e.layer !== 'under' || e.revealed) continue;
      if (!seenAt.has(e.id)) seenAt.set(e.id, S.tick);
      if (S.tick - seenAt.get(e.id)! < P.react || S.units.some((u) => u.k === 'listener' && u.lane === e.lane)) continue;
      want(92, 'listener', e.lane, [7, 6, 5]);
    }
    if (on('control')) for (const e of list) {
      const l = e.lane; const w = wallCol(S, l);
      if (e.k === 'ram' && !laneUnits(S, l).some((u) => u.k === 'spikes')) {
        if (w >= 0) want(81, 'spikes', l, [w + 1, w + 2].filter((c) => c < COLS && c * T + 8000 < e.x));
        else if (inLoadout(S, 'wall') && e.x > (P.wallCol + 2) * T) want(80, 'wall', l, [P.wallCol, 4]);
        else {
          let f = -1; for (let c = COLS - 1; c >= 0; c--) { const u = topAt(S, l, c); if (u && !u.dead && !UNITS[u.k].flat && u.k !== 'raft') { f = c; break; } }
          if (f >= 0) want(81, 'spikes', l, [f + 1, f + 2].filter((c) => c < COLS && c * T + 8000 < e.x));
          else if (affordable(S, 'spikes')) want(80, 'spikes', l, [6, 5].filter((c) => c * T + 8000 < e.x));
        }
      }
      if (e.k === 'rhino') {
        const t0 = tileOf(e.x), t1 = Math.min(COLS - 1, tileOf(e.x + 15000));
        if (w < 0) want(78, 'wall', l, [P.wallCol + 1, P.wallCol, 4]);
        if (e.boss!.phase! >= 2 && !laneUnits(S, l).some((u) => u.k === 'spikes' && u.col >= t0 && u.col <= t1)) want(80, 'spikes', l, [t0 + 1, t0, t0 + 2].filter((c) => c <= t1 && c < COLS));
      }
      if (e.k === 'ladder' && !laneUnits(S, l).some((u) => u.k === 'hook')) { if (w >= 1) want(78, 'hook', l, [w - 1, w - 2]); else if (inLoadout(S, 'wall') && e.x > (P.wallCol + 1) * T) want(78, 'wall', l, [P.wallCol, P.wallCol + 1, 3]); else want(70, 'hook', l, [3, 2]); }
      if (e.k === 'boat' && !laneUnits(S, l).some((u) => u.k === 'hook')) want(70, 'hook', l, [3, 4, 2]);
      if (e.k === 'smoker' && !laneUnits(S, l).some((u) => u.k === 'gust')) want(70, 'gust', l, [1, 0, 2, 3, 4]);
      if (e.k === 'smoker' && on('adapt') && e.x < 6.5 * T && !laneUnits(S, l).some((u) => u.k === 'lobber')) want(78, 'lobber', l, attackCols(S, l));
      if (e.k === 'owl' && !laneUnits(S, l).some((u) => u.k === 'gust')) want(68, 'gust', l, [4, 0, 1, 2, 3]);
      if ((e.k === 'flyer' || e.k === 'flyer_m') && !inLoadout(S, 'radial') && !laneUnits(S, l).some((u) => u.k === 'gust')) want(68, 'gust', l, [2, 1, 3, 0]);
    }
    if (on('depth') && L.warn && inLoadout(S, 'pit')) for (const w of L.warn) {
      if (S.tick < (w.t - 16) * TPS || S.tick >= (w.t - 1) * TPS || (w.feint && on('feint'))) continue;
      for (const ln of w.lanes) if (L.lanes[ln] && laneUnits(S, ln).filter((u) => u.k === 'pit').length < 2) want(71, 'pit', ln, [6, 5, 7, 4]);
    }
    if (on('control') && inLoadout(S, 'gust')) for (const e of list) {
      if (!(e.k === 'flyer' || e.k === 'ant') || e.x > 6 * T) continue;
      if (laneUnits(S, e.lane).some((u) => u.k === 'gust')) continue;
      want(e.k === 'flyer' ? 67 : 63, 'gust', e.lane, [0, 1, 4, 2]); break;
    }
    if (on('preview') && prevKinds.has('flyer') && inLoadout(S, 'radial') && S.tick > 35 * TPS && !S.units.some((u) => u.k === 'radial')) want(58, 'radial', lanes[Math.floor(lanes.length / 2)], [2, 3, 1]);
    if (on('preview') && prevKinds.has('flyer') && !inLoadout(S, 'radial') && inLoadout(S, 'gust') && S.tick > 30 * TPS)
      for (const l of lanes) if (!laneUnits(S, l).some((u) => u.k === 'gust')) { want(46, 'gust', l, [0, 1, 4]); break; }
    if (on('adapt') && S.dawnAt != null && S.tick >= S.dawnAt && inLoadout(S, 'beam') && S.units.filter((u) => u.k === 'beam').length < 2) {
      const x = order.find((y) => y.es.some((z) => ENEMIES[z.e.k]?.mat === 'metal')) || order[0];
      if (x) want(70, 'beam', x.l, attackCols(S, x.l));
    }
    if (on('synergy')) for (const l of lanes) if (S.smokeHard[l]) {
      if (!laneUnits(S, l).some((u) => u.k === 'gust')) want(81, 'gust', l, [0, 1, 2]);
      else if (!laneUnits(S, l).some((u) => u.k === 'burner')) want(81, 'burner', l, [1, 2, 0]);
    }
    if (on('preview') && !L.belt) {
      const pv = prevKinds;
      const heavyComing = ['ram', 'brute', 'carrier', 'tower', 'ladder', 'rhino'].some((k) => pv.has(k));
      const mv = S.boss?.type === 'fortress' && S.boss.move! >= 0 ? MOVES[S.boss.move!] : null;
      const moveSoon = mv && (S.boss!.phase === 'preview' || S.tick < S.boss!.sch!.moves[S.boss!.move!].start + 120);
      const landLanes = lanes.filter((l) => !isWater(S, l));
      const econN = S.units.filter((u) => ECON.includes(u.k)).length;
      if ((heavyComing && P.prepWalls && econN >= P.econDay - 1 && S.boss?.type !== 'fortress') || (mv && ['chong', 'ti', 'fenwen', 'lin'].includes(mv.id)) || (S.boss?.type === 'fortress' && S.boss.move! < 0 && S.tick > 30 * TPS)) for (const l of landLanes) if (wallCol(S, l) < 0) want(mv ? 74 : 40, 'wall', l, [P.wallCol, 4]);
      if (moveSoon && mv) {
        for (const l of landLanes) {
          const w = wallCol(S, l);
          if (mv.id === 'chong' && w >= 0 && !laneUnits(S, l).some((u) => u.k === 'spikes')) want(73, 'spikes', l, [w + 1]);
          if (mv.id === 'ti' && !laneUnits(S, l).some((u) => u.k === 'hook')) want(73, 'hook', l, [w >= 1 ? w - 1 : 4, 3]);
          if (mv.id === 'yifu' && !laneUnits(S, l).some((u) => u.k === 'burner')) want(73, 'burner', l, attackCols(S, l));
          if (mv.id === 'xue' && !laneUnits(S, l).some((u) => u.k === 'listener')) want(76, 'listener', l, [7, 6]);
          if ((mv.id === 'que' || mv.id === 'shui') && l % 2 === 1 && !S.units.some((u) => u.k === 'radial' && Math.abs(u.lane - l) <= 1)) want(73, 'radial', l, [2, 3, 1]);
          if (mv.id === 'yan' && [1, 2, 3].includes(l)) { if (!laneUnits(S, l).some((u) => u.k === 'gust')) want(75, 'gust', l, [0, 1, 4]); else if (!laneUnits(S, l).some((u) => u.k === 'burner')) want(75, 'burner', l, [1, 2, 0]); }
          if ((mv.id === 'fenwen' || mv.id === 'lin') && !laneUnits(S, l).some((u) => u.k === 'lobber')) want(70, 'lobber', l, attackCols(S, l));
        }
      }
      if ((pv.has('boat') || pv.has('ship')) && S.tick > 15 * TPS && (econN >= P.econDay - 2 || S.enemies.some((e) => e.layer === 'water' || e.boss))) for (const l of lanes.filter((x) => isWater(S, x))) if (attackersIn(S, l).length < (pv.has('ship') ? 2 : 1)) { const ch = attackChoice(S, l, [{ e: ve({ k: 'boat', lane: l, x: 80000 }), hp: 300 }]); const c = ch.card || ch.reserve; if (c) want(49, c, l, [0, 1, 2]); }
    }
    if (on('counter')) for (const e of list) {
      if (!(ENEMIES[e.k]?.layer === 'air' || e.k === 'owl')) continue;
      if (S.units.some((u) => u.k === 'radial' && Math.abs(u.lane - e.lane) <= 1)) continue;
      const ln = Math.max(lanes[0], Math.min(lanes[lanes.length - 1], e.lane));
      for (const c2 of [ln, ln + 1, ln - 1]) if (lanes.includes(c2)) { want(84, 'radial', c2, [2, 3, 1, 4]); break; }
      break;
    }
    if (on('aoe')) for (const e of list) { if (e.k !== 'ant' || laneUnits(S, e.lane).some((u) => u.k === 'burner')) continue; want(79, 'burner', e.lane, attackCols(S, e.lane), e.x < 5.5 * T); break; }
    if (on('aoe') && inLoadout(S, 'wall')) for (const e of list) { if (e.k !== 'ant' || e.x < 4.5 * T || wallCol(S, e.lane) >= 0 || !laneUnits(S, e.lane).some((u) => u.k === 'burner')) continue; const bc = laneUnits(S, e.lane).filter((u) => u.k === 'burner').reduce((m, u) => Math.max(m, u.col), 0); want(78, 'wall', e.lane, [bc + 2, bc + 1, bc + 3].filter((c) => c < COLS && c * T + 8000 < e.x)); break; }
    for (const x of (opt.noEmerg ? [] : info)) {
      if (attackersIn(S, x.l).length || !x.es.length || x.minT > 14 || !x.es.some((y) => y.e.id > 0 && ENEMIES[y.e.k]?.layer !== 'air') || !x.es.filter((y) => !y.e.boss && ENEMIES[y.e.k]?.layer !== 'air').every((y) => ['walker', 'shielder', 'smoker', 'ladder', 'drummer'].includes(y.e.k))) continue;
      let best: string | null = null, bd = 0;
      for (const c of cards(S)) { if (!ATTACK.includes(c) || !affordable(S, c)) continue; const d = x.es.reduce((a, y) => a + (y.e.boss ? 1 : dpsVs(c, y.e.k, S, y.e)), 0); if (d <= 0) continue; const sc = d / UNITS[c].cost; if (sc > bd) { bd = sc; best = c; } }
      if (best) want(85, best, x.l, best === 'radial' ? [2, 3, 1, 4] : attackCols(S, x.l));
    }
    for (const x of short) {
      const ch = attackChoice(S, x.l, x.es); const c = ch.card || ch.reserve; if (!c) continue;
      want(60 + Math.min(19, x.deficit), c, x.l, c === 'radial' ? [2, 3, 1, 4] : attackCols(S, x.l));
    }
    if (on('depth')) for (const x of order) {
      if (x.w >= 0 || !x.es.length) continue;
      const big = x.es.some((y) => (ENEMIES[y.e.k]?.wt === 'heavy' || (y.e.boss && !y.e.highOnly)) && y.t < 25);
      const heavy = big || x.es.filter((y) => y.t < 15).length >= 3;
      if (!heavy || (P.wallHeavyOnly && !big)) continue;
      const fa = attackersIn(S, x.l).reduce((m, u) => Math.max(m, u.col), 0);
      want(big && attackersIn(S, x.l).length ? 72 : 55, 'wall', x.l, [Math.max(P.wallCol, fa + 1), fa + 1, fa + 2]);
    }
    if (on('synergy')) {
      for (const w of S.units.filter((u) => u.k === 'wall' && u.hp < u.max * 0.9)) {
        if (S.units.some((u) => u.k === 'repair' && Math.abs(u.lane - w.lane) <= 1 && Math.abs(u.col - w.col) <= 1)) continue;
        for (const [dl, dc] of [[0, -1], [1, 0], [-1, 0]]) { const ln = w.lane + dl; if (ln >= 0 && ln < LANES && L.lanes[ln]) want(45, 'repair', ln, [w.col + dc]); }
      }
      for (const u of S.units.filter((v) => v.k === 'burner')) if (!laneUnits(S, u.lane).some((v) => v.k === 'gust') && list.some((e) => e.lane === u.lane && (e.k === 'ant' || e.k === 'smoker'))) want(44, 'gust', u.lane, [4, 0, 1, 2, 3]);
    }
    if (on('econ') && !L.belt) {
      const night = isNight(S); const farms = S.units.filter((u) => u.k === 'farm').length, banks = S.units.filter((u) => u.k === 'bank').length;
      const early = S.tick < 70 * TPS ? 12 : 0; const calm = short.length && cards(S).some((c) => ATTACK.includes(c)) ? -40 : 0;
      if (on('invest') && remaining > 55 && banks < (night ? P.econNight : P.bankDay + (farms >= P.econDay ? 2 : 0))) for (const ln of lanes) want(38 + early + calm, 'bank', ln, [0]);
      const cap = night && inLoadout(S, 'bank') && on('invest') ? Math.min(2, P.econDay) : P.econDay;
      if (farms < cap && remaining > 32) { const ord = lanes.filter((l) => !isWater(S, l)).sort((a, b) => S.units.filter((u) => u.lane === a && ECON.includes(u.k)).length - S.units.filter((u) => u.lane === b && ECON.includes(u.k)).length); for (const ln of ord) { want(36 + early + calm, 'farm', ln, [0, 1]); break; } }
    }
    if (on('risk') && S.units.filter((u) => u.k === 'salvage').length < 3 && remaining > 40) {
      const ok = order.filter((x) => !isWater(S, x.l) && attackersIn(S, x.l).length >= 2 && !laneUnits(S, x.l).some((u) => u.k === 'salvage'));
      const busy = ok.sort((a, b) => b.es.length - a.es.length)[0];
      if (busy) { const w = wallCol(S, busy.l); want(short.length ? 20 : 34, 'salvage', busy.l, w >= 1 ? [w - 1, w - 2, 1] : [2, 1]); }
    }
    const flags = S.flags || L.flags || []; const passed = flags.filter((f) => f <= S.tick + P.prepLead * TPS).length;
    let base = passed === 0 ? (S.enemies.length ? P.base1 : 0) : passed === 1 ? P.base2 : P.base3;
    if (on('preview') && L.env?.fogCol != null && S.tick > 20 * TPS) base = Math.max(base, 1);
    if (base > 0) for (const ln of lanes.slice().sort((a, b) => attackersIn(S, a).length - attackersIn(S, b).length)) {
      if (attackersIn(S, ln).length >= base || (isWater(S, ln) && !inLoadout(S, 'raft'))) continue;
      const x = info.find((y) => y.l === ln)!; const es = x.es.length ? x.es : [{ e: ve({ k: 'walker', lane: ln, x: 80000 }), hp: 180 }];
      const ch = attackChoice(S, ln, es); const c = ch.card || ch.reserve; if (c) want(48 - attackersIn(S, ln).length, c, ln, c === 'radial' ? [2, 3, 1] : attackCols(S, ln));
    }
    if (!L.belt && S.grain > P.surplus && (S.tick > 60 * TPS || S.units.filter((u) => ECON.includes(u.k)).length >= (isNight(S) ? P.econNight : P.econDay))) {
      const x = order[0]; const es = x.es.length ? x.es : [{ e: ve({ k: 'walker', lane: x.l, x: 80000 }), hp: 180 }]; const ch = attackChoice(S, x.l, es); if (ch.card) want(10, ch.card, x.l, attackCols(S, x.l));
    }
    if (!cards(S).some((c) => ATTACK.includes(c))) for (const x of order) {
      if (!x.es.length && S.tick < 25 * TPS) continue;
      const l = x.l; const w = wallCol(S, l); const near = x.es.length > 0;
      if (w < 0) want(near ? 75 : 50, 'wall', l, [5, 4, 6]);
      else {
        if (!laneUnits(S, l).some((u) => u.k === 'hook')) want(near ? 72 : 45, 'hook', l, [w - 1, w - 2]);
        if (x.es.some((y) => ['ram', 'ladder', 'brute'].includes(y.e.k)) && !laneUnits(S, l).some((u) => u.k === 'spikes')) want(70, 'spikes', l, [w + 1]);
        if (near) want(66, 'pit', l, [w + 2, w + 1, 7]);
        if (x.es.some((y) => y.e.k === 'ant') && !laneUnits(S, l).some((u) => u.k === 'gust')) want(64, 'gust', l, [0, 1, 2]);
        const wall = topAt(S, l, w); if (wall && wall.hp < wall.max * 0.8 && !S.units.some((u) => u.k === 'repair' && Math.abs(u.lane - l) <= 1 && Math.abs(u.col - w) <= 1)) want(62, 'repair', l, [w - 2, w - 1]);
        if (wall && wall.hp < wall.max * 0.35) want(68, 'wall', l, [w - 2, w + 1]);
      }
    }
    if (L.belt && S.belt.length) {
      const c = S.belt[0];
      if (c === 'strike') {
        let best: Enemy | null = null, bv = 0;
        for (const e of list) { if (e.id < 0 || e.layer === 'under') continue; let v = 0; for (const o of list) if (o.id > 0 && Math.abs(o.lane - e.lane) <= 1 && Math.abs(o.x - e.x) <= 1.2 * T) v += threatOf(o); if (e.x < 3 * T) v += 30; if (v > bv) { bv = v; best = e; } }
        if (best && (bv >= 30 || S.belt.length >= 5)) { acts.push({ t: 'place', card: 'strike', lane: best.lane, col: Math.max(0, tileOf(best.x + 3000)) }); return acts; }
      } else {
        const score = (x: LaneInfo): number => {
          const l = x.l; const es = x.es; const w = wallCol(S, l); let v = Math.max(0, x.deficit) + es.length * 0.5;
          if (ATTACK.includes(c)) { const val = cardValue(S, c, es.length ? es : [{ e: ve({ k: 'walker' }), hp: 180 }]); if (!val) return -1; v += val * 30 - attackersIn(S, l).length * 2; }
          else if (c === 'wall') { if (w >= 0) return -1; v += es.some((y) => ENEMIES[y.e.k]?.wt === 'heavy') ? 10 : 0; }
          else if (c === 'spikes') { if (laneUnits(S, l).some((u) => u.k === 'spikes')) return -1; v += es.some((y) => y.e.k === 'ram' || y.e.k === 'ladder') ? 20 : 0; }
          else if (c === 'hook') { if (laneUnits(S, l).some((u) => u.k === 'hook')) return -1; v += es.some((y) => y.e.k === 'ladder' || y.e.k === 'boat') ? 20 : 0; }
          else if (c === 'gust') { if (laneUnits(S, l).some((u) => u.k === 'gust')) return -1; v += es.some((y) => ['ant', 'flyer', 'smoker'].includes(y.e.k)) ? 20 : 0; }
          else if (c === 'listener') { if (laneUnits(S, l).some((u) => u.k === 'listener')) return -1; v += S.enemies.some((e) => e.k === 'tunneler' && e.lane === l) ? 30 : 0; }
          else if (c === 'raft') { if (!isWater(S, l)) return -1; v += 5 - laneUnits(S, l).length; }
          return v;
        };
        const cand = info.map((x) => ({ x, v: score(x) })).filter((y) => y.v >= 0).sort((a, b) => b.v - a.v);
        for (const { x } of cand) {
          const l = x.l; const w = wallCol(S, l);
          const cols = ATTACK.includes(c) ? (c === 'radial' ? [2, 3, 1] : attackCols(S, l)) : c === 'wall' ? [P.wallCol, P.wallCol + 1, 3] : c === 'hook' ? [w >= 1 ? w - 1 : 3, 2] : c === 'spikes' ? [w >= 0 ? w + 1 : 6, 5] : c === 'listener' ? [7, 6] : c === 'gust' ? [0, 1, 4] : c === 'raft' ? [1, 2, 0, 3] : [4, 3, 2, 1];
          const col = freeCol(S, c, l, cols); const a = col >= 0 ? acts4(S, c, l, col) : null;
          if (a) { acts.push(...a); return acts; }
        }
      }
    }
    wants.sort((a, b) => b.pri - a.pri);
    const rate = income(S);
    let held = 0;
    for (const w of wants) {
      const cost = L.belt ? 0 : UNITS[w.card].cost;
      if (held && w.pri < 60 && S.grain - cost < held) continue;
      const a = acts4(S, w.card, w.lane, w.col);
      if (a) { acts.push(...a); return acts; }
      if (!L.belt && w.pri >= 30 && S.tick < (S.cdReady[w.card] ?? 0) && (S.cdReady[w.card] - S.tick) <= 6 * TPS) held = Math.max(held, cost);
      if (L.belt || !on('save')) continue;
      if (w.pri < 44) continue;
      const short1 = Math.max(0, UNITS[w.card].cost + (isWater(S, w.lane) && !occupant(S, w.lane, w.col) ? UNITS.raft.cost : 0) - S.grain) / rate;
      const cdw = Math.max(0, (S.cdReady[w.card] ?? 0) - S.tick) / TPS;
      if (cdw > 0 && short1 <= 0) continue;
      const maxWait = w.nowait ? 1 : w.pri >= 78 ? P.waitCounter : w.pri >= 60 ? P.waitMax : 3;
      if (short1 <= maxWait) return acts;
    }
    return acts;
  };
  if (!kr) return inner;
  let nextAct = 0; const collectAt = new Map<number, number>();
  return function K2(S: SimState): Action[] {
    const taps: Action[] = [];
    for (const d of S.drops) { if (!collectAt.has(d.id)) collectAt.set(d.id, kr() < 0.4 ? S.tick + Math.round((0.6 + kr() * 1.4) * TPS) : Infinity); if (S.tick >= collectAt.get(d.id)!) taps.push({ t: 'collect', id: d.id }); }
    if (S.tick < nextAct) return taps;
    const out: Action[] = [];
    for (const x of inner(S)) {
      if (x.t === 'collect') continue;
      if (x.t === 'place' && x.card !== 'strike' && x.card !== 'raft' && !S.waterNow[x.lane] && kr() < 0.15) {
        const alt = { ...x, col: x.col + (kr() < 0.5 ? -1 : 1) };
        out.push(alt.col >= 0 && alt.col < COLS && canPlace(S, alt.card, alt.lane, alt.col) === null ? alt : x);
      } else out.push(x);
    }
    if (out.some((x) => x.t === 'place')) nextAct = S.tick + Math.round(((0.8 + kr() * 0.8) * TPS * speedAt(S, kidSpeed)) / 100);
    return taps.concat(out);
  };
}
