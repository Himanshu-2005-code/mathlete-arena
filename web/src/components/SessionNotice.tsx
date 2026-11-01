"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

/** Shown across the site when the server ends a session (e.g. the token expired). */
export function SessionNotice() {
  const { expired, dismissExpired } = useAuth();
  if (!expired) return null;
  return (
    <div className="session-notice" role="alert">
      <span>Your session has expired, so you've been signed out. Your scores are safe.</span>
      <Link href="/auth" className="btn" onClick={dismissExpired}>
        Sign in again
      </Link>
      <button type="button" className="linkish" onClick={dismissExpired}>
        Dismiss
      </button>
    </div>
  );
}
