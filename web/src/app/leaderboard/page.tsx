"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Leaderboard, LeaderboardKind } from "@matik/shared";
import { Choices } from "@/components/Choices";
import { formatTime } from "@/components/CrossMathBoard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const KINDS: { value: LeaderboardKind; label: string }[] = [
  { value: "rating", label: "Duel rating" },
  { value: "daily-sprint", label: "Sprint" },
  { value: "weekly-sprint", label: "Sprint this week" },
  { value: "daily-puzzle", label: "Cross-math" },
  { value: "daily-kenken", label: "KenKen" },
  { value: "daily-sudoku", label: "Sudoku" },
  { value: "daily-maze", label: "Math Maze" },
  { value: "daily-hectoc", label: "Hectoc" },
  { value: "arcade-flash", label: "Flash Anzan" },
  { value: "arcade-memory", label: "Number Memory" },
  { value: "arcade-truefalse", label: "True or False" },
  { value: "arcade-compare", label: "Bigger or Smaller" },
  { value: "arcade-sign", label: "Missing Sign" },
];

const solveBoard = (game: string) => ({ value: "Time", detail: null, empty: `Nobody has solved today's ${game} yet.` });

const COLUMNS: Record<LeaderboardKind, { value: string; detail: string | null; empty: string }> = {
  rating: { value: "Rating", detail: "Duels", empty: "No duels played yet. Win one and you're on the board." },
  "daily-sprint": { value: "Points", detail: "Answers", empty: "Nobody has played today's sprint yet." },
  "weekly-sprint": { value: "Points", detail: "Days", empty: "Nobody has played a daily sprint this week yet." },
  "daily-puzzle": solveBoard("cross-math"),
  "daily-kenken": solveBoard("KenKen"),
  "daily-sudoku": solveBoard("Sudoku"),
  "daily-maze": solveBoard("Math Maze"),
  "daily-hectoc": solveBoard("Hectoc"),
  "arcade-flash": { value: "Best level", detail: "Runs", empty: "Nobody has played Flash Anzan yet." },
  "arcade-memory": { value: "Best digits", detail: "Runs", empty: "Nobody has played Number Memory yet." },
  "arcade-truefalse": { value: "Best score", detail: "Rounds", empty: "Nobody has played True or False yet." },
  "arcade-compare": { value: "Best score", detail: "Rounds", empty: "Nobody has played Bigger or Smaller yet." },
  "arcade-sign": { value: "Best score", detail: "Rounds", empty: "Nobody has played Missing Sign yet." },
};

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [kind, setKind] = useState<LeaderboardKind>("rating");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");

  // Deep links like /leaderboard?kind=daily-sprint pick the tab.
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("kind");
    if (k && KINDS.some((x) => x.value === k)) setKind(k as LeaderboardKind);
  }, []);

  useEffect(() => {
    setBoard(null);
    setError("");
    api
      .leaderboard(kind)
      .then(setBoard)
      .catch((e: Error) => setError(e.message));

    // Keep it fresh while the page is on screen: every 30 seconds, and as soon
    // as the tab comes back into view. Refreshes swap the table in place.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api
        .leaderboard(kind)
        .then((b) => {
          setBoard(b);
          setError("");
        })
        .catch(() => {});
    };
    const id = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [kind]);

  // Keep the address in step with the tab, so a copied link opens the same board.
  const pickBoard = (k: LeaderboardKind) => {
    setKind(k);
    const url = new URL(window.location.href);
    if (k === "rating") url.searchParams.delete("kind");
    else url.searchParams.set("kind", k);
    window.history.replaceState(null, "", url);
  };

  const cols = COLUMNS[kind];

  return (
    <section>
      <h1 data-kicker="Rankings // live">Leaderboard</h1>
      <p className="lede">
        {kind === "rating"
          ? "Everyone who has played a duel, by rating."
          : kind.startsWith("arcade-")
            ? "Everyone's best run, all time."
            : kind === "weekly-sprint"
              ? `Daily sprint points added up since Monday${board?.day ? ` (${board.day})` : ""}. Play every day to climb.`
            : `Today's best first attempts${board?.day ? ` (${board.day})` : ""}. Days reset at midnight.`}
      </p>

      <Choices legend="Board" name="board" value={kind} onChange={pickBoard} options={KINDS} />

      {error && <p className="error">{error}</p>}
      {!board && !error && <p className="notice">Loading…</p>}
      {board && board.rows.length === 0 && <p className="notice">{cols.empty}</p>}
      {board && board.rows.length > 0 && (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th className="r">#</th>
                <th>Player</th>
                <th className="r">{cols.value}</th>
                {cols.detail && <th className="r">{cols.detail}</th>}
              </tr>
            </thead>
            <tbody>
              {(board.me ? [...board.rows, null, board.me] : board.rows).map((r, i) =>
                r === null ? (
                  <tr key="gap" className="gap" aria-hidden>
                    <td className="r">⋮</td>
                    <td colSpan={cols.detail ? 3 : 2} />
                  </tr>
                ) : (
                  <tr
                    key={`${r.username}-${i}`}
                    className={
                      [user?.username === r.username && "me", r.rank <= 3 && `podium podium-${r.rank}`]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    <td className="r num">
                      <span className="rank">{r.rank}</span>
                    </td>
                    <td>
                      <Link href={`/player/${encodeURIComponent(r.username)}`} className="plain-link">
                        {r.username}
                      </Link>
                      {r.bot && <span className="tag">computer</span>}
                    </td>
                    <td className="r num">
                      {kind === "rating" || kind.endsWith("-sprint") || kind.startsWith("arcade-")
                        ? r.value
                        : formatTime(r.value)}
                    </td>
                    {cols.detail && <td className="r num">{r.detail}</td>}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
