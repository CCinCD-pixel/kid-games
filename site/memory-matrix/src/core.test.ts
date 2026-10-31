// 星图记忆站 validators on the production modules (spec §10.4 / §11). The oracle's own checks (selftest, golden fixtures, stats / sim / pacing) run
// on the TS core through the generated copies in ./oracle; the tests below add what only the page has: the engine, the save, layout, voice policy, metrics.
//   npm run check   -> N = 300 per level (quick)      MM_FULL=1 npx vitest run site/memory-matrix  -> N = 2000, 100 x 400 sim, 60 pacing runs (spec §11)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import levels from '../../../content/memory-matrix/levels.json';
import cardsJson from '../../../content/memory-matrix/cards.json';
import lines from '../../../content/memory-matrix/lines.json';
import policy from '../../../content/memory-matrix/voice-policy.json';
import { createRng } from './core/rng';
import { makeHistory } from './core/grid';
import { generateSafe } from './core/gen';
import { NDIFF, TABLE } from './core/params';
import { CARDS } from './core/cards';
import { SAVE_VERSION, classify as classifySave, sizeBytes } from './core/save';
import { Engine, SECTOR_IDS, normalizeSave, type Outcome, type Plan } from './core/session';
import { computeLayout, cellSize, starHit, subtitleStrip } from './core/layout';
import { Voice, dwellMs } from './core/voice';
import { bandMetric, breadthMetric, lookMetric } from './core/metrics';
import { runTool } from './oracle/harness';

const ROOT = path.resolve(__dirname, '../../..');
const FULL = process.env.MM_FULL === '1';
const clean = (o?: Partial<Outcome>): Outcome => ({ slips: 0, rwPre: 0, rwMid: 0, hint: 0, showAnswer: false, ...o });
const miss = (p: Plan): Outcome => clean({ slips: p.budget + 1 });
const salt = () => 'test-salt';
const newEngine = (raw?: unknown) => new Engine(raw ?? null, { mkSalt: salt, now: () => 1_800_000_000_000 });

describe('oracle mirror and content', () => {
  it('src/core is the generated mirror of the oracle (sync-core.mjs --check)', () => {
    expect(spawnSync('node', ['tools/memory-matrix/sync-core.mjs', '--check'], { cwd: ROOT }).status).toBe(0);
  });
  it('levels.json carries the oracle tables, a window per level and one safe stimulus per (sector, D)', () => {
    expect(levels.sectors).toEqual(JSON.parse(JSON.stringify(TABLE)));
    for (const s of SECTOR_IDS) for (let D = 1; D <= NDIFF; D += 1) {
      const w = (levels.window as Record<string, number>)[`${s}:${D}`];
      expect(w, `${s}:${D} window`).toBeGreaterThanOrEqual(5);
      expect(w).toBeLessThanOrEqual(64);
      expect((levels.safe as Record<string, { key: string }>)[`${s}:${D}`]?.key, `${s}:${D} safe stimulus`).toBeTruthy();
    }
  });
  it('generateSafe never throws, even when the row is impossible (safe table from levels.json)', () => {
    let fallbacks = 0;
    for (const s of SECTOR_IDS) {
      const row = { ...TABLE[s][4] } as Record<string, unknown>;
      if (s === 's1') { row.n = 14; row.k = 1; } else if (s === 's2') { row.c = 2; row.L = 3; row.m = 3; } else if (s === 's3') { row.n = 6; row.twins = 0; row.rows = 1; row.cols = 2; } else { row.n = 12; }
      const hist = makeHistory(64, 6);
      for (let i = 0; i < 5; i += 1) { const x = generateSafe(s, 5, createRng(`inj:${s}:${i}`), hist, { row, safe: levels.safe }); if (x.fallback === 3) fallbacks += 1; expect(x.key).toBeTruthy(); }
    }
    expect(fallbacks).toBeGreaterThan(0);
  }, 180_000);
  it('cards.json = the 28 cards + 元老, every card has a fact line and a (still unsigned) source note', () => {
    expect(cardsJson.cards).toHaveLength(29);
    expect(cardsJson.cards.map((c) => c.id).sort()).toEqual(CARDS.map((c: { id: string }) => c.id).sort());
    for (const c of cardsJson.cards) { expect(c.fact, c.id).toBeTruthy(); expect([...c.fact].length).toBeLessThanOrEqual(20); expect(c.signedBy).toBe(''); expect(c.source).toBeTruthy(); }
    expect(cardsJson.wall).toHaveLength(28);
  });
  it('every narration line has a subtitle of <= 15 characters (card facts <= 20) and every policy id exists', () => {
    const L = lines as Record<string, { text: string }>;
    for (const [id, l] of Object.entries(L)) expect([...l.text].length, id).toBeLessThanOrEqual(id.startsWith('mm.card.') ? 20 : 15);
    for (const id of Object.keys(policy.lines)) expect(L[id], id).toBeTruthy();
    expect(Object.keys(L)).toHaveLength(105);
  });
});

