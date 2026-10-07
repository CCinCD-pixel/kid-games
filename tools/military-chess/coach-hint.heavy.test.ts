/**
 * §9.5 coach + hint statistical gates (QA r2 tech minor: they were only covered by hand-made positions).
 *   MC_HEAVY=1 [MC_CH_GAMES=60] [MC_CH_HINTS=500] npx vitest run -c tools/military-chess/vitest.heavy.config.ts coach-hint
 * Games: kid model B (player 0) against robots 1–2 in all three modes (the coach is on by default there).
 * Measured on every kid decision:
 *  - C1 recall: every kid move after which the opponent can take the kid's flag at once (full-information
 *    check: some reply captures the flag) must raise C1 (C5 may pre-empt with its own sheet; both count as
 *    "warned"; C1 proper is reported separately) — 明棋, where the danger is public. Gate = 1.0.
 *  - trigger rate: alerts / kid moves < 10 %; C2–C5 shown ≤ 3 per game.
 * Hint quality on MC_CH_HINTS sampled kid positions (all modes, the child's own belief in 暗棋):
 *  - the hint move's level-4 score ≥ the 75th percentile of all ranked candidates in ≥ 95 % of positions;
 *  - 0 positions where, after the hint, the opponent can take the flag although some move prevents it.
 * Writes ~/kid-games-work/military-chess/coach-hint-<date>.txt.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { RED, type Side } from '../../site/military-chess/src/core/board';
import { newKnowledge, observe, type Knowledge } from '../../site/military-chess/src/core/belief';
import { coachCheck, type CoachCode } from '../../site/military-chess/src/core/coach';
import { legalMoves, type Action } from '../../site/military-chess/src/core/movegen';
import { parseNote, toNote } from '../../site/military-chess/src/core/notation';
import { redact } from '../../site/military-chess/src/core/redact';
import { apply } from '../../site/military-chess/src/core/rules';
import type { GameState, Mode } from '../../site/military-chess/src/core/state';
import { think } from '../../site/military-chess/src/ai/think';
import { playGame, startFor, type Agent } from './selfplay';

const OUT = path.join(os.homedir(), 'kid-games-work/military-chess');
const GAMES = Number(process.env.MC_CH_GAMES ?? 60);
const HINTS = Number(process.env.MC_CH_HINTS ?? 500);
const FLAG = 0;

const playerOf = (s: GameState): 0 | 1 => (s.mode !== 'fan' ? (s.turn as 0 | 1) : s.turn === -1 ? s.toAct : s.colorOf[0] === s.turn ? 0 : 1);
const sideOf = (s: GameState, player: 0 | 1): number => (s.mode === 'fan' ? s.colorOf[player] : player);

function hiddenOf(s: GameState): number[] {
  const h = new Array(24).fill(0);
  for (let p = 0; p < s.np; p++) if (s.palive[p] && !s.pup[p]) h[s.pside[p] * 12 + s.ptype[p]]++;
  return h;
}
function flagAlive(s: GameState, side: number): boolean {
  for (let p = 0; p < s.np; p++) if (s.pside[p] === side && s.ptype[p] === FLAG && s.palive[p]) return true;
  return false;
}
/** after `a`, can the opponent take `side`'s flag with one reply? (full information) */
function flagFallsAfter(s: GameState, a: Action, side: number): boolean {
  const after = apply(s, a).state;
  if (after.result) return false;
  if (after.turn === side || after.turn === -1) return false;
  for (const r of legalMoves(after)) {
    const t = apply(after, r).state;
    if (!flagAlive(t, side) || (t.result && t.result.winner !== -1 && t.result.winner !== side && t.result.reason === 'flag')) return true;
  }
  return false;
}

interface Pos { s: GameState; know: Knowledge | null; kidMove: Action; game: number }

function positions(mode: Mode, opp: 1 | 2, seed: string, game: number): Pos[] {
  const agents: [Agent, Agent] = [{ kind: 'kidB' }, { kind: 'ai', level: opp }];
  const rec = playGame(mode, agents, seed, { ladder: true, invariants: false });
  let s = startFor(mode, agents, seed, true).s;
  const know: [Knowledge | null, Knowledge | null] = mode === 'an' ? [newKnowledge(s, RED), newKnowledge(s, 1 as Side)] : [null, null];
  const out: Pos[] = [];
  for (const note of rec.notes) {
    const a = parseNote(s, note);
    if (!a) break;
    const pl = playerOf(s);
    if (pl === 0 && s.turn !== -1) out.push({ s, know: know[sideOf(s, 0)] ? structuredClone(know[sideOf(s, 0)]) : null, kidMove: a, game });
    const { state, event } = apply(s, a);
    if (mode === 'an') for (const k of know) observe(k!, s, event);
    s = state;
  }
  return out;
}

