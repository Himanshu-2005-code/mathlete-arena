import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  type AuthResponse,
  type DuelRow,
  PRACTICE_MODES,
  SPRINT_SECONDS,
  type SessionRow,
  type Stats,
  checkCrossMath,
  generateCrossMath,
  toPublic,
} from "@matik/shared";
import {
  type AuthedRequest,
  type UserRow,
  hashPassword,
  requireAuth,
  signToken,
  toPublicUser,
  verifyPassword,
} from "./auth";
import { WEB_ORIGIN } from "./config";
import { isReservedName } from "./bots";
import { registerCompetitionRoutes } from "./compete";
import type { Db } from "./db";

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[A-Za-z0-9_]+$/, "Use letters, numbers and underscores only"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

const practiceResult = z.object({
  mode: z.enum(PRACTICE_MODES.map((m) => m.id) as [string, ...string[]]),
  adaptive: z.boolean(),
  durationSec: z
    .number()
    .int()
    .refine((s) => (SPRINT_SECONDS as readonly number[]).includes(s), "Unsupported sprint length"),
  score: z.number().int().min(0).max(10_000),
  correct: z.number().int().min(0).max(1_000),
  attempts: z.number().int().min(0).max(2_000),
  maxLevel: z.number().int().min(1).max(10),
  avgMs: z.number().int().min(0).max(600_000),
});

const puzzleResult = z.object({
  seed: z.number().int().min(0),
  difficulty: z.enum(["easy", "medium", "hard"]),
  grid: z.array(z.array(z.number().int().nullable()).length(3)).length(3),
  timeMs: z.number().int().min(0).max(24 * 3600_000),
  mistakes: z.number().int().min(0).max(1_000),
});

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

