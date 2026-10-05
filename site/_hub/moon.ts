/**
 * Today's moon, computed on the device (no network): low-precision lunar phase from Meeus,
 * Astronomical Algorithms ch. 48 (phase angle from the mean elongation and anomalies with the six
 * largest periodic terms) — good to well under a day, which is all a sky picture needs.
 *
 *   const m = moonPhase(new Date());   // { phaseAngle, illumination, waxing, elongation, key, name }
 *   svg.innerHTML = moonSvg(m);         // lit part on the right while waxing (northern hemisphere)
 */

export type PhaseKey =
  | 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous'
  | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent';

export interface MoonPhase {
  /** Sun–Moon angle seen from the Moon, degrees: 0 = full, 180 = new */
  phaseAngle: number;
  /** illuminated fraction 0..1 */
  illumination: number;
  waxing: boolean;
  /** 0..360: 0 new, 90 first quarter, 180 full, 270 last quarter */
  elongation: number;
  /** approximate age in days since new moon */
  age: number;
  key: PhaseKey;
  /** child-facing Chinese name */
  name: string;
}

const SYNODIC = 29.530588853;
const rad = (d: number) => (d * Math.PI) / 180;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export const PHASE_NAMES: Record<PhaseKey, string> = {
  new: '新月',
  'waxing-crescent': '蛾眉月',
  'first-quarter': '上弦月',
  'waxing-gibbous': '盈凸月',
  full: '满月',
  'waning-gibbous': '亏凸月',
  'last-quarter': '下弦月',
  'waning-crescent': '残月',
};

/** Bucket an elongation (0..360) into the eight named phases (quarters/new/full ±~1.5 days). */
export function phaseKey(elongation: number): PhaseKey {
  const e = norm360(elongation);
  if (e < 18 || e >= 342) return 'new';
  if (e < 72) return 'waxing-crescent';
  if (e < 108) return 'first-quarter';
  if (e < 162) return 'waxing-gibbous';
  if (e < 198) return 'full';
  if (e < 252) return 'waning-gibbous';
  if (e < 288) return 'last-quarter';
  return 'waning-crescent';
}

export function moonPhase(date: Date | number = Date.now()): MoonPhase {
  const ms = typeof date === 'number' ? date : date.getTime();
  const jd = ms / 86_400_000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);
  // apparent elongation = 180° − i (Meeus eq. 48.4)
  const elongation = norm360(
    D
      + 6.289 * Math.sin(rad(Mp))
      - 2.1 * Math.sin(rad(M))
      + 1.274 * Math.sin(rad(2 * D - Mp))
      + 0.658 * Math.sin(rad(2 * D))
      + 0.214 * Math.sin(rad(2 * Mp))
      + 0.11 * Math.sin(rad(D)),
  );
  const waxing = elongation < 180;
  const phaseAngle = 180 - (waxing ? elongation : 360 - elongation);
  const illumination = (1 + Math.cos(rad(phaseAngle))) / 2;
  const key = phaseKey(elongation);
  return { phaseAngle, illumination, waxing, elongation, age: (elongation / 360) * SYNODIC, key, name: PHASE_NAMES[key] };
}

/**
 * The lit part of a disc (cx, cy, r) as an SVG path: a semicircle on the sunlit limb closed by the
 * terminator, a half-ellipse whose x-radius is r·|cos(phaseAngle)|.
 */
export function litPath(m: Pick<MoonPhase, 'phaseAngle' | 'waxing'>, cx: number, cy: number, r: number): string {
  const k = Math.cos(rad(m.phaseAngle)); // 1 full … -1 new
  const rx = Math.abs(k) * r;
  const f = (n: number) => +n.toFixed(2);
  // limb: right half when waxing, left half when waning (northern-hemisphere view)
  const limbSweep = m.waxing ? 1 : 0;
  // terminator bulges toward the dark side when gibbous (k > 0), toward the lit side when crescent
  const termSweep = (k > 0) === m.waxing ? 1 : 0;
  return `M${f(cx)} ${f(cy - r)}A${f(r)} ${f(r)} 0 0 ${limbSweep} ${f(cx)} ${f(cy + r)}A${f(rx)} ${f(r)} 0 0 ${termSweep} ${f(cx)} ${f(cy - r)}Z`;
}

/** Paper-cut moon matching the hub backdrop: halo, earthshine disc, lit part with craters. viewBox 0 0 200 200. */
export function moonSvg(m: MoonPhase): string {
  const c = 100, r = 56;
  const glow = (0.25 + 0.75 * m.illumination).toFixed(2);
  const lit = m.illumination < 0.015 ? '' : litPath(m, c, c, r);
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="mh" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#fff3d6" stop-opacity=".30"/><stop offset="1" stop-color="#fff3d6" stop-opacity="0"/></radialGradient>
    <clipPath id="ml"><path d="${lit}"/></clipPath>
    <filter id="mps" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#03051a" flood-opacity=".5"/></filter>
  </defs>
  <circle cx="${c}" cy="${c}" r="${r * 1.75}" fill="url(#mh)" opacity="${glow}"/>
  <g filter="url(#mps)">
    <circle cx="${c}" cy="${c}" r="${r}" fill="#1f2858" fill-opacity=".78"/>
    <circle cx="${c}" cy="${c}" r="${r - 0.75}" fill="none" stroke="#fde6ad" stroke-opacity=".16" stroke-width="1.5"/>
    ${lit ? `<g clip-path="url(#ml)">
      <circle cx="${c}" cy="${c}" r="${r}" fill="#fff3d6"/>
      <path d="M${c + 3} ${c - r}a${r} ${r} 0 0 1 0 ${2 * r}a${r * 0.78} ${r} 0 0 0 0 ${-2 * r}Z" fill="#f6dcaa" opacity=".55"/>
      <circle cx="${c - 17}" cy="${c - 14}" r="9" fill="#f2d39c" opacity=".8"/>
      <circle cx="${c + 14}" cy="${c + 17}" r="6.2" fill="#f2d39c" opacity=".8"/>
      <circle cx="${c - 3}" cy="${c + 25}" r="4" fill="#f2d39c" opacity=".7"/>
      <circle cx="${c + 22}" cy="${c - 20}" r="3.4" fill="#f2d39c" opacity=".7"/>
      <circle cx="${c - 30}" cy="${c + 12}" r="3" fill="#f2d39c" opacity=".6"/>
    </g>` : ''}
  </g>
</svg>`;
}
