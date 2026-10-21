// Writes the data the page and the vitest validators load: content/memory-matrix/levels.json (tables + gates + controller constants + no-repeat windows
// + the precomputed SAFE stimuli generate() falls back to). Usage: node export-levels.mjs [out.json]   (windows come from stats-report.json: run stats.mjs first)
import fs from 'node:fs';
import { TABLE, GATES, WINGS, TRACKS, START_L, PLACEMENT, PREVIEW_MIN_MS, STRETCH, NEWCOL } from './params.mjs';
import { CFG } from './controller.mjs';
import { buildSafe } from './gen.mjs';
import { OUT } from './paths.mjs';
const rep = JSON.parse(fs.readFileSync(`${OUT}/stats-report.json`, 'utf8'));
const W = Object.fromEntries(rep.rows.map((r) => [`${r.sector}:${r.D}`, r.W]));
const out = { version: 2, gates: GATES, wings: WINGS, tracks: TRACKS, startL: START_L, placement: PLACEMENT, previewFloorMs: PREVIEW_MIN_MS, controller: CFG, window: W, sectors: TABLE, newAt: NEWCOL, stretch: STRETCH, safe: buildSafe() };
fs.writeFileSync(process.argv[2] || `${OUT}/levels.json`, JSON.stringify(out, null, 1));
console.log(`levels.json: ${JSON.stringify(out).length} bytes`);
