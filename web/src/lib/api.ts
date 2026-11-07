import { migrateLegacyStorage } from "./legacy";
import type {
  PlayerProfile,
  ArcadeGame,
  ArcadeResult,
  AuthResponse,
  DailyInfo,
  DailyResult,
  DailySprintInput,
  DailyPuzzleInput,
  Leaderboard,
  LeaderboardKind,
  Difficulty,
  PracticeResultInput,
  PublicPuzzle,
  PublicUser,
  PuzzleResultInput,
  Stats,
} from "@mathlete/shared";

/** Where the game server lives. Set to "" in production, where one server serves everything. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Streak = { current: number; best: number };

// Runs once when the app loads, before anything reads the saved token.
migrateLegacyStorage();

const TOKEN_KEY = "mathlete.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: stay signed in for this tab only */
  }
}

/** Fired once when the server rejects our saved token (expired or account gone). */
export const SESSION_EXPIRED_EVENT = "mathlete:session-expired";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the game server. Check that it's running.", 0);
  }
  const body = await res.json().catch(() => ({}));
  // A 401 on a request that carried a token means the session is over: drop
  // the token and let the app sign out once, instead of every call failing.
  if (res.status === 401 && token && getToken() === token) {
    setToken(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError("Your session has expired. Sign in again to keep playing.", 401);
  }
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    call<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  player: (username: string) => call<PlayerProfile>(`/api/players/${encodeURIComponent(username)}`),
  exportData: () => call<unknown>("/api/me/export"),
  deleteAccount: (password: string) =>
    call<{ ok: true }>("/api/auth/delete", { method: "POST", body: JSON.stringify({ password }) }),
  changePassword: (current: string, next: string) =>
    call<{ ok: true }>("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) }),
  login: (username: string, password: string) =>
    call<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => call<{ user: PublicUser }>("/api/me"),
  savePractice: (r: PracticeResultInput) =>
    call<{ ok: true; previousBest: number | null; newBest: boolean }>("/api/results/practice", { method: "POST", body: JSON.stringify(r) }),
  newPuzzle: (difficulty: Difficulty) => call<PublicPuzzle>(`/api/puzzles/crossmath?difficulty=${difficulty}`),
  savePuzzle: (r: PuzzleResultInput) =>
    call<{ ok: true }>("/api/results/puzzle", { method: "POST", body: JSON.stringify(r) }),
  stats: () => call<Stats>("/api/stats"),
  daily: () => call<DailyInfo>("/api/daily"),
  saveDailySprint: (r: DailySprintInput) =>
    call<{ firstAttempt: boolean; result: DailyResult; streak: Streak }>("/api/daily/sprint", { method: "POST", body: JSON.stringify(r) }),
  saveDailyPuzzle: (r: DailyPuzzleInput) =>
    call<{ firstAttempt: boolean; result: DailyResult; streak: Streak }>("/api/daily/puzzle", { method: "POST", body: JSON.stringify(r) }),
  saveArcade: (game: ArcadeGame, score: number) =>
    call<ArcadeResult>("/api/arcade", { method: "POST", body: JSON.stringify({ game, score }) }),
  leaderboard: (kind: LeaderboardKind) => call<Leaderboard>(`/api/leaderboard?kind=${kind}`),
};
