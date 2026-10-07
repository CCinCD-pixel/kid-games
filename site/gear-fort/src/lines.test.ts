// V13 (spec §9.1, §7.3): every line the game can say exists, is short enough, passes the tone lint + this game's banned
// words, has a `norm` when it carries digits or variables, and lines.json ⇔ narration*.yaml are identical.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { WORDS, wordId } from './pointread';
// @ts-ignore -- the platform's tone rules live in an untyped .mjs script
import { TONE_RULES } from '../../../tools/check-content.mjs';
import { LINES, LEVELS, ORDER, CAMPAIGN, UNIT_INFO, ENEMY_INFO } from './content';
import { FEARS } from './lane/tags';
import ALMANAC from '../../../content/gear-fort/almanac.json';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'site/gear-fort/src');
const GAME_BANNED = /死|杀|消灭|敌人|失败|错|笨|攻击|宝宝/; // §7.3 本作禁词 ("攻打" only in the prologue's historical line)
const MAX = { sub: 15, talk: 24, card: 40 } as Record<string, number>;
const visible = (t: string): number => [...t.replace(/\{\w+\}/g, '00').replace(/[，。！？、：；“”‘’（）《》·…—\s,.!?:;()"'-]/g, '')].length;
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path.join(d, e.name)] : []);
const CODE = walk(SRC).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

describe('V13 lines', () => {
  const ids = Object.keys(LINES);
  it('ids are unique fort.* ids with a known kind', () => {
    expect(ids.length).toBeGreaterThanOrEqual(457);
    for (const id of ids) { expect(id.startsWith('fort.'), id).toBe(true); expect(['sub', 'talk', 'card'], id).toContain(LINES[id].kind); }
  });
  it('length: sub ≤15 / talk ≤24 / card ≤40 visible characters', () => {
    const over = ids.filter((id) => visible(LINES[id].text) > MAX[LINES[id].kind!]).map((id) => `${id} (${visible(LINES[id].text)}): ${LINES[id].text}`);
    expect(over).toEqual([]);
  });
  it('tone lint: platform TONE_RULES + this game\'s banned words, 0 hits (the prologue may say 攻打)', () => {
    const hits: string[] = [];
    for (const id of ids) {
      const t = LINES[id].text;
      for (const [re, why] of TONE_RULES as [RegExp, string][]) if (re.test(t)) hits.push(`${id}: ${t} — ${why}`);
      if (GAME_BANNED.test(t)) hits.push(`${id}: ${t} — 本作禁词`);
    }
    expect(hits).toEqual([]);
  });
  it('鲁班 never pairs 你 with a put-down', () => {
    const bad = ids.filter((id) => LINES[id].role === 'luban' && /你.{0,6}(笨|傻|不行|差劲|没用|输定|弱)/.test(LINES[id].text));
    expect(bad).toEqual([]);
  });
  it('digits or {vars} need a spoken `norm`', () => {
    const miss = ids.filter((id) => /[0-9{]/.test(LINES[id].text) && !LINES[id].norm);
    expect(miss).toEqual([]);
  });
  it('narration.yaml + narration.luban.yaml say exactly what lines.json says', () => {
    const y: Record<string, { text: string; norm?: string; role: string }> = {};
    for (const f of ['narration.yaml', 'narration.luban.yaml']) for (const l of fs.readFileSync(path.join(ROOT, 'content/gear-fort', f), 'utf8').split('\n')) {
      const m = l.match(/^\s*- \{id: ([^,]+), role: ([^,]+), text: (.*?)(?:, norm: (.*?))?(?:, pinyin: \{.*\})?\}\s*$/); if (!m) continue;
      const uq = (v?: string): string | undefined => (v && /^".*"$/.test(v) ? JSON.parse(v) : v);
      y[m[1]] = { role: m[2], text: uq(m[3])!, norm: uq(m[4]) };
    }
    const spoken = ids.filter((id) => LINES[id].role !== 'word');
    for (const id of spoken) { expect(y[id], id).toBeTruthy(); expect(y[id].text, id).toBe(LINES[id].text); if (LINES[id].norm) expect(y[id].norm, id).toBe(LINES[id].norm); }
  });
  it('every fort.* id the code can name exists (static ids; template prefixes have at least one line)', () => {
    const missing: string[] = [];
    for (const m of CODE.matchAll(/'(fort\.[A-Za-z0-9_.\-一-鿿]+)'/g)) if (!LINES[m[1]] && !m[1].endsWith('.')) missing.push(m[1]);
    for (const m of CODE.matchAll(/`(fort\.[^`$]*)\$\{/g)) if (!ids.some((i) => i.startsWith(m[1])) && m[1] !== 'fort.w.') missing.push(m[1] + '…'); // fort.w.* = the 45 point-read words (narration.yaml; checked below)
    expect([...new Set(missing)]).toEqual([]);
  });
  it('levels, campaign, almanac and inns only point at existing lines', () => {
    const refs: string[] = [];
    const scan = (v: unknown): void => { if (typeof v === 'string') { if (/^fort\.[^ ]+$/.test(v)) refs.push(v); } else if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
    for (const id of ORDER) scan(LEVELS[id]); scan(CAMPAIGN); scan(ALMANAC);
    const words = new Set([...fs.readFileSync(path.join(ROOT, 'content/gear-fort/narration.yaml'), 'utf8').matchAll(/id: (fort\.w\.[^,}\s]+)/g)].map((m) => m[1]));
    expect(words.size).toBe(45); // 点读词 (§2.6): 25 names + 墨子、鲁班 + 18 UI words
    expect(new Set(WORDS.map(wordId))).toEqual(words); // the in-game 点读 list is exactly the voiced word list
    expect(refs.filter((r) => !LINES[r] && !words.has(r))).toEqual([]);
  });
  it('coach + 败因 lines exist for everything volume 1 can produce (V12b enumeration)', () => {
    const v1 = ORDER.filter((id) => id.startsWith('1-')); const cards = new Set<string>(); const kinds = new Set<string>();
    for (const id of v1) { (LEVELS[id].known || []).forEach((k) => kinds.add(k)); (LEVELS[id].loadout || []).forEach((c) => cards.add(c)); if (LEVELS[id].newCard) cards.add(LEVELS[id].newCard!); }
    const miss: string[] = [];
    for (const k of kinds) if (ENEMY_INFO[k] && !LINES[`fort.coach.counter.${k}`]) miss.push(`fort.coach.counter.${k}`);
    const fc = fs.readFileSync(path.join(SRC, 'lane/failcause.ts'), 'utf8');
    for (const m of fc.matchAll(/tip: '([A-Za-z0-9]+)'/g)) if (!LINES[`fort.tip.${m[1]}`]) miss.push(`fort.tip.${m[1]}`);
    for (const m of fc.matchAll(/tip: '([A-Za-z0-9]+\.[A-Za-z0-9]+)'/g)) if (!LINES[`fort.tip.${m[1]}`]) miss.push(`fort.tip.${m[1]}`);
    const NO_UNUSED = ['walker', 'ram', 'flyer', 'flyer_m', 'ladder', 'ant']; // failcause.ts never says counterUnused for these
    for (const k of kinds) if (!NO_UNUSED.includes(k)) for (const c of FEARS[k] || []) if (cards.has(c) && UNIT_INFO[c] && !LINES[`fort.tip.counterUnused.${c}`]) miss.push(`fort.tip.counterUnused.${c}`);
    for (const m of fc.matchAll(/id: '([A-Za-z0-9]+)'/g)) if (!ids.some((i) => i === `fort.fail.${m[1]}` || i.startsWith(`fort.fail.${m[1]}.`)) && !LINES['fort.fail.generic']) miss.push(`fort.fail.${m[1]}`);
    expect([...new Set(miss)]).toEqual([]);
  });
  it('UI strings in code avoid the banned words too', () => {
    const lits = [...CODE.matchAll(/'([^'\n]*[一-鿿][^'\n]*)'|`([^`\n]*[一-鿿][^`\n]*)`/g)].map((m) => m[1] ?? m[2]);
    expect(lits.filter((t) => GAME_BANNED.test(t) || (TONE_RULES as [RegExp, string][]).some(([re]) => re.test(t)))).toEqual([]);
  });
});
