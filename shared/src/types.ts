import type { PracticeMode } from "./questions";
import type { Difficulty } from "./crossmath";

/** API contracts shared by the server and the web app. */

export interface PublicUser {
  id: number;
  username: string;
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
  seed: number;
  difficulty: Difficulty;
  grid: (number | null)[][];
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
  recent: SessionRow[];
}
