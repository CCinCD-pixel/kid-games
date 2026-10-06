/**
 * Gate A7 (spec §10.1): no emoji characters on any page of the game — gems, icons and badges are drawn
 * in code. Scans every displayed-text source: content/emoji-match/*.json and site/emoji-match/src/**
 * (.ts/.css with comments blanked; the pre-2026-10 page under src/legacy/ is not part of the new game).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [path.join(HERE, '../src'), path.join(HERE, '../../../content/emoji-match')];
const PICTO = /\p{Extended_Pictographic}/gu;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'legacy' ? [] : files(p);
    return /\.(ts|css|json)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}
/** blank comments but keep line breaks, so reported line numbers match the file */
const stripComments = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('A7 no emoji', () => {
  it('no pictographic character in any displayed-text source', () => {
    const hits: string[] = [];
    for (const f of ROOTS.flatMap(files)) {
      const raw = fs.readFileSync(f, 'utf8');
      const text = f.endsWith('.json') ? raw : stripComments(raw);
      text.split('\n').forEach((line, i) => { const m = line.match(PICTO); if (m) hits.push(`${path.relative(HERE, f)}:${i + 1} ${m.join('')}`); });
    }
    expect(hits).toEqual([]);
  });
});
