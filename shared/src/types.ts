import type { PracticeMode } from "./questions";
import type { AnyPublicPuzzle, PuzzleKind } from "./puzzles";

/** API contracts shared by the server and the web app. */

export interface PublicUser {
  id: number;
  username: string;
  rating: number;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export const SPRINT_SECONDS = [30, 60, 120] as const;
export type SprintSeconds = (typeof SPRINT_SECONDS)[number];

export interface PracticeResultInput {
  mode: PracticeMode;
  adaptive: boolean;
  durationSec: SprintSeconds;
  score: number;
  correct: number;
  attempts: number;
  maxLevel: number;
  avgMs: number;
}

export interface PuzzleResultInput {
  /** Defaults to cross-math, for older clients. */
  kind?: PuzzleKind;
  seed: number;
  difficulty: string;
  grid?: (number | null)[][];
  path?: [number, number][];
  expressions?: string[];
  timeMs: number;
  mistakes: number;
}

export interface SessionRow {
  id: number;
  kind: "practice" | "puzzle";
  mode: string;
  score: number;
  correct: number;
  attempts: number;
  durationMs: number;
  createdAt: string;
}

export interface Stats {
  user: PublicUser;
  practice: {
    sessions: number;
    totalCorrect: number;
    totalAttempts: number;
    accuracy: number;
    bestByMode: { mode: string; durationSec: number; best: number }[];
  };
  puzzles: {
    solved: number;
    fastestByDifficulty: { difficulty: string; bestMs: number }[];
  };
  dailyStreak: { current: number; best: number };
  /** Best arcade scores; 0 when not played. */
  arcade: Record<import("./arcade").ArcadeGame, number>;
  duels: {
    played: number;
    won: number;
    lost: number;
    drawn: number;
    peakRating: number;
    /** Rating before the oldest of the last 50 duels, then after each one; oldest first. */
    ratingHistory: number[];
    recent: DuelRow[];
  };
  recent: SessionRow[];
  /** Daily results from the last 14 days, newest first. */
  dailyRecent: { day: string; kind: string; score: number; timeMs: number }[];
}

export interface DuelRow {
  id: number;
  opponent: string;
  you: number;
  opponentScore: number;
  outcome: "win" | "loss" | "draw";
  ratingChange: number;
  reason: "time" | "forfeit";
  createdAt: string;
}

/** One answer in a daily sprint, in order. The server replays them. */
export interface DailyAnswer {
  index: number;
  value: number | null;
}

export interface DailySprintInput {
  answers: DailyAnswer[];
}

export interface DailyPuzzleInput {
  /** Defaults to cross-math. */
  kind?: PuzzleKind;
  grid?: (number | null)[][];
  path?: [number, number][];
  expressions?: string[];
  timeMs: number;
}

/** The daily puzzles beyond cross-math. */
export type DailyExtraKind = "kenken" | "sudoku" | "maze" | "hectoc";
export const DAILY_EXTRA_KINDS: DailyExtraKind[] = ["kenken", "sudoku", "maze", "hectoc"];

export interface DailyResult {
  score: number;
  correct: number;
  timeMs: number;
  rank: number;
  of: number;
}

export interface DailyInfo {
  day: string;
  sprintSeed: number;
  sprintSeconds: number;
  /** When the next day's set starts (ISO time). */
  nextAt: string;
  puzzle: import("./crossmath").PublicPuzzle;
  /** Present when signed in and already played today. */
  mine: { sprint: DailyResult | null; puzzle: DailyResult | null };
  /** Today's KenKen, Sudoku and Math Maze. */
  extra: Record<DailyExtraKind, { difficulty: string; puzzle: AnyPublicPuzzle; mine: DailyResult | null }>;
  /** Days in a row with at least one daily result; null when signed out. */
  streak: { current: number; best: number } | null;
}

export type LeaderboardKind =
  | "rating"
  | "daily-sprint"
  | "daily-puzzle"
  | "daily-kenken"
  | "daily-sudoku"
  | "daily-maze"
  | "daily-hectoc"
  | "weekly-sprint"
  | "arcade-flash"
  | "arcade-memory"
  | "arcade-truefalse"
  | "arcade-compare"
  | "arcade-sign";

export const LEADERBOARD_KINDS: LeaderboardKind[] = [
  "rating",
  "daily-sprint",
  "daily-puzzle",
  "daily-kenken",
  "daily-sudoku",
  "daily-maze",
  "daily-hectoc",
  "weekly-sprint",
  "arcade-flash",
  "arcade-memory",
  "arcade-truefalse",
  "arcade-compare",
  "arcade-sign",
];

export interface ArcadeResult {
  best: number;
  /** Your place among everyone's bests. */
  rank: number;
  of: number;
  newBest: boolean;
}

/** What anyone can see about a player. */
export interface PlayerProfile {
  username: string;
  rating: number;
  createdAt: string;
  bot: boolean;
  duels: { played: number; won: number; lost: number; drawn: number; peakRating: number };
  puzzlesSolved: number;
  sprints: number;
  /** Best one-minute mixed sprint, or null. */
  bestSprint: number | null;
  dailyStreak: { current: number; best: number };
  arcade: Record<import("./arcade").ArcadeGame, number>;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  value: number;
  /** Secondary figure: games played (rating) or answers right (sprint). */
  detail: number | null;
  /** True for a computer opponent. */
  bot?: boolean;
}

export interface Leaderboard {
  kind: LeaderboardKind;
  day: string | null;
  rows: LeaderboardRow[];
  /** The signed-in player's own row when they're ranked but outside `rows`. */
  me?: LeaderboardRow;
}
