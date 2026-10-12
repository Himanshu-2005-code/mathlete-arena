import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type Socket, io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  generateKenKen,
  generateMaze,
  generateSudoku,
  sequenceQuestion,
} from "@matik/shared";
import { createApp } from "./app";
import { type DuelOptions, allowedGap } from "./duels";
import { openDb } from "./db";
import { attachSocket } from "./socket";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

async function setup(durationMs = 1500, extra: DuelOptions = {}) {
  const db = openDb(":memory:");
  const app = createApp(db);
  const server = http.createServer(app);
  const { io, duels } = attachSocket(server, db, {
    durationMs,
    countdownMs: 100,
    matchIntervalMs: 50,
    botAfterMs: 0,
    ...extra,
  });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;
  cleanups.push(() => {
    duels.close();
    io.close();
    server.close();
  });

  async function player(username: string) {
    const res = await request(app).post("/api/auth/register").send({ username, password: "secret123" });
    const sock: Client = connect(url, { auth: { token: res.body.token }, transports: ["websocket"] });
    cleanups.push(() => sock.close());
    await new Promise<void>((r) => sock.on("connect", () => r()));
    return { sock, token: res.body.token as string };
  }
  return { app, db, player };
}

const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => (s as any).once(e, r));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("duels", () => {
  it("widens the rating gap the longer players wait", () => {
    expect(allowedGap(0)).toBe(100);
    expect(allowedGap(10_000)).toBe(600);
  });

  it("matches two players, scores answers on the server, and updates ratings", async () => {
    const { app, player } = await setup();
    const a = await player("alice");
    const b = await player("bobby");

    const startA = once(a.sock, "duel:start");
    const startB = once(b.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const [da, db] = await Promise.all([startA, startB]);
    expect(da.seed).toBe(db.seed);
    expect(da.opponent.username).toBe("bobby");

    await sleep(da.startsAt - Date.now() + 20);

    // Alice answers three correctly; Bob gets one right and one wrong.
    const wrong = once(b.sock, "duel:wrong");
    for (let i = 0; i < 3; i++) {
      const p = once(a.sock, "duel:progress");
      a.sock.emit("duel:answer", { index: i, value: sequenceQuestion(da.seed, i).answer });
      await p;
    }
    b.sock.emit("duel:answer", { index: 0, value: sequenceQuestion(db.seed, 0).answer + 1 });
    expect((await wrong).index).toBe(0);
    const pb = once(b.sock, "duel:progress");
    b.sock.emit("duel:answer", { index: 0, value: sequenceQuestion(db.seed, 0).answer });
    expect(await pb).toEqual({ you: 1, opponent: 3, yourIndex: 1 });
    // Replaying an old index is ignored.
    a.sock.emit("duel:answer", { index: 0, value: sequenceQuestion(da.seed, 0).answer });

    const [endA, endB] = await Promise.all([once(a.sock, "duel:end"), once(b.sock, "duel:end")]);
    expect(endA).toMatchObject({ outcome: "win", reason: "time", you: 3, opponent: 1, rating: 1016, ratingChange: 16 });
    expect(endB).toMatchObject({ outcome: "loss", you: 1, opponent: 3, rating: 984, ratingChange: -16 });

    const stats = (await request(app).get("/api/stats").set("Authorization", `Bearer ${a.token}`)).body;
    expect(stats.user.rating).toBe(1016);
    expect(stats.duels).toMatchObject({ played: 1, won: 1, lost: 0, peakRating: 1016 });
    expect(stats.duels.recent[0]).toMatchObject({ opponent: "bobby", you: 3, opponentScore: 1, outcome: "win" });

    const board = (await request(app).get("/api/leaderboard?kind=rating")).body;
    expect(board.rows.map((r: { username: string }) => r.username)).toEqual(["alice", "bobby"]);
  });

  it("runs friend challenges and treats leaving as a forfeit", async () => {
    const { player } = await setup(10_000);
    const a = await player("hostess");
    const b = await player("guest1");

    const created = once(a.sock, "challenge:created");
    a.sock.emit("challenge:create");
    const { code } = await created;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const bad = once(b.sock, "challenge:error");
    b.sock.emit("challenge:join", { code: "NOPE00" });
    expect((await bad).message).toMatch(/No open challenge/);

    const started = once(a.sock, "duel:start");
    b.sock.emit("challenge:join", { code: code.toLowerCase() });
    await started;

    const endA = once(a.sock, "duel:end");
    b.sock.disconnect();
    expect(await endA).toMatchObject({ outcome: "win", reason: "forfeit", ratingChange: 16 });
  });

  it("keeps far-apart ratings apart until they have waited", async () => {
    const { db, player } = await setup();
    const a = await player("strong");
    const b = await player("newbie");
    db.prepare("UPDATE users SET rating = 1500 WHERE username = 'strong'").run();

    let started = false;
    a.sock.on("duel:start", () => (started = true));
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    await sleep(400);
    expect(started).toBe(false);
  });
});

describe("daily challenge", () => {
  it("replays sprint answers, ranks players, and keeps only the first attempt", async () => {
    const { app } = await setup();
    const reg = async (u: string) =>
      (await request(app).post("/api/auth/register").send({ username: u, password: "secret123" })).body.token as string;
    const t1 = await reg("dayone");
    const t2 = await reg("daytwo");

    const daily = (await request(app).get("/api/daily")).body;
    expect(daily.puzzle.solution).toBeUndefined();
    const seed = daily.sprintSeed;
    const answers = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ index: i, value: sequenceQuestion(seed, i).answer }));

    const bad = await request(app)
      .post("/api/daily/sprint")
      .set("Authorization", `Bearer ${t1}`)
      .send({ answers: [{ index: 0, value: -5 }] });
    expect(bad.status).toBe(400);

    const r1 = await request(app).post("/api/daily/sprint").set("Authorization", `Bearer ${t1}`).send({ answers: answers(5) });
    expect(r1.status).toBe(201);
    const withSkip = [...answers(8), { index: 8, value: null }, { index: 9, value: sequenceQuestion(seed, 9).answer }];
    const r2 = await request(app).post("/api/daily/sprint").set("Authorization", `Bearer ${t2}`).send({ answers: withSkip });
    expect(r2.body.result).toMatchObject({ correct: 9, rank: 1, of: 2 });

    const again = await request(app).post("/api/daily/sprint").set("Authorization", `Bearer ${t1}`).send({ answers: answers(20) });
    expect(again.body.firstAttempt).toBe(false);
    expect(again.body.result).toMatchObject({ correct: 5, rank: 2 });

    const board = (await request(app).get("/api/leaderboard?kind=daily-sprint")).body;
    expect(board.rows.map((r: { username: string }) => r.username)).toEqual(["daytwo", "dayone"]);

    const info = (await request(app).get("/api/daily").set("Authorization", `Bearer ${t1}`)).body;
    expect(info.mine.sprint.correct).toBe(5);
    expect(info.mine.puzzle).toBeNull();
    expect(info.streak).toEqual({ current: 1, best: 1 });
    expect((await request(app).get("/api/daily")).body.streak).toBeNull();
  });
});

