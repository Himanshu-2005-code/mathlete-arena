"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "New set in 4h 12m 09s", ticking; offers a reload once the time passes. */
export function Countdown({ to }: { to: string }) {
  const target = Date.parse(to);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  if (left === 0)
    return (
      <p className="countdown">
        A new set is ready.{" "}
        <button type="button" className="linkish" onClick={() => location.reload()}>
          Load it
        </button>
      </p>
    );
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return (
    <p className="countdown" aria-live="off">
      New set in{" "}
      <span className="num">
        {h}h {pad(m)}m {pad(left % 60)}s
      </span>
    </p>
  );
}
