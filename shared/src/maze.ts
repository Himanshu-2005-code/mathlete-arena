import type { Op } from "./questions";
import { type Rng, createRng, pick, randInt, shuffle } from "./rng";

/**
 * Math Maze: a grid where digits and operators alternate like a checkerboard.
 * Walk from the top-left digit to the bottom-right digit, one step up, down,
 * left or right at a time, never reusing a cell. Read the path as a sum from
 * left to right (no precedence: 3 + 4 × 2 is 14) and hit the target.
 */

export type MazeDifficulty = "easy" | "hard";

export const MAZE_SHAPES: Record<MazeDifficulty, { size: number; minCells: number; maxCells: number }> = {
  easy: { size: 5, minCells: 9, maxCells: 13 },
  hard: { size: 7, minCells: 13, maxCells: 21 },
};

export type MazeCell = { kind: "digit"; value: number } | { kind: "op"; op: Op };

export interface MazePuzzle {
  seed: number;
  difficulty: MazeDifficulty;
  size: number;
  cells: MazeCell[][];
  target: number;
  /** One path that reaches the target. */
  solution: [number, number][];
}

export type PublicMaze = Omit<MazePuzzle, "solution">;

const OPS: Op[] = ["+", "+", "+", "-", "-", "×", "×", "÷"];

/** Sequential value of a path, or null if a division isn't exact or a cell is out of place. */
export function evaluateMazePath(cells: MazeCell[][], path: [number, number][]): number | null {
  let value: number | null = null;
  let op: Op | null = null;
  for (const [i, [r, c]] of path.entries()) {
    const cell = cells[r]?.[c];
    if (!cell) return null;
    if (i % 2 === 0) {
      if (cell.kind !== "digit") return null;
      if (value === null) value = cell.value;
      else {
        switch (op) {
          case "+":
            value += cell.value;
            break;
          case "-":
            value -= cell.value;
            break;
          case "×":
            value *= cell.value;
            break;
          case "÷":
            if (cell.value === 0 || value % cell.value !== 0) return null;
            value /= cell.value;
            break;
        }
      }
    } else {
      if (cell.kind !== "op") return null;
      op = cell.op;
    }
  }
  return value;
}

/** Is this a legal walk from start to goal (orthogonal steps, no repeats)? */
export function isMazeWalk(size: number, path: [number, number][], requireGoal = true): boolean {
  if (!path.length || path[0][0] !== 0 || path[0][1] !== 0) return false;
  const seen = new Set<string>();
  for (const [i, [r, c]] of path.entries()) {
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    const k = `${r},${c}`;
    if (seen.has(k)) return false;
    seen.add(k);
    if (i > 0) {
      const [pr, pc] = path[i - 1];
      if (Math.abs(pr - r) + Math.abs(pc - c) !== 1) return false;
    }
  }
  const [lr, lc] = path[path.length - 1];
  return !requireGoal || (lr === size - 1 && lc === size - 1);
}

function randomWalk(rng: Rng, n: number, minCells: number, maxCells: number): [number, number][] | null {
  const path: [number, number][] = [[0, 0]];
  const seen = new Set(["0,0"]);
  let budget = 4000;
  const step = (): boolean => {
    if (--budget < 0) return false;
    const [r, c] = path[path.length - 1];
    if (r === n - 1 && c === n - 1) return path.length >= minCells;
    if (path.length >= maxCells) return false;
    for (const [dr, dc] of shuffle(rng, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])) {
      const rr = r + dr;
      const cc = c + dc;
      const k = `${rr},${cc}`;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n || seen.has(k)) continue;
      path.push([rr, cc]);
      seen.add(k);
      if (step()) return true;
      path.pop();
      seen.delete(k);
    }
    return false;
  };
  return step() ? path : null;
}

export function generateMaze(seed: number, difficulty: MazeDifficulty): MazePuzzle {
  const rng = createRng(seed);
  const { size: n, minCells, maxCells } = MAZE_SHAPES[difficulty];
  for (let attempt = 0; attempt < 2000; attempt++) {
    const cells: MazeCell[][] = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c): MazeCell =>
        (r + c) % 2 === 0 ? { kind: "digit", value: randInt(rng, 1, 9) } : { kind: "op", op: pick(rng, OPS) },
      ),
    );
    const path = randomWalk(rng, n, minCells, maxCells);
    if (!path) continue;
    const target = evaluateMazePath(cells, path);
    if (target === null || target < 1 || target > 500) continue;
    return { seed, difficulty, size: n, cells, target, solution: path };
  }
  throw new Error("Could not generate a math maze");
}

export function mazeToPublic(p: MazePuzzle): PublicMaze {
  const { solution: _, ...rest } = p;
  return rest;
}

/** Any legal walk that reaches the goal with the target value counts. */
export function checkMaze(p: Pick<MazePuzzle, "size" | "cells" | "target">, path: [number, number][]) {
  const walk = isMazeWalk(p.size, path);
  const value = evaluateMazePath(p.cells, path);
  return { walk, value, solved: walk && value === p.target };
}
