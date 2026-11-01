/* 国象原型规则（JS，仅测试夹具）。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const START_FEN: string;
export const fromFEN: (f: string) => any; export const toFEN: (s: any) => string;
export const legalMoves: (s: any) => any[]; export const applyMove: (s: any, m: any) => any;
export const uci: (m: any) => string; export const san: (s: any, m: any) => string; export const findUci: (s: any, t: string) => any;
export const PIECE: Record<string, any>;
