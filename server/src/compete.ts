import type { Express } from "express";
import { z } from "zod";
import {
  DAILY_EXTRA_KINDS,
  type DailyExtraKind,
  type DailyInfo,
  LEADERBOARD_KINDS,
  type PuzzleKind,
  generatePublicPuzzle,
  puzzleInfo,
  verifyPuzzle,
  type DailyResult,
  DUEL_SECONDS,
  type Leaderboard,
  type LeaderboardKind,
  checkCrossMath,
  computeStreak,
  dailySeed,
  nextDayStart,
  dayKey,
  generateCrossMath,
  pointsFor,
  sequenceQuestion,
  toPublic,
} from "@matik/shared";
import { answerExpressions, answerGrid, answerPath, puzzleKind } from "./schemas";
import { type AuthedRequest, requireAuth, verifyToken } from "./auth";
import { DAILY_UTC_OFFSET_MIN } from "./config";
import type { Db } from "./db";

export const DAILY_SPRINT_SECONDS = DUEL_SECONDS;
export const DAILY_PUZZLE_DIFFICULTY = "medium" as const;
/** Nobody answers faster than this, so more correct answers than it allows are rejected. */
const MAX_DAILY_CORRECT = Math.floor((DAILY_SPRINT_SECONDS * 1000) / 350);

const sprintBody = z.object({
  answers: z
    .array(z.object({ index: z.number().int().min(0), value: z.number().int().nullable() }))
    .max(600),
});

const puzzleBody = z.object({
  kind: puzzleKind.default("crossmath"),
  grid: answerGrid.optional(),
  path: answerPath.optional(),
  expressions: answerExpressions.optional(),
  timeMs: z.number().int().min(1000).max(24 * 3600_000),
});

type DailyKind = "sprint" | "puzzle" | DailyExtraKind;

/** Cross-math was the first daily puzzle and is stored as "puzzle". */
const dailyKindOf = (kind: "crossmath" | DailyExtraKind): DailyKind => (kind === "crossmath" ? "puzzle" : kind);
const isDailyKind = (kind: PuzzleKind): kind is "crossmath" | DailyExtraKind =>
  kind === "crossmath" || (DAILY_EXTRA_KINDS as string[]).includes(kind);

/** Today's puzzle of a kind: same seed and difficulty for everyone. */
export function dailyPuzzle(day: string, kind: PuzzleKind) {
  const difficulty = puzzleInfo(kind).daily;
  const seed = kind === "crossmath" ? dailySeed(day, "puzzle") : dailySeed(`${day}:${kind}`, "puzzle");
  return { seed, difficulty };
}

/**
 * Replay a daily sprint. Answers must walk the question sequence in order:
 * a correct value or a skip (null) moves to the next question.
 */
export function scoreDailySprint(seed: number, answers: { index: number; value: number | null }[]) {
  let index = 0;
  let score = 0;
  let correct = 0;
  for (const a of answers) {
    if (a.index !== index) return null;
    const q = sequenceQuestion(seed, index);
    if (a.value === q.answer) {
      score += pointsFor(q);
      correct++;
    } else if (a.value !== null) {
      return null;
    }
    index++;
  }
  if (correct > MAX_DAILY_CORRECT) return null;
  return { score, correct };
}

export function dailyStreak(db: Db, userId: number, day = today()) {
  const days = (
    db.prepare("SELECT DISTINCT day FROM daily_results WHERE user_id = ?").all(userId) as { day: string }[]
  ).map((r) => r.day);
  return computeStreak(days, day);
}

export function today(now = new Date()) {
  return dayKey(now, DAILY_UTC_OFFSET_MIN);
}

