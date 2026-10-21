// @ts-nocheck
// GENERATED from tools/memory-matrix/proto/cards.mjs by tools/memory-matrix/sync-core.mjs - do not edit; change the oracle and re-run the script.
// The 28 earnable star-atlas cards + the 元老 card (spec §8). Facts live in narration.yaml (mm.card.<id>); title / unlock / art here.
// A card needs its MILESTONE (skill) and, except the four 入门 cards, a minimum number of completed nights: need = 3*j + 6 (j = 1..24, fixed atlas order),
// so even a child who clears every milestone in week 1 collects at most ~4 cards a week. Deterministic, no randomness, no currency, no timer.
import { createRng } from './rng';
import { CONSTELLATIONS, lineArt } from './constellations';

export const SECTOR_ZH = { s1: '记星星', s2: '追流星', s3: '送回家', s4: '照镜子' };
export const NEED = (j) => 3 * j + 6;
export const ORDER = ['s1.d4', 's2.d4', 'n1', 's1.g5', 's3.d4', 's2.g5', 's4.d4', 'n2', 's1.d7', 's3.g5', 's2.d7', 's4.g5', 'n3', 's1.g10', 's3.d7', 's2.g10', 's4.d7', 'n4', 's3.g10', 's4.g10', 'n5', 'n6', 'n7', 'n8'];
export const ART_FNS = ['constellation', 'planet', 'star', 'meteor', 'comet', 'mirror', 'galaxy', 'steps'];
const C = (id) => ({ fn: 'constellation', id }), P = (p) => ({ fn: 'planet', ...p }), S = (p) => ({ fn: 'star', ...p });
const T = {
  s1: [['first', '北斗七星', C('beidou')], ['d4', '小熊座', C('xiaoxiong')], ['g5', '北极星', S({ rays: 4, count: 1 })], ['d7', '猎户座', C('lieHu')], ['g10', '天蝎座', C('tianXie')]],
  s2: [['first', '流星', { fn: 'meteor', count: 1 }], ['d4', '英仙座流星雨', { fn: 'meteor', count: 7, radiant: [0.3, 0.2] }], ['g5', '哈雷彗星', { fn: 'comet', tail: 0.5 }], ['d7', '狮子座流星雨', { fn: 'meteor', count: 9, radiant: [0.7, 0.25] }], ['g10', '彗尾', { fn: 'comet', tail: 0.9 }]],
  s3: [['first', '水星', P({ color: '#a8a29e', bands: 0 })], ['d4', '地球', P({ color: '#4aa3ff', clouds: 1 })], ['g5', '火星', P({ color: '#ff6a3d', caps: 1 })], ['d7', '海王星', P({ color: '#4a6bff', bands: 2 })], ['g10', '木星', P({ color: '#f6b934', bands: 5, spot: 1 })]],
  s4: [['first', '金星', P({ color: '#f6d28a', bands: 1, spin: -1 })], ['d4', '月球', P({ color: '#e4e9ff', craters: 5 })], ['g5', '韦伯望远镜', { fn: 'mirror', hex: 18 }], ['d7', '地球自转', P({ color: '#4aa3ff', clouds: 1, spin: 1 })], ['g10', '天王星', P({ color: '#26c6b0', tilt: 98, ring: 1 })]],
};
const N = [['银河系', { fn: 'galaxy', arms: 2 }], ['昴星团', S({ rays: 4, count: 7 })], ['天狼星', S({ rays: 8, count: 1 })], ['土星', P({ color: '#f0d9a0', bands: 3, ring: 1, tilt: 20 })], ['仙后座', C('xianHou')], ['牛郎织女', S({ rays: 4, count: 2, band: 1 })], ['天鹅座', C('tianE')], ['南十字座', C('nanShiZi')]];
const unlock = (s, k) => (k === 'first' ? { kind: 'first', sector: s } : k.startsWith('d') ? { kind: 'level', sector: s, n: Number(k.slice(1)) } : { kind: 'gate', sector: s, n: Number(k.slice(1)) });
const all = [
  ...Object.entries(T).flatMap(([s, rows]) => rows.map(([k, title, art]) => ({ id: `${s}.${k}`, sector: s, title, art, unlock: unlock(s, k) }))),
  ...N.map(([title, art], i) => ({ id: `n${i + 1}`, sector: 'night', title, art, unlock: { kind: 'night' } })),
];
export const CARDS = [
  ...all.map((c) => { const j = ORDER.indexOf(c.id) + 1; return { ...c, slot: j || 0, need: j ? NEED(j) : 0 }; }),
  { id: 'vet', sector: 'night', title: '记忆方块元老', art: { fn: 'steps', g: 4 }, unlock: { kind: 'veteran' }, slot: 0, need: 0 },
];
export const unlockText = (c) => (c.unlock.kind === 'first' ? `${SECTOR_ZH[c.sector]}里第一次点亮` : c.unlock.kind === 'level' ? `${SECTOR_ZH[c.sector]}到第 ${c.unlock.n} 档` : c.unlock.kind === 'gate' ? `${SECTOR_ZH[c.sector]}星门 D${c.unlock.n} 打开` : c.unlock.kind === 'night' ? '夜航满数' : '旧存档至少通关 1 关（一次，永不收回）');
export const needText = (c) => (c.need ? `≥${c.need} 个夜航` : '–');
/** The 星墙: one wall star per card (28), deterministic positions in the unit square, clear of the station's UI. */
export const KEEPOUT = [[0.18, 0.45, 0.1], [0.42, 0.3, 0.1], [0.62, 0.55, 0.1], [0.85, 0.35, 0.1], [0.5, 0.86, 0.14]];   // [x, y, radius] of sector nodes / the 开始夜航 button
export function wallStars() {
  const rng = createRng('mm:wall'), pts = [];
  while (pts.length < 28) {
    let best = null, bd = -1;
    for (let c = 0; c < 40; c += 1) { const p = [rng.float(0.05, 0.95), rng.float(0.05, 0.75)]; if (KEEPOUT.some(([x, y, r]) => Math.hypot(p[0] - x, p[1] - y) < r)) continue; const d = pts.length ? Math.min(...pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))) : 1; if (d > bd) { bd = d; best = p; } }
    if (best) pts.push(best.map((v) => +v.toFixed(3)));
  }
  return pts;
}
/** cards unlocked right now. st: { milestone(sector, kind, n) -> bool, nights (valid nights done), veteran }. Pure; the page and pacing.mjs both call this. */
export const unlocked = (st) => CARDS.filter((c) => (c.unlock.kind === 'veteran' ? !!st.veteran : st.nights >= c.need && (c.unlock.kind === 'night' || st.milestone(c.sector, c.unlock.kind, c.unlock.n))));
/** the half-lit state: milestone met but the night count is not (shown as a dim card with "还差 N 个夜航") */
export const waiting = (st) => CARDS.filter((c) => c.unlock.kind !== 'veteran' && c.unlock.kind !== 'night' && st.nights < c.need && st.milestone(c.sector, c.unlock.kind, c.unlock.n));
export function validate() {
  const bad = [], ids = new Set();
  for (const c of CARDS) {
    if (ids.has(c.id)) bad.push(`duplicate ${c.id}`); ids.add(c.id);
    if (!ART_FNS.includes(c.art.fn)) bad.push(`${c.id}: art fn ${c.art.fn}`);
    if (c.art.fn === 'constellation' && !CONSTELLATIONS[c.art.id]) bad.push(`${c.id}: unknown constellation ${c.art.id}`);
    if (c.art.fn === 'constellation') { const a = lineArt(c.art.id); if (JSON.stringify(a).length > 1400) bad.push(`${c.id}: line art > 1.4 KB`); }
  }
  if (CARDS.length !== 29) bad.push(`${CARDS.length} cards, expected 28 + 元老`);
  if (CARDS.filter((c) => c.slot).length !== 24 || new Set(ORDER).size !== 24) bad.push('atlas order must cover exactly the 24 non-入门 cards');
  if (CARDS.filter((c) => c.unlock.kind === 'first').length !== 4) bad.push('4 入门 cards');
  const skill = CARDS.filter((c) => ['first', 'level', 'gate'].includes(c.unlock.kind)).length, night = CARDS.filter((c) => c.unlock.kind === 'night').length;
  if (skill !== 20 || night !== 8) bad.push(`expected 20 skill + 8 night cards, got ${skill} + ${night}`);
  const w = wallStars(); if (w.length !== 28) bad.push('wall stars');
  for (let i = 0; i < w.length; i += 1) for (let j = i + 1; j < w.length; j += 1) if (Math.hypot(w[i][0] - w[j][0], w[i][1] - w[j][1]) < 0.06) bad.push(`wall stars ${i},${j} too close`);
  return bad;
}
