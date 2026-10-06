/**
 * 陆战棋 — entry. Shell (start gate, layout, pause/resume, autosave), save, narration, router.
 * ?test=1 skips the start gate and exposes window.__mc (debug/hooks.ts); ?test=1&style=1 shows the
 * art style sheet.
 */
import '@kit/ui';
import './styles.css';
import { boot } from './app';
import { installHooks } from './debug/hooks';

const root = document.getElementById('app')!;
const app = boot(root);
const style = app.test ? app.params.get('style') : null;
if (app.test) installHooks(app);
app.go(style ? { name: 'style' } : { name: 'home' });
root.dataset.ready = '';
