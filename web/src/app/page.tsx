"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Question, createRng, generateQuestion, randomSeed } from "@matik/shared";
import { playCorrect } from "@/lib/sound";

export default function Home() {
  const rng = useRef(createRng(randomSeed()));
  const [q, setQ] = useState<Question | null>(null);
  const [value, setValue] = useState("");
  const [solved, setSolved] = useState(0);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const shownAt = useRef(0);

  const next = () => {
    setQ(generateQuestion(rng.current, "mul", 3));
    setValue("");
    shownAt.current = performance.now();
  };

  // Generated after mount so the server render and the client agree.
  useEffect(next, []);

  const onChange = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 4);
    setValue(clean);
    if (q && Number(clean) === q.answer) {
      playCorrect();
      setLastMs(performance.now() - shownAt.current);
      setSolved((n) => n + 1);
      setTimeout(next, 350);
    }
  };

  const right = q !== null && value !== "" && Number(value) === q.answer;

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="sr-only">
          Matik: speed math
        </h1>
        <div className="hero-q" aria-live="polite">
          {q ? (
            <>
              <span>{q.a}</span>
              <span>×</span>
              <span>{q.b}</span>
              <span className="eq">=</span>
              <input
                className={`hero-input${right ? " right" : ""}`}
                style={{ width: `${String(q.answer).length + 0.6}ch` }}
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Answer to ${q.a} times ${q.b}`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoFocus
              />
            </>
          ) : (
            <span aria-hidden>&nbsp;</span>
          )}
        </div>
        <p className="hero-note">
          {solved === 0 ? (
            "Type the answer. It moves on the moment you're right."
          ) : (
            <>
              <strong>{solved} solved</strong>, the last in {((lastMs ?? 0) / 1000).toFixed(1)}s. A sprint is a minute
              of these, getting harder as you get faster.
            </>
          )}
        </p>
        <div className="actions">
          <Link href="/duel" className="btn">
            Find a duel
          </Link>
          <Link href="/practice" className="btn ghost">
            Practice first
          </Link>
        </div>
      </section>

      <ul className="entries">
        <li className="entry">
          <div>
            <h3>Practice sprints</h3>
            <p>
              30, 60 or 120 seconds of arithmetic. Pick an operation and a level, or let the difficulty follow your pace.
            </p>
          </div>
          <Link href="/practice" className="btn ghost">
            Practice
          </Link>
        </li>
        <li className="entry">
          <div>
            <h3>Puzzles</h3>
            <p>
              Cross-math, KenKen, Sudoku, Killer Sudoku, Futoshiki, Math Maze, Hectoc (make 100 from six digits in order)
              and Make 24.
            </p>
          </div>
          <Link href="/puzzles" className="btn ghost">
            Puzzles
          </Link>
        </li>
        <li className="entry">
          <div>
            <h3>Duels</h3>
            <p>
              Race another player through the same questions for a minute. Find a match near your rating or send a
              friend a code. Every result moves your rating.
            </p>
          </div>
          <Link href="/duel" className="btn ghost">
            Duel
          </Link>
        </li>
        <li className="entry">
          <div>
            <h3>Daily challenge</h3>
            <p>A sprint and five puzzles, the same for everyone, with fresh leaderboards and your streak each day.</p>
          </div>
          <Link href="/daily" className="btn ghost">
            Today's challenge
          </Link>
        </li>
        <li className="entry">
          <div>
            <h3>Arcade</h3>
            <p>
              Flash Anzan, Number Memory, and three 60-second blitzes: True or False, Bigger or Smaller, and Missing
              Sign.
            </p>
          </div>
          <Link href="/arcade" className="btn ghost">
            Arcade
          </Link>
        </li>
      </ul>
    </>
  );
}
