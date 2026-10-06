/**
 * Phrase-aware line breaking for short Chinese subtitles (QA r1: narrow landscape column broke
 * lines mid-word and left one-character widows such as 撤多了，可以点重/做).
 * The text is cut into words with `Intl.Segmenter` (zh), punctuation sticks to the word before it,
 * and each word becomes a `white-space: nowrap` span: a line can only break between words. The
 * container uses `text-wrap: balance` (styles.css), so two-line captions split evenly. Without
 * Intl.Segmenter the plain text is used (the browser's normal CJK breaking).
 */
const PUNCT = /^[\s，。！？、：；…—·“”‘’（）《》「」,.!?:;'"()-]+$/u;

type Seg = { segment: string; isWordLike?: boolean };
type SegmenterCtor = new (loc: string, o: { granularity: 'word' }) => { segment(t: string): Iterable<Seg> };

function segmenter(): { segment(t: string): Iterable<Seg> } | null {
  const S = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (!S) return null;
  try {
    return new S('zh-CN', { granularity: 'word' });
  } catch {
    return null;
  }
}

let seg: ReturnType<typeof segmenter> | undefined;

/** Game words that never break across lines (the child's name, the props he taps). */
const KEEP = ['小步步', '推箱子', '发射台', '领航员', '侦探题', '小推', '星港', '撤销', '重做', '重来', '天宫', '月宫', '火星'];
const END_PUNCT = /[，。！？、：；…]$/u;

/**
 * Words of `text`: punctuation sticks to the word before it (opening quotes to the next); a lone
 * character joins the word before it (放大|镜 → 放大镜) — or, after punctuation / at the start /
 * when it begins a KEEP word, the word after it (推|不出来了 → 推不出来了); a KEEP word is never split.
 */
export function phraseUnits(text: string): string[] | null {
  if (seg === undefined) seg = segmenter();
  if (!seg) return null;
  const keep: [number, number][] = [];
  for (const k of KEEP) for (let i = text.indexOf(k); i >= 0; i = text.indexOf(k, i + 1)) keep.push([i, i + k.length]);
  const inside = (b: number) => keep.some(([a, z]) => a < b && b < z);
  const starts = (b: number) => keep.some(([a]) => a === b);
  const units: string[] = [];
  const len = (x: string) => [...x].length;
  let carry = '';
  let pos = 0;
  for (const s of seg.segment(text)) {
    const t = s.segment;
    const at = pos;
    pos += t.length;
    const last = units.length - 1;
    const prev = last >= 0 ? units[last] : '';
    if (PUNCT.test(t)) {
      if (/^[“‘（《「(]+$/u.test(t)) carry += t;
      else if (carry) {
        units.push(carry + t);
        carry = '';
      } else if (prev) units[last] = prev + t;
      else carry += t;
      continue;
    }
    // 1) a KEEP word is never split
    if (inside(at)) {
      if (carry || !prev) carry += t;
      else units[last] = prev + t;
      continue;
    }
    // 2) a lone character joins its neighbour
    if (len(t) === 1) {
      if (carry) {
        if (len(carry) >= 4) {
          units.push(carry);
          carry = t;
        } else carry += t;
      } else if (prev && !starts(at) && len(prev) < 5 && !END_PUNCT.test(prev)) units[last] = prev + t;
      else carry = t;
      continue;
    }
    // 3) a word
    units.push(carry + t);
    carry = '';
  }
  if (carry) {
    const last = units.length - 1;
    if (last >= 0 && len(carry) === 1 && !END_PUNCT.test(units[last])) units[last] += carry;
    else units.push(carry);
  }
  return units;
}

/** Fill `el` with `text`, breakable only between words (textContent stays exactly `text`). */
export function setPhraseText(el: HTMLElement, text: string): void {
  const units = phraseUnits(text);
  if (!units || units.length < 2) {
    el.textContent = text;
    return;
  }
  el.textContent = '';
  for (const u of units) {
    const span = document.createElement('span');
    span.className = 'sok-w';
    span.textContent = u;
    el.append(span);
  }
}
