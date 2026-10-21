// semantic.ts — per-field ORACLE tests on real-game-shaped saves: the expected merged value is written down by hand (what the game needs), not derived from the rule.
// The lattice laws of props.ts cannot see a merge that is lawful but wrong (max->min, or->and, union->intersection, rank reversed, ...); these tests and dominance do.
// Port of semantic.mjs v1.1 (78 assertions in the prototype; the port keeps all of them and adds the ones for the rebuilt stores at the end).
import { canon } from '@kit/sync/merge';
import { SCHEMAS, SAMPLES, DEFAULTS, STEP_ORDER, T } from '../schemas';
import { bind, type MergeImpl } from '../replica';

export interface SemanticResult { n: number; failures: string[] }
const clone = <V>(x: V): V => JSON.parse(JSON.stringify(x));

export function runSemantic(M: MergeImpl): SemanticResult {
  const { Replica, Server1 } = bind(M);
  const out: SemanticResult = { n: 0, failures: [] };
  const eq = (label: string, got: unknown, want: unknown): void => { out.n++; if (canon(got) !== canon(want)) out.failures.push(`${label} got ${String(canon(got)).slice(0, 160)} want ${String(canon(want)).slice(0, 160)}`); };
  const set = (o: any, path: string, v: unknown): any => { const ks = path.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = x[k] ??= {}; x[ks.at(-1)!] = v; return o; };
  const get = (o: any, path: string): any => path.split('.').reduce((x, k) => x?.[k], o);
  // two devices start from `base` (default fresh), `fa`/`fb` mutate their copies (what the games do), then sync A, B, A (convergence)
  function twoDevices(name: string, fa?: (d: any, r: any) => void, fb?: (d: any, r: any) => void, base: any = DEFAULTS[name]) {
    const rule = SCHEMAS[name]!, sv = new Server1(); const A = new Replica(rule, 'A', clone(base), base), B = new Replica(rule, 'B', clone(base), base);
    fa?.(A.data, A); fb?.(B.data, B); A.sync(sv); B.sync(sv); A.sync(sv); return { A, B, sv };
  }
  const srt = (v: unknown): unknown => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...v].sort() : v);   // sets: compare as sets (members, not order)
  const both = (label: string, name: string, path: string, fa: (d: any, r: any) => void, fb: (d: any, r: any) => void, want: unknown, base?: any, ordered = false): void => {
    const { A, B } = twoDevices(name, fa, fb, base); const f = ordered ? (x: unknown) => x : srt; eq(`${label} (A)`, f(get(A.data, path)), f(want)); eq(`${label} (B)`, f(get(B.data, path)), f(want));
  };
  const fresh = (name: string) => { const rule = SCHEMAS[name]!, sv = new Server1(); return { rule, sv, A: new Replica(rule, 'A', clone(DEFAULTS[name]), DEFAULTS[name]), B: new Replica(rule, 'B', clone(DEFAULTS[name]), DEFAULTS[name]) }; };

  // ---------- xiangqi
  const XQ = STEP_ORDER.xiangqi!, i74 = XQ.indexOf('L07.4'), iB1 = XQ.indexOf('B1');
  both('xiangqi stepId follows the CATALOG (B1 after L07.4; plain string max would keep L07.4)', 'xiangqi', 'lessons.L07.stepId', (d) => set(d, 'lessons.L07', { stars: 2, stepId: 'L07.4', done: false }), (d) => set(d, 'lessons.L07', { stars: 3, stepId: 'B1', done: true, puzzleIx: 2 }), iB1 > i74 ? 'B1' : 'L07.4');
  both('xiangqi lesson stars = max', 'xiangqi', 'lessons.L07.stars', (d) => set(d, 'lessons.L07', { stars: 2, stepId: 'L07.4', done: false }), (d) => set(d, 'lessons.L07', { stars: 3, stepId: 'B1', done: true }), 3);
  both('xiangqi lesson done = or', 'xiangqi', 'lessons.L07.done', (d) => set(d, 'lessons.L07', { stars: 2, stepId: 'L07.4', done: true }), (d) => set(d, 'lessons.L07', { stars: 3, stepId: 'B1', done: false }), true);
  both('xiangqi robot wins = sum of both devices (5 = 3 + 2)', 'xiangqi', 'robots.R1.w', (d) => { d.robots.R1.w = 3; }, (d) => { d.robots.R1.w = 2; }, 5);
  both('xiangqi robot losses = sum', 'xiangqi', 'robots.R1.l', (d) => { d.robots.R1.l = 1; }, (d) => { d.robots.R1.l = 2; }, 3);
  both('xiangqi robot unlocked = or', 'xiangqi', 'robots.R2.unlocked', (d) => { d.robots.R2.unlocked = true; }, () => {}, true);
  both('xiangqi xjWon / badges = union', 'xiangqi', 'robots.R1.badges', (d) => { d.robots.R1.badges = ['r']; }, (d) => { d.robots.R1.badges = ['b', 'clean']; }, ['b', 'clean', 'r'].sort());
  { // tier DEMOTION survives (single device: promote, sync, demote, sync; other device then pulls the demotion)
    const { A, B, sv } = fresh('xiangqi');
    A.data.puzzles.tier = 3; A.sync(sv); A.data.puzzles.tier = 2; A.sync(sv); A.sync(sv); eq('xiangqi tier demotion is not undone by the next sync (one device)', A.data.puzzles.tier, 2); B.sync(sv); eq('xiangqi tier demotion reaches the other device', B.data.puzzles.tier, 2);
  }
  both('xiangqi puzzles.done = union, order oldest->newest by first sighting', 'xiangqi', 'puzzles.done', (d) => { d.puzzles.done = ['pool.1', 'pool.2']; }, (d) => { d.puzzles.done = ['pool.2', 'pool.3']; }, ['pool.1', 'pool.2', 'pool.3'], undefined, true);
  { // FIFO window: 800 on A, then B (stale) adds 5 newer -> the 5 OLDEST of A fall out, cap stays 800
    const { A, B, sv } = fresh('xiangqi');
    A.data.puzzles.done = Array.from({ length: 800 }, (_, i) => 'pool.' + i); A.sync(sv); B.sync(sv); B.data.puzzles.done = [...B.data.puzzles.done, 'new.1', 'new.2', 'new.3', 'new.4', 'new.5']; B.sync(sv); A.sync(sv);
    eq('xiangqi FIFO cap stays 800', A.data.puzzles.done.length, 800); eq('xiangqi FIFO drops the OLDEST (not the alphabetically first)', [A.data.puzzles.done.includes('pool.0'), A.data.puzzles.done.includes('pool.4'), A.data.puzzles.done.includes('pool.5'), A.data.puzzles.done.at(-1)], [false, false, true, 'new.5']);
  }
  both('xiangqi history ring keeps epoch-ms entries from both devices (cap 30)', 'xiangqi', 'history.length', (d) => { d.history = [{ t: T, robot: 'R1', result: 'w' }, { t: T + 5, robot: 'R2', result: 'l' }]; }, (d) => { d.history = [{ t: T + 9, robot: 'R1', result: 'w' }]; }, 3);
  both('xiangqi coachOn per robot = lww, later write wins', 'xiangqi', 'settings.coachOn.R1', (d) => { d.settings.coachOn = { R1: true }; }, (d, r) => { r.lc += 5; d.settings.coachOn = { R1: false }; }, false);
  { const { A, B } = twoDevices('xiangqi', (d) => { d.settings.coords = true; d.game = { startFen: 'x', moves: ['a'] }; }, (d) => { d.settings.coords = false; }); eq('xiangqi device settings + in-progress game stay local (never overwritten)', [A.data.settings.coords, A.data.game, B.data.settings.coords, B.data.game], [true, { startFen: 'x', moves: ['a'] }, false, undefined]);
    eq('xiangqi stats.sessions = sum', get(twoDevices('xiangqi', (d) => { d.stats.sessions = 3; }, (d) => { d.stats.sessions = 4; }).A.data, 'stats.sessions'), 7); }
  // ---------- chess (catalog with step ids like G1.9 / G1.10)
  { const C = STEP_ORDER.chess!; const L = C.filter((x) => /^G1\./.test(x)); const lo = L[8] ?? 'G1.9', hi = L[9] ?? 'G1.10';
    both(`chess stepId ${hi} is after ${lo} (string max says the opposite)`, 'chess', 'lessons.G1.stepId', (d) => set(d, 'lessons.G1', { stars: 1, stepId: lo, done: false }), (d) => set(d, 'lessons.G1', { stars: 1, stepId: hi, done: false }), hi); }
  // ---------- mars-base
  const mnode = (o: object) => ({ st: 'open', stars: 0, plays: 0, ft: [], ...o });
  both('mars node: done beats open, stars/plays max, ft longer', 'mars-base', 'nodes.n1', (d) => set(d, 'nodes.n1', mnode({ st: 'done', stars: 2, plays: 3, ft: [1, 0] })), (d) => set(d, 'nodes.n1', mnode({ st: 'open', stars: 1, plays: 1, ft: [0] })), { st: 'done', stars: 2, plays: 3, ft: [1, 0] });
  { // RE-OPEN (cert.ts / adaptive.ts): the game bumps g; the re-opened state beats the stale 'done' even from a device that never saw it, and `why` is cleared too
    const { A, B, sv } = fresh('mars-base');
    A.data.nodes.n1 = mnode({ st: 'skipped', stars: 0, plays: 0, why: 'direct' }); A.sync(sv); B.sync(sv); eq('mars skipped node reaches B', B.data.nodes.n1.st, 'skipped');
    A.data.nodes.n1 = { ...A.data.nodes.n1, st: 'open', why: undefined, g: 1 }; delete A.data.nodes.n1.why; A.sync(sv); A.sync(sv); eq('mars re-opened node is NOT reverted by the next sync (one device)', [A.data.nodes.n1.st, A.data.nodes.n1.why], ['open', undefined]);
    B.sync(sv); eq('mars re-open reaches the stale device, including the cleared `why`', [B.data.nodes.n1.st, B.data.nodes.n1.why, B.data.nodes.n1.g], ['open', undefined, 1]);
    B.data.nodes.n1.st = 'done'; B.data.nodes.n1.stars = 2; B.sync(sv); A.sync(sv); eq('mars after the re-open the child can finish it again (done beats open at the same g)', [A.data.nodes.n1.st, A.data.nodes.n1.stars], ['done', 2]);
  }
  both('mars cert: lit beats half whatever the attempts', 'mars-base', 'cert.C1.state', (d) => { d.cert.C1 = { state: 'lit', attempts: 1 }; }, (d) => { d.cert.C1 = { state: 'half', attempts: 3 }; }, 'lit');
  both('mars session.lastActiveAt (epoch-ms 1.79e12) is max and SURVIVES', 'mars-base', 'session.lastActiveAt', (d) => { d.session.lastActiveAt = T; }, (d) => { d.session.lastActiveAt = T + 1000; }, T + 1000);
  both('mars errors.recent ring keeps epoch-ms entries', 'mars-base', 'errors.slip.recent.length', (d) => set(d, 'errors.slip', { n: 1, recent: [{ fam: 'f', at: T }] }), (d) => set(d, 'errors.slip', { n: 2, recent: [{ fam: 'f', at: T + 9 }] }), 2);
  both('mars recent ring (300) ordered by visit', 'mars-base', 'recent', (d) => { d.recent = ['aa|f|1|1|0|0|0|m|3|n|']; }, (d) => { d.recent = ['bb|f|1|1|0|0|0|m|5|n|']; }, ['aa|f|1|1|0|0|0|m|3|n|', 'bb|f|1|1|0|0|0|m|5|n|']);
  both('mars onboarded / tutorials = or / union (a first-run flag set anywhere stays set)', 'mars-base', 'tutorials', (d) => { d.tutorials.t1 = true; }, (d) => { d.tutorials.t2 = true; }, { t1: true, t2: true });
  both('mars visited / cards = union', 'mars-base', 'cards', (d) => { d.cards = ['c1']; }, (d) => { d.cards = ['c2']; }, ['c1', 'c2']);
  { const { A } = twoDevices('mars-base', (d) => { d.salt = 11; d.mission = { node: 'n' }; }, (d) => { d.salt = 99; }); eq('mars salt / mission stay local', [A.data.salt, A.data.mission], [11, { node: 'n' }]); }
  // ---------- snake-battle / sokoban / military-chess / emoji-match / memory-matrix
  both('snake life.kills = sum', 'snake-battle', 'life.kills', (d) => { d.life.kills = 10; }, (d) => { d.life.kills = 5; }, 15);
  both('sokoban stats.activeMs 2.6e9 (> 1e9 slot cap of the old prototype) + 1e9 = 3.6e9', 'sokoban', 'stats.activeMs', (d) => { d.stats.activeMs = 2.6e9; }, (d) => { d.stats.activeMs = 1e9; }, 3.6e9);
  both('sokoban best = min', 'sokoban', 'levels.C1.best', (d) => set(d, 'levels.C1', { best: 12, stars: 1, clean: false, firstClean: false, plays: 1, hintMax: 0 }), (d) => set(d, 'levels.C1', { best: 9, stars: 2, clean: true, firstClean: true, plays: 2, hintMax: 1 }), 9);
  { const { A } = twoDevices('sokoban', (d) => set(d, 'levels.L9', { best: null, stars: 0, clean: false, firstClean: false, plays: 1, hintMax: 0 }), () => {}); eq('sokoban legacy best:null is not deleted locally', A.data.levels.L9.best, null); }
  both('sokoban cert.at (epoch-ms) = earliest', 'sokoban', 'cert.at', (d) => { d.cert.at = T + 5; }, (d) => { d.cert.at = T; }, T);
  both('sokoban cosmetics.owned = union', 'sokoban', 'cosmetics.owned', (d) => { d.cosmetics.owned = ['h1']; }, (d) => { d.cosmetics.owned = ['h2']; }, ['h1', 'h2']);
  both('military-chess family.log (epoch-ms) ring keeps both', 'military-chess', 'family.log.length', (d) => { d.family.log = [T, T + 1]; }, (d) => { d.family.log = [T + 2]; }, 3);
  both('military-chess items.at (epoch-ms) max', 'military-chess', 'items.i1.at', (d) => set(d, 'items.i1', { stars: 1, best: 3, tries: 1, hintMax: 0, at: T }), (d) => set(d, 'items.i1', { stars: 2, best: 3, tries: 1, hintMax: 0, at: T + 7 }), T + 7);
  { const { A, B } = twoDevices('military-chess', (d) => { d.settings.unlockAll = true; d.settings.aiOverride = 'x'; }, () => {}); eq('military-chess TEST switches never leave the device', [A.data.settings.unlockAll, B.data.settings.unlockAll, B.data.settings.aiOverride], [true, DEFAULTS['military-chess'].settings.unlockAll, DEFAULTS['military-chess'].settings.aiOverride]); }
  both('emoji-match level stars = max', 'emoji-match', 'levels.l1.stars', (d) => set(d, 'levels.l1', { stars: 1, bestLeft: 0, attempts: 1, wins: 0 }), (d) => set(d, 'levels.l1', { stars: 3, bestLeft: 4, attempts: 2, wins: 1 }), 3);
  { const { A, B, sv } = fresh('memory-matrix');
    B.data.sectors.s1 = { sector: 's1', open: true, tracks: [{ L: 5 }] }; B.sync(sv); A.sync(sv); A.data.sectors.s1 = { sector: 's1', open: true, tracks: [{ L: 3 }] }; A.sync(sv); B.sync(sv); eq('memory-matrix adaptive sector goes DOWN too (whole sector is one lww register)', B.data.sectors.s1.tracks[0].L, 3); }
  // ---------- economy / settings / hub-seen / metrics
  { const { A, B, sv } = fresh('economy');
    A.data.pet['slot:room1:3'] = 'item:lamp'; A.data.seen = ['tut.shop']; A.sync(sv); B.sync(sv); B.data.pet['slot:room1:3'] = null; B.data.seen = [...B.data.seen, 'first.egg']; B.sync(sv); A.sync(sv);
    eq('economy pet slot deleted by null on B (later) wins on A; seen = union; the ledger field stays local', [A.data.pet['slot:room1:3'], A.data.seen.slice().sort(), A.data.ledger, B.data.ledger], [null, ['first.egg', 'tut.shop'], [], []]); }
  both('settings displayName = lww', 'settings', 'displayName', (d) => { d.displayName = '小步步'; }, (d, r) => { r.lc += 3; d.displayName = '步步'; }, '步步');
  { const { A, B } = twoDevices('settings', (d) => { d.skipIntros = true; d.unlockAll = true; }, () => {}); eq('settings skipIntros / unlockAll are TEST switches: stay on the device that set them', [A.data.skipIntros, B.data.skipIntros, B.data.unlockAll], [true, false, false]); }
  { const rule = SCHEMAS['hub-seen']!; const sv = new Server1(); const X = new Replica(rule, 'A', ['a'], []), Y = new Replica(rule, 'B', ['b'], []); X.sync(sv); Y.sync(sv); X.sync(sv); eq('hub:seen union', X.data.slice().sort(), ['a', 'b']); }
  { const rule = SCHEMAS.metrics!, sv = new Server1(); const X = new Replica(rule, 'A', {}, {}), Y = new Replica(rule, 'B', {}, {}); X.data['xiangqi@ipad'] = { v: 1, updatedAt: T }; Y.data['xiangqi@phone'] = { v: 1, updatedAt: T + 9 }; X.sync(sv); Y.sync(sv); X.sync(sv); eq('metrics are keyed by device: both rows survive', Object.keys(X.data).sort(), ['xiangqi@ipad', 'xiangqi@phone']); }
  // ---------- RESET (slot generation): the game's 重置本游戏进度 / store.reset()
  { const rule = SCHEMAS.sokoban!, sv = new Server1(); const A = new Replica(rule, 'A', clone(SAMPLES.sokoban), DEFAULTS.sokoban), B = new Replica(rule, 'B', clone(DEFAULTS.sokoban), DEFAULTS.sokoban);
    A.sync(sv); B.sync(sv); eq('reset: B has the progress', Object.keys(B.data.levels), ['C1']); A.reset(DEFAULTS.sokoban); A.sync(sv); B.sync(sv);
    eq('reset: a stale device adopts the reset (no resurrection of levels / cosmetics / sums)', [B.data.levels, B.data.cosmetics.owned, B.data.stats.pushes, B.data.inProgress], [{}, [], 0, undefined]);
    B.data.levels.C2 = { best: 8, stars: 3, clean: true, firstClean: true, plays: 1, hintMax: 0 }; B.data.stats.pushes = 7; B.sync(sv); A.sync(sv); eq('reset: play after the reset accumulates normally', [Object.keys(A.data.levels), A.data.stats.pushes], [['C2'], 7]);
    const C = new Replica(rule, 'C', clone(SAMPLES.sokoban), DEFAULTS.sokoban); C.sync(sv); eq('reset: a device that was offline with old progress (generation 0) cannot resurrect it', [Object.keys(C.data.levels).sort(), C.data.stats.pushes], [['C2'], 7]); }
  // ---------- the BROWSER clears the game key (Safari 7-day cleanup, DevTools): behaves like a fresh join, the cloud copy comes back and unchanged defaults do not overwrite cloud values
  { const rule = SCHEMAS.sokoban!, sv = new Server1(); const A = new Replica(rule, 'A', clone(SAMPLES.sokoban), DEFAULTS.sokoban); A.data.stats.pushes = 40; A.data.cosmetics.equipped.hat = 'h9'; A.sync(sv);
    A.clearKey(DEFAULTS.sokoban); A.sync(sv); eq('cleared key: levels + cosmetics + sums come back from the cloud', [Object.keys(A.data.levels), A.data.cosmetics.equipped.hat, A.data.stats.pushes, A.g], [['C1'], 'h9', 40, undefined]);
    eq('cleared key: NOT a reset (generation unchanged, server copy intact)', [A.g, Object.keys(sv.state.d.levels)], [undefined, ['C1']]); }
  return out;
}
