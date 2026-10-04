import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper with JSDoc types
import { buildHeaders, buildRedirects, findPages, loadRegistry, renderHub, validateGame } from '../../tools/registry.mjs';

const valid = {
  id: 'mars-base', title: '火星基地', subtitle: '给火星基地造发射塔', place: 'base', order: 10, status: 'wip',
  accent: '#e4513d', icon: '🚀', domains: ['number'], parentNote: '数学主力。',
};

describe('game registry', () => {
  it('accepts a valid game.json', () => {
    expect(validateGame(valid, 'mars-base')).toEqual([]);
    expect(validateGame({ ...valid, accent: '--xg-mars-500' }, 'mars-base')).toEqual([]);
  });

  it('reports every problem in a bad game.json', () => {
    const errs: string[] = validateGame({ ...valid, id: 'Mars', place: 'moon', domains: ['iq'], extra: 1, title: '' }, 'mars-base');
    const text = errs.join('\n');
    for (const needle of ['must equal the folder', 'kebab-case', '"title" is required', 'place must be', 'unknown domain "iq"', 'unknown field "extra"']) {
      expect(text).toContain(needle);
    }
  });

  it('loads the real site: every page folder registered, sorted by place then order', () => {
    const games = loadRegistry();
    expect(games.length).toBeGreaterThanOrEqual(7);
    const places = games.map((g: { place: string }) => g.place);
    expect([...places]).toEqual([...places].sort((a, b) => ['base', 'playground', 'classic'].indexOf(a) - ['base', 'playground', 'classic'].indexOf(b)));
    for (const g of games) expect(g.href).toBe(`/${g.id}/`);
    expect(findPages()).toContain('dev/kit/index.html'); // dev pages are built but not registered
    expect(games.find((g: { id: string }) => g.id === 'dev')).toBeUndefined();
  });

  it('keeps the retired URLs as forced 302s to the hub', () => {
    const text: string = buildRedirects(loadRegistry());
    for (const p of ['/checkers', '/star-catcher']) {
      expect(text).toContain(`${p}  /  302!`);
      expect(text).toContain(`${p}/*  /  302!`);
    }
  });

  it('emits 301s for redirectFrom', () => {
    const text: string = buildRedirects([{ ...valid, href: '/mars-base/', redirectFrom: ['/number-adventure'] }], []);
    expect(text).toContain('/number-adventure  /mars-base/  301!');
    expect(text).toContain('/number-adventure/*  /mars-base/  301!');
  });

  it('generates no-cache headers for every page', () => {
    const text: string = buildHeaders(['index.html', 'chess/index.html']);
    expect(text).toContain('/\n  Cache-Control: no-cache');
    expect(text).toContain('/chess/\n  Cache-Control: no-cache');
    expect(text).toContain('/chess/index.html\n  Cache-Control: no-cache');
    expect(text).toContain('/manifest.json\n  Cache-Control: no-cache');
  });

  it('renders hub cards: escaped, wip hidden, hidden status omitted', () => {
    const html: string = renderHub([
      { ...valid, status: 'live', title: '<b>火星</b>', href: '/mars-base/' },
      { ...valid, id: 'lab', status: 'wip', href: '/lab/' },
      { ...valid, id: 'secret', status: 'hidden', href: '/secret/' },
    ]);
    expect(html).toContain('&lt;b&gt;火星&lt;/b&gt;');
    expect(html).toMatch(/href="\/lab\/" data-game="lab"[^>]*data-wip hidden/);
    expect(html).not.toContain('secret');
    expect(html).toContain('基地');
  });
});
