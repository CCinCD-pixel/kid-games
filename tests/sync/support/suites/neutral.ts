// neutral.ts — SELF-MERGE NEUTRALITY: run each game's own kind of writers on ONE device (including the ones that LOWER a value: tier demotion, node re-open, FIFO shift, ring trim, reset)
// with the real sync step after EVERY op. The state after a sync round must equal the state before it (sync may never undo what the game just did), and a passive second device must converge to it.
// Negative controls: re-open WITHOUT bumping g must be caught; the v1.0 rule puzzles.tier = max must be caught. Port of neutral.mjs v1.1 (2 400 ops, 2 496 sync checks in the prototype).
import { canon, strip } from '@kit/sync/merge';
import type { Rule } from '@kit/sync/rules';
import { SCHEMAS, DEFAULTS, STEP_ORDER, T } from '../schemas';
import { rng, int, pick, type Rng } from '../gen';
import { bind, type MergeImpl } from '../replica';

export interface NeutralResult { ops: number; checks: number; failures: string[]; total: number }
export interface NeutralOpts { negative?: boolean; legacyTier?: boolean; stores?: string[]; steps?: number }
const clone = <V>(x: V): V => JSON.parse(JSON.stringify(x));
const ns = (x: any): any => (Array.isArray(x) ? (x.every((e) => typeof e === 'string') ? [...x].sort() : x.map(ns)) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, ns(v)])) : x);   // sets compare as sets

