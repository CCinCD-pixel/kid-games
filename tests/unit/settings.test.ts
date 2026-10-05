import { describe, expect, it } from 'vitest';
import { checkPin, cleanName, clearPin, DEFAULT_NAME, getSettings, hashPin, hasPin, PIN_KEY, setPin, SETTINGS_KEY, updateSettings } from '@kit/settings';
import { HUB_PROGRESS_KEY, readHubProgress, setHubProgress } from '@kit/progress';
import { MemoryStorage } from '../helpers/memory-storage';

describe('family settings (parent page)', () => {
  it('defaults, normalises and persists', () => {
    const st = new MemoryStorage();
    expect(getSettings(st)).toEqual({ displayName: DEFAULT_NAME, narration: true, pinyin: false, hiddenGames: [] });
    updateSettings({ displayName: '  小 步  ', narration: false, hiddenGames: ['chess', 'chess', 'Bad Id'] }, st);
    expect(getSettings(st)).toEqual({ displayName: '小 步', narration: false, pinyin: false, hiddenGames: ['chess'] });
    st.setItem(SETTINGS_KEY, '{broken');
    expect(getSettings(st).displayName).toBe(DEFAULT_NAME);
  });

  it('caps the display name and falls back to the default when empty', () => {
    expect(cleanName('')).toBe(DEFAULT_NAME);
    expect([...cleanName('一二三四五六七八九十')].length).toBe(8);
  });

  it('PIN: salted hash, never stored in clear, can be reset', () => {
    const st = new MemoryStorage();
    expect(hasPin(st)).toBe(false);
    expect(() => setPin('12', st)).toThrow();
    setPin('2468', st);
    expect(st.getItem(PIN_KEY)).not.toContain('2468');
    expect(checkPin('2468', st)).toBe(true);
    expect(checkPin('2469', st)).toBe(false);
    expect(hashPin('2468', 'a')).not.toBe(hashPin('2468', 'b'));
    clearPin(st);
    expect(hasPin(st)).toBe(false);
  });
});

describe('hub card progress (kit/progress setHubProgress)', () => {
  it('stores a clamped label/value per game', () => {
    const st = new MemoryStorage();
    setHubProgress('mars-base', { label: '第 2 章', value: 1.7 }, st);
    setHubProgress('sokoban', { label: 'B 区 · 第 7 关' }, st);
    const all = readHubProgress(st);
    expect(all['mars-base']).toMatchObject({ label: '第 2 章', value: 1 });
    expect(all.sokoban.value).toBeUndefined();
    st.setItem(HUB_PROGRESS_KEY, '[]');
    expect(readHubProgress(st)).toEqual({});
  });
});
