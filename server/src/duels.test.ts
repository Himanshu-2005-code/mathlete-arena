import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type Socket, io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { type ClientToServerEvents, type ServerToClientEvents, sequenceQuestion } from "@matik/shared";
import { createApp } from "./app";
import { allowedGap } from "./duels";
import { openDb } from "./db";
import { attachSocket } from "./socket";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

async function setup(durationMs = 1500) {
  const db = openDb(":memory:");
  const app = createApp(db);
  const server = http.createServer(app);
  const { io, duels } = attachSocket(server, db, { durationMs, countdownMs: 100, matchIntervalMs: 50 });
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

    const mine = (await request(app).get("/api/daily").set("Authorization", `Bearer ${t1}`)).body.mine;
    expect(mine.sprint.correct).toBe(5);
    expect(mine.puzzle).toBeNull();
  });
});
