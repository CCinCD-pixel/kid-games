#!/usr/bin/env node
/**
 * Spoken-text rules for the 拼音电台 robot (dad, 2026-11-01): the robot only says ordinary Chinese sentences. Every sound the
 * child must listen to and imitate (letter names, initials, finals, call sounds, the repeated sounds of a mnemonic) is a REAL
 * recording (py.syl.*), never TTS. The spoken text of a line is `norm ?? text` (what the voice pipeline reads).
 *   R1  no Latin letters and no tone-marked pinyin in the spoken text ({placeholders} are ignored)
 *   R2  no bare sounds: (a) a clause that is a single letter-sound character ("啊，啊，啊", "波，在右下；德，在左下"), (b) one character three
 *       times in a row ("啊啊啊", "鹅鹅鹅"), (c) read/say + a letter-sound character ("读坡，"), (d) a letter-sound character
 *       used as the subject of "的声音 / 还能" ("讷的声音")
 * usage: node site/pinyin-station/tools/spoken-text.mjs   (prints every violating line; exit 1 when there is any)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The common characters the voice pipeline used for textbook letter sounds (b p m f ... a o e i u ü) - norm: text reads them as sounds. */
export const SOUND_CHARS = '波坡摸佛德特讷勒乐哥科喝基欺希知吃诗日资雌思衣乌迂啊哦鹅哀诶欧优耶约儿安恩音温晕昂英翁冤';
const TONE_MARKED = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ]/;
const CJK = /[㐀-鿿]/;

export const spokenText = (line) => String(line.norm ?? line.text ?? '').replace(/\{\w+\}/g, '');

/** @returns {string[]} the broken rules, empty when the text is fine */
export function violations(spoken) {
  const out = [];
  if (/[A-Za-z]/.test(spoken)) out.push('R1 Latin letters');
  if (TONE_MARKED.test(spoken)) out.push('R1 tone-marked pinyin');
  const clauses = spoken.split(/[，,；;、：:。！？!?…—\s]+/).filter(Boolean);
  if (clauses.some((c) => c.length === 1 && SOUND_CHARS.includes(c))) out.push('R2a single-character clause that is a letter sound');
  if (/([㐀-鿿])\1\1/.test(spoken)) out.push('R2b one character three times in a row');
  if (new RegExp(`[读念说]([${SOUND_CHARS}])(?=[，；。！？,;]|$)`).test(spoken)) out.push('R2c "read + letter sound"');
  if (new RegExp(`(^|[，；：,;])([${SOUND_CHARS}])(的声音|还能)`).test(spoken)) out.push('R2d letter sound as subject');
  return out;
}

export function lintYaml(root) {
  const yaml = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8'));
  return yaml.lines.map((l) => ({ id: l.id, spoken: spokenText(l), broken: violations(spokenText(l)) })).filter((r) => r.broken.length);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const bad = lintYaml(root);
  for (const r of bad) console.log(`${r.id}: ${r.broken.join('; ')}  <- ${r.spoken}`);
  console.log(bad.length ? `${bad.length} line(s) break the spoken-text rules` : 'spoken text ok');
  process.exitCode = bad.length ? 1 : 0;
}
