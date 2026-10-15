"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type KenKenCheck,
  type KenKenOp,
  type PublicFutoshiki,
  type PublicKenKen,
  type PublicKiller,
  type PublicSudoku,
  checkFutoshiki,
  checkKenKen,
  checkKiller,
  checkSudoku,
} from "@matik/shared";
import { playCorrect, playWrong } from "@/lib/sound";
import { formatTime } from "./CrossMathBoard";
import { useStopwatch } from "./useStopwatch";

/**
 * One board for every n×n number grid: KenKen (bold cages with targets),
 * Sudoku (bold boxes, givens), Killer Sudoku (bold boxes plus dashed sum
 * cages) and Futoshiki (less-than signs between cells).
 */

export interface GridSolved {
  grid: (number | null)[][];
  timeMs: number;
  mistakes: number;
}

type Props =
  | { kind: "kenken"; puzzle: PublicKenKen; onSolved: (s: GridSolved) => void }
  | { kind: "sudoku"; puzzle: PublicSudoku; onSolved: (s: GridSolved) => void }
  | { kind: "killer"; puzzle: PublicKiller; onSolved: (s: GridSolved) => void }
  | { kind: "futoshiki"; puzzle: PublicFutoshiki; onSolved: (s: GridSolved) => void };

const GRID_LABELS: Record<Props["kind"], string> = {
  kenken: "KenKen grid",
  sudoku: "Sudoku grid",
  killer: "Killer Sudoku grid",
  futoshiki: "Futoshiki grid",
};

const showOp = (op: KenKenOp) => (op === "-" ? "−" : op);

