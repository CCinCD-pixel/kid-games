/** Small cut-paper illustrations for the camp cards, mode cards and the result page (code-drawn SVG). */

const paperShadow = 'filter="url(#mc-art-sh)"';
const DEFS = `<defs><filter id="mc-art-sh" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="0" flood-color="#3b2410" flood-opacity=".28"/></filter></defs>`;

export type ArtId = 'academy' | 'battle' | 'puzzle' | 'family' | 'ming' | 'fan' | 'physical' | 'flag-gold' | 'medal' | 'hands';

const ART: Record<ArtId, string> = {
  academy: `<rect x="14" y="30" width="68" height="50" rx="6" fill="#3f7be6" ${paperShadow}/><path d="M18 34h28v42H22a4 4 0 0 1-4-4z" fill="#fff6e3"/><path d="M50 34h28v38a4 4 0 0 1-4 4H50z" fill="#fff1d2"/><path d="M48 32v46" stroke="#2b5cb8" stroke-width="3"/>
    <path d="M24 44h16M24 52h16M24 60h12M56 44h16M56 52h16M56 60h10" stroke="#c9b48c" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M70 10v28" stroke="#5e3a1c" stroke-width="3" stroke-linecap="round"/><path d="M71.5 11c5-2 8 2 14 0v12c-6 2-9-2-14 0z" fill="#e4513d" ${paperShadow}/>`,
  battle: `<g ${paperShadow}><rect x="8" y="30" width="36" height="32" rx="10" fill="#9bb36a"/><rect x="14" y="38" width="24" height="14" rx="5" fill="#1f2a3a"/><circle cx="21" cy="45" r="3" fill="#7ef0d0"/><circle cx="31" cy="45" r="3" fill="#7ef0d0"/><path d="M14 30q12-14 24 0" fill="#7d8f34"/></g>
    <g ${paperShadow}><rect x="52" y="30" width="36" height="32" rx="10" fill="#8aa0c8"/><rect x="58" y="38" width="24" height="14" rx="5" fill="#1f2a3a"/><circle cx="65" cy="45" r="3" fill="#ffd56b"/><circle cx="75" cy="45" r="3" fill="#ffd56b"/><ellipse cx="72" cy="29" rx="16" ry="5" fill="#3c4a68"/></g>
    <path d="M40 74l8-8 8 8M48 66v16" stroke="#e4513d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  puzzle: `<rect x="10" y="22" width="76" height="60" rx="8" fill="#8f5d30" ${paperShadow}/><rect x="16" y="28" width="64" height="48" rx="4" fill="#7f9452"/>
    <path d="M16 44h64M16 60h64M37 28v48M59 28v48" stroke="#f4ecd3" stroke-width="2"/><path d="M16 44h64" stroke="#2a241d" stroke-width="4"/><path d="M16 44h64" stroke="#f1e8cf" stroke-width="2.4" stroke-dasharray="6 6"/>
    <rect x="44" y="52" width="22" height="14" rx="3" fill="#b8342a" ${paperShadow}/><path d="M76 8l3.5 7 7.7 1.1-5.6 5.4 1.3 7.7-6.9-3.6-6.9 3.6 1.3-7.7-5.6-5.4 7.7-1.1z" fill="#f6b934" ${paperShadow}/>`,
  family: `<g ${paperShadow}><path d="M8 58l16-16 14 6 10-4 16 2 22 14-8 8-14-8-14 14c-4 4-10 4-14 0z" fill="#f2c39b"/><path d="M8 58l16-16 10 4-6 10" fill="#e8ad80"/></g>
    <path d="M34 50l-9 9M44 54l-9 9M52 58l-7 7" stroke="#c98a5e" stroke-width="2.4" stroke-linecap="round"/><path d="M60 22l3 6 6.5.9-4.7 4.6 1.1 6.5-5.9-3.1-5.9 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="#f6b934"/>`,
  ming: `<rect x="12" y="26" width="34" height="20" rx="4" fill="#b8342a" ${paperShadow}/><rect x="50" y="26" width="34" height="20" rx="5" fill="#2d5ba3" ${paperShadow}/>
    <rect x="12" y="52" width="34" height="20" rx="4" fill="#b8342a" ${paperShadow}/><rect x="50" y="52" width="34" height="20" rx="5" fill="#2d5ba3" ${paperShadow}/>
    <circle cx="38" cy="36" r="6" fill="#f6c548"/><circle cx="76" cy="36" r="6" fill="#f6c548"/><circle cx="38" cy="62" r="6" fill="#f6c548"/><circle cx="76" cy="62" r="6" fill="#f6c548"/>
    <path d="M18 36h12M56 36h12M18 62h12M56 62h12" stroke="#fff2d6" stroke-width="3" stroke-linecap="round"/>`,
  fan: `<rect x="10" y="30" width="36" height="22" rx="5" fill="#9a6638" ${paperShadow}/><circle cx="28" cy="41" r="6" fill="none" stroke="#f3d3a4" stroke-width="2"/>
    <g transform="rotate(-14 66 44)"><rect x="48" y="30" width="36" height="22" rx="4" fill="#b8342a" ${paperShadow}/><circle cx="76" cy="41" r="6" fill="#f6c548"/><path d="M54 41h12" stroke="#fff2d6" stroke-width="3" stroke-linecap="round"/></g>
    <path d="M26 66c10 10 30 10 40 0" fill="none" stroke="#f6b934" stroke-width="3.5" stroke-linecap="round"/><path d="M62 62l5 4-6 2" fill="none" stroke="#f6b934" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  physical: `<rect x="10" y="20" width="44" height="58" rx="8" fill="#26304f" ${paperShadow}/><rect x="15" y="26" width="34" height="42" rx="4" fill="#3c4a78"/><circle cx="32" cy="73" r="2.4" fill="#8892b8"/>
    <path d="M22 46l8 8 14-16" stroke="#7ef0d0" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="58" y="44" width="30" height="16" rx="4" fill="#b8342a" ${paperShadow}/><rect x="60" y="64" width="30" height="16" rx="5" fill="#2d5ba3" ${paperShadow}/>
    <g transform="translate(64 14)"><path d="M0 8h12l9-4v8l-5 2a7 7 0 1 1-16-1z" fill="#dfe4ec" stroke="#8b93a3"/></g>`,
  'flag-gold': `<path d="M30 12v70" stroke="#8a5a00" stroke-width="5" stroke-linecap="round"/><path d="M32 14c14-6 24 6 40 0l8-2v34c-16 6-26-6-40 0l-8 3z" fill="#f6c548" ${paperShadow}/><circle cx="30" cy="11" r="5" fill="#f6c548"/>`,
  medal: `<path d="M30 8h14l6 20-12 4zM66 8H52l-6 20 12 4z" fill="#3f7be6"/><circle cx="48" cy="56" r="24" fill="#f6c548" ${paperShadow}/><circle cx="48" cy="56" r="17" fill="none" stroke="#c8900f" stroke-width="3"/><path d="M48 44l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1-7.2-3.8-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z" fill="#fff6e3"/>`,
  hands: `<g ${paperShadow}><path d="M6 60l18-18 16 7 12-5 18 2 20 16-9 9-15-9-16 16c-4.5 4.5-11.5 4.5-16 0z" fill="#f2c39b"/></g><path d="M36 54l-10 10M47 58l-10 10M56 62l-8 8" stroke="#c98a5e" stroke-width="2.6" stroke-linecap="round"/>`,
};

export function art(id: ArtId, size = 96): string {
  return `<svg viewBox="0 0 96 96" width="${size}" height="${size}" aria-hidden="true">${DEFS}${ART[id]}</svg>`;
}
