// K  PvZ 老手娃 (the child today) and R 乱放娃 — port of proto/bots/k.mjs (rev d). K+ = K that follows 墨子's
// in-game hint with probability hintP. Habits are documented in the prototype; numbers must not change (V4b parity).
import { T, COLS, TPS, BOARD_X } from '../lane/rules';
import { UNITS, ENEMIES, MOVES } from '../lane/tables';
import { canPlace, isNight, tileOf, topAt, occupant } from '../lane/sim';
import { coachLine, makeCoachMemory, followed, type CoachLine } from '../lane/coach';
import { prng, lognormal, ATTACK, visible, laneUnits, attackersIn, inLoadout, affordable, activeLanes, placeActs, counterFor, cards, type Bot } from './common';
import type { Action, Enemy, Level, SimState } from '../lane/types';

/** game speed the child plays at: a number (%), or 'fast' = 1.5× that drops to 1× from 5 s before each 大波 until 25 s after it */
export type Speed = number | 'fast';
export function speedAt(S: SimState, speed: Speed): number {
  if (speed !== 'fast') return speed;
  if (S.L.env?.fogCol != null) return 100;
  for (const f of S.flags || S.L.flags || []) if (S.tick >= f - 100 && S.tick < f + 500) return 100;
  return 150;
}

export interface KOptions { hintP?: number; speedPct?: Speed; coachLifetime?: Record<string, number>; coachGap?: number }

