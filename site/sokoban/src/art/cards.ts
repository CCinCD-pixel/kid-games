/**
 * 知识卡 illustrations (spec §5.5, §6.4): hand-written SVG in the 星港 paper-cut style — 2–3 paper
 * layers with cream rims and offset paper shadows, night-blue skies, the game's own colours.
 * Budget per card: ≤ 40 paths, ≤ 6 KB. viewBox 240 × 160. Text lives outside the art (title + line).
 */

const SKY = '#1B2A63';
const SKY2 = '#26346E';
const RIM = '#E8D5B1';
const SH = 'rgba(3,5,22,.35)';

function stars(pts: [number, number, number][]): string {
  return pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFF6E3" opacity=".8"/>`).join('');
}

const FRAME = (id: string, inner: string, bg = SKY) =>
  `<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><clipPath id="sok-card-${id}"><rect width="240" height="160" rx="18"/></clipPath><g clip-path="url(#sok-card-${id})"><rect width="240" height="160" fill="${bg}"/>${inner}</g><rect x="1.5" y="1.5" width="237" height="157" rx="17" fill="none" stroke="${RIM}" stroke-width="3" opacity=".7"/></svg>`;

/** 天舟货运飞船: the cargo ship gliding in to dock at the station above the Earth. */
const tianzhou = FRAME('tianzhou', `
${stars([[20, 22, 1.4], [62, 14, 1], [110, 30, 1.2], [214, 18, 1.4], [190, 44, 1], [36, 58, 1]])}
<circle cx="120" cy="330" r="210" fill="#2C5FC4"/><circle cx="120" cy="330" r="210" fill="none" stroke="#8FF7EC" stroke-width="4" opacity=".35"/>
<path d="M-10 140Q60 118 130 126T250 120V170H-10Z" fill="#1AA892" opacity=".45"/>
<g transform="translate(3 4)" fill="${SH}"><rect x="150" y="58" width="58" height="28" rx="11"/><rect x="56" y="64" width="50" height="22" rx="9"/></g>
<rect x="120" y="63" width="30" height="18" rx="4" fill="#5466B0"/>
<rect x="196" y="32" width="34" height="18" rx="3" fill="#8594D6"/><rect x="196" y="94" width="34" height="18" rx="3" fill="#8594D6"/>
<path d="M200 41H226M200 103H226M213 32V50M213 94V112" stroke="#35468C" stroke-width="2"/>
<path d="M213 50V60M213 84V94" stroke="#B7C1EC" stroke-width="3"/>
<rect x="150" y="58" width="58" height="28" rx="11" fill="#E2E7FB" stroke="${RIM}" stroke-width="2"/>
<circle cx="150" cy="72" r="9" fill="#B7C1EC"/><circle cx="180" cy="72" r="3.4" fill="#F6B934"/>
<rect x="64" y="40" width="10" height="22" rx="2" fill="#3F7BE6"/><rect x="64" y="88" width="10" height="22" rx="2" fill="#3F7BE6"/>
<path d="M69 62V66M69 84V88" stroke="#B7C1EC" stroke-width="2.4"/>
<rect x="56" y="64" width="50" height="22" rx="9" fill="#F6B934" stroke="${RIM}" stroke-width="2"/>
<rect x="84" y="64" width="22" height="22" rx="0" fill="#DF9A1C"/>
<path d="M106 69L116 72L106 81Z" fill="#E2E7FB"/>
<path d="M20 70H44M26 79H46M18 88H40" stroke="#FFF6E3" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="6 5" opacity=".7"/>`);

