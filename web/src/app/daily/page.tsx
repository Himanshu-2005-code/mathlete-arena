"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnyPublicPuzzle,
  DAILY_EXTRA_KINDS,
  type DailyAnswer,
  type DailyInfo,
  type DailyResult,
  type PuzzleKind,
  pointsFor,
  puzzleInfo,
  sequenceQuestion,
} from "@matik/shared";
import { formatTime } from "@/components/CrossMathBoard";
import { PuzzlePlayer, type PuzzleSolved } from "@/components/PuzzlePlayer";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { playCorrect } from "@/lib/sound";

/** The leaderboard tab for each daily game (cross-math was the first, so it's "puzzle"). */
type Board = "sprint" | "puzzle" | "kenken" | "sudoku" | "maze" | "hectoc" | "make24";
const boardOf = (kind: PuzzleKind): Board => (kind === "crossmath" ? "puzzle" : kind);

function Placing({ result, unit }: { result: DailyResult; unit: Board }) {
  return (
    <p className="notice">
      {unit === "sprint" ? (
        <>
          <strong>{result.score} points</strong> from {result.correct} answers.
        </>
      ) : (
        <>
          Solved in <strong>{formatTime(result.timeMs)}</strong>.
        </>
      )}{" "}
      You're <strong>#{result.rank}</strong> of {result.of} today.{" "}
      <Link href={`/leaderboard?kind=daily-${unit}`}>See the leaderboard</Link>
    </p>
  );
}

type Streak = { current: number; best: number };

