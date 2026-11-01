// Where the oracle reads and writes. Master copy (~/kid-games-work/specs/memory-tools): everything next to the scripts. Repo mirror
// (tools/memory-matrix/proto): reports go to ~/kid-games-work/mm-reports (never into the repo) and the golden fixtures live in tests/memory-matrix/golden.
import os from 'node:os';
import path from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
export const IN_REPO = here.includes('/tools/memory-matrix/proto');
export const OUT = process.env.MM_OUT || (IN_REPO ? path.join(os.homedir(), 'kid-games-work', 'mm-reports') : here);
export const GOLDEN = process.env.MM_GOLDEN || (IN_REPO ? path.join(here, '..', '..', '..', 'tests', 'memory-matrix', 'golden') : path.join(here, 'golden'));
export const FIXTURES = IN_REPO ? GOLDEN : path.join(here, 'fixtures');      // veteran-cases.json lives with the other golden files in the repo
export const HERE = here;
