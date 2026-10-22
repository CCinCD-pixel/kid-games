import { afterEach, expect, it, vi } from 'vitest';
import { checkConnection, familyToken } from './family';
afterEach(() => vi.unstubAllGlobals());
it('migrates a session-only family token for home-screen cold starts', () => {
  const local = new Map(),
    session = new Map([['pinyin-family-token', 'test-token']]);
  const storage = (map: Map<string, string>) => ({
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
  vi.stubGlobal('localStorage', storage(local));
  vi.stubGlobal('sessionStorage', storage(session));
  expect(familyToken()).toBe('test-token');
  expect(local.get('pinyin-family-token')).toBe('test-token');
  expect(session.size).toBe(0);
});
it.each([401, 403, 429])('explains signature service failure %i to the parent', async (status) => {
  vi.stubGlobal('fetch', async () => ({ ok: false, status }));
  expect(await checkConnection('test-token')).toContain(String(status));
});
