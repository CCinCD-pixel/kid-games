import type { CardKey } from './model/sim';

/** The cards are pictures, not words: a 6-year-old reads arrows. Drawn in a 48×48 box. */
const ARROW = 'M24 8 L38 24 H29 V40 H19 V24 H10 Z';
const rot = (deg: number) => `<path d="${ARROW}" transform="rotate(${deg} 24 24)" fill="currentColor"/>`;
const BODY: Record<CardKey, string> = {
  N: rot(0), E: rot(90), S: rot(180), W: rot(270),
  F: '<path d="M24 5 L39 19 H30 V26 H18 V19 H9 Z M18 30 H30 V35 H18 Z M18 39 H30 V43 H18 Z" fill="currentColor"/>',
  L: '<path d="M38 40 V26 Q38 17 29 17 H20 V25 L7 14 L20 3 V11 H30 Q46 11 46 26 V40 Z" transform="translate(-3 3) scale(.92)" fill="currentColor"/>',
  R: '<path d="M10 40 V26 Q10 17 19 17 H28 V25 L41 14 L28 3 V11 H18 Q2 11 2 26 V40 Z" transform="translate(5 3) scale(.92)" fill="currentColor"/>',
  X: '<path d="M24 8 A16 16 0 0 1 39 19 L44 15 L42 29 L30 24 L35 21 A10 10 0 0 0 24 14 Z M24 40 A16 16 0 0 1 9 29 L4 33 L6 19 L18 24 L13 27 A10 10 0 0 0 24 34 Z" fill="currentColor"/>',
  C: '<path d="M24 4 L28.5 17 L42 17 L31 25.5 L35.5 39 L24 30.5 L12.5 39 L17 25.5 L6 17 L19.5 17 Z M38 34 L40 39 L45 41 L40 43 L38 48 L36 43 L31 41 L36 39 Z" fill="currentColor"/>',
  P: '<path d="M30 6 L35 11 L26 20 L21 15 Z M22 19 L29 26 Q31 33 27 37 L25 39 L12 26 L14 24 Q18 20 22 19 Z M11 38 H37 V42 H11 Z" fill="currentColor"/>',
};
export const cardSvg = (c: CardKey): string => `<svg viewBox="0 0 48 48" aria-hidden="true">${BODY[c]}</svg>`;
export const CARD_NAME: Record<CardKey, string> = {
  N: '向上开一米', E: '向右开一米', S: '向下开一米', W: '向左开一米', F: '向前开一米', L: '向左转', R: '向右转', P: '采样', X: '重复', C: '魔法卡',
};
