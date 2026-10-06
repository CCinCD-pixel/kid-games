/**
 * 参谋笔记 badges and 侦察便签 tags on enemy pieces in 暗棋 (spec §3.11, §6.4). Badges come from the
 * child's public knowledge (core/belief badgeOf); tags are the child's own guesses (long-press menu).
 * Neither is ever derived from a hidden identity.
 */
import type { Badge } from '../core/belief';
import { mcIcon } from './icons';

export function badgeHtml(b: Badge): string {
  const ico = b.icon === 'foot' ? mcIcon('feet') : b.icon ? mcIcon(b.icon) : '';
  return `${b.text ? `<b>${b.text}</b>` : ''}${ico}`;
}

export type TagKind = 'big' | 'small' | 'bomb' | 'mine' | 'flag';
export const TAGS: Array<{ id: TagKind; label: string; colour: string; shape: string }> = [
  { id: 'big', label: '大官', colour: '#e8b93c', shape: 'M3 2h14l-4 5 4 5H3z' },
  { id: 'small', label: '小兵', colour: '#5fb7a6', shape: 'M3 2h12a3 3 0 0 1 0 6 3 3 0 0 1 0 6H3z' },
  { id: 'bomb', label: '炸弹', colour: '#e4513d', shape: 'M3 2h14v10H3z' },
  { id: 'mine', label: '地雷', colour: '#6c6f7d', shape: 'M3 2l14 5-14 5z' },
  { id: 'flag', label: '军旗', colour: '#8a73ee', shape: 'M3 2h14l-3 5 3 5H3z' },
];

/** the little coloured flag shown on a tagged piece (5 colours × 5 shapes) */
export function tagHtml(kind: TagKind): string {
  const t = TAGS.find((x) => x.id === kind)!;
  return `<svg viewBox="0 0 20 22" width="20" height="22" aria-hidden="true"><path d="M3 1v20" stroke="#2a241d" stroke-width="2" stroke-linecap="round"/><path d="${t.shape}" fill="${t.colour}" stroke="#2a241d" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
}

/** does a tag match the true identity (post-game reveal)? */
export function tagCorrect(kind: TagKind, type: number): boolean {
  switch (kind) {
    case 'big':
      return type >= 9;
    case 'small':
      return type >= 3 && type <= 5;
    case 'bomb':
      return type === 2;
    case 'mine':
      return type === 1;
    case 'flag':
      return type === 0;
  }
}
