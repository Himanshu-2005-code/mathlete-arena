"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ARCADE_GAMES,
  type ArcadeGame,
  type ArcadeResult,
  BLITZ_PENALTY_SECONDS,
  BLITZ_SECONDS,
  type BlitzGame,
  type BlitzQuestion,
  blitzQuestion,
  isBlitz,
  FLASH_LEVELS,
  MEMORY_START,
  arcadeInfo,
  createRng,
  flashNumbers,
  memoryNumber,
  memoryShowMs,
  randomSeed,
} from "@mathlete/shared";
import { Choices } from "@/components/Choices";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { playCorrect, playWrong } from "@/lib/sound";

/** Saves a finished run and reports the player's best and place. */
function useRunSaver(game: ArcadeGame) {
  const { user } = useAuth();
  const [result, setResult] = useState<ArcadeResult | null>(null);
  const [msg, setMsg] = useState("");
  const save = useCallback(
    (score: number) => {
      setResult(null);
      if (!user) return setMsg("");
      setMsg("Saving…");
      api
        .saveArcade(game, score)
        .then((r) => {
          setResult(r);
          setMsg("");
        })
        .catch((e: Error) => setMsg(`Not saved: ${e.message}`));
    },
    [user, game],
  );
  const reset = () => {
    setResult(null);
    setMsg("");
  };
  return { user, result, msg, save, reset };
}

