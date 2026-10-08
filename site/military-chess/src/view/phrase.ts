/**
 * Phrase-aware line breaking for Chinese captions (QA r2 minor: "翻到地雷 / 了：它不会动",
 * "扛到了 / 军旗", "大 / 官"). A text is cut into chunks that must not break inside:
 *  - short clauses (≤ 8 characters up to a punctuation mark) stay whole;
 *  - longer clauses break only between words (Intl.Segmenter when available, else 2-character
 *    chunks), with trailing particles (了 的 吗 …) and punctuation glued to the word before.
 * The caller wraps each chunk in `.mc-nb` (white-space: nowrap); the line may break between chunks.
 */
const PUNCT = /[，。！？：；、,.!?:;…）)」』”]/;
const PARTICLE = /^[了的吗呢吧啦们着过呀哦嘛]$/;
const SHORT = 8;

type Seg = { segment(t: string): Iterable<{ segment: string }> };
let seg: Seg | null | undefined;
function segmenter(): Seg | null {
  if (seg !== undefined) return seg;
  try {
    const S = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => Seg }).Segmenter;
    seg = S ? new S('zh', { granularity: 'word' }) : null;
  } catch {
    seg = null;
  }
  return seg;
}

function words(clause: string): string[] {
  const s = segmenter();
  const raw = s ? [...s.segment(clause)].map((x) => x.segment) : clause.match(/.{1,2}/gu) ?? [clause];
  // single characters pair up ("大"+"官", "三"+"个"): the segmenter splits short nouns it does not know
  const paired: string[] = [];
  const single = (w: string | undefined) => !!w && [...w].length === 1 && !PUNCT.test(w) && !PARTICLE.test(w) && !/\s/.test(w);
  for (let i = 0; i < raw.length; i++) {
    if (single(raw[i]) && single(raw[i + 1])) {
      paired.push(raw[i] + raw[i + 1]);
      i++;
    } else paired.push(raw[i]);
  }
  const out: string[] = [];
  for (const w of paired) {
    if (out.length && (PUNCT.test(w) || PARTICLE.test(w) || /^\s+$/.test(w))) out[out.length - 1] += w;
    else out.push(w);
  }
  return out;
}

/** `short`: clauses up to this many characters stay whole (narrow boxes pass a smaller number) */
export function phraseChunks(text: string, short = SHORT): string[] {
  const clauses: string[] = [];
  let cur = '';
  for (const ch of text) {
    cur += ch;
    if (PUNCT.test(ch) || ch === ' ') {
      clauses.push(cur);
      cur = '';
    }
  }
  if (cur) clauses.push(cur);
  // punctuation runs ("！？") stay on the clause before
  const merged: string[] = [];
  for (const c of clauses) {
    if (merged.length && [...c].every((ch) => PUNCT.test(ch) || ch === ' ')) merged[merged.length - 1] += c;
    else merged.push(c);
  }
  const out: string[] = [];
  for (const c of merged) {
    if ([...c].length <= short) out.push(c);
    else out.push(...words(c));
  }
  return out;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML: every chunk in an unbreakable span */
export function phraseWrap(text: string, short = SHORT): string {
  return phraseChunks(text, short).map((c) => `<span class="mc-nb">${esc(c)}</span>`).join('');
}

/**
 * Narrow boxes (phone 战报 moment cards): chunks of at most `cpl` characters — a longer word is cut —
 * so no unbreakable span is wider than the box. Returns the chunks (the caller wraps them).
 */
export function narrowChunks(text: string, cpl: number): string[] {
  const out: string[] = [];
  for (const c of phraseChunks(text, Math.min(SHORT, cpl))) {
    const ch = [...c];
    for (let i = 0; i < ch.length; i += cpl) out.push(ch.slice(i, i + cpl).join(''));
  }
  return out;
}

/** lines a greedy wrap of `chunks` takes at `cpl` characters per line */
export function chunkLines(chunks: string[], cpl: number): number {
  let lines = 1, cur = 0;
  for (const c of chunks) {
    const n = [...c].length;
    if (cur && cur + n > cpl) {
      lines++;
      cur = 0;
    }
    cur += n;
  }
  return lines;
}

export function chunksHtml(chunks: string[]): string {
  return chunks.map((c) => `<span class="mc-nb">${esc(c)}</span>`).join('');
}