describe("computer opponents", () => {
  it("steps in when nobody else is searching, plays on the server, and moves ratings", async () => {
    const { app, player } = await setup(5000, { botAfterMs: 150, botRand: () => 0.5 });
    const a = await player("lonely");

    const start = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    const d = await start;
    expect(d.opponent.bot).toBe(true);
    expect(d.opponent.username).toBe("euler_bot"); // closest to 1000
    expect(d.you.bot).toBeUndefined();

    await sleep(d.startsAt - Date.now() + 20);
    for (let i = 0; i < 4; i++) {
      const p = once(a.sock, "duel:progress");
      a.sock.emit("duel:answer", { index: i, value: sequenceQuestion(d.seed, i).answer });
      await p;
    }

    const end = await once(a.sock, "duel:end");
    expect(end.you).toBe(4);
    expect(end.opponent).toBeGreaterThanOrEqual(1); // the bot scored on its own
    expect(end.outcome).toBe("win");
    expect(end.ratingChange).toBeGreaterThan(0);

    const board = (await request(app).get("/api/leaderboard?kind=rating")).body;
    const bot = board.rows.find((r: { username: string }) => r.username === "euler_bot");
    expect(bot).toMatchObject({ bot: true, detail: 1 });
    expect(bot.value).toBeLessThan(950);
  }, 15_000);

  it("waits for a human first and never pairs bots when turned off", async () => {
    const { player } = await setup(1500, { botAfterMs: 0 });
    const a = await player("patient");
    let started = false;
    a.sock.on("duel:start", () => (started = true));
    a.sock.emit("queue:join");
    await sleep(500);
    expect(started).toBe(false);
  });

  it("keeps _bot usernames for computer opponents", async () => {
    const { app } = await setup();
    const res = await request(app).post("/api/auth/register").send({ username: "sneaky_bot", password: "secret123" });
    expect(res.status).toBe(400);
    const login = await request(app).post("/api/auth/login").send({ username: "euler_bot", password: "anything1" });
    expect(login.status).toBe(401);
  });
});

