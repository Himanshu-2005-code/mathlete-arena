import { type Difficulty, type PublicPuzzle, checkCrossMath, generateCrossMath, toPublic } from "./crossmath";
import { type KenKenDifficulty, type PublicKenKen, checkKenKen, generateKenKen, kenkenToPublic } from "./kenken";
import { type MazeDifficulty, type PublicMaze, checkMaze, generateMaze, mazeToPublic } from "./maze";
import { type PublicSudoku, type SudokuDifficulty, checkSudoku, generateSudoku, sudokuToPublic } from "./sudoku";
import { type PublicHectoc, checkHectoc, generateHectoc, hectocToPublic } from "./hectoc";
import { type Make24Difficulty, type PublicMake24, checkMake24, generateMake24, make24ToPublic } from "./make24";

/** Every puzzle game, so the server and the site can treat them alike. */

export type PuzzleKind = "crossmath" | "kenken" | "sudoku" | "maze" | "hectoc" | "make24";

export interface PuzzleKindInfo {
  id: PuzzleKind;
  label: string;
  rules: string;
  difficulties: { id: string; label: string }[];
  /** The difficulty used for the daily challenge. */
  daily: string;
}

export const PUZZLE_KINDS: PuzzleKindInfo[] = [
  {
    id: "crossmath",
    label: "Cross-math",
    rules:
      "Place the numbers so every row and column is true. Multiplication and division are worked out before addition and subtraction.",
    difficulties: [
      { id: "easy", label: "Easy, 3 gaps" },
      { id: "medium", label: "Medium, 5 gaps" },
      { id: "hard", label: "Hard, 7 gaps" },
    ],
    daily: "medium",
  },
  {
    id: "kenken",
    label: "KenKen",
    rules:
      "Use each number once in every row and column. The numbers in each outlined cage must make its target with its operation; for − and ÷ use the bigger number first.",
    difficulties: [
      { id: "easy", label: "Easy, 5×5" },
      { id: "hard", label: "Hard, 6×6" },
    ],
    daily: "easy",
  },
  {
    id: "sudoku",
    label: "Sudoku",
    rules: "Use each number once in every row, column and box.",
    difficulties: [
      { id: "easy", label: "Mini, 6×6" },
      { id: "hard", label: "Classic, 9×9" },
    ],
    daily: "easy",
  },
  {
    id: "maze",
    label: "Math Maze",
    rules:
      "Walk from the top-left number to the bottom-right one, a step at a time, without reusing a square. Work the path out left to right, as a calculator would, and land on the target.",
    difficulties: [
      { id: "easy", label: "Easy, 5×5" },
      { id: "hard", label: "Hard, 7×7" },
    ],
    daily: "easy",
  },
  {
    id: "hectoc",
    label: "Hectoc",
    rules:
      "Make 100 from the six digits, keeping them in order. Use + − × ÷ ^ and brackets between them, and join neighbours into bigger numbers if you like (1 and 2 make 12).",
    difficulties: [{ id: "standard", label: "Six digits" }],
    daily: "standard",
  },
  {
    id: "make24",
    label: "Make 24",
    rules: "Five hands of four numbers. Use all four numbers in each hand once, in any order, with + − × ÷ and brackets, to make 24.",
    difficulties: [
      { id: "easy", label: "Numbers 1 to 9" },
      { id: "hard", label: "Numbers 1 to 13" },
    ],
    daily: "easy",
  },
];

export const puzzleInfo = (kind: PuzzleKind) => PUZZLE_KINDS.find((k) => k.id === kind)!;

export function isDifficulty(kind: PuzzleKind, difficulty: string): boolean {
  return puzzleInfo(kind).difficulties.some((d) => d.id === difficulty);
}

export type AnyPublicPuzzle =
  | { kind: "crossmath"; puzzle: PublicPuzzle }
  | { kind: "kenken"; puzzle: PublicKenKen }
  | { kind: "sudoku"; puzzle: PublicSudoku }
  | { kind: "maze"; puzzle: PublicMaze }
  | { kind: "hectoc"; puzzle: PublicHectoc }
  | { kind: "make24"; puzzle: PublicMake24 };

/** What a player submits: a filled grid, a path for the maze, or expressions for Hectoc and Make 24. */
export interface PuzzleAnswer {
  grid?: (number | null)[][];
  path?: [number, number][];
  expressions?: string[];
}

export function generatePublicPuzzle(kind: PuzzleKind, seed: number, difficulty: string): AnyPublicPuzzle {
  switch (kind) {
    case "crossmath":
      return { kind, puzzle: toPublic(generateCrossMath(seed, difficulty as Difficulty)) };
    case "kenken":
      return { kind, puzzle: kenkenToPublic(generateKenKen(seed, difficulty as KenKenDifficulty)) };
    case "sudoku":
      return { kind, puzzle: sudokuToPublic(generateSudoku(seed, difficulty as SudokuDifficulty)) };
    case "maze":
      return { kind, puzzle: mazeToPublic(generateMaze(seed, difficulty as MazeDifficulty)) };
    case "hectoc":
      return { kind, puzzle: hectocToPublic(generateHectoc(seed)) };
    case "make24":
      return { kind, puzzle: make24ToPublic(generateMake24(seed, difficulty as Make24Difficulty)) };
  }
}

/** Rebuild the puzzle from its seed and check the answer. */
export function verifyPuzzle(kind: PuzzleKind, seed: number, difficulty: string, answer: PuzzleAnswer): boolean {
  if (!isDifficulty(kind, difficulty)) return false;
  const p = generatePublicPuzzle(kind, seed, difficulty);
  switch (p.kind) {
    case "crossmath":
      return !!answer.grid && checkCrossMath(p.puzzle, answer.grid).solved;
    case "kenken":
      return !!answer.grid && checkKenKen(p.puzzle, answer.grid).solved;
    case "sudoku":
      return !!answer.grid && checkSudoku(p.puzzle, answer.grid).solved;
    case "maze":
      return !!answer.path && checkMaze(p.puzzle, answer.path).solved;
    case "hectoc":
      return answer.expressions?.length === 1 && checkHectoc(p.puzzle, answer.expressions[0]).solved;
    case "make24":
      return !!answer.expressions && checkMake24(p.puzzle, answer.expressions);
  }
}
