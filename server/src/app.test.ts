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
