/**
 * The v1 finale certificate "一级调度员" (spec §2.1 S11, §6.4): a paper panel with a gold double
 * border, the title, the child's display name and the three route stamps (天宫 / 月宫 / 火星) with
 * the rockets each route received. DOM + inline SVG (crisp text, no canvas memory).
 */

export interface RouteCounts {
  tiangong: number;
  moon: number;
  mars: number;
}

const ROUTES: { id: keyof RouteCounts; name: string; color: string; deep: string; icon: string }[] = [
  {
    id: 'tiangong', name: '天宫', color: '#3F7BE6', deep: '#2C5FC4',
    icon: '<rect x="-26" y="-6" width="12" height="12" rx="2" fill="currentColor" opacity=".55"/><rect x="14" y="-6" width="12" height="12" rx="2" fill="currentColor" opacity=".55"/><rect x="-14" y="-8" width="28" height="16" rx="7" fill="currentColor"/><rect x="-3.5" y="-17" width="7" height="10" rx="3" fill="currentColor"/><circle r="3" fill="#F6B934"/>',
  },
  {
    id: 'moon', name: '月宫', color: '#8170DB', deep: '#5744A5',
    icon: '<circle r="15" fill="currentColor"/><circle cx="-5" cy="-4" r="3.6" fill="#FFF6E3" opacity=".45"/><circle cx="5" cy="5" r="4.6" fill="#FFF6E3" opacity=".45"/><path d="M-14 -6A9 7 0 0 1 2 -14Z" fill="#F6B934"/>',
  },
  {
    id: 'mars', name: '火星', color: '#EB6A3C', deep: '#C25A3A',
    icon: '<circle r="15" fill="currentColor"/><path d="M-14 -3Q-2 -8 14 -1V3Q0 -3 -14 3Z" fill="#FFF6E3" opacity=".4"/><path d="M-12 7Q0 4 12 9" stroke="#FFF6E3" stroke-width="2.4" opacity=".4" fill="none"/>',
  },
];

function stamp(r: (typeof ROUTES)[number], n: number, i: number): string {
  return `<div class="sok-stamp" style="--i:${i};--c:${r.color};--d:${r.deep}" data-route="${r.id}">
    <svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="44" fill="none" stroke="currentColor" stroke-width="5"/><circle r="37" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>
    <g transform="translate(0 -8)" style="color:${r.deep}">${r.icon}</g>
    <text y="27" text-anchor="middle" font-size="15" font-weight="800" fill="currentColor" font-family="XG WenKai, PingFang SC, sans-serif">${r.name}</text></svg>
    <b>${n}<small>枚</small></b></div>`;
}

/** Certificate markup; `name` is the parent page's display name (default 小步步). */
export function certificateHtml(name: string, counts: RouteCounts): string {
  return `<div class="sok-cert" role="img" aria-label="一级调度员证书，${name}">
    <div class="sok-cert__ribbon">星港调度证书</div>
    <div class="sok-cert__title">一级调度员</div>
    <div class="sok-cert__name"><span>${name}</span></div>
    <div class="sok-cert__line">三条航线，全都送到了</div>
    <div class="sok-cert__stamps">${ROUTES.map((r, i) => stamp(r, counts[r.id], i)).join('')}</div>
    <svg class="sok-cert__seal" viewBox="-30 -30 60 60" aria-hidden="true"><path d="M0 -26L6 -9L24 -9L10 2L15 20L0 9L-15 20L-10 2L-24 -9L-6 -9Z" fill="#F6B934" stroke="#B07A10" stroke-width="2.4" stroke-linejoin="round"/></svg>
  </div>`;
}
