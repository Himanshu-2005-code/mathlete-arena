import { type Rng, createRng, pick, shuffle } from "./rng";

/**
 * KenKen: fill an n×n grid with 1..n so each row and column has every digit
 * once, and the digits in each cage combine (with the cage's operator) to the
 * cage's target. Generated puzzles always have exactly one solution.
 */

export type KenKenOp = "+" | "-" | "×" | "÷" | "";
export type KenKenDifficulty = "easy" | "hard";

export const KENKEN_SIZES: Record<KenKenDifficulty, number> = { easy: 5, hard: 6 };

export interface Cage {
  cells: [number, number][];
  op: KenKenOp;
  target: number;
}

export interface KenKenPuzzle {
  seed: number;
  difficulty: KenKenDifficulty;
  size: number;
  cages: Cage[];
  solution: number[][];
}

export type PublicKenKen = Omit<KenKenPuzzle, "solution">;

function latinSquare(rng: Rng, n: number): number[][] {
  const rows = shuffle(rng, [...Array(n).keys()]);
  const cols = shuffle(rng, [...Array(n).keys()]);
  const symbols = shuffle(rng, [...Array(n).keys()].map((i) => i + 1));
  return rows.map((r) => cols.map((c) => symbols[(r + c) % n]));
}

function makeCages(rng: Rng, n: number): [number, number][][] {
  const owner: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const cages: [number, number][][] = [];
  const order = shuffle(
    rng,
    [...Array(n * n).keys()].map((i) => [Math.floor(i / n), i % n] as [number, number]),
  );
  for (const [r0, c0] of order) {
    if (owner[r0][c0] !== -1) continue;
    const roll = rng();
    const want = roll < 0.1 ? 1 : roll < 0.55 ? 2 : roll < 0.9 ? 3 : 4;
    const cage: [number, number][] = [[r0, c0]];
    owner[r0][c0] = cages.length;
    while (cage.length < want) {
      const options: [number, number][] = [];
      for (const [r, c] of cage)
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < n && cc < n && owner[rr][cc] === -1) options.push([rr, cc]);
        }
      if (!options.length) break;
      const next = pick(rng, options);
      owner[next[0]][next[1]] = cages.length;
      cage.push(next);
    }
    cages.push(cage);
  }
  return cages;
}

function chooseOp(rng: Rng, values: number[]): { op: KenKenOp; target: number } {
  if (values.length === 1) return { op: "", target: values[0] };
  const sum = values.reduce((a, b) => a + b, 0);
  const product = values.reduce((a, b) => a * b, 1);
  if (values.length === 2) {
    const [hi, lo] = values[0] > values[1] ? values : [values[1], values[0]];
    const options: { op: KenKenOp; target: number }[] = [
      { op: "-", target: hi - lo },
      { op: "-", target: hi - lo },
      { op: "+", target: sum },
      { op: "×", target: product },
    ];
    if (hi % lo === 0) options.push({ op: "÷", target: hi / lo }, { op: "÷", target: hi / lo });
    return pick(rng, options);
  }
  return rng() < 0.5 || product > 999 ? { op: "+", target: sum } : { op: "×", target: product };
}

/** Does a fully filled cage meet its target? */
export function cageHolds(cage: Pick<Cage, "op" | "target">, values: number[]): boolean {
  switch (cage.op) {
    case "":
      return values[0] === cage.target;
    case "+":
      return values.reduce((a, b) => a + b, 0) === cage.target;
    case "×":
      return values.reduce((a, b) => a * b, 1) === cage.target;
    case "-":
      return Math.abs(values[0] - values[1]) === cage.target;
    case "÷": {
      const [hi, lo] = values[0] > values[1] ? values : [values[1], values[0]];
      return lo !== 0 && hi % lo === 0 && hi / lo === cage.target;
    }
  }
}

/** Could a partly filled cage still reach its target? Used to prune the solver. */
function cageCanHold(cage: Cage, values: number[], n: number): boolean {
  const remaining = cage.cells.length - values.length;
  if (remaining === 0) return cageHolds(cage, values);
  if (cage.op === "+") {
    const sum = values.reduce((a, b) => a + b, 0);
    return sum + remaining <= cage.target && sum + remaining * n >= cage.target;
  }
  if (cage.op === "×") {
    const product = values.reduce((a, b) => a * b, 1);
    return cage.target % product === 0;
  }
  return true;
}

