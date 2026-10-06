/**
 * 星晶号 (spec §6.9): side view, one <g data-mod> per module so a module can "scan in" when it is
 * installed. v1 modules: thrusters, legs, arm, shield (2 paints each, §5.4); modules not installed are
 * dashed outlines. `all: true` (hangar) also outlines the five v2 slots (救援舱段 太阳翼 探照灯 深空雷达
 * 庆典彩灯). Paints get a light / dark pair by the design system's paper rule.
 */
export type ModuleKey = 'thrusters' | 'legs' | 'arm' | 'shield';
export type FutureKey = 'bay' | 'wings' | 'lamp' | 'radar' | 'lights';
export const MODULES: ModuleKey[] = ['thrusters', 'legs', 'arm', 'shield'];
export const FUTURE: { key: FutureKey; name: string }[] = [
  { key: 'bay', name: '救援舱段' }, { key: 'wings', name: '太阳翼' }, { key: 'lamp', name: '探照灯' }, { key: 'radar', name: '深空雷达' }, { key: 'lights', name: '庆典彩灯' },
];
export const MODULE_NAMES: Record<ModuleKey, string> = { thrusters: '主推进器', legs: '着陆腿', arm: '机械臂', shield: '防护罩' };
export const PAINTS: Record<ModuleKey, [string, string]> = { thrusters: ['#5FB4FF', '#FF9A3C'], legs: ['#C9D2DE', '#E8C35A'], arm: ['#E8473F', '#F4F1EA'], shield: ['#7FE3F0', '#B99BF0'] };
export const PAINT_NAMES: Record<ModuleKey, [string, string]> = { thrusters: ['蓝焰', '橙焰'], legs: ['银色', '金色'], arm: ['红色', '白色'], shield: ['青色', '紫色'] };

const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixc = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
const light = (c: string) => mixc(c, '#ffffff', 0.38);
const dark = (c: string) => mixc(c, '#000000', 0.22);

