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

  it('renders hub panels: escaped, wip as non-navigating 建造中 cards, hidden status omitted', () => {
    const html: string = renderHub([
      { ...valid, status: 'live', title: '<b>火星</b>', href: '/mars-base/', theme: 'mars' },
      { ...valid, id: 'lab', status: 'wip', href: '/lab/' },
      { ...valid, id: 'secret', status: 'hidden', href: '/secret/' },
    ]);
    expect(html).toContain('&lt;b&gt;火星&lt;/b&gt;');
    expect(html).toMatch(/<a class="xg-card hub-card" href="\/mars-base\/" data-game="mars-base"[^>]*data-xg-game="mars"/);
    expect(html).toMatch(/<div class="xg-card hub-card" role="link" aria-disabled="true"[^>]*data-href="\/lab\/" data-wip data-game="lab"/);
    expect(html).toContain('建造中');
    expect(html).not.toContain('secret');
    for (const place of ['base', 'playground', 'classic']) expect(html).toContain(`id="hub-panel-${place}"`);
    expect(html).toContain('aria-label="基地"');
  });

  it('validates theme and newContent', () => {
    expect(validateGame({ ...valid, theme: 'mars' }, 'mars-base')).toEqual([]);
    expect(validateGame({ ...valid, theme: 'pluto' }, 'mars-base').join()).toContain('theme must be');
    expect(validateGame({ ...valid, status: 'live', newContent: { id: '2026-10-ch2', label: '新章节' } }, 'mars-base')).toEqual([]);
    expect(validateGame({ ...valid, newContent: { id: '2026-10-ch2' } }, 'mars-base').join()).toContain('only makes sense on a live game');
    expect(validateGame({ ...valid, status: 'live', newContent: { id: 'x y' } }, 'mars-base').join()).toContain('newContent must be');
  });

  it('keeps platform pages (parent, credits, dev) out of the game registry', () => {
    const games = loadRegistry();
    for (const id of ['parent', 'credits', 'dev']) expect(games.find((g: { id: string }) => g.id === id)).toBeUndefined();
    expect(findPages()).toEqual(expect.arrayContaining(['parent/index.html', 'credits/index.html']));
    // every registered game has a 星港 emblem file named after its id
    for (const g of games) expect(g.icon).toBe(`/icons/games/${g.id}.svg`);
  });
});
