"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdaptiveDifficulty,
  PRACTICE_MODES,
  type PracticeMode,
  type Question,
  SPRINT_SECONDS,
  type SprintSeconds,
  createRng,
  generateQuestion,
  pointsFor,
  randomSeed,
} from "@mathlete/shared";
import { Choices } from "@/components/Choices";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { playCorrect, playWrong } from "@/lib/sound";

type Phase = "setup" | "countdown" | "playing" | "done";

interface Tally {
  score: number;
  correct: number;
  attempts: number;
  maxLevel: number;
  totalMs: number;
}

const emptyTally = (level: number): Tally => ({ score: 0, correct: 0, attempts: 0, maxLevel: level, totalMs: 0 });

const SETTINGS_KEY = "mathlete.practice";

export default function PracticePage() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<PracticeMode>("mixed");
  const [seconds, setSeconds] = useState<SprintSeconds>(60);
  const [adaptive, setAdaptive] = useState(true);
  const [fixedLevel, setFixedLevel] = useState(3);

  // Remember the last settings in this browser. Read after mount so the
  // server render matches; anything unexpected falls back to the defaults.
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (saved && typeof saved === "object") {
        if (PRACTICE_MODES.some((m) => m.id === saved.mode)) setMode(saved.mode);
        if ((SPRINT_SECONDS as readonly number[]).includes(saved.seconds)) setSeconds(saved.seconds);
        if (typeof saved.adaptive === "boolean") setAdaptive(saved.adaptive);
        if (Number.isInteger(saved.fixedLevel) && saved.fixedLevel >= 1 && saved.fixedLevel <= 10)
          setFixedLevel(saved.fixedLevel);
      }
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, seconds, adaptive, fixedLevel }));
    } catch {
      /* ignore */
    }
  }, [mode, seconds, adaptive, fixedLevel]);

  const [question, setQuestion] = useState<Question | null>(null);
  const [value, setValue] = useState("");
  const [remainingMs, setRemainingMs] = useState(0);
  const [shake, setShake] = useState(false);
  const [tally, setTally] = useState<Tally>(emptyTally(1));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [best, setBest] = useState<{ previous: number | null; isNew: boolean } | null>(null);

  // Every question shown this sprint, for the review afterwards.
  const [log, setLog] = useState<{ text: string; answer: number; ms: number; missed: boolean }[]>([]);
  const misses = useRef(0);
  const rng = useRef(createRng(1));
  const difficulty = useRef(new AdaptiveDifficulty(1));
  const shownAt = useRef(0);
  const endsAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentLevel = () => (adaptive ? difficulty.current.level : fixedLevel);

  const nextQuestion = useCallback(() => {
    const level = adaptive ? difficulty.current.level : fixedLevel;
    setQuestion(generateQuestion(rng.current, mode, level));
    setValue("");
    misses.current = 0;
    shownAt.current = performance.now();
  }, [adaptive, fixedLevel, mode]);

  const start = () => {
    rng.current = createRng(randomSeed());
    difficulty.current = new AdaptiveDifficulty(adaptive ? 1 : fixedLevel);
    setTally(emptyTally(adaptive ? 1 : fixedLevel));
    setLog([]);
    setBest(null);
    setSaveState("idle");
    setSaveError("");
    setCount(3);
    setPhase("countdown");
  };

  // 3, 2, 1, then the clock starts with the first question.
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      endsAt.current = performance.now() + seconds * 1000;
      setRemainingMs(seconds * 1000);
      setPhase("playing");
      nextQuestion();
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(id);
  }, [phase, count, seconds, nextQuestion]);

  // On the results screen, Enter starts another sprint with the same settings,
  // unless focus is on a button or link (Enter already activates those).
  // The first second is ignored, so an answer typed as time ran out doesn't
  // immediately start the next sprint.
  useEffect(() => {
    if (phase !== "done") return;
    const readyAt = performance.now() + 1000;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (e.key !== "Enter" || e.repeat || performance.now() < readyAt) return;
      if (el && /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      e.preventDefault();
      start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Countdown.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const left = endsAt.current - performance.now();
      if (left <= 0) {
        setRemainingMs(0);
        setPhase("done");
      } else {
        setRemainingMs(left);
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [phase, question]);

  const onChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 6);
    setValue(clean);
    if (!question || clean === "" || Number(clean) !== question.answer) return;
    playCorrect();

    const ms = performance.now() - shownAt.current;
    if (adaptive) difficulty.current.record(true, ms);
    setTally((t) => ({
      score: t.score + pointsFor(question),
      correct: t.correct + 1,
      attempts: t.attempts + 1,
      maxLevel: Math.max(t.maxLevel, question.level, currentLevel()),
      totalMs: t.totalMs + ms,
    }));
    setLog((l) => [...l, { text: question.text, answer: question.answer, ms, missed: misses.current > 0 }]);
    nextQuestion();
  };

  // Stop without saving: back to the settings.
  const quit = () => setPhase("setup");

  // Enter with a wrong answer counts as a miss.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      quit();
      return;
    }
    if (e.key !== "Enter" || !question || value === "") return;
    if (Number(value) === question.answer) return;
    if (adaptive) difficulty.current.record(false, performance.now() - shownAt.current);
    setTally((t) => ({ ...t, attempts: t.attempts + 1 }));
    misses.current += 1;
    if (adaptive)
      setLog((l) => [
        ...l,
        { text: question.text, answer: question.answer, ms: performance.now() - shownAt.current, missed: true },
      ]);
    setValue("");
    setShake(true);
    playWrong();
    setTimeout(() => setShake(false), 300);
    if (adaptive) nextQuestion();
  };

  // Save the finished sprint once.
  useEffect(() => {
    if (phase !== "done" || !user || saveState !== "idle") return;
    setSaveState("saving");
    api
      .savePractice({
        mode,
        adaptive,
        durationSec: seconds,
        score: tally.score,
        correct: tally.correct,
        attempts: tally.attempts,
        maxLevel: tally.maxLevel,
        avgMs: tally.correct ? Math.round(tally.totalMs / tally.correct) : 0,
      })
      .then((r) => {
        setBest({ previous: r.previousBest, isNew: r.newBest });
        setSaveState("saved");
      })
      .catch((err: Error) => {
        setSaveState("error");
        setSaveError(err.message);
      });
  }, [phase, user, saveState, mode, adaptive, seconds, tally]);

  if (phase === "setup") {
    return (
      <section>
        <h1 data-kicker="Mode 01 // training">Practice sprint</h1>
        <p className="lede">
          Answer as many as you can before time runs out. Each question moves on as soon as you type the right answer;
          press Enter to give up on a wrong one.
        </p>

        <Choices
          legend="Operation"
          name="mode"
          value={mode}
          onChange={setMode}
          options={PRACTICE_MODES.map((m) => ({ value: m.id, label: `${m.label} ${m.symbol}` }))}
        />
        <Choices
          legend="Length"
          name="seconds"
          value={seconds}
          onChange={setSeconds}
          options={SPRINT_SECONDS.map((s) => ({ value: s, label: s === 120 ? "2 minutes" : `${s} seconds` }))}
        />
        <Choices
          legend="Difficulty"
          name="difficulty"
          value={adaptive ? "adaptive" : "fixed"}
          onChange={(v) => setAdaptive(v === "adaptive")}
          options={[
            { value: "adaptive", label: "Follow my pace" },
            { value: "fixed", label: "Fixed level" },
          ]}
        />
        {!adaptive && (
          <div className="field">
            <label htmlFor="level">Level {fixedLevel} of 10</label>
            <input
              id="level"
              type="range"
              min={1}
              max={10}
              value={fixedLevel}
              onChange={(e) => setFixedLevel(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn" onClick={start}>
            Start sprint
          </button>
        </div>
        {!user && (
          <p className="notice">
            <Link href="/auth">Sign in</Link> to keep your scores.
          </p>
        )}
      </section>
    );
  }

  if (phase === "countdown") {
    return (
      <section className="results" aria-label="Sprint about to start">
        <p className="hero-q play-q countdown-big" aria-live="assertive">
          <span className="num">{count}</span>
        </p>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => setPhase("setup")}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  if (phase === "playing") {
    const secs = Math.ceil(remainingMs / 1000);
    return (
      <section aria-label="Sprint in progress">
        <div className="sprint-bar">
          <span>
            <span className={`num${secs <= 5 ? " low" : ""}`}>{secs}</span>seconds left
          </span>
          <span>
            <span className="num">{tally.score}</span>points
          </span>
          <span>
            <span className="num">{currentLevel()}</span>level
          </span>
        </div>
        <div className="timer-track" aria-hidden>
          <div className="timer-fill" style={{ transform: `scaleX(${remainingMs / (seconds * 1000)})` }} />
        </div>

        {question && (
          <div className={`hero-q play-q${shake ? " shake" : ""}`}>
            <span>{question.text}</span>
            <span className="eq">=</span>
            <input
              ref={inputRef}
              className="hero-input"
              style={{ width: `${Math.max(2, String(question.answer).length) + 0.6}ch` }}
              inputMode="numeric"
              autoComplete="off"
              aria-label={`Answer to ${question.text}`}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
        )}
        <p className="hint">
          Enter skips a wrong answer and counts it as a miss. Esc stops the sprint without saving.
        </p>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={quit}>
            Stop sprint
          </button>
        </div>
      </section>
    );
  }

  const accuracy = tally.attempts ? Math.round((tally.correct / tally.attempts) * 100) : 0;
  const avg = tally.correct ? (tally.totalMs / tally.correct / 1000).toFixed(2) : "–";
  // Missed questions first, then the slowest right answers.
  const review = [...log]
    .sort((a, b) => Number(b.missed) - Number(a.missed) || b.ms - a.ms)
    .slice(0, 5);

  return (
    <section className="results">
      <h1 data-kicker="Sprint // complete">Time.</h1>
      <div className="result-figures">
        <div className="figure">
          <span className="num">{tally.score}</span>
          <span className="label">points</span>
        </div>
        <div className="figure">
          <span className="num">{tally.correct}</span>
          <span className="label">correct</span>
        </div>
        <div className="figure">
          <span className="num">{accuracy}%</span>
          <span className="label">accuracy</span>
        </div>
        <div className="figure">
          <span className="num">{avg}s</span>
          <span className="label">per answer</span>
        </div>
        <div className="figure">
          <span className="num">{tally.maxLevel}</span>
          <span className="label">highest level</span>
        </div>
      </div>

      {review.length > 0 && (
        <div className="section">
          <h2>Worth another look</h2>
          <table className="ledger">
            <thead>
              <tr>
                <th>Question</th>
                <th className="r">Answer</th>
                <th className="r">Took</th>
              </tr>
            </thead>
            <tbody>
              {review.map((q, i) => (
                <tr key={i}>
                  <td className="num">{q.text}</td>
                  <td className="r num">{q.answer}</td>
                  <td className="r num">{q.missed ? "missed" : `${(q.ms / 1000).toFixed(1)}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {user ? (
        <p className="notice" aria-live="polite">
          {saveState === "saving" && "Saving your score…"}
          {saveState === "saved" &&
            (best?.isNew && best.previous !== null && tally.score > 0 ? (
              <strong className="new-best">
                New personal best, up from {best.previous}. Saved to your profile.
              </strong>
            ) : best && best.previous !== null ? (
              `Score saved. Your best at this setting is ${Math.max(best.previous, tally.score)}.`
            ) : (
              "Score saved to your profile."
            ))}
          {saveState === "error" && <span className="error">Score not saved: {saveError}</span>}
        </p>
      ) : (
        <p className="notice">
          <Link href="/auth">Sign in</Link> to keep scores like this one.
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn" onClick={start} title="Or press Enter">
          Go again
        </button>
        <button type="button" className="btn ghost" onClick={() => setPhase("setup")}>
          Change settings
        </button>
      </div>
    </section>
  );
}
