import { type Rng, shuffle } from "./rng";

/**
 * A small constraint solver for number-grid puzzles: every row and column
 * holds 1..n once, optionally boxes too, plus sum cages with distinct digits
 * (Killer Sudoku) and "less than" links between cells (Futoshiki).
 */

export type Cell = [number, number];

export interface GridRules {
  size: number;
  box?: { rows: number; cols: number };
  /** Cells must add up to `sum` and hold different digits. */
  sumCages?: { cells: Cell[]; sum: number }[];
  /** value(a) < value(b) */
  lessThan?: [Cell, Cell][];
}

export function solveGrid(
  rules: GridRules,
  givens: (number | null)[][],
  limit = 2,
  rng?: Rng,
): { count: number; solutions: number[][][] } {
  const n = rules.size;
  const grid = givens.map((row) => row.map((v) => v ?? 0));
  const full = (1 << (n + 1)) - 2;
  const rows = new Array(n).fill(0);
  const cols = new Array(n).fill(0);
  const boxes = new Array(n).fill(0);
  const box = rules.box;
  const boxOf = (r: number, c: number) =>
    box ? Math.floor(r / box.rows) * (n / box.cols) + Math.floor(c / box.cols) : 0;

  const cageOf: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  rules.sumCages?.forEach((cage, i) => cage.cells.forEach(([r, c]) => (cageOf[r][c] = i)));
  const below: Cell[][][] = Array.from({ length: n }, () => Array.from({ length: n }, () => []));
  const above: Cell[][][] = Array.from({ length: n }, () => Array.from({ length: n }, () => []));
  for (const [a, b] of rules.lessThan ?? []) {
    above[a[0]][a[1]].push(b); // a must be below b
    below[b[0]][b[1]].push(a);
  }

  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const v = grid[r][c];
      if (!v) continue;
      const bit = 1 << v;
      if (rows[r] & bit || cols[c] & bit || (box && boxes[boxOf(r, c)] & bit)) return { count: 0, solutions: [] };
      rows[r] |= bit;
      cols[c] |= bit;
      if (box) boxes[boxOf(r, c)] |= bit;
    }

  // Can this cage still reach its sum with distinct digits in its empty cells?
  const cageOk = (i: number): boolean => {
    const cage = rules.sumCages![i];
    let sum = 0;
    let empty = 0;
    let used = 0;
    for (const [r, c] of cage.cells) {
      const v = grid[r][c];
      if (v) {
        if (used & (1 << v)) return false;
        used |= 1 << v;
        sum += v;
      } else empty++;
    }
    const left = cage.sum - sum;
    if (empty === 0) return left === 0;
    // Smallest and largest totals of `empty` unused digits.
    let lo = 0;
    let hi = 0;
    for (let v = 1, k = 0; v <= n && k < empty; v++) if (!(used & (1 << v))) (lo += v), k++;
    for (let v = n, k = 0; v >= 1 && k < empty; v--) if (!(used & (1 << v))) (hi += v), k++;
    return left >= lo && left <= hi;
  };

  const ordered = (r: number, c: number, v: number): boolean => {
    for (const [br, bc] of above[r][c]) if (grid[br][bc] && grid[br][bc] <= v) return false;
    for (const [ar, ac] of below[r][c]) if (grid[ar][ac] && grid[ar][ac] >= v) return false;
    return true;
  };

  let count = 0;
  const solutions: number[][][] = [];

  const search = (): void => {
    if (count >= limit) return;
    let bestR = -1;
    let bestC = -1;
    let bestMask = 0;
    let bestCount = n + 1;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (grid[r][c]) continue;
        const mask = full & ~(rows[r] | cols[c] | (box ? boxes[boxOf(r, c)] : 0));
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
      solutions.push(grid.map((row) => [...row]));
      return;
    }
    let digits: number[] = [];
    for (let v = 1; v <= n; v++) if (bestMask & (1 << v)) digits.push(v);
    if (rng) digits = shuffle(rng, digits);
    const b = boxOf(bestR, bestC);
    const cage = cageOf[bestR][bestC];
    for (const v of digits) {
      if (!ordered(bestR, bestC, v)) continue;
      const bit = 1 << v;
      grid[bestR][bestC] = v;
      if (cage === -1 || cageOk(cage)) {
        rows[bestR] |= bit;
        cols[bestC] |= bit;
        if (box) boxes[b] |= bit;
        search();
        rows[bestR] &= ~bit;
        cols[bestC] &= ~bit;
        if (box) boxes[b] &= ~bit;
      }
      grid[bestR][bestC] = 0;
      if (count >= limit) return;
    }
  };
  search();
  return { count, solutions };
}

/**
 * Add givens from `solution` until the puzzle has exactly one answer. Each new
 * given is a cell where two competing answers disagree, so it removes one.
 */
export function makeUnique(
  rules: GridRules,
  solution: number[][],
  rng: Rng,
  start: Cell[] = [],
): (number | null)[][] {
  const n = rules.size;
  const givens: (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));
  for (const [r, c] of start) givens[r][c] = solution[r][c];
  for (let guard = 0; guard < n * n; guard++) {
    const { count, solutions } = solveGrid(rules, givens, 2);
    if (count === 1) return givens;
    const [a, b] = solutions;
    const diffs: Cell[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (a[r][c] !== b[r][c]) diffs.push([r, c]);
    const [r, c] = diffs[Math.floor(rng() * diffs.length)];
    givens[r][c] = solution[r][c];
  }
  return solution.map((row) => [...row]);
}

/** Cells that break a row, column, box, cage-distinct or less-than rule. */
export function gridConflicts(rules: GridRules, grid: (number | null)[][]): boolean[][] {
  const n = rules.size;
  const out = Array.from({ length: n }, () => Array(n).fill(false));
  const groups: Cell[][] = [];
  for (let i = 0; i < n; i++) {
    groups.push([...Array(n).keys()].map((j) => [i, j] as Cell));
    groups.push([...Array(n).keys()].map((j) => [j, i] as Cell));
  }
  if (rules.box)
    for (let br = 0; br < n; br += rules.box.rows)
      for (let bc = 0; bc < n; bc += rules.box.cols) {
        const g: Cell[] = [];
        for (let r = br; r < br + rules.box.rows; r++) for (let c = bc; c < bc + rules.box.cols; c++) g.push([r, c]);
        groups.push(g);
      }
  for (const cage of rules.sumCages ?? []) groups.push(cage.cells);
  for (const g of groups) {
    const seen = new Map<number, Cell[]>();
    for (const [r, c] of g) {
      const v = grid[r]?.[c];
      if (v == null) continue;
      seen.set(v, [...(seen.get(v) ?? []), [r, c]]);
    }
    for (const cells of seen.values()) if (cells.length > 1) for (const [r, c] of cells) out[r][c] = true;
  }
  for (const [[ar, ac], [br, bc]] of rules.lessThan ?? []) {
    const a = grid[ar]?.[ac];
    const b = grid[br]?.[bc];
    if (a != null && b != null && a >= b) out[ar][ac] = out[br][bc] = true;
  }
  return out;
}
