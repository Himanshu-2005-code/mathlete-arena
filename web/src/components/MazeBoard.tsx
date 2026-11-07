"use client";

import { useEffect, useMemo, useState } from "react";
import { type MazeCell, type PublicMaze, checkMaze, evaluateMazePath } from "@mathlete/shared";
import { playCorrect, playWrong } from "@/lib/sound";
import { formatTime } from "./CrossMathBoard";
import { useStopwatch } from "./useStopwatch";

export interface MazeSolved {
  path: [number, number][];
  timeMs: number;
  mistakes: number;
}

const showCell = (cell: MazeCell) => (cell.kind === "digit" ? cell.value : cell.op === "-" ? "−" : cell.op);

/**
 * Tap squares next to the end of your path to extend it; tap a square already
 * on the path to cut back to it. Arrow keys work too.
 */
export function MazeBoard({ puzzle, onSolved }: { puzzle: PublicMaze; onSolved: (s: MazeSolved) => void }) {
  const n = puzzle.size;
  const [path, setPath] = useState<[number, number][]>([[0, 0]]);
  const [mistakes, setMistakes] = useState(0);
  const [miss, setMiss] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const { elapsed, now } = useStopwatch(solved);

  const onPath = useMemo(() => new Map(path.map(([r, c], i) => [`${r},${c}`, i])), [path]);
  const [er, ec] = path[path.length - 1];

  // Running value: everything up to the last number on the path.
  const lastDigitPath = path.length % 2 === 1 ? path : path.slice(0, -1);
  const running = evaluateMazePath(puzzle.cells, lastDigitPath);
  const pendingOp = path.length % 2 === 0 ? puzzle.cells[er][ec] : null;

  const atGoal = er === n - 1 && ec === n - 1;

  useEffect(() => {
    if (!atGoal || solved) return;
    const res = checkMaze(puzzle, path);
    if (res.solved) {
      setSolved(true);
      playCorrect();
      onSolved({ path, timeMs: now(), mistakes });
    } else {
      setMiss(res.value);
      setMistakes((m) => m + 1);
      playWrong();
    }
    // Only react when the path changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const tap = (r: number, c: number) => {
    if (solved) return;
    const at = onPath.get(`${r},${c}`);
    if (at !== undefined) {
      setPath(path.slice(0, Math.max(1, at + 1)));
      setMiss(null);
      return;
    }
    if (atGoal) return;
    if (Math.abs(r - er) + Math.abs(c - ec) !== 1) return;
    // A step that would divide unevenly isn't allowed.
    const next: [number, number][] = [...path, [r, c]];
    if (next.length % 2 === 1 && evaluateMazePath(puzzle.cells, next) === null) {
      setMiss(null);
      return;
    }
    setPath(next);
    setMiss(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (e.key === "Backspace") {
      setPath((p) => (p.length > 1 ? p.slice(0, -1) : p));
      setMiss(null);
    } else if (step[e.key]) {
      const [dr, dc] = step[e.key];
      const r = er + dr;
      const c = ec + dc;
      if (r >= 0 && c >= 0 && r < n && c < n) tap(r, c);
    } else return;
    e.preventDefault();
  };

  return (
    <>
      <div className="sprint-bar">
        <span>
          <span className="num">{formatTime(elapsed)}</span>
        </span>
        <span>
          <span className="num">{mistakes}</span>
          {mistakes === 1 ? "wrong finish" : "wrong finishes"}
        </span>
      </div>

      <div className="puzzle-wrap">
        <div
          className="mgrid"
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
          role="grid"
          aria-label="Math maze"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {puzzle.cells.map((row, r) =>
            row.map((cell, c) => {
              const i = onPath.get(`${r},${c}`);
              const isEnd = r === er && c === ec;
              const next = !atGoal && i === undefined && Math.abs(r - er) + Math.abs(c - ec) === 1;
              const classes = [
                "mcell",
                cell.kind,
                i !== undefined && "on",
                isEnd && "end",
                next && "next",
                r === 0 && c === 0 && "start",
                r === n - 1 && c === n - 1 && "goal",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={classes}
                  onClick={() => tap(r, c)}
                  tabIndex={-1}
                  aria-label={`${showCell(cell)}${i !== undefined ? `, step ${i + 1}` : ""}${r === n - 1 && c === n - 1 ? ", goal" : ""}`}
                >
                  {showCell(cell)}
                </button>
              );
            }),
          )}
        </div>

        <div className="bank maze-side">
          <p className="maze-target">
            Target <span className="num">{puzzle.target}</span>
          </p>
          <p className="maze-running" aria-live="polite">
            So far <span className="num">{running ?? "–"}</span>
            {pendingOp && pendingOp.kind === "op" && <span className="num"> {showCell(pendingOp)}</span>}
          </p>
          {miss !== null && (
            <p className="error">
              That path makes {miss}, not {puzzle.target}. Tap an earlier square to back up.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn ghost"
              disabled={solved || path.length === 1}
              onClick={() => {
                setPath([[0, 0]]);
                setMiss(null);
              }}
            >
              Start over
            </button>
          </div>
          <p className="hint">Tap a square next to the end of your path, or use the arrow keys. Backspace steps back.</p>
        </div>
      </div>
    </>
  );
}