describe("rematches", () => {
  it("starts a new duel when both players ask, and tells the asker while waiting", async () => {
    const { player } = await setup(300);
    const a = await player("ann");
    const b = await player("ben");
    const startA = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const first = await startA;
    await Promise.all([once(a.sock, "duel:end"), once(b.sock, "duel:end")]);

    const waiting = once(a.sock, "rematch:waiting");
    const offered = once(b.sock, "rematch:offered");
    a.sock.emit("rematch:request");
    expect(await waiting).toEqual({ opponent: "ben" });
    expect(await offered).toEqual({ from: "ann" });

    const again = once(a.sock, "duel:start");
    b.sock.emit("rematch:request");
    const second = await again;
    expect(second.opponent.username).toBe("ben");
    expect(second.seed).not.toBe(first.seed);
  });

  it("tells the asker when the other player declines by looking for someone else", async () => {
    const { player } = await setup(300);
    const a = await player("cara");
    const b = await player("dev1");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    await Promise.all([once(a.sock, "duel:end"), once(b.sock, "duel:end")]);

    const offered = once(b.sock, "rematch:offered");
    a.sock.emit("rematch:request");
    await offered;
    const declined = once(a.sock, "rematch:declined");
    b.sock.emit("queue:join");
    expect((await declined).message).toMatch(/declined/);
  });

  it("lets you rematch a computer opponent straight away", async () => {
    const { player } = await setup(300, { botAfterMs: 50, botRand: () => 0.5 });
    const a = await player("solo1");
    const first = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    const d1 = await first;
    await once(a.sock, "duel:end");
    const second = once(a.sock, "duel:start");
    a.sock.emit("rematch:request");
    const d2 = await second;
    expect(d2.opponent).toMatchObject({ username: d1.opponent.username, bot: true });
  });
});

