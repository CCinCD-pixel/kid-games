/**
 * The 12 knowledge cards' cut-paper illustrations (spec §6.7): 3–4 paper layers with an offset shadow,
 * simple geometry, each well under 3 KB. 3:2 cards (viewBox 120 × 80).
 */
const SH = 'filter="url(#mc-ka-sh)"';
const DEFS = `<defs><filter id="mc-ka-sh" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="2.2" stdDeviation="0" flood-color="#3b2410" flood-opacity=".3"/></filter></defs>`;
const SKY = (c1: string, c2: string) => `<rect width="120" height="80" rx="10" fill="${c1}"/><path d="M0 58c22-8 40-4 60-10s38-8 60-2v24a10 10 0 0 1-10 10H10A10 10 0 0 1 0 70z" fill="${c2}" ${SH}/>`;

const ART: Record<string, string> = {
  rail: `${SKY('#cfe3f6', '#9cc28a')}<path d="M0 66h120" stroke="#5b4a3a" stroke-width="3"/><path d="M4 70h112" stroke="#5b4a3a" stroke-width="1.6" stroke-dasharray="4 5"/>
    <g ${SH}><path d="M14 62V48c0-6 4-10 10-10h52c14 0 26 8 32 20l2 4z" fill="#f4f6fb"/><path d="M76 38c14 0 26 8 32 20H88c-6 0-10-4-12-10z" fill="#3f7be6"/></g>
    <path d="M22 46h8v6h-8zM36 46h8v6h-8zM50 46h8v6h-8zM64 46h8v6h-8z" fill="#2b5cb8"/><path d="M14 58h96" stroke="#e4513d" stroke-width="2.5"/>`,
  engineer: `${SKY('#f7e7c8', '#c8b080')}<path d="M8 60c16-18 36-18 52 0" fill="none" stroke="#8f5d30" stroke-width="5" ${SH}/><path d="M14 60v-6M24 60v-12M34 60v-14M44 60v-12M54 60v-6" stroke="#8f5d30" stroke-width="2.4"/>
    <g transform="translate(70 14) rotate(30)" ${SH}><rect x="-3" y="0" width="6" height="40" rx="2" fill="#8f5d30"/><path d="M-11 38h22l-3 18c-1 4-15 4-16 0z" fill="#9aa3b2"/><rect x="-8" y="-4" width="16" height="6" rx="3" fill="#5e3a1c"/></g>`,
  mine: `${SKY('#e9ecd6', '#a9b48a')}<g ${SH}><ellipse cx="52" cy="58" rx="30" ry="12" fill="#4e5544"/><ellipse cx="52" cy="53" rx="20" ry="7" fill="#6e7860"/></g>
    <path d="M24 54l-6-5M33 47l-3-7M52 45v-8M71 47l3-7M80 54l6-5" stroke="#4e5544" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M92 64V26" stroke="#5e3a1c" stroke-width="2.6" stroke-linecap="round"/><path d="M93 27h16l-4 6 4 6H93z" fill="#e4513d" ${SH}/>`,
  bomb: `${SKY('#fdeedd', '#f2c39b')}<g ${SH}><circle cx="56" cy="48" r="20" fill="#3a3f52"/></g><circle cx="49" cy="41" r="5" fill="#fff" opacity=".35"/>
    <path d="M68 32l6-6" stroke="#3a3f52" stroke-width="6" stroke-linecap="round"/><path d="M75 25c3-6 8-6 11-2" fill="none" stroke="#8f5d30" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M90 18l1.6 4.4 4.4 1.6-4.4 1.6L90 30l-1.6-4.4-4.4-1.6 4.4-1.6z" fill="#f6b934"/><path d="M20 70h30M70 70h30" stroke="#e4513d" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
  flag: `${SKY('#d8e8ff', '#8fb6e8')}<path d="M40 74V10" stroke="#5e3a1c" stroke-width="3.4" stroke-linecap="round"/><circle cx="40" cy="9" r="3.6" fill="#f6b934"/>
    <path d="M42 12c12-6 22 6 36 0s20-2 24 2v26c-8-4-14-4-24 0s-24-6-36 0z" fill="#e4513d" ${SH}/><path d="M42 12c12-6 22 6 36 0" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`,
  camp: `${SKY('#1f2a52', '#3b4a35')}<circle cx="96" cy="16" r="6" fill="#ffe9a3"/><g ${SH}><path d="M14 66L44 22l30 44z" fill="#9bb36a"/><path d="M44 22L36 66h16z" fill="#6b7f3c"/></g>
    <g ${SH}><path d="M86 66c-6 0-9-6-6-12 2 4 4 4 5 0 2 3 4 3 6-2 4 6 2 14-5 14z" fill="#f6b934"/></g><path d="M78 68h18" stroke="#8f5d30" stroke-width="3" stroke-linecap="round"/>`,
  hq: `${SKY('#f3e3c9', '#c9b48c')}<g ${SH}><path d="M24 64V36h72v28z" fill="#fff6e3"/><path d="M18 38L60 14l42 24z" fill="#b8342a"/></g>
    <rect x="52" y="46" width="16" height="18" rx="2" fill="#8f5d30"/><path d="M32 44h12v8H32zM76 44h12v8H76z" fill="#9cc2e8"/><path d="M60 14V4" stroke="#5e3a1c" stroke-width="2"/><path d="M61 4h9l-2 3 2 3h-9z" fill="#f6b934"/>`,
  plan: `${SKY('#e7f0e2', '#b8cf9e')}<g ${SH} transform="rotate(-6 60 42)"><rect x="18" y="14" width="84" height="56" rx="4" fill="#fff6e3"/><path d="M46 14v56M74 14v56" stroke="#e6d6b4" stroke-width="2"/></g>
    <path d="M30 56c10-14 24-4 32-16s18-8 26-18" fill="none" stroke="#e4513d" stroke-width="2.6" stroke-dasharray="5 4"/>
    <g ${SH}><path d="M88 22V10" stroke="#5e3a1c" stroke-width="2"/><path d="M89 10h9l-2 3 2 3h-9z" fill="#3f7be6"/><circle cx="30" cy="56" r="4" fill="#e4513d"/></g>`,
  mountain: `${SKY('#dfe9f5', '#7f9452')}<g ${SH}><path d="M6 64L34 24l20 26 12-14 26 28z" fill="#5d6f3c"/><path d="M34 24l-6 10 6-2 4 6M66 36l-4 7 5-2" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/></g>
    <g fill="#2a241d"><rect x="10" y="64" width="16" height="4" rx="1"/><rect x="52" y="64" width="16" height="4" rx="1"/><rect x="94" y="64" width="16" height="4" rx="1"/></g>
    <path d="M18 60v12M60 60v12M102 60v12" stroke="#f1e8cf" stroke-width="2.4" stroke-dasharray="3 3"/>`,
  referee: `${SKY('#eef0f6', '#c4c9d8')}<g ${SH} transform="rotate(-12 50 46)"><rect x="18" y="34" width="56" height="22" rx="5" fill="#1d1d24"/><rect x="28" y="34" width="9" height="22" fill="#f6f2e8"/><rect x="46" y="34" width="9" height="22" fill="#f6f2e8"/></g>
    <g ${SH} transform="translate(80 22)"><path d="M0 12h18l14-6v12l-8 4a10 10 0 1 1-24-2z" fill="#dfe4ec" stroke="#8b93a3" stroke-width="1.6"/><circle cx="10" cy="20" r="3" fill="#8b93a3"/></g>`,
  family: `${SKY('#fbe9d6', '#e3c39c')}<g ${SH}><rect x="34" y="34" width="52" height="8" rx="3" fill="#8f5d30"/><path d="M40 42v24M80 42v24" stroke="#8f5d30" stroke-width="4"/></g>
    <g ${SH}><path d="M14 30v36M14 50h14v16" stroke="#3f7be6" stroke-width="4.5" stroke-linecap="round" fill="none"/><path d="M106 30v36M106 50H92v16" stroke="#e4513d" stroke-width="4.5" stroke-linecap="round" fill="none"/></g>
    <rect x="52" y="27" width="16" height="7" rx="1.5" fill="#b8342a"/><rect x="56" y="22" width="12" height="6" rx="1.5" fill="#2d5ba3"/>`,
  fair: `${SKY('#e8f3ef', '#a9d6c8')}<g ${SH}><path d="M8 50l16-16 14 6 10-4 16 2 20 14-8 8-14-8-14 14c-4 4-10 4-14 0z" fill="#f2c39b"/></g>
    <path d="M34 44l-9 9M44 48l-9 9M52 52l-7 7" stroke="#c98a5e" stroke-width="2.4" stroke-linecap="round"/><path d="M96 20l2.6 5.4 6 .8-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2 6-.8z" fill="#f6b934"/>`,
};

export function cardArt(id: string, height = 120): string {
  const w = Math.round((height * 3) / 2);
  return `<svg class="mc-cardart" viewBox="0 0 120 80" width="${w}" height="${height}" aria-hidden="true">${DEFS}${ART[id] ?? ''}</svg>`;
}
export const CARD_ART_IDS = Object.keys(ART);