export function makeK(level: Level, seed = 1, opt: KOptions = {}): Bot {
  const r = prng(seed * 104729 + 7);
  const hintP = opt.hintP ?? 0;
  const speed: Speed = opt.speedPct ?? 100;
  let curSpeed = typeof speed === 'number' ? speed : 100;
  const gs = (s: number): number => Math.round((s * TPS * curSpeed) / 100);
  const noticeAt = new Map<number, number>(); const collectAt = new Map<number, number>();
  const econTarget = 4 + Math.floor(r() * 3);
  const nightBank = level.newCard === 'bank' ? 0.5 : 0.6;
  let nextAct = 0; let hintNext = 0; let pendingHint: (CoachLine & { until: number }) | null = null;
  const coachMem = makeCoachMemory(opt.coachLifetime || {}); const hinted = new Set<string>(); const usedTaught = new Map<string, unknown>();
  if (opt.coachGap != null) coachMem.gap = opt.coachGap;
  const newCard = level.newCard, newEnemy = level.newEnemy;
  const favourite = r() < 0.75 ? 'shooter' : 'lobber';
  const BOSS_LANE = ({ rhino: 2 } as Record<string, number>)[level.boss?.type || '']; const keepBossLane = BOSS_LANE != null && hintP > 0 && r() < hintP;
  const misplace = (lane: number, col: number): [number, number] => {
    if (r() >= 0.15) return [lane, col];
    if (r() < 0.33) { const nl = lane + (r() < 0.5 ? -1 : 1); if (nl >= 0 && nl < 5 && level.lanes[nl]) return [nl, col]; }
    return [lane, Math.max(0, Math.min(COLS - 1, col + (r() < 0.5 ? -1 : 1)))];
  };
  const TAUGHT: Record<string, string> = { shielder: 'lobber', ram: 'spikes', ant: 'burner', brute: 'beam', flyer: 'radial', smoker: 'gust', ladder: 'hook', boat: 'hook', carrier: 'lobber', tunneler: 'listener', tower: 'lobber', shielder_m: 'lobber', flyer_m: 'radial', rhino: 'lobber', owl: 'radial', shiparm: 'hook', shipdock: 'lobber', shipdrum: 'lobber' };
  function attackCard(S: SimState, _lane: number, kinds: string[]): string | null {
    const lo = cards(S);
    if (newCard && ATTACK.includes(newCard) && lo.includes(newCard) && (kinds.includes(newEnemy!) || r() < 0.3) && r() < 0.6) return newCard;
    for (const k of kinds) { const c = TAUGHT[k]; if (!c || !ATTACK.includes(c) || !lo.includes(c)) continue; if (r() < (k === newEnemy ? 0.7 : 0.5) && !(c === 'beam' && isNight(S))) return c; }
    if (lo.includes(favourite)) return favourite;
    const att = lo.filter((c) => ATTACK.includes(c)); return att.length ? att[0] : null;
  }
  function placeAt(S: SimState, acts: Action[], card: string, lane: number, col: number, exact: boolean): boolean {
    if (S.L.belt ? !S.belt.includes(card) : !affordable(S, card)) return false;
    let [ln, c] = exact ? [lane, col] : misplace(lane, col);
    if (card !== 'strike' && canPlace(S, card, ln, c) !== null && !(S.waterNow[ln] && card !== 'raft')) { [ln, c] = [lane, col]; }
    const a = placeActs(S, card, ln, c);
    if (!a.length) return false;
    const a0 = a[0] as { card: string };
    if (a0.card === card && canPlace(S, card, ln, c) !== null) return false;
    if (a0.card === 'raft' && canPlace(S, 'raft', ln, c) !== null) return false;
    acts.push(...a); nextAct = S.tick + gs(0.8 + r() * 0.8); return true;
  }
  const firstFree = (S: SimState, card: string, lane: number, cols: number[]): number => {
    for (const c of cols) { if (c < 0 || c >= COLS) continue; const o = occupant(S, lane, c); if (S.rock[lane * 16 + c]) continue; if (!o || (S.waterNow[lane] && o.k === 'raft' && !o.top && card !== 'raft')) return c; }
    return -1;
  };
  const wallCol = (S: SimState, lane: number): number => { for (let c = COLS - 1; c >= 0; c--) { const u = topAt(S, lane, c); if (u && u.k === 'wall') return c; } return -1; };
  // (the prototype's unused hintFor() — the coach replaced it — is not ported)
  void hintNext; void hinted; void counterFor;
  function taughtCol(S: SimState, card: string, lane: number): number { const pref = taughtPref(S, card, lane); if (!pref.length) return -1; const c = firstFree(S, card, lane, pref); return c >= 0 ? c : pref[0]; }
  function taughtPref(S: SimState, card: string, lane: number): number[] {
    const wc = wallCol(S, lane);
    switch (card) {
      case 'spikes': return wc >= 0 ? [wc + 1, wc + 2] : [5, 6, 4];
      case 'pit': return [5, 6, 4];
      case 'hook': return wc >= 1 ? [wc - 1, wc - 2] : [];
      case 'gust': return [1, 2, 0, 3];
      case 'wall': { const fa = attackersIn(S, lane).reduce((m, u) => Math.max(m, u.col), -1); return fa >= 0 ? [fa + 2, fa + 1, fa + 3].filter((c) => c < COLS) : [4, 3, 5]; }
      case 'listener': return [6, 5];
      case 'repair': return wc >= 1 ? [wc - 1, wc - 2] : [2, 3];
      case 'salvage': return [3, 2, 4];
      case 'radial': return [2, 1, 3];
      default: return [2, 1, 3];
    }
  }

  const K: Bot = function K(S: SimState): Action[] {
    curSpeed = speedAt(S, speed);
    const acts: Action[] = [];
    for (const d of S.drops) {
      if (!collectAt.has(d.id)) collectAt.set(d.id, r() < 0.4 ? S.tick + gs(0.6 + r() * 1.4) : Infinity);
      if (S.tick >= collectAt.get(d.id)!) acts.push({ t: 'collect', id: d.id });
    }
    if (S.tick < nextAct) return acts;
    const L = S.L; const lanes = activeLanes(S); const t = S.tick / TPS;
    const list: Enemy[] = [];
    for (const e of S.enemies) {
      if (!visible(S, e)) continue;
      if (!noticeAt.has(e.id)) noticeAt.set(e.id, S.tick + gs(lognormal(r, 2.2, 1.0)));
      if (S.tick >= noticeAt.get(e.id)!) list.push(e);
    }
    for (const e of S.enemies) if (e.k === 'tunneler' && e.layer === 'under' && !e.revealed) { if (!noticeAt.has(e.id)) noticeAt.set(e.id, S.tick + gs(lognormal(r, 2.6, 1.2))); }
    if (S.boss && S.boss.type === 'fortress' && S.boss.swapOpen && !S.boss.swapUsed && hintP > 0 && !usedTaught.has('swap' + S.boss.move)) {
      usedTaught.set('swap' + S.boss.move, 1);
      if (r() < hintP) { const mv = MOVES[S.boss.move!]; const need = mv.counters.find((c) => !(S.loadout || []).includes(c)); const out = (S.loadout || []).find((c) => !['shooter', 'farm', 'lobber', 'wall', ...mv.counters].includes(c)); if (need && out) acts.push({ t: 'swap', out, in: need }); }
    }
    // coach (K+): 墨子 says a line, the card glows and the ghost hand taps the cell; K+ follows with p = hintP
    if (hintP > 0) {
      let h = pendingHint && S.tick < pendingHint.until ? pendingHint : null;
      if (!h) {
        const line = coachLine(S, coachMem); if (line && coachMem.gap != null) coachMem.next = S.tick + coachMem.gap;
        if (line && r() < hintP) { h = { ...line, until: S.tick + gs(8) }; pendingHint = h; if (line.type !== 'boss') followed(coachMem, line); }
      }
      if (h) {
        const hc = h.card!, hl = h.lane!, hcol = h.col!;
        if (h.swap) {
          if (affordable(S, hc) && occupant(S, hl, hcol)) { acts.push({ t: 'shovel', lane: hl, col: hcol }, { t: 'place', card: hc, lane: hl, col: hcol }); pendingHint = null; nextAct = S.tick + gs(1.5 + r()); return acts; }
          if (!occupant(S, hl, hcol)) pendingHint = null;
          else return acts;
        }
        const ok = (S.L.belt ? S.belt.includes(hc) : affordable(S, hc)) && canPlace(S, hc, hl, hcol) === null;
        if (ok) { acts.push({ t: 'place', card: hc, lane: hl, col: hcol }); pendingHint = null; nextAct = S.tick + gs(0.8 + r() * 0.8); return acts; }
        const danger = S.enemies.some((e) => e.hp > 0 && !e.gone && e.lane !== hl && e.layer !== 'under' && e.x < BOARD_X && (
          (e.x < 3 * T && !S.units.some((u) => !u.dead && u.lane === e.lane && ATTACK.includes(u.k))) ||
          S.units.some((u) => !u.dead && u.lane === e.lane && !UNITS[u.k].flat && e.x - (u.col * T + 8000) < 2.5 * T && e.x > u.col * T)));
        let inc = S.skyNext >= 0 && !isNight(S) ? 2.5 : 0; for (const u of S.units) if (!u.dead) inc += u.k === 'farm' ? (isNight(S) ? 0.55 : 1.1) : u.k === 'bank' ? 3.1 : 0;
        const shortS = (UNITS[hc].cost - S.grain) / Math.max(0.5, inc);
        if (!danger && shortS <= 3 && (canPlace(S, hc, hl, hcol) === 'grain' || canPlace(S, hc, hl, hcol) === 'cd')) return acts;
        if (canPlace(S, hc, hl, hcol) !== null) pendingHint = null;
      }
    }
    if (affordable(S, 'strike') || (L.belt && S.belt.includes('strike'))) {
      for (const e of list) { if (e.x > 2.5 * T || e.layer === 'under') continue; const n = list.filter((o) => Math.abs(o.lane - e.lane) <= 1 && Math.abs(o.x - e.x) <= 1.2 * T).length; if (n >= 3) { acts.push({ t: 'place', card: 'strike', lane: e.lane, col: Math.max(0, tileOf(e.x)) }); nextAct = S.tick + gs(1); return acts; } }
    }
    if (S.tokens >= 3) { const us = S.units.filter((u) => ATTACK.includes(u.k)); if (us.length) { const u = us[Math.floor(r() * us.length)]; acts.push({ t: 'token', lane: u.lane, col: u.col }); return acts; } }
    if (newCard && !ATTACK.includes(newCard) && inLoadout(S, newCard) && newCard !== 'farm' && newCard !== 'bank' && newCard !== 'raft') {
      for (const e of [...list, ...S.enemies.filter((x) => x.k === 'tunneler' && S.tick >= (noticeAt.get(x.id) ?? 1e9))]) {
        const key = newCard + ':' + e.lane; if (usedTaught.has(key) && usedTaught.get(key) !== 'want') continue;
        const pairs: Record<string, string[] | null> = { spikes: ['ram'], hook: ['ladder', 'boat'], gust: ['flyer', 'smoker', 'ant'], listener: ['tunneler'], pit: null, repair: null, salvage: null };
        const pk = pairs[newCard]; if (pk && !pk.includes(e.k)) continue;
        if (newCard === 'repair') { const wc = wallCol(S, e.lane); const w = wc >= 0 ? topAt(S, e.lane, wc) : null; if (!w || w.hp > w.max * 0.85) continue; }
        if (!usedTaught.has(key)) usedTaught.set(key, r() < (hintP > 0 ? 0.9 : 0.7) ? 'want' : 'no');
        if (usedTaught.get(key) !== 'want') continue;
        {
          const col = taughtCol(S, newCard, e.lane);
          if (col < 0 && newCard === 'hook' && inLoadout(S, 'wall')) { const wc = firstFree(S, 'wall', e.lane, [4, 5, 3]); if (wc >= 0 && placeAt(S, acts, 'wall', e.lane, wc, true)) return acts; }
          if (col >= 0 && placeAt(S, acts, newCard, e.lane, col, false)) { usedTaught.set(key, 'done'); return acts; } if (col < 0) continue;
        }
        if (!affordable(S, newCard) && S.grain + 40 >= UNITS[newCard].cost && S.tick >= (S.cdReady[newCard] ?? 0)) return acts;
      }
      if (newCard === 'pit' && L.warn) for (const w of L.warn) if (S.tick >= (w.t - 12) * TPS && S.tick < w.t * TPS) for (const ln of w.lanes) { const key = 'pit:' + w.t + ':' + ln; if (usedTaught.has(key)) continue; usedTaught.set(key, 1); if (r() < 0.7 && placeAt(S, acts, 'pit', ln, 5, false)) return acts; }
    }
    for (const ln of lanes) {
      const es = list.filter((e) => e.lane === ln && e.layer !== 'air'); if (!es.length || attackersIn(S, ln).length) continue;
      const c = attackCard(S, ln, es.map((e) => e.k)); if (!c) continue;
      const col = firstFree(S, c, ln, [1, 2, 3, 0, 4]);
      if (col >= 0) { if (placeAt(S, acts, c, ln, col, false)) return acts; break; }
    }
    if (newEnemy && ENEMIES[newEnemy]?.layer === 'air' && TAUGHT[newEnemy] && inLoadout(S, TAUGHT[newEnemy])) {
      const c = TAUGHT[newEnemy];
      for (const e of list) {
        if (e.k !== newEnemy || S.units.some((u) => u.k === c && Math.abs(u.lane - e.lane) <= 1)) continue;
        const key = 'air:' + e.lane; if (!usedTaught.has(key)) usedTaught.set(key, r() < (hintP > 0 ? 0.9 : 0.7));
        if (!usedTaught.get(key)) continue;
        const col = firstFree(S, c, e.lane, [2, 1, 3]);
        if (col >= 0 && placeAt(S, acts, c, e.lane, col, true)) return acts;
        if (S.grain + 40 >= UNITS[c].cost) return acts;
        break;
      }
    }
    const perched = S.enemies.find((e) => e.perchId && S.tick >= (noticeAt.get(e.id) ?? 1e9));
    if (perched && inLoadout(S, 'radial') && !S.units.some((u) => u.k === 'radial' && Math.abs(u.lane - perched.lane) <= 1)) {
      const key = 'aa:' + perched.id; if (!usedTaught.has(key)) usedTaught.set(key, r() < (hintP > 0 ? 0.8 : 0.6));
      if (usedTaught.get(key)) { const ln = Math.max(0, Math.min(4, perched.lane)); const col = firstFree(S, 'radial', ln, [2, 1, 3]); if (col >= 0 && placeAt(S, acts, 'radial', ln, col, true)) return acts; if (S.grain + 40 >= UNITS.radial.cost) return acts; }
    }
    for (const e of [...list, ...S.enemies.filter((x) => x.k === 'tunneler' && S.tick >= (noticeAt.get(x.id) ?? 1e9))]) {
      const c = TAUGHT[e.k]; if (!c || ATTACK.includes(c) || !inLoadout(S, c) || c === newCard) continue;
      const key = 'mem:' + e.k + ':' + e.lane; if (usedTaught.has(key)) continue; usedTaught.set(key, 1);
      if (laneUnits(S, e.lane).some((u) => u.k === c)) continue;
      if (r() < (e.k === newEnemy ? (hintP > 0 ? 0.9 : 0.7) : (hintP > 0 ? 0.7 : 0.5))) { if (placeAt(S, acts, c, e.lane, taughtCol(S, c, e.lane), false)) return acts; }
    }
    if (!cards(S).some((c) => ATTACK.includes(c))) {
      for (const e of list.sort((a, b) => a.x - b.x)) {
        const opts = ['hook', 'spikes', 'pit', 'gust', 'wall', 'repair'].filter((c) => inLoadout(S, c) && affordable(S, c) && !laneUnits(S, e.lane).some((u) => u.k === c));
        if (!opts.length) continue; const c = opts[Math.floor(r() * opts.length)];
        const col = c === 'wall' ? 4 : c === 'hook' ? 3 : c === 'gust' ? 1 : c === 'repair' ? 3 : 5;
        if (placeAt(S, acts, c, e.lane, col, false)) return acts;
      }
    }
    const econCard = inLoadout(S, 'farm') && !(isNight(S) && inLoadout(S, 'bank') && r() < nightBank) ? 'farm' : inLoadout(S, 'bank') ? 'bank' : null;
    const econN = S.units.filter((u) => u.k === 'farm' || u.k === 'bank').length;
    const threatNear = list.some((e) => e.x < 4 * T);
    if (econCard && !L.belt && ((t < 90 && econN < econTarget) || (t >= 90 && econN < econTarget + 2 && S.grain > 200)) && !threatNear) {
      for (const ln of [2, 1, 3, 0, 4].filter((l) => L.lanes[l] && !S.waterNow[l] && !(keepBossLane && l === BOSS_LANE))) { const c = firstFree(S, econCard, ln, [0, 1]); if (c >= 0 && affordable(S, econCard)) { if (placeAt(S, acts, econCard, ln, c, true)) return acts; break; } }
    }
    const flagNow = (S.flags || L.flags || []).some((f) => S.tick >= f && S.tick < f + 25 * TPS);
    const byLane = lanes.map((ln) => list.filter((e) => e.lane === ln));
    const order = lanes.map((ln, i) => ({ ln, es: byLane[i] })).filter((x) => x.es.length).sort((a, b) => Math.min(...a.es.map((e) => e.x)) - Math.min(...b.es.map((e) => e.x)));
    for (const { ln, es } of order) {
      const want = Math.min(4, 1 + (es.length >= 2 ? 1 : 0) + (es.length >= 4 ? 1 : 0) + (flagNow ? 1 : 0) + (es.some((e) => (ENEMIES[e.k]?.hp || 0) >= 600) ? 1 : 0));
      const have = attackersIn(S, ln).length;
      if (have < want) {
        const c = attackCard(S, ln, es.map((e) => e.k)); if (!c) continue;
        const col = firstFree(S, c, ln, [1, 2, 3, 0, 4]);
        if (col >= 0) { if (placeAt(S, acts, c, ln, col, false)) return acts; if (r() < 0.5) return acts; }
      }
      if (inLoadout(S, 'wall') && affordable(S, 'wall') && wallCol(S, ln) < 0) {
        const fa = attackersIn(S, ln).reduce((m, u) => Math.max(m, u.col), -1);
        if (fa >= 0 && es.some((e) => e.x - (fa * T + 8000) <= 3 * T)) { const col = firstFree(S, 'wall', ln, [fa + 2, fa + 1, fa + 3]); if (col >= 0 && placeAt(S, acts, 'wall', ln, col, false)) return acts; }
      }
    }
    if (!L.belt && S.grain >= 200 && t > 50) {
      const ln = lanes[Math.floor(r() * lanes.length)];
      if (attackersIn(S, ln).length < 3) { const c = attackCard(S, ln, []); const col = c ? firstFree(S, c, ln, [1, 2, 3]) : -1; if (c && col >= 0 && placeAt(S, acts, c, ln, col, false)) return acts; }
    }
    if (L.belt && S.belt.length) {
      const c = S.belt[0]; const ln = order[0]?.ln ?? lanes[Math.floor(r() * lanes.length)];
      if (c === 'strike') { const e = list.sort((a, b) => a.x - b.x)[0]; if (e && e.x < 4 * T) { acts.push({ t: 'place', card: 'strike', lane: e.lane, col: tileOf(e.x) }); nextAct = S.tick + gs(1); } }
      else { const col = ATTACK.includes(c) ? firstFree(S, c, ln, [1, 2, 3, 0]) : c === 'wall' ? firstFree(S, c, ln, [4, 5, 3]) : taughtCol(S, c, ln); if (col >= 0) placeAt(S, acts, c, ln, col, false); }
    }
    return acts;
  };
  K.coachMem = coachMem;
  return K;
}

