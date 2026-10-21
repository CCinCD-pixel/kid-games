import { createRng } from '@kit/rng';
import type { Attempt, Atom, Bank, Kind, Question, Save, Word } from './types';

export function initialSave(): Save {
  return { sessions: 0, dates: [], atoms: {}, history: [], confusions: {}, customWords: [], settings: { lesson: 4, ai: false, strictness: 'gentle', scaffold: 'initial' } };
}
function apply(s: Save, a: Attempt) {
  // Trial AI and child self-ratings never alter the learning ledger, including setbacks.
  if (a.judge === 'ai' || a.judge === 'self') return;
  const atom: Atom = s.atoms[a.skill] ?? { box: 0, due: 0, successes: [], kinds: [], needsReview: false };
  if (a.correct) {
    if (!atom.successes.includes(a.session)) atom.box = Math.min(5, atom.box + 1);
    atom.successes = [...new Set([...atom.successes, a.session])];
    atom.kinds = [...new Set([...atom.kinds, a.kind])];
    atom.due = a.session + [1, 1, 2, 4, 8, 16][atom.box];
    if (atom.successes.length >= 2) atom.needsReview = false;
  } else {
    atom.box = 0; atom.due = a.session + 1; atom.needsReview = true; atom.successes = []; atom.kinds = [];
    if (a.confusion) s.confusions[a.confusion] = (s.confusions[a.confusion] ?? 0) + 1;
  }
  s.atoms[a.skill] = atom;
}
export function recordAttempt(s: Save, a: Attempt) {
  const old = s.history.findIndex(x => x.id === a.id);
  if (old >= 0) { s.history[old] = a; rebuildAtoms(s); }
  else { s.history.push(a); apply(s, a); }
}
export function rebuildAtoms(s: Save) {
  s.atoms = {}; s.confusions = {};
  for (const a of s.history) apply(s, a);
}
export function mastery(s: Save, root: string): boolean {
  const atoms = Object.entries(s.atoms).filter(([key]) => key.startsWith(root + ':')).map(([, a]) => a);
  return atoms.some(a => a.box === 5) && new Set(atoms.flatMap(a => a.kinds)).size >= 2 && new Set(atoms.flatMap(a => a.successes)).size >= 2;
}
export function eligibleWords(s: Save, b: Bank): Word[] {
  return [...b.words, ...s.customWords].filter(w => w.lesson <= s.settings.lesson && w.kind !== 'sentence');
}
export function schedule(s: Save, b: Bank, mode: string, count = 15): Question[] {
  const rng = createRng(`pinyin:${s.sessions}:${mode}`), words = eligibleWords(s, b);
  const due = words.filter(w => ['decode', 'spell'].some(k => { const a = s.atoms[`word:${w.id}:${k}`]; return a && a.due <= s.sessions + 1; }));
  const pool = mode === 'repair' && due.length ? due : words;
  const shuffled = rng.shuffle(pool);
  const needsReview = (w:Word) => ['decode','spell'].some(k=>s.atoms[`word:${w.id}:${k}`]?.needsReview);
  const review = rng.shuffle(due).sort((a,b)=>Number(needsReview(b))-Number(needsReview(a)));
  const familiarWords = rng.shuffle(words.filter(w => ['decode','spell'].some(k => (s.atoms[`word:${w.id}:${k}`]?.successes.length ?? 0) > 0)));
  let mainWord = 0, reviewWord = 0, freshWord = 0;
  const letters = b.letters.filter(l => l.lesson <= s.settings.lesson && l.kind !== 'whole');
  const syllables = b.syllables.filter(x => x.lesson <= s.settings.lesson && x.tone > 0);
  const sentences = b.words.filter(w => w.kind === 'sentence' && w.lesson <= s.settings.lesson);
  const pattern: Kind[] = mode === 'read' ? ['D', 'C', 'D', 'C'] : mode === 'listen' ? ['A', 'B', 'B'] : mode === 'spell' ? ['F'] : ['A', 'E', 'B', 'E', 'F', 'E', 'F', 'C', 'D', 'E', 'F', 'G', 'E', 'F', 'D'];
  return Array.from({ length: count }, (_, i) => {
    let kind = pattern[i % pattern.length];
    if (kind === 'G' && !sentences.length) kind = 'E';
    if (!words.length && ['D','E','F','G'].includes(kind)) kind = i % 2 ? 'B' : 'A';
    if (kind === 'C' && !syllables.some(sy=>sy.initial&&!['y','w'].includes(sy.initial))) kind = 'B';
    const phase = i < 3 ? 'warmup' as const : 'main' as const;
    if (kind === 'A') {
      const known = letters.filter(l => (s.atoms[`letter:${l.id}:hear`]?.successes.length ?? 0) > 0);
      const letterPool = i < 3 && known.length ? known : letters;
      const target = letterPool[i % letterPool.length];
      return { id: `A:${target.id}`, kind, target: target.id, skill: `letter:${target.id}:hear`, lesson: target.lesson, phase, choices: rng.shuffle([target.id, ...rng.shuffle(letters.filter(l => l.id !== target.id)).slice(0, 3).map(l => l.id)]) };
    }
    if (kind === 'B' || kind === 'C') {
      const eligiblePairs = b.confusions.filter(c => c.minimalPairs.some(p => p.every(id => syllables.some(sy => sy.id === id))));
      const pair = eligiblePairs.find(c => (s.confusions[c.pair.join('|')] ?? 0) >= 2) ?? eligiblePairs[i % eligiblePairs.length];
      const candidates = pair?.minimalPairs.filter(p => p.every(id => syllables.some(sy => sy.id === id))) ?? [];
      const alternatives = candidates.length ? candidates[i % candidates.length] : syllables.slice(0, 2).map(sy => sy.id);
      const id = alternatives[0], sy = b.syllables.find(x => x.id === id)!;
      const skill = kind === 'C' ? `syl:${id}:blend` : pair ? `pair:${pair.pair.join('|')}:hear` : `syl:${id}:hear`;
      return { id: `${kind}:${id}`, kind, target: id, skill, lesson: sy.lesson, phase, choices: rng.shuffle(alternatives) };
    }
    if (kind === 'G') {
      const sentence = sentences[i % sentences.length];
      return { id: `G:${sentence.id}`, kind, target: sentence.id, skill: `word:${sentence.id}:decode`, lesson: sentence.lesson, phase, choices: rng.shuffle(sentence.chunks ?? []) };
    }
    const warmPool = familiarWords.length ? familiarWords : shuffled;
    const word = i < 3 ? warmPool[i % warmPool.length] : review.length && (mode === 'repair' || mainWord++ % 2 === 0) ? review[reviewWord++ % review.length] : shuffled[freshWord++ % shuffled.length];
    const pictures=new Set([word.picture]), meanings=new Set([word.hanzi]);
    const distractors=rng.shuffle(words.filter(w=>w.id!==word.id)).filter(w=>{
      if(pictures.has(w.picture)||meanings.has(w.hanzi))return false;
      pictures.add(w.picture);meanings.add(w.hanzi);return true;
    }).slice(0,3).map(w=>w.id);
    return { id: `${kind}:${word.id}`, kind, target: word.id, skill: `word:${word.id}:${kind === 'F' ? 'spell' : kind === 'D' ? 'say' : 'decode'}`, lesson: word.lesson, phase, choices: rng.shuffle([word.id, ...distractors]) };
  });
}
export function nextQuestion(queue: Question[], index: number, tries: number, correct: boolean) {
  if (correct) return { action: 'advance' as const, queue };
  if (tries < 3) return { action: 'hint' as const, queue };
  const copy = [...queue];
  if (queue.length < 24) copy.splice(Math.min(index + 3, copy.length), 0, { ...queue[index], id: queue[index].id + ':twin', choices: [...queue[index].choices].reverse(), phase: 'main' });
  return { action: 'demonstrate' as const, queue: copy };
}
