// 星港 UI icon set — 32×32 grid, "chunky filled" style.
//   * primary shapes are filled currentColor; linear glyphs (arrows, check, waves)
//     are 3.6-unit round strokes so filled and stroked icons share one visual weight;
//   * secondary parts use opacity .45 (duotone) — never a second hard-coded colour;
//   * holes are cut with fill-rule="evenodd" single paths (no masks → Safari-safe in <symbol>).
// Output: icons/ui/<name>.svg, icons/ui-sprite.svg, ui/icons.generated.ts
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SW = 3.6; // stroke weight
const S = (d, w = SW) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const F = (d, extra = '') => `<path d="${d}" fill="currentColor"${extra}/>`;
const FE = (d, extra = '') => `<path d="${d}" fill="currentColor" fill-rule="evenodd"${extra}/>`;
const f = (n) => +n.toFixed(2);

function gearPath(cx, cy, rIn, rOut, teeth, holeR) {
  const pts = [];
  const N = teeth * 24;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    // smooth square wave → rounded teeth
    const s = Math.cos(t * teeth);
    const k = 1 / (1 + Math.exp(-s * 7)); // 0..1 soft step
    const r = rIn + (rOut - rIn) * k;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  let d = 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';
  d += `M${cx + holeR} ${cy}A${holeR} ${holeR} 0 1 0 ${cx - holeR} ${cy}A${holeR} ${holeR} 0 1 0 ${cx + holeR} ${cy}Z`;
  return d;
}
function starPath(cx, cy, R, r, rot = -90) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r : R;
    pts.push(`${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`);
  }
  return 'M' + pts.join('L') + 'Z';
}
function crossPoly(cx, cy, L, w, rotDeg = 45) {
  const base = [[w, L], [-w, L], [-w, w], [-L, w], [-L, -w], [-w, -w], [-w, -L], [w, -L], [w, -w], [L, -w], [L, w], [w, w]];
  const a = (rotDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return 'M' + base.map(([x, y]) => `${f(cx + x * c - y * s)} ${f(cy + x * s + y * c)}`).join('L') + 'Z';
}
const speaker = 'M4.5 13a2.5 2.5 0 0 1 2.5-2.5h3.6l5.6-4.7c1.3-1.1 3.3-.2 3.3 1.5v17.4c0 1.7-2 2.6-3.3 1.5l-5.6-4.7H7a2.5 2.5 0 0 1-2.5-2.5Z';

const ICONS = {
  home: F('M16 4.6c.6 0 1.2.2 1.7.6l9.6 8.3c.9.8.3 2.2-.9 2.2H25v9.8a3.5 3.5 0 0 1-3.5 3.5h-2.7v-6.6a1.6 1.6 0 0 0-1.6-1.6h-2.4a1.6 1.6 0 0 0-1.6 1.6V29h-2.7A3.5 3.5 0 0 1 7 25.5v-9.8H5.6c-1.2 0-1.8-1.4-.9-2.2l9.6-8.3c.5-.4 1.1-.6 1.7-.6Z'),
  back: S('M19.5 6.5 10 16l9.5 9.5', 4.2),
  next: S('M12.5 6.5 22 16l-9.5 9.5', 4.2),
  play: F('M10.5 7.4c0-1.9 2-3 3.6-2l13 8.6c1.4.9 1.4 3 0 4l-13 8.6c-1.6 1-3.6-.1-3.6-2Z'),
  pause: F('M7.5 8a2.5 2.5 0 0 1 2.5-2.5h2.2a2.5 2.5 0 0 1 2.5 2.5v16a2.5 2.5 0 0 1-2.5 2.5H10A2.5 2.5 0 0 1 7.5 24ZM17.3 8a2.5 2.5 0 0 1 2.5-2.5H22A2.5 2.5 0 0 1 24.5 8v16a2.5 2.5 0 0 1-2.5 2.5h-2.2a2.5 2.5 0 0 1-2.5-2.5Z'),
  undo: S('M11 12.5h9a6.5 6.5 0 0 1 0 13h-7') + S('M13 6 6.5 12.5 13 19'),
  redo: S('M21 12.5h-9a6.5 6.5 0 0 0 0 13h7') + S('M19 6l6.5 6.5L19 19'),
  restart: S('M24.6 12.5A9.5 9.5 0 1 0 25.2 19') + S('M26 5.5v7h-7'),
  replay: F(speaker, ' transform="translate(-1 0)"') + S('M24.2 11.4a6 6 0 1 1-1.7 9.9', 3.2) + F('M27.6 7.8v5.6a.9.9 0 0 1-.9.9h-5.4c-.8 0-1.2-1-.6-1.6l5.4-5.5c.6-.6 1.5-.2 1.5.6Z'),
  'sound-on': F(speaker) + S('M23.4 12.2a5.6 5.6 0 0 1 0 7.6', 3.2) + S('M26.6 8.6a10.6 10.6 0 0 1 0 14.8', 3.2),
  'sound-off': F(speaker) + S('M23 12.5l6 7M29 12.5l-6 7', 3.4),
  hint: F('M16 3.8a9.3 9.3 0 0 0-5.6 16.8c.9.7 1.6 1.8 1.6 3v.1h8v-.1c0-1.2.7-2.3 1.6-3A9.3 9.3 0 0 0 16 3.8Z') + F('M12 25.6h8v1.2a2.7 2.7 0 0 1-2.7 2.7h-2.6a2.7 2.7 0 0 1-2.7-2.7Z', ' opacity=".5"') + S('M12.6 12.4a3.8 3.8 0 0 1 3.4-3', 2.4).replace('currentColor', 'var(--xg-icon-shine, rgba(255,255,255,.75))'),
  settings: FE(gearPath(16, 16, 10.2, 13.6, 8, 4.4)),
  star: `<path d="${starPath(16, 16.8, 13, 6.2)}" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`,
  'star-outline': `<path d="${starPath(16, 16.8, 12.4, 5.9)}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`,
  lock: FE('M8 14.5h16a2.5 2.5 0 0 1 2.5 2.5v9a3.5 3.5 0 0 1-3.5 3.5H9A3.5 3.5 0 0 1 5.5 26v-9A2.5 2.5 0 0 1 8 14.5ZM14.6 21.4a2.3 2.3 0 1 1 2.8 0V24a1.4 1.4 0 0 1-2.8 0Z') + S('M10.5 14.5V11a5.5 5.5 0 0 1 11 0v3.5', 3.6),
  unlock: FE('M8 14.5h16a2.5 2.5 0 0 1 2.5 2.5v9a3.5 3.5 0 0 1-3.5 3.5H9A3.5 3.5 0 0 1 5.5 26v-9A2.5 2.5 0 0 1 8 14.5ZM14.6 21.4a2.3 2.3 0 1 1 2.8 0V24a1.4 1.4 0 0 1-2.8 0Z') + S('M10.5 14.5V10a5.5 5.5 0 0 1 10.6-2', 3.6),
  check: S('M6.5 16.8l6.4 6.4L25.8 9.6', 4.4),
  close: S('M9 9l14 14M23 9 9 23', 4.4),
  parent: F('M12.2 4.5a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2ZM4 25.3c0-5 3.7-9 8.2-9s8.2 4 8.2 9v.4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z') + F('M23.4 11.6a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM18.6 26.2c.2-3.7 2.3-5.9 4.8-5.9s4.6 2.2 4.8 5.9c0 .8-.6 1.5-1.4 1.5h-6.8c-.8 0-1.4-.7-1.4-1.5Z', ' opacity=".55"'),
  backspace: FE('M12 6.5h13.5A3.5 3.5 0 0 1 29 10v12a3.5 3.5 0 0 1-3.5 3.5H12a2.6 2.6 0 0 1-2-.9l-6.4-7.3a2 2 0 0 1 0-2.6L10 7.4a2.6 2.6 0 0 1 2-.9Z' + crossPoly(18.6, 16, 5.6, 1.7)),
  info: FE('M16 3.5a12.5 12.5 0 1 1 0 25 12.5 12.5 0 0 1 0-25ZM16 8.2a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2ZM14.2 15.4a1.8 1.8 0 0 1 3.6 0v7.4a1.8 1.8 0 0 1-3.6 0Z'),
  plus: S('M16 7v18M7 16h18', 4.2),
  minus: S('M7 16h18', 4.2),
  'listen': F(speaker) + S('M23.4 12.2a5.6 5.6 0 0 1 0 7.6', 3.2),
  'chevron-down': S('M7 12l9 9 9-9', 4.2),
  rocket: FE('M16 2.8c4.6 3.3 7 8.2 7 14v4.4l3.4 3.2c.6.6.6 1.5 0 2l-1.3 1.2c-.4.4-1 .5-1.5.2L20.8 26h-9.6l-2.8 1.8c-.5.3-1.1.2-1.5-.2l-1.3-1.2c-.6-.5-.6-1.4 0-2L9 21.2v-4.4c0-5.8 2.4-10.7 7-14ZM16 10.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z') + F('M13.2 27.6h5.6l-1.4 2.5a1.6 1.6 0 0 1-2.8 0Z', ' opacity=".5"'),
  book: F('M4 7.4c0-1 .8-1.8 1.8-1.7 3.4.2 6.4 1 8.4 2.6v18.4c-2-1.4-5-2.2-8.4-2.4A1.9 1.9 0 0 1 4 22.4Z') + F('M28 7.4c0-1-.8-1.8-1.8-1.7-3.4.2-6.4 1-8.4 2.6v18.4c2-1.4 5-2.2 8.4-2.4a1.9 1.9 0 0 0 1.8-1.9Z', ' opacity=".55"'),
  flag: F('M8.5 5.6c4.6-2.4 8.3 2.6 13.6 0 1.1-.5 2.4.2 2.4 1.5v10.2c0 .7-.4 1.3-1 1.6-5.2 2.6-9 -2.4-13.4-.2L8.5 19Z') + S('M8 4.5v24', 3.4),
  mic: F('M16 3.5a5 5 0 0 1 5 5v7.4a5 5 0 0 1-10 0V8.5a5 5 0 0 1 5-5Z') + S('M7.5 15.4a8.5 8.5 0 0 0 17 0M16 24v4.5M11.5 28.5h9', 3.2),
  hand: F('M12.6 4.2a2.4 2.4 0 0 1 2.4 2.4v8.3l.9-.3a2.3 2.3 0 0 1 2.8 1.4l.3.9.9-.3a2.3 2.3 0 0 1 2.9 1.5l.2.6.7-.2a2.3 2.3 0 0 1 2.9 1.6l.7 2.6c1.2 4.6-1.2 8-5 9.3l-1.5.4c-3 .9-6.3-.1-8.3-2.5l-4.1-5c-.9-1-.8-2.6.3-3.4a2.4 2.4 0 0 1 3.2.3l.2.2V6.6a2.4 2.4 0 0 1 2.4-2.4Z'),
  robot: FE('M10 9h12a6 6 0 0 1 6 6v6.5a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V15a6 6 0 0 1 6-6Zm1.6 6.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8.8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z') + S('M16 9V5.2', 2.8) + F('M16 2.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z', ' opacity=".55"'),
  moon: F('M19.6 4.3a12 12 0 1 0 8.1 17.3A10 10 0 0 1 19.6 4.3Z') + F('M25 4.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z', ' opacity=".55"'),
  badge: FE('M16 2.6l3.1 2.3 3.8-.3 1.2 3.7 3.2 2.1-1.3 3.6 1.3 3.6-3.2 2.1-1.2 3.7-3.8-.3L16 25.4l-3.1-2.3-3.8.3-1.2-3.7L4.7 17.6 6 14 4.7 10.4l3.2-2.1 1.2-3.7 3.8.3ZM16 8.6a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 0 0 0-10.8Z') + F('M10.5 23.6 8.6 30l4-1.6 3.4 2.4V25.6ZM21.5 23.6l1.9 6.4-4-1.6-3.4 2.4V25.6Z', ' opacity=".5"'),
  'zoom-in': S('M14 5.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17ZM20.3 20.3l6.2 6.2M14 10.3v7.4M10.3 14h7.4', 3.4),
  'zoom-out': S('M14 5.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17ZM20.3 20.3l6.2 6.2M10.3 14h7.4', 3.4),
  music: F('M12 8.4c0-1 .7-1.8 1.7-2l11-2.2c1.2-.2 2.3.7 2.3 1.9v16.3a4.4 4.4 0 1 1-3-4.2V10l-9 1.8v13a4.4 4.4 0 1 1-3-4.2Z'),
  grid: F('M5 7.5A2.5 2.5 0 0 1 7.5 5h4A2.5 2.5 0 0 1 14 7.5v4a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 5 11.5ZM18 7.5A2.5 2.5 0 0 1 20.5 5h4A2.5 2.5 0 0 1 27 7.5v4a2.5 2.5 0 0 1-2.5 2.5h-4a2.5 2.5 0 0 1-2.5-2.5ZM5 20.5A2.5 2.5 0 0 1 7.5 18h4a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 5 24.5Z') + F('M18 20.5a2.5 2.5 0 0 1 2.5-2.5h4a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5h-4a2.5 2.5 0 0 1-2.5-2.5Z', ' opacity=".5"'),
  download: S('M16 4.5v14M10 13l6 6 6-6M6 22.5v2a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-2', 3.6),
  pencil: F('M21.7 4.9a2.8 2.8 0 0 1 4 0l1.4 1.4a2.8 2.8 0 0 1 0 4L12.4 25 6 26.3a.9.9 0 0 1-1.1-1.1L6.2 18.8Z') + F('M19.4 7.2l5.4 5.4', ' stroke="var(--xg-icon-cut, rgba(0,0,0,.2))" stroke-width="1.6"'),
  swap: S('M8 10.5h15M18.5 5.5l5 5-5 5M24 21.5H9M13.5 16.5l-5 5 5 5', 3.4),
  eye: FE('M16 7c6.4 0 10.8 5 12.3 7.6.5.9.5 1.9 0 2.8C26.8 20 22.4 25 16 25S5.2 20 3.7 17.4a2.8 2.8 0 0 1 0-2.8C5.2 12 9.6 7 16 7Zm0 4.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2Z'),
  map: FE('M3.5 8.4c0-.8.5-1.5 1.2-1.8l5.6-2.2c.6-.2 1.2-.2 1.8 0l7.8 3 5.7-2.2c1.4-.6 2.9.5 2.9 2v15.5c0 .8-.5 1.5-1.2 1.8l-5.6 2.2c-.6.2-1.2.2-1.8 0l-7.8-3-5.7 2.2c-1.4.6-2.9-.5-2.9-2Z') + F('M11.3 5.2v19.6M19.9 8v19.6', ' stroke="var(--xg-icon-cut, rgba(0,0,0,.18))" stroke-width="1.6"'),
};

const out = path.join(ROOT, 'icons', 'ui');
fs.mkdirSync(out, { recursive: true });
let sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n';
let ts = '// AUTO-GENERATED by _src/build_ui_icons.mjs — do not edit by hand.\n// 32×32 "chunky filled" UI icons. Colour = currentColor.\nexport const UI_ICONS = {\n';
for (const [name, body] of Object.entries(ICONS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">${body}</svg>\n`;
  fs.writeFileSync(path.join(out, `${name}.svg`), svg);
  sprite += `  <symbol id="xg-i-${name}" viewBox="0 0 32 32">${body}</symbol>\n`;
  ts += `  ${JSON.stringify(name)}: ${JSON.stringify(body)},\n`;
}
sprite += '</svg>\n';
ts += '} as const;\nexport type UiIconName = keyof typeof UI_ICONS;\n';
fs.writeFileSync(path.join(ROOT, 'icons', 'ui-sprite.svg'), sprite);
fs.writeFileSync(path.join(ROOT, 'ui', 'icons.generated.ts'), ts);
console.log(Object.keys(ICONS).length, 'ui icons');
