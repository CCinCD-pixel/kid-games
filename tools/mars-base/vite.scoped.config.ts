/**
 * SCOPED production build of 火星基地 only (no hub, no other game): same transforms, aliases, public dir and service worker as the root
 * vite.config.ts, but one page and an output OUTSIDE the repo (~/kid-games-work/mars-dist), so QA never needs the root build.
 *   npx vite build   --config tools/mars-base/vite.scoped.config.ts
 *   npx vite preview --config tools/mars-base/vite.scoped.config.ts --port 5323 --strictPort
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
// @ts-expect-error -- plain ESM helper with JSDoc types
import { buildServiceWorker } from '../sw/build-sw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(os.homedir(), 'kid-games-work/mars-dist');

export default defineConfig({
  root: path.join(ROOT, 'site'),
  publicDir: path.join(ROOT, 'public'),
  appType: 'mpa',
  resolve: { alias: { '@kit': path.join(ROOT, 'kit'), '@engines': path.join(ROOT, 'engines') } },
  // advancedChunks 'kit' = the chunk every game shares in the root build (budget §8.6 excludes it)
  build: { outDir: OUT, emptyOutDir: true, target: 'safari16', rolldownOptions: { input: { 'mars-base': path.join(ROOT, 'site/mars-base/index.html') }, output: { advancedChunks: { groups: [{ name: 'kit', test: /[\\/](kit|node_modules)[\\/]/ }] } } } },
  server: { host: true, fs: { allow: [ROOT] } },
  preview: { host: true, port: 5323 },
  plugins: [{
    name: 'scoped-sw',
    apply: 'build',
    closeBundle() {
      // the SW builder insists that "/" exists: a stub stands in for the hub
      fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><title>scoped build</title>');
      const sw = buildServiceWorker(OUT, [{ href: '/mars-base/' }]);
      this.info(`scoped sw.js ${sw.version}: ${sw.precacheCount} precached, ${sw.mediaCount} media`);
    },
  }],
});
