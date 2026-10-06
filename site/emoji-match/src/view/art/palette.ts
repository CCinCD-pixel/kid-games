/** Board palette (spec §6.2/§6.3). Gem colours: base / light (white 38 %) / dark (black 18 %) / rim (white 45 %). */
export interface GemColors { base: string; light: string; dark: string; rim: string; name: string }
export const GEMS: GemColors[] = [
  { name: '火晶', base: '#E12347', light: '#EC778D', dark: '#B81D3A', rim: '#EE869A' },
  { name: '环星', base: '#E3891C', light: '#EEB672', dark: '#BA7017', rim: '#F0BE82' },
  { name: '太阳晶', base: '#ECE00D', light: '#F3EC69', dark: '#C2B80B', rim: '#F5EE7A' },
  { name: '叶晶', base: '#3EB97D', light: '#87D4AE', dark: '#339866', rim: '#95D9B8' },
  { name: '钻晶', base: '#0774CA', light: '#65A9DE', dark: '#065FA6', rim: '#77B3E2' },
  { name: '月牙', base: '#CA9CF0', light: '#DEC2F6', dark: '#A680C5', rim: '#E2C9F7' },
];
export const BOARD = {
  panel: 'rgba(27,35,80,.88)',
  tileA: '#222C5E',
  tileB: '#1D2654',
  tileHi: 'rgba(255,255,255,.07)',
};
/** per-episode rim colour (§6.7) */
export const EP_RIM: Record<number, string> = { 1: '#c8459d', 2: '#8E9BC7', 3: '#D0643A', 4: '#8A7A6A' };

export function hexToRgb(h: string): [number, number, number] {
  let x = h.slice(1);
  if (x.length === 3) x = x.split('').map((ch) => ch + ch).join('');
  const n = parseInt(x, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
export const rgba = (h: string, a: number): string => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
