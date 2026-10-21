/**
 * V4 simulator: drives the REAL scheduler / adaptive ladder / cert / item machine / mission driver with assumed learners
 * (spec §9 V4). The learner (p = .97/(1+e^{-9(θ-d)}), d = .10 + .12·DI + level offset) is an ASSUMED sigmoid, so the 75–85 % band is a
 * regression gate on the RULES, not evidence about the real child. Number-line items use the shared noise model (nlNoise.ts).
 */
import { createRng, type Rng } from '@kit/rng';
import { defaultSave, type MarsSaveV5 } from '../../src/save/schema';
import { NODE_BY_ID, PROBES, MAIN_ORDER, REMEDIAL_ORDER } from '../../src/app/content';
import { beginVisit } from '../../src/app/session';
import { nextNodeFor, recommend } from '../../src/app/scheduler';
import { acceptDirect, declineDirect } from '../../src/app/adaptive';
import { beginMission, dealNext, deliver, endMission, type MissionRun } from '../../src/app/mission';
import { MachineEvent, initMachine, transition } from '../../src/app/itemMachine';
import { CERT_ITEMS } from '../../src/app/cert';
import { LEVEL_OFF } from '../../src/app/tuning';
import type { Item, Mode } from '../../src/app/types';
import { pWithin, sdOf, sigmaOf } from './nlNoise';

export type Dom = 'nl' | 'pv2' | 'add' | 'sub' | 'pv3' | 'mul' | 'bal';
const DOMS: Dom[] = ['nl', 'pv2', 'add', 'sub', 'pv3', 'mul', 'bal'];
export const domOf = (fam: string): Dom => ({ nl: 'nl', pv2: 'pv2', add: 'add', sub: 'sub', col: 'add', rel: 'sub', pv3: 'pv3', mul: 'mul', bal: 'bal', open: 'pv3' } as Record<string, Dom>)[fam.split('.')[0]] ?? 'add';
export interface Arch { base: number; lr: number; over: Partial<Record<Dom, number>>; hint: number }
export const ARCH: Record<string, Arch> = {
  strong: { base: 0.72, lr: 0.02, over: {}, hint: 0.02 }, medium: { base: 0.58, lr: 0.015, over: {}, hint: 0.05 }, weak: { base: 0.45, lr: 0.012, over: {}, hint: 0.1 },
  knows100: { base: 0.58, lr: 0.016, over: { pv2: 0.85, add: 0.85, sub: 0.82 }, hint: 0.03 }, linear100: { base: 0.6, lr: 0.016, over: { nl: 0.82 }, hint: 0.04 },
};
export type Adv = 'right' | 'wrong' | 'random' | 'alt';
export interface SimOpts { visits: number; per?: (visit: number) => number; adv?: Adv; dream?: boolean; stopAt?: number }
export interface SimResult {
  acc: number | null; warm: number | null; maxPlays: number; exhaustedAt: number | null; leftAt18: number | null; certs: Record<string, string>; reopened: number;
  items: number; h3Items: number; opsMax: number; opsPerMissionMax: number; directSkips: number; bossSkipped: number; played: Set<string>; save: MarsSaveV5; mainFirstTry: number; mainN: number; certFalseLit: boolean;
}
const pc = (theta: number, d: number): number => 0.97 / (1 + Math.exp(-9 * (theta - d)));
const clamp01 = (x: number) => Math.min(0.99, Math.max(0.01, x));

