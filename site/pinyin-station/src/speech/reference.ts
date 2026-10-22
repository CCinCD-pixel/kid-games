import type { Bank, Question, Word } from '../domain/types';
import { parseSyllable } from '../domain/pinyin';

export interface AssessmentPlan {
  mode: 1 | 6 | 8;
  ref: string;
  pronunciation?: string[];
  branches?: { syllables: string[]; target: number; confusion: string };
}
// These are spoken syllables, not names of letters. Calls such as dē/tē stay in mode 8.
const characters: Record<string, string> = {
  ba1: '八',
  ba2: '拔',
  ba3: '把',
  ba4: '爸',
  pa1: '趴',
  bo1: '波',
  po1: '坡',
  po2: '婆',
  fo2: '佛',
  da1: '搭',
  ta1: '他',
  li2: '梨',
  ni2: '泥',
  lu4: '路',
  nu4: '怒',
  la1: '拉',
  na1: '拿',
  lv2: '驴',
  lv3: '旅',
  nv3: '女',
  fa1: '发',
  fa4: '发',
};
export function syllablePlan(id: string, bank: Bank): AssessmentPlan {
  const word = bank.words.find((w) => w.syllables.length === 1 && w.syllables[0] === id);
  const hanzi = characters[id] ?? word?.hanzi;
  return hanzi ? { mode: 1, ref: hanzi, pronunciation: [id] } : { mode: 8, ref: id };
}
export function wordPlan(word: Word): AssessmentPlan {
  return { mode: 1, ref: word.hanzi, pronunciation: word.syllables };
}
export function questionPlan(q: Question, bank: Bank, word?: Word): AssessmentPlan {
  const target = q.kind === 'C' ? q.target : word?.syllables.length === 1 ? word.syllables[0] : null;
  if (!target) return wordPlan(word!);
  // Contrast branches address consonant confusions only. Tone alternatives never use mode 6.
  const pair = bank.confusions
    .flatMap((c) => c.minimalPairs.map((ids) => ({ c, ids })))
    .find(
      ({ ids }) =>
        ids.includes(target) &&
        ids.length === 2 &&
        ids.every((id) => {
          const a = parseSyllable(target),
            b = parseSyllable(id);
          return a && b && a.final === b.final && a.tone === b.tone;
        }) &&
        new Set(ids.map((id) => parseSyllable(id)?.initial)).size === 2,
    );
  if (pair) {
    const plans = pair.ids.map((id) => syllablePlan(id, bank));
    if (plans.every((p) => p.mode === 1 && p.ref.length === 1))
      return {
        mode: 6,
        ref: plans.map((p) => p.ref).join('|'),
        branches: { syllables: pair.ids, target: pair.ids.indexOf(target), confusion: pair.c.pair.join('|') },
      };
  }
  return q.kind === 'C' ? syllablePlan(target, bank) : wordPlan(word!);
}