/** 长征七号: the rocket lifting off its pad beside the lattice tower. */
const cz7 = FRAME('cz7', `
${stars([[24, 20, 1.3], [70, 36, 1], [200, 22, 1.4], [218, 60, 1], [164, 14, 1.1]])}
<circle cx="122" cy="96" r="70" fill="#35468C" opacity=".55"/>
<path d="M-10 132Q60 120 120 128T250 124V170H-10Z" fill="#2A3460"/><path d="M-10 132Q60 120 120 128T250 124" fill="none" stroke="${RIM}" stroke-width="2" opacity=".7"/>
<path d="M58 132V30H74V132" fill="none" stroke="#5466B0" stroke-width="3.4"/>
<path d="M58 40L74 56M74 40L58 56M58 66L74 82M74 66L58 82M58 92L74 108M74 92L58 108" stroke="#5466B0" stroke-width="2.2"/>
<rect x="74" y="58" width="30" height="5" fill="#5466B0"/>
<g transform="translate(3 4)" fill="${SH}"><path d="M114 26C114 36 110 44 110 52V112H134V52C134 44 130 36 130 26Q122 10 114 26Z"/></g>
<path d="M120 128Q108 150 92 160H152Q136 150 124 128Z" fill="#F9A726"/><path d="M121 128Q114 146 108 160H140Q132 146 123 128Z" fill="#F6B934"/>
<circle cx="96" cy="140" r="12" fill="#E8E2F0" opacity=".85"/><circle cx="148" cy="142" r="14" fill="#E8E2F0" opacity=".85"/><circle cx="80" cy="150" r="10" fill="#E8E2F0" opacity=".7"/>
<rect x="100" y="70" width="10" height="50" rx="4" fill="#F6F7FB" stroke="${RIM}" stroke-width="1.6"/><rect x="134" y="70" width="10" height="50" rx="4" fill="#F6F7FB" stroke="${RIM}" stroke-width="1.6"/>
<path d="M100 72Q105 58 110 72ZM134 72Q139 58 144 72Z" fill="#F6F7FB"/>
<path d="M112 26C112 36 108 44 108 52V124H136V52C136 44 132 36 132 26Q122 6 112 26Z" fill="#F6F7FB" stroke="${RIM}" stroke-width="2"/>
<path d="M126 30C130 40 136 46 136 52V124H126Z" fill="#CBD2E4"/>
<path d="M114 22Q122 4 130 22Q122 18 114 22Z" fill="#E4513D"/>
<rect x="108" y="86" width="28" height="6" fill="#F9A726"/><circle cx="122" cy="44" r="5" fill="#0C1230"/><circle cx="122" cy="44" r="2.4" fill="#F6B934"/>`);

/** 文昌发射场: a rocket climbing over the sea from the palm-lined coast; the dashed equator below. */
const wenchang = FRAME('wenchang', `
<rect width="240" height="96" fill="#F08A5D"/><rect width="240" height="52" fill="#F6B934" opacity=".45"/>
<circle cx="188" cy="74" r="20" fill="#FFD863"/>
<rect y="92" width="240" height="68" fill="#2C5FC4"/>
<path d="M0 104Q20 100 40 104T80 104T120 104T160 104T200 104T240 104M10 120Q30 116 50 120T90 120T130 120T170 120T210 120" fill="none" stroke="#B9E9FF" stroke-width="2" opacity=".7"/>
<path d="M-10 160V128Q30 116 74 124Q104 132 118 160Z" fill="#F4E7CD"/><path d="M-10 128Q30 116 74 124Q104 132 118 160" fill="none" stroke="${RIM}" stroke-width="2"/>
<path d="M30 126Q26 100 34 82" fill="none" stroke="#7C4E22" stroke-width="4" stroke-linecap="round"/>
<path d="M34 82Q18 76 8 84Q22 80 34 84Q22 90 16 102Q30 90 35 85Q46 92 50 104Q48 90 37 83Q50 76 62 80Q48 72 34 82Z" fill="#1AA892"/>
<path d="M60 128Q58 110 64 98" fill="none" stroke="#7C4E22" stroke-width="3.4" stroke-linecap="round"/>
<path d="M64 98Q52 94 44 100Q56 98 64 100Q56 106 52 114Q62 106 65 101Q74 106 76 114Q74 104 66 99Q76 94 84 98Q74 92 64 98Z" fill="#0F7466"/>
<path d="M150 92V40M150 50L160 60M160 50L150 60M150 70L160 80M160 70L150 80" stroke="#5466B0" stroke-width="2.6"/>
<path d="M176 88Q172 60 168 34" fill="none" stroke="#FFF6E3" stroke-width="5" stroke-linecap="round" opacity=".55"/>
<g transform="rotate(-8 168 30)"><path d="M163 30V12Q168 0 173 12V30Z" fill="#F6F7FB" stroke="${RIM}" stroke-width="1.6"/><path d="M164 8Q168 -2 172 8Z" fill="#E4513D"/><path d="M164 30L168 42L172 30Z" fill="#F6B934"/></g>
<path d="M-4 146Q120 132 244 146" fill="none" stroke="#FFF6E3" stroke-width="2.4" stroke-dasharray="8 6"/>
<circle cx="96" cy="139" r="4.4" fill="#E4513D" stroke="#FFF6E3" stroke-width="2"/>`, '#EB6A3C');

