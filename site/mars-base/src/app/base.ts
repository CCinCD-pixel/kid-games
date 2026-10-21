/**
 * Meta-progress of the base (spec §5.4) and the parent summary (§5.3): pure over the save.
 *   8 buildings × 3 tiers: zone open → 1; main-line scored nodes (done/skipped; remedial skipped do not count) ≥ 50 % → 2, 100 % → 3;
 *   徽章站 +1 tier per lit card; 赛道 by games 3/10/25 → tiers 1/2/3; 档案馆 by cards. Until a VALID calibration exists the tier is capped at 1 (migrated saves).
 *   Base level = (main done/skipped + lit cards) / 58 against 0/5/15/27/40/55/70/85 %. Tiers and the level never go backwards.
 */
import cardsJson from '../../../../content/mars-base/cards.json';
import type { CardId } from './types';
import type { MarsSaveV5 } from '../save/schema';
import { CARDS, MAIN_ORDER, NODE_BY_ID } from './content';
import { CLASS_INFO } from '../diag/bugs';
import { DIAG_CLASSES } from './types';
import { META } from '../families';

export type SiteKey = 'orbit' | 'cert' | 'vault' | 'factory' | 'balance' | 'puzzle' | 'race' | 'archive';
export const SITE_KEYS: SiteKey[] = ['orbit', 'cert', 'vault', 'factory', 'balance', 'puzzle', 'race', 'archive'];
export const BASE_DENOM = 58;
export const LEVEL_CUTS = [0, 0.05, 0.15, 0.27, 0.40, 0.55, 0.70, 0.85];
const passed = (s: MarsSaveV5, id: string): boolean => { const st = s.nodes[id]?.st; return st === 'done' || st === 'skipped'; };
const scored = (zone: keyof typeof MAIN_ORDER): string[] => MAIN_ORDER[zone].filter((id) => NODE_BY_ID[id].kind !== 'calib' && NODE_BY_ID[id].kind !== 'breather');
export const hasValidCalibration = (s: MarsSaveV5): boolean => s.orbit.tests.some((t) => t.valid);
export const litCards = (s: MarsSaveV5): number => CARDS.filter((c) => s.cert[c].state === 'lit').length;
export const mainDone = (s: MarsSaveV5): number => (Object.keys(MAIN_ORDER) as (keyof typeof MAIN_ORDER)[]).flatMap((z) => MAIN_ORDER[z]).filter((id) => passed(s, id)).length;

export function baseLevelOf(s: MarsSaveV5): number {
  const frac = (mainDone(s) + litCards(s)) / BASE_DENOM; let lv = 1;
  for (let i = 0; i < LEVEL_CUTS.length; i++) if (frac >= LEVEL_CUTS[i]) lv = i + 1;
  return lv;
}
export function tierOf(s: MarsSaveV5, site: SiteKey): number {
  const cap = hasValidCalibration(s) ? 3 : 1; let t = 1;
  if (site === 'cert') t = Math.min(3, 1 + litCards(s));
  else if (site === 'race') t = s.race.games >= 25 ? 3 : s.race.games >= 10 ? 2 : 1;
  else if (site === 'archive') t = s.cards.length >= 12 ? 3 : s.cards.length >= 5 ? 2 : 1;
  else { const ids = scored(site as keyof typeof MAIN_ORDER); if (ids.length) { const f = ids.filter((id) => passed(s, id)).length / ids.length; t = f >= 1 ? 3 : f >= 0.5 ? 2 : 1; } }
  return Math.max(1, Math.min(cap, t));
}
/** Cards earned by `earn` rules of content/mars-base/cards.json (v1 scope only). */
export function earnedCards(s: MarsSaveV5): string[] {
  const out: string[] = [];
  for (const c of cardsJson.cards as { id: string; earn: string; scope: string }[]) {
    if (c.scope !== 'v1') continue; const [kind, arg] = c.earn.split(':'); let ok = false;
    if (kind === 'onboarding') ok = s.onboarded; else if (kind === 'mission') ok = s.session.missions >= Number(arg);
    else if (kind === 'chapter') { const ids = Object.values(NODE_BY_ID).filter((n) => n.chapter === arg).map((n) => n.id); ok = ids.length > 0 && ids.every((id) => passed(s, id)); }
    else if (kind === 'cert') ok = s.cert[arg as CardId]?.state === 'lit'; else if (kind === 'node') ok = passed(s, arg);
    else if (kind === 'race') ok = s.race.games >= Number(arg); else if (kind === 'checker') ok = s.checker >= Number(arg);
    if (ok) out.push(c.id);
  }
  return out;
}
export interface BaseEvents { tierUps: { site: SiteKey; from: number; to: number }[]; levelUp: number | null; newCards: string[]; part: boolean }
/** Recompute tiers / level / cards after a mission or a race; never lowers anything. */
export function updateBase(s: MarsSaveV5, partEarned = false): BaseEvents {
  const ev: BaseEvents = { tierUps: [], levelUp: null, newCards: [], part: partEarned };
  for (const site of SITE_KEYS) { const was = s.buildings[site] ?? 1; const now = Math.max(was, tierOf(s, site)); if (now > was) ev.tierUps.push({ site, from: was, to: now }); s.buildings[site] = now; }
  const lv = Math.max(s.baseLevel, baseLevelOf(s)); if (lv > s.baseLevel) { ev.levelUp = lv; s.baseLevel = lv; }
  for (const id of earnedCards(s)) if (!s.cards.includes(id)) { s.cards.push(id); ev.newCards.push(id); }
  return ev;
}

