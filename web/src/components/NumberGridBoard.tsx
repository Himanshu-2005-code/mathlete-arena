"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type KenKenCheck,
  type KenKenOp,
  type PublicKenKen,
  type PublicSudoku,
  checkKenKen,
  checkSudoku,
} from "@matik/shared";
import { playCorrect, playWrong } from "@/lib/sound";
import { formatTime } from "./CrossMathBoard";
import { useStopwatch } from "./useStopwatch";

/**
 * One board for both KenKen and Sudoku: an n×n grid filled with 1..n.
 * KenKen draws cage outlines with their targets; Sudoku draws boxes and givens.
 */

export interface GridSolved {
  grid: (number | null)[][];
  timeMs: number;
  mistakes: number;
}

type Props =
  | { kind: "kenken"; puzzle: PublicKenKen; onSolved: (s: GridSolved) => void }
  | { kind: "sudoku"; puzzle: PublicSudoku; onSolved: (s: GridSolved) => void };

const showOp = (op: KenKenOp) => (op === "-" ? "−" : op);

export function NumberGridBoard(props: Props) {
  const n = props.puzzle.size;
  const givens: (number | null)[][] =
    props.kind === "sudoku" ? props.puzzle.givens : Array.from({ length: n }, () => Array(n).fill(null));

  const [grid, setGrid] = useState<(number | null)[][]>(() => givens.map((row) => [...row]));
  const [notes, setNotes] = useState<number[][][]>(() => Array.from({ length: n }, () => Array.from({ length: n }, () => [])));
  const [sel, setSel] = useState<[number, number]>(() => firstOpen(givens));
  const [noteMode, setNoteMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [solved, setSolved] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const { elapsed, now } = useStopwatch(solved);

  // Which group each cell belongs to, for thick borders: cages for KenKen, boxes for Sudoku.
  const groupOf = useMemo(() => {
    const g = Array.from({ length: n }, () => Array(n).fill(0));
    if (props.kind === "kenken") props.puzzle.cages.forEach((cage, i) => cage.cells.forEach(([r, c]) => (g[r][c] = i)));
    else {
      const { rows, cols } = props.puzzle.box;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g[r][c] = Math.floor(r / rows) * (n / cols) + Math.floor(c / cols);
    }
    return g;
  }, [props.kind, props.puzzle, n]);

  // Cage labels sit in each cage's top-left cell.
  const labels = useMemo(() => {
    const m = new Map<string, string>();
    if (props.kind === "kenken")
      for (const cage of props.puzzle.cages) {
        const [r, c] = [...cage.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
        m.set(`${r},${c}`, `${cage.target}${showOp(cage.op)}`);
      }
    return m;
  }, [props.kind, props.puzzle]);

  // Sudoku has no cages, so its cage list is empty.
  const check = useCallback(
    (g: (number | null)[][]): KenKenCheck =>
      props.kind === "kenken" ? checkKenKen(props.puzzle, g) : { ...checkSudoku(props.puzzle, g), cageOk: [] },
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
    const g = groupOf[r][c];
    const badCage = after.cageOk[g] === false && cageOk[g] !== false;
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
          className={`ngrid size-${n}`}
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
          role="grid"
          aria-label={props.kind === "kenken" ? "KenKen grid" : "Sudoku grid"}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {grid.map((row, r) =>
            row.map((v, c) => {
              const selected = sel[0] === r && sel[1] === c;
              const label = labels.get(`${r},${c}`);
              const cageBad = cageOk[groupOf[r][c]] === false;
              const classes = [
                "ncell",
                edge(r, c, -1, 0) && "bt",
                edge(r, c, 0, 1) && "br",
                edge(r, c, 1, 0) && "bb",
                edge(r, c, 0, -1) && "bl",
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