describe('save', () => {
  it('a fresh save is valid, small, and newer versions are read-only', () => {
    const s = normalizeSave(null, salt);
    expect(s.v).toBe(SAVE_VERSION);
    expect(sizeBytes(s)).toBeLessThan(16_000);
    expect(classifySave('{"v":2}')).toBe('newer');
    expect(s.sectors.s1.open).toBe(true);
    expect(s.sectors.s2.open).toBe(false);
  });
  it('normalizing repairs junk without losing known fields', () => {
    const s = normalizeSave({ nights: 'x', cards: ['s1.first', 7], sectors: { s2: { open: true, tracks: [{ L: 4 }], queue: ['easy', 'bogus'] } }, salt: 'abc' }, salt);
    expect(s.nights).toBe(0); expect(s.cards).toEqual(['s1.first']); expect(s.salt).toBe('abc');
    expect(s.sectors.s2.open).toBe(true); expect(s.sectors.s2.tracks[0].L).toBe(4); expect(s.sectors.s2.tracks).toHaveLength(2); expect(s.sectors.s2.queue).toEqual(['easy']);
  });
  it('the 元老 card: awarded once from the old save, never moves a level (Dad 2026-10-12)', () => {
    const live = JSON.stringify({ ladders: { sprout: { solved: { 1: { stars: 3 }, 2: { stars: 2 } } } } });
    const a = new Engine(null, { mkSalt: salt, legacyLive: live, now: () => 5 });
    expect(a.veteranNew).toBe(true);
    expect(a.save.cards).toContain('vet');
    expect(a.save.veteran).toMatchObject({ stars: 5, cleared: 2 });
    expect(a.sec('s1').tracks[0].L).toBe(3);
    const b = new Engine(a.serialize(), { mkSalt: salt, legacyLive: live, now: () => 9 });
    expect(b.veteranNew).toBe(false);
    expect(b.save.cards.filter((c) => c === 'vet')).toHaveLength(1);
    expect(new Engine(null, { mkSalt: salt, legacyLive: null }).save.cards).not.toContain('vet');
  });
});

