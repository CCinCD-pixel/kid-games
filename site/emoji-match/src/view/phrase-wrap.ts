/**
 * Subtitle line breaks at phrase boundaries (QA r2): the kit writes a line as plain text or as one span
 * per character (word timings). In the narrow landscape lane (~230 px) the browser broke inside words
 * (没 / 有) and left a lone 。 on its own row. This groups the line into phrases that end at punctuation;
 * each phrase is an inline-block, so it moves to the next row as a whole (a phrase longer than the lane
 * still wraps inside itself). The kit's per-character spans are moved, not recreated, so its word
 * highlighting keeps working. Local helper (kit request: phrase-aware subtitle wrapping).
 */
const END = /[，。！？：；、,.!?:;…）)」』”]/;

export function phraseWrap(text: HTMLElement): void {
  if (text.querySelector(':scope > .em-ph')) return;
  const nodes = [...text.childNodes];
  if (!nodes.length) return;
  const out: HTMLElement[] = [];
  let cur: HTMLElement | null = null;
  const take = (n: Node, ch: string) => {
    if (!cur) { cur = document.createElement('span'); cur.className = 'em-ph'; out.push(cur); }
    cur.append(n);
    if (END.test(ch)) cur = null;
  };
  for (const n of nodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      for (const ch of [...(n.textContent ?? '')]) take(document.createTextNode(ch), ch);
    } else take(n, (n.textContent ?? '').slice(-1));
  }
  // a trailing closing punctuation never starts a row by itself (already attached above)
  text.replaceChildren(...out);
}

/** watch the kit subtitle bar and wrap every new line */
export function installPhraseWrap(bar: HTMLElement): void {
  const text = bar.querySelector<HTMLElement>('.kit-subtitle__text');
  if (!text) return;
  new MutationObserver(() => phraseWrap(text)).observe(text, { childList: true });
}
