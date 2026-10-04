/**
 * Kit shell for the pre-2026-10 games (one <script type="module"> line in their <head>).
 * Gives them what every page must have without touching their game code:
 *  - their existing 「🏠 返回」 link is adopted: ≥56 px hit area, safe-area aware, goes to "/"
 *  - session log (play time per game for the parent page and the keep/retire decision, plan §4.8)
 *  - pinch/double-tap zoom, long-press callout and text-selection guards (page CSS still wins)
 *  - service-worker registration and storage.persist()
 * They keep their own AudioContext (audio: false) and their own scrolling (lockScroll: false).
 * New games call initShell() themselves instead (docs/GAME_AUTHORING.md).
 */
import { initShell } from '@kit/shell';

const game = document.documentElement.dataset.game ?? location.pathname.split('/').filter(Boolean)[0] ?? 'unknown';

initShell({
  game,
  startGate: false,
  back: { adopt: '.back-home' },
  audio: false,
  lockScroll: false,
});
