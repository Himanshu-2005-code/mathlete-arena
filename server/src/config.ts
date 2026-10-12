import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 4000);
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
export const DB_PATH = process.env.DB_PATH ?? path.resolve(here, "../data/matik.db");

/** Daily challenges roll over at midnight in this UTC offset (default IST). */
export const DAILY_UTC_OFFSET_MIN = Number(process.env.DAILY_UTC_OFFSET_MIN ?? 330);

/** Seconds in the queue before a computer opponent steps in. 0 turns bots off. */
export const BOT_AFTER_SECONDS = Number(process.env.BOT_AFTER_SECONDS ?? 10);

/** In production the API server also serves the web app, on one port. */
export const SERVE_WEB = process.env.SERVE_WEB === "1";

const DEV_SECRET = "dev-only-secret-change-me";
export const JWT_SECRET = process.env.JWT_SECRET ?? DEV_SECRET;

if (JWT_SECRET === DEV_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set JWT_SECRET in production.");
  }
  console.warn("[matik] JWT_SECRET not set; using an insecure development secret.");
}
