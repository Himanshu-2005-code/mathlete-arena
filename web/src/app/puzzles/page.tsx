"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  DIFFICULTIES,
  type Difficulty,
  type Op,
  type PublicPuzzle,
  checkCrossMath,
  generateCrossMath,
  randomSeed,
  toPublic,
} from "@matik/shared";
import { Choices } from "@/components/Choices";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Key = string;
const key = (r: number, c: number): Key => `${r},${c}`;

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
const showOp = (op: Op) => (op === "-" ? "−" : op);

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PuzzlesPage() {
  const { user } = useAuth();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [puzzle, setPuzzle] = useState<PublicPuzzle | null>(null);
  // cell -> index into puzzle.bank
  const [placed, setPlaced] = useState<Record<Key, number>>({});
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<Key | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [solvedAt, setSolvedAt] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const startedAt = useRef(0);

  const newPuzzle = (d: Difficulty = difficulty) => {
    setPuzzle(toPublic(generateCrossMath(randomSeed(), d)));
    setPlaced({});
    setActiveTile(null);
    setSelectedCell(null);
    setMistakes(0);
    setElapsed(0);
    setSolvedAt(null);
    setSaveMsg("");
    startedAt.current = performance.now();
  };

  useEffect(() => newPuzzle("easy"), []); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => (puzzle ? buildGrid(puzzle, placed) : null), [puzzle, placed]);

  const check = useMemo(() => (puzzle && grid ? checkCrossMath(puzzle, grid) : null), [puzzle, grid]);
  const solved = check?.solved ?? false;

  // Timer runs until solved.
  useEffect(() => {
    if (!puzzle || solvedAt !== null) return;
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [puzzle, solvedAt]);

  useEffect(() => {
    if (!solved || solvedAt !== null || !puzzle || !grid) return;
    const timeMs = Math.round(performance.now() - startedAt.current);
    setSolvedAt(timeMs);
    setElapsed(timeMs);
    if (!user) return;
    setSaveMsg("Saving…");
    api
      .savePuzzle({ seed: puzzle.seed, difficulty: puzzle.difficulty, grid, timeMs, mistakes })
      .then(() => setSaveMsg("Saved to your profile."))
      .catch((e: Error) => setSaveMsg(`Not saved: ${e.message}`));
  }, [solved, solvedAt, puzzle, grid, user, mistakes]);

  const usedTiles = new Set(Object.values(placed));

  const place = (cell: Key, tile: number) => {
    if (!puzzle) return;
    const before = check;
    const next = { ...placed, [cell]: tile };
    setPlaced(next);
    setActiveTile(null);
    setSelectedCell(null);

    // Count a mistake when this placement completes a line that doesn't hold.
    const after = checkCrossMath(puzzle, buildGrid(puzzle, next));
    const newlyWrong = [...after.rowOk, ...after.colOk].some(
      (ok, i) => ok === false && [...(before?.rowOk ?? []), ...(before?.colOk ?? [])][i] !== false,
    );
    if (newlyWrong) setMistakes((m) => m + 1);
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
    <section>
      <h1>Cross-math</h1>
      <p className="lede">
        Place the numbers so every row and column is true. Multiplication and division are worked out before addition
        and subtraction. Pick a number, then a gap; tap a filled gap to take it back.
      </p>

      <Choices
        legend="Difficulty"
        name="difficulty"
        value={difficulty}
        onChange={(d) => {
          setDifficulty(d);
          newPuzzle(d);
        }}
        options={DIFFICULTIES.map((d) => ({ value: d.id, label: `${d.label}, ${d.hidden} gaps` }))}
      />

      {puzzle && grid && check && (
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

          {solved ? (
            <div aria-live="polite">
              <h2 className="section">Solved in {formatTime(solvedAt ?? elapsed)}.</h2>
              {user ? (
                <p className="notice">{saveMsg}</p>
              ) : (
                <p className="notice">
                  <Link href="/auth">Sign in</Link> to keep your solve times.
                </p>
              )}
              <div className="actions">
                <button type="button" className="btn" onClick={() => newPuzzle()}>
                  Next puzzle
                </button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => newPuzzle()}>
                New puzzle
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
