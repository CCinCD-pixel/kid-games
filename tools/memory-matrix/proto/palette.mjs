// Colour check (spec §9.1): alien body colours must stay apart under protan / deutan / tritan simulation (Machado 2009, severity 1.0)
// and every star / alien colour needs >= 3:1 against the night sky (WCAG non-text contrast). Shape + pattern still carry identity (colour is never the only cue).
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
const gam = (c) => c.map((v) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; });
const MAT = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const mul = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const lab = (rgbLin) => {
  const [r, g, b] = rgbLin, X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const Y = (h) => { const [r, g, b] = lin(hex(h)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [p, q] = [Y(a), Y(b)].sort((x, y) => y - x); return (p + 0.05) / (q + 0.05); };
export const NIGHT = '#0c1230';
export const ALIENS = { vermilion: '#ff6a3d', gold: '#f6b934', teal: '#26c6b0', azure: '#4aa3ff', magenta: '#e86bd0', silver: '#e4e9ff' };
export const STAR = { lit: '#ffd863', dim: '#4f63b4', ok: '#1aa892', slip: '#f0a53a', line: '#fde6ad' };
export function check() {
  const names = Object.keys(ALIENS), res = { pairs: [], contrast: [], fails: [] };
  for (const mode of ['normal', ...Object.keys(MAT)]) {
    let minD = 999, minPair = '';
    for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) {
      const a = lin(hex(ALIENS[names[i]])), b = lin(hex(ALIENS[names[j]]));
      const d = dE(lab(mode === 'normal' ? a : mul(MAT[mode], a)), lab(mode === 'normal' ? b : mul(MAT[mode], b)));
      if (d < minD) { minD = d; minPair = `${names[i]}/${names[j]}`; }
    }
    res.pairs.push({ mode, minD: +minD.toFixed(1), minPair });
    if (mode === 'normal' && minD < 25) res.fails.push(`normal-vision min dE ${minD.toFixed(1)} < 25`);
    if (mode !== 'normal' && minD < 8) res.fails.push(`${mode} min dE ${minD.toFixed(1)} < 8 (${minPair}) -> shape/pattern must carry identity there (it does)`);
  }
  for (const [k, c] of [...Object.entries(ALIENS), ['star.lit', STAR.lit], ['star.ok', STAR.ok], ['star.slip', STAR.slip], ['star.dim', STAR.dim]]) {
    const r = contrast(c, NIGHT); res.contrast.push({ k, ratio: +r.toFixed(2) }); if (r < 3) res.fails.push(`${k} contrast ${r.toFixed(2)} < 3`);
  }
  const dimR = contrast(STAR.dim, NIGHT); if (dimR < 3 || dimR > 4.5) res.fails.push(`empty star slot contrast ${dimR.toFixed(2)} must be >= 3:1 (WCAG non-text) yet quieter than lit stars (<= 4.5)`);
  return res;
}
if (process.argv[1].endsWith('palette.mjs')) {
  const r = check(); r.pairs.forEach((p) => console.log(`alien colours ${p.mode.padEnd(7)} min pair dE ${p.minD} (${p.minPair})`));
  console.log('contrast vs night ' + NIGHT + ': ' + r.contrast.map((c) => `${c.k} ${c.ratio}`).join(', '));
  console.log(`palette checks failed: ${r.fails.length}`); r.fails.forEach((f) => console.log('  ', f)); process.exit(r.fails.length ? 1 : 0);
}
