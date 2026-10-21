"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DAILY_EXTRA_KINDS, type DailyInfo } from "@matik/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** One line on the home page: how much of today's daily you've done, and your streak. */
export function DailyStatus() {
  const { user } = useAuth();
  const [info, setInfo] = useState<DailyInfo | null>(null);
  useEffect(() => {
    if (!user) return setInfo(null);
    api
      .daily()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [user]);
  if (!user || !info) return null;

  const total = 2 + DAILY_EXTRA_KINDS.length;
  const played =
    Number(!!info.mine.sprint) + Number(!!info.mine.puzzle) + DAILY_EXTRA_KINDS.filter((k) => info.extra[k].mine).length;
  const streak = info.streak?.current ?? 0;

  return (
    <p className="daily-status">
      <Link href="/daily">
        {played === total
          ? "All of today's daily games done"
          : played === 0
            ? "Today's daily challenge is waiting"
            : `Today's daily: ${played} of ${total} played`}
      </Link>
      {streak > 0 && (
        <span className="muted">
          {" "}
          · <span className="num">{streak}</span>-day streak{played === 0 ? ", play one to keep it" : ""}
        </span>
      )}
    </p>
  );
}
