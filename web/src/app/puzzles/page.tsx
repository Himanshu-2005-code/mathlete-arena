"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  type AnyPublicPuzzle,
  PUZZLE_KINDS,
  type PuzzleKind,
  generatePublicPuzzle,
  puzzleInfo,
  randomSeed,
} from "@mathlete/shared";
import { Choices } from "@/components/Choices";
import { formatTime } from "@/components/CrossMathBoard";
import { PuzzlePlayer, type PuzzleSolved } from "@/components/PuzzlePlayer";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CHOICE_KEY = "mathlete.puzzle";

export default function PuzzlesPage() {
  const { user } = useAuth();
  const [kind, setKind] = useState<PuzzleKind>("crossmath");
  const [difficulty, setDifficulty] = useState("easy");
  const [puzzle, setPuzzle] = useState<AnyPublicPuzzle | null>(null);
  const [solvedMs, setSolvedMs] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  const newPuzzle = (k: PuzzleKind = kind, d: string = difficulty) => {
    setPuzzle(generatePublicPuzzle(k, randomSeed(), d));
    try {
      localStorage.setItem(CHOICE_KEY, JSON.stringify({ kind: k, difficulty: d }));
    } catch {
      /* ignore */
    }
    setSolvedMs(null);
    setSaveMsg("");
  };

  // Pick the game from a link like /puzzles?kind=kenken, else the last one
  // played in this browser, then deal the first puzzle.
  useEffect(() => {
    const isKind = (k: unknown): k is PuzzleKind => PUZZLE_KINDS.some((x) => x.id === k);
    let saved: { kind?: unknown; difficulty?: unknown } = {};
    try {
      saved = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "{}") ?? {};
    } catch {
      /* ignore */
    }
    const fromUrl = new URLSearchParams(window.location.search).get("kind");
    const start: PuzzleKind = isKind(fromUrl) ? fromUrl : isKind(saved.kind) ? saved.kind : "crossmath";
    const levels = puzzleInfo(start).difficulties;
    const d =
      !isKind(fromUrl) && saved.kind === start && levels.some((x) => x.id === saved.difficulty)
        ? (saved.difficulty as string)
        : levels[0].id;
    setKind(start);
    setDifficulty(d);
    newPuzzle(start, d);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSolved = useCallback(
    ({ answer, timeMs, mistakes }: PuzzleSolved) => {
      setSolvedMs(timeMs);
      if (!user || !puzzle) return;
      setSaveMsg("Saving…");
      api
        .savePuzzle({ kind: puzzle.kind, seed: puzzle.puzzle.seed, difficulty: puzzle.puzzle.difficulty, ...answer, timeMs, mistakes })
        .then(() => setSaveMsg("Saved to your profile."))
        .catch((e: Error) => setSaveMsg(`Not saved: ${e.message}`));
    },
    [user, puzzle],
  );

  const info = puzzleInfo(kind);

  return (
    <section>
      <h1 data-kicker="Mode 02 // solo">Puzzles</h1>

      <Choices
        legend="Game"
        name="kind"
        value={kind}
        onChange={(k) => {
          const d = puzzleInfo(k).difficulties[0].id;
          setKind(k);
          setDifficulty(d);
          newPuzzle(k, d);
        }}
        options={PUZZLE_KINDS.map((k) => ({ value: k.id, label: k.label }))}
      />
      <p className="lede">{info.rules}</p>
      <Choices
        legend="Difficulty"
        name="difficulty"
        value={difficulty}
        onChange={(d) => {
          setDifficulty(d);
          newPuzzle(kind, d);
        }}
        options={info.difficulties.map((d) => ({ value: d.id, label: d.label }))}
      />

      {puzzle && <PuzzlePlayer p={puzzle} onSolved={onSolved} hints />}

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
