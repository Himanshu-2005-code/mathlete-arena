import request from "supertest";
import { describe, expect, it } from "vitest";
import { generateCrossMath } from "@matik/shared";
import { createApp } from "./app";
import { openDb } from "./db";

function setup() {
  return createApp(openDb(":memory:"));
}

async function register(app: ReturnType<typeof setup>, username = "himanshu") {
  const res = await request(app).post("/api/auth/register").send({ username, password: "secret123" });
  return res.body.token as string;
}

describe("health", () => {
  it("reports the database and version", async () => {
    const res = await request(setup()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: "ok", version: "0.1.0" });
    expect(typeof res.body.uptimeSec).toBe("number");
  });
});

describe("unknown API routes", () => {
  it("answer with a JSON 404 and no caching", async () => {
    const res = await request(setup()).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "No such API route" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("compression", () => {
  it("gzips large replies when the client accepts it", async () => {
    const res = await request(setup()).get("/api/daily").set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
  });
});

describe("auth", () => {
  it("registers, rejects duplicates, and logs in", async () => {
    const app = setup();
    const reg = await request(app).post("/api/auth/register").send({ username: "himanshu", password: "secret123" });
    expect(reg.status).toBe(201);
    expect(reg.body.user.username).toBe("himanshu");

    const dup = await request(app).post("/api/auth/register").send({ username: "HIMANSHU", password: "secret123" });
    expect(dup.status).toBe(409);

    const bad = await request(app).post("/api/auth/login").send({ username: "himanshu", password: "wrongpass" });
    expect(bad.status).toBe(401);

    const ok = await request(app).post("/api/auth/login").send({ username: "himanshu", password: "secret123" });
    expect(ok.status).toBe(200);
    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${ok.body.token}`);
    expect(me.body.user.username).toBe("himanshu");
  });

  it("validates usernames and protects routes", async () => {
    const app = setup();
    const res = await request(app).post("/api/auth/register").send({ username: "a b", password: "secret123" });
    expect(res.status).toBe(400);
    expect((await request(app).get("/api/stats")).status).toBe(401);
  });
});

describe("password length", () => {
  it("refuses new passwords bcrypt would truncate, counting bytes not letters", async () => {
    const app = setup();
    const long = "a".repeat(73);
    const r1 = await request(app).post("/api/auth/register").send({ username: "longpw", password: long });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/72 bytes/);
    // 24 three-byte characters is 72 bytes: allowed. 25 is 75: refused.
    expect((await request(app).post("/api/auth/register").send({ username: "hindi1", password: "क".repeat(24) })).status).toBe(201);
    expect((await request(app).post("/api/auth/register").send({ username: "hindi2", password: "क".repeat(25) })).status).toBe(400);
    expect((await request(app).post("/api/auth/register").send({ username: "short", password: "abc" })).status).toBe(400);
    const token = await register(app, "changer");
    const change = await request(app)
      .post("/api/auth/password")
      .set({ Authorization: `Bearer ${token}` })
      .send({ current: "secret123", next: long });
    expect(change.status).toBe(400);
  });
});

describe("password change", () => {
  it("needs the current password and then accepts the new one", async () => {
    const app = setup();
    const token = await register(app);
    const auth = { Authorization: `Bearer ${token}` };
    const wrong = await request(app).post("/api/auth/password").set(auth).send({ current: "nope", next: "brandnew1" });
    expect(wrong.status).toBe(403);
    const short = await request(app).post("/api/auth/password").set(auth).send({ current: "secret123", next: "abc" });
    expect(short.status).toBe(400);
    const ok = await request(app).post("/api/auth/password").set(auth).send({ current: "secret123", next: "brandnew1" });
    expect(ok.status).toBe(200);
    const old = await request(app).post("/api/auth/login").send({ username: "himanshu", password: "secret123" });
    expect(old.status).toBe(401);
    const fresh = await request(app).post("/api/auth/login").send({ username: "himanshu", password: "brandnew1" });
    expect(fresh.status).toBe(200);
    expect((await request(app).post("/api/auth/password").send({ current: "a", next: "bbbbbb" })).status).toBe(401);
  });
});

describe("public player pages", () => {
  it("shows public figures only, and 404s for unknown names", async () => {
    const app = setup();
    const token = await register(app);
    await request(app).post("/api/arcade").set({ Authorization: `Bearer ${token}` }).send({ game: "memory", score: 9 });
    const res = await request(app).get("/api/players/HIMANSHU");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "himanshu", rating: 1000, bot: false, puzzlesSolved: 0, bestSprint: null });
    expect(res.body.arcade.memory).toBe(9);
    expect(res.body.duels).toEqual({ played: 0, won: 0, lost: 0, drawn: 0, peakRating: 1000 });
    expect(res.body.password_hash).toBeUndefined();
    expect(res.body.id).toBeUndefined();
    expect((await request(app).get("/api/players/nobody_here")).status).toBe(404);
  });
});

describe("practice score checks", () => {
  it("rejects scores the answers can't add up to", async () => {
    const app = setup();
    const auth = { Authorization: `Bearer ${await register(app)}` };
    const sprint = { mode: "mixed", adaptive: true, durationSec: 30, maxLevel: 3, avgMs: 900 };
    const ok = await request(app).post("/api/results/practice").set(auth).send({ ...sprint, score: 30, correct: 10, attempts: 12 });
    expect(ok.status).toBe(201);
    const inflated = await request(app).post("/api/results/practice").set(auth).send({ ...sprint, score: 31, correct: 10, attempts: 12 });
    expect(inflated.status).toBe(400);
    const tooMany = await request(app)
      .post("/api/results/practice")
      .set(auth)
      .send({ ...sprint, maxLevel: 1, score: 151, correct: 151, attempts: 151 });
    expect(tooMany.status).toBe(400);
  });
});

describe("practice personal bests", () => {
  it("reports the previous best and whether this one beats it", async () => {
    const app = setup();
    const auth = { Authorization: `Bearer ${await register(app)}` };
    const sprint = (score: number) => ({
      mode: "mixed", adaptive: true, durationSec: 60, score, correct: 30, attempts: 32, maxLevel: 2, avgMs: 900,
    });
    const first = await request(app).post("/api/results/practice").set(auth).send(sprint(40));
    expect(first.body).toMatchObject({ previousBest: null, newBest: true });
    const lower = await request(app).post("/api/results/practice").set(auth).send(sprint(30));
    expect(lower.body).toMatchObject({ previousBest: 40, newBest: false });
    const higher = await request(app).post("/api/results/practice").set(auth).send(sprint(55));
    expect(higher.body).toMatchObject({ previousBest: 40, newBest: true });
  });
});

describe("data export", () => {
  it("returns the player's own records and nothing secret", async () => {
    const app = setup();
    const auth = { Authorization: `Bearer ${await register(app)}` };
    await request(app).post("/api/arcade").set(auth).send({ game: "memory", score: 6 });
    const res = await request(app).get("/api/me/export").set(auth);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("matik-himanshu.json");
    expect(res.body.account.username).toBe("himanshu");
    expect(res.body.arcade).toMatchObject([{ game: "memory", score: 6 }]);
    expect(JSON.stringify(res.body)).not.toContain("password");
    expect((await request(app).get("/api/me/export")).status).toBe(401);
  });
});

describe("account deletion", () => {
  it("needs the password, then removes the account and its token stops working", async () => {
    const app = setup();
    const token = await register(app);
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post("/api/arcade").set(auth).send({ game: "memory", score: 7 });
    expect((await request(app).post("/api/auth/delete").set(auth).send({ password: "nope" })).status).toBe(403);
    expect((await request(app).post("/api/auth/delete").set(auth).send({ password: "secret123" })).status).toBe(200);
    expect((await request(app).get("/api/me").set(auth)).status).toBe(401);
    expect((await request(app).get("/api/leaderboard?kind=arcade-memory")).body.rows).toEqual([]);
    const again = await request(app).post("/api/auth/register").send({ username: "himanshu", password: "secret123" });
    expect(again.status).toBe(201);
  });
});

describe("results and stats", () => {
  it("records practice sprints and verified puzzles", async () => {
    const app = setup();
    const token = await register(app);
    const auth = { Authorization: `Bearer ${token}` };

    const practice = {
      mode: "mixed",
      adaptive: true,
      durationSec: 60,
      score: 42,
      correct: 18,
      attempts: 20,
      maxLevel: 5,
      avgMs: 2100,
    };
    expect((await request(app).post("/api/results/practice").set(auth).send(practice)).status).toBe(201);
    await request(app).post("/api/results/practice").set(auth).send({ ...practice, score: 50 });

    const p = generateCrossMath(1234, "medium");
    const wrong = p.solution.map((row) => row.map(() => 1));
    const rejected = await request(app)
      .post("/api/results/puzzle")
      .set(auth)
      .send({ seed: 1234, difficulty: "medium", grid: wrong, timeMs: 1000, mistakes: 0 });
    expect(rejected.status).toBe(400);

    const solved = await request(app)
      .post("/api/results/puzzle")
      .set(auth)
      .send({ seed: 1234, difficulty: "medium", grid: p.solution, timeMs: 45_000, mistakes: 2 });
    expect(solved.status).toBe(201);

    const stats = (await request(app).get("/api/stats").set(auth)).body;
    expect(stats.practice.sessions).toBe(2);
    expect(stats.practice.accuracy).toBeCloseTo(0.9);
    expect(stats.practice.bestByMode).toEqual([{ mode: "mixed", durationSec: 60, best: 50 }]);
    expect(stats.puzzles.solved).toBe(1);
    expect(stats.puzzles.fastestByDifficulty).toEqual([{ difficulty: "medium", bestMs: 45_000 }]);
    expect(stats.recent).toHaveLength(3);
  });

  it("serves puzzles without their solution", async () => {
    const res = await request(setup()).get("/api/puzzles/crossmath?difficulty=hard");
    expect(res.body.solution).toBeUndefined();
    expect(res.body.given.flat().filter((v: number | null) => v === null)).toHaveLength(7);
  });
});

describe("leaderboard rank outside the top 50", () => {
  it("adds the signed-in player's own row", async () => {
    const db = openDb(":memory:");
    const app = createApp(db);
    const addUser = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'x')");
    const addScore = db.prepare("INSERT INTO arcade_results (user_id, game, score) VALUES (?, 'memory', ?)");
    for (let i = 0; i < 55; i++) addScore.run(Number(addUser.run(`player${i}`).lastInsertRowid), 20 + i);
    const token = await register(app);
    await request(app).post("/api/arcade").set({ Authorization: `Bearer ${token}` }).send({ game: "memory", score: 3 });

    const anon = (await request(app).get("/api/leaderboard?kind=arcade-memory")).body;
    expect(anon.rows).toHaveLength(50);
    expect(anon.me).toBeUndefined();

    const mine = (
      await request(app).get("/api/leaderboard?kind=arcade-memory").set({ Authorization: `Bearer ${token}` })
    ).body;
    expect(mine.me).toMatchObject({ rank: 56, username: "himanshu", value: 3 });
    expect(mine.me.uid).toBeUndefined();
  });
});

describe("score submission rate limit", () => {
  it("turns away a flood of submissions from one address", async () => {
    const app = setup();
    const auth = { Authorization: `Bearer ${await register(app)}` };
    const statuses: number[] = [];
    for (let i = 0; i < 65; i++) {
      statuses.push((await request(app).post("/api/arcade").set(auth).send({ game: "memory", score: 3 })).status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 201 || s === 200)).toBe(true);
    expect(statuses.slice(60).every((s) => s === 429)).toBe(true);
    // Reading isn't limited.
    expect((await request(app).get("/api/daily")).status).toBe(200);
  });
});
