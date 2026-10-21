// Layout forecast (spec §2.2): cell / hit sizes per viewport x sector from the region formulas, asserted against the tap floors AND against the
// kit's 🏠 (56x56, top-left) and the landscape safe-area insets (iPhone notch ~47 px each side, home indicator ~21 px at the bottom).
// Regions are CSS px. top = safe-top + top bar (portrait); phones in landscape have NO top bar: a 64 px left rail carries the 🏠 instead.
const VP = {
  'iPad 810x1080 portrait': { w: 810, h: 1080, top: 24 + 64, strip: 120, act: 88, gutter: 24, gap: 8, land: false, min: 56, colW: 0, safe: { l: 0, r: 0, b: 0 }, rail: 0, pad: 8, mirror: 12 },
  'iPad 1080x810 landscape': { w: 1080, h: 810, top: 24 + 64, strip: 0, act: 24, gutter: 24, gap: 8, land: true, min: 56, colW: 300, safe: { l: 0, r: 0, b: 0 }, rail: 0, pad: 8, mirror: 12 },
  'iPhone 390x664 portrait': { w: 390, h: 664, top: 60, strip: 56, act: 64, gutter: 12, gap: 4, land: false, min: 44, colW: 0, safe: { l: 0, r: 0, b: 0 }, rail: 0, pad: 8, mirror: 8 },
  'iPhone SE 320x568 portrait': { w: 320, h: 568, top: 60, strip: 48, act: 56, gutter: 12, gap: 4, land: false, min: 44, colW: 0, safe: { l: 0, r: 0, b: 0 }, rail: 0, pad: 8, mirror: 8 },
  'iPhone 844x390 landscape': { w: 844, h: 390, top: 0, strip: 0, act: 0, gutter: 8, gap: 4, land: true, min: 44, colW: 200, safe: { l: 47, r: 47, b: 21 }, rail: 64, pad: 16, mirror: 8 },
};
const CAP = 640;                                                  // a board never grows past 640 px (calm, premium; also saves fill rate)
const HOME = 56;                                                  // kit back button size (>= 56 everywhere, platform smoke test)
const cellOf = (side, g, gap, extra = 0) => Math.floor((side - (g - 1) * gap - extra) / g);
export function regions(v) {
  const availW = v.w - v.safe.l - v.safe.r - v.rail - 2 * v.gutter - v.colW - (v.land ? v.gutter : 0), availH = v.h - v.top - v.strip - v.act - v.safe.b - v.pad;
  return { availW, availH };
}
export function forecast() {
  const rows = []; let bad = 0;
  for (const [name, v] of Object.entries(VP)) {
    const { availW, availH } = regions(v), S = Math.min(CAP, availW, availH);
    const out = { name, board: S, availH, boardX: v.safe.l + v.rail + v.gutter };
    out.s1 = cellOf(S, 6, v.gap);                                                           // 6x6 is the largest s1 board
    out.s2 = Math.floor(Math.min(64, 0.2 * S - 8));                                         // s2: closest two stars 0.2*S apart; hit area = min(64, 0.2*S - 8)
    // s3: houses area = S wide x 0.62*availH, 4x3 largest; tray holds up to 8 tiles (n + visitors; one row if they fit at >= min, else two rows of 4)
    const hH = Math.floor(0.62 * availH), houseCell = Math.min(cellOf(S, 4, v.gap), Math.floor((hH - 2 * v.gap) / 3));
    const trayItems = 8, one = Math.floor((S - (trayItems - 1) * v.gap) / trayItems), twoRow = Math.floor((S - (4 - 1) * v.gap) / 4);
    out.s3house = houseCell; out.s3tray = one >= v.min ? one : Math.min(64, twoRow, Math.floor((availH - hH - v.gap) / 2));
    // s4 (mirror): ONE board, the mirror strip (v.mirror px) runs through the middle: same board size as s1, 6x6 is the largest
    out.s4 = cellOf(S, 6, v.gap, v.mirror);
    out.min = v.min;
    const need = [['s1 6x6 cell', out.s1], ['s2 star hit', out.s2], ['s3 house', out.s3house], ['s3 tray tile', out.s3tray], ['s4 6x6 cell', out.s4]];
    out.fail = need.filter(([, x]) => x < v.min).map(([k, x]) => `${k}=${x}<${v.min}`);
    if (availH < S) out.fail.push(`availH ${availH} < board ${S}`);
    // the 🏠 must not touch the board: portrait = bar height >= 🏠 + 4; landscape phone = left rail 64 + safe inset; iPad landscape = bar 88
    if (!v.land || v.rail === 0) { if (v.top < HOME + 4) out.fail.push(`top bar ${v.top} < 🏠 ${HOME} + 4`); } else if (v.rail < HOME + 8) out.fail.push(`left rail ${v.rail} < 🏠 ${HOME} + 8`);
    bad += out.fail.length; rows.push(out);
  }
  return { rows, bad };
}
if (process.argv[1].endsWith('layout.mjs')) {
  const { rows, bad } = forecast();
  console.log('viewport | board | board x | s1 6x6 | s2 hit | s3 house | s3 tray | s4 6x6 | floor | verdict');
  rows.forEach((r) => console.log(`${r.name} | ${r.board} | ${r.boardX} | ${r.s1} | ${r.s2} | ${r.s3house} | ${r.s3tray} | ${r.s4} | ${r.min} | ${r.fail.length ? 'FAIL ' + r.fail.join(', ') : 'ok'}`));
  console.log(`layout checks failed: ${bad}`); process.exit(bad ? 1 : 0);
}
