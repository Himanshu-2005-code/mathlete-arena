"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function ChangePassword() {
  const { user, refresh } = useAuth();
  // Players who signed up with Google have no password until they set one.
  const hasPassword = user?.hasPassword ?? true;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.changePassword(current, next);
      await refresh();
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section" id="account">
      <h2>Account</h2>
      <ChangeUsername />
      {done && (
        <p className="notice" role="status">
          Password saved. You can now sign in with your username and password too.
        </p>
      )}
      {!open ? (
        <div className="actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setOpen(true);
              setDone(false);
            }}
          >
            {hasPassword ? "Change password" : "Set a password"}
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {hasPassword ? (
            <div className="field">
              <label htmlFor="pw-current">Current password</label>
              <input
                id="pw-current"
                type="password"
                className="text-input"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>
          ) : (
            <p className="hint">You sign in with Google. Set a password to also sign in with your username.</p>
          )}
          <div className="field">
            <label htmlFor="pw-next">New password</label>
            <input
              id="pw-next"
              type="password"
              className="text-input"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={6}
              maxLength={72}
              required
            />
            <p className="hint">6 to 72 characters.</p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="btn" disabled={busy || (hasPassword && !current) || next.length < 6}>
              Save new password
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <ExportData />
      <DeleteAccount />
    </div>
  );
}

function DeleteAccount() {
  const { signOut, user } = useAuth();
  const hasPassword = user?.hasPassword ?? true;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount(password);
      signOut();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the account");
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className="actions">
        <button type="button" className="btn ghost danger" onClick={() => setOpen(true)}>
          Delete account
        </button>
      </div>
    );

  return (
    <form onSubmit={submit} className="danger-zone">
      <p>
        This deletes your account and everything recorded for it: sprints, puzzle times, daily and arcade scores, and
        duels. It can't be undone.
      </p>
      <div className="field">
        <label htmlFor="del-password">
          {hasPassword ? "Type your password to confirm" : `Type your username (${user?.username}) to confirm`}
        </label>
        <input
          id="del-password"
          type={hasPassword ? "password" : "text"}
          className="text-input"
          autoComplete={hasPassword ? "current-password" : "off"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn danger" disabled={busy || !password}>
          Delete my account
        </button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </form>
  );
}

function ExportData() {
  const { user } = useAuth();
  const [state, setState] = useState<"" | "busy" | "error">("");
  const download = async () => {
    setState("busy");
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `mathlete-${user?.username ?? "data"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setState("");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="actions">
      <button type="button" className="btn ghost" onClick={download} disabled={state === "busy"}>
        Download my data
      </button>
      {state === "error" && <span className="error">Couldn't prepare the download.</span>}
    </div>
  );
}

function ChangeUsername() {
  const { user, rename } = useAuth();
  const [open, setOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // New Google players land here with ?welcome=1 to pick a name of their own.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("welcome")) {
      setWelcome(true);
      setOpen(true);
      document.getElementById("account")?.scrollIntoView({ block: "start" });
    }
  }, []);
  useEffect(() => {
    if (open && user) setName((n) => n || user.username);
  }, [open, user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await rename(name.trim());
      setSaved(true);
      setOpen(false);
      setWelcome(false);
      if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the username");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <>
      {saved && (
        <p className="notice" role="status">
          You're now {user.username}. Your scores, rating and duels came with you.
        </p>
      )}
      {!open ? (
        <div className="actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setName(user.username);
              setOpen(true);
              setSaved(false);
            }}
          >
            Change username
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {welcome && (
            <p className="notice" role="status">
              Welcome! We named you <strong>{user.username}</strong> from your Google account. Keep it, or pick
              another name for the leaderboards.
            </p>
          )}
          <div className="field">
            <label htmlFor="new-username">Username</label>
            <input
              id="new-username"
              className="text-input"
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]+"
              required
              autoFocus
            />
            <p className="hint">3 to 20 letters, numbers or underscores. Everyone sees this on leaderboards and duels.</p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="btn" disabled={busy || name.trim().length < 3 || name.trim() === user.username}>
              Save username
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setOpen(false);
                setWelcome(false);
              }}
            >
              {welcome ? "Keep " + user.username : "Cancel"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
