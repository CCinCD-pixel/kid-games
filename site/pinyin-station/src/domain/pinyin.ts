import type { Bank } from './types';

const VALID: Record<string, string> = {
  '': 'a o e i u v ai ei ao ou an en ang eng er',
  b: 'a o ai ei ao an en ang eng i ie iao ian in ing u',
  p: 'a o ai ei ao ou an en ang eng i ie iao ian in ing u',
  m: 'a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u',
  f: 'a o ei ou an en ang eng u', d: 'a e ai ei ao ou an en ang eng i ia ie iao iu ian ing ong u uo ui uan un',
  t: 'a e ai ao ou an ang eng i ie iao ian ing ong u uo ui uan un',
  n: 'a e ai ei ao ou an en ang eng i ie iao iu ian in iang ing ong u uo uan v ve',
  l: 'a o e ai ei ao ou an ang eng i ia ie iao iu ian in iang ing ong u uo uan un v ve',
  g: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  k: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  h: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  j: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  q: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  x: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  z: 'a e ai ei ao ou an en ang eng i ong u uo ui uan un',
  c: 'a e ai ao ou an en ang eng i ong u uo ui uan un',
  s: 'a e ai ao ou an en ang eng i ong u uo ui uan un',
  zh: 'a e ai ei ao ou an en ang eng i ong u ua uo uai ui uan un uang',
  ch: 'a e ai ao ou an en ang eng i ong u ua uo uai ui uan un uang',
  sh: 'a e ai ei ao ou an en ang eng i u ua uo uai ui uan un uang',
  r: 'e ao ou an en ang eng i ong u uo ui uan un',
  y: 'a ao e an ang i in ing ong ou u ue uan un', w: 'a o ai ei an en ang eng u',
};
export function parseSyllable(id: string) {
  const m = /^(zh|ch|sh|[bpmfdtnlgkhjqxzcsryw]?)([a-zv]+)([0-4])$/.exec(id);
  if (!m || !(VALID[m[1]] ?? '').split(' ').includes(m[2])) return null;
  return { initial: m[1], final: m[2], tone: Number(m[3]) };
}
export function displayPinyin(id: string): string {
  const m = /^(.+)([0-4])$/.exec(id);
  if (!m) return id;
  const raw = m[1].replaceAll('v', 'ü'), tone = Number(m[2]);
  if (!tone) return raw;
  const index = raw.includes('a') ? raw.indexOf('a') : raw.includes('e') ? raw.indexOf('e') : raw.includes('o') ? raw.indexOf('o') : Math.max(raw.lastIndexOf('i'), raw.lastIndexOf('u'), raw.lastIndexOf('ü'));
  const forms: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', o: 'ōóǒò', i: 'īíǐì', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
  return index < 0 ? raw : raw.slice(0, index) + forms[raw[index]][tone - 1] + raw.slice(index + 1);
}
export function validateBank(b: Bank): string[] {
  const errors: string[] = [], ids = new Set(b.syllables.map(s => s.id));
  for (const s of b.syllables) {
    if (!parseSyllable(s.id)) errors.push(`illegal syllable: ${s.id}`);
    if (displayPinyin(s.id) !== s.display) errors.push(`display: ${s.id}`);
    if (!s.audio) errors.push(`audio: ${s.id}`);
  }
  if (ids.size !== b.syllables.length) errors.push('duplicate syllables');
  for (const w of b.words) {
    if (!w.picture || !w.syllables.length) errors.push(`word media: ${w.id}`);
    if (w.syllables.map(displayPinyin).join(' ') !== w.display) errors.push(`word display: ${w.id}`);
    for (const id of w.syllables) {
      if (!ids.has(id)) errors.push(`missing ${w.id}: ${id}`);
      if (!w.beyond && (b.syllables.find(s => s.id === id)?.lesson ?? 99) > w.lesson) errors.push(`lesson: ${w.id}`);
    }
  }
  for (const c of b.confusions) for (const pair of c.minimalPairs) for (const id of pair) if (!ids.has(id)) errors.push(`pair: ${id}`);
  return errors;
}
