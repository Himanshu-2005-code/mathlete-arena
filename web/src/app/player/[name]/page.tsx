"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ARCADE_GAMES, type PlayerProfile } from "@matik/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/Skeleton";

export default function PlayerPage() {
  const { name } = useParams<{ name: string }>();
  const username = decodeURIComponent(name ?? "");
  const { user } = useAuth();
  const [p, setP] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setP(null);
    setError("");
    api
      .player(username)
      .then(setP)
      .catch((e: Error) => setError(e.message));
  }, [username]);

  if (error)
    return (
      <section>
        <h1>{username}</h1>
        <p className="notice">{error}.</p>
        <div className="actions">
          <Link href="/leaderboard" className="btn ghost">
            Back to the leaderboard
          </Link>
        </div>
      </section>
    );
  if (!p) return <Skeleton label={`Loading ${username}`} />;

  const { duels } = p;
  const figures: { value: string | number; label: string }[] = [
    { value: p.rating, label: duels.played ? `rating, peak ${duels.peakRating}` : "rating" },
  ];
  if (duels.played)
    figures.push({
      value: `${duels.won}–${duels.lost}${duels.drawn ? `–${duels.drawn}` : ""}`,
      label: `duels won–lost${duels.drawn ? "–drawn" : ""}`,
    });
  if (p.dailyStreak.best) figures.push({ value: p.dailyStreak.current, label: `day streak, best ${p.dailyStreak.best}` });
  if (p.bestSprint !== null) figures.push({ value: p.bestSprint, label: "best 1-minute mixed sprint" });
  if (p.puzzlesSolved) figures.push({ value: p.puzzlesSolved, label: "puzzles solved" });
  for (const g of ARCADE_GAMES) if (p.arcade[g.id]) figures.push({ value: p.arcade[g.id], label: `best ${g.label}` });

  const isMe = user?.username.toLowerCase() === p.username.toLowerCase();

  return (
    <section>
      <h1>
        {p.username}
        {p.bot && <span className="tag">computer</span>}
      </h1>
      <p className="lede">
        {p.bot
          ? "A computer opponent. It steps in when nobody near your rating is looking for a duel."
          : `Playing since ${new Date(`${p.createdAt.replace(" ", "T")}Z`).toLocaleDateString()}.`}
      </p>
      <div className="result-figures">
        {figures.map((f) => (
          <div className="figure" key={f.label}>
            <span className="num">{f.value}</span>
            <span className="label">{f.label}</span>
          </div>
        ))}
      </div>
      <div className="actions">
        {isMe ? (
          <Link href="/profile" className="btn">
            Your full profile
          </Link>
        ) : (
          <Link href="/duel" className="btn">
            Find a duel
          </Link>
        )}
        <Link href="/leaderboard" className="btn ghost">
          Leaderboard
        </Link>
      </div>
    </section>
  );
}
