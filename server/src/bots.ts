import { sequenceLevel } from "@matik/shared";
import type { Db } from "./db";

/**
 * Computer opponents. They are real rows in `users` (flagged is_bot), so their
 * ratings move with every duel and they show up on the leaderboard like anyone
 * else. They can't sign in: their password hash matches no password.
 */
export const BOTS: { username: string; rating: number }[] = [
  { username: "hypatia_bot", rating: 800 },
  { username: "euler_bot", rating: 950 },
  { username: "noether_bot", rating: 1100 },
  { username: "ramanujan_bot", rating: 1250 },
  { username: "gauss_bot", rating: 1400 },
  { username: "lovelace_bot", rating: 1600 },
];

/** Usernames ending in _bot are reserved for computer opponents. */
export const isReservedName = (username: string) => /_bot$/i.test(username);

export interface BotRow {
  id: number;
  username: string;
  rating: number;
}

export function ensureBots(db: Db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO users (username, password_hash, rating, is_bot) VALUES (?, '!', ?, 1)",
  );
  for (const b of BOTS) insert.run(b.username, b.rating);
}

/** The bot whose rating is closest to the player's. */
export function pickBot(db: Db, rating: number): BotRow | undefined {
  return db
    .prepare<[number], BotRow>(
      "SELECT id, username, rating FROM users WHERE is_bot = 1 ORDER BY ABS(rating - ?) ASC, RANDOM() LIMIT 1",
    )
    .get(rating);
}

/**
 * Milliseconds a bot takes on question `index`. Stronger bots are faster, later
 * questions take longer, and there is some jitter so it doesn't feel mechanical.
 */
export function botThinkMs(rating: number, index: number, rand: () => number = Math.random): number {
  const pace = Math.min(5000, Math.max(1200, 3400 - (rating - 1000) * 6));
  return pace * (0.6 + sequenceLevel(index) * 0.12) * (0.75 + rand() * 0.6);
}

/** Chance a bot fumbles a question and has to try again. */
export const BOT_MISS_CHANCE = 0.08;
