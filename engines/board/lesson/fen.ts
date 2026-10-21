// lesson/fen.ts — FEN 小工具（象棋 / 国象通用：第一段是自上而下的横排，数字 = 连续空格；第二段是走子方 w / b）。
// 课里"只有红方动"的步型靠 withSide 把走子方拨回红方；摆子步靠 fenEdit 逐个落子。
export const withSide = (fen: string, side: 'w' | 'b'): string => { const p = fen.split(' '); if (p.length < 2) p.push(side); else p[1] = side; return p.join(' '); };
export interface GridShape { readonly rows: number; readonly cols: number }
/** 格名 'e4' → 列（0 = a）与横排号（1 起、自下而上） */
export const parseName = (name: string): { file: number; rank: number } => ({ file: name.charCodeAt(0) - 97, rank: Number.parseInt(name.slice(1), 10) });
export function parsePlacement(fen: string, shape: GridShape): string[][] {
  const grid: string[][] = []; for (const row of fen.split(' ')[0].split('/')) { const cells: string[] = []; for (const ch of row) { if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push(''); else cells.push(ch); } while (cells.length < shape.cols) cells.push(''); grid.push(cells); }
  while (grid.length < shape.rows) grid.push(new Array<string>(shape.cols).fill('')); return grid;
}
export function placementOf(grid: readonly (readonly string[])[]): string {
  return grid.map((row) => { let out = '', run = 0; for (const c of row) { if (c === '') run++; else { if (run) out += run; run = 0; out += c; } } return out + (run ? run : ''); }).join('/');
}
/** 在 FEN 的棋子段里逐格改字符（'' = 清空）；其余字段原样保留 */
export function fenEdit(fen: string, shape: GridShape, edits: readonly (readonly [string, string])[]): string {
  const grid = parsePlacement(fen, shape);
  for (const [name, ch] of edits) { const { file, rank } = parseName(name); const row = shape.rows - rank; if (row >= 0 && row < shape.rows && file >= 0 && file < shape.cols) grid[row][file] = ch; }
  const rest = fen.split(' ').slice(1).join(' '); return placementOf(grid) + (rest ? ' ' + rest : '');
}
/** FEN 里所有指定字符的格名（自下而上、从左到右） */
export function fenFind(fen: string, shape: GridShape, ch: string): string[] {
  const grid = parsePlacement(fen, shape); const out: string[] = [];
  for (let rank = 1; rank <= shape.rows; rank++) for (let f = 0; f < shape.cols; f++) if (grid[shape.rows - rank][f] === ch) out.push(String.fromCharCode(97 + f) + rank);
  return out;
}
export const fenAt = (fen: string, shape: GridShape, name: string): string => { const { file, rank } = parseName(name); return parsePlacement(fen, shape)[shape.rows - rank]?.[file] ?? ''; };
