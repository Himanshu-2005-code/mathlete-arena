import compression from "compression";
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
  type PlayerProfile,
  ARCADE_GAMES,
  type ArcadeGame,
  type ArcadeResult,
  checkCrossMath,
  isPlausibleArcadeScore,
  isDifficulty,
  verifyPuzzle,
  generateCrossMath,
  toPublic,
} from "@mathlete/shared";
import {
  type AuthedRequest,
  type UserRow,
  hashPassword,
  requireAuth,
  signToken,
  toPublicUser,
  verifyPassword,
} from "./auth";
import { corsOrigin } from "./config";
import { isReservedName } from "./bots";
import { dailyStreak, registerCompetitionRoutes } from "./compete";
import { answerExpressions, answerGrid, answerPath, arcadeGame, puzzleKind } from "./schemas";
import rateLimit from "express-rate-limit";
import { AUTH_RATE_LIMIT, LOG_REQUESTS, TRUST_PROXY, WRITE_RATE_LIMIT } from "./config";
import type { Db } from "./db";
import { APP_VERSION } from "./version";

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[A-Za-z0-9_]+$/, "Use letters, numbers and underscores only"),
  password: z.string().min(1).max(100),
});

// bcrypt only reads the first 72 bytes of a password, so anything longer would
// silently match other passwords sharing those bytes. New passwords must fit.
const newPassword = (label: string) =>
  z
    .string()
    .min(6, `${label} must be at least 6 characters`)
    .refine((pw) => Buffer.byteLength(pw, "utf8") <= 72, `${label} must be at most 72 bytes (about 72 letters)`);

const newCredentials = credentials.extend({ password: newPassword("Password") });

const passwordChange = z.object({
  current: z.string().min(1, "Enter your current password").max(100),
  next: newPassword("New password"),
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
  kind: puzzleKind.default("crossmath"),
  seed: z.number().int().min(0),
  difficulty: z.string().max(10),
  grid: answerGrid.optional(),
  path: answerPath.optional(),
  expressions: answerExpressions.optional(),
  timeMs: z.number().int().min(0).max(24 * 3600_000),
  mistakes: z.number().int().min(0).max(1_000),
});

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