export function registerCompetitionRoutes(app: Express, db: Db) {
  function myResult(userId: number, day: string, kind: DailyKind): DailyResult | null {
    const row = db
      .prepare<[number, string, string], { score: number; correct: number; time_ms: number }>(
        "SELECT score, correct, time_ms FROM daily_results WHERE user_id = ? AND day = ? AND kind = ?",
      )
      .get(userId, day, kind);
    if (!row) return null;

    // Sprints rank by score (higher first); puzzles by time (lower first).
    const better =
      kind === "sprint"
        ? "(score > @score OR (score = @score AND time_ms < @time))"
        : "(time_ms < @time)";
    const { ahead } = db
      .prepare(`SELECT COUNT(*) AS ahead FROM daily_results WHERE day = @day AND kind = @kind AND ${better}`)
      .get({ day, kind, score: row.score, time: row.time_ms }) as { ahead: number };
    const { of } = db
      .prepare("SELECT COUNT(*) AS of FROM daily_results WHERE day = ? AND kind = ?")
      .get(day, kind) as { of: number };
    return { score: row.score, correct: row.correct, timeMs: row.time_ms, rank: ahead + 1, of };
  }

  const saveDaily = db.prepare(
    `INSERT OR IGNORE INTO daily_results (user_id, day, kind, score, correct, time_ms) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  app.get("/api/daily", (req, res) => {
    const day = today();
    const header = req.headers.authorization;
    const userId = verifyToken(header?.startsWith("Bearer ") ? header.slice(7) : undefined);
    const info: DailyInfo = {
      day,
      sprintSeed: dailySeed(day, "sprint"),
      nextAt: nextDayStart(new Date(), DAILY_UTC_OFFSET_MIN).toISOString(),
      sprintSeconds: DAILY_SPRINT_SECONDS,
      puzzle: toPublic(generateCrossMath(dailyPuzzle(day, "crossmath").seed, DAILY_PUZZLE_DIFFICULTY)),
      mine: {
        sprint: userId === null ? null : myResult(userId, day, "sprint"),
        puzzle: userId === null ? null : myResult(userId, day, "puzzle"),
      },
      extra: Object.fromEntries(
        DAILY_EXTRA_KINDS.map((kind) => {
          const { seed, difficulty } = dailyPuzzle(day, kind);
          return [
            kind,
            {
              difficulty,
              puzzle: generatePublicPuzzle(kind, seed, difficulty),
              mine: userId === null ? null : myResult(userId, day, kind),
            },
          ];
        }),
      ) as DailyInfo["extra"],
      streak: userId === null ? null : dailyStreak(db, userId, day),
    };
    res.json(info);
  });

  app.post("/api/daily/sprint", requireAuth, (req, res) => {
    const parsed = sprintBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid sprint" });
    const day = today();
    const scored = scoreDailySprint(dailySeed(day, "sprint"), parsed.data.answers);
    if (!scored) return void res.status(400).json({ error: "Those answers don't match today's sprint" });
    const userId = (req as AuthedRequest).userId;
    const saved = saveDaily.run(userId, day, "sprint", scored.score, scored.correct, DAILY_SPRINT_SECONDS * 1000);
    res.status(saved.changes ? 201 : 200).json({
      firstAttempt: saved.changes > 0,
      result: myResult(userId, day, "sprint"),
      streak: dailyStreak(db, userId, day),
    });
  });

  app.post("/api/daily/puzzle", requireAuth, (req, res) => {
    const parsed = puzzleBody.safeParse(req.body);
    if (!parsed.success) {
      const tooFast = parsed.error.issues.some((i) => i.path[0] === "timeMs" && i.code === "too_small");
      return void res.status(400).json({ error: tooFast ? "That was too fast to count" : "Invalid puzzle result" });
    }
    const day = today();
    const { kind, grid, path, expressions, timeMs } = parsed.data;
    if (!isDailyKind(kind)) {
      return void res.status(400).json({ error: `${puzzleInfo(kind).label} isn't part of the daily challenge` });
    }
    const { seed, difficulty } = dailyPuzzle(day, kind);
    if (!verifyPuzzle(kind, seed, difficulty, { grid, path, expressions })) {
      return void res.status(400).json({ error: "That doesn't solve today's puzzle" });
    }
    const userId = (req as AuthedRequest).userId;
    const saved = saveDaily.run(userId, day, dailyKindOf(kind), 1, 1, timeMs);
    res.status(saved.changes ? 201 : 200).json({
      firstAttempt: saved.changes > 0,
      result: myResult(userId, day, dailyKindOf(kind)),
      streak: dailyStreak(db, userId, day),
    });
  });

  app.get("/api/leaderboard", (req, res) => {
    const kind = z
      .enum(LEADERBOARD_KINDS as [LeaderboardKind, ...LeaderboardKind[]])
      .catch("rating")
      .parse(req.query.kind);
    const limit = 50;
    let board: Leaderboard;

    if (kind === "rating") {
      const rows = db
        .prepare(
          `SELECT u.username, u.rating AS value, u.is_bot AS bot,
                  (SELECT COUNT(*) FROM duels d WHERE d.p1_id = u.id OR d.p2_id = u.id) AS detail
           FROM users u
           WHERE EXISTS (SELECT 1 FROM duels d WHERE d.p1_id = u.id OR d.p2_id = u.id)
           ORDER BY u.rating DESC, u.id ASC LIMIT ?`,
        )
        .all(limit) as { username: string; value: number; detail: number; bot: number }[];
      board = {
        kind,
        day: null,
        rows: rows.map(({ bot, ...r }, i) => ({ rank: i + 1, ...r, ...(bot ? { bot: true } : {}) })),
      };
    } else if (kind.startsWith("arcade-")) {
      // All-time bests, one row per player.
      const rows = db
        .prepare(
          `SELECT u.username, MAX(a.score) AS value, COUNT(*) AS detail
           FROM arcade_results a JOIN users u ON u.id = a.user_id
           WHERE a.game = ?
           GROUP BY a.user_id ORDER BY value DESC, MIN(a.created_at) ASC LIMIT ?`,
        )
        .all(kind.slice("arcade-".length), limit) as { username: string; value: number; detail: number }[];
      board = { kind, day: null, rows: rows.map((r, i) => ({ rank: i + 1, ...r })) };
    } else {
      const day = today();
      const sprint = kind === "daily-sprint";
      const rows = db
        .prepare(
          `SELECT u.username, ${sprint ? "r.score" : "r.time_ms"} AS value, ${sprint ? "r.correct" : "NULL"} AS detail
           FROM daily_results r JOIN users u ON u.id = r.user_id
           WHERE r.day = ? AND r.kind = ?
           ORDER BY ${sprint ? "r.score DESC, r.created_at ASC" : "r.time_ms ASC, r.created_at ASC"} LIMIT ?`,
        )
        .all(day, kind.slice("daily-".length), limit) as { username: string; value: number; detail: number | null }[];
      board = { kind, day, rows: rows.map((r, i) => ({ rank: i + 1, ...r })) };
    }
    res.json(board);
  });
}
