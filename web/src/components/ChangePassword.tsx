"use client";

import { type FormEvent, useState } from "react";
import { api } from "@/lib/api";

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
    </div>
  );
}