let sid = 0;
export function shipSvg(installed: Partial<Record<ModuleKey, string>> = {}, o: { flame?: boolean; all?: boolean; scan?: ModuleKey; /** false: no dashed outlines for unbuilt modules (gate, cutscene) */ slots?: boolean } = {}): string {
  const p = `sh${(sid += 1)}`;
  const dash = 'fill="none" stroke="#cfd8ff" stroke-width="3" stroke-dasharray="6 6" opacity=".55"';
  const has = (m: ModuleKey) => installed[m] !== undefined;
  const col = (m: ModuleKey) => installed[m] ?? PAINTS[m][0];
  const scan = (m: ModuleKey) => (o.scan === m ? ` class="em-ship__scan"` : '');
  const f = col('thrusters');
  const thr = has('thrusters')
    ? `<g data-mod="thrusters"${scan('thrusters')}>
        ${o.flame !== false ? `<path d="M10 66Q-30 80 10 94Z" fill="url(#${p}fl)"/><path d="M10 96Q-30 110 10 124Z" fill="url(#${p}fl)"/><path d="M10 72Q-8 80 10 88Z" fill="#fff" opacity=".85"/><path d="M10 102Q-8 110 10 118Z" fill="#fff" opacity=".85"/>` : ''}
        <path d="M8 68L22 64H48V96H22L8 92Z" fill="#3b4a8a" stroke="#1d2654" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 98L22 94H48V126H22L8 122Z" fill="#3b4a8a" stroke="#1d2654" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="22" y="70" width="22" height="5" rx="2.5" fill="${light(f)}" opacity=".9"/><rect x="22" y="100" width="22" height="5" rx="2.5" fill="${light(f)}" opacity=".9"/>
        <circle cx="16" cy="80" r="5" fill="${f}"/><circle cx="16" cy="110" r="5" fill="${f}"/></g>`
    : o.slots === false ? '' : `<g data-mod=\"thrusters\"><path d="M8 68L22 64H48V96H22L8 92Z" ${dash}/><path d="M8 98L22 94H48V126H22L8 122Z" ${dash}/></g>`;
  const lg = col('legs');
  const legs = has('legs')
    ? `<g data-mod="legs"${scan('legs')}><g stroke="${dark(lg)}" stroke-width="9" stroke-linecap="round" fill="none"><path d="M84 128L64 158M132 132V160M182 128L200 158"/></g>
        <g stroke="${lg}" stroke-width="5.5" stroke-linecap="round" fill="none"><path d="M84 128L64 158M132 132V160M182 128L200 158"/></g>
        <g fill="${dark(lg)}"><circle cx="84" cy="128" r="6"/><circle cx="132" cy="132" r="6"/><circle cx="182" cy="128" r="6"/></g>
        <g fill="${lg}" stroke="${dark(lg)}" stroke-width="2"><rect x="50" y="156" width="28" height="8" rx="4"/><rect x="118" y="158" width="28" height="8" rx="4"/><rect x="186" y="156" width="28" height="8" rx="4"/></g></g>`
    : o.slots === false ? '' : `<g data-mod=\"legs\"><path d="M84 128L64 158M132 132V160M182 128L200 158" ${dash}/></g>`;
  const ac = col('arm');
  const arm = has('arm')
    ? `<g data-mod="arm"${scan('arm')}><g stroke="${dark(ac)}" stroke-width="10" stroke-linecap="round" fill="none"><path d="M150 124l18 20l26 -8"/></g><g stroke="${ac}" stroke-width="6.5" stroke-linecap="round" fill="none"><path d="M150 124l18 20l26 -8"/></g>
        <circle cx="168" cy="144" r="6.5" fill="#2b2d5c" stroke="#fff" stroke-width="1.5"/><circle cx="150" cy="124" r="5.5" fill="#2b2d5c"/>
        <path d="M194 136l12 -7M194 136l12 6" stroke="${dark(ac)}" stroke-width="6" stroke-linecap="round"/><path d="M194 136l12 -7M194 136l12 6" stroke="${ac}" stroke-width="3.5" stroke-linecap="round"/></g>`
    : o.slots === false ? '' : `<g data-mod=\"arm\"><path d="M150 124l18 20l26 -8" ${dash}/></g>`;
  const sc = col('shield');
  const shield = has('shield')
    ? `<g data-mod="shield"${scan('shield')}><path d="M214 46Q276 95 214 144" fill="${sc}" opacity=".28"/><path d="M214 46Q276 95 214 144" fill="none" stroke="${light(sc)}" stroke-width="4"/>
        <path d="M228 62L242 70L242 86L228 94L214 86M242 86L256 94M228 94V110M242 104L228 112" fill="none" stroke="${light(sc)}" stroke-width="1.6" opacity=".7"/>
        <path d="M222 56Q246 72 250 92" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></g>`
    : o.slots === false ? '' : `<g data-mod=\"shield\"><path d="M214 46Q276 95 214 144" ${dash}/></g>`;
  const future = o.all ? `<g class="em-ship__future" ${dash.replace('fill="none" ', '')} fill="none">
      <rect x="104" y="138" width="40" height="22" rx="8"/>
      <path d="M78 52L60 14H118L104 52M78 140L60 176" />
      <path d="M238 78l28 -14v34z"/>
      <path d="M150 50q2 -26 26 -28M163 36l10 -12"/>
      <path d="M56 106H226"/></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-36 ${o.all ? 6 : 20} 316 ${o.all ? 178 : 152}" class="em-ship">
    <defs>
      <linearGradient id="${p}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e9edf7"/><stop offset="1" stop-color="#b9c2d9"/></linearGradient>
      <linearGradient id="${p}fl" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${light(f)}"/><stop offset=".55" stop-color="${f}"/><stop offset="1" stop-color="${f}" stop-opacity="0"/></linearGradient>
      <linearGradient id="${p}fin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e57ac0"/><stop offset="1" stop-color="#a2287b"/></linearGradient>
      <clipPath id="${p}c"><path d="M40 62Q40 52 52 52H170Q234 56 248 95Q234 134 170 138H52Q40 138 40 128Z"/></clipPath>
    </defs>
    ${future}${thr}${legs}
    <path d="M60 52L86 28H132L122 52Z" fill="url(#${p}fin)" stroke="#7a1d5d" stroke-width="2" stroke-linejoin="round"/><path d="M60 138L86 160H122L112 138Z" fill="#92136f" stroke="#5e0d48" stroke-width="2" stroke-linejoin="round"/>
    <path d="M40 62Q40 52 52 52H170Q234 56 248 95Q234 134 170 138H52Q40 138 40 128Z" fill="url(#${p}h)" stroke="#8f9bbb" stroke-width="3"/>
    <g clip-path="url(#${p}c)">
      <rect x="40" y="114" width="214" height="30" fill="#c9d0e2" opacity=".55"/>
      <path d="M52 95H244" stroke="#c8459d" stroke-width="7"/><path d="M52 103H244" stroke="#f6b934" stroke-width="2.5" opacity=".9"/>
      <path d="M92 52V138M150 52V138" stroke="#a9b2c8" stroke-width="1.6" opacity=".7"/>
    </g>
    <g fill="#9aa6c4">${[60, 76, 112, 128, 166, 182].map((x) => `<circle cx="${x}" cy="60" r="1.8"/><circle cx="${x}" cy="130" r="1.8"/>`).join('')}</g>
    <circle cx="196" cy="80" r="18" fill="#1d4f6a" stroke="#e9e4d8" stroke-width="5"/><circle cx="196" cy="80" r="12" fill="#2a8fb0"/>
    <g fill="#5fe3f0">${[[-4, -3], [3, -3]].map(([dx, dy]) => `<rect x="${196 + dx - 2}" y="${80 + dy - 2}" width="4" height="4" rx="1"/>`).join('')}<path d="M191 84q5 4 10 0" stroke="#5fe3f0" stroke-width="2" fill="none" stroke-linecap="round"/></g>
    <ellipse cx="190" cy="74" rx="5" ry="3" fill="#fff" opacity=".8"/>
    <circle cx="146" cy="80" r="9" fill="#1d4f6a" stroke="#e9e4d8" stroke-width="4"/><circle cx="116" cy="80" r="9" fill="#1d4f6a" stroke="#e9e4d8" stroke-width="4"/>
    <circle cx="143" cy="77" r="2.6" fill="#fff" opacity=".7"/><circle cx="113" cy="77" r="2.6" fill="#fff" opacity=".7"/>
    ${arm}${shield}
    <path d="M58 59H170" stroke="#fff" stroke-width="4" opacity=".8" stroke-linecap="round"/></svg>`;
}
