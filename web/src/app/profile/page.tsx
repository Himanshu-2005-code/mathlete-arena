"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRACTICE_MODES, type Stats } from "@matik/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const modeLabel = (id: string) => PRACTICE_MODES.find((m) => m.id === id)?.label ?? id;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatMs(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function when(iso: string) {
  // SQLite stores UTC without a zone marker.
  return new Date(`${iso.replace(" ", "T")}Z`).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProfilePage() {
  const { user, ready } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .stats()
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, [user]);

  if (!ready) return null;

  if (!user) {
    return (
      <section>
        <h1>Your profile</h1>
        <p className="lede">Sign in to see your best sprints, puzzle times and recent games.</p>
        <div className="actions">
          <Link href="/auth" className="btn">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  if (error) return <p className="error">{error}</p>;
  if (!stats) return <p className="notice">Loading your stats…</p>;

  const { practice, puzzles, recent } = stats;
  const nothingYet = practice.sessions === 0 && puzzles.solved === 0;

  return (
    <section>
      <h1>{user.username}</h1>
      <p className="lede">Playing since {new Date(`${user.createdAt.replace(" ", "T")}Z`).toLocaleDateString()}.</p>

      {nothingYet ? (
        <>
          <p className="notice">No games yet. Your first sprint or puzzle will show up here.</p>
          <div className="actions">
            <Link href="/practice" className="btn">
              Start a sprint
            </Link>
            <Link href="/puzzles" className="btn ghost">
              Solve a puzzle
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="result-figures">
            <div className="figure">
              <span className="num">{practice.sessions}</span>
              <span className="label">sprints</span>
            </div>
            <div className="figure">
              <span className="num">{practice.totalCorrect}</span>
              <span className="label">answers right</span>
            </div>
            <div className="figure">
              <span className="num">{Math.round(practice.accuracy * 100)}%</span>
              <span className="label">accuracy</span>
            </div>
            <div className="figure">
              <span className="num">{puzzles.solved}</span>
              <span className="label">puzzles solved</span>
            </div>
          </div>

          {practice.bestByMode.length > 0 && (
            <div className="section">
              <h2>Best sprints</h2>
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Length</th>
                    <th className="r">Best score</th>
                  </tr>
                </thead>
                <tbody>
                  {practice.bestByMode.map((b) => (
                    <tr key={`${b.mode}-${b.durationSec}`}>
                      <td>{modeLabel(b.mode)}</td>
                      <td>{b.durationSec}s</td>
                      <td className="r num">{b.best}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {puzzles.fastestByDifficulty.length > 0 && (
            <div className="section">
              <h2>Fastest puzzles</h2>
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Difficulty</th>
                    <th className="r">Best time</th>
                  </tr>
                </thead>
                <tbody>
                  {puzzles.fastestByDifficulty.map((p) => (
                    <tr key={p.difficulty}>
                      <td>{cap(p.difficulty)}</td>
                      <td className="r num">{formatMs(p.bestMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section">
            <h2>Recent games</h2>
            <table className="ledger">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Game</th>
                  <th className="r">Result</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td>{when(s.createdAt)}</td>
                    <td>{s.kind === "practice" ? `${modeLabel(s.mode)} sprint` : `${cap(s.mode)} puzzle`}</td>
                    <td className="r num">
                      {s.kind === "practice" ? `${s.score} pts, ${s.correct}/${s.attempts}` : formatMs(s.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
