/**
 * 星港搬运工 — entry. Boots the shell (start gate, home button, guards, layout), the save (read-only
 * protection + legacy import), audio and narration, then the router. `?dev=styleboard` shows the
 * style board instead (a separate lazy chunk; never on the child's path).
 */
import { initShell } from '@kit/shell';
import { boot } from './app/boot';
import './styles.css';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

if (params.get('dev') === 'styleboard') {
  initShell({ game: 'sokoban', startGate: false, log: false, back: false, lockScroll: false, serviceWorker: false });
  void import('./dev/styleboard').then(async ({ mountStyleboard, mountSwatches }) => {
    if (params.has('swatches')) mountSwatches(app);
    else await mountStyleboard(app);
    app.dataset.ready = '';
  });
} else {
  boot(app, params);
}
