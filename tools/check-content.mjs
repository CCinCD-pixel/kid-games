#!/usr/bin/env node
// @ts-check
/**
 * Content checks, run by `npm run build` / `npm run check`:
 *
 *  1. Every narration manifest public/audio/<game>/audio-manifest.json is well-formed and every
 *     clip it lists exists (the runtime contract of kit/narration.ts).
 *  2. Tone lint (plan §3.0 / §4.4) over child-facing text: narration manifests, content/**
 *     (yaml/json/md), and the kit's own strings. Bans product-pitch praise, "wrong" wording and
 *     anything that makes the companion sad or guilt-trips the child for stopping.
 *     Suppress a deliberate exception by putting `tone-ok` on the same line.
 *
 * Exported functions are unit-tested (tests/unit/content.test.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const AUDIO_EXT = /\.(m4a|mp3|aac)$/i;

/**
 * @param {unknown} manifest parsed audio-manifest.json
 * @param {{ game: string, publicDir?: string, checkFiles?: boolean }} opts
 * @returns {string[]} problems
 */
export function validateAudioManifest(manifest, { game, publicDir = PUBLIC, checkFiles = true }) {
  const at = `public/audio/${game}/audio-manifest.json`;
  /** @type {string[]} */ const errs = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return [`${at}: must be a JSON object {id: clip}`];
  for (const [id, clip] of Object.entries(manifest)) {
    const where = `${at} "${id}"`;
    if (!/^\S+$/.test(id)) errs.push(`${where}: id must not contain whitespace`);
    if (!clip || typeof clip !== 'object') { errs.push(`${where}: clip must be an object`); continue; }
    const c = /** @type {Record<string, any>} */ (clip);
    if (typeof c.text !== 'string' || !c.text.trim()) errs.push(`${where}: text is required`);
    if (typeof c.durationMs !== 'number' || !(c.durationMs > 0)) errs.push(`${where}: durationMs must be a positive number`);
    if (typeof c.src !== 'string' || !c.src.startsWith(`/audio/${game}/`)) errs.push(`${where}: src must start with /audio/${game}/`);
    else if (!AUDIO_EXT.test(c.src)) errs.push(`${where}: src must be .m4a (AAC) or .mp3`);
    else if (checkFiles && !fs.existsSync(path.join(publicDir, c.src))) errs.push(`${where}: file public${c.src} is missing`);
    if (c.words !== undefined) {
      if (!Array.isArray(c.words)) errs.push(`${where}: words must be an array`);
      else c.words.forEach((w, i) => {
        if (!w || typeof w.ch !== 'string' || typeof w.t0 !== 'number' || typeof w.t1 !== 'number' || w.t0 > w.t1) errs.push(`${where}: words[${i}] must be {ch, t0, t1} with t0 <= t1`);
        else if (typeof c.durationMs === 'number' && w.t1 > c.durationMs + 50) errs.push(`${where}: words[${i}].t1 is past the clip end`);
      });
    }
    for (const p of lintTone(String(c.text ?? ''))) errs.push(`${where}: ${p}`);
  }
  return errs;
}

/**
 * Child-facing tone rules. Each entry: [regex, why].
 * @type {[RegExp, string][]}
 */
export const TONE_RULES = [
  [/宝宝真棒|真聪明|天才/, 'praise the process, not the child ("宝宝真棒" style praise is banned)'],
  [/提升智力|开发智力|开发大脑|提高智商/, 'no "boosts intelligence" claims'],
  [/错了|答错|做错|你错|错误/, 'never show the word 错 to the child; show why instead'],
  [/重玩一遍拿满分|拿满分/, 'never push for perfect scores'],
  [/难过|伤心|哭了|好想你|想你了|舍不得|别走|不要走|孤单|失望|你去哪了|丢下我/, 'the companion never looks or sounds sad / guilt-trips (plan §4.4)'],
  [/快点|来不及|时间到/, 'no time pressure in learning content'],
];

/** @param {string} text @returns {string[]} */
export function lintTone(text) {
  if (/tone-ok/.test(text)) return [];
  return TONE_RULES.filter(([re]) => re.test(text)).map(([re, why]) => `tone: "${text.match(re)?.[0]}" — ${why}`);
}

/** @param {string} dir @param {RegExp} ext @returns {string[]} */
function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.name.startsWith('.') || e.name === 'node_modules') return [];
    return e.isDirectory() ? walk(p, ext) : ext.test(e.name) ? [p] : [];
  });
}

/** Lint every line of child-facing text files. Comments (# …, // …) are skipped. */
export function lintFiles(files) {
  /** @type {string[]} */ const errs = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/^\s*(#|\/\/|\*|\/\*).*$/, '');
      if (!/[㐀-鿿]/.test(code)) return;
      for (const p of lintTone(code)) errs.push(`${path.relative(ROOT, f)}:${i + 1}: ${p}`);
    });
  }
  return errs;
}

function main() {
  /** @type {string[]} */ const problems = [];
  let clips = 0;
  const audioDir = path.join(PUBLIC, 'audio');
  if (fs.existsSync(audioDir)) {
    for (const game of fs.readdirSync(audioDir)) {
      const mf = path.join(audioDir, game, 'audio-manifest.json');
      if (!fs.existsSync(mf)) continue;
      let m;
      try { m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { problems.push(`public/audio/${game}/audio-manifest.json: invalid JSON (${/** @type {Error} */ (e).message})`); continue; }
      clips += Object.keys(m).length;
      problems.push(...validateAudioManifest(m, { game }));
    }
  }
  const textFiles = [
    ...walk(path.join(ROOT, 'content'), /\.(ya?ml|json|md)$/i),
    ...walk(path.join(ROOT, 'kit'), /\.ts$/i).filter((f) => !f.endsWith('.test.ts')),
  ];
  problems.push(...lintFiles(textFiles));
  if (problems.length) {
    console.error(`check-content: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`check-content: ${clips} narration clips OK, tone lint OK (${textFiles.length} files)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
