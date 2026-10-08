"use client";

import { useEffect, useState } from "react";
import type { Leaderboard, LeaderboardKind } from "@matik/shared";
import { Choices } from "@/components/Choices";
import { formatTime } from "@/components/CrossMathBoard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const KINDS: { value: LeaderboardKind; label: string }[] = [
  { value: "rating", label: "Duel rating" },
  { value: "daily-sprint", label: "Today's sprint" },
  { value: "daily-puzzle", label: "Today's puzzle" },
];

const COLUMNS: Record<LeaderboardKind, { value: string; detail: string | null; empty: string }> = {
  rating: { value: "Rating", detail: "Duels", empty: "No duels played yet. Win one and you're on the board." },
  "daily-sprint": { value: "Points", detail: "Answers", empty: "Nobody has played today's sprint yet." },
  "daily-puzzle": { value: "Time", detail: null, empty: "Nobody has solved today's puzzle yet." },
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
  }, [kind]);

  const cols = COLUMNS[kind];

  return (
    <section>
      <h1>Leaderboard</h1>
      <p className="lede">
        {kind === "rating"
          ? "Everyone who has played a duel, by rating."
          : `Best first attempts at the daily challenge${board?.day ? ` for ${board.day}` : ""}.`}
      </p>

      <Choices legend="Board" name="board" value={kind} onChange={setKind} options={KINDS} />

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
              {board.rows.map((r) => (
                <tr key={r.username} className={user?.username === r.username ? "me" : undefined}>
                  <td className="r num">{r.rank}</td>
                  <td>{r.username}</td>
                  <td className="r num">{kind === "daily-puzzle" ? formatTime(r.value) : r.value}</td>
                  {cols.detail && <td className="r num">{r.detail}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
