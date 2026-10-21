#!/usr/bin/env node
// V12 palette gate (spec §9): CIEDE2000 between every pair of colours that carry a MEANING at the same time in 火星基地, under normal vision and
// Machado-2009 protan / deutan / tritan simulation (severity 1). Threshold ≥ 12 for every pair of a set. Tokens come from kit/ui/tokens.css (+ the
// game's --mb-* tokens in styles.css), so a change of a token is re-checked. Usage: node tools/mars-base/check-palette.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(ROOT, 'kit/ui/tokens.css'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'site/mars-base/src/styles.css'), 'utf8');
const tok = (n) => { const m = css.match(new RegExp(`--${n.replace(/[-]/g, '\\-')}\\s*:\\s*(#[0-9a-fA-F]{6})`)); if (!m) throw new Error(`token --${n} not found`); return m[1]; };
export const THRESHOLD = 12;
// sets of colours that must stay tell-apart-able (a child must never need colour alone: each set also differs in SHAPE, but we hold colour to ≥12 anyway)
export const SETS = {
  'tray parts (颗 / 根 / 箱)': ['mb-gem', 'xg-gold-500', 'xg-jade-500'],
  'feedback (对 / 再试 / 提示 / 错)': ['xg-ok-500', 'xg-try-500', 'xg-info-500', 'xg-danger-500'],
  'orbit & crystals (旗 / 光 / 玉 / 紫)': ['mb-gem', 'mb-gold', 'mb-jade', 'mb-violet'],
};
const M = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const lin = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const mul = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function lab(l) {
  l = l.map((c) => Math.min(1, Math.max(0, c)));
  const X = mul([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], l); const t = [X[0] / 0.95047, X[1], X[2] / 1.08883];
  const f = t.map((x) => (x > (6 / 29) ** 3 ? Math.cbrt(x) : x / (3 * (6 / 29) ** 2) + 4 / 29));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
export function de2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, deg = 180 / Math.PI; const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))); const a1p = (1 + G) * a1, a2p = (1 + G) * a2; const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1 = (Math.atan2(b1, a1p) * deg + 360) % 360, h2 = (Math.atan2(b2, a2p) * deg + 360) % 360;
  const dL = L2 - L1, dC = C2p - C1p; let dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; if (C1p * C2p === 0) dh = 0;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2); const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2; if (C1p * C2p === 0) hb = h1 + h2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
export function report() {
  const rows = [];
  for (const [set, names] of Object.entries(SETS)) {
    const hex = Object.fromEntries(names.map((n) => [n, tok(n)]));
    for (const mode of ['normal', 'protan', 'deutan', 'tritan']) {
      const labs = Object.fromEntries(names.map((n) => [n, lab(mode === 'normal' ? lin(hex[n]) : mul(M[mode], lin(hex[n])))]));
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) rows.push({ set, mode, a: names[i], b: names[j], ha: hex[names[i]], hb: hex[names[j]], de: de2000(labs[names[i]], labs[names[j]]) });
    }
  }
  return rows;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = report(); const bad = rows.filter((r) => r.de < THRESHOLD);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else for (const set of Object.keys(SETS)) { console.log(`\n${set}`); for (const mode of ['normal', 'protan', 'deutan', 'tritan']) console.log(`  ${mode.padEnd(7)}`, rows.filter((r) => r.set === set && r.mode === mode).map((r) => `${r.a}/${r.b} ${r.de.toFixed(1)}${r.de < THRESHOLD ? ' ✗' : ''}`).join(' · ')); }
  console.log(bad.length ? `\nFAIL: ${bad.length} pair(s) under ${THRESHOLD}` : `\nOK: every pair ≥ ${THRESHOLD} (min ${Math.min(...rows.map((r) => r.de)).toFixed(1)})`);
  process.exit(bad.length ? 1 : 0);
}
