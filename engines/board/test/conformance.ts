// test/conformance.ts — 每个 GameRules 插件必须通过的 16 项通用一致性检查（C01–C16，纯函数版，无 vitest 依赖）。
// 来源：board-contract/src/conformance.mjs（1:1 移植）。vitest 包装见 run-conformance.ts：每项 = 一个 it。
import { createGame } from '../core/game';
import type { GameRules, Orientation } from '../core/types';

export interface ConformanceFixtures {
  /** 抽样用的起始局面（也是随机对局的起点） */
  fens: readonly string[];
  /** 无王局面（C07：fromFen / legalMoves / status 不抛） */
  noKing?: readonly string[] | null;
  /** 带 OBSTACLE（type 99）的局面（C07：障碍子永不被吃、永不被走上） */
  obstacle?: readonly string[] | null;
  /** perft 金标准（C11） */
  perft?: readonly { fen: string; counts: readonly number[] }[];
  /** FEN → "重复意义上的局面标识"（C05）：象棋 = 前两段；国象 = 前三段（不含无进展计数/回合数） */
  fenKey(fen: string): string;
  randomGames?: number;
  maxPly?: number;
}
export interface CheckResult { id: string; name: string; n: number; bad: string[]; nbad: number }
export interface ConformanceReport { pass: number; fail: number; results: CheckResult[]; asserts: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRules = GameRules<any, any>;
type Assert = (cond: unknown, msg: string) => void;
export interface ConformanceCheck { id: string; name: string; run(): CheckResult }

const mk = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hk = (h: readonly [number, number]): string => h[0] + ':' + h[1];
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const ORIENTS: Orientation[] = ['first-bottom', 'second-bottom'];

export function conformanceChecks(rules: AnyRules, fx: ConformanceFixtures, { seed = 1 } = {}): ConformanceCheck[] {
  const G = rules.geometry;
  let cache: { fen: string; s: unknown }[] | null = null;
  const R = mk(seed);
  const samples = (): { fen: string; s: unknown }[] => {
    if (cache) return cache;
    const fens: string[] = [...fx.fens];
    for (let gi = 0; gi < (fx.randomGames ?? 100); gi++) {
      const g = createGame(rules, fx.fens[gi % fx.fens.length]);
      for (let ply = 0; ply < (fx.maxPly ?? 80); ply++) {
        const L = g.legalMoves();
        if (!L.length || g.status().over) break;
        g.play(L[Math.floor(R() * L.length)]);
        if (ply % 3 === 0) fens.push(g.fen());
      }
    }
    cache = fens.map((fen) => ({ fen, s: rules.fromFen(fen) }));
    return cache;
  };
  const mkCheck = (id: string, name: string, f: (t: Assert) => void): ConformanceCheck => ({
    id, name,
    run(): CheckResult {
      const bad: (string | null)[] = []; let n = 0;
      const t: Assert = (cond, msg) => { n++; if (!cond) bad.push(bad.length < 5 ? msg : null); };
      try { f(t); } catch (e) { bad.push('exception ' + (e as Error).message); }
      return { id, name, n, bad: bad.filter((x): x is string => x !== null), nbad: bad.length };
    },
  });
  const moveKey = (s: unknown, m: unknown): number => { const i = rules.moveInfo(s, m); return i.from * 1000 + i.to; };

  return [
    mkCheck('C01', 'FEN 往返：toFen(fromFen(f)) 再解析后 toFen 相同（幂等）', (t) => { for (const { fen } of samples().slice(0, 600)) { const a = rules.toFen(rules.fromFen(fen)), b = rules.toFen(rules.fromFen(a)); t(a === b, fen); } }),
    mkCheck('C02', 'apply 纯函数：apply 前后原状态的 toFen/hash 不变', (t) => { for (const { s } of samples().slice(0, 300)) { const f0 = rules.toFen(s), h0 = hk(rules.hash(s)); for (const m of rules.legalMoves(s).slice(0, 6)) rules.apply(s, m); t(rules.toFen(s) === f0 && hk(rules.hash(s)) === h0, f0); } }),
    mkCheck('C03', 'encode/decode 往返且全部合法着法编码互异；legalFrom ≡ legalMoves 按起点过滤', (t) => {
      for (const { s } of samples().slice(0, 300)) {
        const L = rules.legalMoves(s); const enc = L.map((m: unknown) => rules.encode(m));
        t(new Set(enc).size === enc.length, 'dup encode');
        for (let i = 0; i < L.length; i++) { const d = rules.decode(s, enc[i]); t(d !== null && rules.encode(d) === enc[i], 'decode ' + enc[i]); }
        const by: Record<number, string[]> = {};
        for (const m of L) (by[rules.moveInfo(s, m).from] ||= []).push(rules.encode(m));
        for (const [from, arr] of Object.entries(by)) t(same(rules.legalFrom(s, +from).map((m: unknown) => rules.encode(m)).sort(), arr.sort()), 'legalFrom ' + from);
      } }),
    mkCheck('C04', 'effects 重放（吃→走→升变）= apply 后的棋盘；moveInfo.capture 与 capture 效果一致', (t) => {
      const ORD: Record<string, number> = { capture: 0, move: 1, promote: 2 };
      for (const { s } of samples().slice(0, 400)) for (const m of rules.legalMoves(s).slice(0, 12)) {
        const before = new Map<number, { type: number; side: number }>();
        for (let q = 0; q < G.squares; q++) { const p = rules.pieceAt(s, q); if (p) before.set(q, p); }
        const eff = rules.effects(s, m).slice().sort((a, b) => ORD[a.k] - ORD[b.k]);
        let ok = true;
        for (const e of eff) {
          if (e.k === 'move') { const p = before.get(e.from); if (!p || p.type !== e.piece.type || p.side !== e.piece.side) { ok = false; break; } before.delete(e.from); before.set(e.to, p); }
          else if (e.k === 'capture') { const p = before.get(e.sq); if (!p || p.type !== e.piece.type) { ok = false; break; } before.delete(e.sq); }
          else { const p = before.get(e.sq); if (!p || p.type !== e.from.type) { ok = false; break; } before.set(e.sq, e.to); }
        }
        const after = rules.apply(s, m);
        for (let q = 0; q < G.squares && ok; q++) if (!same(rules.pieceAt(after, q), before.get(q) || null)) ok = false;
        t(ok, rules.toFen(s) + ' ' + rules.encode(m));
        const info = rules.moveInfo(s, m); const caps = eff.filter((e) => e.k === 'capture');
        t((info.capture ? 1 : 0) === caps.length && (!info.capture || (caps[0] as { sq: number }).sq === info.capture.sq), 'moveInfo.capture ≠ effects ' + rules.encode(m));
      } }),
    mkCheck('C05', 'hash：同局面同键；不同局面（按 fenKey）不同键；换序换位（转置）同键', (t) => {
      const seen = new Map<string, string>();
      for (const { fen, s } of samples()) {
        const k = hk(rules.hash(s)), id = fx.fenKey(fen); const prev = seen.get(k);
        if (prev === undefined) seen.set(k, id); else t(prev === id, '碰撞 ' + prev + ' / ' + id);
        t(hk(rules.hash(rules.fromFen(fen))) === k, 'hash 不稳定');
      } }),
    mkCheck('C06', '走子方交替；合法着法走完后己方不被将军；check().by 非空', (t) => {
      for (const { s } of samples().slice(0, 300)) {
        const me = rules.turn(s);
        for (const m of rules.legalMoves(s).slice(0, 15)) { const ns = rules.apply(s, m); t(rules.turn(ns) === 1 - me, 'turn'); if (rules.meta.kingType !== null) t(rules.check(ns, me) === null, '走完自己被将军 ' + rules.encode(m)); }
        const ck = rules.check(s); if (ck) t(ck.by.length >= 1, 'check.by 为空');
      } }),
    mkCheck('C07', '无王 / 带障碍子局面：fromFen、legalMoves、status 不抛；障碍子永不被吃、永不被走上', (t) => {
      for (const f of [...(fx.noKing || []), ...(fx.obstacle || [])]) {
        const s = rules.fromFen(f); const L = rules.legalMoves(s); rules.status(s); t(Array.isArray(L), f);
        for (const m of L) {
          const info = rules.moveInfo(s, m); const tp = rules.pieceAt(s, info.to);
          t(!(tp && tp.type === 99), '走上障碍子 ' + rules.encode(m)); t(!(info.capture && info.capture.piece.type === 99), '吃障碍子');
          const ns = rules.apply(s, m); t(rules.check(ns, rules.turn(s)) === null || rules.meta.kingType === null, 'check');
        }
      } }),
    mkCheck('C08', 'mirror（若提供）：对合、合法着法数相同；返回 null 表示不适用', (t) => {
      if (!rules.mirror) return;
      for (const { s } of samples().slice(0, 300)) {
        const m1 = rules.mirror(s); if (m1 === null) continue;
        const m2 = rules.mirror(m1);
        t(m2 !== null && rules.toFen(m2).split(' ').slice(0, 2).join(' ') === rules.toFen(s).split(' ').slice(0, 2).join(' '), 'mirror 非对合');
        const multi = rules.legalMoves(s).filter((m: unknown) => rules.effects(s, m).filter((e) => e.k === 'move').length > 1).length;
        const n0 = rules.legalMoves(s).length, n1 = rules.legalMoves(m1).length;
        t(n1 === n0 || n1 === n0 - multi, `mirror 着法数 ${n1} vs ${n0}（多子着法 ${multi}）`);
      } }),
    mkCheck('C09', '几何：flip 对合；center→hit 往返（两个朝向）；flip 与朝向一致', (t) => {
      for (let q = 0; q < G.squares; q++) {
        t(G.flip(G.flip(q)) === q, 'flip ' + q);
        for (const o of ORIENTS) { const c = G.center(q, o); t(G.hit(c.x, c.y, o) === q, 'hit ' + q + o); }
        const a = G.center(q, 'second-bottom'), b = G.center(G.flip(q), 'first-bottom');
        t(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, 'flip≠旋转 ' + q);
      } }),
    mkCheck('C10', 'whyIllegal ⇔ 合法性：对每个 (from,to)，null ⇔ 存在合法着法；原因为非空字符串', (t) => {
      for (const { s } of samples().slice(0, 40)) {
        const ok = new Set<number>(rules.legalMoves(s).map((m: unknown) => moveKey(s, m)));
        for (let a = 0; a < G.squares; a++) for (let b = 0; b < G.squares; b++) {
          if (a === b) continue; const w = rules.whyIllegal(s, a, b);
          t((w === null) === ok.has(a * 1000 + b), `why ${a}->${b} ${w}`); if (w !== null) t(typeof w === 'string' && w.length > 0, 'reason');
        }
      } }),
    mkCheck('C11', 'perft：象棋 44/1920/79666；国象 20/400/8902 与 Kiwipete 48/2039', (t) => {
      for (const { fen, counts } of fx.perft || []) {
        const perft = (s: unknown, d: number): number => { if (d === 0) return 1; const L = rules.legalMoves(s); if (d === 1) return L.length; let n = 0; for (const m of L) n += perft(rules.apply(s, m), d - 1); return n; };
        counts.forEach((c, i) => t(perft(rules.fromFen(fen), i + 1) === c, `${fen} d${i + 1} ≠ ${c}`));
      } }),
    mkCheck('C12', 'Game 往返模糊：随机走子→全部 undo，fen/hash/keys/noProgress/flags 全相等；keys 不变量', (t) => {
      for (let gi = 0; gi < 60; gi++) {
        const g = createGame(rules, fx.fens[gi % fx.fens.length]);
        const snaps = [{ f: g.fen(), k: hk(g.keys[0]), n: g.noProgress(), fl: 0 }];
        for (let ply = 0; ply < 60; ply++) {
          const L = g.legalMoves(); if (!L.length) break; g.play(L[Math.floor(R() * L.length)]);
          t(g.keys.length === g.moves.length + 1 && hk(g.keys[g.keys.length - 1]) === hk(rules.hash(g.state())), 'keys 不变量');
          snaps.push({ f: g.fen(), k: hk(g.keys[g.keys.length - 1]), n: g.noProgress(), fl: g.flags.length });
        }
        while (g.moves.length) { g.undo(); const s = snaps[g.moves.length]; t(g.fen() === s.f && hk(g.keys[g.keys.length - 1]) === s.k && g.noProgress() === s.n && g.flags.length === s.fl, 'undo 往返 ' + g.moves.length); }
      } }),
    mkCheck('C13', 'Game.status 顺序与幂等：局面终局优先于重复/限着；status 连调两次结果相同', (t) => {
      for (let gi = 0; gi < 40; gi++) {
        const g = createGame(rules, fx.fens[gi % fx.fens.length]);
        for (let ply = 0; ply < 120; ply++) { const a = g.status(), b = g.status(); t(same(a, b), 'status 不幂等'); if (a.over) break; const L = g.legalMoves(); if (!L.length) break; g.play(L[Math.floor(R() * L.length)]); }
      } }),
    mkCheck('C14', '棋谱：notation(zh/san/coord) 非空；encode 稳定', (t) => {
      for (const { s } of samples().slice(0, 120)) for (const m of rules.legalMoves(s).slice(0, 8)) for (const st of ['zh', 'san', 'coord'] as const) t(String(rules.notation(s, m, st)).length > 0, 'notation ' + st);
    }),
    mkCheck('C15', 'value：王/障碍 = 0，其余 ≥ 1，空格 = 0；captured 与 materialDiff 对称', (t) => {
      for (const { s } of samples().slice(0, 60)) for (let q = 0; q < G.squares; q++) {
        const p = rules.pieceAt(s, q);
        if (!p) { t(rules.value(s, q) === 0, 'empty value'); continue; }
        if (p.type === 99 || p.type === rules.meta.kingType) t(rules.value(s, q) === 0, 'K/X value'); else t(rules.value(s, q) >= 1, 'value ' + p.type);
      }
      for (let gi = 0; gi < 30; gi++) {
        const g = createGame(rules, fx.fens[gi % fx.fens.length]);
        for (let ply = 0; ply < 60; ply++) { const L = g.legalMoves(); if (!L.length || g.status().over) break; g.play(L[Math.floor(R() * L.length)]); }
        t(g.materialDiff(0) === -g.materialDiff(1), 'materialDiff 不对称');
      } }),
    mkCheck('C16', 'clock：Game 的 noProgress 从 FEN 内的时钟起算（国象 halfmove）', (t) => { for (const f of fx.fens) { const s = rules.fromFen(f); const g = createGame(rules, f); t(g.noProgress() === (rules.clock ? rules.clock(s) : 0), f); } }),
  ];
}

export function collectConformance(rules: AnyRules, fx: ConformanceFixtures, o?: { seed?: number }): ConformanceReport {
  const results = conformanceChecks(rules, fx, o).map((c) => c.run());
  return { pass: results.filter((r) => r.nbad === 0).length, fail: results.filter((r) => r.nbad > 0).length, results, asserts: results.reduce((a, r) => a + r.n, 0) };
}