describe("new puzzle games", () => {
  it("verifies and saves KenKen, Sudoku and Math Maze solves, with profile labels", async () => {
    const { app } = await setup();
    const token = (await request(app).post("/api/auth/register").send({ username: "puzzler", password: "secret123" }))
      .body.token as string;
    const auth = { Authorization: `Bearer ${token}` };
    const k = generateKenKen(11, "hard");
    const s = generateSudoku(11, "easy");
    const m = generateMaze(11, "easy");

    const ok = [
      { kind: "kenken", seed: 11, difficulty: "hard", grid: k.solution, timeMs: 90_000, mistakes: 0 },
      { kind: "sudoku", seed: 11, difficulty: "easy", grid: s.solution, timeMs: 60_000, mistakes: 1 },
      { kind: "maze", seed: 11, difficulty: "easy", path: m.solution, timeMs: 30_000, mistakes: 0 },
    ];
    for (const body of ok) expect((await request(app).post("/api/results/puzzle").set(auth).send(body)).status).toBe(201);

    const wrongPath = await request(app)
      .post("/api/results/puzzle")
      .set(auth)
      .send({ kind: "maze", seed: 11, difficulty: "easy", path: [[0, 0]], timeMs: 1000, mistakes: 0 });
    expect(wrongPath.status).toBe(400);
    const badDifficulty = await request(app)
      .post("/api/results/puzzle")
      .set(auth)
      .send({ kind: "kenken", seed: 11, difficulty: "medium", grid: k.solution, timeMs: 1000, mistakes: 0 });
    expect(badDifficulty.status).toBe(400);

    const stats = (await request(app).get("/api/stats").set(auth)).body;
    expect(stats.puzzles.solved).toBe(3);
    expect(stats.puzzles.fastestByDifficulty.map((f: { difficulty: string }) => f.difficulty).sort()).toEqual([
      "kenken:hard",
      "maze:easy",
      "sudoku:easy",
    ]);
  });

  it("serves the daily KenKen, Sudoku and Maze and ranks solves on their own boards", async () => {
    const { app } = await setup();
    const token = (await request(app).post("/api/auth/register").send({ username: "dailyp", password: "secret123" }))
      .body.token as string;
    const auth = { Authorization: `Bearer ${token}` };
    const daily = (await request(app).get("/api/daily").set(auth)).body;
    expect(Object.keys(daily.extra).sort()).toEqual(["kenken", "maze", "sudoku"]);
    expect(daily.extra.kenken.puzzle.puzzle).not.toHaveProperty("solution");
    expect(daily.extra.maze.mine).toBeNull();

    // Recreate today's maze the way the server does, then solve it.
    const { dailyPuzzle, today } = await import("./compete");
    const { seed, difficulty } = dailyPuzzle(today(), "maze");
    const maze = generateMaze(seed, difficulty as "easy");
    const res = await request(app).post("/api/daily/puzzle").set(auth).send({ kind: "maze", path: maze.solution, timeMs: 42_000 });
    expect(res.status).toBe(201);
    expect(res.body.result).toMatchObject({ rank: 1, of: 1, timeMs: 42_000 });

    const board = (await request(app).get("/api/leaderboard?kind=daily-maze")).body;
    expect(board.rows).toEqual([{ rank: 1, username: "dailyp", value: 42_000, detail: null }]);
    expect((await request(app).get("/api/leaderboard?kind=daily-kenken")).body.rows).toEqual([]);
    expect((await request(app).get("/api/daily").set(auth)).body.extra.maze.mine.timeMs).toBe(42_000);
  });

  it("migrates an old daily table so the new kinds can be saved", async () => {
    const Database = (await import("better-sqlite3")).default;
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "matik-")), "old.db");
    const old = new Database(file);
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 1000, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users (username, password_hash) VALUES ('early', 'x');
      CREATE TABLE daily_results (user_id INTEGER NOT NULL, day TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('sprint', 'puzzle')), score INTEGER NOT NULL, correct INTEGER NOT NULL,
      time_ms INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, day, kind));
      INSERT INTO daily_results (user_id, day, kind, score, correct, time_ms) VALUES (1, '2026-10-01', 'puzzle', 1, 1, 5000);`);
    old.close();
    const db = openDb(file);
    db.prepare("INSERT INTO daily_results (user_id, day, kind, score, correct, time_ms) VALUES (1, '2026-10-02', 'kenken', 1, 1, 9000)").run();
    expect((db.prepare("SELECT COUNT(*) AS n FROM daily_results").get() as { n: number }).n).toBe(2);
    // The rating column and bot flag were added on top of the old users table too.
    expect(db.prepare("SELECT is_bot, rating FROM users WHERE id = 1").get()).toEqual({ is_bot: 0, rating: 1000 });
  });
});