describe('engine', () => {
  it('leaving and coming back replays the SAME stimulus (same seed) and never writes a half-played gate', () => {
    for (const s of SECTOR_IDS) {
      const a = newEngine(); if (s !== 's1') a.sec(s).open = true;
      a.startNight(s); const p1 = a.plan(); a.phase = 'recall';
      const saved = a.serialize();
      expect(saved.sectors[s].gate).toBeNull(); expect(saved.sectors[s].pending).toBeNull();
      const b = new Engine(saved, { mkSalt: salt }); b.startNight(s); const p2 = b.plan();
      expect(p2.stim.key, s).toBe(p1.stim.key);
      expect(b.sec(s).carryRw).toBe(0);
      expect(p2.rwCarry).toBe(1);
    }
  });
  it('stars: 3 / 2 / 1 by attempt, -1 for the free look, -1 more for the second look or a hint, minimum 1, fixed once lit', () => {
    const e = newEngine(); e.startNight('s1');
    let p = e.plan(); const D = p.D; expect(e.finish(p, clean()).stars).toBe(3);
    expect(e.sec('s1').byLevel[D].stars).toBe(3);
    const e2 = newEngine(); e2.startNight('s1'); p = e2.plan(); expect(e2.finish(p, clean({ rwPre: 1 })).stars).toBe(2);
    const e3 = newEngine(); e3.startNight('s1'); p = e3.plan(); expect(e3.finish(p, clean({ rwPre: 1, hint: 2 })).stars).toBe(1);
    const e4 = newEngine(); e4.startNight('s1'); p = e4.plan(); const f = e4.finish(p, miss(p)); expect(f.res).toBe('miss'); expect(f.stars).toBe(0);
    expect(e4.sec('s1').byLevel[p.D].att).toBe(1);
  });
  it('a perfect child: placement jumps, sectors open one after the other, gates may come between two rounds of a night (v1.2), cards need nights', () => {
    const e = newEngine(); const seen: string[] = []; let gates = 0, nights = 0;
    for (let n = 0; n < 40; n += 1) {
      const sector = e.recommended(); e.startNight(sector); nights += 1;
      for (let guard = 0; guard < 40; guard += 1) {
        const p = e.plan(); seen.push(`${p.sector}:${p.kind}:${p.D}`);
        if (p.kind === 'gate') { gates += 1; expect(e.sec(sector).nr).toBeLessThan(6); }
        const f = e.finish(p, clean());
        if (f.night) { expect(f.night.valid).toBe(true); break; }
      }
    }
    expect(nights).toBe(40); expect(e.save.nights).toBe(40);
    expect(SECTOR_IDS.every((s) => e.isOpen(s))).toBe(true);
    expect(gates).toBeGreaterThan(5);
    expect(e.save.cards.length).toBeGreaterThan(10);
    for (const c of e.save.cards) { if (c === 'vet') continue; const card = CARDS.find((x: { id: string }) => x.id === c); expect(card?.need ?? 0, c).toBeLessThanOrEqual(e.save.nights); }
    expect(sizeBytes(e.serialize())).toBeLessThan(16_000);
  });
  it('misses: a missed round is recorded, the ladder falls, the night still ends after 6 rounds, nothing throws', () => {
    const e = newEngine(); e.startNight('s1'); let ended = false, n = 0;
    while (!ended && n < 30) { const p = e.plan(); const f = e.finish(p, miss(p)); n += 1; ended = !!f.night; }
    expect(ended).toBe(true);
    expect(e.sec('s1').tracks[0].L).toBeGreaterThanOrEqual(1);
    expect(e.sec('s1').stats.miss).toBeGreaterThan(0);
  });
  it('practice rounds on a bridged level light it with 3 stars and never touch the staircase or the statistics', () => {
    const e = newEngine(); e.startNight('s1'); e.finish(e.plan(), clean());              // placement jump: levels below L that were never played become bridges
    const bridge = e.levelView('s1').find((v) => v.state === 'bridge');
    expect(bridge).toBeTruthy();
    const before = JSON.stringify(e.sec('s1').tracks), rounds = e.sec('s1').stats.rounds;
    const p = e.practicePlan('s1', bridge!.D); expect(p.bridge).toBe(true);
    expect(e.finish(p, clean()).stars).toBe(3);
    expect(JSON.stringify(e.sec('s1').tracks)).toBe(before); expect(e.sec('s1').stats.rounds).toBe(rounds);
    expect(e.levelView('s1')[bridge!.D - 1].state).toBe('lit');
  });
  it('s4 first rounds per axis are primer rounds (ghost 100 / 50 / 0 %, not measured)', () => {
    const e = newEngine(); e.sec('s4').open = true; e.startNight('s4'); const ghosts: (number | null)[] = [];
    for (let i = 0; i < 6; i += 1) { const p = e.plan(); ghosts.push(p.kind === 'primer' ? p.ghost : null); e.finish(p, clean()); }
    expect(ghosts.filter((g) => g !== null).length).toBeGreaterThanOrEqual(3);
    expect(e.sec('s4').stats.rounds).toBeLessThan(6);
  });
});

