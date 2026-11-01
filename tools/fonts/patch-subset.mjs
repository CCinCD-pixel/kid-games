#!/usr/bin/env node
// Font coverage + re-subset tool for the 星港 webfonts (XG WenKai 霞鹜文楷 reading font, XG KuaiLe 站酷快乐体 display font).
//
//   node tools/fonts/patch-subset.mjs                  report: CJK characters displayed anywhere but missing from the subsets
//   node tools/fonts/patch-subset.mjs --check          same, exit 1 when something is missing (CI / before a release)
//   node tools/fonts/patch-subset.mjs --write          add the missing characters: rebuild public/fonts/{wenkai,zcool}*.woff2
//                                                      from the OFL sources (fontTools), verify no old glyph changed,
//                                                      write tools/fonts/subset-report.json
//   node tools/fonts/patch-subset.mjs --write --extra ~/kid-games-work/specs/xiangqi-tools/out/xiangqi.narration.yaml
//                                                      also include text that is not in the repo yet (draft narration, lessons)
//   options: --specs (also scan docs/specs/*.md — noisy, prose has many rare words), --src <dir with the .ttf sources>,
//            --python <python with fontTools+brotli>, --json, --max-kb <wenkai>,<kuaile> (size budgets, default 1000,520)
//
// What is scanned (everything the child can see): string literals of site/** and kit/** sources (comments ignored), HTML,
// game.json, content/** data (json/txt/yaml, notes + norm fields ignored), narration drafts under tools/*/proto/, the
// curated tools/fonts/extra-chars.txt, plus any --extra file. Tests, validators, tools, site/dev are skipped.
// Sources of the fonts (not in git, 25 MB each): ~/kid-games-work/design-system/_src/fonts-src (or $KG_FONT_SRC).
// Python with fontTools + brotli: ~/kid-games-work/design-system/.venv-ds/bin/python (or $KG_FONT_PYTHON).
// Licences: SIL OFL 1.1 for both fonts (public/fonts/licenses/, assets-src/LICENSES.md). The tool never edits a font file
// by hand; every added glyph is the unmodified outline of the original font.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cmapChars, filesUsing, missingFrom, scanRoots } from './scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS = path.join(ROOT, 'public', 'fonts');
const FILES = { wenkai: 'wenkai-gb-medium-3500.woff2', kuaile: 'zcool-kuaile-3500.woff2' };
const SEED = path.join(ROOT, 'tools', 'fonts', 'extra-chars.txt');
const REPORT = path.join(ROOT, 'tools', 'fonts', 'subset-report.json');
const home = os.homedir();

function parse(argv) {
  const o = { extra: [], write: false, check: false, specs: false, json: false, record: false, maxKb: [1000, 520] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') o.write = true;
    else if (a === '--check') o.check = true;
    else if (a === '--specs') o.specs = true;
    else if (a === '--json') o.json = true;
    else if (a === '--record') o.record = true;
    else if (a === '--extra') o.extra.push(argv[++i].replace(/^~/, home));
    else if (a === '--src') o.src = argv[++i].replace(/^~/, home);
    else if (a === '--python') o.python = argv[++i].replace(/^~/, home);
    else if (a === '--max-kb') o.maxKb = argv[++i].split(',').map(Number);
    else { console.error(`unknown option ${a}`); process.exit(2); }
  }
  return o;
}

/** glyphs the original font has never had (recorded by the last --write); they are not "missing", they fall back */
function unavailableInSource() {
  try {
    const rep = JSON.parse(fs.readFileSync(REPORT, 'utf8')).fonts;
    return { wenkai: new Set(rep[FILES.wenkai].unavailable_in_source), kuaile: new Set(rep[FILES.kuaile].unavailable_in_source) };
  } catch { return { wenkai: new Set(), kuaile: new Set() }; }
}

export function coverage({ extra = [], specs = false } = {}) {
  const have = { wenkai: cmapChars(path.join(FONTS, FILES.wenkai)), kuaile: cmapChars(path.join(FONTS, FILES.kuaile)) };
  const { set, byFile } = scanRoots(ROOT, { includeSpecs: specs, extraFiles: extra });
  const gone = unavailableInSource();
  return {
    have, set, byFile, gone,
    missing: {
      wenkai: missingFrom(set, have.wenkai).filter((c) => !gone.wenkai.has(c)),
      kuaile: missingFrom(set, have.kuaile).filter((c) => !gone.kuaile.has(c)),
    },
  };
}

