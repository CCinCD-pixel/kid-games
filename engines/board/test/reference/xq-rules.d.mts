/* 象棋原型规则（JS，仅测试夹具）。只声明测试里用到的部分，其余 any。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const START_FEN: string;
export const RED: number; export const BLACK: number;
export const K: number; export const A: number; export const B: number; export const N: number; export const R: number; export const C: number; export const P: number;
export class Position { static fromFen(fen: string): any; [k: string]: any }
export const fenOf: (map: Record<string, string>, side?: string) => string;
export const handicapFen: (kind: string, giver: number) => string;
export const parseMove: (s: string) => number;
export const moveStr: (m: number) => string;
export const parseSq: (s: string) => number;
export const sqName: (s: number) => string;
export const rowOf: (s: number) => number; export const colOf: (s: number) => number; export const SQ: (r: number, c: number) => number;
export const perft: (pos: any, depth: number) => number;
