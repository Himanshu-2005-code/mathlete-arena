import { describe, expect, it } from "vitest";
import {
  checkKenKen,
  checkMaze,
  checkSudoku,
  countKenKenSolutions,
  evaluateMazePath,
  generateKenKen,
  generateMaze,
  generateSudoku,
  isMazeWalk,
  kenkenToPublic,
  mazeToPublic,
  solveSudoku,
  sudokuToPublic,
  verifyPuzzle,
} from "./index";

describe("KenKen", () => {
  it.each(["easy", "hard"] as const)("generates %s puzzles with exactly one solution", (difficulty) => {
    for (let seed = 1; seed <= 15; seed++) {
      const p = generateKenKen(seed, difficulty);
      expect(countKenKenSolutions(p.size, p.cages)).toBe(1);
      expect(checkKenKen(p, p.solution).solved).toBe(true);
      // Every cell is in exactly one cage.
      expect(p.cages.flatMap((c) => c.cells)).toHaveLength(p.size * p.size);
      expect(kenkenToPublic(p)).not.toHaveProperty("solution");
    }
  });

  it("flags repeats and wrong cages", () => {
    const p = generateKenKen(3, "easy");
    const bad = p.solution.map((row) => [...row]);
    [bad[0][0], bad[0][1]] = [bad[0][1], bad[0][0]];
    const res = checkKenKen(p, bad);
    expect(res.solved).toBe(false);
    const empty = p.solution.map((row) => row.map(() => null));
    expect(checkKenKen(p, empty)).toMatchObject({ complete: false, solved: false });
  });

  it("is reproducible from its seed", () => {
    expect(generateKenKen(42, "hard")).toEqual(generateKenKen(42, "hard"));
  });
});

describe("Sudoku", () => {
  it.each(["easy", "hard"] as const)("generates %s puzzles with exactly one solution", (difficulty) => {
    for (let seed = 1; seed <= 8; seed++) {
      const p = generateSudoku(seed, difficulty);
      expect(solveSudoku(p.size, p.box, p.givens, 2).count).toBe(1);
      expect(checkSudoku(p, p.solution).solved).toBe(true);
      expect(sudokuToPublic(p)).not.toHaveProperty("solution");
    }
  });

  it("rejects grids that change a given or break a rule", () => {
    const p = generateSudoku(9, "easy");
    const changed = p.solution.map((row) => [...row]);
    const [r, c] = (() => {
      for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.givens[r][c] !== null) return [r, c];
      return [0, 0];
    })();
    changed[r][c] = (changed[r][c] % p.size) + 1;
    expect(checkSudoku(p, changed).solved).toBe(false);
  });
});

describe("Math Maze", () => {
  it.each(["easy", "hard"] as const)("generates %s mazes whose solution path reaches the target", (difficulty) => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = generateMaze(seed, difficulty);
      expect(isMazeWalk(p.size, p.solution)).toBe(true);
      expect(checkMaze(p, p.solution)).toMatchObject({ walk: true, solved: true, value: p.target });
      expect(mazeToPublic(p)).not.toHaveProperty("solution");
    }
  });

  it("works left to right without precedence and rejects bad walks", () => {
    const cells = [
      [
        { kind: "digit", value: 3 },
        { kind: "op", op: "+" },
        { kind: "digit", value: 4 },
      ],
      [
        { kind: "op", op: "×" },
        { kind: "digit", value: 9 },
        { kind: "op", op: "×" },
      ],
      [
        { kind: "digit", value: 1 },
        { kind: "op", op: "-" },
        { kind: "digit", value: 2 },
      ],
    ] as const;
    // 3 + 4 × 2 = 14 read left to right
    expect(evaluateMazePath(cells as any, [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]])).toBe(14);
    expect(isMazeWalk(3, [[0, 0], [1, 1]])).toBe(false); // diagonal
    expect(isMazeWalk(3, [[0, 0], [0, 1], [0, 0]], false)).toBe(false); // revisit
  });
});

describe("verifyPuzzle", () => {
  it("checks every kind from its seed", () => {
    const k = generateKenKen(5, "easy");
    expect(verifyPuzzle("kenken", 5, "easy", { grid: k.solution })).toBe(true);
    const s = generateSudoku(5, "easy");
    expect(verifyPuzzle("sudoku", 5, "easy", { grid: s.solution })).toBe(true);
    const m = generateMaze(5, "hard");
    expect(verifyPuzzle("maze", 5, "hard", { path: m.solution })).toBe(true);
    expect(verifyPuzzle("maze", 5, "easy", { path: m.solution })).toBe(false);
    expect(verifyPuzzle("kenken", 5, "medium", { grid: k.solution })).toBe(false);
  });
});
