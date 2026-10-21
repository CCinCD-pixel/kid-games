// Builds the data files the page and the validators load from the oracle (never edit the outputs by hand):
//   content/memory-matrix/levels.json         (proto/export-levels.mjs, compact)         content/memory-matrix/constellations.json (lineArt of every constellation)
//   content/memory-matrix/cards.json          (28 cards + 元老, wall stars, atlas order)  content/memory-matrix/lines.json          (id -> { text, role } text manifest for subtitles)
// Usage: node tools/memory-matrix/build-content.mjs     (run proto/stats.mjs first when the difficulty tables change: the windows come from its report)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const here = new URL('.', import.meta.url).pathname, OUT = path.join(here, '..', '..', 'content', 'memory-matrix');
const { CARDS, ORDER, wallStars, SECTOR_ZH, unlockText, needText } = await import('./proto/cards.mjs');
const { CONSTELLATIONS, lineArt } = await import('./proto/constellations.mjs');
const w = (f, o) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(o));
const tmp = path.join(OUT, 'levels.tmp.json'), r = spawnSync('node', [path.join(here, 'proto', 'export-levels.mjs'), tmp], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
w('levels.json', JSON.parse(fs.readFileSync(tmp, 'utf8'))); fs.unlinkSync(tmp);
const yaml = fs.readFileSync(path.join(OUT, 'narration.yaml'), 'utf8');
const lines = Object.fromEntries([...yaml.matchAll(/\{ id: ([\w.]+),\s*role: (\w+),\s*text: (.+?) \}/g)].map((m) => [m[1], { text: m[3].trim(), role: m[2] }]));
w('lines.json', lines);
w('constellations.json', Object.fromEntries(Object.keys(CONSTELLATIONS).map((id) => [id, lineArt(id)])));
w('cards.json', {
  version: 1, order: ORDER, wall: wallStars(), sectorZh: SECTOR_ZH,
  cards: CARDS.map((c) => ({ id: c.id, sector: c.sector, title: c.title, art: c.art, unlock: c.unlock, slot: c.slot, need: c.need, how: unlockText(c), needText: needText(c),
    fact: lines[`mm.card.${c.id}`]?.text ?? '', source: '天文科普常识，作者整理，等爸爸核对', signedBy: '' })),
});
console.log(`content written: ${Object.keys(lines).length} lines, ${CARDS.length} cards, ${Object.keys(CONSTELLATIONS).length} constellations`);