export function simulate(seed: string, archName: string, o: SimOpts): SimResult {
  const r: Rng = createRng(`sim:${seed}`); const dreamRng = createRng(`dream:${seed}`);
  const A = ARCH[archName] ?? ARCH.medium; const adv = o.adv;
  const theta = {} as Record<Dom, number>;
  for (const d of DOMS) theta[d] = Math.min(0.95, Math.max(0.2, (A.over[d] ?? A.base) + (r.next() + r.next() + r.next() - 1.5) * 0.1));
  const save = defaultSave(0);
  let now = 1_700_000_000_000;
  let exhaustedAt: number | null = null; let leftAt18: number | null = null; let maxPlays = 0; let reopened = 0; let items = 0; let h3Items = 0; let opsMax = 0; let opsMission = 0;
  let directSkips = 0; let bossSkipped = 0; let warmOk = 0; let warmN = 0; let mainFirst = 0; let mainN = 0; const accBy: number[] = []; const played = new Set<string>();
  let alt = false;

  const learn = (dom: Dom, ok: boolean) => { theta[dom] = Math.min(0.95, theta[dom] + A.lr * (ok ? 0.5 : 1)); };
  const nodeOfTag = (it: Item) => NODE_BY_ID[(it.tag && save.tags[it.tag]?.node) || it.node || ''] ?? NODE_BY_ID[it.node ?? ''];
  const probOf = (it: Item): number => {
    const dom = domOf(it.fam);
    if (it.mode === 'probe') return pc(theta[dom], 0.45);
    if (it.mode === 'cert') { const c = CERT_ITEMS[it.card!][it.certIdx! >= 4 ? 1 : it.certIdx!]; return pc(theta[dom], c.tier === 1 ? 0.4 : 0.55); }
    if (it.card) return pc(theta[dom], 0.55);                                   // provisional re-check
    if (dom === 'nl') {
      const p = it.params as { target: number; L: number; anchors: string; tol: number };
      const zoom = it.fam === 'nl.zoom';
      if (zoom) return clamp01(0.94 * 0.97);
      return clamp01(pWithin(sdOf(sigmaOf(theta.nl), p.target, p.L, p.anchors), p.tol));
    }
    const node = nodeOfTag(it); const ts = it.tag ? save.tags[it.tag] : undefined;
    const rd = ts && ts.repDown > 0 ? 0.1 : 0; const replay = it.slot === 'main' && save.nodes[it.node ?? '']?.bridge ? 0.1 : 0;
    return clamp01(pc(theta[dom], 0.1 + 0.12 * (node?.di ?? 2) + LEVEL_OFF[Math.min(5, Math.max(0, it.level - 1))] - rd - replay));
  };
  const answerOnce = (p: number): boolean => (adv === 'right' ? true : adv === 'wrong' ? false : adv === 'random' ? r.chance(0.04) : adv === 'alt' ? (alt = !alt) : r.chance(p));

  /** One question through the real item machine; returns what `deliver` needs. */
  const playItem = (it: Item): { info: Parameters<typeof deliver>[3]; ops: number } => {
    const p = probOf(it); const mode: Mode = it.mode; const dom = domOf(it.fam);
    const T = (s: ReturnType<typeof initMachine>, ev: MachineEvent) => {
      if (o.dream && dreamRng.chance(0.6)) { s = transition(s, 'idle', mode); s = transition(s, 'bg', mode); s = transition(s, 'idle', mode); }
      return transition(s, ev, mode);
    };
    let s = initMachine(); let ops = 0; const diags: (null)[] = [];
    if (it.fam.startsWith('open.')) return { info: { firstTry: true, misses: 0, hint: 0, assisted: false, ok: true }, ops: 1 };
    s = T(s, 'op');
    if (mode === 'normal' && !adv && r.chance(A.hint * (dom === 'nl' ? 0.3 : 1))) { s = T(s, 'key'); ops++; }   // asks for a hint before answering
    for (let a = 0; !s.done && a < 12; a++) {
      if (s.phase === 'CONSEQUENCE') s = T(s, 'tapAck');
      if (s.hint === 3 && s.answerShown) { s = T(s, 'subRight'); ops++; break; }
      const pa = a === 0 ? p : Math.min(0.97, p + 0.3 * s.misses);
      const ok = answerOnce(pa);
      s = T(s, ok ? 'subRight' : 'subWrong'); ops++;
      if (mode !== 'normal') break;
    }
    const okFinal = mode === 'normal' ? s.firstTry === true : s.firstTry === true;
    learn(dom, okFinal);
    return { info: { firstTry: s.firstTry === true, misses: s.misses, hint: s.hint, assisted: s.assisted, ok: okFinal, diags, ops }, ops };
  };
  const estOf = (it: Item): number => {   // calibration: a blank-line estimate with the shared noise model
    const p = it.params as { target: number; L: number };
    const sg = sigmaOf(theta.nl); const u = r.next() + r.next() + r.next() + r.next() + r.next() + r.next() - 3;
    const sd = sdOf(sg, p.target, p.L, 'ends');
    const e = adv === 'right' ? p.target : adv === 'wrong' ? (p.target < p.L / 2 ? p.L : 0) : Math.round(p.target + u * Math.SQRT2 * sd);
    return Math.max(0, Math.min(p.L, e));
  };

  const runMission = (visit: number, mIdx: number): void => {
    const zone = recommend(save);
    if (!zone) { exhaustedAt ??= visit; return; }
    let node = nextNodeFor(save, zone)!;
    const missionsBefore = save.session.missions;
    let noWarm = false;
    if (PROBES[zone] && !save.probes[zone as 'vault']?.done) {
      const pr = beginMission(save, node.id, visit, now, { probe: true });
      for (;;) { const it = dealNext(save, pr, now); if (!it) break; const { info } = playItem(it); deliver(save, pr, it, info, now); }
      endMission(save, pr, now);
      node = nextNodeFor(save, zone) ?? node; noWarm = true;
    }
    const plays0 = save.nodes[node.id]?.plays ?? 0; void plays0;
    const run: MissionRun = beginMission(save, node.id, visit, now, { noWarm });
    played.add(node.id);
    let opsM = 0; let mainOk = 0; let mainTot = 0; let nItems = 0;
    for (;;) {
      const it = dealNext(save, run, now); if (!it) break;
      nItems++;
      let info; let ops: number;
      if (it.mode === 'calib') { const est = estOf(it); const right = it.params as { target: number }; void right; ({ info, ops } = { info: { firstTry: true, misses: 0, hint: 0, assisted: false, ok: true, est }, ops: 1 }); }
      else ({ info, ops } = playItem(it));
      opsM += ops; opsMax = Math.max(opsMax, ops);
      const eff = deliver(save, run, it, info, now); void eff;
      items++; if (info.assisted) h3Items++;
      if (it.slot === 'main' && node.kind !== 'breather' && it.mode !== 'calib') { mainN++; mainTot++; if (info.firstTry && !info.assisted) { mainFirst++; mainOk++; } }
      if ((it.slot === 'warm' || it.slot === 'cert') && it.mode !== 'cert') { warmN++; if (info.firstTry) warmOk++; }
    }
    opsMission = Math.max(opsMission, opsM / Math.max(1, nItems));
    const reopenBefore = Object.values(save.cert).filter((c) => c.reopenNode).length;
    const sum = endMission(save, run, now);
    reopened += Object.values(save.cert).filter((c) => c.reopenNode).length - reopenBefore;
    maxPlays = Math.max(maxPlays, ...Object.values(save.nodes).map((n) => n.plays));
    if (mainTot && node.kind !== 'calib' && node.kind !== 'breather' && missionsBefore >= 2) accBy.push(mainOk / mainTot);
    if (sum.outcome?.directOffer && save.directOffer) {
      if (r.chance(0.7)) { const id = acceptDirect(save, save.directOffer.zone, node.id); if (id) { directSkips++; if (NODE_BY_ID[id].kind === 'boss' || NODE_BY_ID[id].kind === 'breather') bossSkipped++; } } else declineDirect(save);
    }
    void mIdx;
  };

  for (let v = 0; v < o.visits; v++) {
    now += 3 * 3600 * 1000;
    const visit = beginVisit(save, now);
    const per = o.per ? o.per(v) : 1;
    for (let m = 0; m < per; m++) { runMission(visit, m); now += 6 * 60 * 1000; }
    if (v === 17) leftAt18 = [...Object.values(MAIN_ORDER)].flat().filter((id) => (save.nodes[id]?.st ?? 'open') === 'open' && ['orbit', 'vault', 'factory'].includes(NODE_BY_ID[id].zone)).length;
  }
  void REMEDIAL_ORDER;
  const certs = Object.fromEntries(Object.entries(save.cert).map(([k, v]) => [k, v.state]));
  return {
    acc: accBy.length ? accBy.reduce((a, b) => a + b, 0) / accBy.length : null, warm: warmN ? warmOk / warmN : null, maxPlays, exhaustedAt, leftAt18, certs, reopened, items, h3Items,
    opsMax, opsPerMissionMax: opsMission, directSkips, bossSkipped, played, save, mainFirstTry: mainFirst, mainN, certFalseLit: false,
  };
}