export function NumberGridBoard(props: Props) {
  const n = props.puzzle.size;
  const givens: (number | null)[][] =
    props.kind === "kenken" ? Array.from({ length: n }, () => Array(n).fill(null)) : props.puzzle.givens;

  const [grid, setGrid] = useState<(number | null)[][]>(() => givens.map((row) => [...row]));
  const [notes, setNotes] = useState<number[][][]>(() => Array.from({ length: n }, () => Array.from({ length: n }, () => [])));
  const [sel, setSel] = useState<[number, number]>(() => firstOpen(givens));
  const [noteMode, setNoteMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [solved, setSolved] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const { elapsed, now } = useStopwatch(solved);

  const layout = useMemo(() => {
    // groupOf: bold outlines (KenKen cages, Sudoku boxes). cageOf: the cage a cell's
    // total belongs to (KenKen, Killer), or -1. dashed: Killer cages drawn inside boxes.
    const groupOf = Array.from({ length: n }, () => Array(n).fill(0));
    const cageOf = Array.from({ length: n }, () => Array(n).fill(-1));
    const labels = new Map<string, string>();
    const signs = new Map<string, { right?: string; below?: string }>();
    const corner = (cells: [number, number][]) => [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];

    if (props.kind === "kenken") {
      props.puzzle.cages.forEach((cage, i) => {
        cage.cells.forEach(([r, c]) => (groupOf[r][c] = cageOf[r][c] = i));
        const [r, c] = corner(cage.cells);
        labels.set(`${r},${c}`, `${cage.target}${showOp(cage.op)}`);
      });
    }
    if (props.kind === "sudoku" || props.kind === "killer") {
      const { rows, cols } = props.puzzle.box;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) groupOf[r][c] = Math.floor(r / rows) * (n / cols) + Math.floor(c / cols);
    }
    if (props.kind === "killer") {
      props.puzzle.cages.forEach((cage, i) => {
        cage.cells.forEach(([r, c]) => (cageOf[r][c] = i));
        const [r, c] = corner(cage.cells);
        labels.set(`${r},${c}`, String(cage.sum));
      });
    }
    if (props.kind === "futoshiki") {
      // Each sign sits on the edge between two cells, owned by the left or upper one.
      for (const [[ar, ac], [br, bc]] of props.puzzle.lessThan) {
        const aFirst = ar < br || ac < bc;
        const [fr, fc] = aFirst ? [ar, ac] : [br, bc];
        const firstIsSmaller = aFirst;
        const k = `${fr},${fc}`;
        const entry = signs.get(k) ?? {};
        if (ar === br) entry.right = firstIsSmaller ? "<" : ">";
        else entry.below = firstIsSmaller ? "∧" : "∨";
        signs.set(k, entry);
      }
    }
    return { groupOf, cageOf, labels, signs, dashed: props.kind === "killer" };
  }, [props.kind, props.puzzle, n]);
  const { groupOf, cageOf, labels, signs } = layout;

  // Sudoku and Futoshiki have no cages, so their cage list is empty.
  const check = useCallback(
    (g: (number | null)[][]): KenKenCheck => {
      switch (props.kind) {
        case "kenken":
          return checkKenKen(props.puzzle, g);
        case "killer":
          return checkKiller(props.puzzle, g);
        case "sudoku":
          return { ...checkSudoku(props.puzzle, g), cageOk: [] };
        case "futoshiki":
          return { ...checkFutoshiki(props.puzzle, g), cageOk: [] };
      }
    },
    [props.kind, props.puzzle],
  );
  const result = useMemo(() => check(grid), [check, grid]);
  const cageOk = result.cageOk;

  const { onSolved } = props;
  useEffect(() => {
    if (!result.solved || solved) return;
    setSolved(true);
    onSolved({ grid, timeMs: now(), mistakes });
  }, [result.solved, solved, grid, mistakes, onSolved, now]);

  const isGiven = (r: number, c: number) => givens[r][c] !== null;

  const enter = (value: number | null) => {
    if (solved) return;
    const [r, c] = sel;
    if (isGiven(r, c)) return;
    if (noteMode && value !== null) {
      setNotes((prev) => {
        const next = prev.map((row) => row.map((cell) => [...cell]));
        const cell = next[r][c];
        next[r][c] = cell.includes(value) ? cell.filter((v) => v !== value) : [...cell, value].sort();
        return next;
      });
      return;
    }
    const next = grid.map((row) => [...row]);
    next[r][c] = value;
    setGrid(next);
    if (value === null) return;
    // A placement that clashes, or completes a wrong cage, counts as a mistake.
    const after = check(next);
    const clash = after.conflicts[r][c];
    const g = cageOf[r][c];
    const badCage = g >= 0 && after.cageOk[g] === false && cageOk[g] !== false;
    if (clash || badCage) {
      setMistakes((m) => m + 1);
      playWrong();
    } else playCorrect();
  };

  const move = (dr: number, dc: number) =>
    setSel(([r, c]) => [Math.min(n - 1, Math.max(0, r + dr)), Math.min(n - 1, Math.max(0, c + dc))]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (/^[1-9]$/.test(k) && Number(k) <= n) enter(Number(k));
    else if (k === "Backspace" || k === "Delete" || k === "0") enter(null);
    else if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowLeft") move(0, -1);
    else if (k === "ArrowRight") move(0, 1);
    else if (k === "n" || k === "N") setNoteMode((m) => !m);
    else return;
    e.preventDefault();
  };

  const edge = (r: number, c: number, dr: number, dc: number) => {
    const rr = r + dr;
    const cc = c + dc;
    return rr < 0 || cc < 0 || rr >= n || cc >= n || groupOf[rr][cc] !== groupOf[r][c];
  };
  // Killer cages: a dashed line where the cage changes but the box doesn't.
  const dash = (r: number, c: number, dr: number, dc: number) => {
    if (!layout.dashed) return false;
    const rr = r + dr;
    const cc = c + dc;
    return rr >= 0 && cc >= 0 && rr < n && cc < n && cageOf[rr][cc] !== cageOf[r][c] && !edge(r, c, dr, dc);
  };

  return (
    <>
      <div className="sprint-bar">
        <span>
          <span className="num">{formatTime(elapsed)}</span>
        </span>
        <span>
          <span className="num">{mistakes}</span>
          {mistakes === 1 ? "mistake" : "mistakes"}
        </span>
      </div>

      <div className="puzzle-wrap">
        <div
          ref={boardRef}
          className={`ngrid size-${n}${props.kind === "futoshiki" ? " futoshiki" : ""}`}
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
          role="grid"
          aria-label={GRID_LABELS[props.kind]}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {grid.map((row, r) =>
            row.map((v, c) => {
              const selected = sel[0] === r && sel[1] === c;
              const label = labels.get(`${r},${c}`);
              const cageBad = cageOf[r][c] >= 0 && cageOk[cageOf[r][c]] === false;
              const sign = signs.get(`${r},${c}`);
              const classes = [
                "ncell",
                edge(r, c, -1, 0) && "bt",
                edge(r, c, 0, 1) && "br",
                edge(r, c, 1, 0) && "bb",
                edge(r, c, 0, -1) && "bl",
                dash(r, c, -1, 0) && "dt",
                dash(r, c, 0, 1) && "dr",
                dash(r, c, 1, 0) && "db",
                dash(r, c, 0, -1) && "dl",
                props.kind === "futoshiki" && "spaced",
                isGiven(r, c) && "given",
                selected && "selected",
                (result.conflicts[r][c] || cageBad) && "clash",
                !selected && (sel[0] === r || sel[1] === c) && "line",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={classes}
                  onClick={() => {
                    setSel([r, c]);
                    boardRef.current?.focus();
                  }}
                  aria-label={`Row ${r + 1} column ${c + 1}${label ? `, cage ${label}` : ""}${v ? `, ${v}` : ", empty"}`}
                  tabIndex={-1}
                >
                  {label && <span className="cage-label">{label}</span>}
                  {sign?.right && (
                    <span className="sign sign-right" aria-hidden>
                      {sign.right}
                    </span>
                  )}
                  {sign?.below && (
                    <span className="sign sign-below" aria-hidden>
                      {sign.below}
                    </span>
                  )}
                  {v !== null ? (
                    <span className="nval">{v}</span>
                  ) : notes[r][c].length > 0 ? (
                    <span className="nnotes">
                      {notes[r][c].map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            }),
          )}
        </div>

        <div className="bank">
          <h3>Numbers</h3>
          <div className="bank-tiles keypad">
            {Array.from({ length: n }, (_, i) => i + 1).map((d) => (
              <button key={d} type="button" className="tile" disabled={solved} onClick={() => enter(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="tile erase" disabled={solved} onClick={() => enter(null)}>
              Erase
            </button>
          </div>
          <label className="note-toggle">
            <input type="checkbox" checked={noteMode} onChange={(e) => setNoteMode(e.target.checked)} /> Pencil notes
          </label>
          <p className="hint">Type numbers or tap the pad. Arrow keys move, N toggles notes.</p>
        </div>
      </div>
    </>
  );
}

function firstOpen(givens: (number | null)[][]): [number, number] {
  for (let r = 0; r < givens.length; r++) for (let c = 0; c < givens.length; c++) if (givens[r][c] === null) return [r, c];
  return [0, 0];
}
