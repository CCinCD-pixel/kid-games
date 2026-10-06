// 败因分析器 — port of proto/failcause.mjs (rev d): one concrete, TRUE, process-focused cause for a lost (or 檑木-saved)
// run, plus one tip that names only cards the child can use. Ids only; the theme maps them to fort.fail.* / fort.tip.*.
// checkFacts() re-checks each verdict against the facts recorded at the breach (V12b).
import { TPS } from './rules';
import { FEARS, counterFor } from './tags';
import type { Level, SimEvent, SimState } from './types';

const ATT = new Set(['shooter', 'lobber', 'burner', 'beam', 'radial']);
export interface Cause { id: string; tip?: string | null; card?: string | null; vars?: Record<string, number>; lane?: number; kind?: string | null; lesson?: boolean }

/** cause ids that count as "the lesson" of a level (lesson-alignment gate, §9.6) */
export const LESSON_CAUSES: Record<string, string[]> = {
  '1-3': ['noWall'], '1-4': ['counterMissing:shielder', 'counterUnused:shielder'], '1-5': ['ramRunUp', 'counterUnused:ram', 'counterMissing:ram'],
  '1-6': ['warnIgnored'], '1-7': ['swarmNoFire', 'counterUnused:ant', 'counterMissing:ant'], '1-8': ['strikeEarly', 'strikeUnused'],
  '1-9': ['counterMissing:brute', 'counterUnused:brute'], '2-2': ['noAntiAir'], '2-3': ['noAntiAir'], '2-4': ['smokeBlind'],
  '2-6': ['ladderPins'], '2-8': ['drummerAlive'],
};
export const availableCards = (L: Level): Set<string> => new Set(L.belt ? L.belt.seq : L.choose || L.pool ? (L.pool || []) : (L.loadout || []));

export function failCause(S: SimState, opt: { recent?: string[] } = {}): Cause {
  const all = causes(S);
  const recent = opt.recent || [];
  for (const c of all) {
    const k = c.id + (c.kind ? ':' + c.kind : '');
    if (recent.length >= 2 && recent.slice(-2).every((r) => r === k) && all.length > 1 && c !== all[all.length - 1]) continue; // 不连说三次同一句
    return c;
  }
  return all[0];
}

/** which breach the 复盘 talks about: the one that lost; in a won run, the 檑木 the level's new machine forced, else the first */
export function pickBreach(S: SimState): SimEvent | undefined {
  const evs = S.ev || []; const nk = S.L.newEnemy === 'swarm' ? 'ant' : S.L.newEnemy;
  return evs.find((e) => e.type === 'lose') || (nk ? evs.find((e) => e.type === 'log' && e.by === nk) : undefined) || evs.find((e) => e.type === 'log');
}

