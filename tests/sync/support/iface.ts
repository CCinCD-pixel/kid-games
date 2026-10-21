// iface.ts — a small, dependency-free reader of TypeScript `interface X { ... }` / `type X = { ... }` declarations: returns the member names (recursing into inline object types).
// It exists for the DRIFT test: a field added to a save type must get a merge rule (or be explicitly local), and a rule for a field the type no longer has is stale.
// Deliberately not a full TS parser: members are separated by `;` `,` or a newline at depth 0 and anything that is not an inline `{...}` object is opaque (null).
import fs from 'node:fs';

/** member name -> nested tree (inline object type) | raw type text (anything else) */
export type FieldTree = { [key: string]: FieldTree | string };
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

function skipWs(s: string, i: number): number { while (i < s.length && /\s/.test(s[i]!)) i++; return i; }
/** index just after the member whose type starts at i (depth-aware); stops at `;` `,` or a newline that is not followed by a continuation (`|`, `&`) */
function endOfType(s: string, i: number): number {
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i]!;
    if (c === '=' && s[i + 1] === '>') { i++; continue; }
    if ('{[(<'.includes(c)) depth++;
    else if ('}])>'.includes(c)) { if (depth === 0) return i; depth--; }
    else if (depth === 0 && (c === ';' || c === ',')) return i;
    else if (depth === 0 && c === '\n') { const j = skipWs(s, i); if (s[j] !== '|' && s[j] !== '&' && !/[|&]\s*$/.test(s.slice(Math.max(0, i - 3), i))) return i; }
  }
  return i;
}
function parseBlock(s: string, open: number): { tree: FieldTree; end: number } {
  const tree: FieldTree = {}; let i = open + 1;
  for (;;) {
    i = skipWs(s, i); while (s[i] === ';' || s[i] === ',') i = skipWs(s, i + 1);
    if (i >= s.length || s[i] === '}') return { tree, end: i + 1 };
    const m = /^(?:readonly\s+)?(?:\[\s*\w+\s*:\s*\w+\s*\]|([A-Za-z_$][\w$]*)|'([^']+)'|"([^"]+)"|(\d+))(\?)?\s*:/.exec(s.slice(i, i + 200));
    if (!m) { i = endOfType(s, i) + 1; continue; }   // method / call signature / unparseable: skip
    const key = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '*';
    i += m[0].length; i = skipWs(s, i);
    if (s[i] === '{') {
      const inner = parseBlock(s, i); const j = skipWs(s, inner.end);
      if (j >= s.length || s[j] === ';' || s[j] === ',' || s[j] === '}' || s[j] === '\n' || /[\n]/.test(s.slice(inner.end, j))) { tree[key] = inner.tree; i = inner.end; continue; }
      const e2 = endOfType(s, inner.end); tree[key] = s.slice(i, e2).replace(/\s+/g, ' ').trim(); i = e2; continue;   // `{...}[]`, `{...} | null`: opaque
    }
    const e = endOfType(s, i); tree[key] = s.slice(i, e).replace(/\s+/g, ' ').trim(); i = e;
  }
}
/** member tree of `interface name` / `type name = {…}` in the given source text; throws when the declaration is not found */
export function interfaceTree(src: string, name: string): FieldTree {
  const s = stripComments(src);
  const re = new RegExp(`(?:interface\\s+${name}\\b[^{=]*|type\\s+${name}\\b\\s*(?:<[^=]*>)?\\s*=\\s*)\\{`);
  const m = re.exec(s); if (!m) throw new Error(`interface ${name} not found`);
  return parseBlock(s, m.index + m[0].length - 1).tree;
}
export const readSrc = (relFromRepo: string): string => fs.readFileSync(new URL(`../../../${relFromRepo}`, import.meta.url), 'utf8');

/** parse a standalone `{ ... }` object type literal */
export function parseObjectLiteral(text: string): FieldTree { const t = stripComments(text); const i = t.indexOf('{'); return i < 0 ? {} : parseBlock(t, i).tree; }
/** resolve a member's raw type text to a field tree: `Record<K, X>` -> X, `{…}` -> parsed, `Name` -> lookup(Name); anything else (arrays, unions, primitives) -> null */
export function resolveType(text: string, lookup: (name: string) => FieldTree | null): FieldTree | null {
  const t = text.trim();
  const rec = /^Record<\s*[^,<>]+,\s*([\s\S]+)>$/.exec(t); if (rec) return resolveType(rec[1]!, lookup);
  if (t.startsWith('{') && t.endsWith('}')) return parseObjectLiteral(t);
  if (/^[A-Za-z_$][\w$]*$/.test(t)) return lookup(t);
  return null;
}