/** 货物要绑好: inside a station module — crates strapped to the wall, an apple and a pencil floating by. */
const strap = FRAME('strap', `
<rect x="8" y="10" width="224" height="140" rx="26" fill="#E2E7FB"/>
<path d="M8 50H232M8 110H232M64 10V150M176 10V150" stroke="#B7C1EC" stroke-width="2"/>
<circle cx="204" cy="40" r="20" fill="${SKY}" stroke="#8594D6" stroke-width="5"/><path d="M188 52Q204 38 220 50V60H188Z" fill="#2C5FC4"/>
<g transform="translate(3 4)" fill="${SH}"><rect x="26" y="64" width="54" height="50" rx="8"/><rect x="88" y="78" width="44" height="40" rx="7"/></g>
<rect x="26" y="64" width="54" height="50" rx="8" fill="#A27038" stroke="#4A2D12" stroke-width="2.4"/>
<rect x="49" y="64" width="9" height="50" fill="#F9A726"/>
<rect x="88" y="78" width="44" height="40" rx="7" fill="#A27038" stroke="#4A2D12" stroke-width="2.4"/>
<rect x="106" y="78" width="8" height="40" fill="#F9A726"/>
<path d="M20 84H138M20 100H138" stroke="#F6B934" stroke-width="5"/>
<rect x="134" y="80" width="10" height="8" rx="2" fill="#35468C"/><rect x="134" y="96" width="10" height="8" rx="2" fill="#35468C"/>
<rect x="14" y="80" width="10" height="8" rx="2" fill="#35468C"/><rect x="14" y="96" width="10" height="8" rx="2" fill="#35468C"/>
<g transform="rotate(-18 172 98)"><circle cx="172" cy="98" r="12" fill="#E4513D"/><path d="M172 86Q170 80 176 78" stroke="#4A2D12" stroke-width="2.4" fill="none"/><path d="M174 84Q182 78 186 84Q180 88 174 84Z" fill="#1AA892"/></g>
<g transform="rotate(32 196 124)"><rect x="176" y="120" width="34" height="7" rx="2" fill="#F6B934"/><path d="M210 120L218 123.5L210 127Z" fill="#E8D5B1"/><rect x="174" y="120" width="5" height="7" fill="#E4513D"/></g>
<path d="M150 84Q156 78 162 82M188 132Q194 138 200 134" stroke="#8594D6" stroke-width="2" fill="none" stroke-linecap="round"/>`);

/** 先用的放门口: a cargo hold — the crate needed first waits by the open door (1), the later ones go in deeper. */
const order = FRAME('order', `
<rect width="240" height="160" fill="${SKY2}"/>
<path d="M0 118H240V160H0Z" fill="#3B2A4F"/><path d="M0 118H240" stroke="${RIM}" stroke-width="2" opacity=".6"/>
<rect x="190" y="30" width="44" height="88" rx="6" fill="#FFD863"/><rect x="190" y="30" width="44" height="88" rx="6" fill="none" stroke="#FFF6E3" stroke-width="3"/>
<path d="M234 30L250 22V126L234 118Z" fill="#776A85"/>
<path d="M190 118L240 160H170Z" fill="#FFD863" opacity=".35"/>
<g transform="translate(3 4)" fill="${SH}"><rect x="140" y="72" width="44" height="44" rx="7"/><rect x="88" y="72" width="44" height="44" rx="7"/><rect x="36" y="72" width="44" height="44" rx="7"/></g>
<rect x="36" y="72" width="44" height="44" rx="7" fill="#A27038" stroke="#4A2D12" stroke-width="2.4"/>
<rect x="88" y="72" width="44" height="44" rx="7" fill="#A27038" stroke="#4A2D12" stroke-width="2.4"/>
<rect x="140" y="72" width="44" height="44" rx="7" fill="#A27038" stroke="#4A2D12" stroke-width="2.4"/>
<path d="M54 72V116M106 72V116M158 72V116" stroke="#F9A726" stroke-width="7"/>
<circle cx="58" cy="94" r="12" fill="#FFF6E3"/><circle cx="110" cy="94" r="12" fill="#FFF6E3"/><circle cx="162" cy="94" r="12" fill="#FFF6E3" stroke="#1AA892" stroke-width="3"/>
<text x="58" y="100" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="17" fill="#4A2D12">3</text>
<text x="110" y="100" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="17" fill="#4A2D12">2</text>
<text x="162" y="100" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="17" fill="#0F7466">1</text>
<path d="M150 46H196M188 38L198 46L188 54" stroke="#FFF6E3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
${stars([[20, 20, 1.2], [70, 30, 1], [120, 18, 1.3], [160, 26, 1]])}`);

export const CARD_ART: Record<string, string> = { tianzhou, cz7, wenchang, strap, order };

/** The card illustration (empty string for an unknown id). */
export function cardArt(id: string): string {
  return CARD_ART[id] ?? '';
}