describe.skipIf(!process.env.MC_HEAVY)('§9.5 coach + hint gates', () => {
  test('C1 recall, trigger rate, hint quality, no flag lost right after a hint', () => {
    const t0 = Date.now();
    const all: Pos[] = [];
    let g = 0;
    for (const mode of ['ming', 'fan', 'an'] as const) for (let i = 0; i < GAMES; i++) all.push(...positions(mode, (1 + (i % 2)) as 1 | 2, `ch:${mode}:${i}`, g++));

    // ---- coach
    let kidMoves = 0, alerts = 0, c1Need = 0, c1Hit = 0, c1Warned = 0, maxSoft = 0;
    const codes: Record<string, number> = {};
    const usedBy = new Map<number, number>();
    for (const p of all) {
      const me = p.s.turn as Side;
      const used = usedBy.get(p.game) ?? 0;
      const al = coachCheck(p.s, p.kidMove, { me, knowledge: p.know, hidden: p.s.mode === 'fan' ? hiddenOf(p.s) : null, used, enabled: true });
      kidMoves++;
      if (al) {
        alerts++;
        codes[al.code] = (codes[al.code] ?? 0) + 1;
        if (al.code !== 'C1') usedBy.set(p.game, used + 1);
        maxSoft = Math.max(maxSoft, usedBy.get(p.game) ?? 0);
      }
      if (p.s.mode === 'ming' && flagFallsAfter(p.s, p.kidMove, me)) {
        c1Need++;
        if (al?.code === 'C1') c1Hit++;
        if (al && (al.code === 'C1' || al.code === ('C5' as CoachCode))) c1Warned++;
      }
    }
    const rate = alerts / Math.max(1, kidMoves);

    // ---- C1 corpus (QA r3): kid model B rarely blunders the flag, so plant the threats — in sampled 明棋
    // kid positions, EVERY legal alternative after which the flag falls at once is a positive case
    const C1_MIN = Number(process.env.MC_CH_C1 ?? 60);
    let plantedNeed = 0, plantedWarned = 0;
    const ming = all.filter((p) => p.s.mode === 'ming');
    const mstep = Math.max(1, Math.floor(ming.length / 1500));
    for (let off = 0; off < mstep && plantedNeed < C1_MIN * 4; off++) {
      for (let i = off; i < ming.length && plantedNeed < C1_MIN * 4; i += mstep) {
        const p = ming[i];
        const me = p.s.turn as Side;
        for (const m of legalMoves(p.s)) {
          if (!flagFallsAfter(p.s, m, me)) continue;
          plantedNeed++;
          const al = coachCheck(p.s, m, { me, knowledge: null, hidden: null, used: 0, enabled: true });
          if (al && (al.code === 'C1' || al.code === ('C5' as CoachCode))) plantedWarned++;
          else if (plantedNeed - plantedWarned <= 6) console.log(`C1 miss: ming #${i} ${toNote(m)}`);
        }
      }
    }
    c1Need += plantedNeed;
    c1Warned += plantedWarned;
    const recall = c1Need ? c1Warned / c1Need : 1;

    // ---- hint
    // stride passes (offset 0, 1, 2 …) until HINTS valid positions are counted (QA r3: no shortfall)
    const step = Math.max(1, Math.floor(all.length / HINTS));
    const order: number[] = [];
    for (let off = 0; off < step; off++) for (let i = off; i < all.length; i += step) order.push(i);
    let n = 0, good = 0, flagLost = 0, defendable = 0;
    const misses: string[] = [];
    for (const i of order) {
      if (n >= HINTS) break;
      const p = all[i];
      const me = p.s.turn as Side;
      const view = redact(p.s, me, p.know);
      const hint = think({ view, level: 'hint', seed: `mc:hint:ch:${i}` }).note;
      const ranked = think({ view, level: 4, seed: `mc:ch:l4:${i}` }, { withRanked: true }).ranked ?? [];
      if (ranked.length < 2) continue;
      n++;
      const vs = ranked.map((r) => r.v).sort((a, b) => a - b);
      const p75 = vs[Math.floor(0.75 * (vs.length - 1))];
      const hv = ranked.find((r) => r.note === hint)?.v;
      if (hv !== undefined && hv >= p75) good++;
      else if (misses.length < 12) misses.push(`${p.s.mode} #${i}: hint ${hint} v=${hv ?? 'n/a'} p75=${p75}`);
      if (p.s.mode !== 'fan') {
        const a = parseNote(p.s, hint);
        if (a && flagFallsAfter(p.s, a, me)) {
          const canDefend = legalMoves(p.s).some((m) => !flagFallsAfter(p.s, m, me));
          if (canDefend) {
            defendable++;
            flagLost++;
            misses.push(`FLAG ${p.s.mode} #${i}: hint ${hint} leaves the flag (${toNote(a)})`);
          }
        }
      }
    }
    const quality = good / Math.max(1, n);

    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `陆战棋 §9.5 coach + hint gates — ${new Date().toISOString()} (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
      `games: ${g} (kid model B vs robots 1–2, ${GAMES} per mode), kid decisions: ${kidMoves}`,
      `C1 recall (明棋, flag capturable after the move): ${c1Warned}/${c1Need} warned = ${recall.toFixed(3)} (kid-model moves: C1 proper ${c1Hit}; planted alternatives ${plantedWarned}/${plantedNeed})  gate 1.0 on ≥ ${C1_MIN} cases`,
      `trigger rate: ${alerts}/${kidMoves} = ${(rate * 100).toFixed(2)} %  gate < 10 %   by code: ${JSON.stringify(codes)}`,
      `C2–C5 per game max: ${maxSoft}  gate ≤ 3`,
      `hint quality: ${good}/${n} = ${(quality * 100).toFixed(1)} % at ≥ p75 of level-4 candidates  gate ≥ 95 %`,
      `flag lost right after a hint (defence existed): ${flagLost}  gate 0  (defendable cases seen ${defendable})`,
      ...misses.map((m) => `  ${m}`),
    ];
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `coach-hint-${date}.txt`), lines.join('\n') + '\n');
    console.log(lines.join('\n'));
    expect(c1Need).toBeGreaterThanOrEqual(C1_MIN);
    expect(n).toBe(HINTS);
    expect(recall).toBe(1);
    expect(rate).toBeLessThan(0.1);
    expect(maxSoft).toBeLessThanOrEqual(3);
    expect(quality).toBeGreaterThanOrEqual(0.95);
    expect(flagLost).toBe(0);
  }, 1_800_000);
});
