// Reference implementation (golden) of the 记忆方块 → 月宫建造师 "元老卡" migration.
// The TS port lives in site/moon-builder/src/rules/veteran.ts and must pass the same fixture table
// (fixtures/veteran-cases.json) — see memory-matrix.md §8.3.
//
// Inputs are the RAW localStorage strings (or null):
//   liveRaw     = localStorage['kid_games_memory_matrix_v2']        (written by the old page)
//   snapshotRaw = localStorage['kg:v1:legacy-memory-matrix']        (hub copy: {v,updatedAt,data})
//   prev        = MoonSave.legacy (or undefined) from earlier launches
// Output: the new MoonSave.legacy value, plus `awardNow` (true exactly once: the first time
// cleared >= 1 is seen) — the caller then adds card 'veteran' + decor 'veteran-flag' and queues the
// one-time line `moon.m4.veteran`. Never throws. Never writes or deletes the legacy keys.

export const LADDER_IDS = ['sprout', 'explore', 'leap', 'galaxy'];
export const LEVELS_PER_LADDER = 40;

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function parse(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Count stars and cleared levels in one old-format progress object ({ ladders: {...} }). */
export function tally(progress) {
  const out = { stars: 0, cleared: 0, byLadder: {} };
  if (!isObj(progress) || !isObj(progress.ladders)) return null;
  for (const id of LADDER_IDS) {
    const lp = progress.ladders[id];
    const t = { stars: 0, cleared: 0 };
    if (isObj(lp) && isObj(lp.solved)) {
      for (const [k, rec] of Object.entries(lp.solved)) {
        if (!/^[1-9][0-9]?$/.test(k)) continue;            // keys are level numbers "1".."40"
        const n = Number(k);
        if (n < 1 || n > LEVELS_PER_LADDER || !isObj(rec)) continue;
        t.cleared += 1;                                    // a record exists only for a cleared level
        const s = Math.floor(Number(rec.stars));
        t.stars += Number.isFinite(s) ? Math.min(3, Math.max(0, s)) : 0;  // same sum the old menu showed (stars||0)
      }
    }
    out.byLadder[id] = t;
    out.stars += t.stars;
    out.cleared += t.cleared;
  }
  return out;
}

export function computeVeteran(liveRaw, snapshotRaw, prev, now = Date.now()) {
  const live = tally(parse(liveRaw));
  const snapEnv = parse(snapshotRaw);
  const snap = tally(isObj(snapEnv) ? snapEnv.data : null);
  const p = isObj(prev) ? prev : null;
  const prevStars = p && Number.isFinite(p.memoryMatrixStars) ? p.memoryMatrixStars : 0;
  const prevCleared = p && Number.isFinite(p.memoryMatrixCleared) ? p.memoryMatrixCleared : 0;
  // Max of every source: the live key is newest while the old page exists; the snapshot survives if
  // the live key is ever unreadable; `prev` makes the card monotone (never revoked, never shrinks).
  const stars = Math.max(prevStars, live?.stars ?? 0, snap?.stars ?? 0);
  const cleared = Math.max(prevCleared, live?.cleared ?? 0, snap?.cleared ?? 0);
  const source = live && (live.stars >= (snap?.stars ?? 0)) && live.cleared > 0 ? 'live' : snap && snap.cleared > 0 ? 'snapshot' : p?.source ?? 'none';
  const awardedAt = p?.awardedAt ?? (cleared >= 1 ? now : undefined);
  const legacy = { memoryMatrixStars: stars, memoryMatrixCleared: cleared, source };
  if (awardedAt !== undefined) legacy.awardedAt = awardedAt;
  const changed = !p || prevStars !== stars || prevCleared !== cleared || p.awardedAt !== legacy.awardedAt;
  return { legacy, awardNow: cleared >= 1 && !(p && p.awardedAt), changed };
}
