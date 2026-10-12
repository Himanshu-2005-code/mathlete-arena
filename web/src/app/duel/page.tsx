"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DuelEndReason,
  type DuelOutcome,
  type DuelPlayerInfo,
  type Question,
  sequenceQuestion,
} from "@matik/shared";
import { Tally } from "@/components/Tally";
import { useAuth } from "@/lib/auth";
import { type GameSocket, getSocket } from "@/lib/socket";

type Phase =
  | { kind: "lobby" }
  | { kind: "searching"; since: number }
  | { kind: "hosting"; code: string }
  | { kind: "live"; seed: number; startsAt: number; endsAt: number; you: DuelPlayerInfo; opponent: DuelPlayerInfo }
  | {
      kind: "over";
      outcome: DuelOutcome;
      reason: DuelEndReason;
      you: number;
      opponent: number;
      rating: number;
      ratingChange: number;
      opponentName: string;
    };

const HEADLINE: Record<DuelOutcome, string> = { win: "You won.", loss: "You lost.", draw: "Draw." };

export default function DuelPage() {
  const { user, ready, refresh } = useAuth();
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "lobby" });
  const [presence, setPresence] = useState({ online: 0, searching: 0, botAfterSeconds: 0 });
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Live duel state.
  const [index, setIndex] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [theirScore, setTheirScore] = useState(0);
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    if (!s) return;
    setSocket(s);
    setConnected(s.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setError("Can't reach the game server. Check that it's running.");
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.on("presence", setPresence);
    s.on("queue:joined", () => setPhase({ kind: "searching", since: Date.now() }));
    s.on("queue:left", () => setPhase({ kind: "lobby" }));
    s.on("challenge:created", ({ code }) => setPhase({ kind: "hosting", code }));
    s.on("challenge:error", ({ message }) => setError(message));
    s.on("duel:start", (d) => {
      setError("");
      setIndex(0);
      setMyScore(0);
      setTheirScore(0);
      setValue("");
      setPhase({ kind: "live", seed: d.seed, startsAt: d.startsAt, endsAt: d.endsAt, you: d.you, opponent: d.opponent });
    });
    s.on("duel:progress", (p) => {
      setMyScore(p.you);
      setTheirScore(p.opponent);
      setIndex((i) => Math.max(i, p.yourIndex));
    });
    s.on("duel:end", (e) => {
      const live = phaseRef.current;
      setPhase({ kind: "over", ...e, opponentName: live.kind === "live" ? live.opponent.username : "your opponent" });
      refresh().catch(() => {});
    });

    // A challenge link: /duel?code=ABC123 joins straight away.
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      const join = () => s.emit("challenge:join", { code });
      if (s.connected) join();
      else s.once("connect", join);
      window.history.replaceState(null, "", "/duel");
    }

    return () => {
      for (const ev of [
        "connect",
        "disconnect",
        "connect_error",
        "presence",
        "queue:joined",
        "queue:left",
        "challenge:created",
        "challenge:error",
        "duel:start",
        "duel:progress",
        "duel:end",
      ] as const)
        s.off(ev);
    };
  }, [user, refresh]);

  // Clock for countdowns and the duel timer.
  useEffect(() => {
    if (phase.kind !== "live" && phase.kind !== "searching") return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [phase.kind]);

  const live = phase.kind === "live" ? phase : null;
  const started = live !== null && now >= live.startsAt;
  const question: Question | null = live ? sequenceQuestion(live.seed, index) : null;

  useEffect(() => {
    if (started) inputRef.current?.focus();
  }, [started, index]);

  const onChange = useCallback(
    (raw: string) => {
      const clean = raw.replace(/\D/g, "").slice(0, 6);
      setValue(clean);
      if (!socket || !live || !question || clean === "" || Number(clean) !== question.answer) return;
      // Move on at once; the server confirms and keeps the real score.
      socket.emit("duel:answer", { index, value: question.answer });
      setIndex((i) => i + 1);
      setValue("");
    },
    [socket, live, question, index],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || value === "") return;
    setValue("");
    setShake(true);
    setTimeout(() => setShake(false), 300);
  };

  if (!ready) return null;

  if (!user) {
    return (
      <section>
        <h1>Duel</h1>
        <p className="lede">
          Race another player through the same questions for one minute. The winner takes rating points from the loser.
          Sign in to play.
        </p>
        <div className="actions">
          <Link href="/auth" className="btn">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  if (phase.kind === "live" && live) {
    const total = live.endsAt - live.startsAt;
    const left = Math.max(0, live.endsAt - now);
    const secs = Math.ceil(left / 1000);

    if (!started) {
      return (
        <section className="duel-intro" aria-live="polite">
          <p className="muted">
            {live.you.username} ({live.you.rating}) against
          </p>
          <h1>
            {live.opponent.username} <span className="muted">({live.opponent.rating})</span>
          </h1>
          {live.opponent.bot && <p className="muted">A computer opponent, since nobody near your rating was free.</p>}
          <p className="countdown num">{Math.ceil((live.startsAt - now) / 1000)}</p>
          <p className="muted">Same questions for both of you. Most right answers in a minute wins.</p>
        </section>
      );
    }

    return (
      <section aria-label="Duel in progress">
        <div className="sprint-bar">
          <span>
            <span className={`num${secs <= 5 ? " low" : ""}`}>{secs}</span>seconds left
          </span>
        </div>
        <div className="timer-track" aria-hidden>
          <div className="timer-fill" style={{ transform: `scaleX(${left / total})` }} />
        </div>

        <div className="scoreboard">
          <div className="score-row">
            <span className="score-name">{live.you.username}</span>
            <span className="num score-n">{myScore}</span>
            <Tally count={myScore} label="Your score" />
          </div>
          <div className="score-row them">
            <span className="score-name">{live.opponent.username}</span>
            <span className="num score-n">{theirScore}</span>
            <Tally count={theirScore} label={`${live.opponent.username}'s score`} />
          </div>
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
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => socket?.emit("duel:forfeit")}>
            Resign
          </button>
        </div>
      </section>
    );
  }

  if (phase.kind === "over") {
    const sign = phase.ratingChange > 0 ? "+" : "";
    return (
      <section className="results">
        <h1>{HEADLINE[phase.outcome]}</h1>
        <p className="lede">
          {phase.reason === "forfeit"
            ? phase.outcome === "win"
              ? `${phase.opponentName} left the duel.`
              : "You resigned."
            : `${phase.you} to ${phase.opponent} against ${phase.opponentName}.`}
        </p>
        <div className="result-figures">
          <div className="figure">
            <span className="num">{phase.you}</span>
            <span className="label">your answers</span>
          </div>
          <div className="figure">
            <span className="num">{phase.opponent}</span>
            <span className="label">theirs</span>
          </div>
          <div className="figure">
            <span className="num">{phase.rating}</span>
            <span className="label">
              rating ({sign}
              {phase.ratingChange})
            </span>
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setError("");
              socket?.emit("queue:join");
            }}
          >
            Find another match
          </button>
          <button type="button" className="btn ghost" onClick={() => setPhase({ kind: "lobby" })}>
            Back to lobby
          </button>
        </div>
      </section>
    );
  }

  const inviteLink =
    phase.kind === "hosting" && typeof window !== "undefined"
      ? `${window.location.origin}/duel?code=${phase.code}`
      : "";

  return (
    <section>
      <h1>Duel</h1>
      <p className="lede">
        One minute, the same questions for both players, and the most right answers wins. Wins and losses move your
        rating, which starts at 1000.
      </p>

      <p className="notice">
        {connected
          ? `${presence.online} ${presence.online === 1 ? "player" : "players"} online, ${presence.searching} looking for a match.`
          : "Connecting to the game server…"}{" "}
        Your rating is <strong>{user.rating}</strong>.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {phase.kind === "searching" ? (
        <div className="panel" aria-live="polite">
          <h2>Looking for an opponent</h2>
          <p className="muted">
            Searching for {Math.floor((now - phase.since) / 1000)}s. The longer you wait, the wider the rating range we
            match you with.
            {presence.botAfterSeconds > 0 &&
              ` If nobody turns up within ${presence.botAfterSeconds} seconds, you'll play a computer opponent instead.`}
          </p>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => socket?.emit("queue:leave")}>
              Stop searching
            </button>
          </div>
        </div>
      ) : phase.kind === "hosting" ? (
        <div className="panel" aria-live="polite">
          <h2>Waiting for your friend</h2>
          <p className="muted">Send them this code or link. The duel starts as soon as they join.</p>
          <p className="code num">{phase.code}</p>
          <p className="invite">
            <input className="text-input" readOnly value={inviteLink} aria-label="Invite link" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigator.clipboard?.writeText(inviteLink).catch(() => {})}
            >
              Copy link
            </button>
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                socket?.emit("challenge:cancel");
                setPhase({ kind: "lobby" });
              }}
            >
              Cancel challenge
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={!connected}
              onClick={() => {
                setError("");
                socket?.emit("queue:join");
              }}
            >
              Find a match
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!connected}
              onClick={() => {
                setError("");
                socket?.emit("challenge:create");
              }}
            >
              Challenge a friend
            </button>
          </div>

          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (joinCode.trim()) socket?.emit("challenge:join", { code: joinCode });
            }}
          >
            <div className="field">
              <label htmlFor="join-code">Have a code from a friend?</label>
              <div className="invite">
                <input
                  id="join-code"
                  className="text-input code-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  autoComplete="off"
                  placeholder="ABC234"
                />
                <button type="submit" className="btn ghost" disabled={!connected || joinCode.trim().length < 6}>
                  Join duel
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
