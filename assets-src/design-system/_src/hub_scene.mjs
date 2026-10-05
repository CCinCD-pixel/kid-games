// 星港 hub backdrop — paper-cut night star port. Parametric (landscape/portrait),
// rendered OFFLINE to WebP (filters/blur are fine here; runtime never runs them).
// node _src/hub_scene.mjs  → _src/scene/hub-{landscape,portrait}.svg
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const f = (n) => +n.toFixed(1);

export function scene(W, H, opts = {}) {
  const portrait = H > W;
  const r = rng(opts.seed ?? 11);
  // horizon + element scale. The hub layout keeps the port in the top ~35 % and leaves a dark
  // paper "ground" below for the place cards (opts.hz / opts.k); defaults suit a full-bleed scene.
  const hz = H * (opts.hz ?? (portrait ? 0.5 : 0.6));
  const u = (Math.min(W, H) / 810) * (opts.k ?? 1);
  const moon = portrait ? [W * 0.76, opts.hz ? hz * 0.5 : H * 0.15, 78 * u] : [W * 0.79, opts.hz ? hz * 0.48 : H * 0.2, 80 * u];
  const out = [];
  const L = (s) => out.push(s);
  const layer = (inner, k = 1) => `<g filter="url(#ps${k})">${inner}</g>`;

  L(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#090e27"/><stop offset="${f(hz / H * .45)}" stop-color="#121a40"/>
    <stop offset="${f(hz / H * .8)}" stop-color="#26306a"/><stop offset="${f(hz / H)}" stop-color="#4a3f80"/>
    <stop offset="${f(Math.min(1, hz / H + .08))}" stop-color="#6a4a8c"/><stop offset="1" stop-color="#6a4a8c"/></linearGradient>
  <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#fff3d6" stop-opacity=".22"/><stop offset="1" stop-color="#fff3d6" stop-opacity="0"/></radialGradient>
  <radialGradient id="dusk" cx=".5" cy="1" r=".75"><stop offset="0" stop-color="#e88a7a" stop-opacity=".38"/><stop offset=".55" stop-color="#b77fae" stop-opacity=".12"/><stop offset="1" stop-color="#b77fae" stop-opacity="0"/></radialGradient>
  <radialGradient id="win" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a3" stop-opacity=".9"/><stop offset="1" stop-color="#ffb84a" stop-opacity="0"/></radialGradient>
  <filter id="ps1" x="-5%" y="-10%" width="110%" height="130%"><feOffset in="SourceAlpha" dy="${f(1.6 * u)}" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="edge"/><feFlood flood-color="#dfe5ff" flood-opacity=".55"/><feComposite in2="edge" operator="in" result="rim"/><feDropShadow in="SourceGraphic" dx="0" dy="${f(5 * u)}" stdDeviation="${f(6 * u)}" flood-color="#03051a" flood-opacity=".55" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="rim"/></feMerge></filter>
  <filter id="ps2" x="-5%" y="-10%" width="110%" height="130%"><feOffset in="SourceAlpha" dy="${f(2 * u)}" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="edge"/><feFlood flood-color="#fff3d6" flood-opacity=".7"/><feComposite in2="edge" operator="in" result="rim"/><feDropShadow in="SourceGraphic" dx="0" dy="${f(8 * u)}" stdDeviation="${f(9 * u)}" flood-color="#03051a" flood-opacity=".6" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="rim"/></feMerge></filter>
  <filter id="ps0" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="${f(3 * u)}" stdDeviation="${f(3 * u)}" flood-color="#03051a" flood-opacity=".45"/></filter>
  <linearGradient id="meteor" x1="0" y1="0" x2="1" y2=".33"><stop offset="0" stop-color="#fff6e3" stop-opacity="0"/><stop offset="1" stop-color="#fff6e3" stop-opacity=".9"/></linearGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(4 * u)}"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .05 0 0 0 0 .05 0 0 0 0 .15 0 0 0 -1.4 .75"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<ellipse cx="${W * .45}" cy="${hz}" rx="${W * .9}" ry="${H * .35}" fill="url(#dusk)"/>`);

  // ---- stars
  let stars = '';
  for (let i = 0; i < (portrait ? 150 : 170); i++) {
    const x = r() * W, y = r() * hz * 0.95, s = (r() < .1 ? 2.1 : r() < .4 ? 1.4 : .9) * u, o = .35 + r() * .6;
    stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="#fff3d6" opacity="${f(o)}"/>`;
  }
  const spark = (x, y, R, o = 1) => `<path d="M${f(x)} ${f(y - R)}Q${f(x + R * .16)} ${f(y - R * .16)} ${f(x + R)} ${f(y)}Q${f(x + R * .16)} ${f(y + R * .16)} ${f(x)} ${f(y + R)}Q${f(x - R * .16)} ${f(y + R * .16)} ${f(x - R)} ${f(y)}Q${f(x - R * .16)} ${f(y - R * .16)} ${f(x)} ${f(y - R)}Z" fill="#fff6e3" opacity="${o}"/>`;
  for (let i = 0; i < 9; i++) stars += spark(r() * W, r() * hz * 0.8, (5 + r() * 6) * u, .8);
  L(`<g>${stars}</g>`);

  // ---- 北斗七星 (Big Dipper) — faint constellation lines
  const bd = [[0, 0], [.16, .06], [.3, .12], [.42, .2], [.47, .42], [.68, .46], [.74, .25]];
  const bx = opts.hz ? (portrait ? W * .36 : W * .36) : portrait ? W * .1 : W * .08, by = opts.hz ? H * .03 : portrait ? H * .07 : H * .1, bs = (opts.hz ? 260 : portrait ? 330 : 360) * u;
  const bp = bd.map(([x, y]) => [bx + x * bs, by + y * bs]);
  L(`<path d="M${bp.slice(0, 4).map((p) => p.map(f).join(' ')).join('L')}L${bp[4].map(f).join(' ')}L${bp[5].map(f).join(' ')}L${bp[6].map(f).join(' ')}L${bp[3].map(f).join(' ')}" fill="none" stroke="#b7c1ec" stroke-opacity=".28" stroke-width="${f(1.6 * u)}" stroke-dasharray="${f(2 * u)} ${f(5 * u)}" stroke-linecap="round"/>`);
  L(bp.map(([x, y], i) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f((i === 0 ? 9 : 6) * u)}" fill="#fde6ad" opacity=".18" filter="url(#glow)"/>` + spark(x, y, (i === 0 ? 9 : 7) * u, .95)).join(''));

  // ---- moon: paper rings + face. The hub passes { moon: false }: it draws today's real phase
  // as a live SVG layer at the same spot (site/_hub/moon.ts), so the backdrop must not bake one in.
  const [mx, my, mr] = moon;
  if (opts.moon !== false) {
    L(`<circle cx="${mx}" cy="${my}" r="${mr * 2.1}" fill="url(#halo)"/>`);
    L(layer(`<circle cx="${mx}" cy="${my}" r="${f(mr * 1.22)}" fill="#fde6ad" opacity=".16"/><circle cx="${mx}" cy="${my}" r="${f(mr * 1.1)}" fill="#fde6ad" opacity=".18"/>`, 0));
    L(layer(`<circle cx="${mx}" cy="${my}" r="${mr}" fill="#fff3d6"/>
      <path d="M${f(mx + mr * .05)} ${f(my - mr)}a${mr} ${mr} 0 0 1 0 ${f(mr * 2)}a${f(mr * .78)} ${mr} 0 0 0 0 ${f(-mr * 2)}Z" fill="#f6dcaa" opacity=".6"/>
      <circle cx="${f(mx - mr * .3)}" cy="${f(my - mr * .25)}" r="${f(mr * .16)}" fill="#f2d39c" opacity=".8"/>
      <circle cx="${f(mx + mr * .25)}" cy="${f(my + mr * .3)}" r="${f(mr * .11)}" fill="#f2d39c" opacity=".8"/>
      <circle cx="${f(mx - mr * .05)}" cy="${f(my + mr * .45)}" r="${f(mr * .07)}" fill="#f2d39c" opacity=".7"/>
      <circle cx="${f(mx + mr * .4)}" cy="${f(my - mr * .35)}" r="${f(mr * .06)}" fill="#f2d39c" opacity=".7"/>`, 1));
  }

  // ---- sky craft: 鹊桥 relay (dish + panels) by the moon, 天宫 station, a shooting star
  const sat = (x, y, s, rot) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${f(s * u)})">
      <rect x="-40" y="-7" width="26" height="14" rx="2" fill="#5466b0"/><path d="M-31-7v14M-23-7v14" stroke="#8594d6" stroke-width="1.5"/>
      <rect x="14" y="-7" width="26" height="14" rx="2" fill="#5466b0"/><path d="M23-7v14M31-7v14" stroke="#8594d6" stroke-width="1.5"/>
      <path d="M-14 0h28" stroke="#b7c1ec" stroke-width="3"/>
      <rect x="-8" y="-9" width="16" height="18" rx="4" fill="#fff6e3"/><rect x="-8" y="2" width="16" height="7" rx="3" fill="#e9dcc3"/>
      <path d="M-11-14a13 9 0 0 0 22 0Z" fill="#fde6ad"/><path d="M0-14v-5" stroke="#fde6ad" stroke-width="2"/><circle cx="0" cy="-20" r="2" fill="#ff6b5a"/></g>`;
  L(layer(sat(mx - mr * 1.75, my + mr * 1.15, .9, -14), 0));
  const tg = (x, y, s) => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s * u)})" opacity=".9">
      <rect x="-30" y="-4" width="60" height="8" rx="4" fill="#b7c1ec"/><rect x="-12" y="-9" width="24" height="18" rx="6" fill="#e2e7fb"/>
      <rect x="-56" y="-12" width="22" height="24" rx="2" fill="#35468c"/><rect x="34" y="-12" width="22" height="24" rx="2" fill="#35468c"/>
      <path d="M-45-12v24M45-12v24" stroke="#5466b0" stroke-width="1.5"/><circle cx="0" cy="0" r="3" fill="#ffd77a"/></g>`;
  L(layer(opts.hz ? tg(portrait ? W * .1 : W * .07, hz * .78, .55) : tg(portrait ? W * .42 : W * .36, portrait ? H * .09 : H * .1, .55), 0));
  const sx0 = portrait ? W * .1 : W * .6, sy0 = portrait ? H * .22 : H * .08;
  L(`<path d="M${f(sx0)} ${f(sy0)}l${f(110 * u)} ${f(36 * u)}" stroke="url(#meteor)" stroke-width="${f(3 * u)}" stroke-linecap="round"/><circle cx="${f(sx0 + 110 * u)}" cy="${f(sy0 + 36 * u)}" r="${f(3 * u)}" fill="#fff6e3"/>`);

  // ---- 祥云 clouds (paper, translucent lavender)
  const cloud = (x, y, s, c, o) => {
    const p = `M-120 40Q-132-8-82-14Q-76-60-24-54Q0-96 52-60Q102-72 106-20Q152-14 142 40Z`;
    return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s * u)})" opacity="${o}"><path d="${p}" fill="${c}"/>
      <path d="M-60 22q20-30 45-5q-20-5-25 15M32 16q25-35 55-5q-25-5-30 18" fill="none" stroke="#fff6e3" stroke-opacity=".45" stroke-width="6" stroke-linecap="round"/></g>`;
  };
  L(layer(cloud(portrait ? W * .2 : W * .52, portrait ? H * .3 : H * .26, .62, '#8594d6', .55) + cloud(portrait ? W * .84 : W * .97, portrait ? H * .34 : H * .42, .5, '#8594d6', .45), 0));

  // ---- far ridges
  const ridge = (y0, amp, c, n, seed, k = 1) => {
    const rr = rng(seed);
    let d = `M-20 ${H}L-20 ${f(y0)}`;
    for (let i = 1; i <= n * 2; i++) {
      const x = -20 + (W + 40) * i / (n * 2);
      const y = y0 - (i % 2 ? amp * (.55 + rr() * .5) : amp * rr() * .25);
      const cx = -20 + (W + 40) * (i - .5) / (n * 2);
      d += ` Q${f(cx)} ${f(y0 - (i % 2 ? amp * .25 : amp * .75))} ${f(x)} ${f(y)}`;
    }
    d += ` L${W + 20} ${H}Z`;
    return layer(`<path d="${d}" fill="${c}"/>`, k);
  };
  L(ridge(hz - 40 * u, 120 * u, '#2c3a7a', 4, 5));
  L(ridge(hz - 6 * u, 80 * u, '#222e66', 6, 9));

  // ---- star port (mid layer)
  const g = []; const G = (s) => g.push(s);
  const ground = hz + 34 * u;
  const winDot = (x, y, w = 7, h = 9) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w * u)}" height="${f(h * u)}" rx="${f(1.5 * u)}" fill="#ffd77a"/>`;
  // launch tower + rocket
  const tx = portrait ? W * .26 : W * .27, th = (portrait ? 330 : 300) * u, tw = 46 * u;
  let lattice = `<rect x="${f(tx - tw / 2)}" y="${f(ground - th)}" width="${f(tw)}" height="${f(th)}" fill="none" stroke="#3b4a8e" stroke-width="${f(5 * u)}"/>`;
  for (let i = 0; i < 9; i++) { const y = ground - th + i * th / 9; lattice += `<path d="M${f(tx - tw / 2)} ${f(y)}L${f(tx + tw / 2)} ${f(y + th / 9)}M${f(tx + tw / 2)} ${f(y)}L${f(tx - tw / 2)} ${f(y + th / 9)}" stroke="#34427f" stroke-width="${f(2.6 * u)}"/>`; }
  lattice += `<rect x="${f(tx - tw / 2 - 6 * u)}" y="${f(ground - th - 14 * u)}" width="${f(tw + 12 * u)}" height="${f(14 * u)}" rx="${f(3 * u)}" fill="#3b4a8e"/>`;
  lattice += `<path d="M${f(tx + tw / 2)} ${f(ground - th * .78)}h${f(36 * u)}M${f(tx + tw / 2)} ${f(ground - th * .55)}h${f(36 * u)}" stroke="#3b4a8e" stroke-width="${f(6 * u)}"/>`;
  lattice += `<circle cx="${f(tx)}" cy="${f(ground - th - 20 * u)}" r="${f(4 * u)}" fill="#ff6b5a"/><circle cx="${f(tx)}" cy="${f(ground - th - 20 * u)}" r="${f(10 * u)}" fill="#ff6b5a" opacity=".35" filter="url(#glow)"/>`;
  G(layer(lattice, 1));
  const rx = tx + tw / 2 + 58 * u, rH = th * .86, rW = 34 * u, rTop = ground - rH;
  G(layer(`
    <path d="M${f(rx - rW * 1.25)} ${f(ground)}v${f(-rH * .34)}q0 ${f(-rH * .1)} ${f(rW * .3)} ${f(-rH * .14)}q${f(rW * .3)} ${f(rH * .04)} ${f(rW * .3)} ${f(rH * .14)}v${f(rH * .34)}Z" fill="#e9dcc3"/>
    <path d="M${f(rx + rW * .65)} ${f(ground)}v${f(-rH * .34)}q0 ${f(-rH * .1)} ${f(rW * .3)} ${f(-rH * .14)}q${f(rW * .3)} ${f(rH * .04)} ${f(rW * .3)} ${f(rH * .14)}v${f(rH * .34)}Z" fill="#e9dcc3"/>
    <path d="M${f(rx - rW / 2)} ${f(ground)}V${f(rTop + rH * .2)}Q${f(rx - rW / 2)} ${f(rTop + rH * .05)} ${f(rx)} ${f(rTop)}Q${f(rx + rW / 2)} ${f(rTop + rH * .05)} ${f(rx + rW / 2)} ${f(rTop + rH * .2)}V${f(ground)}Z" fill="#fff6e3"/>
    <path d="M${f(rx)} ${f(rTop)}Q${f(rx + rW / 2)} ${f(rTop + rH * .05)} ${f(rx + rW / 2)} ${f(rTop + rH * .2)}V${f(ground)}H${f(rx + rW * .12)}V${f(rTop + rH * .2)}Q${f(rx + rW * .12)} ${f(rTop + rH * .06)} ${f(rx)} ${f(rTop)}Z" fill="#eadfca"/>
    <path d="M${f(rx - rW / 2)} ${f(rTop + rH * .2)}Q${f(rx - rW / 2)} ${f(rTop + rH * .05)} ${f(rx)} ${f(rTop)}Q${f(rx + rW / 2)} ${f(rTop + rH * .05)} ${f(rx + rW / 2)} ${f(rTop + rH * .2)}Z" fill="#e4513d"/>
    <rect x="${f(rx - rW / 2)}" y="${f(rTop + rH * .42)}" width="${f(rW)}" height="${f(rH * .05)}" fill="#e4513d"/>
    <rect x="${f(rx - rW / 2)}" y="${f(rTop + rH * .72)}" width="${f(rW)}" height="${f(rH * .04)}" fill="#e4513d"/>
    <circle cx="${f(rx)}" cy="${f(rTop + rH * .3)}" r="${f(rW * .2)}" fill="#3f7be6" stroke="#e9dcc3" stroke-width="${f(3 * u)}"/>
    <path d="M${f(rx - rW * .2)} ${f(rTop + rH * .55)}h${f(rW * .4)}" stroke="#e4513d" stroke-width="${f(3 * u)}" stroke-linecap="round" opacity=".7"/>`, 2));

  // control tower with 飞檐 roof
  const cx = portrait ? W * .54 : W * .5, cw = 74 * u, ch = 150 * u;
  G(layer(`
    <rect x="${f(cx - cw * .32)}" y="${f(ground - ch)}" width="${f(cw * .64)}" height="${f(ch)}" fill="#3a4890"/>
    <rect x="${f(cx - cw * .32)}" y="${f(ground - ch)}" width="${f(cw * .2)}" height="${f(ch)}" fill="#44539c"/>
    <path d="M${f(cx - cw * .75)} ${f(ground - ch - 4 * u)}Q${f(cx - cw * .5)} ${f(ground - ch - 10 * u)} ${f(cx - cw * .35)} ${f(ground - ch - 34 * u)}H${f(cx + cw * .35)}Q${f(cx + cw * .5)} ${f(ground - ch - 10 * u)} ${f(cx + cw * .75)} ${f(ground - ch - 4 * u)}Z" fill="#e4513d"/>
    <rect x="${f(cx - cw * .5)}" y="${f(ground - ch - 72 * u)}" width="${f(cw)}" height="${f(40 * u)}" rx="${f(8 * u)}" fill="#4a5aa8"/>
    <rect x="${f(cx - cw * .42)}" y="${f(ground - ch - 64 * u)}" width="${f(cw * .84)}" height="${f(22 * u)}" rx="${f(5 * u)}" fill="#ffd77a"/>
    <path d="M${f(cx - cw * .14)} ${f(ground - ch - 64 * u)}v${f(22 * u)}M${f(cx + cw * .14)} ${f(ground - ch - 64 * u)}v${f(22 * u)}" stroke="#4a5aa8" stroke-width="${f(3 * u)}"/>
    <path d="M${f(cx - cw * .68)} ${f(ground - ch - 70 * u)}Q${f(cx - cw * .45)} ${f(ground - ch - 76 * u)} ${f(cx - cw * .3)} ${f(ground - ch - 98 * u)}H${f(cx + cw * .3)}Q${f(cx + cw * .45)} ${f(ground - ch - 76 * u)} ${f(cx + cw * .68)} ${f(ground - ch - 70 * u)}Z" fill="#e4513d"/>
    <path d="M${f(cx)} ${f(ground - ch - 98 * u)}v${f(-26 * u)}" stroke="#f6b934" stroke-width="${f(3 * u)}"/>
    <circle cx="${f(cx)}" cy="${f(ground - ch - 126 * u)}" r="${f(5 * u)}" fill="#f6b934"/>
    ${[0, 1, 2, 3].map((i) => winDot(cx - 10 * u, ground - ch + (22 + i * 30) * u, 8, 12) + winDot(cx + 4 * u, ground - ch + (22 + i * 30) * u, 8, 12)).join('')}`, 1));

  // domes
  const dx = portrait ? W * .74 : W * .64;
  const dome = (x, R, fill, shade) => `<path d="M${f(x - R)} ${f(ground)}a${f(R)} ${f(R)} 0 0 1 ${f(R * 2)} 0Z" fill="${fill}"/>
    <path d="M${f(x)} ${f(ground - R)}a${f(R)} ${f(R)} 0 0 1 ${f(R)} ${f(R)}H${f(x + R * .25)}Q${f(x + R * .3)} ${f(ground - R * .7)} ${f(x)} ${f(ground - R)}Z" fill="${shade}"/>
    <path d="M${f(x - R * .8)} ${f(ground - R * .45)}Q${f(x)} ${f(ground - R * .75)} ${f(x + R * .8)} ${f(ground - R * .45)}" fill="none" stroke="${shade}" stroke-width="${f(2.5 * u)}"/>
    <path d="M${f(x - R * .2)} ${f(ground)}v${f(-R * .32)}a${f(R * .2)} ${f(R * .2)} 0 0 1 ${f(R * .4)} 0v${f(R * .32)}Z" fill="#ffd77a"/>`;
  G(layer(dome(dx, 64 * u, '#c9cff0', '#a9b3e6') + dome(dx + 96 * u, 40 * u, '#b7c1ec', '#97a3df') + `<rect x="${f(dx - 70 * u)}" y="${f(ground - 4 * u)}" width="${f(220 * u)}" height="${f(8 * u)}" rx="${f(4 * u)}" fill="#8594d6"/>`, 1));

  // radar dish on hill
  const rdx = portrait ? W * .9 : W * .86;
  G(layer(`<path d="M${f(rdx - 120 * u)} ${f(ground + 20 * u)}Q${f(rdx)} ${f(ground - 70 * u)} ${f(rdx + 140 * u)} ${f(ground + 20 * u)}Z" fill="#1d285c"/>
    <path d="M${f(rdx - 9 * u)} ${f(ground - 22 * u)}L${f(rdx - 3 * u)} ${f(ground - 92 * u)}h${f(8 * u)}L${f(rdx + 11 * u)} ${f(ground - 22 * u)}Z" fill="#3b4a8e"/>
    <path d="M${f(rdx - 52 * u)} ${f(ground - 120 * u)}A${f(60 * u)} ${f(60 * u)} 0 0 0 ${f(rdx + 44 * u)} ${f(ground - 64 * u)}Z" fill="#c9cff0"/>
    <path d="M${f(rdx - 52 * u)} ${f(ground - 120 * u)}A${f(60 * u)} ${f(60 * u)} 0 0 0 ${f(rdx + 44 * u)} ${f(ground - 64 * u)}L${f(rdx + 26 * u)} ${f(ground - 76 * u)}A${f(46 * u)} ${f(46 * u)} 0 0 1 ${f(rdx - 40 * u)} ${f(ground - 116 * u)}Z" fill="#a9b3e6"/>
    <path d="M${f(rdx - 4 * u)} ${f(ground - 92 * u)}l${f(-22 * u)} ${f(-26 * u)}" stroke="#e9dcc3" stroke-width="${f(3 * u)}" stroke-linecap="round"/>
    <circle cx="${f(rdx - 27 * u)}" cy="${f(ground - 119 * u)}" r="${f(5 * u)}" fill="#ff6b5a"/>`, 1));
  L(g.join(''));

  // ---- near hills + lantern path
  const near = (y0, amp, c, seed, k) => {
    const rr = rng(seed);
    let d = `M-20 ${H}L-20 ${f(y0)}`;
    const n = 5;
    for (let i = 1; i <= n; i++) { const x = -20 + (W + 40) * i / n; d += ` Q${f(x - (W + 40) / n / 2)} ${f(y0 - amp * (.4 + rr() * .8))} ${f(x)} ${f(y0 + (rr() - .5) * amp * .4)}`; }
    d += ` L${W + 20} ${H}Z`;
    return layer(`<path d="${d}" fill="${c}"/>`, k);
  };
  L(near(ground + 10 * u, 30 * u, '#18215230'.slice(0, 7), 21, 2));
  let lanterns = '';
  for (let i = 0; i < 9; i++) {
    const x = W * (.06 + i * .11), y = ground + (24 + Math.sin(i * 1.3) * 8) * u;
    lanterns += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(12 * u)}" fill="url(#win)"/><rect x="${f(x - 3.5 * u)}" y="${f(y - 5 * u)}" width="${f(7 * u)}" height="${f(9 * u)}" rx="${f(2.5 * u)}" fill="#ffcf6a"/>`;
  }
  L(lanterns);
  L(near(ground + 60 * u, 40 * u, '#121a40', 33, 2));
  L(near(ground + 120 * u, 50 * u, '#0c1230', 45, 2));
  L(`<rect width="${W}" height="${H}" filter="url(#grain)" opacity=".22"/>`);
  L('</svg>');
  return out.join('\n');
}

const dir = path.join(ROOT, '_src', 'scene');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'hub-landscape.svg'), scene(1080, 810, { hz: 0.27, k: 0.6, moon: false }));
fs.writeFileSync(path.join(dir, 'hub-portrait.svg'), scene(810, 1080, { hz: 0.28, k: 0.74, moon: false }));
fs.writeFileSync(path.join(dir, 'scene-landscape.svg'), scene(1080, 810));
fs.writeFileSync(path.join(dir, 'scene-portrait.svg'), scene(810, 1080));
console.log('scene svgs written');
