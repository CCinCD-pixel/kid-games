// Bot runner — port of proto/tools/run.mjs (levelFor / makeBot / runGame) reading the FROZEN level JSON
// (content/gear-fort/levels/<id>.json) instead of re-running the generator. Validators only.
import { ASSIST } from '../lane/rules';
import { createSim, step, hash } from '../lane/sim';
import { prng } from '../lane/rng';
import { makeC, type CParams } from './c';
import { makeK, makeR } from './k';
import { chooseC, chooseK, chooseKRec } from './loadout';
import type { Bot } from './common';
import type { Action, Level, SimState } from '../lane/types';

export const BOT_NAMES = ['R', 'K', 'K+', 'Kl', 'Ka', 'Kb', 'Kr', 'C', 'K2', 'K2h', 'K@', 'K+@', 'K2@', 'O'] as const;
export interface LevelForOptions { loadout?: string[]; kDeck?: boolean; dropCard?: string | string[] }

/** a fresh, mutable copy of a frozen level with the bot's loadout choice applied (same rules as the prototype) */
export function levelFor(base: Level, botName: string, seed: number, opt: LevelForOptions = {}): Level {
  const lv = JSON.parse(JSON.stringify(base)) as Level;
  if (lv.choose || lv.pool) {
    if (opt.loadout) lv.loadout = opt.loadout;
    else if (opt.kDeck) lv.loadout = chooseK(lv, prng(seed * 17 + 1));
    else if ((botName === 'K+' || botName === 'Kl' || botName === 'K+@') && !lv.noHints) lv.loadout = chooseKRec(lv, prng(seed * 17 + 1), botName === 'Kl' ? 0.9 : 0.6);
    else if (botName === 'Kb') lv.loadout = chooseKRec({ ...lv, seal: lv.seal || 'counters' }, prng(seed * 31 + 5), 1);
    else if (botName === 'K2h') lv.loadout = chooseKRec({ ...lv, seal: lv.seal || 'counters' }, prng(seed * 17 + 3), 0.5);
    else if (botName === 'K2@') lv.loadout = chooseC(lv);
    else if (botName === 'Ka' && !lv.noHints) lv.loadout = chooseKRec({ ...lv, seal: lv.seal || 'counters' }, prng(seed * 17 + 1), 1);
    else if (botName === 'Kr') lv.loadout = chooseKRec({ ...lv, seal: lv.seal || 'counters' }, prng(seed * 31 + 5), 0.9);
    else if (botName === 'K2') lv.loadout = chooseC(lv);
    else if (botName.startsWith('K')) lv.loadout = chooseK(lv, prng(seed * 17 + 1));
    else if (botName === 'R') { const r = prng(seed * 5 + 3); lv.loadout = (lv.pool || []).slice().sort(() => r() - 0.5).slice(0, lv.slots); }
    else lv.loadout = chooseC(lv);
  }
  if (opt.dropCard && lv.loadout) { const ds = ([] as string[]).concat(opt.dropCard); lv.loadout = lv.loadout.filter((c) => !ds.includes(c)); }
  if (opt.dropCard && lv.belt) { const ds = ([] as string[]).concat(opt.dropCard); lv.belt = { ...lv.belt, seq: lv.belt.seq.filter((c) => !ds.includes(c)) }; }
  return lv;
}

