/**
 * Heavy content check (spec §8.10 books.heavy, §9.2): rebuild every reply book with the TS code and
 * compare it with the repository file (= the prototype's book); the mirror twin's rebuilt book must be
 * the mirrored book; `staticHopeless` must be sound on every 学堂 static position after 1–2 RED moves
 * (each "hopeless" position has no forced win at all). On success writes content/military-chess/stamp.json.
 *   MC_HEAVY=1 npx vitest run -c tools/military-chess/vitest.heavy.config.ts books
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { buildBook, canonBook, mirrorBook, type Book } from '../../site/military-chess/src/core/book';
import { buildPuzzleState, mirrorPuzzle, redMoves, staticHopeless, PASS, type PuzzleDef } from '../../site/military-chess/src/core/puzzle';
import { distToWin } from '../../site/military-chess/src/core/solver';
import { apply } from '../../site/military-chess/src/core/rules';
import { STAMP_PATH, STAMP_SOURCES, contentFiles, hashFiles, type Stamp } from './stamp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(os.homedir(), 'kid-games-work/military-chess');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

type P = PuzzleDef & { id: string; par: number; book?: string; type?: string; blue_moves?: 'static' | 'best' };

describe.skipIf(!process.env.MC_HEAVY)('books (heavy)', () => {
  const endgames = read('content/military-chess/endgames.json').puzzles as P[];
  const items = (read('content/military-chess/lessons.json').lessons as Array<{ items: P[] }>).flatMap((l) => l.items);
  const withBooks: P[] = [...endgames, ...items.filter((i) => i.book)];
  const log: string[] = [];
  let ok = true;

  test('17 books rebuilt = the repository books; the twins rebuild to the mirrored books', () => {
    expect(withBooks.length).toBe(17);
    for (const pz of withBooks) {
      const t0 = Date.now();
      const file = read(`content/military-chess/${pz.book}`) as Book;
      const { root, stats } = buildBook(pz, pz.par);
      const exact = JSON.stringify(root) === JSON.stringify(file.root);
      const canon = JSON.stringify(canonBook(root)) === JSON.stringify(canonBook(file.root));
      const tw = buildBook(mirrorPuzzle(pz), pz.par).root;
      const mirror = JSON.stringify(canonBook(tw)) === JSON.stringify(canonBook(mirrorBook(file.root)));
      const line = `${pz.id}: exact ${exact} canon ${canon} mirror ${mirror} entries ${stats.entries} nodes ${stats.nodes} (${((Date.now() - t0) / 1000).toFixed(1)} s)`;
      log.push(line);
      console.log(line);
      if (!canon || !mirror) ok = false;
      expect(canon, pz.id).toBe(true);
      expect(mirror, pz.id + ' twin').toBe(true);
    }
  });

  test('staticHopeless is sound on every static lesson position after 1–2 RED moves', () => {
    let positions = 0, hopeless = 0, wrong = 0;
    for (const pz of items.filter((i) => i.type === 'board' && i.blue_moves !== 'best')) {
      const s0 = buildPuzzleState(pz);
      const walk = (s: ReturnType<typeof buildPuzzleState>, depth: number): void => {
        for (const m of redMoves(s)) {
          const a = apply(s, m).state;
          if (a.result) continue;
          const b = apply(a, PASS).state;
          positions++;
          if (staticHopeless(pz, s0, b)) {
            hopeless++;
            if (distToWin(pz, s0, b, 8) <= 8) wrong++;
          } else if (depth < 2) walk(b, depth + 1);
        }
      };
      walk(s0, 1);
    }
    const line = `staticHopeless: ${positions} positions, ${hopeless} hopeless, ${wrong} wrong`;
    log.push(line);
    console.log(line);
    if (wrong) ok = false;
    expect(wrong).toBe(0);
  }, 3_600_000);

  test('write the content stamp', () => {
    expect(ok).toBe(true);
    const stamp: Stamp = {
      src: hashFiles(ROOT, STAMP_SOURCES),
      content: hashFiles(ROOT, contentFiles(ROOT)),
      at: new Date().toISOString(),
      books: withBooks.length,
      note: 'written by tools/military-chess/books.heavy.test.ts after every book rebuilt identically; re-run it when core/{rules,movegen,combat,board,puzzle,solver,policy,book}.ts change',
    };
    fs.writeFileSync(path.join(ROOT, STAMP_PATH), JSON.stringify(stamp, null, 1) + '\n');
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `books-heavy-${stamp.at.slice(0, 10)}.txt`), log.join('\n') + '\n');
  });
});
