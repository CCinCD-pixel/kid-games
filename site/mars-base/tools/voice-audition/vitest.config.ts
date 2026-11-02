import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// Own vitest config for the voice-audition metrics (not part of `npm run check`).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export default defineConfig({ root: ROOT, test: { environment: 'node', include: ['site/mars-base/tools/voice-audition/*.audit.ts'], pool: 'threads', maxWorkers: 1, testTimeout: 300000 } });
