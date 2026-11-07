"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { type Op, type PublicPuzzle, checkCrossMath } from "@mathlete/shared";

type Key = string;
const key = (r: number, c: number): Key => `${r},${c}`;
const showOp = (op: Op) => (op === "-" ? "−" : op);

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The grid as the player currently sees it: givens plus placed numbers. */
function buildGrid(puzzle: PublicPuzzle, placed: Record<Key, number>) {
  return puzzle.given.map((row, r) =>
    row.map((v, c) => {
      if (!puzzle.hidden[r][c]) return v;
      const i = placed[key(r, c)];
      return i === undefined ? null : puzzle.bank[i];
    }),
  );
}

export interface SolvedInfo {
  grid: (number | null)[][];
  timeMs: number;
  mistakes: number;
}

/**
 * A playable cross-math grid with its own timer and mistake count.
 * Give it a `key` per puzzle so a new puzzle starts fresh.
 */
export function CrossMathBoard({ puzzle, onSolved }: { puzzle: PublicPuzzle; onSolved: (s: SolvedInfo) => void }) {
  // cell -> index into puzzle.bank
  const [placed, setPlaced] = useState<Record<Key, number>>({});
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<Key | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [solvedAt, setSolvedAt] = useState<number | null>(null);
  const startedAt = useRef(performance.now());

  const grid = useMemo(() => buildGrid(puzzle, placed), [puzzle, placed]);
  const check = useMemo(() => checkCrossMath(puzzle, grid), [puzzle, grid]);
  const solved = check.solved;

  useEffect(() => {
    if (solvedAt !== null) return;
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [solvedAt]);

  useEffect(() => {
    if (!solved || solvedAt !== null) return;
    const timeMs = Math.round(performance.now() - startedAt.current);
    setSolvedAt(timeMs);
    setElapsed(timeMs);
    onSolved({ grid, timeMs, mistakes });
  }, [solved, solvedAt, grid, mistakes, onSolved]);

  const usedTiles = new Set(Object.values(placed));

  const place = (cell: Key, tile: number) => {
    const next = { ...placed, [cell]: tile };
    setPlaced(next);
    setActiveTile(null);
    setSelectedCell(null);

    // Count a mistake when this placement completes a line that doesn't hold.
    const after = checkCrossMath(puzzle, buildGrid(puzzle, next));
    const before = [...check.rowOk, ...check.colOk];
    if ([...after.rowOk, ...after.colOk].some((ok, i) => ok === false && before[i] !== false)) {
      setMistakes((m) => m + 1);
    }
  };

  const onCell = (r: number, c: number) => {
    if (solved) return;
    const k = key(r, c);
    if (placed[k] !== undefined) {
      const { [k]: _, ...rest } = placed;
      setPlaced(rest);
      setSelectedCell(k);
      return;
    }
    if (activeTile !== null) place(k, activeTile);
    else setSelectedCell(selectedCell === k ? null : k);
  };

  const onTile = (i: number) => {
    if (solved || usedTiles.has(i)) return;
    if (selectedCell) place(selectedCell, i);
    else setActiveTile(activeTile === i ? null : i);
  };

  const status = (ok: boolean | null) => (ok === true ? " ok" : ok === false ? " bad" : "");

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
        <div className="xgrid" role="grid" aria-label="Cross-math grid">
          {[0, 1, 2].map((r) => (
            <Fragment key={r}>
              {[0, 1, 2].map((c) => (
                <Fragment key={c}>
                  {puzzle.hidden[r][c] ? (
                    <button
                      type="button"
                      className={`xcell${grid[r][c] !== null ? " filled" : ""}${selectedCell === key(r, c) ? " selected" : ""}`}
                      onClick={() => onCell(r, c)}
                      aria-label={
                        grid[r][c] === null ? `Empty gap, row ${r + 1} column ${c + 1}` : `${grid[r][c]}, tap to remove`
                      }
                    >
                      {grid[r][c] ?? ""}
                    </button>
                  ) : (
                    <div className="xcell">{grid[r][c]}</div>
                  )}
                  {c < 2 && <span className="xop">{showOp(puzzle.rowOps[r][c])}</span>}
                </Fragment>
              ))}
              <span className="xop">=</span>
              <span className={`xres${status(check.rowOk[r])}`}>{puzzle.rowResults[r]}</span>

              {r < 2 &&
                [0, 1, 2].map((c) => (
                  <Fragment key={`op${c}`}>
                    <span className="xop">{showOp(puzzle.colOps[c][r])}</span>
                    {c < 2 && <span />}
                  </Fragment>
                ))}
              {r < 2 && (
                <>
                  <span />
                  <span />
                </>
              )}
            </Fragment>
          ))}
          {[0, 1, 2].map((c) => (
            <Fragment key={`eq${c}`}>
              <span className="xop">=</span>
              {c < 2 && <span />}
            </Fragment>
          ))}
          <span />
          <span />
          {[0, 1, 2].map((c) => (
            <Fragment key={`res${c}`}>
              <span className={`xres-col${status(check.colOk[c])}`}>{puzzle.colResults[c]}</span>
              {c < 2 && <span />}
            </Fragment>
          ))}
          <span />
          <span />
        </div>

        <div className="bank">
          <h3>Numbers</h3>
          <div className="bank-tiles">
            {puzzle.bank.map((n, i) => (
              <button
                key={i}
                type="button"
                className={`tile${activeTile === i ? " active" : ""}`}
                disabled={usedTiles.has(i) || solved}
                onClick={() => onTile(i)}
                aria-pressed={activeTile === i}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
