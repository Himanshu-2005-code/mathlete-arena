"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function ChangePassword() {
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
    <div className="section">
      <h2>Account</h2>
      {done && (
        <p className="notice" role="status">
          Password changed. Use the new one next time you sign in.
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
            Change password
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
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
              required
            />
            <p className="hint">At least 6 characters.</p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="btn" disabled={busy || !current || next.length < 6}>
              Save new password
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <DeleteAccount />
    </div>
  );
}

function DeleteAccount() {
  const { signOut } = useAuth();
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
        <label htmlFor="del-password">Type your password to confirm</label>
        <input
          id="del-password"
          type="password"
          className="text-input"
          autoComplete="current-password"
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
