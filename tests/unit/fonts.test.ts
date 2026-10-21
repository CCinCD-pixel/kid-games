import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs tool, no type declarations
import { cmapChars, missingFrom, readWoff2Cmap, scanRoots, stripCodeComments, stripYamlComments, chars } from '../../tools/fonts/scan.mjs';

const ROOT = path.resolve(__dirname, '../..');
const WENKAI = path.join(ROOT, 'public/fonts/wenkai-gb-medium-3500.woff2');
const KUAILE = path.join(ROOT, 'public/fonts/zcool-kuaile-3500.woff2');

describe('woff2 cmap reader', () => {
  it('reads both CJK subsets (3500 一级字 + extras)', () => {
    const wk = cmapChars(WENKAI) as Set<string>;
    const kl = cmapChars(KUAILE) as Set<string>;
    expect(wk.size).toBeGreaterThan(3800);
    expect(kl.size).toBeGreaterThan(3700);
    for (const c of '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感') expect(wk.has(c), c).toBe(true);
    expect(wk.has('A')).toBe(true);
    expect(wk.has('ā')).toBe(true); // pinyin tone letters (WenKai only)
  });

  it('carries the characters the specs and games asked for (K4)', () => {
    const wk = cmapChars(WENKAI) as Set<string>;
    // 仕 蹩 + the 14 xiangqi piece names + gear-fort's 28 local patch glyphs
    for (const c of '车马炮象士将帅仕相兵卒蹩楚河汉界') expect(wk.has(c), c).toBe(true);
    const gearFort = '偃咔嗒噗埙帧弩徵攒枭橐檑牒瓮礌篝缪蒺藜轒轳辒辘郢闩韬驿鸢';
    expect(gearFort.length).toBe(28);
    for (const c of gearFort) expect(wk.has(c), c).toBe(true);
    const kl = cmapChars(KUAILE) as Set<string>;
    for (const c of gearFort) if (!'礌轒辒'.includes(c)) expect(kl.has(c), c).toBe(true); // these three are not in the 站酷 source
    for (const c of '仕蹩车马炮象士将帅相兵卒') expect(kl.has(c), c).toBe(true);
  });

  it('matches the build report and stays within the size budget', () => {
    const rep = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fonts/subset-report.json'), 'utf8')).fonts;
    expect(readWoff2Cmap(WENKAI).size).toBe(rep['wenkai-gb-medium-3500.woff2'].codepoints_after);
    expect(readWoff2Cmap(KUAILE).size).toBe(rep['zcool-kuaile-3500.woff2'].codepoints_after);
    expect(fs.statSync(WENKAI).size).toBeLessThan(1000 * 1024);
    expect(fs.statSync(KUAILE).size).toBeLessThan(520 * 1024);
  });

  it('every curated seed character (tools/fonts/extra-chars.txt) is in the WenKai subset', () => {
    const seed = fs.readFileSync(path.join(ROOT, 'tools/fonts/extra-chars.txt'), 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('');
    expect(missingFrom(chars(seed), cmapChars(WENKAI))).toEqual([]);
  });
});

describe('scanner', () => {
  it('drops code comments but keeps string literals', () => {
    const src = `// 注释里的字 帅\nconst a = '车马'; /* 块注释 炮 */ const b = "http://x"; const c = \`象\${1}士\`;`;
    const s = chars(stripCodeComments(src)) as Set<string>;
    expect([...s].sort().join('')).toBe(['车', '马', '象', '士'].sort().join(''));
  });

  it('ignores notes / norm fields of narration yaml, keeps the displayed text', () => {
    const y = `# 全行注释 将\n- {id: a.1, role: companion, text: 你好呀, norm: 蹩脚, notes: 'voice: 籗录', pinyin: {你好: nǐ hǎo}}\n- id: a.2\n  text: 再来  # 尾注 帅\n  norm: 绊\n`;
    const s = [...(chars(stripYamlComments(y)) as Set<string>)].sort().join('');
    expect(s).toBe(['你', '好', '呀', '再', '来'].sort().join(''));
  });

  it('range delimiters of regexes are not "displayed" characters', () => {
    expect((chars(`/[${String.fromCodePoint(0x3400)}-${String.fromCodePoint(0x9fff)}${String.fromCodePoint(0xf900)}-${String.fromCodePoint(0xfaff)}]/`) as Set<string>).size).toBe(0);
  });

  it('repo coverage is reported (hard failure only for the required lists above)', () => {
    const { set } = scanRoots(ROOT);
    const miss = missingFrom(set, cmapChars(WENKAI)) as string[];
    // Game builders may add rare characters; the platform re-runs `node tools/fonts/patch-subset.mjs --write`.
    if (miss.length) console.warn(`[fonts] ${miss.length} displayed characters are missing from the kit subset: ${miss.join('')}`);
    expect(set.size).toBeGreaterThan(1000);
  });
});
