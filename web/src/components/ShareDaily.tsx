"use client";

import { useState } from "react";
import type { DailyResult } from "@matik/shared";
import { formatTime } from "./CrossMathBoard";

/** Copies a short, spoiler-free summary of today's results. */
export function ShareDaily({
  day,
  slots,
  results,
  streak,
}: {
  day: string;
  slots: { id: string; title: string }[];
  results: Partial<Record<string, DailyResult | null>>;
  streak: number;
}) {
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const played = slots.filter((s) => results[s.id]);
  if (!played.length) return null;

  const text = [
    `Mathlete Arena daily, ${day}`,
    ...slots.map((s) => {
      const r = results[s.id];
      if (!r) return `▢ ${s.title}`;
      const figure = s.id === "sprint" ? `${r.score} pts` : formatTime(r.timeMs);
      return `✓ ${s.title}: ${figure} (#${r.rank} of ${r.of})`;
    }),
    ...(streak > 1 ? [`${streak}-day streak`] : []),
    typeof location !== "undefined" ? `${location.origin}/daily` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const share = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
    setTimeout(() => setCopied(""), 2500);
  };

  return (
    <p>
      <button type="button" className="btn ghost" onClick={share}>
        {copied === "yes" ? "Copied" : "Copy today's results"}
      </button>
      {copied === "no" && <span className="error"> Couldn't reach the clipboard.</span>}
    </p>
  );
}