// ---- parent summary (spec §5.3) ---------------------------------------------------------------------------------------------------
export interface MetricsPayload { metrics: { id: string; label: string; value: string; frac?: number; detail?: string; status?: 'ok' | 'watch' | 'note'; hint?: string }[]; data: unknown }
export function metricsOf(s: MarsSaveV5): MetricsPayload {
  const ids = (Object.keys(MAIN_ORDER) as (keyof typeof MAIN_ORDER)[]).flatMap((z) => scored(z)); const done = ids.filter((id) => passed(s, id)).length;
  const metrics: MetricsPayload['metrics'] = [{ id: 'progress', label: '基地进度', value: `${done} / ${ids.length}`, frac: ids.length ? done / ids.length : 0, detail: '已完成的主线订单', status: 'ok' }];
  const valid = s.orbit.tests.filter((t) => t.valid);
  if (valid.length) {
    const last = valid[valid.length - 1]; const first = valid[0]; const pae = Math.round(last.pae * 1000) / 10;
    metrics.push({ id: 'orbit', label: '数轴估算', value: pae <= 8 ? '良好' : pae <= 15 ? '进步中' : '再练练', frac: Math.max(0, 1 - last.pae / 0.3), detail: `最近一次误差 ${pae}%${valid.length > 1 ? `（第一次 ${Math.round(first.pae * 1000) / 10}%）` : ''}`, status: pae <= 15 ? 'ok' : 'watch', hint: pae > 15 ? '大数的位置还不太稳，可以一起玩轨道站' : undefined });
  }
  const lit = litCards(s); if (s.session.missions > 0) metrics.push({ id: 'cert', label: '徽章', value: `${lit} / 3`, frac: lit / 3, detail: '数位牌 · 加法牌 · 减法牌', status: lit === 3 ? 'ok' : 'note' });
  const errors: Record<string, number> = {}; for (const c of DIAG_CLASSES) { const n = s.errors[c]?.n; if (n) errors[c] = n; }
  const certData = Object.fromEntries(CARDS.map((c) => [c, { state: s.cert[c].state, at: s.cert[c].at ?? 0, attempts: s.cert[c].attempts }]));
  return { metrics, data: { v: 1, pae: s.orbit.tests.map((t) => ({ L: t.L, at: t.at, pae: Math.round(t.pae * 1000) / 1000, r2: Math.round(t.r2 * 100) / 100, valid: t.valid })).slice(-12), errors, cert: certData, lastMission: s.lastPlayed } };
}
export const errorLabel = (cls: string): string => (CLASS_INFO as Record<string, { parent: string }>)[cls]?.parent ?? cls;
/** Tag mastery rows for the parent page: last 10 first-try bits per tag. */
export function tagRows(s: MarsSaveV5): { tag: string; level: number; mastered: boolean; window: string; fam: string }[] {
  return Object.entries(s.tags).map(([tag, t]) => ({ tag, level: t.level, mastered: t.mastered, window: (t.window ?? '').slice(-10), fam: t.fam ?? '' })).filter((r) => META[r.fam] || r.window);
}
