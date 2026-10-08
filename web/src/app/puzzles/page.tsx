"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DIFFICULTIES, type Difficulty, type PublicPuzzle, generateCrossMath, randomSeed, toPublic } from "@matik/shared";
import { Choices } from "@/components/Choices";
import { CrossMathBoard, type SolvedInfo, formatTime } from "@/components/CrossMathBoard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function PuzzlesPage() {
  const { user } = useAuth();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [puzzle, setPuzzle] = useState<PublicPuzzle | null>(null);
  const [solvedMs, setSolvedMs] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  const newPuzzle = (d: Difficulty = difficulty) => {
    setPuzzle(toPublic(generateCrossMath(randomSeed(), d)));
    setSolvedMs(null);
    setSaveMsg("");
  };

  // Generated after mount so the server render and the client agree.
  useEffect(() => newPuzzle("easy"), []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSolved = useCallback(
    ({ grid, timeMs, mistakes }: SolvedInfo) => {
      setSolvedMs(timeMs);
      if (!user || !puzzle) return;
      setSaveMsg("Saving…");
      api
        .savePuzzle({ seed: puzzle.seed, difficulty: puzzle.difficulty, grid, timeMs, mistakes })
        .then(() => setSaveMsg("Saved to your profile."))
        .catch((e: Error) => setSaveMsg(`Not saved: ${e.message}`));
    },
    [user, puzzle],
  );

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

      {puzzle && <CrossMathBoard key={puzzle.seed} puzzle={puzzle} onSolved={onSolved} />}

      {solvedMs !== null ? (
        <div aria-live="polite">
          <h2 className="section">Solved in {formatTime(solvedMs)}.</h2>
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
        puzzle && (
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => newPuzzle()}>
              New puzzle
            </button>
          </div>
        )
      )}
    </section>
  );
}
