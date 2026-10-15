import { type Cell, type GridRules, gridConflicts, makeUnique, solveGrid } from "./gridsolver";
import { type KenKenCheck } from "./kenken";
import { createRng, pick, shuffle } from "./rng";

/**
 * Killer Sudoku (6×6): Sudoku rules, plus dashed cages whose digits are all
 * different and add up to the cage's number. Cages stay inside a box. Starts
 * with few or no givens; exactly one solution.
 */

export interface KillerPuzzle {
  seed: number;
  difficulty: "easy";
  size: number;
  box: { rows: number; cols: number };
  cages: { cells: Cell[]; sum: number }[];
  givens: (number | null)[][];
  solution: number[][];
}

export type PublicKiller = Omit<KillerPuzzle, "solution">;

export function generateKiller(seed: number): KillerPuzzle {
  const rng = createRng(seed);
  const n = 6;
  const box = { rows: 2, cols: 3 };
  const empty = Array.from({ length: n }, () => Array<number | null>(n).fill(null));
  const solution = solveGrid({ size: n, box }, empty, 1, rng).solutions[0];

  // Grow cages of 2-4 cells inside one box, so the dashed outlines never cross
  // a bold box line. (Digits within a box are distinct already.)
  const boxOf = (r: number, c: number) => Math.floor(r / box.rows) * 2 + Math.floor(c / box.cols);
  const owner: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const cages: Cell[][] = [];
  for (const i of shuffle(rng, [...Array(n * n).keys()])) {
    const r0 = Math.floor(i / n);
    const c0 = i % n;
    if (owner[r0][c0] !== -1) continue;
    const want = pick(rng, [2, 2, 3, 3, 3, 4]);
    const cage: Cell[] = [[r0, c0]];
    owner[r0][c0] = cages.length;
    while (cage.length < want) {
      const used = new Set(cage.map(([r, c]) => solution[r][c]));
      const options: Cell[] = [];
      for (const [r, c] of cage)
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const rr = r + dr;
          const cc = c + dc;
          if (
            rr >= 0 &&
            cc >= 0 &&
            rr < n &&
            cc < n &&
            owner[rr][cc] === -1 &&
            !used.has(solution[rr][cc]) &&
            boxOf(rr, cc) === boxOf(r0, c0)
          )
            options.push([rr, cc]);
        }
      if (!options.length) break;
      const next = pick(rng, options);
      owner[next[0]][next[1]] = cages.length;
      cage.push(next);
    }
    cages.push(cage);
  }
  const sumCages = cages.map((cells) => ({ cells, sum: cells.reduce((s, [r, c]) => s + solution[r][c], 0) }));
  const givens = makeUnique({ size: n, box, sumCages }, solution, rng);
  return { seed, difficulty: "easy", size: n, box, cages: sumCages, givens, solution };
}

export function killerToPublic(p: KillerPuzzle): PublicKiller {
  const { solution: _, ...rest } = p;
  return rest;
}

export const killerRules = (p: Pick<KillerPuzzle, "size" | "box" | "cages">): GridRules => ({
  size: p.size,
  box: p.box,
  sumCages: p.cages,
});

export function checkKiller(p: Pick<KillerPuzzle, "size" | "box" | "cages" | "givens">, grid: (number | null)[][]): KenKenCheck {
  const n = p.size;
  const merged = p.givens.map((row, r) => row.map((g, c) => g ?? grid[r]?.[c] ?? null));
  const conflicts = gridConflicts(killerRules(p), merged);
  const cageOk = p.cages.map((cage) => {
    const vals = cage.cells.map(([r, c]) => merged[r][c]);
    return vals.some((v) => v === null) ? null : (vals as number[]).reduce((a, b) => a + b, 0) === cage.sum;
  });
  const keepsGivens = p.givens.every((row, r) => row.every((g, c) => g === null || grid[r]?.[c] == null || grid[r][c] === g));
  const complete = merged.every((row) => row.every((v) => v !== null));
  const inRange = merged.every((row) => row.every((v) => v === null || (v >= 1 && v <= n)));
  const solved =
    complete && keepsGivens && inRange && !conflicts.flat().some(Boolean) && cageOk.every((ok) => ok === true);
  return { complete, solved, conflicts, cageOk };
}