/** Count solutions, stopping at `limit`. */
export function countKenKenSolutions(size: number, cages: Cage[], limit = 2): number {
  const n = size;
  const grid: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const cageOf: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  cages.forEach((cage, i) => cage.cells.forEach(([r, c]) => (cageOf[r][c] = i)));
  const rowUsed = Array.from({ length: n }, () => new Array(n + 1).fill(false));
  const colUsed = Array.from({ length: n }, () => new Array(n + 1).fill(false));
  let count = 0;

  const cageValues = (i: number) =>
    cages[i].cells.map(([r, c]) => grid[r][c]).filter((v) => v !== 0);

  const solve = (pos: number): void => {
    if (count >= limit) return;
    if (pos === n * n) {
      count++;
      return;
    }
    const r = Math.floor(pos / n);
    const c = pos % n;
    for (let v = 1; v <= n; v++) {
      if (rowUsed[r][v] || colUsed[c][v]) continue;
      grid[r][c] = v;
      if (cageCanHold(cages[cageOf[r][c]], cageValues(cageOf[r][c]), n)) {
        rowUsed[r][v] = colUsed[c][v] = true;
        solve(pos + 1);
        rowUsed[r][v] = colUsed[c][v] = false;
      }
      grid[r][c] = 0;
      if (count >= limit) return;
    }
  };
  solve(0);
  return count;
}

export function generateKenKen(seed: number, difficulty: KenKenDifficulty): KenKenPuzzle {
  const rng = createRng(seed);
  const n = KENKEN_SIZES[difficulty];
  for (let attempt = 0; attempt < 500; attempt++) {
    const solution = latinSquare(rng, n);
    const cages: Cage[] = makeCages(rng, n).map((cells) => ({
      cells,
      ...chooseOp(
        rng,
        cells.map(([r, c]) => solution[r][c]),
      ),
    }));
    if (countKenKenSolutions(n, cages) === 1) return { seed, difficulty, size: n, cages, solution };
  }
  throw new Error("Could not generate a KenKen with a unique solution");
}

export function kenkenToPublic(p: KenKenPuzzle): PublicKenKen {
  const { solution: _, ...rest } = p;
  return rest;
}

export interface GridCheck {
  complete: boolean;
  solved: boolean;
  /** Cells that clash with another cell in their row, column or box. */
  conflicts: boolean[][];
}

export interface KenKenCheck extends GridCheck {
  /** Per cage: true/false when filled, null while it has gaps. */
  cageOk: (boolean | null)[];
}

export function checkKenKen(p: Pick<KenKenPuzzle, "size" | "cages">, grid: (number | null)[][]): KenKenCheck {
  const n = p.size;
  const conflicts = latinConflicts(n, grid);
  const cageOk = p.cages.map((cage) => {
    const values = cage.cells.map(([r, c]) => grid[r]?.[c] ?? null);
    return values.some((v) => v === null) ? null : cageHolds(cage, values as number[]);
  });
  const complete = grid.length === n && grid.every((row) => row.length === n && row.every((v) => v !== null));
  const inRange = grid.every((row) => row.every((v) => v === null || (v >= 1 && v <= n)));
  const solved = complete && inRange && !conflicts.flat().some(Boolean) && cageOk.every((ok) => ok === true);
  return { complete, solved, conflicts, cageOk };
}

/** Mark cells whose value repeats in their row or column (and box, if boxes are given). */
export function latinConflicts(
  n: number,
  grid: (number | null)[][],
  box?: { rows: number; cols: number },
): boolean[][] {
  const out = Array.from({ length: n }, () => Array(n).fill(false));
  const groups: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    groups.push([...Array(n).keys()].map((j) => [i, j] as [number, number]));
    groups.push([...Array(n).keys()].map((j) => [j, i] as [number, number]));
  }
  if (box) {
    for (let br = 0; br < n; br += box.rows)
      for (let bc = 0; bc < n; bc += box.cols) {
        const g: [number, number][] = [];
        for (let r = br; r < br + box.rows; r++) for (let c = bc; c < bc + box.cols; c++) g.push([r, c]);
        groups.push(g);
      }
  }
  for (const g of groups) {
    const seen = new Map<number, [number, number][]>();
    for (const [r, c] of g) {
      const v = grid[r]?.[c];
      if (v == null) continue;
      seen.set(v, [...(seen.get(v) ?? []), [r, c]]);
    }
    for (const cells of seen.values()) if (cells.length > 1) for (const [r, c] of cells) out[r][c] = true;
  }
  return out;
}
