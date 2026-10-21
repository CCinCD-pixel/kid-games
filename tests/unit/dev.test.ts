import { describe, expect, it } from 'vitest';
import { parseSafeParam, safeAreaOverride, isDevServer, isAutomated } from '../../kit/dev';

describe('kit/dev', () => {
  it('parses ?safe=top,right,bottom,left', () => {
    expect(parseSafeParam('47,0,34,0')).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
    expect(parseSafeParam('0,59,21,59')).toEqual({ top: 0, right: 59, bottom: 21, left: 59 });
    expect(parseSafeParam('20')).toEqual({ top: 20, right: 0, bottom: 0, left: 0 });
    expect(parseSafeParam('10,20,30')).toEqual({ top: 10, right: 20, bottom: 30, left: 20 });
    expect(parseSafeParam('999,0,0,0')).toEqual({ top: 120, right: 0, bottom: 0, left: 0 });
  });

  it('rejects junk', () => {
    for (const bad of [null, undefined, '', 'a,b', '1,2,3,4,5', '-5,0,0,0', '1;2', '47,,34']) expect(parseSafeParam(bad)).toBeNull();
  });

  it('is honoured only in a test environment (webdriver / dev server)', () => {
    // vitest runs with import.meta.env.DEV = true (the same switch the Vite dev server sets)
    expect(isDevServer()).toBe(true);
    expect(isAutomated()).toBe(false);
    expect(safeAreaOverride('?safe=47,0,34,0')).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
    expect(safeAreaOverride('?x=1')).toBeNull();
  });
});
