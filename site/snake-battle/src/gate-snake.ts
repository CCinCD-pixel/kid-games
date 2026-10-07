/**
 * S0 start gate (spec §2.5 S0, QA r1–r3 carry-over): a gold snake swims a slow loop behind the kit gate's
 * 开始 button. Pure SVG: the body is a dash that travels along a closed path (CSS dashoffset) and the head
 * rides the same path at the same speed (SMIL animateMotion, rotate=auto). No rAF, no audio; static when the
 * player prefers reduced motion. Decorative only (pointer-events none, aria-hidden).
 */
/** a wavy oval around the gate card (viewBox 800², sliced: portrait shows x 100–700, landscape y 100–700); it never
 * crosses the title, subtitle or button (QA r3 look: the first loop swam over the title) */
const PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 144; i++) { const a = (i / 144) * Math.PI * 2 - Math.PI / 2, k = 1 + 0.07 * Math.sin(5 * a); pts.push(`${(400 + 235 * k * Math.cos(a)).toFixed(1)} ${(390 + 240 * k * Math.sin(a)).toFixed(1)}`); }
  return `M${pts.join(' L')} Z`;
})();

export function gateSnake(): SVGSVGElement {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sb-gate-snake'); svg.setAttribute('viewBox', '0 0 800 800'); svg.setAttribute('preserveAspectRatio', 'xMidYMid slice'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><path id="sb-gate-path" d="${PATH}"/></defs>
    <use href="#sb-gate-path" class="sb-gate-snake__trail" fill="none"/>
    <path d="${PATH}" pathLength="1000" class="sb-gate-snake__rim${reduce ? ' is-still' : ''}" fill="none"/>
    <path d="${PATH}" pathLength="1000" class="sb-gate-snake__body${reduce ? ' is-still' : ''}" fill="none"/>
    <path d="${PATH}" pathLength="1000" class="sb-gate-snake__band${reduce ? ' is-still' : ''}" fill="none"/>
    <g class="sb-gate-snake__head">
      <ellipse cx="0" cy="0" rx="29" ry="25" fill="#ffd23f" stroke="#9a5a00" stroke-width="5"/>
      <ellipse cx="-6" cy="-10" rx="12" ry="6" fill="rgba(255,255,255,.55)"/>
      <circle cx="10" cy="-11" r="8.5" fill="#fffdf6" stroke="#20223a" stroke-width="3"/><circle cx="10" cy="11" r="8.5" fill="#fffdf6" stroke="#20223a" stroke-width="3"/>
      <circle cx="13" cy="-11" r="4.2" fill="#1a1830"/><circle cx="13" cy="11" r="4.2" fill="#1a1830"/>
      ${reduce ? '' : '<animateMotion dur="14s" repeatCount="indefinite" rotate="auto" calcMode="paced"><mpath href="#sb-gate-path"/></animateMotion>'}
    </g>`;
  if (reduce) svg.querySelector('.sb-gate-snake__head')!.setAttribute('transform', 'translate(400 133) rotate(0)');
  return svg;
}
