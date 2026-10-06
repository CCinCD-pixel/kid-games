/**
 * Board palette v1.1 (spec §6.2). UI chrome uses the 星港 tokens (`data-xg-game="porter"`); the board
 * draws with these constants. Gates (Machado 2009 + CIEDE2000, palette.test.ts = palette.py):
 * crate tops pairwise ≥ 12 (worst of 4 visions); crates vs floors ≥ 20 / CVD ≥ 12; robot body vs
 * crates ≥ 20 / ≥ 12 and vs floors ≥ 20; night-blue signals ≥ 20 against everything.
 * Signals never use a crate colour, and never red.
 */

export interface CrateColors {
  top: string;
  front: string;
  stroke: string;
  /** symbol shape shared by crate and pad: ★ ● ▲ ■ ◆ */
  symbol: 'star' | 'circle' | 'triangle' | 'square' | 'diamond';
}

/** colour index → crate look (0 = 星港补给 kraft ★; 1 fuel rose ●; 2 water blue ▲; 3 seed green ■; 4 parts purple ◆ reserved) */
export const CRATES: readonly CrateColors[] = [
  { top: '#A27038', front: '#74491E', stroke: '#4A2D12', symbol: 'star' },
  { top: '#E64F78', front: '#C11655', stroke: '#7E0E38', symbol: 'circle' },
  { top: '#3F7BE6', front: '#2C5FC4', stroke: '#1B3E86', symbol: 'triangle' },
  { top: '#1AA892', front: '#0F7466', stroke: '#0A4F45', symbol: 'square' },
  { top: '#8170DB', front: '#5744A5', stroke: '#3A2C75', symbol: 'diamond' },
];

export const TAPE = '#F9A726';
export const SYMBOL_INK = 'rgba(255, 250, 240, 0.9)';

export const ROBOT = {
  body: '#F9A726',
  hi: '#FFC86B',
  shade: '#C37900',
  visor: '#0C1230',
  led: '#8FF7EC',
  tread: '#352A40',
  roller: '#776A85',
  gold: '#F6B934',
  goldDeep: '#DF9A1C',
  outline: '#5A3200',
} as const;

export const WALL_FRONT_TOP = '#131B42';
export const WALL_FRONT_BOTTOM = '#0C1230';
export const PAPER_EDGE = 'rgba(255, 250, 240, 0.75)';
export const NIGHT = '#0C1230';
export const SHADOW = 'rgba(3, 5, 22, 0.45)';

/** all signals: night-blue + paper-white outline (shape tells the meaning) */
export const SIGNAL = '#0C1230';
export const SIGNAL_EDGE = '#FFFAF0';
export const DEAD_X = '#F0A53A';
export const LOCK_LED = '#8FF7EC';
export const GHOST = 'rgba(143, 247, 236, 0.5)';
