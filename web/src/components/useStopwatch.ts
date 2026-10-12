"use client";

import { useEffect, useRef, useState } from "react";

/** A timer that starts on mount and stops when `stopped` turns true. */
export function useStopwatch(stopped: boolean) {
  const startedAt = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [stopped]);
  const now = () => Math.round(performance.now() - startedAt.current);
  return { elapsed, now };
}
