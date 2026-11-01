/**
 * Test-only exposure collector (spec §8.3 / V6): lives next to the TESTS, never imported by the control.
 * exposedNumerals(markup, css): every numeral a child (or a screen reader, or Playwright) can read from the number-line markup:
 * text nodes, <title>/<desc>, EVERY attribute except a declared geometry allow-list, plus `content:` / attr() in the control's CSS.
 * Numeral = Arabic / full-width digits, or Chinese numeral characters (零〇一二两三四五六七八九十百千).
 */
export const GEOMETRY_ATTRS = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'viewBox', 'width', 'height', 'style', 'fill', 'stroke', 'opacity', 'role']);   // class / id are NOT exempt
const NUM = /[0-9０-９]+|[零〇一二两三四五六七八九十百千]+/g;
const nums = (s: string): string[] => String(s).match(NUM) ?? [];

export function exposedNumerals(markup: string, css = ''): { main: Set<string>; feedback: Set<string> } {
  const main = new Set<string>(); const feedback = new Set<string>();
  const stack: { name: string; fb: boolean }[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup))) {
    if (m[5] !== undefined) { const inFb = stack.some((t) => t.fb); for (const n of nums(m[5])) (inFb ? feedback : main).add(n); continue; }
    const [, closing, name, attrs, selfClose] = m;
    if (closing) { stack.pop(); continue; }
    const fb = /data-phase="feedback"/.test(attrs) || stack.some((t) => t.fb);
    for (const a of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      const [, an, av] = a;
      if (GEOMETRY_ATTRS.has(an)) continue;
      for (const n of nums(av)) (fb ? feedback : main).add(n);
    }
    if (/aria-value(now|min|max)/.test(attrs)) main.add('aria-value*');
    if (!selfClose) stack.push({ name, fb });
  }
  const cssHits = [...css.matchAll(/content\s*:\s*([^;}]*)/g)].filter((c) => /\d|attr\(|[零〇一二两三四五六七八九十百千]/.test(c[1]));
  if (cssHits.length || /attr\(/.test(css)) main.add('css-content');
  return { main, feedback };
}
export const setKey = (s: Set<string>): string => [...s].sort().join(',');
