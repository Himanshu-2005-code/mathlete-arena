import type { Op } from "./questions";
import { type Rng, createRng, pick, randInt, shuffle } from "./rng";

/**
 * Cross-math: a 3×3 grid of numbers. Each row and each column is an equation
 *   n1 op n2 op n3 = result
 * evaluated with normal precedence (× and ÷ before + and −).
 * Some cells are hidden; the player fills them from a bank of numbers.
 */

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: { id: Difficulty; label: string; hidden: number; maxN: number }[] = [
  { id: "easy", label: "Easy", hidden: 3, maxN: 9 },
  { id: "medium", label: "Medium", hidden: 5, maxN: 12 },
  { id: "hard", label: "Hard", hidden: 7, maxN: 20 },
];

export interface CrossMathPuzzle {
  seed: number;
  difficulty: Difficulty;
  /** Full solution grid, [row][col]. */
  solution: number[][];
  /** rowOps[r] = [op between c0,c1, op between c1,c2] */
  rowOps: Op[][];
  /** colOps[c] = [op between r0,r1, op between r1,r2] */
  colOps: Op[][];
  rowResults: number[];
  colResults: number[];
  /** hidden[r][c] is true when the player must fill the cell. */
  hidden: boolean[][];
  /** The numbers available to place, shuffled. */
  bank: number[];
}

/** The puzzle as sent to a player: no solution values for hidden cells. */
export type PublicPuzzle = Omit<CrossMathPuzzle, "solution"> & { given: (number | null)[][] };

function apply(x: number, op: Op, y: number): number | null {
  switch (op) {
    case "+":
      return x + y;
    case "-":
      return x - y;
    case "×":
      return x * y;
    case "÷":
      return y !== 0 && x % y === 0 ? x / y : null;
  }
}

const isHigh = (op: Op) => op === "×" || op === "÷";

/** Evaluate a op1 b op2 c with precedence; null if a division is not exact. */
export function evaluate(a: number, op1: Op, b: number, op2: Op, c: number): number | null {
  if (!isHigh(op1) && isHigh(op2)) {
    const right = apply(b, op2, c);
    return right === null ? null : apply(a, op1, right);
  }
  const left = apply(a, op1, b);
  return left === null ? null : apply(left, op2, c);
}

const OPS: Op[] = ["+", "+", "-", "-", "×", "×", "÷"];

function difficultyConfig(d: Difficulty) {
  return DIFFICULTIES.find((x) => x.id === d) ?? DIFFICULTIES[0];
}

export function generateCrossMath(seed: number, difficulty: Difficulty): CrossMathPuzzle {
  const rng: Rng = createRng(seed);
  const cfg = difficultyConfig(difficulty);

  for (let attempt = 0; attempt < 5000; attempt++) {
    const solution = [0, 1, 2].map(() => [0, 1, 2].map(() => randInt(rng, 1, cfg.maxN)));
    const rowOps = [0, 1, 2].map(() => [pick(rng, OPS), pick(rng, OPS)]);
    const colOps = [0, 1, 2].map(() => [pick(rng, OPS), pick(rng, OPS)]);

    const rowResults = solution.map((row, r) => evaluate(row[0], rowOps[r][0], row[1], rowOps[r][1], row[2]));
    const colResults = [0, 1, 2].map((c) =>
      evaluate(solution[0][c], colOps[c][0], solution[1][c], colOps[c][1], solution[2][c]),
    );
    const all = [...rowResults, ...colResults];
    if (all.some((v) => v === null || v < 0 || v > 999)) continue;

    const cells = shuffle(
      rng,
      [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [r, c] as const)),
    );
    const hidden = [0, 1, 2].map(() => [false, false, false]);
    for (const [r, c] of cells.slice(0, cfg.hidden)) hidden[r][c] = true;
    const bank = shuffle(
      rng,
      cells.slice(0, cfg.hidden).map(([r, c]) => solution[r][c]),
    );

    return {
      seed,
      difficulty,
      solution,
      rowOps,
      colOps,
      rowResults: rowResults as number[],
      colResults: colResults as number[],
      hidden,
      bank,
    };
  }
  throw new Error("Could not generate a cross-math puzzle");
}

export function toPublic(p: CrossMathPuzzle): PublicPuzzle {
  const { solution, ...rest } = p;
  return {
    ...rest,
    given: solution.map((row, r) => row.map((v, c) => (p.hidden[r][c] ? null : v))),
  };
}

export interface CheckResult {
  complete: boolean;
  solved: boolean;
  rowOk: (boolean | null)[];
  colOk: (boolean | null)[];
}

/**
 * Check a player's grid. Any placement that satisfies every equation and
 * uses exactly the bank's numbers counts as solved, even if it differs from
 * the generated solution. A row/column is null while it has empty cells.
 */
export function checkCrossMath(
  p: Pick<CrossMathPuzzle, "rowOps" | "colOps" | "rowResults" | "colResults" | "hidden" | "bank"> & {
    given: (number | null)[][];
  },
  grid: (number | null)[][],
): CheckResult {
  const cell = (r: number, c: number) => (p.hidden[r][c] ? grid[r]?.[c] ?? null : p.given[r][c]);

  const line = (vals: (number | null)[], ops: Op[], target: number): boolean | null => {
    if (vals.some((v) => v === null)) return null;
    const [a, b, c] = vals as number[];
    return evaluate(a, ops[0], b, ops[1], c) === target;
  };

  const rowOk = [0, 1, 2].map((r) => line([cell(r, 0), cell(r, 1), cell(r, 2)], p.rowOps[r], p.rowResults[r]));
  const colOk = [0, 1, 2].map((c) => line([cell(0, c), cell(1, c), cell(2, c)], p.colOps[c], p.colResults[c]));

  const placed: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) if (p.hidden[r][c] && grid[r]?.[c] != null) placed.push(grid[r][c] as number);

  const hiddenCount = p.hidden.flat().filter(Boolean).length;
  const complete = placed.length === hiddenCount;
  const sameNumbers =
    complete && [...placed].sort((x, y) => x - y).join(",") === [...p.bank].sort((x, y) => x - y).join(",");

  const solved = complete && sameNumbers && [...rowOk, ...colOk].every((v) => v === true);
  return { complete, solved, rowOk, colOk };
}