export function createApp(db: Db) {
  const app = express();
  // Behind Render/Railway/Fly the client's address arrives in X-Forwarded-For.
  if (TRUST_PROXY) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  // Gzip pages and API replies. Socket.io's long-lived connections don't pass
  // through Express routes, so live duels are unaffected.
  app.use(compression());
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    // Scores and leaderboards change constantly; never serve them from a cache.
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  // One compact line per API call: method, path, status, time. Query strings
  // and bodies are left out so nothing private ends up in the logs.
  if (LOG_REQUESTS) {
    app.use("/api", (req, res, next) => {
      const start = process.hrtime.bigint();
      res.on("finish", () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`[mathlete] ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`);
      });
      next();
    });
  }
  app.use(cors({ origin: corsOrigin }));
  // Slow down password guessing and sign-up spam.
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60_000,
      limit: AUTH_RATE_LIMIT,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many attempts. Try again in a few minutes." },
    }),
  );
  // Cap how fast one address can submit scores. A real player finishes a game
  // every few seconds at most; this only stops scripts flooding the boards.
  const writeLimiter = rateLimit({
    windowMs: 60_000,
    limit: WRITE_RATE_LIMIT,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.method !== "POST",
    message: { error: "You're submitting results too quickly. Wait a moment and try again." },
  });
  app.use(["/api/results", "/api/arcade", "/api/daily"], writeLimiter);
  app.use(express.json({ limit: "32kb" }));

  const findByName = db.prepare<[string], UserRow>("SELECT * FROM users WHERE username = ?");
  const findById = db.prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?");
  const insertUser = db.prepare<[string, string]>("INSERT INTO users (username, password_hash) VALUES (?, ?)");

  // For uptime checks: confirms the database answers, and reports how long
  // this process has been up.
  const startedAt = Date.now();
  const ping = db.prepare("SELECT 1 AS ok");
  app.get("/api/health", (_req, res) => {
    try {
      ping.get();
      res.json({ ok: true, db: "ok", uptimeSec: Math.round((Date.now() - startedAt) / 1000), version: APP_VERSION });
    } catch {
      res.status(503).json({ ok: false, db: "unreachable" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    const parsed = newCredentials.safeParse(req.body);
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

  const setPassword = db.prepare<[string, number]>("UPDATE users SET password_hash = ? WHERE id = ?");

  app.post("/api/auth/password", requireAuth, async (req, res) => {
    const parsed = passwordChange.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) });
    const user = findById.get((req as AuthedRequest).userId);
    if (!user) return void res.status(401).json({ error: "Account not found" });
    if (!(await verifyPassword(parsed.data.current, user.password_hash))) {
      return void res.status(403).json({ error: "Your current password is wrong" });
    }
    setPassword.run(await hashPassword(parsed.data.next), user.id);
    res.json({ ok: true });
  });

  // Deletes the account and everything recorded for it: sprints, puzzles,
  // daily and arcade scores, and duels (which also leave the opponent's history).
  const deleteUser = db.prepare<[number]>("DELETE FROM users WHERE id = ? AND is_bot = 0");
  app.post("/api/auth/delete", requireAuth, async (req, res) => {
    const parsed = z.object({ password: z.string().min(1).max(100) }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Enter your password to confirm" });
    const user = findById.get((req as AuthedRequest).userId);
    if (!user) return void res.status(401).json({ error: "Account not found" });
    if (!(await verifyPassword(parsed.data.password, user.password_hash))) {
      return void res.status(403).json({ error: "That password is wrong" });
    }
    deleteUser.run(user.id);
    res.json({ ok: true });
  });

  // Everything stored for the signed-in player, as one JSON file.
  app.get("/api/me/export", requireAuth, (req, res) => {
    const user = findById.get((req as AuthedRequest).userId);
    if (!user) return void res.status(401).json({ error: "Account not found" });
    const all = (sql: string) => db.prepare(sql).all(user.id);
    const data = {
      exportedAt: new Date().toISOString(),
      account: toPublicUser(user),
      sessions: all(
        `SELECT kind, mode, duration_sec AS durationSec, adaptive, score, correct, attempts, max_level AS maxLevel,
                avg_ms AS avgMs, duration_ms AS durationMs, created_at AS createdAt
         FROM sessions WHERE user_id = ? ORDER BY created_at`,
      ),
      daily: all(
        `SELECT day, kind, score, correct, time_ms AS timeMs, created_at AS createdAt
         FROM daily_results WHERE user_id = ? ORDER BY day, kind`,
      ),
      arcade: all("SELECT game, score, created_at AS createdAt FROM arcade_results WHERE user_id = ? ORDER BY created_at"),
      duels: db
        .prepare(
          `SELECT CASE WHEN d.p1_id = @id THEN u2.username ELSE u1.username END AS opponent,
                  CASE WHEN d.p1_id = @id THEN d.score1 ELSE d.score2 END AS you,
                  CASE WHEN d.p1_id = @id THEN d.score2 ELSE d.score1 END AS opponentScore,
                  CASE WHEN d.winner_id IS NULL THEN 'draw' WHEN d.winner_id = @id THEN 'win' ELSE 'loss' END AS outcome,
                  CASE WHEN d.p1_id = @id THEN d.rating_after1 ELSE d.rating_after2 END AS ratingAfter,
                  d.reason, d.created_at AS createdAt
           FROM duels d JOIN users u1 ON u1.id = d.p1_id JOIN users u2 ON u2.id = d.p2_id
           WHERE d.p1_id = @id OR d.p2_id = @id ORDER BY d.created_at`,
        )
        .all({ id: user.id }),
    };
    res.setHeader("Content-Disposition", `attachment; filename="mathlete-${user.username}.json"`);
    res.json(data);
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
    // Each right answer is worth its level in points, so a sprint can't score
    // more than correct × highest level. Nobody types more than ~5 answers a
    // second either.
    if (r.score > r.correct * r.maxLevel) {
      return void res.status(400).json({ error: "That score doesn't match the answers given" });
    }
    if (r.correct > r.durationSec * 5) {
      return void res.status(400).json({ error: "More answers than the sprint allows" });
    }
    const userId = (req as AuthedRequest).userId;
    const prev = db
      .prepare(
        `SELECT MAX(score) AS best FROM sessions
         WHERE user_id = ? AND kind = 'practice' AND mode = ? AND duration_sec = ?`,
      )
      .get(userId, r.mode, r.durationSec) as { best: number | null };

    db.prepare(
      `INSERT INTO sessions (user_id, kind, mode, duration_sec, adaptive, score, correct, attempts, max_level, avg_ms, duration_ms)
       VALUES (?, 'practice', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
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
    // previousBest is null on the first sprint of this mode and length.
    res.status(201).json({ ok: true, previousBest: prev.best, newBest: prev.best === null || r.score > prev.best });
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
    if (!isDifficulty(r.kind, r.difficulty)) return void res.status(400).json({ error: "Unknown difficulty" });
    if (!verifyPuzzle(r.kind, r.seed, r.difficulty, { grid: r.grid, path: r.path, expressions: r.expressions })) {
      return void res.status(400).json({ error: "That doesn't solve the puzzle" });
    }

    // Cross-math keeps its plain difficulty as the mode; other games are "kind:difficulty".
    const mode = r.kind === "crossmath" ? r.difficulty : `${r.kind}:${r.difficulty}`;
    db.prepare(
      `INSERT INTO sessions (user_id, kind, mode, score, correct, attempts, duration_ms, seed)
       VALUES (?, 'puzzle', ?, 1, 1, ?, ?, ?)`,
    ).run((req as AuthedRequest).userId, mode, 1 + r.mistakes, r.timeMs, r.seed);
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

    const last = duelRows.slice(0, 50).reverse();
    const ratingHistory = last.length ? [last[0].ratingAfter - last[0].ratingChange, ...last.map((d) => d.ratingAfter)] : [];

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
      dailyStreak: dailyStreak(db, userId),
      arcade: arcadeBests(userId),
      duels: {
        played: duelRows.length,
        won: count("win"),
        lost: count("loss"),
        drawn: count("draw"),
        peakRating: Math.max(user.rating, ...duelRows.map((d) => d.ratingAfter)),
        ratingHistory,
        recent: duelRows.slice(0, 10).map(({ ratingAfter: _, ...d }) => d),
      },
      recent,
      dailyRecent: db
        .prepare(
          `SELECT day, kind, score, time_ms AS timeMs FROM daily_results
           WHERE user_id = ? AND day >= date('now', '-14 days') ORDER BY day DESC, created_at DESC`,
        )
        .all(userId) as Stats["dailyRecent"],
    };
    res.json(stats);
  });

  function arcadeBests(userId: number) {
    const rows = db
      .prepare("SELECT game, MAX(score) AS best FROM arcade_results WHERE user_id = ? GROUP BY game")
      .all(userId) as { game: ArcadeGame; best: number }[];
    const out = Object.fromEntries(ARCADE_GAMES.map((g) => [g.id, 0])) as Record<ArcadeGame, number>;
    for (const r of rows) out[r.game] = r.best;
    return out;
  }

  // Public profile: rating, duel record, streak and bests. No history, no
  // password-adjacent fields, nothing that isn't already on a leaderboard.
  app.get("/api/players/:username", (req, res) => {
    const user = findByName.get(String(req.params.username).slice(0, 40)) as (UserRow & { is_bot: number }) | undefined;
    if (!user) return void res.status(404).json({ error: "No player with that name" });
    const duel = db
      .prepare(
        `SELECT COUNT(*) AS played,
                COALESCE(SUM(winner_id = @id), 0) AS won,
                COALESCE(SUM(winner_id IS NOT NULL AND winner_id <> @id), 0) AS lost,
                COALESCE(SUM(winner_id IS NULL), 0) AS drawn,
                MAX(CASE WHEN p1_id = @id THEN rating_after1 ELSE rating_after2 END) AS peak
         FROM duels WHERE p1_id = @id OR p2_id = @id`,
      )
      .get({ id: user.id }) as { played: number; won: number; lost: number; drawn: number; peak: number | null };
    const counts = db
      .prepare(
        `SELECT COALESCE(SUM(kind = 'puzzle'), 0) AS puzzles, COALESCE(SUM(kind = 'practice'), 0) AS sprints,
                MAX(CASE WHEN kind = 'practice' AND mode = 'mixed' AND duration_sec = 60 THEN score END) AS bestSprint
         FROM sessions WHERE user_id = ?`,
      )
      .get(user.id) as { puzzles: number; sprints: number; bestSprint: number | null };
    const profile: PlayerProfile = {
      username: user.username,
      rating: user.rating,
      createdAt: user.created_at,
      bot: !!user.is_bot,
      duels: {
        played: duel.played,
        won: duel.won,
        lost: duel.lost,
        drawn: duel.drawn,
        peakRating: Math.max(user.rating, duel.peak ?? 0),
      },
      puzzlesSolved: counts.puzzles,
      sprints: counts.sprints,
      bestSprint: counts.bestSprint,
      dailyStreak: dailyStreak(db, user.id),
      arcade: arcadeBests(user.id),
    };
    res.json(profile);
  });

  const arcadeBody = z.object({ game: arcadeGame, score: z.number().int().min(0) });

  app.post("/api/arcade", requireAuth, (req, res) => {
    const parsed = arcadeBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid arcade result" });
    const { game, score } = parsed.data;
    if (!isPlausibleArcadeScore(game, score)) return void res.status(400).json({ error: "That score isn't possible" });
    const userId = (req as AuthedRequest).userId;
    const before = arcadeBests(userId)[game];
    db.prepare("INSERT INTO arcade_results (user_id, game, score) VALUES (?, ?, ?)").run(userId, game, score);
    const best = Math.max(before, score);
    const { ahead } = db
      .prepare(
        `SELECT COUNT(*) AS ahead FROM (SELECT user_id, MAX(score) AS b FROM arcade_results WHERE game = ? GROUP BY user_id)
         WHERE b > ?`,
      )
      .get(game, best) as { ahead: number };
    const { of } = db
      .prepare("SELECT COUNT(DISTINCT user_id) AS of FROM arcade_results WHERE game = ?")
      .get(game) as { of: number };
    const result: ArcadeResult = { best, rank: ahead + 1, of, newBest: score > before };
    res.status(201).json(result);
  });

  registerCompetitionRoutes(app, db);

  // Anything else under /api is a JSON 404, so a typo in a client call doesn't
  // fall through to the web app's HTML page.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "No such API route" });
  });

  return app;
}
