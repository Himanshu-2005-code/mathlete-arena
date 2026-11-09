import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type Socket, io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  generateFutoshiki,
  generateHectoc,
  generateKiller,
  generateKenKen,
  generateMake24,
  generateMaze,
  generateSudoku,
  sequenceQuestion,
} from "@mathlete/shared";
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
    minAnswerMs: 0,
    wrongLockMs: 0,
    reconnectMs: 0,
    lateMs: 0,
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
  /** A new connection for an existing player, like a page reconnecting, and the first `event` it gets. */
  async function reconnect<E extends keyof ServerToClientEvents>(token: string, event: E) {
    const sock: Client = connect(url, { auth: { token }, transports: ["websocket"] });
    cleanups.push(() => sock.close());
    const got = once(sock, event);
    await new Promise<void>((r) => sock.on("connect", () => r()));
    return { sock, got };
  }
  return { app, db, player, reconnect };
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
    expect(stats.duels).toMatchObject({ played: 1, won: 1, lost: 0, peakRating: 1016, ratingHistory: [1000, 1016] });
    expect(stats.duels.recent[0]).toMatchObject({ opponent: "bobby", you: 3, opponentScore: 1, outcome: "win" });

    const board = (await request(app).get("/api/leaderboard?kind=rating")).body;
    expect(board.rows.map((r: { username: string }) => r.username)).toEqual(["alice", "bobby"]);
  });

  it("locks out guessing", async () => {
    const { player } = await setup(3000, { wrongLockMs: 400 });
    const a = await player("guesser");
    const b = await player("steady");
    const startA = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const da = await startA;
    await sleep(da.startsAt - Date.now() + 20);
    const right = (i: number) => ({ index: i, value: sequenceQuestion(da.seed, i).answer });
    let progress = 0;
    a.sock.on("duel:progress", () => progress++);

    a.sock.emit("duel:answer", right(0));
    await sleep(60);
    expect(progress).toBe(1);

    // A wrong guess locks the player out, so the right answer straight after is ignored...
    await sleep(170);
    a.sock.emit("duel:answer", { index: 1, value: right(1).value + 1 });
    await sleep(20);
    a.sock.emit("duel:answer", right(1));
    await sleep(60);
    expect(progress).toBe(1);

    // ...until the lockout ends.
    await sleep(350);
    a.sock.emit("duel:answer", right(1));
    await sleep(60);
    expect(progress).toBe(2);
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

  it("sends the server clock with the start, and sends an app that got ahead back to the right question", async () => {
    // A budget of one answer per 150 ms with no bunching allowed, so the second of two back-to-back answers is refused.
    const { player } = await setup(3000, { minAnswerMs: 150, answerBurst: 1 });
    const a = await player("fastfinger");
    const b = await player("opponent9");
    const startA = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const da = await startA;
    expect(Math.abs(da.serverNow - Date.now())).toBeLessThan(1000);
    expect(da.endsAt - da.startsAt).toBe(3000);
    await sleep(da.startsAt - Date.now() + 200);
    const right = (i: number) => ({ index: i, value: sequenceQuestion(da.seed, i).answer });

    // Question 0 counts; question 1 arrives too soon and doesn't; the app has
    // already moved on to question 2, so the server sends it back to question 1.
    const progressed = once(a.sock, "duel:progress");
    a.sock.emit("duel:answer", right(0));
    expect(await progressed).toMatchObject({ you: 1, yourIndex: 1 });
    const back = once(a.sock, "duel:resync");
    a.sock.emit("duel:answer", right(1));
    a.sock.emit("duel:answer", right(2));
    expect(await back).toEqual({ you: 1, opponent: 0, yourIndex: 1 });

    // Answering question 1 again after that counts, so play carries on normally.
    await sleep(200);
    const again = once(a.sock, "duel:progress");
    a.sock.emit("duel:answer", right(1));
    expect(await again).toMatchObject({ you: 2, yourIndex: 2 });
  });

  it("counts real answers that the network delivers bunched together", async () => {
    // Real-world settings: a far-away player's answers, typed 300-400 ms
    // apart, can still reach the server a few milliseconds apart.
    const { player } = await setup(5000, { minAnswerMs: 120 });
    const a = await player("farfaraway");
    const b = await player("nearby01");
    const startA = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const da = await startA;
    let resyncs = 0;
    a.sock.on("duel:resync", () => resyncs++);
    await sleep(da.startsAt - Date.now() + 400);
    const right = (i: number) => ({ index: i, value: sequenceQuestion(da.seed, i).answer });
    let last = 0;
    a.sock.on("duel:progress", (p) => (last = p.you));
    for (const burst of [[0, 1], [2, 3, 4], [5], [6, 7]]) {
      for (const i of burst) a.sock.emit("duel:answer", right(i));
      await sleep(burst.length * 350);
    }
    await sleep(100);
    expect(resyncs).toBe(0);
    expect(last).toBe(8);
  });

  it("still stops a script answering far faster than anyone can type", async () => {
    const { player } = await setup(5000, { minAnswerMs: 120 });
    const a = await player("speedbot1");
    const b = await player("honest01");
    const startA = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const da = await startA;
    await sleep(da.startsAt - Date.now() + 400);
    let last = 0;
    a.sock.on("duel:progress", (p) => (last = p.you));
    // A script fires 40 answers in one second. A person can't keep up ~8 a second.
    for (let i = 0; i < 40; i++) {
      a.sock.emit("duel:answer", { index: last, value: sequenceQuestion(da.seed, last).answer });
      await sleep(25);
    }
    expect(last).toBeLessThan(15);
  });

  it("counts answers given just before time that arrive just after it", async () => {
    const { player } = await setup(800, { lateMs: 400 });
    const a = await player("lastsecond");
    const b = await player("onthebell");
    const startA = once(a.sock, "duel:start");
    const endA = once(a.sock, "duel:end");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const da = await startA;
    // Typed at the buzzer, delivered 200 ms after the server's clock ran out.
    await sleep(da.endsAt - Date.now() + 200);
    a.sock.emit("duel:answer", { index: 0, value: sequenceQuestion(da.seed, 0).answer });
    expect(await endA).toMatchObject({ you: 1, outcome: "win" });
  });

  it("lets a player who drops mid-duel reconnect and carry on, and forfeits them if they don't", async () => {
    const { player, reconnect } = await setup(3000, { reconnectMs: 400 });
    const a = await player("wobbly");
    const b = await player("steady2");
    const startA = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const da = await startA;
    await sleep(da.startsAt - Date.now() + 20);
    const progressed = once(a.sock, "duel:progress");
    a.sock.emit("duel:answer", { index: 0, value: sequenceQuestion(da.seed, 0).answer });
    await progressed;

    // Drop and come back within the window: same duel, score and question kept.
    let ended = false;
    b.sock.on("duel:end", () => (ended = true));
    a.sock.disconnect();
    await sleep(150);
    const { sock: back, got } = await reconnect(a.token, "duel:start");
    const resumed = await got;
    expect(resumed).toMatchObject({ duelId: da.duelId, resume: { you: 1, opponent: 0, yourIndex: 1 } });
    await sleep(400);
    expect(ended).toBe(false);
    const more = once(back, "duel:progress");
    back.emit("duel:answer", { index: 1, value: sequenceQuestion(da.seed, 1).answer });
    expect(await more).toMatchObject({ you: 2 });

    // Drop and stay away: it counts as leaving once the window passes.
    const endB = once(b.sock, "duel:end");
    back.disconnect();
    expect(await endB).toMatchObject({ outcome: "win", reason: "forfeit" });
  });

  it("replays a result to a player who reconnects just after missing it", async () => {
    const { player, reconnect } = await setup(600, { reconnectMs: 5000 });
    const a = await player("blinky");
    const b = await player("watcher");
    const startA = once(a.sock, "duel:start");
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    const da = await startA;
    a.sock.disconnect();
    await sleep(da.endsAt - Date.now() + 100);
    const { got } = await reconnect(a.token, "duel:end");
    expect(await got).toMatchObject({ reason: "time", outcome: "draw" });
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
    const week = (await request(app).get("/api/leaderboard?kind=weekly-sprint")).body;
    expect(week.rows.map((r: { username: string; detail: number }) => [r.username, r.detail])).toEqual([
      ["daytwo", 1],
      ["dayone", 1],
    ]);
    expect(week.rows[0].value).toBe(board.rows[0].value);

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
    expect((await declined).message).toBe("dev1 started another game.");
  });

  /** Two players who have just finished a duel against each other. */
  async function afterDuel(names: [string, string], extra: Partial<DuelOptions> = {}) {
    const ctx = await setup(300, extra);
    const a = await ctx.player(names[0]);
    const b = await ctx.player(names[1]);
    a.sock.emit("queue:join");
    b.sock.emit("queue:join");
    await Promise.all([once(a.sock, "duel:end"), once(b.sock, "duel:end")]);
    return { ...ctx, a, b };
  }

  it("reaches an opponent who refreshed the page, and the rematch is playable on both sides", async () => {
    const { a, b, reconnect } = await afterDuel(["eve1", "fay1"]);
    // Fay refreshes: her old connection closes and a new one opens.
    const { sock: fresh } = await reconnect(b.token, "presence");
    b.sock.close();
    await sleep(50);

    const offered = once(fresh, "rematch:offered");
    a.sock.emit("rematch:request");
    expect(await offered).toEqual({ from: "eve1" });

    const startA = once(a.sock, "duel:start");
    const startB = once(fresh, "duel:start");
    fresh.emit("rematch:request");
    const [da, db] = await Promise.all([startA, startB]);
    expect(db.duelId).toBe(da.duelId);

    // Fay's answers count on her new connection.
    await sleep(da.startsAt - Date.now() + 30);
    const progressed = once(fresh, "duel:progress");
    fresh.emit("duel:answer", { index: 0, value: sequenceQuestion(db.seed, 0).answer });
    expect(await progressed).toMatchObject({ you: 1 });
  });

  it("tells the asker straight away when the other player declines", async () => {
    const { a, b } = await afterDuel(["gil1", "hal1"]);
    const offered = once(b.sock, "rematch:offered");
    a.sock.emit("rematch:request");
    await offered;
    const declined = once(a.sock, "rematch:declined");
    b.sock.emit("rematch:cancel");
    expect(await declined).toEqual({ message: "hal1 declined the rematch." });
  });

  it("lets an unanswered offer lapse, telling both players", async () => {
    const { a, b } = await afterDuel(["ida1", "jon1"], { rematchMs: 500 });
    const offered = once(b.sock, "rematch:offered");
    a.sock.emit("rematch:request");
    await offered;
    const [toA, toB] = await Promise.all([once(a.sock, "rematch:declined"), once(b.sock, "rematch:declined")]);
    expect(toA.message).toBe("jon1 didn't answer in time.");
    expect(toB.message).toBe("The rematch offer expired.");
  });

  it("ignores a double click on Rematch instead of sending a stray error", async () => {
    const { a, b } = await afterDuel(["kim1", "lee1"]);
    const messages: string[] = [];
    a.sock.on("rematch:declined", (m) => messages.push(m.message));
    let offers = 0;
    b.sock.on("rematch:offered", () => offers++);
    a.sock.emit("rematch:request");
    a.sock.emit("rematch:request");
    await sleep(150);
    expect(offers).toBe(1);
    expect(messages).toEqual([]);
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
    expect(Object.keys(daily.extra).sort()).toEqual(["hectoc", "kenken", "maze", "sudoku"]);
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
    expect((await request(app).get("/api/stats").set(auth)).body.dailyRecent).toMatchObject([
      { day: today(), kind: "maze", timeMs: 42_000 },
    ]);
  });

  it("migrates an old daily table so the new kinds can be saved", async () => {
    const Database = (await import("libsql")).default;
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mathlete-")), "old.db");
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

describe("number puzzles and arcade", () => {
  async function user(app: ReturnType<typeof createApp>, name: string) {
    const t = (await request(app).post("/api/auth/register").send({ username: name, password: "secret123" })).body.token;
    return { Authorization: `Bearer ${t}` };
  }

  it("saves Hectoc and Make 24 solves only when the expressions are right", async () => {
    const { app } = await setup();
    const auth = await user(app, "mathy");
    const h = generateHectoc(21);
    const m = generateMake24(21, "hard");
    const ok = (body: object) => request(app).post("/api/results/puzzle").set(auth).send(body);
    expect((await ok({ kind: "hectoc", seed: 21, difficulty: "standard", expressions: [h.solution], timeMs: 50_000, mistakes: 0 })).status).toBe(201);
    expect((await ok({ kind: "make24", seed: 21, difficulty: "hard", expressions: m.solutions, timeMs: 90_000, mistakes: 2 })).status).toBe(201);
    expect((await ok({ kind: "hectoc", seed: 21, difficulty: "standard", expressions: ["10×10"], timeMs: 5_000, mistakes: 0 })).status).toBe(400);
    expect((await ok({ kind: "make24", seed: 21, difficulty: "hard", expressions: m.solutions.slice(0, 4), timeMs: 5_000, mistakes: 0 })).status).toBe(400);
  });

  it("puts Hectoc in the daily challenge", async () => {
    const { app } = await setup();
    const auth = await user(app, "hectic");
    const daily = (await request(app).get("/api/daily").set(auth)).body;
    expect(daily.extra.hectoc.puzzle.puzzle.digits).toHaveLength(6);
    expect(daily.extra.hectoc.puzzle.puzzle).not.toHaveProperty("solution");
    const { dailyPuzzle, today } = await import("./compete");
    const { seed } = dailyPuzzle(today(), "hectoc");
    const res = await request(app)
      .post("/api/daily/puzzle")
      .set(auth)
      .send({ kind: "hectoc", expressions: [generateHectoc(seed).solution], timeMs: 33_000 });
    expect(res.status).toBe(201);
    expect((await request(app).get("/api/leaderboard?kind=daily-hectoc")).body.rows[0]).toMatchObject({ username: "hectic" });
  });

  it("records arcade runs, ranks bests and refuses impossible scores", async () => {
    const { app } = await setup();
    const a = await user(app, "flashy");
    const b = await user(app, "memo1");
    const post = (auth: Record<string, string>, body: object) => request(app).post("/api/arcade").set(auth).send(body);
    expect((await post(a, { game: "flash", score: 6 })).body).toMatchObject({ best: 6, rank: 1, of: 1, newBest: true });
    expect((await post(a, { game: "flash", score: 4 })).body).toMatchObject({ best: 6, newBest: false });
    expect((await post(b, { game: "flash", score: 8 })).body).toMatchObject({ best: 8, rank: 1, of: 2 });
    expect((await post(b, { game: "flash", score: 11 })).status).toBe(400);
    expect((await post(b, { game: "memory", score: 9 })).status).toBe(201);

    const board = (await request(app).get("/api/leaderboard?kind=arcade-flash")).body;
    expect(board.rows).toEqual([
      { rank: 1, username: "memo1", value: 8, detail: 1 },
      { rank: 2, username: "flashy", value: 6, detail: 2 },
    ]);
    expect((await request(app).get("/api/stats").set(b)).body.arcade).toEqual({
      flash: 8,
      memory: 9,
      truefalse: 0,
      compare: 0,
      sign: 0,
    });
  });

  it("limits sign-in attempts and sets basic security headers", async () => {
    const { app } = await setup();
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await request(app).post("/api/auth/login").send({ username: "nobody", password: "wrong-pass" })).status;
    }
    expect(last).toBe(429);
    const health = await request(app).get("/api/health");
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("Killer Sudoku, Futoshiki and blitz", () => {
  async function user(app: ReturnType<typeof createApp>, name: string) {
    const t = (await request(app).post("/api/auth/register").send({ username: name, password: "secret123" })).body.token;
    return { Authorization: `Bearer ${t}` };
  }

  it("verifies Killer Sudoku and Futoshiki solves, and keeps them out of the daily challenge", async () => {
    const { app } = await setup();
    const auth = await user(app, "griddy");
    const k = generateKiller(31);
    const f = generateFutoshiki(31, "hard");
    const post = (body: object) => request(app).post("/api/results/puzzle").set(auth).send(body);
    expect((await post({ kind: "killer", seed: 31, difficulty: "easy", grid: k.solution, timeMs: 120_000, mistakes: 0 })).status).toBe(201);
    expect((await post({ kind: "futoshiki", seed: 31, difficulty: "hard", grid: f.solution, timeMs: 90_000, mistakes: 1 })).status).toBe(201);
    const wrong = f.solution.map((row) => [...row].reverse());
    expect((await post({ kind: "futoshiki", seed: 31, difficulty: "hard", grid: wrong, timeMs: 9_000, mistakes: 0 })).status).toBe(400);
    const daily = await request(app).post("/api/daily/puzzle").set(auth).send({ kind: "killer", grid: k.solution, timeMs: 9_000 });
    expect(daily.status).toBe(400);
    expect(daily.body.error).toMatch(/isn't part of the daily challenge/);
  });

  it("saves blitz rounds on their own leaderboards", async () => {
    const { app } = await setup();
    const auth = await user(app, "blitzer");
    for (const game of ["truefalse", "compare", "sign"]) {
      expect((await request(app).post("/api/arcade").set(auth).send({ game, score: 42 })).status).toBe(201);
    }
    expect((await request(app).post("/api/arcade").set(auth).send({ game: "sign", score: 500 })).status).toBe(400);
    const board = (await request(app).get("/api/leaderboard?kind=arcade-compare")).body;
    expect(board.rows).toEqual([{ rank: 1, username: "blitzer", value: 42, detail: 1 }]);
    expect((await request(app).get("/api/stats").set(auth)).body.arcade).toMatchObject({ truefalse: 42, compare: 42, sign: 42 });
  });

  it("migrates an older arcade table so the new games can be saved", async () => {
    const Database = (await import("libsql")).default;
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mathlete-")), "arcade.db");
    const old = new Database(file);
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 1000, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users (username, password_hash) VALUES ('old', 'x');
      CREATE TABLE arcade_results (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      game TEXT NOT NULL CHECK (game IN ('flash', 'memory')), score INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO arcade_results (user_id, game, score) VALUES (1, 'flash', 7);`);
    old.close();
    const db = openDb(file);
    db.prepare("INSERT INTO arcade_results (user_id, game, score) VALUES (1, 'sign', 30)").run();
    expect(db.prepare("SELECT game, score FROM arcade_results ORDER BY id").all()).toEqual([
      { game: "flash", score: 7 },
      { game: "sign", score: 30 },
    ]);
  });
});
