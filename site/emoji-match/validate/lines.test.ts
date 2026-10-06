/**
 * V10 lines (spec §7.4, §9.2): content/emoji-match/lines.json (bundled: subtitles + cards) and
 * content/emoji-match/narration.yaml (the voice pipeline's source) on the shipped files —
 *   ids unique with the `em.` prefix · subtitles ≤ 15 characters, cards ≤ 40 · repo TONE_RULES clean ·
 *   every v1 intro card has `em.intro.<id>.1` · every line id the code references exists · polyphone
 *   watch-list characters are locked (line `pinyin` or the site-wide _lexicon.yaml) · intro verbs match
 *   the script's actions (点 ⇔ tap / tool, 拖 ⇔ swap, 换 ⇔ swap / tractor / combo; the tractor never says
 *   随便) · narration.yaml ⇔ lines.json in sync · voice.json `clips` ⇔ the generated manifest exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper (platform tool), read-only use
import { lintTone } from '../../../tools/check-content.mjs';
import { INTROS, LINES, VOICE } from '../src/content';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

interface YLine { id: string; role: string; text: string; pinyin: Record<string, string> }
/** the flow-style narration.yaml (one `- {id: …, role: …, text: …, pinyin: {…}}` per line) */
export function parseNarration(src: string): YLine[] {
  const out: YLine[] = [];
  for (const raw of src.split('\n')) {
    const m = /^\s*-\s*\{(.*)\}\s*$/.exec(raw);
    if (!m) continue;
    const body = m[1];
    const pin: Record<string, string> = {};
    const pm = /,\s*pinyin:\s*\{([^}]*)\}/.exec(body);
    if (pm) for (const kv of pm[1].split(',')) { const [w, r] = kv.split(':').map((x) => x.trim()); if (w) pin[w] = r; }
    const rest = pm ? body.slice(0, pm.index) : body;
    const id = /id:\s*([^,\s]+)/.exec(rest)?.[1] ?? '';
    const role = /role:\s*([^,\s]+)/.exec(rest)?.[1] ?? '';
    let text = /text:\s*(.*)$/.exec(rest)?.[1].trim() ?? '';
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/\\"/g, '"');
    out.push({ id, role, text, pinyin: pin });
  }
  return out;
}
function lexicon(): string[] {
  return read('content/narration/_lexicon.yaml').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean).map((l) => l.split(':')[0].trim());
}
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'legacy' ? [] : walk(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

const WATCH = '行长重还得着转待数差只空种弹降背为宿便角斗';
const VERB_STEP: Record<string, string[]> = { 点: ['tap', 'booster'], 拖: ['swap'], 换: ['swap', 'tractor', 'combo'] };
const yaml = parseNarration(read('content/emoji-match/narration.yaml'));

describe('V10 lines', () => {
  it('113 v1 lines: unique em.* ids, roles, 100 subtitles ≤ 15 chars + 13 cards ≤ 40, tone-clean', () => {
    expect(LINES.length).toBe(113);
    expect(new Set(LINES.map((l) => l.id)).size).toBe(LINES.length);
    const errs: string[] = [];
    for (const l of LINES) {
      if (!/^em\.[a-zA-Z0-9.]+$/.test(l.id)) errs.push(`bad id ${l.id}`);
      if (!['companion', 'narrator'].includes(l.role)) errs.push(`bad role ${l.id}`);
      const n = [...l.text].length;
      if (l.kind === 'sub' && n > 15) errs.push(`${l.id}: subtitle ${n} > 15`);
      if (l.kind === 'card' && n > 40) errs.push(`${l.id}: card ${n} > 40`);
      for (const t of lintTone(l.text) as string[]) errs.push(`${l.id}: ${t}`);
    }
    expect(errs).toEqual([]);
    expect(LINES.filter((l) => l.kind === 'sub').length).toBe(100);
    expect(LINES.filter((l) => l.kind === 'card').length).toBe(13);
  });
  it('narration.yaml ⇔ lines.json (same ids, order, roles and texts)', () => {
    expect(read('content/emoji-match/narration.yaml').startsWith('game: emoji-match\nlines:\n')).toBe(true);
    expect(yaml.map((y) => [y.id, y.role, y.text])).toEqual(LINES.map((l) => [l.id, l.role, l.text]));
  });
  it('polyphone watch-list characters are locked (line pinyin or _lexicon.yaml)', () => {
    const lex = lexicon(), errs: string[] = [];
    for (const y of yaml) for (const ch of WATCH) if (y.text.includes(ch)) {
      const ok = Object.keys(y.pinyin).some((w) => w.includes(ch) && y.text.includes(w)) || lex.some((w) => w.includes(ch) && y.text.includes(w));
      if (!ok) errs.push(`${y.id}: ${ch} in "${y.text}"`);
    }
    expect(errs).toEqual([]);
    expect(yaml.filter((y) => Object.keys(y.pinyin).length).length).toBe(43);
  });
  it('every intro card has em.intro.<id>.1 and its verbs match the script', () => {
    const errs: string[] = [];
    for (const it of INTROS) {
      if (!LINES.some((l) => l.id === `em.intro.${it.id}.1`)) errs.push(`no em.intro.${it.id}.1`);
      const steps = new Set<string>(it.steps.map((st) => {
        const x = st as { tap?: unknown; booster?: { t: string } };
        return x.tap !== undefined ? 'tap' : x.booster ? (x.booster.t === 'tractor' ? 'tractor' : 'booster') : (/[>^*+&]/.test(it.grid.join('')) && /combo/.test(it.id) ? 'combo' : 'swap');
      }));
      for (const l of LINES.filter((x) => x.id.startsWith(`em.intro.${it.id}.`))) {
        for (const [verb, okSteps] of Object.entries(VERB_STEP)) if (l.text.includes(verb) && !okSteps.some((x) => steps.has(x))) errs.push(`${l.id}: ${verb} vs ${[...steps]}`);
        if (it.id === 'boosterTractor' && /随便/.test(l.text)) errs.push(`${l.id}: the tractor only swaps neighbours`);
      }
    }
    expect(errs).toEqual([]);
  });
  it('every line id referenced by the code exists (templated ids expanded)', () => {
    const ids = new Set(LINES.map((l) => l.id));
    const src = walk(path.join(ROOT, 'site/emoji-match/src')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const literal = [...src.matchAll(/['`](em\.[a-zA-Z0-9.]+)['`]/g)].map((m) => m[1]).filter((s) => !s.endsWith('.'));
    expect(literal.filter((id) => !ids.has(id))).toEqual([]);
    // templated families the code builds at runtime
    for (let e = 1; e <= 4; e += 1) { expect(ids.has(`em.route.ep${e}`)).toBe(true); expect(ids.has(`em.arrive.ep${e}`)).toBe(true); }
    for (let t = 1; t <= 3; t += 1) expect(ids.has(`em.assist.${t}`)).toBe(true);
    for (let k = 1; k <= 4; k += 1) expect(ids.has(`em.talk.${k}`)).toBe(true);
  });
  it('voice.json clips ⇔ public/audio/emoji-match/audio-manifest.json exists (no 404 before the voice step)', () => {
    const has = fs.existsSync(path.join(ROOT, 'public/audio/emoji-match/audio-manifest.json'));
    expect(VOICE.clips).toBe(has);
  });
});