describe('layout (spec §2.2 table)', () => {
  const cases: [string, number, number, ReturnType<typeof computeLayout>['kind'], number, { top: number; right: number; bottom: number; left: number }?][] = [
    ['iPad portrait', 810, 1080, 'tablet-portrait', 640], ['iPad landscape', 1080, 810, 'tablet-landscape', 640],
    ['iPhone 13', 390, 664, 'phone-portrait', 366], ['iPhone SE', 320, 568, 'phone-portrait', 296], ['iPhone landscape', 844, 390, 'phone-landscape', 353, { top: 0, right: 47, bottom: 21, left: 47 }],
    ['iPhone SE 2/3 landscape', 667, 375, 'phone-landscape', 317, { top: 0, right: 47, bottom: 21, left: 47 }], ['iPhone SE 1 landscape', 568, 320, 'phone-landscape', 304],
  ];
  for (const [name, w, h, kind, S, safe] of cases) it(`${name}: board ${S}, hit floors, home button clear of the board`, () => {
    const L = computeLayout(w, h, safe);
    expect(L.kind).toBe(kind); expect(L.S).toBe(S);
    expect(cellSize(L.S, 6, L.gap)).toBeGreaterThanOrEqual(L.minHit - (name === 'iPhone SE' ? 0 : 0));
    expect(cellSize(L.S, 6, L.gap, L.mirror)).toBeGreaterThanOrEqual(L.minHit);
    expect(starHit(L.S)).toBeGreaterThanOrEqual(L.minHit - (L.S < 300 ? 0 : 0));
    // the kit's 🏠 button (56 x 56 at the top-left) must not overlap the board
    const home = { x: 0, y: 0, w: 56 + 12 + (safe?.left ?? 0), h: 56 + 12 + (safe?.top ?? 0) };
    const overlap = L.x < home.x + home.w && L.x + L.S > home.x && L.y < home.y + home.h && L.y + L.S > home.y;
    expect(overlap, 'board overlaps the home button').toBe(false);
    expect(L.x).toBeGreaterThanOrEqual(0); expect(L.x + L.S).toBeLessThanOrEqual(w - (safe?.right ?? 0)); expect(L.y + L.S).toBeLessThanOrEqual(h - (safe?.bottom ?? 0));
    // QA r1 blocker: the side column (landscape) / the action bar (portrait) that carries the result sheet and the five buttons lies fully inside the safe screen and is tall enough for a 44 px button
    const R = L.side ?? L.actRect!, bottom = h - (safe?.bottom ?? 0);
    expect(R, 'a column or bar for the buttons').toBeTruthy(); expect(R.y).toBeGreaterThanOrEqual(0); expect(R.y + R.h, 'buttons column ends above the home indicator').toBeLessThanOrEqual(bottom + 0.5);
    expect(R.x).toBeGreaterThanOrEqual(0); expect(R.x + R.w).toBeLessThanOrEqual(w - (safe?.right ?? 0) + 0.5); expect(R.h).toBeGreaterThanOrEqual(44);
  });
  it('the subtitle strip (66 px + safe bottom) is reserved on the non-round screens', () => {
    for (const [w, h, sb] of [[810, 1080, 0], [1080, 810, 0], [390, 664, 34], [320, 568, 0], [844, 390, 21], [667, 375, 21], [568, 320, 0]] as const) {
      const strip = subtitleStrip(h, sb);
      expect(strip.top, `${w}x${h}`).toBe(h - sb - 10 - 56); expect(strip.top).toBeGreaterThan(h / 2);
    }
  });
});

