// site/xiangqi/src/art/model.ts — 棋院墙上的"木牛流马 → 浑天仪"机关模型（6 个零件，赢一位机关人装一个）。参数化 SVG，无外部素材。
// 零件顺序 = 机关人顺序：1 滑轮 = 底座轮 · 2 木牛 = 箱身 · 3 流马 = 立柱 · 4 司南 = 磁勺 · 5 浑天 = 三环 · 6 璇玑 = 北斗星盘。
const BRONZE = '#c68b4a', HI = '#e6bd82', LO = '#8a5a2b', INK = '#0c1230', GOLD = '#fdd877', INDIGO = '#26346e';
const ghost = (inner: string): string => `<g class="mp-ghost" fill="none" stroke="rgba(231,201,138,.38)" stroke-width="1.6" stroke-dasharray="3 4">${inner}</g>`;
const PARTS: ((on: boolean) => string)[] = [
  // 1 底座 + 轮
  (on) => on ? `<g class="mp-part" data-part="1"><ellipse cx="100" cy="176" rx="60" ry="9" fill="${LO}"/><ellipse cx="100" cy="172" rx="60" ry="9" fill="${BRONZE}"/><ellipse cx="100" cy="169" rx="52" ry="6.5" fill="${HI}"/><g><circle cx="52" cy="176" r="12" fill="${INK}" stroke="${HI}" stroke-width="3"/><g stroke="${BRONZE}" stroke-width="2" stroke-linecap="round"><line x1="52" y1="166" x2="52" y2="186"/><line x1="43" y1="171" x2="61" y2="181"/><line x1="43" y1="181" x2="61" y2="171"/></g><circle cx="52" cy="176" r="2.4" fill="${GOLD}"/></g></g>` : ghost('<ellipse cx="100" cy="172" rx="60" ry="9"/><circle cx="52" cy="176" r="12"/>'),
  // 2 箱身（木牛）
  (on) => on ? `<g class="mp-part" data-part="2"><rect x="68" y="130" width="64" height="38" rx="7" fill="url(#mp-wood)" stroke="${LO}" stroke-width="2"/><g stroke="${LO}" stroke-width="1.3" opacity=".55"><line x1="68" y1="143" x2="132" y2="143"/><line x1="68" y1="155" x2="132" y2="155"/></g><rect x="78" y="136" width="44" height="14" rx="4" fill="${INK}" stroke="${HI}" stroke-width="1.4"/><g fill="#7bd8c6"><circle cx="90" cy="143" r="2"/><circle cx="96" cy="143" r="2"/><circle cx="104" cy="143" r="2"/><circle cx="110" cy="143" r="2"/></g></g>` : ghost('<rect x="68" y="130" width="64" height="38" rx="7"/>'),
  // 3 立柱（流马）
  (on) => on ? `<g class="mp-part" data-part="3"><rect x="94" y="78" width="12" height="54" rx="4" fill="url(#mp-wood)" stroke="${LO}" stroke-width="1.6"/><rect x="88" y="124" width="24" height="8" rx="3" fill="${BRONZE}" stroke="${LO}" stroke-width="1.2"/></g>` : ghost('<rect x="94" y="78" width="12" height="54" rx="4"/>'),
  // 4 磁勺（司南）
  (on) => on ? `<g class="mp-part" data-part="4"><ellipse cx="100" cy="82" rx="22" ry="6" fill="${INK}" stroke="${HI}" stroke-width="2"/><g class="mp-needle"><path d="M100 82 L100 66" stroke="${HI}" stroke-width="3" stroke-linecap="round"/><ellipse cx="100" cy="60" rx="6" ry="9" fill="url(#mp-wood)" stroke="${LO}" stroke-width="1.4"/></g><circle cx="100" cy="82" r="2.6" fill="${GOLD}"/></g>` : ghost('<ellipse cx="100" cy="82" rx="22" ry="6"/><ellipse cx="100" cy="60" rx="6" ry="9"/>'),
  // 5 三环（浑天）
  (on) => on ? `<g class="mp-part mp-rings" data-part="5" fill="none" stroke="${HI}" stroke-width="3.2"><ellipse class="mp-r1" cx="100" cy="76" rx="58" ry="19"/><g transform="rotate(60 100 76)"><ellipse class="mp-r2" cx="100" cy="76" rx="58" ry="19"/></g><g transform="rotate(120 100 76)"><ellipse class="mp-r3" cx="100" cy="76" rx="58" ry="19"/></g></g>` : ghost('<ellipse cx="100" cy="76" rx="58" ry="19"/><g transform="rotate(60 100 76)"><ellipse cx="100" cy="76" rx="58" ry="19"/></g>'),
  // 6 北斗星盘（璇玑，画在最后面）
  (on) => on ? `<g class="mp-part" data-part="6"><circle cx="100" cy="76" r="68" fill="url(#mp-plate)" stroke="${GOLD}" stroke-width="3"/><circle cx="100" cy="76" r="58" fill="none" stroke="${HI}" stroke-width="1" stroke-dasharray="2 5"/>${[[52, 52], [66, 42], [80, 38], [94, 44], [106, 56], [114, 72], [126, 86]].map(([x, y], i) => `<circle class="mp-star" style="animation-delay:${i * 0.25}s" cx="${x}" cy="${y}" r="3.6" fill="${GOLD}"/>`).join('')}</g>` : ghost('<circle cx="100" cy="76" r="68"/>'),
];
const ORDER = [6, 5, 3, 2, 1, 4];
export function modelSvg(won: readonly boolean[], o: { newPart?: number; cls?: string } = {}): string {
  const body = ORDER.map((p) => { const on = !!won[p - 1]; const g = PARTS[p - 1](on); return o.newPart === p && on ? g.replace('class="mp-part"', 'class="mp-part is-new"').replace('class="mp-part mp-rings"', 'class="mp-part mp-rings is-new"') : g; }).join('');
  return `<svg class="xq-model ${o.cls ?? ''} ${won.every(Boolean) ? 'is-whole' : ''}" viewBox="0 0 200 200" role="img" aria-label="棋院机关模型"><defs><linearGradient id="mp-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${HI}"/><stop offset="1" stop-color="${BRONZE}"/></linearGradient><linearGradient id="mp-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c4d9c"/><stop offset="1" stop-color="${INDIGO}"/></linearGradient></defs>${body}</svg>`;
}