export function createApp(db: Db) {
  const app = express();
  app.use(cors({ origin: WEB_ORIGIN }));
  app.use(express.json({ limit: "32kb" }));

  const findByName = db.prepare<[string], UserRow>("SELECT * FROM users WHERE username = ?");
  const findById = db.prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?");
  const insertUser = db.prepare<[string, string]>("INSERT INTO users (username, password_hash) VALUES (?, ?)");

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/register", async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) });
    const { username, password } = parsed.data;
    if (isReservedName(username)) {
      return void res.status(400).json({ error: "Usernames ending in _bot are kept for computer opponents" });
    }
    if (findByName.get(username)) return void res.status(409).json({ error: "That username is taken" });

    const info = insertUser.run(username, await hashPassword(password));
    const user = findById.get(Number(info.lastInsertRowid))!;
    const body: AuthResponse = { token: signToken(user.id), user: toPublicUser(user) };
    res.status(201).json(body);
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid username or password" });
    const user = findByName.get(parsed.data.username);
    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
      return void res.status(401).json({ error: "Invalid username or password" });
    }
    const body: AuthResponse = { token: signToken(user.id), user: toPublicUser(user) };
    res.json(body);
  });

  app.get("/api/me", requireAuth, (req, res) => {
    const user = findById.get((req as AuthedRequest).userId);
    if (!user) return void res.status(401).json({ error: "Account not found" });
    res.json({ user: toPublicUser(user) });
  });

  app.post("/api/results/practice", requireAuth, (req, res) => {
    const parsed = practiceResult.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) });
    const r = parsed.data;
    if (r.correct > r.attempts) return void res.status(400).json({ error: "correct cannot exceed attempts" });

    db.prepare(
      `INSERT INTO sessions (user_id, kind, mode, duration_sec, adaptive, score, correct, attempts, max_level, avg_ms, duration_ms)
       VALUES (?, 'practice', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      (req as AuthedRequest).userId,
      r.mode,
      r.durationSec,
      r.adaptive ? 1 : 0,
      r.score,
      r.correct,
      r.attempts,
      r.maxLevel,
      r.avgMs,
      r.durationSec * 1000,
    );
    res.status(201).json({ ok: true });
  });

  // Puzzles are regenerated from their seed, so a solution can't be faked.
  app.get("/api/puzzles/crossmath", (req, res) => {
    const difficulty = z.enum(["easy", "medium", "hard"]).catch("easy").parse(req.query.difficulty);
    const seed = Math.floor(Math.random() * 2 ** 31);
    res.json(toPublic(generateCrossMath(seed, difficulty)));
  });

  app.post("/api/results/puzzle", requireAuth, (req, res) => {
    const parsed = puzzleResult.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) });
    const r = parsed.data;
    const puzzle = toPublic(generateCrossMath(r.seed, r.difficulty));
    if (!checkCrossMath(puzzle, r.grid).solved) {
      return void res.status(400).json({ error: "That grid does not solve the puzzle" });
    }

    db.prepare(
      `INSERT INTO sessions (user_id, kind, mode, score, correct, attempts, duration_ms, seed)
       VALUES (?, 'puzzle', ?, 1, 1, ?, ?, ?)`,
    ).run((req as AuthedRequest).userId, r.difficulty, 1 + r.mistakes, r.timeMs, r.seed);
    res.status(201).json({ ok: true });
  });

  app.get("/api/stats", requireAuth, (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const user = findById.get(userId);
    if (!user) return void res.status(401).json({ error: "Account not found" });

    const totals = db
      .prepare(
        `SELECT COUNT(*) AS sessions, COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(attempts), 0) AS attempts
         FROM sessions WHERE user_id = ? AND kind = 'practice'`,
      )
      .get(userId) as { sessions: number; correct: number; attempts: number };

    const bestByMode = db
      .prepare(
        `SELECT mode, duration_sec AS durationSec, MAX(score) AS best
         FROM sessions WHERE user_id = ? AND kind = 'practice'
         GROUP BY mode, duration_sec ORDER BY mode, duration_sec`,
      )
      .all(userId) as Stats["practice"]["bestByMode"];

    const puzzleSolved = db
      .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND kind = 'puzzle'`)
      .get(userId) as { n: number };

    const fastest = db
      .prepare(
        `SELECT mode AS difficulty, MIN(duration_ms) AS bestMs
         FROM sessions WHERE user_id = ? AND kind = 'puzzle' GROUP BY mode`,
      )
      .all(userId) as Stats["puzzles"]["fastestByDifficulty"];

    const recent = db
      .prepare(
        `SELECT id, kind, mode, score, correct, attempts, duration_ms AS durationMs, created_at AS createdAt
         FROM sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 10`,
      )
      .all(userId) as SessionRow[];

    // Duels from this player's side, whichever slot they were in.
    const duelRows = db
      .prepare(
        `SELECT d.id,
                CASE WHEN d.p1_id = @id THEN u2.username ELSE u1.username END AS opponent,
                CASE WHEN d.p1_id = @id THEN d.score1 ELSE d.score2 END AS you,
                CASE WHEN d.p1_id = @id THEN d.score2 ELSE d.score1 END AS opponentScore,
                CASE WHEN d.winner_id IS NULL THEN 'draw' WHEN d.winner_id = @id THEN 'win' ELSE 'loss' END AS outcome,
                CASE WHEN d.p1_id = @id THEN d.change1 ELSE d.change2 END AS ratingChange,
                CASE WHEN d.p1_id = @id THEN d.rating_after1 ELSE d.rating_after2 END AS ratingAfter,
                d.reason, d.created_at AS createdAt
         FROM duels d
         JOIN users u1 ON u1.id = d.p1_id
         JOIN users u2 ON u2.id = d.p2_id
         WHERE d.p1_id = @id OR d.p2_id = @id
         ORDER BY d.created_at DESC, d.id DESC`,
      )
      .all({ id: userId }) as (DuelRow & { ratingAfter: number })[];

    const count = (o: DuelRow["outcome"]) => duelRows.filter((d) => d.outcome === o).length;

    const stats: Stats = {
      user: toPublicUser(user),
      practice: {
        sessions: totals.sessions,
        totalCorrect: totals.correct,
        totalAttempts: totals.attempts,
        accuracy: totals.attempts ? totals.correct / totals.attempts : 0,
        bestByMode,
      },
      puzzles: { solved: puzzleSolved.n, fastestByDifficulty: fastest },
      duels: {
        played: duelRows.length,
        won: count("win"),
        lost: count("loss"),
        drawn: count("draw"),
        peakRating: Math.max(user.rating, ...duelRows.map((d) => d.ratingAfter)),
        recent: duelRows.slice(0, 10).map(({ ratingAfter: _, ...d }) => d),
      },
      recent,
    };
    res.json(stats);
  });

  registerCompetitionRoutes(app, db);

  return app;
}
