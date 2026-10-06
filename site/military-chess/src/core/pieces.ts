/**
 * Piece types (spec §3.3, R2). Type ids: 0 军旗, 1 地雷, 2 炸弹, 3..11 = ranks 1..9 (工兵..司令).
 */

export type PType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export const FLAG = 0;
export const MINE = 1;
export const BOMB = 2;
export const ENG = 3;
export const MARSHAL = 11;

/** rank number printed on the tile (工兵 1 … 司令 9); 0 for flag / mine / bomb */
export const rankOf = (t: number): number => (t >= 3 ? t - 2 : 0);
/** code char per type id (layout strings, notation) */
export const TYPE_CODES = 'FMB123456789';
export const typeFromCode = (c: string): number => TYPE_CODES.indexOf(c);
export const NAMES = ['军旗', '地雷', '炸弹', '工兵', '排长', '连长', '营长', '团长', '旅长', '师长', '军长', '司令'] as const;
/** pieces per side by type; sums to 25 */
export const COUNTS: readonly number[] = [1, 3, 2, 3, 3, 3, 2, 2, 2, 2, 1, 1];
export const isMobileType = (t: number): boolean => t !== FLAG && t !== MINE;
/** 清点兵力 points (spec §3.7 R7.3): rank number; bomb 6; mine and flag 0 */
export const COUNT_POINTS: readonly number[] = [0, 0, 6, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** display order for intel boards / grids: 司令 … 工兵, 炸弹, 地雷, 军旗 */
export const DISPLAY_ORDER: readonly number[] = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
