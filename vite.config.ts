/**
 * One Vite multi-page build for the whole site.
 *   root      site/            directory = URL (site/chess/index.html → /chess/)
 *   outDir    dist/            what Netlify publishes
 *   publicDir public/          copied verbatim (manifest, icons, audio, models, fonts)
 * Every site/**\/index.html is an entry — no hand-maintained list. The game registry
 * (site/<id>/game.json) feeds the hub (virtual:kg-registry), dist/sw.js and dist/_redirects.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error -- plain ESM helper with JSDoc types
import { buildHeaders, buildRedirects, findPages, hubEntries, loadRegistry, renderHub, SITE_DIR } from './tools/registry.mjs';
// @ts-expect-error -- plain ESM helper with JSDoc types
import { buildServiceWorker } from './tools/sw/build-sw.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VIRTUAL_REGISTRY = 'virtual:kg-registry';
const HUB_PLACEHOLDER = '<!-- kg:hub -->';
const RESOLVED_REGISTRY = '\0' + VIRTUAL_REGISTRY;

function pageInputs(): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const rel of findPages(SITE_DIR) as string[]) {
    const dir = path.posix.dirname(rel);
    inputs[dir === '.' ? 'hub' : dir] = path.join(SITE_DIR, rel);
  }
  return inputs;
}

function kidGamesSite(): Plugin[] {
  let outDir = path.join(ROOT, 'dist');
  return [
    {
      name: 'kg-registry',
      resolveId(id) {
        return id === VIRTUAL_REGISTRY ? RESOLVED_REGISTRY : null;
      },
      load(id) {
        if (id !== RESOLVED_REGISTRY) return null;
        return `export default ${JSON.stringify(hubEntries(loadRegistry()), null, 2)};`;
      },
      // The hub's card list is rendered into site/index.html at build (and dev) time.
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          if (ctx.path !== '/index.html' || !html.includes(HUB_PLACEHOLDER)) return html;
          return html.replace(HUB_PLACEHOLDER, renderHub(loadRegistry()));
        },
      },
      configureServer(server) {
        server.watcher.add(path.join(SITE_DIR, '*/game.json'));
        server.watcher.on('change', (file) => {
          if (!file.endsWith('game.json')) return;
          const mod = server.moduleGraph.getModuleById(RESOLVED_REGISTRY);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        });
      },
    },
    {
      name: 'kg-sw-and-redirects',
      apply: 'build',
      configResolved(config) {
        outDir = path.resolve(config.root, config.build.outDir);
      },
      closeBundle() {
        const games = loadRegistry();
        const sw = buildServiceWorker(outDir, games);
        fs.writeFileSync(path.join(outDir, '_redirects'), buildRedirects(games));
        // public/_headers (static rules) + explicit no-cache rules for every built page
        const headersPath = path.join(outDir, '_headers');
        const base = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
        fs.writeFileSync(headersPath, base.trimEnd() + '\n\n' + buildHeaders(findPages(SITE_DIR)));
        this.info(`sw.js ${sw.version}: ${sw.precacheCount} precached, ${sw.mediaCount} media; _redirects + _headers written`);
      },
    },
  ];
}

export default defineConfig({
  root: 'site',
  publicDir: '../public',
  appType: 'mpa',
  resolve: {
    alias: {
      '@kit': path.join(ROOT, 'kit'),
      '@engines': path.join(ROOT, 'engines'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'safari16',
    rolldownOptions: {
      input: pageInputs(),
    },
  },
  server: {
    host: true,
    fs: { allow: [ROOT] },
  },
  preview: {
    host: true,
  },
  plugins: [kidGamesSite()],
});
