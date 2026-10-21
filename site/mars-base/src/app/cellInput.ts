/**
 * Multi-cell keypad answers (竖式 个位 / 十位, mul.write 每舱 / 总数, mul.split 上面 / 下面 / 一共, mul.compareArr 大的有几块):
 * a small PURE state machine, so that "one wrong answer = dead end" (QA fix-mars-r2 blocker 1) cannot come back.
 *
 * The child types one number per cell and presses ✓; the LAST ✓ hands the whole list to the judge. Whatever the verdict is, the NEXT attempt starts
 * on the first cell again: `enterCell` returns the state already rewound when it hands the list over, so there is no code path in which a
 * stale value survives a submission. The runner (screens/mission.ts) only has to repaint the keypad from `cellView`.
 *
 *   enterCell   ✓ with a typed value       → next cell | the finished list (state rewound to cell 0)
 *   backCell    ⌫ on an EMPTY display     → the previous cell, its value back on the display (never past cell 0)
 *   rewindCells wrong verdict / retry / hint changed / twin / new item → cell 0, nothing typed
 *   assistedFill (H3) the value the answer shows for the cell now being filled, so that ✓ ✓ ✓ finishes the item
 */
export interface CellsState { readonly n: number; readonly idx: number; readonly vals: readonly number[] }
export interface CellsStep { state: CellsState; /** the finished list (one value per cell, in cell order) when the last cell was entered; otherwise null */ submit: number[] | null; /** the typed value was not a number: nothing changed */ empty: boolean }

/** The cell labels of every multi-cell keypad stage (stages/index.ts keypadStage + stages/array.ts compare): the ONE table, so that the unit tests and the runner agree. */
export const KEYPAD_CELLS: Readonly<Record<string, readonly string[]>> = {
  'col.add': ['个位', '十位'], 'col.sub': ['个位', '十位'], 'mul.write': ['每舱', '总数'], 'mul.split': ['上面', '下面', '一共'], 'mul.compareArr': ['大的有几块'],
};
export const newCells = (n: number): CellsState => ({ n: Math.max(0, n), idx: 0, vals: [] });
export const rewindCells = (s: CellsState): CellsState => newCells(s.n);
export const cellsDone = (s: CellsState): boolean => s.n > 0 && s.idx >= s.n;

/** ✓ on the keypad with the typed number `v` (null / NaN = nothing typed). */
export function enterCell(s: CellsState, v: number | null): CellsStep {
  if (s.n <= 0) return { state: s, submit: null, empty: true };
  if (v === null || !Number.isFinite(v)) return { state: s, submit: null, empty: true };
  const vals = [...s.vals.slice(0, s.n), v];
  if (vals.length < s.n) return { state: { n: s.n, idx: vals.length, vals }, submit: null, empty: false };
  return { state: rewindCells(s), submit: vals.slice(0, s.n), empty: false };   // handed over: the next attempt (if there is one) starts clean
}

/** ⌫ pressed while the display is already empty: step back to the previous cell and give its number back (the child can fix it). */
export function backCell(s: CellsState): { state: CellsState; display: string } | null {
  if (s.idx <= 0 || s.vals.length === 0) return null;
  const vals = s.vals.slice(0, -1); const prev = s.vals[s.vals.length - 1];
  return { state: { n: s.n, idx: vals.length, vals }, display: String(prev) };
}

/** Which cell label to show, and what the display should hold right now (H3 shows the answer cell by cell). */
export function cellView(s: CellsState, labels: readonly string[], assisted?: readonly number[] | null): { label: string; display: string } {
  const i = Math.min(s.idx, Math.max(0, labels.length - 1));
  const a = assisted && assisted.length === s.n ? assisted[Math.min(s.idx, s.n - 1)] : undefined;
  return { label: labels[i] ?? '', display: a === undefined ? '' : String(a) };
}

/** The typed part of an answer: `correct` may start with stage-side values (mul.compareArr: [which board, how many]); the cells are the LAST n numbers. */
export const cellAnswers = (correct: unknown, n: number): number[] | null => (Array.isArray(correct) && n > 0 && correct.length >= n && correct.slice(-n).every((x) => Number.isInteger(x)) ? (correct.slice(-n) as number[]) : null);
