/**
 * 对质 + 演示为什么 player (spec §4.5): runs a DemoStep script (diag/bugs.ts `consequence`) on a paper card over the stage. The FIRST frame is
 * the child's own answer, the last frame stops BEFORE the final value (the script itself never lists the oracle answer). Stage-independent:
 * the pictures are the shared crystal / pods / array artwork. Taps skip; reduced motion halves the timing; automation runs it fast.
 */
import type { DemoStep } from '../app/types';
import { numberParts, partsScale, partsSvg, type Parts } from '../art/crystals';
import { arrayPicture } from './array';
import { podsPicture } from './pods';
import { el, isAutomated, reducedMotion, sleep } from './common';

export interface DemoHandle { done: Promise<void>; stop(): void }
export interface DemoOpts { order: string; /** the family params (pictures need them) */ p: any; say?(text: string): void }

const fmt = (r: unknown): string => {
  if (r === null || r === undefined) return '？';
  if (typeof r === 'number' || typeof r === 'string') return String(r);
  if (Array.isArray(r)) return r.join('，');
  if (typeof r === 'object') { const o = r as Record<string, unknown>; if ('sym' in o) return `${o.sym === '>' ? '＞' : o.sym === '<' ? '＜' : '＝'}`; if ('total' in o) return String(o.total); return Object.values(o).join(' '); }
  return String(r);
};
const CAPTION: Record<string, string> = {
  'tray.overflow': '满十了，放不下', 'tray.press': '压成一根棒', 'tray.take': '颗不够拿', 'tray.cutRod': '切开一根棒', 'place.glow': '这一位是空的', 'count.by': '一根棒数十颗',
  'compare.adjacent': '它们挨在一起', 'compare.sticks': '差了一根棒', 'array.cut': '切开看看', 'array.glowRow': '这一行也是', 'gap.show': '差了这么多', 'cmp.align': '数位对齐', 'order.flashOperator': '看看是加还是减',
  'nl.twoFlags': '你的和它的', 'balance.tilt': '往一边沉', 'lamp.off': '仓灯不是数位', 'ask': '想一想',
};

/** The order's own operands as tray pictures (≤ 2, < 1000): what a demo may show without revealing the answer. */
function operands(p: any): Parts[] {
  const ks = ['a', 'b', 'x', 'y', 'n'].filter((k) => typeof p?.[k] === 'number' && p[k] >= 0 && p[k] < 1000).slice(0, 2);
  if (!ks.length && typeof p?.t === 'number' && typeof p?.o === 'number') return [{ rods: p.t, crystals: p.o }];
  return ks.map((k) => numberParts(p[k]));
}

