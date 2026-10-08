"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DailyAnswer, type DailyInfo, type DailyResult, pointsFor, sequenceQuestion } from "@matik/shared";
import { CrossMathBoard, type SolvedInfo, formatTime } from "@/components/CrossMathBoard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Placing({ result, unit }: { result: DailyResult; unit: "sprint" | "puzzle" }) {
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

function DailySprint({ info, onDone }: { info: DailyInfo; onDone: (r: DailyResult | null) => void }) {
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
      .then(({ firstAttempt, result }) => {
        setMsg(firstAttempt ? "" : "Only your first run today counts, so this one wasn't recorded.");
        onDone(result);
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

export default function DailyPage() {
  const { user, ready } = useAuth();
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [error, setError] = useState("");
  const [sprintResult, setSprintResult] = useState<DailyResult | null>(null);
  const [puzzleResult, setPuzzleResult] = useState<DailyResult | null>(null);
  const [puzzleMsg, setPuzzleMsg] = useState("");
  const [puzzleSolvedMs, setPuzzleSolvedMs] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    api
      .daily()
      .then((d) => {
        setInfo(d);
        setSprintResult(d.mine.sprint);
        setPuzzleResult(d.mine.puzzle);
      })
      .catch((e: Error) => setError(e.message));
  }, [ready, user]);

  const onSprintDone = useCallback((r: DailyResult | null) => {
    if (r) setSprintResult(r);
  }, []);

  const onPuzzleSolved = useCallback(
    ({ grid, timeMs }: SolvedInfo) => {
      setPuzzleSolvedMs(timeMs);
      if (!user) return;
      setPuzzleMsg("Saving…");
      api
        .saveDailyPuzzle({ grid, timeMs })
        .then(({ firstAttempt, result }) => {
          setPuzzleResult(result);
          setPuzzleMsg(firstAttempt ? "" : "Only your first solve today counts.");
        })
        .catch((e: Error) => setPuzzleMsg(`Not saved: ${e.message}`));
    },
    [user],
  );

  if (error) return <p className="error">{error}</p>;
  if (!info) return <p className="notice">Loading today's challenge…</p>;

  const date = new Date(`${info.day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <section>
      <h1>Daily challenge</h1>
      <p className="lede">
        {date}. Everyone gets the same sprint and the same puzzle today, and your first try is the one that counts. A new
        challenge starts at midnight.
      </p>

      <div className="section">
        <h2>Sprint</h2>
        <p className="muted">One minute of mixed questions that get harder as you go.</p>
        {sprintResult ? <Placing result={sprintResult} unit="sprint" /> : <DailySprint info={info} onDone={onSprintDone} />}
      </div>

      <div className="section">
        <h2>Puzzle</h2>
        <p className="muted">A medium cross-math grid. Fastest solve wins.</p>
        {puzzleResult ? (
          <>
            <Placing result={puzzleResult} unit="puzzle" />
            {puzzleMsg && <p className="notice">{puzzleMsg}</p>}
          </>
        ) : (
          <>
            <CrossMathBoard key={info.puzzle.seed} puzzle={info.puzzle} onSolved={onPuzzleSolved} />
            {puzzleSolvedMs !== null && (
              <div aria-live="polite">
                <p className="notice">
                  Solved in <strong>{formatTime(puzzleSolvedMs)}</strong>.
                </p>
                {puzzleMsg && <p className="notice">{puzzleMsg}</p>}
                {!user && (
                  <p className="notice">
                    <Link href="/auth">Sign in</Link> to get on today's leaderboard.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
