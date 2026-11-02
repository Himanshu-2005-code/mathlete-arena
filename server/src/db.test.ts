import { describe, expect, it } from "vitest";
import { openDb } from "./db";

/** The plan SQLite would use for a query, flattened to one string. */
function plan(db: ReturnType<typeof openDb>, sql: string, ...params: unknown[]) {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[]).map((r) => r.detail).join(" | ");
}

describe("indexes", () => {
  const db = openDb(":memory:");

  it("serves the daily and weekly leaderboards from an index", () => {
    expect(plan(db, "SELECT * FROM daily_results WHERE day = ? AND kind = ?", "2026-11-02", "maze")).toMatch(
      /USING (COVERING )?INDEX idx_daily_kind_day/,
    );
    expect(
      plan(db, "SELECT * FROM daily_results WHERE kind = 'sprint' AND day >= ? AND day <= ?", "2026-11-02", "2026-11-08"),
    ).toMatch(/USING (COVERING )?INDEX idx_daily_kind_day/);
  });

  it("finds one player's arcade bests and sprints without scanning", () => {
    expect(plan(db, "SELECT game, MAX(score) FROM arcade_results WHERE user_id = ? GROUP BY game", 1)).toMatch(
      /idx_arcade_user/,
    );
    expect(
      plan(
        db,
        "SELECT MAX(score) FROM sessions WHERE user_id = ? AND kind = 'practice' AND mode = ? AND duration_sec = ?",
        1,
        "mixed",
        60,
      ),
    ).toMatch(/idx_sessions_user_kind_mode/);
  });
});