describe('voice policy', () => {
  const mk = () => {
    const narrator = { speaking: false, say: vi.fn(() => Promise.resolve('done')) } as unknown as import('@kit/narration').Narrator;
    const state = { once: [] as string[], week: {} as Record<string, number>, nightAt: {} as Record<string, number> };
    let clock = 0; const v = new Voice(narrator, state, { now: () => clock * 86_400_000, nightClock: () => clock });
    return { v, narrator, state, tick: (n = 1) => { clock += n; } };
  };
  it('once-only lines play once; round prompts only on night 1 / rule change / after being away', async () => {
    const { v, narrator } = mk();
    expect(await v.say('mm.st.1')).toBe('done'); expect(await v.say('mm.st.1')).toBe('skipped');
    expect(await v.say('mm.s1.prompt', {})).toBe('skipped');
    expect(await v.say('mm.s1.prompt', { night1: true })).toBe('done');
    expect(await v.say('mm.s1.prompt', { awayMin: 3 })).toBe('done');
    expect((narrator.say as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(3);
  });
  it('praise only after a pass, at most one per 3 rounds; point-off lines at most once per round; axis lines only when the axis changes', async () => {
    const { v } = mk();
    expect(await v.say('mm.fb.ok1', { pass: false })).toBe('skipped');
    v.newRound(); expect(await v.say('mm.fb.ok1', { pass: true })).toBe('done');
    v.newRound(); expect(await v.say('mm.fb.ok2', { pass: true })).toBe('skipped');
    v.newRound(); v.newRound(); v.newRound(); expect(await v.say('mm.fb.ok2', { pass: true })).toBe('done');
    v.newRound(); expect(await v.say('mm.fb.slip1', {})).toBe('done'); expect(await v.say('mm.fb.slip1', {})).toBe('skipped');
    expect(await v.say('mm.s4.axis.LR', {})).toBe('skipped'); expect(await v.say('mm.s4.axis.LR', { axisChanged: true })).toBe('done');
  });
  it('strategy tips cool down for 3 nights and never follow a slip; droppable lines are dropped while the narrator is busy', async () => {
    const { v, narrator, tick } = mk();
    expect(await v.say('mm.s1.cluster', { afterSlip: true })).toBe('skipped');
    expect(await v.say('mm.s1.cluster', {})).toBe('done'); tick(1); expect(await v.say('mm.s1.cluster', {})).toBe('skipped'); tick(3); expect(await v.say('mm.s1.cluster', {})).toBe('done');
    (narrator as unknown as { speaking: boolean }).speaking = true; v.newRound();
    expect(await v.say('mm.fb.ok3', { pass: true })).toBe('skipped'); expect(await v.say('mm.s1.t1', {})).toBe('done');
  });
});

describe('parent metrics', () => {
  it('three metrics, within the kit limits, only once there is data', () => {
    const s = normalizeSave(null, salt);
    expect(bandMetric(s)).toBeNull(); expect(breadthMetric(s)).toBeNull(); expect(lookMetric(s)).toBeNull();
    s.sectors.s1.last20 = 'ppppppppppppnppppppp'; s.sectors.s1.span = { cl: 6, sc: 4 }; s.sectors.s1.stats = { ...s.sectors.s1.stats, rounds: 20, rewatch: 5, rw2: 1 };
    const a = bandMetric(s)!, b = breadthMetric(s)!, c = lookMetric(s)!;
    for (const m of [a, b, c]) { expect([...String(m.value)].length).toBeLessThanOrEqual(16); expect([...(m.detail ?? '')].length).toBeLessThanOrEqual(48); }
    expect(a.status).toBe('ok');
    s.sectors.s1.badStreak = 3; expect(bandMetric(s)!.status).toBe('watch'); expect(bandMetric(s)!.hint).toContain('陪他玩一次');
  });
});

describe(`oracle validators on the TS core (N = ${FULL ? 'full' : 'quick'})`, () => {
  it('generators: spec §11.1 acceptance bands, baseline bots, ladder monotone', async () => {
    const r = await runTool('stats', [`--n=${FULL ? 2000 : 300}`, '--stretch']);
    expect(r.out.filter((l) => /FAIL/.test(l)), r.out.slice(-8).join('\n')).toEqual([]);
    expect(r.code).toBe(0);
  }, 600_000);
  it('adaptive simulation: 4-up/1-down converges, no dead loops, gates only after >= 3 rounds at the level', async () => {
    const r = await runTool('sim', [`--runs=${FULL ? 100 : 30}`, '--rounds=400']);
    expect(r.out.filter((l) => /FAIL/.test(l)), r.out.slice(-8).join('\n')).toEqual([]);
    expect(r.code).toBe(0);
  }, 900_000);
  it('six-week pacing: cards come 3 nights apart, strong children do not run dry', async () => {
    const r = await runTool('pacing', [`--runs=${FULL ? 60 : 20}`]);
    expect(r.out.filter((l) => /FAIL/.test(l)), r.out.slice(-8).join('\n')).toEqual([]);
    expect(r.code).toBe(0);
  }, 900_000);
});

it('the fixtures folder is the oracle\'s', () => {
  for (const f of ['gen-50seeds.json', 'controller-traces.json', 'veteran-cases.json']) expect(fs.existsSync(path.join(ROOT, 'tests/memory-matrix/golden', f))).toBe(true);
});

/* ====================================================================================================== QA round 1 regressions */
describe('QA round 1: leave and return (spec §3.6)', () => {
  const twoWings = (): Engine => { const e = newEngine(); const st = e.sec('s2'); st.open = true; st.tracks[0].cleared = 1; st.tracks[0].L = 6; st.tracks[0].maxL = 6; return e; };
  it('leaving before any round was finished writes the sector as if the night never began: same wing, same seed, no counters', () => {
    const e = twoWings(); const before = JSON.stringify(e.serialize().sectors.s2), seen = new Set<string>();
    for (let k = 0; k < 5; k += 1) { e.startNight('s2'); const p = e.plan(); seen.add(`${p.D}:${p.seed}:${p.stim.dir}`); e.abandon('ready'); }
    expect(seen.size).toBe(1);
    expect(JSON.stringify(e.serialize().sectors.s2)).toBe(before);
    expect(e.sec('s2').nights).toBe(0); expect(e.sec('s2').swaps).toBe(0);
  });
  it('the persisted save of an open night is the same snapshot (a page reload does not inflate the counters either)', () => {
    const e = twoWings(); const before = JSON.stringify(e.serialize().sectors.s2);
    e.startNight('s2'); e.plan();
    expect(JSON.stringify(e.serialize().sectors.s2)).toBe(before);
  });
  it('leaving after finished rounds resumes the same night: same wing, counters unchanged, the next puzzle is the one he left', () => {
    const e = twoWings(); e.startNight('s2');
    for (let i = 0; i < 2; i += 1) e.finish(e.plan(), clean());
    const nights = e.sec('s2').nights, cur = e.sec('s2').cur, nextBefore = e.plan(); e.abandon('ready');
    e.startNight('s2'); const again = e.plan();
    expect(e.sec('s2').nights).toBe(nights); expect(e.sec('s2').cur).toBe(cur); expect(e.sec('s2').nr).toBe(2);
    expect(again.seed).toBe(nextBefore.seed); expect(again.D).toBe(nextBefore.D);
    expect(e.night?.rounds).toHaveLength(2);
    // ...and it survives a reload (serialize -> new engine)
    const e2 = new Engine(JSON.parse(JSON.stringify(e.serialize())), { mkSalt: salt, now: () => 1_800_000_000_000 }); e2.startNight('s2');
    expect(e2.sec('s2').nr).toBe(2); expect(e2.night?.rounds).toHaveLength(2); expect(e2.plan().seed).toBe(again.seed);
  });
  it('leaving in fog / recall is ONE look-again that adds up; leaving while the stars are shown costs nothing', () => {
    const e = newEngine(); e.startNight('s1');
    e.plan(); e.abandon('show'); expect(e.sec('s1').carryRw).toBe(0);
    e.startNight('s1'); e.plan(); e.abandon('recall'); expect(e.sec('s1').carryRw).toBe(1);
    e.startNight('s1'); e.plan(); e.abandon('fog'); expect(e.sec('s1').carryRw).toBe(2);
    e.startNight('s1'); const p = e.plan(); expect(p.rwCarry).toBe(2);
    expect(e.finish(p, clean({ rwPre: p.rwCarry })).res).toBe('neutral');        // the second look is not free
  });
  it('the carried look survives a leave at the ready phase (it was consumed by plan(), not lost)', () => {
    const e = newEngine(); e.startNight('s1'); e.plan(); e.abandon('recall');
    e.startNight('s1'); e.plan(); e.abandon('ready'); expect(e.sec('s1').carryRw).toBe(1);
  });
  it('a night cut short after 2 misses is a bad night (the streak is not reset), a night with <= 3 clean rounds touches nothing', () => {
    const e = newEngine(); e.startNight('s1');
    for (let i = 0; i < 2; i += 1) { const p = e.plan(); e.finish(p, miss(p)); }
    e.closeNight(); expect(e.sec('s1').badStreak).toBe(1);
    e.startNight('s1'); e.finish(e.plan(), clean()); const clock = e.save.nightClock; e.closeNight();
    expect(e.sec('s1').badStreak).toBe(1); expect(e.save.nightClock).toBe(clock);
  });
});

describe('QA round 1: saves and clocks never break the game', () => {
  it('out-of-range numbers are repaired (L = 99 / 0, garbage counters): plan() never throws and the level stays inside its gate', () => {
    for (const bad of [99, 0, -3, NaN, '7', null, 1e9]) {
      const raw = { sectors: { s1: { open: true, nr: bad, cur: bad, tracks: [{ L: bad, maxL: bad, cleared: bad, atG: bad, s: bad, m: bad, park: bad }], byLevel: { 3: { att: bad, stars: bad }, 99: { att: 1, stars: 1 } } }, s2: { cur: 7, tracks: [{ L: 99 }, { L: 99 }] } } };
      const e = newEngine(raw);
      for (const id of SECTOR_IDS) { e.startNight(id); const p = e.plan(); expect(p.D).toBeGreaterThanOrEqual(1); expect(p.D).toBeLessThanOrEqual(15); e.abandon(); }
      const t = e.sec('s1').tracks[0], lim = t.cleared < t.gates.length ? t.gates[t.cleared] : t.len; expect(t.L).toBeGreaterThanOrEqual(1); expect(t.L).toBeLessThanOrEqual(lim);
      expect(e.sec('s1').byLevel[99]).toBeUndefined();
    }
  });
  it('a clock set into the future cannot block the 14-day welcome-back after it is corrected; +20 days queues exactly one easy round', () => {
    const base = 1_800_000_000_000, DAY = 86_400_000;
    const future = new Engine({ lastSeen: base + 400 * DAY }, { mkSalt: salt, now: () => base });
    expect(future.awayMs()).toBe(0); expect(future.save.lastSeen).toBeLessThanOrEqual(base);
    const away = new Engine({ lastSeen: base - 20 * DAY }, { mkSalt: salt, now: () => base });
    away.startNight('s1'); expect(away.sec('s1').queue).toEqual(['easy']);
    const near = new Engine({ lastSeen: base - 2 * DAY }, { mkSalt: salt, now: () => base }); near.startNight('s1'); expect(near.sec('s1').queue).toEqual([]);
  });
  it('practice on a skipped (bridged) level is lit with 3 stars only by a PASS (a demo or a hint is neutral: no stars)', () => {
    const mk = () => { const e = newEngine(); const t = e.sec('s1').tracks[0]; t.L = 8; t.maxL = 8; return e; };
    const e1 = mk(); const p1 = e1.practicePlan('s1', 3); expect(p1.bridge).toBe(true);
    expect(e1.finish(p1, clean({ hint: 3 })).stars).toBe(0); expect(e1.sec('s1').byLevel[3]).toBeUndefined();
    const e2 = mk(); const f2 = e2.finish(e2.practicePlan('s1', 3), clean()); expect(f2.stars).toBe(3); expect(e2.sec('s1').byLevel[3].stars).toBe(3);
  });
});

describe('QA round 1: the staircase for a strong child (v1.2)', () => {
  const play = (sector: 's1' | 's2' | 's3' | 's4', rounds: number) => {
    const e = newEngine(); e.startNight(sector); const kinds: string[] = [], levels: number[] = []; let primers = 0, regular = 0, firstNight = true;
    while (regular < rounds) {
      const p = e.plan(); kinds.push(p.kind);
      if (p.kind === 'primer') { if (firstNight) primers += 1; } else if (p.kind !== 'gate') { levels.push(p.D); regular += 1; }
      const f = e.finish(p, clean());
      if (f.night) { firstNight = false; e.startNight(sector); }
    }
    return { kinds, levels, primers };
  };
  it('s1: the first star gate arrives inside night 1, the child never sees a level more than twice in a row before it, and keeps climbing after it', () => {
    const r = play('s1', 8);
    expect(r.kinds.indexOf('gate')).toBeGreaterThan(0); expect(r.kinds.indexOf('gate')).toBeLessThanOrEqual(5);
    const run = (xs: number[]) => { let m = 1, c = 1; for (let i = 1; i < xs.length; i += 1) { c = xs[i] === xs[i - 1] ? c + 1 : 1; m = Math.max(m, c); } return m; };
    expect(run(r.levels.slice(0, 8))).toBeLessThanOrEqual(2); expect(new Set(r.levels).size).toBeGreaterThanOrEqual(6); expect(r.levels).toContain(6);
  });
  it('s4: a clean child does at most 3 guided primers in night 1 (not 5 of 6); a struggling child keeps the guided path', () => {
    expect(play('s4', 6).primers).toBeLessThanOrEqual(3);
    const e = newEngine(); e.startNight('s4'); let primers = 0;
    for (let i = 0; i < 6; i += 1) { const p = e.plan(); if (p.kind === 'primer') { primers += 1; e.finish(p, clean({ slips: 1 })); } else e.finish(p, clean()); }
    expect(primers).toBeGreaterThanOrEqual(5);
  });
  it('a gate that is due is offered between two rounds, not only at the start of a night, and never in a night that went badly', () => {
    const e = newEngine(); const t = e.sec('s1').tracks[0]; t.L = 5; t.atG = 2; t.placement = false; e.startNight('s1');
    e.sec('s1').nr = 2; expect(e.plan().kind).toBe('gate'); e.abandon();
    const f = newEngine(); const u = f.sec('s1').tracks[0]; u.L = 5; u.atG = 2; u.placement = false; f.startNight('s1'); f.sec('s1').nr = 2; f.sec('s1').nightMiss = 2; expect(f.plan().kind).not.toBe('gate');
  });
});

describe('QA round 1: narration, new rules, subtitles, parent numbers', () => {
  const SRC = path.join(ROOT, 'site/memory-matrix/src');
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path.join(d, e.name)] : []));
  it('every line of lines.json is used by the page (a literal id or one of the id templates); nothing is synthesised for nothing', () => {
    const code = walk(SRC).filter((f) => !f.includes('/oracle/')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const templates = [...code.matchAll(/`(mm\.[a-z0-9.]*)\$\{[^}]*\}`/g)].map((m) => new RegExp(`^${m[1].replace(/\./g, '\\.')}.+$`));
    const unused = Object.keys(lines).filter((id) => !code.includes(`'${id}'`) && !code.includes(`"${id}"`) && !templates.some((t) => t.test(id)));
    expect(unused).toEqual([]);
  });
  it('a text-only line stays readable: about 0.18 s a character + 0.8 s', () => {
    expect(dwellMs('一二三四五六七八九十')).toBe(2600); expect(dwellMs('好')).toBeGreaterThanOrEqual(980);
  });
  it('the first appearance of a RULE (visitors, mirror up/down, backwards) is announced once: newRuleTag, then never again', () => {
    const e = newEngine(); const t = e.sec('s3').tracks[0]; t.L = 3; t.placement = false; e.sec('s3').open = true; e.startNight('s3');
    const p = e.plan(); expect(p.newRuleTag).toBe('s3:far'); e.markRuleSeen(p.newRuleTag); e.finish(p, clean());
    expect(e.plan().newRuleTag).toBeNull(); expect(e.save.seenRules).toContain('s3:far');
  });
  it('the breadth metric shows the mirror\'s 看着 / 记着 top level and stays within the parent page limits', () => {
    const e = newEngine(); e.sec('s4').span = { seeD: 7, peekD: 12, LR: [4, 3], UD: [2, 1] }; e.sec('s1').span = { cl: 5, sc: 4 };
    const m = breadthMetric(e.save)!; expect(m.value).toContain('镜7/12'); expect(m.detail).toContain('看7记12'); expect([...String(m.value)].length).toBeLessThanOrEqual(16); expect([...(m.detail ?? '')].length).toBeLessThanOrEqual(48);
  });
  it('CSS contract: the subtitle never swallows taps, phone landscape has its own sheet / modal / sector / atlas layouts', () => {
    const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
    expect(css).toMatch(/body > \.kit-subtitle[^{]*\{ pointer-events: none; \}/);
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 599px\)/);
    for (const sel of ['.mm-sheet', '.mm-sp-go', '.mm-atlas .mm-pager', '.mm-gate .mm-panel', '.mm-night .mm-panel', '.mm-card-detail']) expect(css, sel).toContain(sel);
    expect(css).not.toMatch(/≥/);
  });
});