export interface MakeBotOptions { coachLifetime?: Record<string, number>; off?: string[]; params?: Partial<CParams>; speedPct?: number | 'fast' }
export function makeBot(name: string, lv: Level, seed: number, opt: MakeBotOptions = {}): Bot {
  switch (name) {
    case 'R': return makeR(lv, seed);
    case 'K': return makeK(lv, seed);
    case 'K+': return makeK(lv, seed, { hintP: 0.6, coachLifetime: opt.coachLifetime });
    case 'Kl': return makeK(lv, seed, { hintP: 0.9 });
    case 'Ka': return makeK(lv, seed, { hintP: 0.8, speedPct: ASSIST.speedPct, coachLifetime: opt.coachLifetime });
    case 'Kb': return makeK(lv, seed, { hintP: 1, speedPct: ASSIST.speedPct, coachGap: 6 * 20 });
    case 'Kr': return makeK(lv, seed, { hintP: 0.8, speedPct: ASSIST.speedPct });
    case 'C': return makeC(lv, seed, { off: opt.off, params: opt.params });
    case 'K2': return makeC(lv, seed, { off: opt.off, params: opt.params, kid: true, speedPct: opt.speedPct });
    case 'K2h': {
      const r = prng(seed * 6007 + 11); const mods = ['counter', 'aoe', 'control', 'depth', 'preview', 'priority', 'mark', 'synergy', 'timing', 'adapt', 'save'];
      return makeC(lv, seed, { off: [...(opt.off || []), ...mods.filter(() => r() < 0.5)], params: opt.params, kid: true, speedPct: opt.speedPct });
    }
    case 'K@': return makeK(lv, seed, { speedPct: 'fast' });
    case 'K+@': return makeK(lv, seed, { hintP: 0.6, speedPct: 'fast', coachLifetime: opt.coachLifetime });
    case 'K2@': return makeC(lv, seed, { off: opt.off, params: opt.params, kid: true, speedPct: 'fast' });
    case 'O': return makeC(lv, seed, { omni: true, params: { lookahead: 300, ...(opt.params || {}) }, off: opt.off });
    default: throw new Error('bot ' + name);
  }
}

/** V4b action-log hash (proto/v1/parity.mjs): FNV over JSON of [tick, actions] per non-empty tick, chained */
export const fnvStr = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193); h ^= s.charCodeAt(i) >>> 8; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};

export interface ParityResult { result: string; ticks: number; actions: number; actHash: string; finalHash: string; logs: number; loadout: string[] }
/** one parity case exactly as proto/v1/parity.mjs ran it */
export function runParity(base: Level, bot: string, seed: number): ParityResult {
  const lv = levelFor(base, bot, seed); const tier = bot === 'Ka' ? 1 : 0;
  const S = createSim(lv, seed, { extraStart: tier ? ASSIST.startGrain : 0, assist: tier }); const b = makeBot(bot, lv, seed);
  let acc = ''; let n = 0;
  while (!S.result && S.tick < 20 * 60 * 12) { const a = b(S); if (a && a.length) { acc = fnvStr(acc + JSON.stringify([S.tick, a])); n += a.length; } step(S, a); }
  return { result: S.result || 'timeout', ticks: S.tick, actions: n, actHash: acc, finalHash: hash(S), logs: S.stats.logsUsed, loadout: S.loadout };
}

export interface GameRun { S: SimState; lv: Level; actLog: [number, Action[]][] | null; flagHashes: string[] }
export function runGame(base: Level, botName: string, seed: number, opt: LevelForOptions & MakeBotOptions & { incomePct?: number; events?: boolean; record?: boolean } = {}): GameRun {
  const lv = levelFor(base, botName, seed, opt);
  const S = createSim(lv, seed, { incomePct: opt.incomePct, extraStart: botName === 'Ka' ? ASSIST.startGrain : 0, events: !!opt.events });
  const bot = makeBot(botName, lv, seed, opt);
  const maxT = 20 * 60 * 12;
  const actLog: [number, Action[]][] | null = opt.record ? [] : null;
  const flagHashes: string[] = [];
  const flags = new Set(lv.flags || []);
  while (!S.result && S.tick < maxT) {
    const a = bot(S);
    if (actLog && a && a.length) actLog.push([S.tick, a.filter((x) => x.t !== 'collect')]);
    if (flags.has(S.tick)) flagHashes.push(hash(S));
    step(S, a);
  }
  if (!S.result) S.result = 'timeout';
  return { S, lv, actLog, flagHashes };
}
