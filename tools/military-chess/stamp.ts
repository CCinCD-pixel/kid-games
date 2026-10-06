/**
 * Content stamp (spec §8.11): the reply books and the lesson solutions are a function of the rules,
 * the solver and BLUE's reply policy. `src` hashes those source files; `content` hashes the content
 * files. books.heavy.test.ts writes content/military-chess/stamp.json after a full rebuild matched;
 * the fast stamp.test.ts recomputes `src` and fails when the code changed since.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STAMP_SOURCES = ['rules', 'movegen', 'combat', 'board', 'puzzle', 'solver', 'policy', 'book'].map((f) => `site/military-chess/src/core/${f}.ts`);
export const STAMP_PATH = 'content/military-chess/stamp.json';

const norm = (s: string): string => s.replace(/\r\n/g, '\n');

export function hashFiles(root: string, files: readonly string[]): string {
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f + '\n');
    h.update(norm(fs.readFileSync(path.join(root, f), 'utf8')));
    h.update('\n');
  }
  return h.digest('hex').slice(0, 16);
}

export function contentFiles(root: string): string[] {
  const books = fs.readdirSync(path.join(root, 'content/military-chess/books')).filter((f) => f.endsWith('.json')).sort().map((f) => `content/military-chess/books/${f}`);
  return ['content/military-chess/lessons.json', 'content/military-chess/endgames.json', ...books];
}

export interface Stamp {
  src: string;
  content: string;
  at: string;
  books: number;
  note: string;
}
