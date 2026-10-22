import { createRng } from '@kit/rng';
import type { Attempt, Atom, Bank, Kind, Question, Save, Word } from './types';

export function initialSave(): Save {
  return {
    sessions: 0,
    dates: [],
    atoms: {},
    history: [],
    confusions: {},
    customWords: [],
    settings: { lesson: 4, ai: false, strictness: 'gentle', scaffold: 'initial' },
  };
}
export function beginSession(s: Save, now = Date.now()): number {
  if (!s.sessions || !s.lastAttemptAt || now - s.lastAttemptAt >= 30 * 60000 || now < s.lastAttemptAt) {
    s.sessions++;
    s.dates.push(now);
  }
  s.lastAttemptAt = now;
  return s.sessions;
}
function apply(s: Save, a: Attempt) {
  if (a.judge === 'ai' || a.judge === 'self' || (a.assisted && a.correct)) return;
  const atom: Atom = s.atoms[a.skill] ?? {
    box: 0,
    due: 0,
    successes: [],
    kinds: [],
    needsReview: false,
    byKind: {},
  };
  const pair = a.confusion ?? (a.skill.startsWith('pair:') ? a.skill.split(':')[1] : undefined);
  if (a.correct) {
    if (!atom.successes.includes(a.session)) atom.box = Math.min(5, atom.box + 1);
    atom.successes = [...new Set([...atom.successes, a.session])];
    atom.kinds = [...new Set([...atom.kinds, a.kind])];
    atom.byKind ??= {};
    atom.byKind[a.kind] = [...new Set([...(atom.byKind[a.kind] ?? []), a.session])];
    atom.due = a.session + [1, 1, 2, 4, 8, 16][atom.box];
    if (atom.successes.length >= 2) atom.needsReview = false;
    if (pair) s.confusions[pair] = Math.max(0, (s.confusions[pair] ?? 0) - 1);
  } else {
    Object.assign(atom, {
      box: 0,
      due: a.session + 1,
      needsReview: true,
      successes: [],
      kinds: [],
      byKind: {},
    });
    if (pair) s.confusions[pair] = (s.confusions[pair] ?? 0) + 1;
  }
  s.atoms[a.skill] = atom;
}
const order = (a: Attempt, b: Attempt) => a.session - b.session || (a.at ?? 0) - (b.at ?? 0);
export function recordAttempt(s: Save, a: Attempt) {
  const old = s.history.findIndex((x) => x.id === a.id);
  if (old >= 0) s.history[old] = a;
  else s.history.push(a);
  rebuildAtoms(s);
}
export function rebuildAtoms(s: Save) {
  s.atoms = {};
  s.confusions = {};
  for (const a of [...s.history].sort(order)) apply(s, a);
}
export function mastery(s: Save, root: string): boolean {
  const atoms = Object.entries(s.atoms)
    .filter(([key]) => key.startsWith(root + ':'))
    .map(([, a]) => a);
  const kinds = new Map<Kind, Set<number>>();
  for (const atom of atoms)
    for (const [kind, sessions] of Object.entries(atom.byKind ?? {})) {
      const set = kinds.get(kind as Kind) ?? new Set<number>();
      sessions.forEach((n) => set.add(n));
      kinds.set(kind as Kind, set);
    }
  return (
    atoms.some((a) => a.box === 5) && [...kinds.values()].filter((sessions) => sessions.size >= 2).length >= 2
  );
}
export function eligibleWords(s: Save, b: Bank): Word[] {
  return [...b.words, ...s.customWords].filter(
    (w) => w.lesson <= s.settings.lesson && w.kind !== 'sentence' && (!w.beyond || w.custom),
  );
}
export function schedule(s: Save, b: Bank, mode: string, count = 15): Question[] {
  const rng = createRng(`pinyin:${s.sessions}:${mode}`),
    words = eligibleWords(s, b);
  const seen = new Map<string, number>();
  for (const a of s.history) seen.set(a.skill, (seen.get(a.skill) ?? 0) + 1);
  const wordSeen = (w: Word) =>
    ['decode', 'spell', 'say'].reduce((n, k) => n + (seen.get(`word:${w.id}:${k}`) ?? 0), 0);
  const queued = new Map<string, number>();
  const atoms = (w: Word) =>
    Object.entries(s.atoms)
      .filter(([key]) => key.startsWith(`word:${w.id}:`))
      .map(([, a]) => a);
  const due = words.filter((w) => atoms(w).some((a) => a.due <= s.sessions));
  const fresh = words.filter((w) => !atoms(w).length);
  const main = [...new Set([...due, ...fresh])];
  const familiar = words.filter((w) => atoms(w).some((a) => a.successes.length));
  const letters = b.letters.filter((l) => l.lesson <= s.settings.lesson && l.kind !== 'whole');
  const syllables = b.syllables.filter((x) => x.lesson <= s.settings.lesson && x.tone > 0);
  const sentences = b.words.filter(
    (w) => w.kind === 'sentence' && w.lesson <= s.settings.lesson && !w.beyond,
  );
  const pickWord = (pool: Word[]) =>
    rng
      .shuffle(pool)
      .sort(
        (a, b) =>
          (queued.get(a.id) ?? 0) - (queued.get(b.id) ?? 0) ||
          Number(atoms(b).some((x) => x.needsReview)) - Number(atoms(a).some((x) => x.needsReview)) ||
          wordSeen(a) - wordSeen(b),
      )[0];
  const pattern: Kind[] =
    mode === 'read'
      ? ['D', 'C', 'D', 'C']
      : mode === 'listen'
        ? ['A', 'B', 'B']
        : mode === 'spell'
          ? ['F']
          : ['A', 'E', 'B', 'E', 'F', 'E', 'F', 'C', 'D', 'E', 'F', 'G', 'E', 'F', 'D'];
  const sameAudio: Record<string, string> = { i: 'y', y: 'i', u: 'w', w: 'u' };
  const confusing: Record<string, string[]> = {
    b: ['p', 'd'],
    p: ['b'],
    d: ['t', 'b'],
    t: ['d'],
    n: ['l', 'm'],
    l: ['n'],
    m: ['n'],
    f: ['p', 't'],
    v: ['u'],
    u: ['v'],
    a: ['o', 'e'],
    o: ['a', 'e'],
    e: ['o', 'a'],
  };
  return Array.from({ length: count }, (_, i) => {
    let kind = pattern[i % pattern.length];
    const phase = i < 3 ? ('warmup' as const) : ('main' as const);
    if (kind === 'G' && !sentences.length) kind = 'E';
    if (['D', 'E', 'F'].includes(kind) && !(phase === 'warmup' ? words : main).length)
      kind = i % 2 ? 'B' : 'A';
    if (kind === 'C' && !syllables.some((sy) => sy.initial && !['y', 'w'].includes(sy.initial))) kind = 'B';
    if (kind === 'A') {
      const known = letters.filter((l) => (s.atoms[`letter:${l.id}:hear`]?.successes.length ?? 0) > 0);
      const target = rng.pick(phase === 'warmup' && known.length ? known : letters);
      const others = rng.shuffle(letters.filter((l) => l.id !== target.id && l.id !== sameAudio[target.id]));
      others.sort(
        (a, b) =>
          Number(confusing[target.id]?.includes(b.id) ?? false) -
          Number(confusing[target.id]?.includes(a.id) ?? false),
      );
      return {
        id: `A:${target.id}`,
        kind,
        target: target.id,
        skill: `letter:${target.id}:hear`,
        lesson: target.lesson,
        phase,
        choices: rng.shuffle([target.id, ...others.slice(0, 3).map((l) => l.id)]),
      };
    }
    if (kind === 'B' || kind === 'C') {
      const eligible = b.confusions.filter((c) =>
        c.minimalPairs.some((p) => p.every((id) => syllables.some((sy) => sy.id === id))),
      );
      const pair = eligible.length ? rng.pick(eligible) : undefined;
      const candidates =
        pair?.minimalPairs.filter((p) => p.every((id) => syllables.some((sy) => sy.id === id))) ?? [];
      let alternatives = candidates.length ? rng.pick(candidates) : [];
      if (!alternatives.length) {
        const first = rng.pick(syllables),
          other = rng.pick(syllables.filter((sy) => sy.id !== first.id));
        alternatives = [first.id, other.id];
      }
      const id = rng.pick(alternatives),
        sy = b.syllables.find((x) => x.id === id)!;
      return {
        id: `${kind}:${id}`,
        kind,
        target: id,
        skill:
          kind === 'C' ? `syl:${id}:blend` : pair ? `pair:${pair.pair.join('|')}:hear` : `syl:${id}:hear`,
        lesson: sy.lesson,
        phase,
        choices: rng.shuffle(alternatives),
      };
    }
    if (kind === 'G') {
      const sentence = pickWord(
        sentences.filter((w) => !atoms(w).length || atoms(w).some((a) => a.due <= s.sessions)),
      );
      if (sentence) {
        queued.set(sentence.id, (queued.get(sentence.id) ?? 0) + 1);
        return {
          id: `G:${sentence.id}`,
          kind,
          target: sentence.id,
          skill: `word:${sentence.id}:decode`,
          lesson: sentence.lesson,
          phase,
          choices: rng.shuffle(sentence.chunks ?? []),
        };
      }
      // All sentences are resting. Offer a listening question instead of violating the interval.
      return schedule(s, b, 'listen', count)[i];
    }
    const pool =
      phase === 'warmup'
        ? familiar.length
          ? familiar
          : words
        : mode === 'repair' && due.length
          ? due
          : main;
    const word = pickWord(pool);
    queued.set(word.id, (queued.get(word.id) ?? 0) + 1);
    const pictures = new Set([word.picture]),
      meanings = new Set([word.hanzi]),
      groups = new Set(word.semanticGroup ? [word.semanticGroup] : []);
    const distractors = rng
      .shuffle(words.filter((w) => w.id !== word.id))
      .filter((w) => {
        if (
          pictures.has(w.picture) ||
          meanings.has(w.hanzi) ||
          (w.semanticGroup && groups.has(w.semanticGroup))
        )
          return false;
        pictures.add(w.picture);
        meanings.add(w.hanzi);
        if (w.semanticGroup) groups.add(w.semanticGroup);
        return true;
      })
      .slice(0, 3)
      .map((w) => w.id);
    return {
      id: `${kind}:${word.id}`,
      kind,
      target: word.id,
      skill: `word:${word.id}:${kind === 'F' ? 'spell' : kind === 'D' ? 'say' : 'decode'}`,
      lesson: word.lesson,
      phase,
      choices: rng.shuffle([word.id, ...distractors]),
    };
  });
}
export function insertContrasts(queue: Question[], index: number, b: Bank, pairKey: string): Question[] {
  const pair = b.confusions.find((c) => c.pair.join('|') === pairKey);
  if (!pair || queue.length >= 24) return queue;
  const eligible = pair.minimalPairs.filter((p) =>
    p.every((id) => b.syllables.some((sy) => sy.id === id && sy.lesson <= queue[index].lesson)),
  );
  if (!eligible.length) return queue;
  const rng = createRng(`${queue[index].id}:${index}:${pairKey}`),
    alternatives = rng.pick(eligible);
  const additions: Question[] = [...rng.shuffle(alternatives), ...rng.shuffle(alternatives)].map(
    (target, n) => ({
      id: `B:${target}:contrast:${index}:${n}`,
      kind: 'B',
      target,
      skill: `pair:${pairKey}:hear`,
      lesson: queue[index].lesson,
      phase: 'main',
      choices: rng.shuffle(alternatives),
    }),
  );
  const copy = [...queue];
  copy.splice(index + 1, 0, ...additions.slice(0, 24 - queue.length));
  return copy;
}
export function nextQuestion(
  queue: Question[],
  index: number,
  tries: number,
  correct: boolean,
  variations?: Question[],
) {
  if (correct) return { action: 'advance' as const, queue };
  if (tries < 3) return { action: 'hint' as const, queue };
  const copy = [...queue],
    q = queue[index];
  const variation = variations?.find((v) => v.kind === q.kind && v.target !== q.target);
  if (copy.length < 24 && variation)
    copy.splice(Math.min(index + 3, copy.length), 0, {
      ...variation,
      id: variation.id + ':twin',
      phase: 'main',
    });
  return { action: 'demonstrate' as const, queue: copy };
}
