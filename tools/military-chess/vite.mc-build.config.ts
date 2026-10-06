/**
 * Build ONLY the 陆战棋 page (budget check, spec §8.6: main ≤ 160 KB gzip, Worker ≤ 40 KB gzip,
 * reply books loaded on demand) into ~/kid-games-work/military-chess/dist — never into the repo's
 * dist/. The root config's aliases and target, one input, no registry / service-worker plugins.
 *   npx vite build --config tools/military-chess/vite.mc-build.config.ts
 *   npx vite preview --config tools/military-chess/vite.mc-build.config.ts --port 5313 --strictPort
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(os.homedir(), 'kid-games-work/military-chess/dist');

export default defineConfig({
  root: path.join(ROOT, 'site'),
  publicDir: path.join(ROOT, 'public'),
  appType: 'mpa',
  resolve: { alias: { '@kit': path.join(ROOT, 'kit'), '@engines': path.join(ROOT, 'engines') } },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    target: 'safari16',
    rolldownOptions: { input: { 'military-chess': path.join(ROOT, 'site/military-chess/index.html') } },
  },
  preview: { host: false },
});
