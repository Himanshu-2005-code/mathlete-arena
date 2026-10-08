"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Question, createRng, generateQuestion, randomSeed } from "@matik/shared";

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
          <Link href="/practice" className="btn">
            Start a sprint
          </Link>
          <Link href="/puzzles" className="btn ghost">
            Solve a puzzle
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
            <h3>Cross-math puzzles</h3>
            <p>Fill the gaps so every row and column adds up. Multiplication and division come first.</p>
          </div>
          <Link href="/puzzles" className="btn ghost">
            Puzzles
          </Link>
        </li>
        <li className="entry soon">
          <div>
            <h3>Duels</h3>
            <p>Race another player on the same questions, live, with a rating that moves after every match. Coming soon.</p>
          </div>
        </li>
      </ul>
    </>
  );
}
