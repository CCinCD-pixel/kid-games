/**
 * QA fix-mars-r2 BLOCKER 2: stages/array.ts had `bar.replaceChildren();` at the END of a trailing `//` comment, so the call never ran and every tap piled another row of
 * buttons onto the control bar. No type check, no layout audit and no unit test could see it. This lint fails on ANY statement that sits inside a trailing `//` comment
 * (a comment that ends with a call or an assignment followed by `;`), in the game, its stages and the manipulative engines. The DOM-stability counterpart (tap N times ->
 * element count constant) is e2e/stability.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIRS = ['site/mars-base/src', 'site/mars-base/e2e', 'site/mars-base/validate', 'engines/manip', 'tools/mars-base'];

/** index of the first `//` that opens a comment (outside '…', "…", `…` and /…/ regex literals), or -1 */
export function commentStart(line: string): number {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '/' && line[i + 1] === '/') return i;
    if (ch === '/' && line[i + 1] !== '*') {   // a regex literal: skip to its closing slash when it clearly is one (after an operator / opening bracket)
      const before = line.slice(0, i).trimEnd(); if (before === '' || /[=(,:;!&|?{}[]$/.test(before) || /\b(return|typeof)$/.test(before)) { let j = i + 1; let cls = false; for (; j < line.length; j++) { const c = line[j]; if (c === '\\') j++; else if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) break; } if (j < line.length) i = j; }
    }
  }
  return -1;
}
const CALL = /[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\([^;]*\)\s*;\s*$/;   // foo.bar(x);   at the end of the comment
const ASSIGN = /(?:^|[\s,(])[A-Za-z_$][\w$.]*(?:\[[^\]]*\])?\s*(?:[-+*/|&]|\?\?)?=\s*[^=>\s][^;]*;\s*$/;   // x = y;   x.y += 1;   at the end of the comment
/** a trailing comment that ends in a statement = code that was swallowed by the comment */
export function swallowed(line: string): string | null {
  const i = commentStart(line); if (i < 0) return null;
  if (line.slice(0, i).trim() === '') return null;   // a comment-only line is a comment
  const text = line.slice(i + 2).trim();
  if (text.includes('://') || /^(@ts-|eslint|prettier|#|\/)/.test(text) || /^[-=]{2,}/.test(text)) return null;
  return CALL.test(text) || ASSIGN.test(text) ? text : null;
}

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.(ts|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []));

describe('no code swallowed by a trailing // comment', () => {
  it('the lint itself: catches the array.ts bug, ignores comments, strings, URLs and regexes', () => {
    expect(swallowed("    const bw = c.w - 16, bh = Math.max(60, c.h - (kind === 'open' ? 224 : 130));   // 'open' also holds the list of found boards under the picture bar.replaceChildren();")).toContain('bar.replaceChildren();');
    expect(swallowed('  x = 1;   // then reset the counter n = 0;')).toBeTruthy();
    expect(swallowed("  let auto = false;   // auto: the ghost play is running (a note) let tool = 'take'; let u = unitOf(c.w, c.h);")).toBeTruthy();   // the second time this bug class bit while fixing the first
    expect(swallowed('  foo();   // the picture is redrawn')).toBeNull();
    expect(swallowed("  const u = 'http://a.b/c(1);';")).toBeNull();
    expect(swallowed("  const re = /a\\/\\/b(1);/; // fine")).toBeNull();
    expect(swallowed('  // bar.replaceChildren();')).toBeNull();   // a whole-line comment is deliberate
    expect(swallowed('  foo();   // see https://example.com/x(1);')).toBeNull();
    expect(swallowed('  s.a = 1;   // (a 3-way split, see 8.2)')).toBeNull();
    expect(commentStart("a = '//' + b; // c")).toBe(14);
  });
  it('no source file of the game, its tests or the manipulative engines has a statement inside a trailing comment', () => {
    const bad: string[] = [];
    for (const d of DIRS) for (const f of walk(path.join(ROOT, d))) {
      if (f.endsWith('stage-lint.test.ts')) continue;
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { const s = swallowed(line); if (s) bad.push(`${path.relative(ROOT, f)}:${i + 1}: swallowed "${s.slice(0, 80)}"`); });
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('stages/array.ts empties the control bar on its own line, once per render', () => {
    const src = fs.readFileSync(path.join(ROOT, 'site/mars-base/src/stages/array.ts'), 'utf8').split('\n');
    const at = src.findIndex((l) => /^\s*bar\.replaceChildren\(\);\s*$/.test(l)); expect(at, 'bar.replaceChildren(); on its own line').toBeGreaterThan(-1);
    const fn = src.findIndex((l) => /function render\(\)/.test(l)); expect(at - fn).toBeLessThan(6);
    const firstAppend = src.findIndex((l, i) => i > fn && /bar\.append/.test(l)); expect(at).toBeLessThan(firstAppend);
  });
});