type Op = (d: any, r: Rng, k: number) => void;
const lessonIds = ['L01', 'L02', 'L07'];
export function makeOps(steps: string[]): Record<string, Op[]> {
  return {
    xiangqi: [
      (d) => { d.puzzles.tier = Math.min(3, d.puzzles.tier + 1); }, (d) => { d.puzzles.tier = Math.max(1, d.puzzles.tier - 1); },
      (d, r) => { const id = 'pool.' + int(r, 0, 8140); d.puzzles.done.push(id); if (d.puzzles.done.length > 800) d.puzzles.done.shift(); d.puzzles.firstTry.push(id); if (d.puzzles.firstTry.length > 800) d.puzzles.firstTry.shift(); d.puzzles.recent30.push(r() < 0.5); if (d.puzzles.recent30.length > 30) d.puzzles.recent30.shift(); },
      (d, r) => { const L = pick(r, lessonIds); const cur = d.lessons[L] ?? { stars: 0, stepId: steps[0], done: false }; d.lessons[L] = { ...cur, stepId: steps[Math.min(steps.length - 1, Math.max(steps.indexOf(cur.stepId), 0) + 1)], stars: Math.max(cur.stars, int(r, 0, 3)) }; },
      (d, r, k) => { d.history.push({ t: T + k, robot: 'R' + int(r, 1, 3), mode: 'full', result: pick(r, ['w', 'l', 'd']), plies: 30, undo: 0, coachShown: 0, coachAccepted: 0 }); if (d.history.length > 30) d.history.splice(0, d.history.length - 30); },
      (d, r) => { const rb = d.robots['R' + int(r, 1, 3)]; if (r() < 0.5) { rb.w++; rb.loseStreak = 0; rb.badges = [...new Set([...rb.badges, 'r'])]; } else { rb.l++; rb.loseStreak++; } },
      (d) => { d.stats.sessions++; }, (d, r) => { d.settings.coachOn['R' + int(r, 1, 3)] = r() < 0.5; }, (d, r) => { d.settings.coords = r() < 0.5; d.game = r() < 0.5 ? { startFen: 'x', moves: ['a'] } : undefined; if (!d.game) delete d.game; },
    ],
    'mars-base': [
      (d, r) => { const id = 'orbit.O1.' + int(r, 0, 4); const n = (d.nodes[id] ??= { st: 'open', stars: 0, plays: 0, ft: [] }); n.st = 'done'; n.stars = Math.max(n.stars, int(r, 1, 3)); n.plays++; n.ft = [...n.ft, 1]; },
      (d, r) => { const ids = Object.keys(d.nodes); if (!ids.length) return; const n = d.nodes[pick(r, ids)]; if (n.st === 'open') return; n.st = 'open'; delete n.why; n.g = (n.g ?? 0) + 1; },           // cert.ts / adaptive.ts re-open: the game BUMPS g
      (d, r) => { const id = 'orbit.O2.' + int(r, 0, 4); d.nodes[id] = { st: 'skipped', stars: 0, plays: 0, ft: [], why: 'direct', g: d.nodes[id]?.g ?? 0 }; },
      (d, _r, k) => { d.recent.push(`h${k}|f|1|1|0|0|0|m|${d.session.index}|n|`); if (d.recent.length > 300) d.recent.splice(0, d.recent.length - 300); },
      (d, r) => { d.tags[pick(r, ['add', 'sub', 'cmp'])] = { level: int(r, 1, 5), streak: int(r, 0, 4), window: '1101' }; },
      (d, r) => { const c = d.cert[pick(r, ['C1', 'C2'])]; if (c.state === 'lit') return; const order = ['none', 'half', 'lit']; c.state = order[Math.max(order.indexOf(c.state), int(r, 1, 2))]; c.attempts++; },   // applyCert: none -> half|lit, half -> lit (never down)
      (d, _r, k) => { d.session.index++; d.session.lastActiveAt = T + k * 1000; d.session.missions++; },
      (d, _r, k) => { const e = (d.errors.slip ??= { n: 0, recent: [] }); e.n++; e.recent.push({ fam: 'f', at: T + k }); if (e.recent.length > 3) e.recent.shift(); },   // mission.ts:71 trims to 3
      (d, r) => { d.direct = r() < 0.5 ? { pending: [{ node: 'orbit.O2.1', tags: ['add'] }] } : { pending: [] }; }, (d) => { d.mission = { node: 'x' }; },
    ],
    sokoban: [
      (d, r) => { const id = 'C' + int(r, 1, 6); const L = (d.levels[id] ??= { best: null, stars: 0, clean: false, firstClean: false, plays: 0, hintMax: 0 }); L.plays++; L.best = L.best === null ? int(r, 8, 30) : Math.min(L.best, int(r, 8, 30)); L.stars = Math.max(L.stars, int(r, 0, 3)); },
      (d, r) => { d.stats.activeMs += int(r, 1e6, 6e8); d.stats.pushes += int(r, 1, 90); }, (d, r) => { d.cosmetics.owned = [...new Set([...d.cosmetics.owned, 'h' + int(r, 1, 5)])]; d.cosmetics.equipped.hat = 'h' + int(r, 1, 5); },
      (d, _r, k) => { d.cert.at = Math.min(d.cert.at ?? Infinity, T + k); }, (d, r) => { d.random.recent = [int(r, 0, 9), int(r, 0, 9)]; }, (d) => { d.inProgress = { id: 'C1', hist: 'u', at: T }; },
    ],
    'memory-matrix': [
      (d, r) => { const s = pick(r, ['s1', 's2']); const cur = d.sectors[s] ?? { sector: s, open: true, rounds: 0, tracks: [{ L: 3, cleared: 0 }] }; d.sectors[s] = { ...cur, rounds: cur.rounds + 1, tracks: [{ ...cur.tracks[0], L: Math.max(1, cur.tracks[0].L + pick(r, [-2, -1, 1, 2])), cleared: cur.tracks[0].cleared }] }; },
      (d) => { d.nights++; d.nightsAny++; }, (d, r) => { d.cards = [...new Set([...d.cards, 'c.' + int(r, 1, 4)])]; }, (d, r) => { d.recent.s1 = { exact: [int(r, 0, 99999)], shape: [int(r, 0, 99)] }; },
    ],
    'emoji-match': [
      (d, r) => { d.boosters = { drill: int(r, 0, 3), tractor: int(r, 0, 3), ion: int(r, 0, 3) }; }, (d, r) => { const l = 'l' + int(r, 1, 5); const L = (d.levels[l] ??= { stars: 0, bestLeft: 0, attempts: 0, wins: 0 }); L.attempts++; L.stars = Math.max(L.stars, int(r, 0, 3)); },
      (d, r) => { d.stats.maxCascade = Math.max(d.stats.maxCascade, int(r, 0, 9)); d.talk = (d.talk ?? 0) + 1; }, (d, r) => { d.sky = [...new Set([...(d.sky ?? []), 'k' + int(r, 0, 4)])]; },
    ],
    'snake-battle': [
      (d, r) => { d.life.kills += int(r, 0, 5); d.life.playSec += int(r, 1, 99); }, (d, r, k) => { d.session.lastEndAt = T + k; d.session.matchesInRow = int(r, 0, 5); }, (d, r) => { d.equipped.skin = pick(r, ['venus', 'mars', 'luna']); },
      (d, r) => { const m = 'm' + int(r, 1, 4); const x = (d.missions[m] ??= { stars: 0, attempts: 0, failStreak: 0, clears: 0, bestT: 99, hintMax: 0, skipped: false, why: {} }); x.attempts++; x.failStreak = r() < 0.5 ? 0 : x.failStreak + 1; x.bestT = Math.min(x.bestT, int(r, 5, 60)); },
    ],
    economy: [(d, r) => { d.pet['slot:room1:' + int(r, 1, 4)] = r() < 0.3 ? null : 'item:' + int(r, 1, 9); }, (d, r) => { d.pet['name:rover'] = pick(r, ['阿福', '团团', '小宇']); }, (d, r) => { d.seen = [...new Set([...d.seen, 'tut.' + int(r, 1, 6)])]; }],
    settings: [(d, r) => { d.displayName = pick(r, ['小步步', '步步', '宇航员']); }, (d, r) => { d.narration = r() < 0.5; d.hiddenGames = r() < 0.5 ? [] : ['snake-battle']; }, (d, r) => { d.skipIntros = r() < 0.5; d.unlockAll = r() < 0.5; }],
  };
}

