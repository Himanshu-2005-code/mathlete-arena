import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 4000);
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

/**
 * Sites allowed to call the API and open duel sockets: a comma-separated
 * list, where an entry may start with "*." to cover subdomains, e.g.
 * "https://matik.vercel.app,https://*.vercel.app" for Vercel previews too.
 */
export function isAllowedOrigin(origin: string | undefined, allowed = WEB_ORIGIN): boolean {
  if (!origin) return true; // same-origin requests and non-browser clients
  return allowed
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") return true;
      const wild = entry.match(/^(https?:\/\/)\*\.(.+)$/);
      if (!wild) return origin === entry;
      const [, scheme, base] = wild;
      return origin.startsWith(scheme) && origin.endsWith(`.${base}`) && !origin.slice(scheme.length).includes("/");
    });
}

/** The cors/socket.io origin option built from WEB_ORIGIN. */
export const corsOrigin = (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) =>
  cb(null, isAllowedOrigin(origin));
export const DB_PATH = process.env.DB_PATH ?? path.resolve(here, "../data/matik.db");

/** Daily challenges roll over at midnight in this UTC offset (default IST). */
export const DAILY_UTC_OFFSET_MIN = Number(process.env.DAILY_UTC_OFFSET_MIN ?? 330);

/** Seconds in the queue before a computer opponent steps in. 0 turns bots off. */
export const BOT_AFTER_SECONDS = Number(process.env.BOT_AFTER_SECONDS ?? 10);

/** Sign-in and sign-up attempts allowed per address every 15 minutes. */
export const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 30);

/** Trust the hosting platform's proxy for client addresses (on by default in production). */
export const TRUST_PROXY = (process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? "1" : "0")) === "1";

/** Log one line per API request (on by default in production). */
export const LOG_REQUESTS = (process.env.LOG_REQUESTS ?? (process.env.NODE_ENV === "production" ? "1" : "0")) === "1";

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