function DailySprint({ info, onDone }: { info: DailyInfo; onDone: (r: DailyResult | null, s?: Streak) => void }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [score, setScore] = useState(0);
  const [remaining, setRemaining] = useState(info.sprintSeconds * 1000);
  const [msg, setMsg] = useState("");
  const answers = useRef<DailyAnswer[]>([]);
  const endsAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = sequenceQuestion(info.sprintSeed, index);

  useEffect(() => {
    if (phase !== "playing") return;
    inputRef.current?.focus();
    const id = setInterval(() => {
      const left = endsAt.current - performance.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) setPhase("done");
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [index, phase]);

  useEffect(() => {
    if (phase !== "done") return;
    if (!user) {
      setMsg("");
      onDone(null);
      return;
    }
    setMsg("Saving…");
    api
      .saveDailySprint({ answers: answers.current })
      .then(({ firstAttempt, result, streak }) => {
        setMsg(firstAttempt ? "" : "Only your first run today counts, so this one wasn't recorded.");
        onDone(result, streak);
      })
      .catch((e: Error) => setMsg(`Not saved: ${e.message}`));
  }, [phase, user, onDone]);

  const start = () => {
    answers.current = [];
    setIndex(0);
    setScore(0);
    setValue("");
    endsAt.current = performance.now() + info.sprintSeconds * 1000;
    setPhase("playing");
  };

  const onChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 6);
    setValue(clean);
    if (clean === "" || Number(clean) !== q.answer) return;
    playCorrect();
    answers.current.push({ index, value: q.answer });
    setScore((s) => s + pointsFor(q));
    setIndex((i) => i + 1);
    setValue("");
  };

  // Enter skips the question; it counts as no points.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    answers.current.push({ index, value: null });
    setIndex((i) => i + 1);
    setValue("");
  };

  if (phase === "ready") {
    return (
      <div className="actions">
        <button type="button" className="btn" onClick={start}>
          Start today's sprint
        </button>
      </div>
    );
  }

  if (phase === "playing") {
    return (
      <div>
        <div className="sprint-bar">
          <span>
            <span className={`num${remaining <= 5000 ? " low" : ""}`}>{Math.ceil(remaining / 1000)}</span>seconds left
          </span>
          <span>
            <span className="num">{score}</span>points
          </span>
        </div>
        <div className="timer-track" aria-hidden>
          <div className="timer-fill" style={{ transform: `scaleX(${remaining / (info.sprintSeconds * 1000)})` }} />
        </div>
        <div className="hero-q play-q">
          <span>{q.text}</span>
          <span className="eq">=</span>
          <input
            ref={inputRef}
            className="hero-input"
            style={{ width: `${Math.max(2, String(q.answer).length) + 0.6}ch` }}
            inputMode="numeric"
            autoComplete="off"
            aria-label={`Answer to ${q.text}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <p className="hint">Enter skips a question. Later questions are harder and worth more.</p>
      </div>
    );
  }

  return (
    <div aria-live="polite">
      <p className="notice">
        Time. You scored <strong>{score} points</strong>.
      </p>
      {msg && <p className="notice">{msg}</p>}
      {!user && (
        <p className="notice">
          <Link href="/auth">Sign in</Link> to get on today's leaderboard.
        </p>
      )}
    </div>
  );
}

/** One of today's puzzles, saved to its own leaderboard. */
function DailyPuzzle({
  p,
  onSaved,
}: {
  p: AnyPublicPuzzle;
  onSaved: (kind: PuzzleKind, r: DailyResult, s: Streak) => void;
}) {
  const { user } = useAuth();
  const [solvedMs, setSolvedMs] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const onSolved = useCallback(
    ({ answer, timeMs }: PuzzleSolved) => {
      setSolvedMs(timeMs);
      if (!user) return;
      setMsg("Saving…");
      api
        .saveDailyPuzzle({ kind: p.kind, ...answer, timeMs })
        .then(({ firstAttempt, result, streak }) => {
          setMsg(firstAttempt ? "" : "Only your first solve today counts.");
          onSaved(p.kind, result, streak);
        })
        .catch((e: Error) => setMsg(`Not saved: ${e.message}`));
    },
    [user, p.kind, onSaved],
  );

  return (
    <>
      <p className="muted">{puzzleInfo(p.kind).rules}</p>
      <PuzzlePlayer p={p} onSolved={onSolved} />
      {solvedMs !== null && (
        <div aria-live="polite">
          <p className="notice">
            Solved in <strong>{formatTime(solvedMs)}</strong>.
          </p>
          {msg && <p className="notice">{msg}</p>}
          {!user && (
            <p className="notice">
              <Link href="/auth">Sign in</Link> to get on today's leaderboard.
            </p>
          )}
        </div>
      )}
    </>
  );
}

type Slot = "sprint" | PuzzleKind;

export default function DailyPage() {
  const { user, ready } = useAuth();
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Partial<Record<Slot, DailyResult | null>>>({});
  const [streak, setStreak] = useState<Streak | null>(null);
  const [open, setOpen] = useState<Slot | null>(null);

  useEffect(() => {
    if (!ready) return;
    api
      .daily()
      .then((d) => {
        setInfo(d);
        setResults({
          sprint: d.mine.sprint,
          crossmath: d.mine.puzzle,
          ...Object.fromEntries(DAILY_EXTRA_KINDS.map((k) => [k, d.extra[k].mine])),
        });
        setStreak(d.streak);
      })
      .catch((e: Error) => setError(e.message));
  }, [ready, user]);

  const onSprintDone = useCallback((r: DailyResult | null, st?: Streak) => {
    if (r) setResults((x) => ({ ...x, sprint: r }));
    if (st) setStreak(st);
  }, []);

  const onPuzzleSaved = useCallback((kind: PuzzleKind, r: DailyResult, st: Streak) => {
    setResults((x) => ({ ...x, [kind]: r }));
    setStreak(st);
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!info) return <p className="notice">Loading today's challenge…</p>;

  const date = new Date(`${info.day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const puzzles = {
    crossmath: { kind: "crossmath", puzzle: info.puzzle },
    kenken: info.extra.kenken.puzzle,
    sudoku: info.extra.sudoku.puzzle,
    maze: info.extra.maze.puzzle,
    hectoc: info.extra.hectoc.puzzle,
  } as Record<PuzzleKind, AnyPublicPuzzle>;

  const slots: { id: Slot; title: string; about: string }[] = [
    { id: "sprint", title: "Sprint", about: "One minute of mixed questions that get harder as you go. Most points wins." },
    ...(["crossmath", "kenken", "sudoku", "maze", "hectoc"] as PuzzleKind[]).map((k) => ({
      id: k,
      title: puzzleInfo(k).label,
      about: `${puzzleInfo(k).difficulties.find((d) => d.id === puzzles[k].puzzle.difficulty)?.label}. Fastest solve wins.`,
    })),
  ];
  const done = slots.filter((s) => results[s.id]).length;

  return (
    <section>
      <h1>Daily challenge</h1>
      <p className="lede">
        {date}. Six games, the same for everyone today, and your first try at each is the one that counts. Play any one
        to keep your streak. A new set starts at midnight.
      </p>
      {streak && (
        <p className="streak">
          {streak.current > 0 ? (
            <>
              <span className="num">{streak.current}</span> {streak.current === 1 ? "day" : "days"} in a row
              {streak.best > streak.current && <span className="muted">, best {streak.best}</span>}
            </>
          ) : (
            <span className="muted">
              Play today to start a streak{streak.best > 0 ? ` (your best is ${streak.best} days)` : ""}.
            </span>
          )}
        </p>
      )}
      {user && (
        <p className="muted">
          {done} of {slots.length} played today.
        </p>
      )}

      <ul className="entries daily-list">
        {slots.map((slot) => {
          const result = results[slot.id] ?? null;
          const isOpen = open === slot.id;
          return (
            <li key={slot.id} className={`entry${isOpen ? " open" : ""}`}>
              <div>
                <h3>
                  {result && <span className="done-mark" aria-label="Played">✓ </span>}
                  {slot.title}
                </h3>
                {result ? (
                  <Placing result={result} unit={slot.id === "sprint" ? "sprint" : boardOf(slot.id)} />
                ) : (
                  <p>{slot.about}</p>
                )}
              </div>
              {!result && (
                <button
                  type="button"
                  className={`btn${isOpen ? " ghost" : ""}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : slot.id)}
                >
                  {isOpen ? "Close" : "Play"}
                </button>
              )}
              {isOpen && !result && (
                <div className="entry-body">
                  {slot.id === "sprint" ? (
                    <DailySprint info={info} onDone={onSprintDone} />
                  ) : (
                    <DailyPuzzle p={puzzles[slot.id]} onSaved={onPuzzleSaved} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
