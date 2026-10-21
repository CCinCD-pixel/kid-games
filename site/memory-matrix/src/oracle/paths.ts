import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const OUT = path.join(ROOT, 'content', 'memory-matrix');          // levels.json (the windows the golden fixtures need) lives here
export const GOLDEN = path.join(ROOT, 'tests', 'memory-matrix', 'golden');
export const FIXTURES = GOLDEN;
export const REPORTS = path.join(process.env.HOME ?? '', 'kid-games-work', 'mm-reports');