export function playDemo(host: HTMLElement, steps: DemoStep[], o: DemoOpts): DemoHandle {
  const card = el('div', 'dm'); card.setAttribute('role', 'status'); const top = el('div', 'dm-top'); const pic = el('div', 'dm-pic'); const cap = el('div', 'dm-cap'); card.append(top, pic, cap); host.append(card);
  let stopped = false; const w = Math.max(160, host.clientWidth - 40), h = Math.max(90, Math.round(host.clientHeight * 0.5));
  let parts: Parts = {}; const scale = isAutomated() ? 0.02 : reducedMotion() ? 0.5 : 1;
  const stop = () => { stopped = true; card.classList.add('is-out'); setTimeout(() => card.remove(), isAutomated() ? 0 : 260); };
  card.addEventListener('click', stop);
  const chip = (cls: string, label: string, value: string) => { const c = el('div', `dm-chip ${cls}`); c.innerHTML = `<i>${label}</i><b>${value}</b>`; top.append(c); };
  const show = (parts2: Parts, extra = '') => { pic.innerHTML = partsSvg(parts2, w, h) + extra; };
  const done = (async () => {
    for (const st of steps) {
      if (stopped) return;
      if ('say' in st) { o.say?.(st.say); continue; } if ('wait' in st) { await sleep(st.wait * scale); continue; }
      const a = (st.args ?? {}) as Record<string, any>; let hold = (st.ms ?? 700) * scale; cap.textContent = CAPTION[st.op] ?? '';
      switch (st.op) {
        case 'confront.his': chip('is-his', '你的', fmt(a.resp)); break;
        case 'confront.order': chip('is-order', '订单', o.order); break;
        case 'tray.show': parts = a.value !== undefined ? numberParts(a.value) : { boxes: a.boxes, rods: a.rods, crystals: a.crystals }; show(parts); break;
        case 'tray.pour': parts = { ...parts, crystals: (parts.crystals ?? 0) + (a.crystals ?? 0) }; show(parts); break;
        case 'tray.overflow': show(parts, `<div class="dm-ring" aria-hidden="true"></div>`); break;
        case 'tray.press': { const g = parts.crystals ?? 0; if (g >= 10) parts = { ...parts, rods: (parts.rods ?? 0) + 1, crystals: g - 10 }; show(parts, a.highlight ? '<div class="dm-ring"></div>' : ''); break; }
        case 'tray.take': show(parts, '<div class="dm-ring is-dash"></div>'); break;
        case 'tray.cutRod': parts = { ...parts, rods: Math.max(0, (parts.rods ?? 0) - 1), crystals: (parts.crystals ?? 0) + 10 }; show(parts); break;
        case 'pods.light': { const n = o.p.n ?? 2, k = o.p.k ?? 2; const lit = Math.max(1, a.upTo ?? 1); pic.innerHTML = podsPicture(n, k, w, h, { lit, labels: Array.from({ length: k }, (_, i) => (i < lit ? n * (i + 1) : '')) }); break; }
        case 'place.cards': { const cs: unknown[] = a.cards ?? []; pic.innerHTML = `<div class="dm-cards">${cs.map((x) => `<b class="${x === '_' ? 'is-gap' : ''}">${x === '_' ? '' : x}</b>`).join('')}</div>`; break; }
        case 'array.cut': pic.innerHTML = arrayPicture(o.p.n ?? o.p.rows ?? 4, o.p.m ?? o.p.cols ?? 4, w, h, { cut: a.after ?? 1 }); break;
        case 'array.glowRow': pic.innerHTML = arrayPicture(o.p.n ?? o.p.rows ?? 4, o.p.m ?? o.p.cols ?? 4, w, h, { cut: o.p.k, glowRow: (o.p.n ?? o.p.rows ?? 4) - 1 }); break;
        case 'compare.sticks': case 'compare.adjacent': case 'cmp.align': case 'cmp.glowDecisive': {   // the two numbers of the order side by side, as crystals (never the answer)
          const ps = operands(o.p); if (ps.length) { const pw = Math.floor(w / ps.length) - 12; const cap = Math.min(...ps.map((pt) => partsScale(pt, pw, h))); pic.innerHTML = `<div class="dm-two">${ps.map((pt) => `<div class="dm-half">${partsSvg(pt, pw, h, cap)}</div>`).join('')}</div>`; } break;
        }
        case 'place.swap': case 'counter.dial': case 'lamp.off': { const ps = operands(o.p); if (ps.length) show(ps[0], '<div class="dm-ring" aria-hidden="true"></div>'); break; }
        case 'order.flashOperator': { const sign = /[+＋]/.test(o.order) ? '＋' : /[−－-]/.test(o.order) ? '－' : ''; if (sign) pic.innerHTML = `<div class="dm-op" aria-hidden="true">${sign}</div>`; break; }
        case 'gap.show': break;
        case 'ask': if (steps[steps.length - 1] === st) hold = 0; break;
        default: hold = Math.min(hold, 300 * scale);
      }
      await sleep(hold);
    }
  })();
  return { done: done.then(() => { if (!stopped) return sleep(isAutomated() ? 0 : 900 * scale); return undefined; }).then(() => stop()), stop };
}