function RunSummary({
  score,
  unit,
  saver,
  onAgain,
}: {
  score: number;
  unit: string;
  saver: ReturnType<typeof useRunSaver>;
  onAgain: () => void;
}) {
  return (
    <div className="results" aria-live="polite">
      <div className="result-figures">
        <div className="figure">
          <span className="num">{score}</span>
          <span className="label">{unit}</span>
        </div>
        {saver.result && (
          <>
            <div className="figure">
              <span className="num">{saver.result.best}</span>
              <span className="label">{saver.result.newBest ? "new best" : "your best"}</span>
            </div>
            <div className="figure">
              <span className="num">#{saver.result.rank}</span>
              <span className="label">of {saver.result.of} players</span>
            </div>
          </>
        )}
      </div>
      {saver.msg && <p className="notice">{saver.msg}</p>}
      {!saver.user && (
        <p className="notice">
          <Link href="/auth">Sign in</Link> to keep your best and get on the leaderboard.
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={onAgain}>
          Play again
        </button>
      </div>
    </div>
  );
}

function FlashAnzan() {
  const saver = useRunSaver("flash");
  const [phase, setPhase] = useState<"ready" | "flash" | "answer" | "between" | "over">("ready");
  const [level, setLevel] = useState(0);
  const [numbers, setNumbers] = useState<number[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [score, setScore] = useState(0);
  const [lastSum, setLastSum] = useState<number | null>(null);
  const rng = useRef(createRng(randomSeed()));
  const inputRef = useRef<HTMLInputElement>(null);

  const runLevel = (i: number) => {
    const nums = flashNumbers(rng.current, FLASH_LEVELS[i]);
    setLevel(i);
    setNumbers(nums);
    setValue("");
    setPhase("flash");
  };

  // Show each number for most of its slot, then a short blank so repeats are visible.
  useEffect(() => {
    if (phase !== "flash") return;
    const { intervalMs } = FLASH_LEVELS[level];
    const timers: ReturnType<typeof setTimeout>[] = [];
    numbers.forEach((n, i) => {
      timers.push(setTimeout(() => setShown(n), 600 + i * intervalMs));
      timers.push(setTimeout(() => setShown(null), 600 + i * intervalMs + intervalMs * 0.75));
    });
    timers.push(setTimeout(() => setPhase("answer"), 600 + numbers.length * intervalMs));
    return () => timers.forEach(clearTimeout);
  }, [phase, level, numbers]);

  useEffect(() => {
    if (phase === "answer") inputRef.current?.focus();
  }, [phase]);

  const check = () => {
    const sum = numbers.reduce((a, b) => a + b, 0);
    setLastSum(sum);
    if (Number(value) === sum) {
      playCorrect();
      const cleared = level + 1;
      setScore(cleared);
      if (cleared === FLASH_LEVELS.length) {
        setPhase("over");
        saver.save(cleared);
      } else setPhase("between");
    } else {
      playWrong();
      setPhase("over");
      saver.save(level);
    }
  };

  const restart = () => {
    saver.reset();
    setScore(0);
    setLastSum(null);
    runLevel(0);
  };

  const L = FLASH_LEVELS[level];

  if (phase === "ready") {
    return (
      <div className="actions">
        <button type="button" className="btn" onClick={restart}>
          Start at level 1
        </button>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <>
        <p className="lede">
          {score === FLASH_LEVELS.length
            ? "All ten levels cleared."
            : `The total was ${lastSum}. You cleared ${score} ${score === 1 ? "level" : "levels"}.`}
        </p>
        <RunSummary score={score} unit="levels cleared" saver={saver} onAgain={restart} />
      </>
    );
  }

  return (
    <div>
      <div className="sprint-bar">
        <span>
          Level <span className="num">{level + 1}</span>
        </span>
        <span className="muted">
          {L.count} numbers, {L.digits} {L.digits === 1 ? "digit" : "digits"}, {(L.intervalMs / 1000).toFixed(1)}s each
        </span>
      </div>
      {phase === "flash" && (
        <div className="flash-stage" aria-live="off">
          <span className="flash-num num">{shown ?? ""}</span>
        </div>
      )}
      {phase === "answer" && (
        <form
          className="hero-q play-q"
          onSubmit={(e) => {
            e.preventDefault();
            if (value) check();
          }}
        >
          <span className="eq">Total =</span>
          <input
            ref={inputRef}
            className="hero-input"
            style={{ width: "5ch" }}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Total of the numbers"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </form>
      )}
      {phase === "answer" && <p className="hint">Type the total and press Enter.</p>}
      {phase === "between" && (
        <div aria-live="polite">
          <p className="notice">
            Right, it was <strong>{lastSum}</strong>. Level {level + 2} next.
          </p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => runLevel(level + 1)} autoFocus>
              Next level
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberMemory() {
  const saver = useRunSaver("memory");
  const [phase, setPhase] = useState<"ready" | "show" | "answer" | "between" | "over">("ready");
  const [length, setLength] = useState(MEMORY_START);
  const [target, setTarget] = useState("");
  const [value, setValue] = useState("");
  const [leftMs, setLeftMs] = useState(0);
  const rng = useRef(createRng(randomSeed()));
  const inputRef = useRef<HTMLInputElement>(null);

  const round = (len: number) => {
    setLength(len);
    setTarget(memoryNumber(rng.current, len));
    setValue("");
    setPhase("show");
  };

  useEffect(() => {
    if (phase !== "show") return;
    const total = memoryShowMs(length);
    const start = performance.now();
    const id = setInterval(() => {
      const left = total - (performance.now() - start);
      setLeftMs(Math.max(0, left));
      if (left <= 0) setPhase("answer");
    }, 50);
    return () => clearInterval(id);
  }, [phase, length]);

  useEffect(() => {
    if (phase === "answer") inputRef.current?.focus();
  }, [phase]);

  const check = () => {
    if (value === target) {
      playCorrect();
      if (length >= arcadeInfo("memory").max) {
        setPhase("over");
        saver.save(length);
      } else setPhase("between");
    } else {
      playWrong();
      setPhase("over");
      saver.save(length - 1 >= MEMORY_START ? length - 1 : 0);
    }
  };

  const restart = () => {
    saver.reset();
    round(MEMORY_START);
  };

  if (phase === "ready") {
    return (
      <div className="actions">
        <button type="button" className="btn" onClick={restart}>
          Start with {MEMORY_START} digits
        </button>
      </div>
    );
  }

  if (phase === "over") {
    const score = value === target ? length : length - 1 >= MEMORY_START ? length - 1 : 0;
    return (
      <>
        <p className="lede">
          The number was <strong className="num">{target}</strong>
          {value !== target && (
            <>
              ; you typed <strong className="num">{value || "nothing"}</strong>
            </>
          )}
          .
        </p>
        <RunSummary score={score} unit="digits remembered" saver={saver} onAgain={restart} />
      </>
    );
  }

  return (
    <div>
      <div className="sprint-bar">
        <span>
          <span className="num">{length}</span>digits
        </span>
      </div>
      {phase === "show" && (
        <>
          <div className="flash-stage">
            <span className="flash-num num memory-num">{target}</span>
          </div>
          <div className="timer-track" aria-hidden>
            <div className="timer-fill" style={{ transform: `scaleX(${leftMs / memoryShowMs(length)})` }} />
          </div>
        </>
      )}
      {phase === "answer" && (
        <form
          className="memory-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (value) check();
          }}
        >
          <label htmlFor="memory-answer">What was the number?</label>
          <input
            id="memory-answer"
            ref={inputRef}
            className="text-input memory-input num"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 45))}
          />
          <div className="actions">
            <button type="submit" className="btn" disabled={!value}>
              Check
            </button>
          </div>
        </form>
      )}
      {phase === "between" && (
        <div aria-live="polite">
          <p className="notice">Right. Next one is {length + 1} digits.</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => round(length + 1)} autoFocus>
              Next number
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const KEYS: Record<BlitzGame, string[][]> = {
  truefalse: [["ArrowLeft", "t", "T"], ["ArrowRight", "f", "F"]],
  compare: [["ArrowLeft"], ["ArrowRight"]],
  sign: [["1"], ["2"], ["3"], ["4"]],
};
const KEY_HINTS: Record<BlitzGame, string[]> = {
  truefalse: ["←", "→"],
  compare: ["←", "→"],
  sign: ["1", "2", "3", "4"],
};

/** Sixty seconds of quick choices; a wrong one costs time. */
function Blitz({ game }: { game: BlitzGame }) {
  const saver = useRunSaver(game);
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [q, setQ] = useState<BlitzQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [left, setLeft] = useState(BLITZ_SECONDS * 1000);
  const [shake, setShake] = useState(false);
  const rng = useRef(createRng(randomSeed()));
  const endsAt = useRef(0);
  const scoreRef = useRef(0);

  const start = () => {
    saver.reset();
    rng.current = createRng(randomSeed());
    scoreRef.current = 0;
    setScore(0);
    setMisses(0);
    endsAt.current = performance.now() + BLITZ_SECONDS * 1000;
    setLeft(BLITZ_SECONDS * 1000);
    setQ(blitzQuestion(game, rng.current, 0));
    setPhase("playing");
  };

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const l = endsAt.current - performance.now();
      setLeft(Math.max(0, l));
      if (l <= 0) {
        setPhase("over");
        saver.save(scoreRef.current);
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const choose = useCallback(
    (i: number) => {
      if (phase !== "playing" || !q) return;
      if (i === q.answer) {
        playCorrect();
        scoreRef.current += 1;
        setScore(scoreRef.current);
      } else {
        playWrong();
        setMisses((m) => m + 1);
        endsAt.current -= BLITZ_PENALTY_SECONDS * 1000;
        setShake(true);
        setTimeout(() => setShake(false), 300);
      }
      // Every five right answers, the numbers get bigger.
      setQ(blitzQuestion(game, rng.current, Math.floor(scoreRef.current / 5)));
    },
    [phase, q, game],
  );

  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      const i = KEYS[game].findIndex((keys) => keys.includes(e.key));
      if (i >= 0) {
        e.preventDefault();
        choose(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, game, choose]);

  if (phase === "ready") {
    return (
      <div className="actions">
        <button type="button" className="btn" onClick={start}>
          Start 60 seconds
        </button>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <>
        <p className="lede">
          Time. {score} right{misses > 0 ? `, ${misses} wrong` : ""}.
        </p>
        <RunSummary score={score} unit="right answers" saver={saver} onAgain={start} />
      </>
    );
  }

  const secs = Math.ceil(left / 1000);
  return (
    <div>
      <div className="sprint-bar">
        <span>
          <span className={`num${secs <= 5 ? " low" : ""}`}>{secs}</span>seconds left
        </span>
        <span>
          <span className="num">{score}</span>right
        </span>
        {misses > 0 && <span className="penalty">−{misses * BLITZ_PENALTY_SECONDS}s</span>}
      </div>
      <div className="timer-track" aria-hidden>
        <div className="timer-fill" style={{ transform: `scaleX(${left / (BLITZ_SECONDS * 1000)})` }} />
      </div>
      {q && (
        <>
          <p className={`blitz-prompt${game === "compare" ? " small" : ""}`} aria-live="polite">
            {q.prompt}
          </p>
          <div className={`blitz-choices${shake ? " wrong" : ""}`}>
            {q.choices.map((choice, i) => (
              <button key={`${q.prompt}-${i}`} type="button" className="blitz-choice" onClick={() => choose(i)}>
                {choice}
                <kbd>{KEY_HINTS[game][i]}</kbd>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ArcadePage() {
  const [game, setGame] = useState<ArcadeGame>("flash");

  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("game");
    if (g && ARCADE_GAMES.some((x) => x.id === g)) setGame(g as ArcadeGame);
  }, []);

  return (
    <section>
      <h1 data-kicker="Mode 05 // arcade">Arcade</h1>
      <Choices
        legend="Game"
        name="arcade-game"
        value={game}
        onChange={setGame}
        options={ARCADE_GAMES.map((g) => ({ value: g.id, label: g.label }))}
      />
      <p className="lede">{arcadeInfo(game).rules}</p>
      {game === "flash" ? (
        <FlashAnzan key="flash" />
      ) : game === "memory" ? (
        <NumberMemory key="memory" />
      ) : isBlitz(game) ? (
        <Blitz key={game} game={game} />
      ) : null}
    </section>
  );
}