/** R 乱放娃: random affordable placements, random taps; lower bound that proves strategy matters */
export function makeR(_level: Level, seed = 1): Bot {
  const r = prng(seed * 31337 + 3); let next = 40; const collectAt = new Map<number, number>();
  return function R(S: SimState): Action[] {
    const acts: Action[] = [];
    for (const d of S.drops) { if (!collectAt.has(d.id)) collectAt.set(d.id, S.tick + Math.floor(r() * 140)); if (S.tick >= collectAt.get(d.id)!) acts.push({ t: 'collect', id: d.id }); }
    if (S.tick < next) return acts;
    next = S.tick + Math.floor(40 + r() * 80);
    const cs = cards(S).filter((c) => (S.L.belt ? true : affordable(S, c)));
    if (!cs.length) return acts;
    const c = cs[Math.floor(r() * cs.length)]; const lanes = activeLanes(S);
    const ln = lanes[Math.floor(r() * lanes.length)]; const col = Math.floor(r() * COLS);
    acts.push(...placeActs(S, c, ln, col));
    if (S.tokens > 0 && r() < 0.2) { const us = S.units; if (us.length) { const u = us[Math.floor(r() * us.length)]; acts.push({ t: 'token', lane: u.lane, col: u.col }); } }
    return acts;
  };
}
