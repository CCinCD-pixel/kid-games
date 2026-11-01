// V6 旁白引用完整：yaml 里的每个 id 都被引用（不白合成配音），代码里写死的 id 都在 yaml 里；总句数不超过预算（≤250）；单句 ≤15 字；无重复 id。
import { describe, expect, it } from 'vitest';
import { isDynamic, referencedIds, unreferenced, yamlIds } from '../../../tools/xiangqi/narration-refs';
import { parseLines } from '../src/app/lines';
import raw from '../../../content/xiangqi/narration.yaml?raw';

describe('V6 旁白 id', () => {
  it('yaml 里没有"从未被引用"的句子（动态拼接的前缀见 DYNAMIC 白名单）', () => { expect(unreferenced()).toEqual([]); });
  it('代码 / 课程里写死的旁白 id 全部在 yaml 里', () => {
    const ids = new Set(yamlIds()); const PREFIX = /^(s|pl|p|f|g|xj|c|h|rb|pz|d|r|w|l\d\d|stop|bt)\./; const IGNORE = new Set(['g.mate', 'g.stale', 'g.perp']);   // g.* 是 REASON_LINE 的前缀（后面拼 .win / .lose）
    const missing = [...referencedIds()].filter((id) => PREFIX.test(id) && !ids.has(id) && !isDynamic(id) && !IGNORE.has(id) && !/^f\.\d$/.test(id));
    expect(missing).toEqual([]);
  });
  it('旁白总数 ≤ 250 句；无重复；单句 ≤ 15 字', () => { const ls = parseLines(raw); expect(ls.length).toBeLessThanOrEqual(250); expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length); for (const l of ls) expect([...l.text].length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(15); });
});
