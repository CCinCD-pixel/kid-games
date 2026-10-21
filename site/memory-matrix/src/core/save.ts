// @ts-nocheck
// GENERATED from tools/memory-matrix/proto/save.mjs by tools/memory-matrix/sync-core.mjs - do not edit; change the oracle and re-run the script.
// Save schema v1 (key kg:v1:memory-matrix) + the one-time 元老 migration (spec §10). The old key kid_games_memory_matrix_v2 is READ ONLY and
// never deleted; it becomes a card/badge, NEVER levels (Dad, 2026-10-12): applyVeteran touches only `veteran` and `cards`.
import { SECTOR_IDS, WINGS } from './params';
import { newSector } from './controller';
import { computeVeteran } from './veteran';

export const SAVE_VERSION = 1;
export const defaults = () => ({
  v: SAVE_VERSION, introSeen: false, tutorial: { s1: false, s2: false, s3: false, s4: false }, nights: 0, nightsAny: 0, cards: [], flags: { rotation: false },
  sectors: Object.fromEntries(SECTOR_IDS.map((s, i) => [s, { ...newSector(s, i === 0), primer: {}, byLevel: {}, span: {}, stats: { rounds: 0, pass: 0, miss: 0, neutral: 0, slips: 0, rewatch: 0, hintMax: 0, activeMs: 0 } }])),
  recent: Object.fromEntries(SECTOR_IDS.map((s) => [s, { exact: [], shape: [] }])),     // last 64 exact-key hashes / last 6 shape hashes per sector
  settings: { colorAssist: false }, lastSeen: 0,
});
/** Read the old save(s), award the 元老 card once, never move any level. liveRaw / snapshotRaw are raw localStorage strings. */
export function applyVeteran(save, liveRaw, snapshotRaw, now = Date.now()) {
  const r = computeVeteran(liveRaw, snapshotRaw, save.veteran && { memoryMatrixStars: save.veteran.stars, memoryMatrixCleared: save.veteran.cleared, awardedAt: save.veteran.awardedAt, source: save.veteran.source }, now);
  const next = { ...save, cards: save.cards.slice() };
  if (r.legacy.memoryMatrixCleared >= 1) {
    next.veteran = { stars: r.legacy.memoryMatrixStars, cleared: r.legacy.memoryMatrixCleared, awardedAt: r.legacy.awardedAt, source: r.legacy.source };
    if (!next.cards.includes('c.vet')) next.cards.push('c.vet');
  }
  return { save: next, awardNow: r.awardNow };
}
/** Schema guard used on load: unknown / newer versions are read-only (never overwritten by an older cached page). */
export function classify(raw) { try { const o = JSON.parse(raw); return !o || typeof o.v !== 'number' ? 'fresh' : o.v > SAVE_VERSION ? 'newer' : 'ok'; } catch { return 'fresh'; } }
export const sizeBytes = (s) => new TextEncoder().encode(JSON.stringify(s)).length;
export { WINGS };
