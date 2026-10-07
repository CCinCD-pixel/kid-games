import { describe, expect, it } from 'vitest';
import { phraseChunks } from '../src/view/phrase';

describe('phrase-aware caption wrapping (QA r2)', () => {
  it('keeps short clauses whole and glues particles / punctuation to the word before', () => {
    expect(phraseChunks('翻到地雷了：它不会动')).toEqual(['翻到地雷了：', '它不会动']);
    const c = phraseChunks('你用炸弹换掉了对方的大官');
    expect(c.join('')).toBe('你用炸弹换掉了对方的大官');
    expect(c).toContain('大官');
    expect(c.some((x) => x.startsWith('了'))).toBe(false);
    expect(phraseChunks('扛到了军旗')).toEqual(['扛到了军旗']);
  });
  it('never loses characters', () => {
    for (const t of ['数字越大，官越大', '哪个子比师长大？', '来看看这局的三个关键时刻', 'a b', '']) expect(phraseChunks(t).join('')).toBe(t);
  });
});