/** every true cause, best first */
export function causes(S: SimState): Cause[] {
  const evs = S.ev || []; const L = S.L; const out: Cause[] = [];
  const bev = pickBreach(S);
  if (!bev) return [{ id: 'generic', vars: {} }];
  const lost = bev.lane!; const by = bev.by!; const bt = bev.tick;
  const deck = new Set(S.L.belt ? L.belt!.seq : (S.loadout || L.loadout || []));
  const avail = availableCards(L);
  const fixedDeck = !L.belt && !(L.choose || L.pool);
  const placed = evs.filter((e) => e.type === 'place');
  const gone = new Map(evs.filter((e) => e.type === 'unitGone').map((e) => [e.id, e]));
  const aliveAt = (p: SimEvent, t: number): boolean => p.tick <= t && !(gone.get(p.id) && gone.get(p.id)!.tick <= t);
  const attIn = (lane: number, t: number): number => placed.filter((p) => p.lane === lane && ATT.has(p.card!) && aliveAt(p, t)).length;
  const inLane = (card: string, lane = lost, t = bt): boolean => placed.some((p) => p.card === card && (card === 'radial' ? Math.abs(p.lane! - lane) <= 1 : p.lane === lane) && aliveAt(p, t));
  const lesson = (L.newEnemy && by === L.newEnemy) || (L.newEnemy === 'swarm' && by === 'ant') || (L.newEnemy === 'ant' && by === 'ant');
  const tipCard = (cards: string[]): string | undefined => cards.find((c) => deck.has(c));
  const push = (c: Cause): void => { out.push({ lane: lost, kind: by, ...c, lesson: !!c.lesson }); };

  const counterCauses = (): Cause[] => {
    const r: Cause[] = [];
    if (by === 'owl') r.push({ id: 'owlWalked', tip: 'owlWalked' });
    if (by === 'ram' && !inLane('spikes')) {
      if (deck.has('spikes')) r.push({ id: 'ramRunUp', tip: 'ramRunUp', card: 'spikes' });
      else if (avail.has('spikes') && !fixedDeck) r.push({ id: 'counterMissing', tip: 'counterMissing.spikes', card: 'spikes' });
      else { const alt = ['lobber', 'burner', 'wall'].filter((c) => deck.has(c)); if (alt.length) r.push({ id: 'ramNoSpikes', tip: 'alt.ram', card: alt[0] }); }
    }
    if ((by === 'flyer' || by === 'flyer_m') && !inLane('radial') && !inLane('gust')) {
      const c = tipCard(['radial', 'gust']);
      if (c) r.push({ id: 'noAntiAir', tip: c === 'radial' ? 'noAntiAir' : 'noAntiAir.2', card: c });
      else if (!fixedDeck && avail.has('radial')) r.push({ id: 'counterMissing', tip: 'counterMissing.radial', card: 'radial' });
    }
    if (by === 'ladder' && ((bev.pins || 0) >= 2 || evs.some((e) => e.type === 'ladderUp')) && !inLane('hook')) {
      if (deck.has('hook')) r.push({ id: 'ladderPins', tip: 'ladderPins', card: 'hook' });
      else if (deck.has('burner')) r.push({ id: 'ladderPins', tip: 'alt.ladder', card: 'burner' });
    }
    if (by === 'ant' && !inLane('burner')) {
      if (deck.has('burner')) r.push({ id: 'swarmNoFire', tip: 'swarmNoFire', card: 'burner' });
      else if (!fixedDeck && avail.has('burner')) r.push({ id: 'counterMissing', tip: 'counterMissing.burner', card: 'burner' });
      else if (deck.has('gust')) r.push({ id: 'swarmNoFire', tip: 'alt.ant', card: 'gust' });
    }
    if (bev.smoky && !inLane('gust') && !inLane('lobber') && placed.some((p) => p.lane === lost && (p.card === 'shooter' || p.card === 'beam'))) {
      const c = tipCard(['gust', 'lobber']); if (c) r.push({ id: 'smokeBlind', tip: c === 'gust' ? 'smokeBlind' : 'smokeBlind.2', card: c });
    }
    if (bev.drum && by !== 'drummer') { const c = tipCard(['strike', 'lobber']); r.push({ id: 'drummerAlive', tip: c ? 'drummerAlive.' + c : 'drummerAlive', card: c }); }
    const fe = FEARS[by];
    if (fe && by !== 'walker' && !['ram', 'flyer', 'flyer_m', 'ladder', 'ant'].includes(by)) {
      const usable = fe.filter((c) => deck.has(c) && !(c === 'beam' && S.L.env?.night && !(S.dawnAt != null && bt >= S.dawnAt)));
      if (!usable.length) {
        const pick = fe.find((c) => avail.has(c));
        if (pick && !fixedDeck) r.push({ id: 'counterMissing', tip: 'counterMissing.' + pick, card: pick });
        else { const alt = counterFor(by, S).filter((c) => deck.has(c) && !fe.includes(c)); if (alt.length) r.push({ id: 'counterMissing', tip: 'alt.' + by, card: alt[0] }); }
      } else if (!usable.some((c) => inLane(c))) r.push({ id: 'counterUnused', tip: 'counterUnused.' + usable[0], card: usable[0] });
    }
    return r.map((c) => ({ ...c, lesson: true }));
  };
  const setupCauses = (): Cause[] => {
    const r: Cause[] = [];
    const bitten = evs.filter((e) => e.type === 'unitGone' && e.lane === lost && e.why === 'bitten' && ATT.has(e.k!) && e.tick <= bt);
    const covered = (g: SimEvent): boolean => placed.some((p) => p.card === 'wall' && p.lane === lost && p.col! > g.col! && p.tick <= g.tick - 5 * TPS && aliveAt(p, g.tick - 1));
    if (bitten.length && deck.has('wall') && !bitten.some(covered))
      r.push({ id: 'noWall', tip: placed.some((p) => p.card === 'wall' && p.lane === lost && p.tick <= bt) ? 'wallLate' : 'noWall', card: 'wall', vars: { n: bitten.length } });
    else if (bitten.length && !deck.has('wall') && !attIn(lost, bt)) r.push({ id: 'lostAttackers', tip: 'lostAttackers', vars: { n: bitten.length } });
    for (const w of L.warn || []) {
      if (!w.lanes.includes(lost) || w.t * TPS > bt) continue;
      const pits = placed.filter((p) => p.card === 'pit' && p.lane === lost && p.tick <= w.t * TPS).length;
      if (!pits && attIn(lost, w.t * TPS) < 2) { r.push({ id: 'warnIgnored', tip: deck.has('pit') ? 'warnIgnored' : 'warnIgnored.2', card: deck.has('pit') ? 'pit' : null }); break; }
    }
    const hits = S.stats.strikeHits || []; const flags = S.flags || L.flags || [];
    if (deck.has('strike')) {
      const firstStrike = evs.find((e) => e.type === 'strike');
      if (hits.length && hits[0] <= 1 && firstStrike && flags.some((f) => f > firstStrike.tick && f <= bt)) r.push({ id: 'strikeEarly', tip: 'strikeEarly', card: 'strike' });
      else if (!hits.length && flags.some((f) => f <= bt)) r.push({ id: 'strikeUnused', tip: 'strikeUnused', card: 'strike' });
    }
    return r.map((c) => ({ ...c, lesson: true }));
  };
  const empty = (): Cause[] => {
    const entry = bev.seen != null && bev.seen >= 0 ? bev.seen : bt;
    if (attIn(lost, entry) === 0 && !placed.some((p) => p.lane === lost && ATT.has(p.card!) && p.tick > entry && p.tick <= entry + 10 * TPS))
      return [{ id: 'emptyLane', tip: 'emptyLane', vars: { lane: lost } }];
    return [];
  };
  const cc = counterCauses(); const sc = setupCauses();
  const lessonFirst = lesson || (sc.length > 0 && (LESSON_CAUSES[L.id] || []).some((id) => sc.some((c) => c.id === id)));
  if (lessonFirst) { cc.forEach(push); sc.forEach(push); empty().forEach(push); }
  else { empty().forEach(push); cc.forEach(push); sc.forEach(push); }
  if (L.env?.night && S.stats.econAt60 >= 0 && placed.filter((p) => p.card === 'bank' && p.tick < 60 * TPS).length === 0 && placed.some((p) => p.card === 'farm' && p.tick < 60 * TPS) && deck.has('bank')) push({ id: 'nightFarms', tip: 'nightFarms', card: 'bank' });
  if (!L.belt && !L.env?.night && S.stats.econAt60 >= 0 && S.stats.econAt60 < 3 && deck.has('farm')) push({ id: 'lateEconomy', tip: 'lateEconomy', card: 'farm', vars: { n: S.stats.econAt60 } });
  if (!L.belt && S.stats.maxFloat >= 300) push({ id: 'hoard', tip: 'hoard', vars: { n: Math.floor(S.stats.maxFloat / 10) * 10 } });
  if (bev.units?.some((k) => ATT.has(k)) || attIn(lost, bt) > 0) push({ id: 'outgunned', tip: 'outgunned', vars: { lane: lost } });
  push({ id: 'generic', tip: null, vars: {} });
  return out;
}

