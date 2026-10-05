// 星港 game emblems — 96×96, app-icon style tiles. Flat vector in paper-cut layers:
// each illustrated layer casts a small paper shadow; frame = rounded tile with the
// game's accent gradient, a top bevel and a soft bottom edge.
// Output: icons/games/<id>.svg (+ rasterised WebP via _src/raster_icons.mjs)
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const C = {
  cream: '#fff6e3', cream2: '#f3e3c3', cream3: '#e3caa0', ink: '#261c30', ink2: '#4b3f58',
  gold: '#f6b934', gold2: '#df9a1c', goldL: '#fdd877', red: '#e4513d', red2: '#b93a2b',
  led: '#8ff7ec', navy: '#131b42', white: '#ffffff',
};

function frame(id, top, mid, deep, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
<defs>
  <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
  <radialGradient id="${id}-hl" cx=".25" cy=".12" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="${id}-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.1" flood-color="#2a1408" flood-opacity=".32"/></filter>
  <filter id="${id}-sh2" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.4" stdDeviation="1.8" flood-color="#2a1408" flood-opacity=".30"/></filter>
  <clipPath id="${id}-clip"><rect x="2" y="2" width="92" height="92" rx="24"/></clipPath>
</defs>
<rect x="2" y="2" width="92" height="92" rx="24" fill="url(#${id}-bg)"/>
<g clip-path="url(#${id}-clip)">
${body}
<rect x="2" y="2" width="92" height="92" fill="url(#${id}-hl)"/>
</g>
<rect x="3" y="3" width="90" height="90" rx="23" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
<rect x="2.5" y="2.5" width="91" height="91" rx="23.5" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="1"/>
</svg>
`;
}
const sh = (id, inner, n = '') => `<g filter="url(#${id}-sh${n})">${inner}</g>`;
const star4 = (x, y, r, fill = C.cream, op = 1) => `<path d="M${x} ${y - r}Q${x + r * .18} ${y - r * .18} ${x + r} ${y}Q${x + r * .18} ${y + r * .18} ${x} ${y + r}Q${x - r * .18} ${y + r * .18} ${x - r} ${y}Q${x - r * .18} ${y - r * .18} ${x} ${y - r}Z" fill="${fill}" opacity="${op}"/>`;
const dot = (x, y, r, fill = C.cream, op = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${op}"/>`;

const E = {};

// ---------------------------------------------------------------- 火星基地
E.mars = frame('mars', '#ff9367', '#ec6e38', '#b44100', `
  ${dot(18, 20, 1.3, C.cream, .9)}${dot(30, 12, 1, C.cream, .7)}${dot(82, 30, 1.1, C.cream, .8)}${star4(70, 16, 4, C.cream, .95)}
  <circle cx="22" cy="30" r="7.5" fill="#3f7be6"/><path d="M17 27c3-1 5 1 4 4s3 4 6 2" fill="none" stroke="#7bd8c6" stroke-width="2.2" stroke-linecap="round"/><circle cx="22" cy="30" r="7.5" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>
  ${sh('mars', `<path d="M-4 74C14 62 36 58 52 59s36 5 52 13V100H-4Z" fill="#f08a5c"/>`)}
  ${sh('mars', `<path d="M-4 79C16 70 38 66 54 67s34 4 50 11V100H-4Z" fill="#c2522a"/>
     <ellipse cx="22" cy="86" rx="7" ry="2.4" fill="#a8441f"/><ellipse cx="74" cy="84" rx="5" ry="1.8" fill="#a8441f"/><ellipse cx="50" cy="91" rx="4" ry="1.4" fill="#a8441f"/>`)}
  ${sh('mars', `
     <rect x="64" y="34" width="12" height="38" rx="1.5" fill="none" stroke="${C.cream2}" stroke-width="2.4"/>
     <path d="M64 44l12 8M76 44l-12 8M64 56l12 8M76 56l-12 8" stroke="${C.cream2}" stroke-width="1.6"/>
     <path d="M57 74V40c0-7 3.2-13 6.5-17 3.3 4 6.5 10 6.5 17v34Z" fill="${C.cream}"/>
     <path d="M63.5 23c3.3 4 6.5 10 6.5 17v34h-6.5Z" fill="${C.cream2}"/>
     <path d="M57 40c0-7 3.2-13 6.5-17 3.3 4 6.5 10 6.5 17Z" fill="${C.red}"/>
     <circle cx="63.5" cy="49" r="3.4" fill="#2c9bdb" stroke="${C.cream3}" stroke-width="1.4"/>
     <path d="M57 62l-5 9v3h5ZM70 62l5 9v3h-5Z" fill="${C.red}"/>`)}
  ${sh('mars', `
     <path d="M16 76a20 20 0 0 1 40 0Z" fill="${C.cream}"/>
     <path d="M36 56a20 20 0 0 1 20 20H36Z" fill="${C.cream2}"/>
     <path d="M22.5 63.5Q36 58 49.5 63.5M18 70.5Q36 64 54 70.5" fill="none" stroke="${C.cream3}" stroke-width="1.4"/>
     <path d="M31 76v-7a5 5 0 0 1 10 0v7Z" fill="${C.gold}"/><path d="M36 64v12" stroke="${C.gold2}" stroke-width="1.2"/>
     <rect x="12" y="75" width="48" height="4" rx="2" fill="${C.cream3}"/>`, 2)}
`);

// ---------------------------------------------------------------- 月宫建造师
E.moon = frame('moon', '#9b8fed', '#8170db', '#5744a5', `
  ${star4(16, 18, 4)}${dot(30, 28, 1.2, C.cream, .8)}${dot(14, 40, 1, C.cream, .6)}${dot(86, 58, 1.1, C.cream, .7)}
  <circle cx="66" cy="28" r="17" fill="#fff3d6" opacity=".25"/>
  ${sh('moon', `<circle cx="66" cy="28" r="14" fill="#fff3d6"/><circle cx="60" cy="24" r="3.2" fill="#f2ddb0"/><circle cx="71" cy="33" r="2.2" fill="#f2ddb0"/><circle cx="70" cy="21" r="1.5" fill="#f2ddb0"/>`)}
  ${sh('moon', `<path d="M-2 80l18-8 16 4 18-7 20 6 28-5V100H-2Z" fill="#7a66d8"/><path d="M16 72l16 4 1 24H10Z" fill="#6c58cc"/><path d="M50 69l20 6-6 25H44Z" fill="#8f7ce6"/><path d="M70 75l28-5v30H64Z" fill="#6c58cc"/>`)}
  ${sh('moon', `
     <rect x="22" y="62" width="36" height="13" rx="1.5" fill="${C.cream}"/>
     <rect x="22" y="62" width="36" height="3" fill="${C.cream2}"/>
     <rect x="25" y="65" width="3.4" height="10" fill="${C.red}"/><rect x="51.6" y="65" width="3.4" height="10" fill="${C.red}"/>
     <path d="M35 75v-5.5a5 5 0 0 1 10 0V75Z" fill="#5d47c2"/>
     <path d="M14 61.5Q22 60 28 54.5H52Q58 60 66 61.5l-1.5 2H15.5Z" fill="${C.gold}"/>
     <path d="M15.5 63.5h49l-1-2H16.5Z" fill="${C.gold2}"/>
     <rect x="29" y="44" width="22" height="10.5" rx="1" fill="${C.cream}"/>
     <rect x="31.5" y="46.5" width="3" height="8" fill="${C.red}"/><rect x="45.5" y="46.5" width="3" height="8" fill="${C.red}"/>
     <rect x="37" y="47" width="6" height="5" rx="1" fill="${C.gold}"/>
     <path d="M22 44Q29 43 33 37.5H47Q51 43 58 44l-1.2 1.8H23.2Z" fill="${C.red}"/>
     <path d="M40 31.5l2.5 6h-5Z" fill="${C.gold}"/><circle cx="40" cy="31" r="1.8" fill="${C.gold}"/>`, 2)}
  ${sh('moon', `<rect x="62" y="68" width="9" height="9" rx="1.2" fill="${C.gold}" transform="rotate(-8 66 72)"/><rect x="66" y="60" width="7" height="7" rx="1" fill="${C.cream}" transform="rotate(12 69 63)"/>`)}
`);

// ---------------------------------------------------------------- 玉兔编程
E.rabbit = frame('rabbit', '#72ccab', '#3eb28d', '#008362', `
  ${dot(16, 16, 1.2, C.cream, .8)}${star4(82, 18, 3.5)}${dot(72, 10, 1, C.cream, .7)}
  ${sh('rabbit', `
     <rect x="34.5" y="8" width="8" height="22" rx="4" fill="${C.cream}" transform="rotate(-12 38.5 30)"/>
     <rect x="36.5" y="11" width="3.6" height="15" rx="1.8" fill="#f7a6b5" transform="rotate(-12 38.5 30)"/>
     <rect x="53.5" y="8" width="8" height="22" rx="4" fill="${C.cream}" transform="rotate(12 57.5 30)"/>
     <rect x="55.7" y="11" width="3.6" height="15" rx="1.8" fill="#f7a6b5" transform="rotate(12 57.5 30)"/>
     <rect x="34" y="23" width="28" height="17" rx="7" fill="${C.cream}"/>
     <rect x="37.5" y="26" width="21" height="11" rx="4.5" fill="${C.navy}"/>
     <rect x="41" y="29" width="3" height="4.5" rx="1.5" fill="${C.led}"/><rect x="52" y="29" width="3" height="4.5" rx="1.5" fill="${C.led}"/>
     <rect x="46.5" y="40" width="3" height="7" fill="${C.cream3}"/>`)}
  ${sh('rabbit', `
     <path d="M16 47h64l-3 4H19Z" fill="#2c6fd8"/>
     <path d="M16 47h64" stroke="#7fb2ff" stroke-width="1"/><path d="M29 47l-1 4M42 47v4M55 47v4M68 47l1 4" stroke="#1f4fa8" stroke-width="1"/>
     <rect x="22" y="50" width="52" height="15" rx="5" fill="${C.cream}"/>
     <rect x="22" y="60" width="52" height="5" rx="2.5" fill="${C.cream2}"/>
     <circle cx="66" cy="56" r="2.2" fill="${C.gold}"/>
     <circle cx="29" cy="67" r="7" fill="${C.ink}"/><circle cx="48" cy="67" r="7" fill="${C.ink}"/><circle cx="67" cy="67" r="7" fill="${C.ink}"/>
     <circle cx="29" cy="67" r="2.6" fill="${C.cream3}"/><circle cx="48" cy="67" r="2.6" fill="${C.cream3}"/><circle cx="67" cy="67" r="2.6" fill="${C.cream3}"/>`, 2)}
  ${sh('rabbit', `
     <rect x="20" y="78" width="15" height="13" rx="3.5" fill="${C.cream}"/><path d="M24 84.5h7m-3-3 3 3-3 3" fill="none" stroke="#127a60" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
     <rect x="40.5" y="78" width="15" height="13" rx="3.5" fill="${C.cream}"/><path d="M48 88v-7m-3 3 3-3 3 3" fill="none" stroke="#127a60" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
     <rect x="61" y="78" width="15" height="13" rx="3.5" fill="${C.gold}"/><path d="M68.5 81.2l1 2.2 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3Z" fill="${C.cream}"/>`)}
`);

// ---------------------------------------------------------------- 山海故事匣
E.story = frame('story', '#ea738a', '#d54c6c', '#9d1c43', `
  ${dot(14, 22, 1.2, C.cream, .8)}${dot(84, 40, 1, C.cream, .7)}${star4(20, 40, 3, C.cream, .8)}
  ${sh('story', `<circle cx="64" cy="24" r="9" fill="${C.gold}"/><circle cx="64" cy="24" r="6" fill="#f08a3c"/>`)}
  ${sh('story', `<path d="M16 62l14-20 9 10 11-18 18 26 8-8 8 10Z" fill="#2e8c8a"/><path d="M30 42l9 10-3 10H23Z" fill="#257a78"/><path d="M50 34l18 26H46Z" fill="#37a09d"/>`)}
  ${sh('story', `<path d="M10 64c6-5 12-5 16 0 4-5 10-5 14 0 4-5 10-5 14 0 4-5 10-5 14 0 4-5 10-5 14 0v8H10Z" fill="#7bd8c6"/>
     <path d="M15 62q4-4 8-1M43 62q4-4 8-1M71 62q4-4 8-1" fill="none" stroke="${C.cream}" stroke-width="1.6" stroke-linecap="round"/>`)}
  ${sh('story', `<g transform="translate(36 22) rotate(-10)">
     <path d="M0 6C6 1 14 1 18 5 14 7 8 9 3 8Z" fill="${C.ink}"/>
     <path d="M4 5C3-4 9-8 15-8 11-4 10 1 9 5Z" fill="${C.ink2}"/>
     <path d="M17 4c2-3 5-3 6-1-1 2-3 2.5-5 2Z" fill="${C.cream}"/>
     <path d="M23 3.2l3.5.6-3.5 1.2Z" fill="${C.gold}"/>
     <path d="M0 6.5L-7 9l1-3.5-2-2.5Z" fill="${C.ink}"/></g>`)}
  ${sh('story', `
     <path d="M14 66h68l-4 24H18Z" fill="#c9884e"/>
     <path d="M14 66h68v4H14Z" fill="#a86b36"/>
     <path d="M18 70h60l-3 18H21Z" fill="#e0a565"/>
     <path d="M26 74h44" stroke="#a86b36" stroke-width="1.4" stroke-linecap="round"/>
     <circle cx="48" cy="81" r="4" fill="${C.gold}"/><circle cx="48" cy="81" r="1.6" fill="#a86b36"/>`, 2)}
`);

// ---------------------------------------------------------------- 天宫实验室
E.lab = frame('lab', '#68bbed', '#33a0d9', '#0071a5', `
  ${dot(14, 46, 1.2, C.cream, .8)}${dot(84, 48, 1, C.cream, .7)}${star4(80, 70, 3, C.cream, .9)}${dot(16, 72, 1, C.cream, .6)}
  ${sh('lab', `
     <rect x="8" y="16" width="22" height="12" rx="1.5" fill="#24419a"/><path d="M15.3 16v12M22.6 16v12M8 22h22" stroke="#6f8ff0" stroke-width=".9"/>
     <rect x="66" y="16" width="22" height="12" rx="1.5" fill="#24419a"/><path d="M73.3 16v12M80.6 16v12M66 22h22" stroke="#6f8ff0" stroke-width=".9"/>
     <rect x="30" y="20.5" width="36" height="3" fill="${C.cream3}"/>
     <rect x="34" y="15" width="28" height="14" rx="7" fill="${C.cream}"/>
     <rect x="34" y="23" width="28" height="6" rx="3" fill="${C.cream2}"/>
     <rect x="43" y="6" width="10" height="34" rx="5" fill="${C.cream}"/>
     <rect x="48" y="6" width="5" height="34" rx="2.5" fill="${C.cream2}"/>
     <circle cx="48" cy="22" r="2.6" fill="${C.gold}"/>
     <rect x="44" y="9" width="8" height="2" rx="1" fill="${C.red}"/>`)}
  ${sh('lab', `
     <path d="M40 44h16v10.5a17 17 0 1 1-16 0Z" fill="#ffffff" fill-opacity=".28" stroke="${C.cream}" stroke-width="2.4" stroke-linejoin="round"/>
     <path d="M33.2 66a15 15 0 0 0 29.6 0Z" fill="${C.goldL}"/>
     <path d="M33.2 66a15 15 0 0 0 29.6 0" fill="none" stroke="${C.gold}" stroke-width="0"/>
     <path d="M31.5 68.5q8 3 16.5 0t16.5 0" fill="none" stroke="${C.gold}" stroke-width="2"/>
     <rect x="38" y="41" width="20" height="5" rx="2.5" fill="${C.cream}"/>
     ${dot(44, 74, 2.2, C.cream, .9)}${dot(52, 78, 1.5, C.cream, .9)}${dot(49, 60, 1.6, C.cream, .9)}${dot(46, 54, 1.1, C.cream, .8)}
     <path d="M36.5 56a14 14 0 0 0-3 8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`, 2)}
`);

// ---------------------------------------------------------------- 星港搬运工
E.porter = frame('porter', '#ffc86b', '#f9a726', '#c37900', `
  ${dot(80, 14, 1.2, C.cream, .8)}${star4(70, 22, 3, C.cream, .9)}${dot(16, 16, 1, C.cream, .7)}
  <path d="M-2 74H98V100H-2Z" fill="#d88b16"/>
  <path d="M-2 74H98" stroke="#f9c56a" stroke-width="1.4"/>
  <path d="M14 74l-6 26M36 74l-3 26M58 74v26M80 74l3 26" stroke="#c27a0e" stroke-width="1.2"/>
  ${sh('porter', `<ellipse cx="62" cy="83" rx="17" ry="5" fill="none" stroke="${C.cream}" stroke-width="2.2" stroke-dasharray="4 3"/>`)}
  ${sh('porter', `
     <path d="M44 40l6-6h28l-6 6Z" fill="#f4e1b8"/>
     <path d="M72 40l6-6v32l-6 6Z" fill="#c99a52"/>
     <rect x="44" y="40" width="28" height="32" rx="1.5" fill="#e9c88e"/>
     <rect x="44" y="40" width="28" height="32" rx="1.5" fill="none" stroke="#9c6b2e" stroke-width="2.4"/>
     <path d="M46 42l24 28M70 42 46 70" stroke="#c99a52" stroke-width="2"/>
     <path d="M58 47.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" fill="${C.red}" stroke="#e9c88e" stroke-width="1.4"/>`, 2)}
  ${sh('porter', `
     <rect x="14" y="48" width="22" height="22" rx="8" fill="${C.cream}"/>
     <rect x="14" y="62" width="22" height="8" rx="4" fill="${C.cream2}"/>
     <rect x="17" y="51" width="16" height="10" rx="4" fill="${C.navy}"/>
     <rect x="24" y="54" width="2.4" height="4" rx="1.2" fill="${C.led}"/><rect x="29" y="54" width="2.4" height="4" rx="1.2" fill="${C.led}"/>
     <path d="M25 48v-5" stroke="${C.cream3}" stroke-width="1.8" stroke-linecap="round"/><circle cx="25" cy="42" r="2.2" fill="${C.red}"/>
     <rect x="34" y="57" width="11" height="5" rx="2.5" fill="${C.cream3}"/>
     <ellipse cx="25" cy="73.5" rx="8" ry="2" fill="#9c6b2e" opacity=".5"/>`)}
  <path d="M5 52h6M3 58h7M6 64h5" stroke="${C.cream}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
`);

// ---------------------------------------------------------------- 棋艺舱 · 棋手学院
E.chess = frame('chess', '#6a79da', '#4f59ca', '#2c2d93', `
  <path d="M-2 72H98V100H-2Z" fill="#2a439c"/>
  <path d="M8 72h12l-2 8H4ZM32 72h12l-1 8H31ZM56 72h12l1 8H57ZM80 72h12l4 8H82ZM4 80h14l-2 10H0ZM31 80h12l-1 10H30ZM57 80h12l1 10H58ZM82 80h14l4 10H84Z" fill="#3a5bc4"/>
  ${star4(76, 20, 6, C.gold)}${dot(66, 12, 1.2, C.cream, .8)}${dot(18, 18, 1.1, C.cream, .7)}${dot(84, 34, 1, C.cream, .6)}
  ${sh('chess', `
     <path d="M29 84h38a3 3 0 0 0 3-3v-1a3 3 0 0 0-3-3H29a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3Z" fill="${C.cream2}"/>
     <path d="M32 77h32l-2-6H34Z" fill="${C.cream}"/>
     <path d="M35 71C34 61 37 54 43 48L34 50.5C29.5 51.5 26.5 48 28 44 29.5 39 34.5 34 40.5 30 42 25 45 20 50 18L52 22.5C61 24 68.5 32 69.5 44 70.5 56 67 64 64.5 71Z" fill="${C.cream}"/>
     <path d="M52 22.5C61 24 68.5 32 69.5 44 70.5 56 67 64 64.5 71H57C61 63 63 55 62 45 61 36 57 28 52 22.5Z" fill="${C.cream2}"/>
     <path d="M50 18l3-7 2.5 9Z" fill="${C.cream}"/>
     <circle cx="44.5" cy="32" r="2.2" fill="${C.ink}"/>
     <path d="M31 46.5l3-1" stroke="${C.ink2}" stroke-width="1.6" stroke-linecap="round"/>
     <path d="M54 24c3 4 5 8 6 13M57 27c3 3 5 6 6 10" stroke="${C.gold}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`, 2)}
`);

// ---------------------------------------------------------------- 陆战棋
// two upright rank tiles on the board: the front one shows a rank star + chevrons (师长-style
// insignia, no glyphs so it renders without a font), the back one is a face-down tile.
E.army = frame('army', '#968f48', '#7d7413', '#524900', `
  ${dot(16, 14, 1.2, C.cream, .7)}${dot(82, 16, 1, C.cream, .6)}${star4(76, 24, 3.2, C.cream, .85)}
  ${sh('army', `
     <path d="M-2 66H98V100H-2Z" fill="#efe0bd"/>
     <path d="M-2 78H98M24 66v34M72 66v34" stroke="#6b5f35" stroke-width="1.3" opacity=".5"/>
     <path d="M-2 90H98" stroke="#6b5f35" stroke-width="3.4" opacity=".55"/>
     <path d="M-2 90H98" stroke="#efe0bd" stroke-width="1.3" stroke-dasharray="3 3"/>
     <circle cx="48" cy="78" r="5.5" fill="#efe0bd" stroke="#6b5f35" stroke-width="1.3" stroke-opacity=".5"/>`)}
  ${sh('army', `<g transform="rotate(-12 30 56)">
     <rect x="17" y="32" width="26" height="34" rx="5" fill="#3b6fd0"/>
     <rect x="17" y="58" width="26" height="8" rx="4" fill="#2b54a8"/>
     <rect x="21" y="36" width="18" height="20" rx="3" fill="none" stroke="#9cc0ff" stroke-width="1.6" opacity=".8"/>
     <path d="M30 39.5l6 6.5-6 6.5-6-6.5Z" fill="none" stroke="#9cc0ff" stroke-width="1.6" stroke-linejoin="round" opacity=".85"/><circle cx="30" cy="46" r="1.6" fill="#9cc0ff"/></g>`)}
  ${sh('army', `<g transform="rotate(5 58 54)">
     <rect x="40" y="22" width="34" height="46" rx="6" fill="${C.cream}"/>
     <rect x="40" y="58" width="34" height="10" rx="5" fill="${C.cream2}"/>
     <rect x="44" y="26" width="26" height="30" rx="3.5" fill="none" stroke="${C.red}" stroke-width="2"/>
     <path d="M57 30.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7Z" fill="${C.red}"/>
     <path d="M50 46.5l7 3.2 7-3.2M50 51l7 3.2 7-3.2" fill="none" stroke="${C.gold2}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`, 2)}
  ${sh('army', `
     <path d="M80 70V40" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round"/>
     <path d="M81 41c4-1.5 7 .5 11-.5v9c-4 1-7-1-11 .5Z" fill="${C.red}"/>
     <circle cx="80" cy="39.5" r="1.6" fill="${C.gold}"/>`)}
`);

// ---------------------------------------------------------------- 贪吃蛇
E.snake = frame('snake', '#aaf292', '#83d766', '#58a53b', `
  ${dot(80, 72, 1.2, C.cream, .8)}${dot(16, 18, 1, C.cream, .7)}
  <circle cx="74" cy="22" r="7" fill="${C.goldL}" opacity=".35"/>
  ${sh('snake', `<circle cx="74" cy="22" r="4.6" fill="${C.gold}"/><circle cx="72.6" cy="20.6" r="1.4" fill="#fff" opacity=".8"/>`)}
  ${sh('snake', `<circle cx="84" cy="40" r="3.2" fill="${C.red}"/><circle cx="83" cy="39" r="1" fill="#fff" opacity=".8"/>`)}
  ${sh('snake', `<circle cx="20" cy="40" r="3" fill="#3f7be6"/><circle cx="19" cy="39" r="1" fill="#fff" opacity=".8"/>`)}
  ${sh('snake', `
     <path d="M12 82c10 2 20-2 26-10s14-12 22-8 6 14-2 18" fill="none" stroke="#3b2a6e" stroke-width="15" stroke-linecap="round"/>
     <path d="M12 82c10 2 20-2 26-10s14-12 22-8 6 14-2 18" fill="none" stroke="#6a52c9" stroke-width="11" stroke-linecap="round"/>
     <path d="M12 82c10 2 20-2 26-10s14-12 22-8 6 14-2 18" fill="none" stroke="${C.gold}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray=".1 8"/>
     <path d="M38 72C46 60 50 50 56 42" fill="none" stroke="#3b2a6e" stroke-width="15" stroke-linecap="round"/>
     <path d="M38 72C46 60 50 50 56 42" fill="none" stroke="#6a52c9" stroke-width="11" stroke-linecap="round"/>`, 2)}
  ${sh('snake', `
     <ellipse cx="59" cy="36" rx="13" ry="11.5" fill="#6a52c9" transform="rotate(-30 59 36)"/>
     <ellipse cx="57" cy="40" rx="9" ry="5" fill="#8a73ee" transform="rotate(-30 57 40)" opacity=".7"/>
     <circle cx="56" cy="31" r="4.6" fill="#fff"/><circle cx="66" cy="35" r="4.6" fill="#fff"/>
     <circle cx="57.5" cy="30.4" r="2.4" fill="${C.ink}"/><circle cx="67.4" cy="34.2" r="2.4" fill="${C.ink}"/>
     <circle cx="58.3" cy="29.6" r=".9" fill="#fff"/><circle cx="68.2" cy="33.4" r=".9" fill="#fff"/>
     <path d="M61 42.5q3 1.6 6-.6" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round"/>`, 2)}
`);

// ---------------------------------------------------------------- 消消乐
E.match = frame('match', '#dd6eb5', '#c8459d', '#92136f', `
  ${star4(20, 20, 5, C.cream)}${dot(78, 16, 1.2, C.cream, .8)}${dot(84, 78, 1, C.cream, .7)}${star4(76, 76, 3.5, C.cream, .9)}
  ${sh('match', `
     <circle cx="24" cy="56" r="13" fill="${C.gold}"/>
     <path d="M24 43a13 13 0 0 1 13 13H24Z" fill="${C.goldL}"/><path d="M11 56a13 13 0 0 0 13 13V56Z" fill="${C.gold2}"/>
     <circle cx="24" cy="56" r="7" fill="${C.goldL}" opacity=".55"/><circle cx="20" cy="50" r="2.4" fill="#fff" opacity=".85"/>`)}
  ${sh('match', `
     <path d="M48 30l17 20-17 20-17-20Z" fill="#1fae8b"/>
     <path d="M48 30l17 20H48Z" fill="#54d4b3"/><path d="M31 50l17 20V50Z" fill="#127a60"/>
     <path d="M48 40l8 10-8 10-8-10Z" fill="#7bd8c6" opacity=".7"/><circle cx="44" cy="40" r="2.2" fill="#fff" opacity=".85"/>`, 2)}
  ${sh('match', `
     <path d="M72 43l11.3 6.5v13L72 69l-11.3-6.5v-13Z" fill="#4c6fe0"/>
     <path d="M72 43l11.3 6.5L72 56Z" fill="#7d98f2"/><path d="M60.7 62.5 72 69V56Z" fill="#2f4bab"/>
     <path d="M72 49.5l5.6 3.2v6.5L72 62.4l-5.6-3.2v-6.5Z" fill="#a9bcf8" opacity=".6"/><circle cx="67.5" cy="49" r="2" fill="#fff" opacity=".85"/>`)}
  <path d="M40 74l3 3M56 74l-3 3M48 76v4" stroke="${C.cream}" stroke-width="2" stroke-linecap="round" opacity=".8"/>
`);

// ---------------------------------------------------------------- 机关守城 (lane defense, folder gear-fort)
// A paper-cut city gate tower behind a crenellated wall, a bronze gear in front (墨家机关).
const gear = (cx, cy, R, r, n, hole) => {
  const pts = [];
  for (let i = 0; i < n * 4; i++) {
    const a = (Math.PI * 2 * i) / (n * 4) - Math.PI / 2;
    const rad = i % 4 < 2 ? R : r;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return `<path d="M${pts.join('L')}Z M${cx + hole} ${cy}a${hole} ${hole} 0 1 0 ${-2 * hole} 0a${hole} ${hole} 0 1 0 ${2 * hole} 0Z" fill-rule="evenodd"`;
};
E.defense = frame('defense', '#81c179', '#5ca753', '#317829', `
  ${dot(14, 16, 1.2, C.cream, .8)}${star4(22, 30, 3.2)}${dot(84, 30, 1, C.cream, .6)}${star4(80, 14, 4, C.cream, .95)}
  <path d="M-2 82H98V100H-2Z" fill="#2f8f4d"/>
  <path d="M-2 82H98" stroke="#5cc47c" stroke-width="1.2" opacity=".8"/>
  ${sh('defense', `
     <path d="M30 40h36l-3 12H33Z" fill="#8a5a35"/>
     <path d="M24 36q24-10 48 0l-4 4H28Z" fill="${C.red}"/>
     <path d="M48 26.5q13 3 24 9.5H48Z" fill="${C.red2}"/>
     <rect x="35" y="44" width="5" height="6" rx="1" fill="${C.gold}"/><rect x="45.5" y="44" width="5" height="6" rx="1" fill="${C.gold}"/><rect x="56" y="44" width="5" height="6" rx="1" fill="${C.gold}"/>
     <path d="M47 26.5V21" stroke="${C.gold2}" stroke-width="1.6" stroke-linecap="round"/><circle cx="47" cy="20" r="1.8" fill="${C.gold}"/>`)}
  ${sh('defense', `
     <path d="M8 84V58h6v-5h7v5h6v-5h7v5h6v-5h16v5h6v-5h7v5h6v-5h7v5h6v26Z" fill="${C.cream}"/>
     <path d="M48 53h8v5h6v-5h7v5h6v-5h7v5h6v26H48Z" fill="${C.cream2}"/>
     <path d="M8 66H88M8 75H88M22 58v8M38 66v9M58 58v8M74 66v9M30 75v9M66 75v9" stroke="${C.cream3}" stroke-width="1.1"/>
     <path d="M38 84V72a10 10 0 0 1 20 0v12Z" fill="#5a3a22"/>
     <path d="M48 62a10 10 0 0 1 10 10v12H48Z" fill="#432a17"/>
     <path d="M41 74h14M41 79h14" stroke="#8a5a35" stroke-width="1.2"/>`, 2)}
  ${sh('defense', `
     ${gear(22, 72, 13, 10.2, 8, 4)} fill="#d9a441"/>
     <circle cx="22" cy="72" r="7.2" fill="none" stroke="#a8701c" stroke-width="1.4"/>
     <path d="M15.5 64.5a9.5 9.5 0 0 1 9-2.6" fill="none" stroke="#ffe7a8" stroke-width="2" stroke-linecap="round" opacity=".85"/>`, 2)}
`);

// ---------------------------------------------------------------- 记忆方块 (classic corner)
E.memory = frame('memory', '#86d9f4', '#45aee0', '#1f6aa6', `
  ${dot(14, 12, 1.2, C.cream, .8)}${dot(86, 84, 1, C.cream, .6)}${star4(84, 14, 3.4, C.cream, .9)}
  ${sh('memory', `<g transform="rotate(-4 48 50)">
     <rect x="15" y="17" width="66" height="66" rx="12" fill="#14306a" opacity=".55"/>
     ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => {
       const lit = (r === 0 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 0);
       const x = 20 + c * 20, y = 22 + r * 20;
       return lit
         ? `<rect x="${x}" y="${y}" width="16" height="16" rx="4" fill="${C.gold}"/><rect x="${x}" y="${y + 11}" width="16" height="5" rx="2.5" fill="${C.gold2}"/>${star4(x + 8, y + 7.5, 5, C.cream)}`
         : `<rect x="${x}" y="${y}" width="16" height="16" rx="4" fill="${C.cream}"/><rect x="${x}" y="${y + 11}" width="16" height="5" rx="2.5" fill="${C.cream3}" opacity=".8"/>`;
     }).join('')).join('')}</g>`, 2)}
`);

// ---------------------------------------------------------------- 数字探险家 (classic corner)
const card = (x, y, rot, pips, color) => `<g transform="rotate(${rot} ${x + 13} ${y + 18})">
     <rect x="${x}" y="${y}" width="26" height="36" rx="5" fill="${C.cream}"/>
     <rect x="${x}" y="${y + 29}" width="26" height="7" rx="3.5" fill="${C.cream2}"/>
     ${pips.map(([px, py]) => `<circle cx="${x + px}" cy="${y + py}" r="3.4" fill="${color}"/><circle cx="${x + px - 1}" cy="${y + py - 1.2}" r="1" fill="#fff" opacity=".7"/>`).join('')}</g>`;
E.numbers = frame('numbers', '#ffd772', '#f4b034', '#c27c08', `
  ${dot(16, 14, 1.2, C.cream, .8)}${star4(80, 16, 4, C.cream, .95)}${dot(86, 32, 1, C.cream, .7)}
  ${sh('numbers', card(10, 36, -12, [[13, 15]], C.red))}
  ${sh('numbers', card(35, 28, -2, [[8, 9], [18, 21]], '#3f7be6'))}
  ${sh('numbers', card(60, 36, 10, [[7, 8], [13, 15], [19, 22]], '#1aa892'), 2)}
`);

const out = path.join(ROOT, 'icons', 'games');
fs.mkdirSync(out, { recursive: true });
let ts = '// AUTO-GENERATED by _src/build_game_icons.mjs\nexport const GAME_EMBLEMS = {\n';
for (const [id, svg] of Object.entries(E)) {
  fs.writeFileSync(path.join(out, `${id}.svg`), svg);
  ts += `  ${JSON.stringify(id)}: ${JSON.stringify(svg.replace(/\n\s*/g, ' '))},\n`;
}
ts += '} as const;\nexport type GameEmblemId = keyof typeof GAME_EMBLEMS;\n';
fs.writeFileSync(path.join(ROOT, 'ui', 'emblems.generated.ts'), ts);
console.log(Object.keys(E).length, 'game emblems');
