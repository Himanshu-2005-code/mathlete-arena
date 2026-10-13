"use client";

import { useCallback } from "react";
import type { AnyPublicPuzzle, PuzzleAnswer } from "@matik/shared";
import { CrossMathBoard, type SolvedInfo } from "./CrossMathBoard";
import { MazeBoard, type MazeSolved } from "./MazeBoard";
import { type GridSolved, NumberGridBoard } from "./NumberGridBoard";
import { ExpressionBoard, type ExpressionSolved } from "./ExpressionBoard";

export interface PuzzleSolved {
  answer: PuzzleAnswer;
  timeMs: number;
  mistakes: number;
}

/** Shows the right board for any puzzle kind and reports the solve the same way. */
export function PuzzlePlayer({ p, onSolved }: { p: AnyPublicPuzzle; onSolved: (s: PuzzleSolved) => void }) {
  const grid = useCallback(
    (s: SolvedInfo | GridSolved) => onSolved({ answer: { grid: s.grid }, timeMs: s.timeMs, mistakes: s.mistakes }),
    [onSolved],
  );
  const path = useCallback(
    (s: MazeSolved) => onSolved({ answer: { path: s.path }, timeMs: s.timeMs, mistakes: s.mistakes }),
    [onSolved],
  );
  const exprs = useCallback(
    (s: ExpressionSolved) => onSolved({ answer: { expressions: s.expressions }, timeMs: s.timeMs, mistakes: s.mistakes }),
    [onSolved],
  );
  const key = `${p.kind}-${p.puzzle.seed}-${p.puzzle.difficulty}`;
  switch (p.kind) {
    case "crossmath":
      return <CrossMathBoard key={key} puzzle={p.puzzle} onSolved={grid} />;
    case "kenken":
      return <NumberGridBoard key={key} kind="kenken" puzzle={p.puzzle} onSolved={grid} />;
    case "sudoku":
      return <NumberGridBoard key={key} kind="sudoku" puzzle={p.puzzle} onSolved={grid} />;
    case "maze":
      return <MazeBoard key={key} puzzle={p.puzzle} onSolved={path} />;
    case "hectoc":
      return <ExpressionBoard key={key} kind="hectoc" puzzle={p.puzzle} onSolved={exprs} />;
    case "make24":
      return <ExpressionBoard key={key} kind="make24" puzzle={p.puzzle} onSolved={exprs} />;
  }
}