/** V12b: the verdict's claims re-checked against the facts recorded at the breach */
export function checkFacts(S: SimState, c: Cause): boolean {
  const bev = pickBreach(S); if (!bev) return c.id === 'generic';
  const has = (k: string): boolean => (bev.units || []).includes(k); const near = (k: string): boolean => has(k) || (bev.near || []).includes(k);
  const deck = new Set(S.L.belt ? S.L.belt.seq : (S.loadout || S.L.loadout || []));
  const tipOk = !c.card || availableCards(S.L).has(c.card) || deck.has(c.card);
  switch (c.id) {
    case 'emptyLane': return bev.guard === 0 && tipOk;
    case 'ramRunUp': case 'ramNoSpikes': return bev.by === 'ram' && !has('spikes') && tipOk;
    case 'noAntiAir': return !near('radial') && !has('gust') && tipOk;
    case 'ladderPins': return bev.by === 'ladder' && !has('hook') && tipOk;
    case 'swarmNoFire': return bev.by === 'ant' && !has('burner') && tipOk;
    case 'smokeBlind': return !!bev.smoky && !has('gust') && !has('lobber') && tipOk;
    case 'drummerAlive': return !!bev.drum && tipOk;
    case 'warnIgnored': return (S.L.warn || []).some((w) => w.lanes.includes(bev.lane!)) && tipOk;
    case 'noWall': return (bev.attLost || 0) > 0 && tipOk;
    case 'lostAttackers': return (bev.attLost || 0) > 0 && !(bev.units || []).some((k) => ATT.has(k)) && tipOk;
    case 'counterMissing': return !(FEARS[bev.by!] || []).some((x) => deck.has(x)) || c.tip?.startsWith('alt.') ? tipOk && (!c.tip?.startsWith('alt.') || deck.has(c.card!)) : false;
    case 'counterUnused': return deck.has(c.card!) && !(c.card === 'radial' ? near('radial') : has(c.card!));
    case 'outgunned': return (bev.units || []).some((k) => ATT.has(k));
    case 'owlWalked': return bev.by === 'owl';
    default: return true;
  }
}
export const GENERIC = new Set(['generic']);
