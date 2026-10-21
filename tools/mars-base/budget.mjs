#!/usr/bin/env node
// V11 size gate (spec §8.6): reads the SCOPED production build (~/kid-games-work/mars-dist, `npx vite build --config tools/mars-base/vite.scoped.config.ts`).
// game JS (everything except the shared 'kit' chunk, which every game shares in the root build) ≤ 90 KB gzip as the entry and ≤ 180 KB with all lazy chunks;
// CSS (game chunk) ≤ 24 KB gzip; runtime JSON ≤ 60 KB gzip (the content JSON that ships inside the bundle); audio manifests per §7.2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = process.env.MARS_DIST ?? path.join(os.homedir(), 'kid-games-work/mars-dist');
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length; const kb = (n) => +(n / 1024).toFixed(1);
const files = fs.readdirSync(path.join(DIST, 'assets')).map((f) => ({ f, buf: fs.readFileSync(path.join(DIST, 'assets', f)) }));
const html = fs.readFileSync(path.join(DIST, 'mars-base/index.html'), 'utf8');
const entry = (html.match(/assets\/(mars-base-[\w-]+\.js)/) ?? [])[1];
const js = files.filter((x) => x.f.endsWith('.js')); const css = files.filter((x) => x.f.endsWith('.css'));
const isKit = (f) => /^kit-/.test(f);
const gameJs = js.filter((x) => !isKit(x.f)); const gameCss = css.filter((x) => !isKit(x.f));
const rt = ['content/mars-base/nodes.json', 'content/mars-base/families.json', 'content/mars-base/cards.json', 'content/mars-base/planets.json', 'site/mars-base/src/data/lines.v1.json'].filter((p) => fs.existsSync(path.join(ROOT, p)));
const jsonGz = rt.map((p) => ({ p, raw: fs.statSync(path.join(ROOT, p)).size, gz: gz(fs.readFileSync(path.join(ROOT, p))) }));
const r = {
  entryJsGzKB: kb(gz(files.find((x) => x.f === entry).buf)), gameJsGzKB: kb(gameJs.reduce((a, x) => a + gz(x.buf), 0)), kitJsGzKB: kb(js.filter((x) => isKit(x.f)).reduce((a, x) => a + gz(x.buf), 0)),
  gameCssGzKB: kb(gameCss.reduce((a, x) => a + gz(x.buf), 0)), runtimeJsonGzKB: kb(jsonGz.reduce((a, x) => a + x.gz, 0)), runtimeJson: jsonGz,
  audioManifestGzKB: (() => { const p = path.join(ROOT, 'public/audio/mars-base/audio-manifest.json'); return fs.existsSync(p) ? kb(gz(fs.readFileSync(p))) : 0; })(),
};
const gates = { 'entry JS (game, gzip KB)': [r.entryJsGzKB, 90], 'game JS incl. lazy chunks (gzip KB)': [r.gameJsGzKB, 180], 'game CSS (gzip KB)': [r.gameCssGzKB, 24], 'runtime JSON in the bundle (gzip KB)': [r.runtimeJsonGzKB, 60] };
let ok = true; console.log(JSON.stringify(r)); for (const [k, [v, lim]] of Object.entries(gates)) { const good = v <= lim; ok &&= good; console.log(`${good ? 'ok  ' : 'FAIL'} ${k}: ${v} (limit ${lim})`); }
fs.writeFileSync(path.join(os.homedir(), 'kid-games-work/state/rr/budget-mars.json'), JSON.stringify({ ...r, gates, ok }, null, 1));
process.exit(ok ? 0 : 1);
