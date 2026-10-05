// 素材与致谢 (/credits/) — static page; reached from the parent page. Content mirrors
// assets-src/LICENSES.md. The document scrolls inside .cr (adult reading page).
import { initShell } from '@kit/shell';
import './credits.css';

initShell({ game: 'credits', startGate: false, log: false, audio: false, back: { href: '/parent/', label: '返回' } });
document.getElementById('app')!.dataset.ready = '';
