"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page crashes; the rest of the site keeps working. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="results">
      <h1 data-kicker="Error // page fault">Something went wrong on this page.</h1>
      <p className="lede">
        Try it again. If it keeps happening, reload the page; your account and scores are safe on the server.
      </p>
      {error.digest && <p className="hint">Error reference: {error.digest}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn ghost">
          Go home
        </Link>
      </div>
    </section>
  );
}
