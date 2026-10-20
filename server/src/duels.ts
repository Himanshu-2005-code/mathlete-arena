import { randomInt } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  type ClientToServerEvents,
  DUEL_COUNTDOWN_MS,
  DUEL_SECONDS,
  REMATCH_WINDOW_MS,
  type DuelEndReason,
  type DuelOutcome,
  type DuelPlayerInfo,
  type ServerToClientEvents,
  eloUpdate,
  randomSeed,
  sequenceQuestion,
} from "@matik/shared";
import type { UserRow } from "./auth";
import { BOT_MISS_CHANCE, botThinkMs, ensureBots, pickBot } from "./bots";
import type { Db } from "./db";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface DuelOptions {
  durationMs?: number;
  countdownMs?: number;
  /** How often the queue looks for pairs. */
  matchIntervalMs?: number;
  /** Time in the queue before a computer opponent steps in; 0 disables bots. */
  botAfterMs?: number;
  /** Randomness for bot timing, injectable for tests. */
  botRand?: () => number;
}

interface Player extends DuelPlayerInfo {
  /** Empty for bots, which have no connection. */
  socketId: string;
}

interface Side {
  player: Player;
  score: number;
  index: number;
}

interface Duel {
  id: string;
  seed: number;
  startsAt: number;
  endsAt: number;
  sides: [Side, Side];
  timer: NodeJS.Timeout;
  botTimers: NodeJS.Timeout[];
  over: boolean;
}

