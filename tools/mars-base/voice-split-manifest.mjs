#!/usr/bin/env node
// After the final `full` voice build: split public/audio/mars-base/audio-manifest.json into the start-up manifest (sentences + fragments, ≈270 KB) and
// numbers-manifest.json (mars.num.*, loaded by the vault / orbit / dictation screens through narrator.addManifest) — spec §7.2. Idempotent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/audio/mars-base');
const p = path.join(dir, 'audio-manifest.json'); const all = { ...JSON.parse(fs.readFileSync(p, 'utf8')), ...(fs.existsSync(path.join(dir, 'numbers-manifest.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'numbers-manifest.json'), 'utf8')) : {}) };
const main = {}, nums = {}; for (const [k, v] of Object.entries(all)) (k.startsWith('mars.num.') ? nums : main)[k] = v;
fs.writeFileSync(p, JSON.stringify(main, null, 1)); fs.writeFileSync(path.join(dir, 'numbers-manifest.json'), JSON.stringify(nums, null, 1));
console.log(`audio-manifest.json: ${Object.keys(main).length} clips · numbers-manifest.json: ${Object.keys(nums).length} clips (of 1001; missing numbers fall back to hundreds + 0-99 chain / speech)`);
const missing = []; for (let i = 0; i <= 1000; i++) if (!nums[`mars.num.${i}`]) missing.push(i);
fs.writeFileSync(path.join(dir, 'numbers-missing.json'), JSON.stringify(missing)); if (missing.length) console.log(`numbers missing: ${missing.length} → numbers-missing.json`);
