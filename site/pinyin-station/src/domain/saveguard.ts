import { stationOf } from './book';
import { initialSave } from './learning';
import type { Bank, Question, ResumeState, Save } from './types';

/**
 * Start-up guard: a save that was edited by hand, cut off, or written by another version never stops the game from opening.
 * Missing pieces get defaults, a station outside 1-12 is clamped, an unfinished programme is checked question by question.
 */
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, d: number): number => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export function repairSave(raw: unknown): Save {
  const base = initialSave();
  if (!isObj(raw)) return base;
  const s = raw as Record<string, any>;
  s.settings = isObj(s.settings) ? { ...base.settings, ...s.settings } : base.settings;
  s.settings.lesson = stationOf({ settings: { lesson: finite(s.settings.lesson, base.settings.lesson) } });
  if (s.settings.book !== undefined && !(Number.isInteger(s.settings.book) && s.settings.book >= 1 && s.settings.book <= 14)) delete s.settings.book;
  if (!['gentle', 'balanced', 'precise'].includes(s.settings.strictness)) s.settings.strictness = base.settings.strictness;
  if (!['initial', 'final', 'tone', 'full'].includes(s.settings.scaffold)) s.settings.scaffold = base.settings.scaffold;
  s.sessions = Math.max(0, Math.trunc(finite(s.sessions, 0)));
  s.dates = Array.isArray(s.dates) ? s.dates.filter((d: unknown) => Number.isFinite(d)) : [];
  s.history = Array.isArray(s.history) ? s.history.filter((a: unknown) => isObj(a) && typeof a.skill === 'string' && Number.isFinite(a.session)) : [];
  s.confusions = isObj(s.confusions) ? s.confusions : {};
  s.customWords = Array.isArray(s.customWords) ? s.customWords.filter((w: unknown) => isObj(w) && typeof w.id === 'string' && Array.isArray(w.syllables)) : [];
  const atoms: Record<string, any> = {};
  if (isObj(s.atoms))
    for (const [skill, a] of Object.entries(s.atoms))
      if (isObj(a)) atoms[skill] = { ...a, box: finite(a.box, 0), due: finite(a.due, 0), successes: Array.isArray(a.successes) ? a.successes : [], kinds: Array.isArray(a.kinds) ? a.kinds : [], needsReview: !!a.needsReview };
  s.atoms = atoms;
  for (const key of ['tutorial', 'book', 'drillBest', 'rulesSeen', 'snapshot'] as const) if (s[key] !== undefined && !isObj(s[key])) delete s[key];
  if (s.snapshot && !(isObj(s.snapshot.atoms) && isObj(s.snapshot.confusions) && isObj(s.snapshot.seen) && Number.isFinite(s.snapshot.through))) delete s.snapshot;
  if (s.lastAttemptAt !== undefined && !Number.isFinite(s.lastAttemptAt)) delete s.lastAttemptAt;
  return s as Save;
}

const KINDS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
/** One question of an unfinished programme: everything it names must exist, be playable and belong to a station the child has reached. */
export function validQuestion(q: unknown, b: Bank, s: Save): boolean {
  if (!isObj(q) || typeof q.id !== 'string' || !KINDS.has(q.kind) || typeof q.target !== 'string' || !Array.isArray(q.choices) || !q.choices.every((c: unknown) => typeof c === 'string')) return false;
  const L = stationOf(s);
  if (!(Number(q.lesson) <= L)) return false;
  const ids: string[] = [q.target, ...q.choices];
  const kind = q.kind as Question['kind'];
  if (kind === 'A') return ids.every((id) => b.letters.some((l) => l.id === id && l.lesson <= L));
  if (kind === 'I') return ids.every((id) => ['b', 'd', 'p', 'q'].includes(id));
  if (kind === 'B' || kind === 'C' || kind === 'H') {
    if (!ids.every((id) => b.syllables.some((x) => x.id === id && x.tone > 0 && !x.wordOnly && x.lesson <= L))) return false;
    if (kind === 'H') {
      const series = (b.tone4 ?? []).find((t) => t.ids.includes(q.target));
      return !!series && series.lesson <= L && ids.every((id) => series.ids.includes(id) && !(series.skip ?? []).includes(series.ids.indexOf(id) + 1));
    }
    return true;
  }
  const words = [...b.words, ...s.customWords];
  // a sentence question (G) lists chunks, not words: only its sentence has to exist
  // the target must be at the child's station; the wrong choices of a tiny first station may come from later ones, but must exist and be playable
  return (kind === 'G' ? [q.target] : ids).every((id) => {
    const w = words.find((x) => x.id === id);
    return !!w && !w.hold && (id !== q.target || w.lesson <= L);
  });
}
/** The unfinished programme with every bad question dropped (and the position kept), or nothing when none is left. */
export function repairResume(r: unknown, b: Bank, s: Save): ResumeState | undefined {
  if (!isObj(r) || !Array.isArray(r.queue) || !Number.isFinite(r.index) || typeof r.mode !== 'string') return undefined;
  const ok = r.queue.map((q: unknown) => validQuestion(q, b, s));
  if (ok.every(Boolean)) return r as unknown as ResumeState;
  const queue = r.queue.filter((_: unknown, i: number) => ok[i]);
  const index = ok.slice(0, Math.max(0, Math.min(r.index, ok.length))).filter(Boolean).length;
  return queue.length && index < queue.length ? ({ ...r, queue, index } as unknown as ResumeState) : undefined;
}
