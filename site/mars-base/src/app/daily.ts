/** A six-item equipment check-up, drawn only from tags the child has already practised. */
import { createRng } from '@kit/rng';
import type { MarsSaveV5, TagState } from '../save/schema';
import { META } from '../families';
import { learnedPool, type PoolEntry } from './challenge';
import { dueTags } from './adaptive';
import type { MissionPlan, SlotPlan } from './planMission';

type Role = 'O' | 'F' | 'R' | 'X' | 'C';
export interface CheckPick { role: Role; tag: string; fam: string; level: number; due: boolean }
const DAY = 86_400_000;

export function canCheck(save: MarsSaveV5): boolean {
  return Object.values(save.nodes).some((n) => n.st === 'done' && n.plays > 0)
    && new Set(learnedPool(save).map((e) => META[e.fam]?.tag).filter((t) => t && save.tags[t])).size >= 4;
}

export function composeDaily(save: MarsSaveV5): { plan: MissionPlan; picks: CheckPick[] } {
  const seq = save.daily.runSeq + 1;
  const node = `check.${seq}`;
  const rng = createRng(`mars-base:check:${save.salt}:${seq}`);
  const pool = learnedPool(save);
  const byTag = new Map<string, PoolEntry[]>();
  for (const entry of pool) {
    const tag = META[entry.fam]?.tag;
    if (!tag || !save.tags[tag]) continue;
    const entries = byTag.get(tag) ?? [];
    entries.push(entry); byTag.set(tag, entries);
  }
  if (byTag.size < 4) throw new Error('check-up needs four learned tags');
  const dueSet = new Set(dueTags(save, save.session.index));
  const now = save.session.lastActiveAt;
  const recent = new Map<string, number>();
  for (const row of save.daily.recent.slice(-3)) for (const tag of row.split(',')) recent.set(tag, (recent.get(tag) ?? 0) + 1);
  const roles: Role[] = ['O', 'F', 'R', 'F', 'X', 'C'];
  if (save.daily.lastFT && save.daily.lastFT < 0.72) roles[4] = 'F';
  if (save.daily.lastFT > 0.9) roles[3] = 'X';
  const overdue = [...byTag.keys()].filter((tag) => dueSet.has(tag));
  if (overdue.length >= 3) roles[3] = 'R';
  if (overdue.length >= 5) roles[5] = 'R';
  const used = new Map<string, number>();
  const picks: CheckPick[] = [];
  const slots: SlotPlan[] = [];
  let previous = '';
  let previousZone = '';
  for (const role of roles) {
    const candidates = [...byTag.entries()].filter(([tag]) => tag !== previous && (used.get(tag) ?? 0) < 2);
    if (!candidates.length) throw new Error('check-up cannot satisfy tag variety');
    let chosen: { tag: string; entry: PoolEntry; score: number; due: boolean } | null = null;
    for (const [tag, entries] of candidates) {
      const state = save.tags[tag];
      const entry = entries.find((e) => e.fam === state.fam) ?? entries[entries.length - 1];
      const tail = state.window.slice(-10);
      const ft = tail.length ? [...tail].filter((x) => x === '1').length / tail.length : 0.7;
      const gap = now && state.lastAt ? Math.max(0, (now - state.lastAt) / DAY) : 0;
      const due = dueSet.has(tag) || (state.mastered && gap >= 6);
      let score = role === 'O' ? (state.mastered ? 3 : 1) + ft * 2 + (due ? 3 : 0)
        : role === 'R' ? (due ? 8 + Math.min(6, gap) : state.mastered ? 1 : 0)
        : role === 'F' ? (state.mastered ? 0 : 4) + (1 - ft) * 3
        : role === 'X' ? (ft >= 0.75 && state.level >= 3 ? 6 + ft : 0)
        : 2 + Math.min(3, gap / 2);
      if (role === 'C' && previousZone && entry.zone !== previousZone) score += 2;
      if (ft >= 0.97 && state.level >= 5 && role !== 'X') score -= 2;
      score -= (recent.get(tag) ?? 0) * 1.6 + (used.get(tag) ?? 0) * 2.2;
      score += rng.next() * 0.01;
      if (!chosen || score > chosen.score) chosen = { tag, entry, score, due };
    }
    const { tag, entry, due } = chosen!;
    const state: TagState = save.tags[tag];
    const level = role === 'O' ? Math.min(3, state.level)
      : role === 'R' ? Math.max(2, state.level - (state.shaky ? 2 : 1))
      : role === 'X' ? Math.min(META[entry.fam]?.l6 ? 6 : 5, state.level + 1)
      : role === 'C' ? Math.min(3, Math.max(2, state.level - 1)) : state.level;
    picks.push({ role, tag, fam: entry.fam, level, due });
    slots.push({ kind: 'check', checkRole: role, fam: entry.fam, band: entry.band, ask: entry.ask, knobs: entry.knobs, mode: 'normal', level, node });
    used.set(tag, (used.get(tag) ?? 0) + 1); previous = tag; previousZone = entry.zone;
  }
  return { plan: { node, kind: 'check', slots, seedBase: `mars-base:check:${save.salt}:${seq}` }, picks };
}