export function runNeutral(M: MergeImpl, o: NeutralOpts = {}): NeutralResult {
  const { Replica, Server1 } = bind(M);
  const out: NeutralResult = { ops: 0, checks: 0, failures: [], total: 0 };
  let nBad = 0; const flag = (m: string): void => { nBad++; if (out.failures.length < 8) out.failures.push(m); };
  const trees: Record<string, Rule> = { ...SCHEMAS };
  if (o.legacyTier) {   // v1.0 rule: puzzles.tier = max (a clone with ONLY that leaf replaced)
    const xq = SCHEMAS.xiangqi as Extract<Rule, { k: 'obj' }>; const pz = xq.fields.puzzles as Extract<Rule, { k: 'obj' }>;
    trees.xiangqi = { ...xq, fields: { ...xq.fields, puzzles: { ...pz, fields: { ...pz.fields, tier: { k: 'max' } } } } };
  }
  const OPS = makeOps(STEP_ORDER.xiangqi!);
  for (const name of o.stores ?? Object.keys(OPS)) {
    const list = OPS[name]!; const rule = trees[name]!; const sv = new Server1();
    const A = new Replica(rule, 'A', clone(DEFAULTS[name]), DEFAULTS[name]), B = new Replica(rule, 'B', clone(DEFAULTS[name]), DEFAULTS[name]); const r = rng(name.length * 977);
    for (let k = 1; k <= (o.steps ?? 300); k++) {
      const op = pick(r, list);
      if (o.negative && name === 'mars-base' && list.indexOf(op) === 1) { const ids = Object.keys(A.data.nodes); if (ids.length) { const nd = A.data.nodes[pick(r, ids)]; if (nd.st !== 'open') { nd.st = 'open'; delete nd.why; } } } else op(A.data, r, k);      // negative control: re-open WITHOUT g bump
      out.ops++; const want = canon(A.data);
      if (name === 'sokoban' && k % 97 === 0) { A.reset(DEFAULTS[name]); A.sync(sv); out.checks++; if (canon(strip(rule, A.data)) !== canon(strip(rule, DEFAULTS[name]))) flag('reset not neutral'); continue; }
      A.sync(sv); out.checks++; if (canon(A.data) !== want) flag(`${name}: sync changed the state after op #${list.indexOf(op)} (k=${k}) before ${want.slice(0, 160)} after ${canon(A.data).slice(0, 160)}`);
      if (k % 25 === 0) { B.sync(sv); out.checks++; if (canon(ns(strip(rule, B.data))) !== canon(ns(strip(rule, A.data)))) flag(`${name}: passive device differs at k=${k}`); A.sync(sv); }
    }
  }
  out.total = nBad;
  return out;
}
