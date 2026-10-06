/**
 * Entry (spec §8.1). The rebuild reached the MVP line (§0A.5) in build stage 2, so 星晶消消乐 is the
 * default page. It stays a dynamic import (Vite preloads its chunks in parallel the moment boot runs)
 * so that the pre-2026-10 game, reachable at `?legacy=1` until the v1 release (dad's acceptance),
 * never receives the new game's global CSS; then src/legacy/ and this branch are deleted.
 */
const NEW_IS_DEFAULT = true;

const params = new URLSearchParams(location.search);
const wantNew = params.get('legacy') !== '1' && (NEW_IS_DEFAULT || params.get('next') === '1' || params.has('dev') || params.get('test') === '1');

if (wantNew) {
  document.title = '星晶消消乐';
  document.body.dataset.xgGame = 'match';
  document.body.dataset.xgTheme = 'night';
  void import('./main').then((m) => m.startGame());
} else {
  document.title = '表情消消乐';
  delete document.body.dataset.xgGame;
  delete document.body.dataset.xgTheme;
  void (async () => {
    const { LEGACY_MARKUP } = await import('./legacy/markup');
    document.body.innerHTML = LEGACY_MARKUP;
    await import('../../_shared/legacy-shell');
    await import('./legacy/main');
  })();
}
