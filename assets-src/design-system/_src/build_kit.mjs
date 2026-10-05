// Bundle ui/index.ts → dist/xg-kit.js for the style guide (the repo uses Vite on the sources).
import { build } from '../_pw/node_modules/esbuild/lib/main.js';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = await build({
  entryPoints: [path.join(ROOT, 'ui/index.ts')], outfile: path.join(ROOT, 'dist/xg-kit.js'),
  bundle: true, format: 'esm', target: ['safari16'], sourcemap: false, minify: false, legalComments: 'none', metafile: true,
});
const out = Object.values(r.metafile.outputs)[0];
console.log('dist/xg-kit.js', (out.bytes / 1024).toFixed(1), 'KB');
