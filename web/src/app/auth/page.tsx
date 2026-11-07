"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleButton } from "@/components/GoogleButton";
import { useAuth } from "@/lib/auth";

export default function AuthPage() {
  const { signIn, signUp, user } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") await signIn(username, password);
      else await signUp(username, password);
      router.push("/profile");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <section>
        <h1 data-kicker="Account // online">You're signed in</h1>
        <p className="lede">Signed in as {user.username}.</p>
      </section>
    );
  }

  const isSignIn = mode === "signin";

  return (
    <section>
      <h1 data-kicker={isSignIn ? "Access // sign in" : "Access // new player"}>{isSignIn ? "Sign in" : "Create an account"}</h1>
      <p className="lede">
        {isSignIn
          ? "Your scores and solve times are saved to your account."
          : "Pick a username other players will see. Letters, numbers and underscores."}
      </p>

      <div className="auth-layout">
      <form onSubmit={submit} noValidate className="auth-card">
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="text-input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="text-input"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            maxLength={isSignIn ? 100 : 72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {!isSignIn && <p className="hint">6 to 72 characters.</p>}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button type="submit" className="btn" disabled={busy || !username || !password}>
            {isSignIn ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setMode(isSignIn ? "signup" : "signin");
              setError("");
            }}
          >
            {isSignIn ? "I'm new here" : "I already have an account"}
          </button>
        </div>
        <GoogleButton onDone={(created) => router.push(created ? "/profile?welcome=1#account" : "/profile")} onError={setError} />
      </form>
      <aside className="auth-aside" aria-label="What an account gives you">
        <h2>With an account</h2>
        <ul>
          <li>
            <strong>Duel rating</strong>
            <span>Every match moves your Elo; climb the board.</span>
          </li>
          <li>
            <strong>Daily streak</strong>
            <span>Six new games each day, ranked against everyone.</span>
          </li>
          <li>
            <strong>Personal bests</strong>
            <span>Sprints, solve times and arcade runs, all saved.</span>
          </li>
          <li>
            <strong>Achievements</strong>
            <span>Fifteen to earn, from your first win to a 30-day streak.</span>
          </li>
        </ul>
      </aside>
      </div>
    </section>
  );
}