/** Rating gap allowed between two queued players; widens the longer they wait. */
export function allowedGap(waitedMs: number): number {
  return 100 + 50 * Math.floor(waitedMs / 1000);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * Runs matchmaking, friend challenges and live duels.
 * The server owns the truth: it generates each question from the duel seed,
 * checks every answer, keeps the score, and decides the result.
 */
export class DuelManager {
  private queue = new Map<number, { player: Player; since: number }>();
  private challenges = new Map<string, Player>();
  private challengeByUser = new Map<number, string>();
  private duelByUser = new Map<number, Duel>();
  private online = new Map<number, Set<string>>();
  /** Each human's last opponent, for rematches. */
  private lastOpponent = new Map<number, { opponent: Player; me: Player; until: number }>();
  /** Open rematch requests: requester id -> opponent id. */
  private rematchAsks = new Map<number, number>();
  private matchTimer: NodeJS.Timeout;
  private durationMs: number;
  private countdownMs: number;
  private botAfterMs: number;
  private botRand: () => number;

  constructor(
    private io: IO,
    private db: Db,
    opts: DuelOptions = {},
  ) {
    this.durationMs = opts.durationMs ?? DUEL_SECONDS * 1000;
    this.countdownMs = opts.countdownMs ?? DUEL_COUNTDOWN_MS;
    this.botAfterMs = opts.botAfterMs ?? 10_000;
    this.botRand = opts.botRand ?? Math.random;
    if (this.botAfterMs > 0) ensureBots(db);
    this.matchTimer = setInterval(() => this.matchQueue(), opts.matchIntervalMs ?? 1000);
  }

  close() {
    clearInterval(this.matchTimer);
    for (const duel of new Set(this.duelByUser.values())) {
      clearTimeout(duel.timer);
      duel.botTimers.forEach(clearTimeout);
    }
  }

  private loadPlayer(userId: number, socketId: string): Player | null {
    const row = this.db.prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?").get(userId);
    return row ? { id: row.id, username: row.username, rating: row.rating, socketId } : null;
  }

  private broadcastPresence() {
    this.io.emit("presence", {
      online: this.online.size,
      searching: this.queue.size,
      botAfterSeconds: Math.round(this.botAfterMs / 1000),
    });
  }

  /** Send to a player's connection; bots have none. */
  private send<E extends keyof ServerToClientEvents>(
    p: Player,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    if (p.bot || !p.socketId) return;
    (this.io.to(p.socketId).emit as (e: E, ...a: Parameters<ServerToClientEvents[E]>) => boolean)(event, ...args);
  }

  /** Is this user already busy in the queue, a challenge or a duel? */
  private busy(userId: number): string | null {
    if (this.duelByUser.has(userId)) return "You're already in a duel.";
    if (this.queue.has(userId)) return "You're already looking for a match.";
    if (this.challengeByUser.has(userId)) return "You already have an open challenge.";
    return null;
  }

  attach(socket: Sock) {
    const userId: number = socket.data.userId;
    const sockets = this.online.get(userId) ?? new Set();
    sockets.add(socket.id);
    this.online.set(userId, sockets);
    this.broadcastPresence();

    socket.on("queue:join", () => {
      const busy = this.busy(userId);
      if (busy) return void socket.emit("challenge:error", { message: busy });
      const player = this.loadPlayer(userId, socket.id);
      if (!player) return;
      this.cancelRematch(userId, "cancelled");
      this.queue.set(userId, { player, since: Date.now() });
      socket.emit("queue:joined");
      this.broadcastPresence();
      this.matchQueue();
    });

    socket.on("queue:leave", () => {
      if (this.queue.get(userId)?.player.socketId !== socket.id) return;
      this.queue.delete(userId);
      socket.emit("queue:left");
      this.broadcastPresence();
    });

    socket.on("challenge:create", () => {
      const busy = this.busy(userId);
      if (busy) return void socket.emit("challenge:error", { message: busy });
      const player = this.loadPlayer(userId, socket.id);
      if (!player) return;
      let code = newCode();
      while (this.challenges.has(code)) code = newCode();
      this.challenges.set(code, player);
      this.challengeByUser.set(userId, code);
      socket.emit("challenge:created", { code });
    });

    socket.on("challenge:cancel", () => this.cancelChallenge(userId, socket.id));

    socket.on("challenge:join", ({ code } = { code: "" }) => {
      const clean = String(code ?? "").trim().toUpperCase();
      const host = this.challenges.get(clean);
      if (!host) return void socket.emit("challenge:error", { message: "No open challenge with that code." });
      if (host.id === userId) return void socket.emit("challenge:error", { message: "That's your own challenge." });
      const busy = this.busy(userId);
      if (busy) return void socket.emit("challenge:error", { message: busy });
      const guest = this.loadPlayer(userId, socket.id);
      if (!guest) return;
      this.challenges.delete(clean);
      this.challengeByUser.delete(host.id);
      this.startDuel(host, guest);
    });

    socket.on("duel:answer", (a) => this.answer(userId, socket.id, a));
    socket.on("duel:forfeit", () => this.forfeit(userId, socket.id));
    socket.on("rematch:request", () => this.requestRematch(userId, socket.id));
    socket.on("rematch:cancel", () => this.cancelRematch(userId, "cancelled"));

    socket.on("disconnect", () => {
      const set = this.online.get(userId);
      set?.delete(socket.id);
      if (!set?.size) this.online.delete(userId);
      if (this.queue.get(userId)?.player.socketId === socket.id) this.queue.delete(userId);
      this.cancelChallenge(userId, socket.id);
      this.forfeit(userId, socket.id);
      if (!this.online.has(userId)) this.cancelRematch(userId, "left");
      this.broadcastPresence();
    });
  }

  private requestRematch(userId: number, socketId: string) {
    const last = this.lastOpponent.get(userId);
    const sock = this.io.to(socketId);
    if (!last || Date.now() > last.until) {
      return void sock.emit("rematch:declined", { message: "Too late for a rematch. Find a new match instead." });
    }
    const busy = this.busy(userId);
    if (busy) return void sock.emit("rematch:declined", { message: busy });
    const me = this.loadPlayer(userId, socketId);
    if (!me) return;
    const them = last.opponent;

    // Computer opponents always say yes.
    if (them.bot) {
      const bot = this.db.prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?").get(them.id);
      if (!bot) return;
      this.startDuel(me, { id: bot.id, username: bot.username, rating: bot.rating, bot: true, socketId: "" });
      return;
    }

    if (this.rematchAsks.get(them.id) === userId) {
      // They asked first, so this is an accept.
      this.rematchAsks.delete(them.id);
      if (this.busy(them.id) || !this.online.has(them.id)) {
        return void sock.emit("rematch:declined", { message: `${them.username} is no longer available.` });
      }
      const opponent = this.loadPlayer(them.id, them.socketId);
      if (opponent) this.startDuel(opponent, me);
      return;
    }

    if (this.busy(them.id) || !this.online.has(them.id)) {
      return void sock.emit("rematch:declined", { message: `${them.username} is no longer available.` });
    }
    this.rematchAsks.set(userId, them.id);
    sock.emit("rematch:waiting", { opponent: them.username });
    this.io.to(them.socketId).emit("rematch:offered", { from: me.username });
  }

  /** Withdraw a request, and tell whoever it was aimed at (or who aimed one at us). */
  private cancelRematch(userId: number, why: "cancelled" | "left") {
    const target = this.rematchAsks.get(userId);
    const name = this.lastOpponent.get(target ?? -1)?.opponent.username ?? "Your opponent";
    if (target !== undefined) {
      this.rematchAsks.delete(userId);
      const t = this.lastOpponent.get(target);
      if (t) this.io.to(t.me.socketId).emit("rematch:declined", { message: `${name} withdrew the rematch.` });
    }
    for (const [asker, aimedAt] of this.rematchAsks) {
      if (aimedAt !== userId) continue;
      this.rematchAsks.delete(asker);
      const a = this.lastOpponent.get(asker);
      if (a) {
        const msg = why === "left" ? `${a.opponent.username} left.` : `${a.opponent.username} declined the rematch.`;
        this.io.to(a.me.socketId).emit("rematch:declined", { message: msg });
      }
    }
  }

  private cancelChallenge(userId: number, socketId: string) {
    const code = this.challengeByUser.get(userId);
    if (!code || this.challenges.get(code)?.socketId !== socketId) return;
    this.challenges.delete(code);
    this.challengeByUser.delete(userId);
  }

  /** Pair the longest-waiting players whose ratings are close enough. */
  matchQueue() {
    const now = Date.now();
    const waiting = [...this.queue.values()].sort((a, b) => a.since - b.since);
    const paired = new Set<number>();
    for (let i = 0; i < waiting.length; i++) {
      const a = waiting[i];
      if (paired.has(a.player.id)) continue;
      for (let j = i + 1; j < waiting.length; j++) {
        const b = waiting[j];
        if (paired.has(b.player.id)) continue;
        const gap = allowedGap(now - Math.min(a.since, b.since));
        if (Math.abs(a.player.rating - b.player.rating) <= gap) {
          paired.add(a.player.id);
          paired.add(b.player.id);
          this.queue.delete(a.player.id);
          this.queue.delete(b.player.id);
          this.startDuel(a.player, b.player);
          break;
        }
      }
    }

    // Nobody close enough has turned up: hand long waiters a computer opponent.
    let botMatched = false;
    if (this.botAfterMs > 0) {
      for (const w of waiting) {
        if (paired.has(w.player.id) || now - w.since < this.botAfterMs) continue;
        const bot = pickBot(this.db, w.player.rating);
        if (!bot) break;
        this.queue.delete(w.player.id);
        this.startDuel(w.player, { id: bot.id, username: bot.username, rating: bot.rating, bot: true, socketId: "" });
        botMatched = true;
      }
    }
    if (paired.size || botMatched) this.broadcastPresence();
  }

  private startDuel(a: Player, b: Player) {
    const now = Date.now();
    const duel: Duel = {
      id: `${now.toString(36)}${randomInt(1e6).toString(36)}`,
      seed: randomSeed(),
      startsAt: now + this.countdownMs,
      endsAt: now + this.countdownMs + this.durationMs,
      sides: [
        { player: a, score: 0, index: 0 },
        { player: b, score: 0, index: 0 },
      ],
      timer: setTimeout(() => this.finish(duel, "time"), this.countdownMs + this.durationMs),
      botTimers: [],
      over: false,
    };
    this.rematchAsks.delete(a.id);
    this.rematchAsks.delete(b.id);
    // Bots can play several people at once, so only humans are tracked by id.
    if (!a.bot) this.duelByUser.set(a.id, duel);
    if (!b.bot) this.duelByUser.set(b.id, duel);

    const info = (p: Player): DuelPlayerInfo => ({
      id: p.id,
      username: p.username,
      rating: p.rating,
      ...(p.bot ? { bot: true } : {}),
    });
    for (const [me, them] of [
      [a, b],
      [b, a],
    ] as const) {
      this.send(me, "duel:start", {
        duelId: duel.id,
        seed: duel.seed,
        startsAt: duel.startsAt,
        endsAt: duel.endsAt,
        you: info(me),
        opponent: info(them),
      });
    }
    for (const side of duel.sides) if (side.player.bot) this.scheduleBot(duel, side, duel.startsAt - now);
  }

  /** Queue the bot's next answer; it occasionally fumbles and takes longer. */
  private scheduleBot(duel: Duel, side: Side, delay: number) {
    const think = botThinkMs(side.player.rating, side.index, this.botRand);
    duel.botTimers.push(
      setTimeout(() => {
        if (duel.over || Date.now() > duel.endsAt) return;
        if (this.botRand() < BOT_MISS_CHANCE) return this.scheduleBot(duel, side, 0);
        this.scoreCorrect(duel, side);
        this.scheduleBot(duel, side, 0);
      }, delay + think),
    );
  }

  private other(duel: Duel, side: Side): Side {
    return duel.sides[0] === side ? duel.sides[1] : duel.sides[0];
  }

  private scoreCorrect(duel: Duel, me: Side) {
    const them = this.other(duel, me);
    me.score++;
    me.index++;
    this.send(me.player, "duel:progress", { you: me.score, opponent: them.score, yourIndex: me.index });
    this.send(them.player, "duel:progress", { you: them.score, opponent: me.score, yourIndex: them.index });
  }

  private sideOf(duel: Duel, userId: number): [Side, Side] {
    return duel.sides[0].player.id === userId ? [duel.sides[0], duel.sides[1]] : [duel.sides[1], duel.sides[0]];
  }

  private answer(userId: number, socketId: string, a: { index: number; value: number }) {
    const duel = this.duelByUser.get(userId);
    if (!duel || duel.over) return;
    const [me] = this.sideOf(duel, userId);
    if (me.player.socketId !== socketId) return;
    const now = Date.now();
    if (now < duel.startsAt || now > duel.endsAt) return;
    if (!a || a.index !== me.index || !Number.isFinite(a.value)) return;

    if (sequenceQuestion(duel.seed, me.index).answer !== a.value) {
      this.io.to(socketId).emit("duel:wrong", { index: me.index });
      return;
    }
    this.scoreCorrect(duel, me);
  }

  private forfeit(userId: number, socketId: string) {
    const duel = this.duelByUser.get(userId);
    if (!duel || duel.over) return;
    const [me] = this.sideOf(duel, userId);
    if (me.player.socketId !== socketId) return;
    this.finish(duel, "forfeit", userId);
  }

  private finish(duel: Duel, reason: DuelEndReason, forfeitedBy?: number) {
    if (duel.over) return;
    duel.over = true;
    clearTimeout(duel.timer);
    duel.botTimers.forEach(clearTimeout);
    const [s1, s2] = duel.sides;
    this.duelByUser.delete(s1.player.id);
    this.duelByUser.delete(s2.player.id);
    const until = Date.now() + REMATCH_WINDOW_MS;
    if (!s1.player.bot) this.lastOpponent.set(s1.player.id, { me: s1.player, opponent: s2.player, until });
    if (!s2.player.bot) this.lastOpponent.set(s2.player.id, { me: s2.player, opponent: s1.player, until });

    // Score for player 1: forfeits lose outright, otherwise compare correct answers.
    let result1: 0 | 0.5 | 1;
    if (forfeitedBy !== undefined) result1 = forfeitedBy === s1.player.id ? 0 : 1;
    else result1 = s1.score > s2.score ? 1 : s1.score < s2.score ? 0 : 0.5;

    // Read current ratings: they may have changed in another game since matching.
    const current = this.db.prepare<[number], { rating: number }>("SELECT rating FROM users WHERE id = ?");
    const r1 = current.get(s1.player.id)?.rating ?? s1.player.rating;
    const r2 = current.get(s2.player.id)?.rating ?? s2.player.rating;
    const [n1, n2] = eloUpdate(r1, r2, result1);
    const winnerId = result1 === 1 ? s1.player.id : result1 === 0 ? s2.player.id : null;

    // If a player deleted their account mid-duel there's nothing to save for
    // them; the duel still ends normally for whoever is left.
    const bothExist = current.get(s1.player.id) && current.get(s2.player.id);
    if (bothExist)
      this.db.transaction(() => {
        const setRating = this.db.prepare("UPDATE users SET rating = ? WHERE id = ?");
        setRating.run(n1, s1.player.id);
        setRating.run(n2, s2.player.id);
        this.db
          .prepare(
            `INSERT INTO duels (p1_id, p2_id, seed, score1, score2, winner_id, change1, change2, rating_after1, rating_after2, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(s1.player.id, s2.player.id, duel.seed, s1.score, s2.score, winnerId, n1 - r1, n2 - r2, n1, n2, reason);
      })();

    const outcome = (mine: 0 | 0.5 | 1): DuelOutcome => (mine === 1 ? "win" : mine === 0 ? "loss" : "draw");
    this.send(s1.player, "duel:end", {
      outcome: outcome(result1),
      reason,
      you: s1.score,
      opponent: s2.score,
      rating: n1,
      ratingChange: n1 - r1,
    });
    this.send(s2.player, "duel:end", {
      outcome: outcome((1 - result1) as 0 | 0.5 | 1),
      reason,
      you: s2.score,
      opponent: s1.score,
      rating: n2,
      ratingChange: n2 - r2,
    });
  }
}
