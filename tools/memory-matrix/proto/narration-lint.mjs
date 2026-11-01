// Lints narration.yaml against the repo's tone rules (copied from tools/check-content.mjs TONE_RULES), the 15-character subtitle rule and
// voice-policy.json (every policy id exists; every per-round line has a playback rule; card facts match cards.mjs).
// Usage: node narration-lint.mjs [--md]   (--md prints the spec table: id | text)
import fs from 'node:fs';
import { CARDS } from './cards.mjs';
const TONE = [[/宝宝真棒|真聪明|天才/, 'praise the process, not the child'], [/提升智力|开发智力|开发大脑|提高智商/, 'no intelligence claims'], [/错了|答错|做错|你错|错误|错/, 'never show 错'],
  [/拿满分/, 'no perfect-score push'], [/难过|伤心|哭了|好想你|想你了|舍不得|别走|不要走|孤单|失望|你去哪了|丢下我/, 'companion never sad'], [/快点|来不及|时间到/, 'no time pressure']];
const txt = fs.readFileSync(new URL('./narration.yaml', import.meta.url), 'utf8');
const lines = [...txt.matchAll(/\{ id: ([\w.]+),\s*role: (\w+),\s*text: (.+?) \}/g)].map((m) => ({ id: m[1], role: m[2], text: m[3].trim() }));
const policy = JSON.parse(fs.readFileSync(new URL('./voice-policy.json', import.meta.url), 'utf8'));
const bad = []; const ids = new Set();
for (const l of lines) {
  if (ids.has(l.id)) bad.push(`duplicate id ${l.id}`); ids.add(l.id);
  const max = l.id.startsWith('mm.card.') ? 20 : 15;
  if ([...l.text].length > max) bad.push(`${l.id}: ${[...l.text].length} chars > ${max}: ${l.text}`);
  for (const [re, why] of TONE) if (re.test(l.text)) bad.push(`${l.id}: tone (${why}): ${l.text}`);
  if (/[A-Za-z0-9]/.test(l.text)) bad.push(`${l.id}: Latin/digit in spoken text (spell it out): ${l.text}`);
}
for (const id of [...Object.keys(policy.lines), ...policy.tutorialOnly]) if (!ids.has(id)) bad.push(`voice-policy.json names ${id}, which is not in narration.yaml`);
// per-round / per-event lines must have a rule (or be tutorial-only, a card fact, or an explicitly free one-shot)
const FREE = /^mm\.(st\.(locked|open|flightend|wall|upgrade)|sec\.|fb\.(up|reveal|hint2|hint3|miss1|miss2)|s[1-4]\.reveal|g\.(open|retry)|res\.)/;
for (const l of lines) if (!l.id.startsWith('mm.card.') && !(l.id in policy.lines) && !policy.tutorialOnly.includes(l.id) && !FREE.test(l.id)) bad.push(`${l.id}: no playback rule in voice-policy.json (add one or list it as free)`);
const cardIds = CARDS.map((c) => c.id).sort().join(), factIds = lines.filter((l) => l.id.startsWith('mm.card.')).map((l) => l.id.slice(8)).sort().join();
if (cardIds !== factIds) bad.push('card facts do not match cards.mjs ids');
if (process.argv.includes('--md')) { lines.forEach((l) => console.log(`${l.id.replace('mm.', '')} | ${l.role === 'companion' ? 'C' : 'N'} | ${l.text}`)); process.exit(0); }
console.log(`narration lines: ${lines.length} (budget <= 150; target ~105)  companion ${lines.filter((l) => l.role === 'companion').length}  narrator ${lines.filter((l) => l.role === 'narrator').length}  card facts ${lines.filter((l) => l.id.startsWith('mm.card.')).length}  policy rules ${Object.keys(policy.lines).length}`);
if (lines.length > 150) bad.push(`${lines.length} lines > 150`);
console.log(`narration checks failed: ${bad.length}`); bad.forEach((b) => console.log('  ', b)); process.exit(bad.length ? 1 : 0);
