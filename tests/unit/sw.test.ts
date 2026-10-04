import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper with JSDoc types
import { buildServiceWorker } from '../../tools/sw/build-sw.mjs';

const dirs: string[] = [];
function fakeDist(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-sw-'));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const manifestOf = (dist: string) => {
  const src = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
  const m = /const MANIFEST = (\{.*?\});\n/.exec(src);
  return JSON.parse(m![1]);
};

describe('service worker builder', () => {
  const base = {
    'index.html': '<h1>hub</h1>',
    'chess/index.html': 'chess',
    'assets/chess-abc.js': 'js',
    'assets/dev/kit-1.js': 'dev js',
    'dev/kit/index.html': 'dev page',
    'audio/mars-base/audio-manifest.json': '{}',
    'audio/mars-base/a.1.ffff.m4a': 'AAC',
    'audio/.gitkeep': '',
    'notes.md': '# x',
    'sw.js': 'old',
    '_redirects': 'x',
  };

  it('precaches shell files under page URLs, maps media by hash, skips the rest', () => {
    const dist = fakeDist(base);
    const info = buildServiceWorker(dist, [{ href: '/chess/' }]);
    const m = manifestOf(dist);
    expect(m.precache.sort()).toEqual(['/', '/assets/chess-abc.js', '/audio/mars-base/audio-manifest.json', '/chess/'].sort());
    expect(Object.keys(m.media)).toEqual(['/audio/mars-base/a.1.ffff.m4a']);
    expect(m.media['/audio/mars-base/a.1.ffff.m4a']).toMatch(/^[0-9a-f]{40}$/);
    expect(m.pages).toEqual(['/', '/chess/']);
    expect(info.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('version changes with shell content but not with media content', () => {
    const v1 = buildServiceWorker(fakeDist(base), [{ href: '/chess/' }]).version;
    const v2 = buildServiceWorker(fakeDist({ ...base, 'audio/mars-base/a.1.ffff.m4a': 'NEW AAC' }), [{ href: '/chess/' }]).version;
    const v3 = buildServiceWorker(fakeDist({ ...base, 'assets/chess-abc.js': 'js2' }), [{ href: '/chess/' }]).version;
    expect(v2).toBe(v1);
    expect(v3).not.toBe(v1);
  });

  it('fails the build when a registered page is missing', () => {
    expect(() => buildServiceWorker(fakeDist(base), [{ href: '/sokoban/' }])).toThrow(/sokoban/);
  });

  it('generated sw.js is valid JavaScript and registers its handlers', () => {
    const dist = fakeDist(base);
    buildServiceWorker(dist, [{ href: '/chess/' }]);
    const handlers: Record<string, unknown> = {};
    const self = { addEventListener: (t: string, fn: unknown) => (handlers[t] = fn), location: { origin: 'https://x' } };
    vm.runInNewContext(fs.readFileSync(path.join(dist, 'sw.js'), 'utf8'), { self });
    expect(Object.keys(handlers).sort()).toEqual(['activate', 'fetch', 'install', 'message']);
  });
});
