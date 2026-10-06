/**
 * Scoped production build for the 星晶消消乐 budget check (tools/emoji-match/budget.mjs): only the hub
 * (to know which chunks are the shared kit) and /emoji-match/, written to ~/kid-games-work — never to
 * dist/, never the whole site.
 */
import os from 'node:os';
import path from 'node:path';
import base from '../../vite.config';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cfg = base as Record<string, any>;
/** the site plugins minus the service-worker / redirects writer (it insists on every registered page) */
const plugins = (cfg.plugins as unknown[]).flat(3).filter((p) => (p as { name?: string })?.name !== 'kg-sw-and-redirects');
export default {
  ...cfg,
  plugins,
  build: {
    ...cfg.build,
    outDir: path.join(os.homedir(), 'kid-games-work/emoji-match/build'),
    emptyOutDir: true,
    copyPublicDir: false,
    manifest: true,
    rolldownOptions: { ...cfg.build.rolldownOptions, input: { hub: path.join(ROOT, 'site/index.html'), 'emoji-match': path.join(ROOT, 'site/emoji-match/index.html') } },
  },
};
