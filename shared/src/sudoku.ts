import { type GridCheck, latinConflicts } from "./kenken";
import { type Rng, createRng, shuffle } from "./rng";

/**
 * Sudoku in two sizes: 6×6 (boxes of 2 rows × 3 columns) and the classic 9×9.
 * Every generated puzzle has exactly one solution.
 */

export type SudokuDifficulty = "easy" | "hard";

export const SUDOKU_SHAPES: Record<SudokuDifficulty, { size: number; box: { rows: number; cols: number }; clues: number }> =
  {
    easy: { size: 6, box: { rows: 2, cols: 3 }, clues: 14 },
    hard: { size: 9, box: { rows: 3, cols: 3 }, clues: 30 },
  };

export interface SudokuPuzzle {
  seed: number;
  difficulty: SudokuDifficulty;
  size: number;
  box: { rows: number; cols: number };
  /** Starting numbers; null where the player fills in. */
  givens: (number | null)[][];
  solution: number[][];
}

export type PublicSudoku = Omit<SudokuPuzzle, "solution">;

/**
 * Backtracking solver that always fills the most constrained cell first.
 * Stops after `limit` solutions; with `rng` it tries digits in random order.
 */
export function solveSudoku(
  size: number,
  box: { rows: number; cols: number },
  start: (number | null)[][],
  limit = 2,
  rng?: Rng,
): { count: number; first: number[][] | null } {
  const n = size;
  const grid = start.map((row) => row.map((v) => v ?? 0));
  const full = (1 << (n + 1)) - 2; // bits 1..n
  const rows = new Array(n).fill(0);
  const cols = new Array(n).fill(0);
  const boxes = new Array(n).fill(0);
  const boxOf = (r: number, c: number) => Math.floor(r / box.rows) * (n / box.cols) + Math.floor(c / box.cols);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const v = grid[r][c];
      if (!v) continue;
      const bit = 1 << v;
      if (rows[r] & bit || cols[c] & bit || boxes[boxOf(r, c)] & bit) return { count: 0, first: null };
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[boxOf(r, c)] |= bit;
    }

  let count = 0;
  let first: number[][] | null = null;

  const search = (): void => {
    if (count >= limit) return;
    let bestR = -1;
    let bestC = -1;
    let bestMask = 0;
    let bestCount = n + 1;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (grid[r][c]) continue;
        const mask = full & ~(rows[r] | cols[c] | boxes[boxOf(r, c)]);
        let k = 0;
        for (let m = mask; m; m &= m - 1) k++;
        if (k < bestCount) {
          bestR = r;
          bestC = c;
          bestMask = mask;
          bestCount = k;
          if (k === 0) return;
        }
      }
    if (bestR === -1) {
      count++;
      first ??= grid.map((row) => [...row]);
      return;
    }
    let digits: number[] = [];
    for (let v = 1; v <= n; v++) if (bestMask & (1 << v)) digits.push(v);
    if (rng) digits = shuffle(rng, digits);
    const b = boxOf(bestR, bestC);
    for (const v of digits) {
      const bit = 1 << v;
      grid[bestR][bestC] = v;
      rows[bestR] |= bit;
      cols[bestC] |= bit;
      boxes[b] |= bit;
      search();
      rows[bestR] &= ~bit;
      cols[bestC] &= ~bit;
      boxes[b] &= ~bit;
      grid[bestR][bestC] = 0;
      if (count >= limit) return;
    }
  };
  search();
  return { count, first };
}

export function generateSudoku(seed: number, difficulty: SudokuDifficulty): SudokuPuzzle {
  const rng = createRng(seed);
  const { size: n, box, clues } = SUDOKU_SHAPES[difficulty];
  const empty = Array.from({ length: n }, () => Array<number | null>(n).fill(null));
  const solution = solveSudoku(n, box, empty, 1, rng).first!;

  // Remove numbers one at a time, keeping only removals that leave a unique solution.
  const givens: (number | null)[][] = solution.map((row) => [...row]);
  let filled = n * n;
  for (const i of shuffle(rng, [...Array(n * n).keys()])) {
    if (filled <= clues) break;
    const r = Math.floor(i / n);
    const c = i % n;
    const keep = givens[r][c];
    givens[r][c] = null;
    if (solveSudoku(n, box, givens, 2).count !== 1) givens[r][c] = keep;
    else filled--;
  }
  return { seed, difficulty, size: n, box, givens, solution };
}

export function sudokuToPublic(p: SudokuPuzzle): PublicSudoku {
  const { solution: _, ...rest } = p;
  return rest;
}

/** Any grid that keeps the givens and breaks no rule counts as solved. */
export function checkSudoku(p: Pick<SudokuPuzzle, "size" | "box" | "givens">, grid: (number | null)[][]): GridCheck {
  const n = p.size;
  const merged = p.givens.map((row, r) => row.map((g, c) => g ?? grid[r]?.[c] ?? null));
  const conflicts = latinConflicts(n, merged, p.box);
  const keepsGivens = p.givens.every((row, r) => row.every((g, c) => g === null || grid[r]?.[c] == null || grid[r][c] === g));
  const complete = merged.every((row) => row.every((v) => v !== null));
  const inRange = merged.every((row) => row.every((v) => v === null || (v >= 1 && v <= n)));
  const solved = complete && keepsGivens && inRange && !conflicts.flat().some(Boolean);
  return { complete, solved, conflicts };
}
