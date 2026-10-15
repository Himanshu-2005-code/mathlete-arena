import { type Cell, gridConflicts, makeUnique, solveGrid } from "./gridsolver";
import type { GridCheck } from "./kenken";
import { createRng, shuffle } from "./rng";

/**
 * Futoshiki: fill the grid so every row and column has 1..n once, and every
 * < or > sign between two cells holds. Exactly one solution.
 */

export type FutoshikiDifficulty = "easy" | "hard";
export const FUTOSHIKI_SIZES: Record<FutoshikiDifficulty, number> = { easy: 5, hard: 6 };

export interface FutoshikiPuzzle {
  seed: number;
  difficulty: FutoshikiDifficulty;
  size: number;
  /** Each pair [a, b] means value(a) < value(b); a and b are neighbours. */
  lessThan: [Cell, Cell][];
  givens: (number | null)[][];
  solution: number[][];
}

export type PublicFutoshiki = Omit<FutoshikiPuzzle, "solution">;

export function generateFutoshiki(seed: number, difficulty: FutoshikiDifficulty): FutoshikiPuzzle {
  const rng = createRng(seed);
  const n = FUTOSHIKI_SIZES[difficulty];
  const empty = Array.from({ length: n }, () => Array<number | null>(n).fill(null));
  const solution = solveGrid({ size: n }, empty, 1, rng).solutions[0];

  // Signs on roughly 40% of neighbouring pairs, pointing the way the answer goes.
  const pairs: [Cell, Cell][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (c + 1 < n) pairs.push([[r, c], [r, c + 1]]);
      if (r + 1 < n) pairs.push([[r, c], [r + 1, c]]);
    }
  const chosen = shuffle(rng, pairs).slice(0, Math.round(pairs.length * (n >= 6 ? 0.5 : 0.4)));
  const lessThan = chosen.map(([a, b]): [Cell, Cell] =>
    solution[a[0]][a[1]] < solution[b[0]][b[1]] ? [a, b] : [b, a],
  );
  // A couple of starting numbers on the bigger grid keep generation quick.
  const seedGivens: [number, number][] =
    n >= 6 ? shuffle(rng, [...Array(n * n).keys()]).slice(0, 2).map((i) => [Math.floor(i / n), i % n]) : [];
  const givens = makeUnique({ size: n, lessThan }, solution, rng, seedGivens);
  return { seed, difficulty, size: n, lessThan, givens, solution };
}

export function futoshikiToPublic(p: FutoshikiPuzzle): PublicFutoshiki {
  const { solution: _, ...rest } = p;
  return rest;
}

export function checkFutoshiki(
  p: Pick<FutoshikiPuzzle, "size" | "lessThan" | "givens">,
  grid: (number | null)[][],
): GridCheck {
  const n = p.size;
  const merged = p.givens.map((row, r) => row.map((g, c) => g ?? grid[r]?.[c] ?? null));
  const conflicts = gridConflicts({ size: n, lessThan: p.lessThan }, merged);
  const keepsGivens = p.givens.every((row, r) => row.every((g, c) => g === null || grid[r]?.[c] == null || grid[r][c] === g));
  const complete = merged.every((row) => row.every((v) => v !== null));
  const inRange = merged.every((row) => row.every((v) => v === null || (v >= 1 && v <= n)));
  return { complete, solved: complete && keepsGivens && inRange && !conflicts.flat().some(Boolean), conflicts };
}