function recordInSeed(chars, label) {
  if (!chars.length) return;
  const text = fs.readFileSync(SEED, 'utf8');
  const known = new Set(text.split('\n').filter((l) => !l.startsWith('#')).join(''));
  const fresh = chars.filter((c) => !known.has(c));
  if (!fresh.length) return;
  fs.appendFileSync(SEED, `\n# ${label} (${new Date().toISOString().slice(0, 10)})\n${fresh.join('')}\n`);
}

function main() {
  const o = parse(process.argv.slice(2));
  let cov = coverage({ extra: o.extra, specs: o.specs });
  const union = [...new Set([...cov.missing.wenkai, ...cov.missing.kuaile])].sort();
  const print = (...a) => { if (!o.json) console.log(...a); };
  print(`scanned ${cov.byFile.size} files, ${cov.set.size} distinct CJK characters`);
  print(`subsets: wenkai ${cov.have.wenkai.size} cps, kuaile ${cov.have.kuaile.size} cps`);
  if (!union.length) print('every displayed ideograph is in both subsets.');
  else {
    print(`MISSING (${union.length}): ${union.join('')}`);
    for (const c of union) print(`  ${c}  U+${c.codePointAt(0).toString(16).toUpperCase()}  ${filesUsing(cov.byFile, c).join(', ')}${cov.missing.wenkai.includes(c) ? '' : '  (wenkai ok)'}${cov.missing.kuaile.includes(c) ? '' : '  (kuaile ok)'}`);
  }
  // chars that only a --extra draft (not repo content) asked for are written into the seed list so the promise survives
  if (o.record || (o.write && o.extra.length)) recordInSeed(union.filter((c) => !fs.readFileSync(SEED, 'utf8').includes(c)), 'found by --extra scan');

  if (o.write) {
    const src = o.src ?? process.env.KG_FONT_SRC ?? path.join(home, 'kid-games-work/design-system/_src/fonts-src');
    const py = o.python ?? process.env.KG_FONT_PYTHON ?? path.join(home, 'kid-games-work/design-system/.venv-ds/bin/python');
    const pyBin = fs.existsSync(py) ? py : 'python3';
    if (!fs.existsSync(path.join(src, 'LXGWWenKaiGB-Medium.ttf'))) { console.error(`font sources not found in ${src} (use --src)`); process.exit(2); }
    const tmp = path.join(os.tmpdir(), `kg-font-add-${process.pid}.txt`);
    // seed list is part of every build: it lists characters the specs promise even before the text exists
    const seed = fs.readFileSync(SEED, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('');
    fs.writeFileSync(tmp, union.join('') + seed);
    const r = spawnSync(pyBin, ['-I', path.join(ROOT, 'tools', 'fonts', 'build_subset.py'), '--src', src, '--out', FONTS, '--add', tmp], { encoding: 'utf8', maxBuffer: 1 << 26 });
    fs.rmSync(tmp, { force: true });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const rep = JSON.parse(r.stdout);
    for (const [name, v] of Object.entries(rep)) print(`${name}: ${v.codepoints_before} -> ${v.codepoints_after} cps, ${(v.bytes_before / 1024).toFixed(0)} -> ${(v.bytes_after / 1024).toFixed(0)} KB, +${v.added.length} (${v.added})${v.unavailable_in_source ? `, NOT IN SOURCE: ${v.unavailable_in_source}` : ''}`);
    const sizes = [rep[FILES.wenkai].bytes_after / 1024, rep[FILES.kuaile].bytes_after / 1024];
    if (sizes[0] > o.maxKb[0] || sizes[1] > o.maxKb[1]) { console.error(`size budget exceeded (${sizes.map((s) => s.toFixed(0)).join(', ')} KB > ${o.maxKb.join(', ')} KB)`); process.exit(1); }
    fs.writeFileSync(REPORT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), tool: 'tools/fonts/patch-subset.mjs + build_subset.py (fontTools)', fonts: rep }, null, 1) + '\n');
    cov = coverage({ extra: o.extra, specs: o.specs });
    const left = [...new Set([...cov.missing.wenkai, ...cov.missing.kuaile])].sort();
    for (const [k, f] of Object.entries(FILES)) if (cov.gone[k].size) print(`${f}: the source font has no glyph for ${[...cov.gone[k]].join('')} (titles fall back to the next family in --xg-font-title)`);
    print(left.length ? `STILL MISSING: ${left.join('')}` : 'coverage complete.');
    if (o.json) console.log(JSON.stringify({ report: rep, missingAfter: left }));
    return;
  }
  if (o.json) console.log(JSON.stringify({ missing: cov.missing }));
  if (o.check && union.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
