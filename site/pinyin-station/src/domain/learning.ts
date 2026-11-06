import { createRng } from '@kit/rng';
import type { Attempt, Atom, Bank, Kind, Question, Save, Syllable, Word } from './types';
import { medialSplit, parseSyllable } from './pinyin';
import { dueRoots, weekRoots } from './progress';

export function initialSave(): Save {
  return {
    sessions: 0,
    dates: [],
    atoms: {},
    history: [],
    confusions: {},
    customWords: [],
    settings: { lesson: 4, ai: false, localScore: false, strictness: 'gentle', scaffold: 'initial' },
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
  if (a.judge === 'ai' || a.judge === 'local' || a.judge === 'self' || (a.assisted && a.correct)) return;
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
    atom.successes = [...new Set([...atom.successes, a.session])].slice(-5);
    atom.kinds = [...new Set([...atom.kinds, a.kind])];
    atom.byKind ??= {};
    atom.byKind[a.kind] = [...new Set([...(atom.byKind[a.kind] ?? []), a.session])].slice(-2);
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
  if (s.snapshot && a.session <= s.snapshot.through) throw new Error('archived_attempt_requires_replay');
  const old = s.history.findIndex((x) => x.id === a.id);
  if (old >= 0) s.history[old] = a;
  else s.history.push(a);
  rebuildAtoms(s);
}
export function rebuildAtoms(s: Save) {
  s.atoms = structuredClone(s.snapshot?.atoms ?? {});
  s.confusions = { ...s.snapshot?.confusions };
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
/** Words that only share a picture with a preferred word. They stay in the bank (review page, old progress) but are never asked. */
export function aliasWordIds(b: Bank, lesson: number): Set<string> {
  const aliases = new Set<string>();
  for (const [picture, order] of Object.entries(b.pictureOwners ?? {})) {
    const open = order.find((id) => (b.words.find((w) => w.id === id)?.lesson ?? 99) <= lesson);
    for (const w of b.words)
      if (w.picture === picture && !['sentence', 'cloze'].includes(w.kind) && w.id !== open) aliases.add(w.id);
  }
  return aliases;
}
export function eligibleWords(s: Save, b: Bank): Word[] {
  const aliases = aliasWordIds(b, s.settings.lesson);
  return [...b.words, ...s.customWords].filter(
    (w) =>
      w.lesson <= s.settings.lesson &&
      !['sentence', 'cloze'].includes(w.kind) &&
      (!w.beyond || w.custom) &&
      !w.hold &&
      !aliases.has(w.id),
  );
}
/** The letters a child can hear inside a letter's call sound (fō holds f and o, yī holds y and i, yū holds y, u and ü). */
export function heardLetters(callSound: string): Set<string> {
  const parsed = parseSyllable(callSound),
    out = new Set<string>();
  if (!parsed) return out;
  if (parsed.initial) out.add(parsed.initial);
  out.add(parsed.final);
  if (parsed.initial === 'y' && parsed.final === 'u') out.add('v');
  return out;
}
const medialOf = (final: string) => medialSplit(final)?.medial ?? '';
/** Same first sound and tone, a different last sound, same glide: the other choice of a “接起来” question. */
export function blendRivals(target: Syllable, syllables: Syllable[]): Syllable[] {
  return syllables.filter(
    (x) =>
      x.id !== target.id &&
      x.initial === target.initial &&
      x.tone === target.tone &&
      x.final !== target.final &&
      medialOf(x.final) === medialOf(target.final),
  );
}
export function schedule(s: Save, b: Bank, mode: string, count = 15): Question[] {
  const rng = createRng(`pinyin:${s.sessions}:${mode}`),
    words = eligibleWords(s, b),
    aliases = aliasWordIds(b, s.settings.lesson);
  // Within one programme a letter / pair / target is not asked again before every other one has had a turn.
  const used = new Map<string, number>();
  const previous = new Map<string, string>();
  // 复习队列: old friends (a due skill) and, in the weekly review, this week's skills are met first, each once per programme.
  const favSet = mode === 'week' ? weekRoots(s) : ['today', 'listen', 'repair'].includes(mode) ? dueRoots(s) : null;
  const fav = <T>(root: (item: T) => string): ((item: T) => boolean) | undefined => (favSet ? (item: T) => favSet.has(root(item)) : undefined);
  const pickLeast = <T>(items: T[], key: (item: T) => string, scope: string, favoured?: (item: T) => boolean): T => {
    const at = (item: T) => used.get(`${scope}:${key(item)}`) ?? 0,
      // Never the same one twice in a row, even when the whole set has been used up and starts over.
      fresh = items.filter((item) => key(item) !== previous.get(scope)),
      from0 = fresh.length ? fresh : items,
      wanted = favoured ? from0.filter((item) => favoured(item) && at(item) === 0) : [],
      from = wanted.length ? wanted : from0,
      min = Math.min(...from.map(at)),
      chosen = rng.pick(from.filter((item) => at(item) === min));
    used.set(`${scope}:${key(chosen)}`, at(chosen) + 1);
    previous.set(scope, key(chosen));
    return chosen;
  };
  const seen = new Map<string, number>(Object.entries(s.snapshot?.seen ?? {}));
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
  // whole-recognition syllables (zhi chi shi ri zi ci si yi wu yu ye yue yin yun yuan ying) are asked like letters
  const letters = b.letters.filter((l) => l.lesson <= s.settings.lesson);
  // Neutral-tone syllables (tone 0) and syllables without a recording are never played on their own.
  const syllables = b.syllables.filter((x) => x.lesson <= s.settings.lesson && x.tone > 0 && !x.wordOnly);
  const sentences = b.words.filter(
    (w) => ['sentence', 'cloze'].includes(w.kind) && w.lesson <= s.settings.lesson && !w.beyond && !w.hold,
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
  // ---- 新课加权: the current station and the one before it are ~2/3 of a programme (warm-up and the two 读一读 slots look back).
  const L = s.settings.lesson,
    inFocus = (lesson: number) => lesson >= L - 1;
  const focusWords = words.filter((w) => inFocus(w.lesson)),
    focusLetters = letters.filter((l) => inFocus(l.lesson)),
    focusSyl = syllables.filter((x) => inFocus(x.lesson));
  const toneItems = (b.tone4 ?? [])
    .filter((t) => t.lesson <= L)
    .flatMap((t) =>
      t.ids
        .map((id, n) => ({ id, series: t.series, kind: t.kind, lesson: t.lesson, tone: n + 1, choices: t.ids.filter((_, m) => !(t.skip ?? []).includes(m + 1)) }))
              .filter((x) => !(t.skip ?? []).includes(x.tone)),
    )
    .filter((x) => x.choices.length >= 3);
  const focusTone = toneItems.filter((t) => inFocus(t.lesson));
  const focusMain = [...new Set([...due, ...fresh])].filter((w) => inFocus(w.lesson));
  // When the new station has no words yet, the picture / spelling slots turn into sound work on the new syllables.
  const altKinds = (
    [
      focusSyl.length >= 2 ? 'B' : null,
      focusSyl.some((x) => x.initial && !['y', 'w'].includes(x.initial)) ? 'C' : null,
      focusTone.length ? 'H' : null,
      focusLetters.length ? 'A' : null,
    ] as (Kind | null)[]
  ).filter((k): k is Kind => !!k);
  let altAt = 0;
  // ---- 汉字卡 words: never two such questions in a row, at most 40% of a programme.
  const isText = (w: Word) => w.picture.startsWith('text:');
  const textPool = words.filter(isText);
  const maxText = Math.floor(count * 0.4);
  let textCount = 0,
    lastText = -2;
  /** How alike two words sound (shared first sound, shared vowels, same length): text-card distractors must make the child read. */
  const soundScore = (a: Word, w: Word) => {
    const pa = a.syllables.map((id) => parseSyllable(id)),
      pb = w.syllables.map((id) => parseSyllable(id));
    let score = Number(a.syllables.length === w.syllables.length);
    for (const x of pa)
      for (const y of pb)
        if (x && y) {
          if (x.initial && x.initial === y.initial) score++;
          if (x.final === y.final) score++;
        }
    return score;
  };
  const reviewWords = words.filter((w) => w.lesson <= 8);
  const pattern: Kind[] =
    mode === 'review'
      ? ['C', 'C', 'D', 'C', 'C', 'D', 'C', 'C', 'D', 'C', 'C', 'D', 'C', 'C', 'D', 'C', 'C', 'D', 'C', 'C']
      : mode === 'week'
      ? ['E', 'C', 'D', 'A', 'E', 'B', 'F', 'H', 'D', 'C', 'E', 'A', 'B', 'F', 'E', 'D', 'C', 'H']
      : mode === 'scene'
      ? ['E', 'F', 'E', 'F', 'E', 'F', 'E', 'F', 'E', 'F', 'E', 'F', 'E', 'F', 'E']
      : mode === 'read'
        ? ['D', 'C', 'D', 'C']
        : mode === 'listen'
          ? ['A', 'B', 'B']
          : mode === 'spell'
            ? ['F']
            : ['A', 'E', 'B', 'E', 'F', 'E', 'F', 'C', 'D', 'E', 'F', 'G', 'E', 'F', 'D'];
  // letters that sound exactly like the target (zh and zhi, i and yi and y, u and wu and w …) are never offered next to it
  const callGroup = (l: { callSound: string }) => ({ i1: 'yi1', u1: 'wu1' })[l.callSound as 'i1' | 'u1'] ?? l.callSound;
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
  const scenes = createRng('pinyin-scene-order').shuffle(
    (b.scenes ?? []).filter(
      (scene) =>
        scene.lesson <= s.settings.lesson && scene.targets.some((id) => words.some((w) => w.id === id)),
    ),
  );
  return Array.from({ length: mode === 'review' ? 20 : mode === 'week' ? 18 : count }, (_, i) => {
    let kind = pattern[i % pattern.length];
    const phase = i < 3 ? ('warmup' as const) : ('main' as const);
    if (kind === 'G' && !sentences.length) kind = 'E';
    if (mode !== 'scene' && ['D', 'E', 'F'].includes(kind) && !(phase === 'warmup' ? words : main).length)
      kind = i % 2 ? 'B' : 'A';
    if (kind === 'C' && !syllables.some((sy) => sy.initial && !['y', 'w'].includes(sy.initial))) kind = 'B';
    const textOk = lastText !== i - 1 && textCount < maxText;
    const review = mode === 'today' && (i === 8 || i === 14);
    const focusSlot = phase === 'main' && !review && (mode === 'today' || mode === 'listen' || mode === 'read');
    if (focusSlot && mode === 'today') {
      if (kind === 'G' && focusTone.length) kind = 'H';
      else if ((kind === 'E' || kind === 'F') && L >= 2 && !focusWords.some((w) => textOk || !isText(w)) && altKinds.length)
        kind = altKinds[altAt++ % altKinds.length];
    }
    if (focusSlot && mode === 'listen' && kind === 'B' && i % 3 === 2 && toneItems.length) kind = 'H';
    if (kind === 'H' && !toneItems.length) kind = 'B';
    // 字形对对碰: once b d p q are all known, one slot of today's programme is looking, not listening
    if (focusSlot && mode === 'today' && kind === 'E' && i === 9 && L >= 6) kind = 'I';
    if (kind === 'A') {
      const known = letters.filter((l) => (s.atoms[`letter:${l.id}:hear`]?.successes.length ?? 0) > 0);
      const target = pickLeast(
        phase === 'warmup' && known.length ? known : focusSlot && focusLetters.length ? focusLetters : letters,
        (l) => l.id,
        'A',
        fav((l: { id: string }) => `letter:${l.id}`),
      );
      // Exactly one right answer: the call sound (fō) must not also contain another choice (f + o).
      const heard = heardLetters(target.callSound);
      const others = rng.shuffle(
        letters.filter((l) => l.id !== target.id && callGroup(l) !== callGroup(target) && !heard.has(l.id)),
      );
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
    if (kind === 'C') {
      const options = syllables
        .filter((sy) => sy.initial && !['y', 'w'].includes(sy.initial))
        .map((sy) => ({ sy, rivals: blendRivals(sy, syllables) }))
        .filter((o) => o.rivals.length);
      if (options.length) {
        const near = focusSlot ? options.filter((o) => inFocus(o.sy.lesson)) : [];
        // The 阶段复习 looks back at the first eight stations and spreads over the first sounds.
        const old =
          mode === 'review'
            ? options
                .filter((o) => o.sy.lesson <= 8)
                .map((o) => ({ sy: o.sy, rivals: o.rivals.filter((r) => r.lesson <= 8) }))
                .filter((o) => o.rivals.length)
            : [];
        const base = near.length ? near : old.length ? old : options;
        const first = mode === 'review' ? pickLeast([...new Set(base.map((o) => o.sy.initial))], (x) => x, 'Cinit') : '';
        const { sy, rivals } = pickLeast(mode === 'review' ? base.filter((o) => o.sy.initial === first) : base, (o) => o.sy.id, 'C', fav((o: { sy: { id: string } }) => `syl:${o.sy.id}`));
        return {
          id: `C:${sy.id}`,
          kind,
          target: sy.id,
          skill: `syl:${sy.id}:blend`,
          lesson: sy.lesson,
          phase,
          choices: rng.shuffle([sy.id, rng.pick(rivals).id]),
        };
      }
      kind = 'B';
    }
    if (kind === 'B') {
      // A focus slot listens to the new station: only its own contrasts (or, when it has none, its own syllables).
      const sylPool = focusSlot && focusSyl.length >= 2 ? focusSyl : syllables;
      const eligible = b.confusions.filter((c) =>
        c.minimalPairs.some((p) => p.every((id) => sylPool.some((sy) => sy.id === id))),
      );
      const pair = eligible.length ? pickLeast(eligible, (c) => c.pair.join('|'), 'Bpair', fav((c: { pair: string[] }) => `pair:${c.pair.join('|')}`)) : undefined;
      const candidates =
        pair?.minimalPairs.filter((p) => p.every((id) => sylPool.some((sy) => sy.id === id))) ?? [];
      let alternatives = candidates.length ? pickLeast(candidates, (p) => p.join('|'), 'Bmin') : [];
      if (!alternatives.length) {
        // Two sounds of the same series (same vowel, different tone) or the same first sound: a small, honest contrast.
        const first = pickLeast(sylPool, (x) => x.id, 'Bfocus', fav((x: { id: string }) => `syl:${x.id}`)),
          mates = sylPool.filter((x) => x.id !== first.id && (x.final === first.final || x.initial === first.initial)),
          other = rng.pick(mates.length ? mates : sylPool.filter((x) => x.id !== first.id));
        alternatives = [first.id, other.id];
      }
      const id = pickLeast(alternatives, (x) => x, 'Bid');
      const sy = b.syllables.find((x) => x.id === id)!;
      return {
        id: `${kind}:${id}`,
        kind,
        target: id,
        skill: pair ? `pair:${pair.pair.join('|')}:hear` : `syl:${id}:hear`,
        lesson: sy.lesson,
        phase,
        choices: rng.shuffle(alternatives),
      };
    }
    if (kind === 'I') {
      const target = pickLeast(['b', 'd', 'p', 'q'], (x) => x, 'I');
      return {
        id: `I:${target}`,
        kind,
        target,
        skill: `glyph:${target}:see`,
        lesson: L,
        phase,
        choices: rng.shuffle(['b', 'd', 'p', 'q']),
      };
    }
    if (kind === 'H') {
      // 四声排排队: hear one tone of a series, pick it among the (ordered) four.
      const pool = focusSlot && focusTone.length ? focusTone : toneItems;
      const series = pickLeast([...new Set(pool.map((t) => t.series))], (x) => x, 'Hseries', fav((x: string) => `tone4:${x}`));
      const item = pickLeast(
        pool.filter((t) => t.series === series),
        (t) => t.id,
        'H',
      );
      return {
        id: `H:${item.id}`,
        kind,
        target: item.id,
        skill: `tone4:${item.series}:hear`,
        lesson: item.lesson,
        phase,
        choices: item.choices,
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
    const weekWords = mode === 'week' ? words.filter((w) => favSet?.has(`word:${w.id}`)) : [];
    const pool =
      mode === 'week'
        ? weekWords.length >= 3
          ? weekWords
          : words
        : mode === 'review'
        ? reviewWords
        : phase === 'warmup'
        ? familiar.length
          ? familiar
          : words
        : mode === 'repair' && due.length
          ? due
          : focusSlot && mode === 'today' && focusMain.length
            ? focusMain
            : main;
    const scene =
      mode === 'scene' && scenes.length ? scenes[(s.sessions * count + i) % scenes.length] : undefined;
    const sceneWords = scene ? words.filter((w) => scene.targets.includes(w.id)) : [];
    const readySceneWords = sceneWords.filter(
      (w) => !atoms(w).length || atoms(w).some((a) => a.due <= s.sessions),
    );
    // Text cards: not twice in a row, at most 40%, and a picture question about a text card needs three more text cards to choose from.
    const plain = pool.filter((w) => !isText(w)),
      allowed = pool.filter((w) => !isText(w) || (textOk && (kind !== 'E' || textPool.length >= 4))),
      usable = allowed.length ? allowed : plain.length ? plain : pool;
    const word = pickWord(scene ? (readySceneWords.length ? readySceneWords : sceneWords) : usable);
    if (isText(word)) {
      textCount++;
      lastText = i;
    }
    const contexts = (b.scenes ?? []).filter((item) => item.targets.includes(word.id));
    const context =
      scene ??
      (mode === 'today' && contexts.length && (kind === 'E' || kind === 'F')
        ? rng.pick(contexts)
        : undefined);
    queued.set(word.id, (queued.get(word.id) ?? 0) + 1);
    const pictures = new Set([word.picture]),
      meanings = new Set([word.hanzi]),
      sounds = new Set([word.syllables.join(' ')]),
      groups = new Set(word.semanticGroup ? [word.semanticGroup] : []);
    const picturePool =
      words.length >= 3
        ? words
        : [
            ...words,
            ...b.words.filter(
              (w) =>
                w.kind === 'noun' && !w.beyond && !w.hold && !words.some((x) => x.id === w.id) && !aliases.has(w.id),
            ),
          ];
    const distractors = rng
      .shuffle(picturePool.filter((w) => w.id !== word.id && isText(w) === isText(word)))
      .sort((a, b) => (isText(word) ? soundScore(word, b) - soundScore(word, a) : 0))
      .filter((w) => {
        if (
          sounds.has(w.syllables.join(' ')) ||
          pictures.has(w.picture) ||
          meanings.has(w.hanzi) ||
          (w.semanticGroup && groups.has(w.semanticGroup))
        )
          return false;
        sounds.add(w.syllables.join(' '));
        pictures.add(w.picture);
        meanings.add(w.hanzi);
        if (w.semanticGroup) groups.add(w.semanticGroup);
        return true;
      })
      .slice(0, 3)
      .map((w) => w.id);
    return {
      id: `${kind}:${word.id}`,
      scene: context?.id,
      practiceOnly: mode === 'scene' && !readySceneWords.length,
      kind,
      target: word.id,
      skill: `word:${word.id}:${kind === 'F' ? 'spell' : kind === 'D' ? 'say' : 'decode'}`,
      lesson: word.lesson,
      phase,
      choices: rng.shuffle([word.id, ...distractors]),
    };
  });
}
/**
 * The targets of an inserted contrast block: it alternates the two sounds, never plays the same one twice in a row and
 * does not start with the sound of the question just answered or end with the sound of the question that follows
 * (a block of 3 or 5 is used when 4 cannot satisfy both).
 */
export function contrastBlock(
  alternatives: string[],
  before: string | undefined,
  after: string | undefined,
  room: number,
  rng: ReturnType<typeof createRng>,
): string[] {
  const build = (len: number, strict: boolean): string[] | null => {
    const walk = (seq: string[]): string[] | null => {
      if (seq.length === len) return strict && after !== undefined && seq[len - 1] === after ? null : seq;
      for (const id of rng.shuffle(alternatives)) {
        if (id === (seq.length ? seq[seq.length - 1] : strict ? before : undefined)) continue;
        const found = walk([...seq, id]);
        if (found) return found;
      }
      return null;
    };
    return walk([]);
  };
  const lens = [4, 3, 5, 2].filter((n) => n <= Math.max(room, 2));
  for (const len of lens) {
    const found = build(len, true);
    if (found) return found;
  }
  for (const len of lens) {
    const found = build(len, false);
    if (found) return found;
  }
  return alternatives.slice(0, Math.max(1, room));
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
  const room = 24 - queue.length;
  const block = contrastBlock(alternatives, queue[index].target, queue[index + 1]?.target, room, rng);
  const additions: Question[] = block.slice(0, room).map((target, n) => ({
    id: `B:${target}:contrast:${index}:${n}`,
    kind: 'B',
    target,
    skill: `pair:${pairKey}:hear`,
    lesson: queue[index].lesson,
    phase: 'main',
    choices: rng.shuffle(alternatives),
  }));
  const copy = [...queue];
  copy.splice(index + 1, 0, ...additions);
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
