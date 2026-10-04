/**
 * Hub page script. The card markup is rendered at build time from the registry (renderHub);
 * this script only adds behaviour:
 *  - kit shell (touch guards, session log, service worker — the hub is the page that activates a
 *    waiting service-worker update, so a game is never swapped mid-play)
 *  - copies legacy saves into the kit namespace (snapshotLegacyProgress)
 *  - records how a game was launched (hub card) for the parent page's engagement stats
 *  - `?dev` reveals cards whose game.json status is "wip"
 */
import registry from 'virtual:kg-registry';
import { recordLaunch } from '@kit/log';
import { snapshotLegacyProgress } from '@kit/progress';
import { initShell } from '@kit/shell';
import './hub.css';

initShell({
  game: 'hub',
  startGate: false,
  back: false,
  audio: false,
  lockScroll: false,
  serviceWorker: { activateWaiting: true },
});

try {
  snapshotLegacyProgress();
} catch (err) {
  console.warn('[hub] legacy snapshot failed', err);
}

const dev = new URLSearchParams(location.search).has('dev');
if (dev) {
  document.documentElement.dataset.dev = '';
  for (const el of document.querySelectorAll<HTMLElement>('[data-wip]')) el.hidden = false;
}

const known = new Set(registry.map((g) => g.id));
document.addEventListener('click', (e) => {
  const card = (e.target as Element | null)?.closest<HTMLAnchorElement>('a.hub-card');
  const id = card?.dataset.game;
  if (id && known.has(id)) recordLaunch(id, 'hub');
});
